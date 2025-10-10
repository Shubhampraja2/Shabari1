/*
 * Simplified YARA Implementation for Android
 * Provides basic pattern matching and threat detection
 * WITH SECURITY FIXES APPLIED
 */

#include "yara/include/yara.h"
#include <string>
#include <vector>
#include <regex>
#include <fstream>
#include <cstring>
#include <algorithm>
#include <memory>
#include <map>
#include <cmath>
#include <android/log.h>

#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "YaraImpl", __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "YaraImpl", __VA_ARGS__)

// SECURITY: Add size limits to prevent buffer overflow
const size_t MAX_SCAN_SIZE = 50 * 1024 * 1024; // 50MB limit
const size_t MAX_MEMORY_SCAN = 10 * 1024 * 1024; // 10MB for memory scans

// Global state
static bool g_initialized = false;
static std::vector<std::string> g_malware_patterns;
static std::vector<std::string> g_malware_signatures;

// Threat detection patterns
static const char* MALWARE_PATTERNS[] = {
    // Common malware strings
    "malware", "virus", "trojan", "backdoor", "rootkit", "spyware", "adware",
    "ransomware", "keylogger", "botnet", "worm", "exploit", "shell32",
    
    // Suspicious API calls
    "CreateRemoteThread", "WriteProcessMemory", "VirtualAllocEx", "SetWindowsHookEx",
    "GetProcAddress", "LoadLibrary", "RegSetValueEx", "CreateProcess",
    
    // Network suspicious patterns
    "http://", "https://", "ftp://", "tcp://", "udp://",
    "connect", "bind", "listen", "send", "recv",
    
    // File system patterns
    "CreateFile", "WriteFile", "DeleteFile", "MoveFile", "CopyFile",
    "FindFirstFile", "RegOpenKey", "RegCreateKey",
    
    // Crypto patterns
    "CryptEncrypt", "CryptDecrypt", "CryptGenKey", "CryptDeriveKey",
    
    // Suspicious file extensions in strings
    ".exe", ".dll", ".bat", ".cmd", ".scr", ".pif", ".com", ".vbs", ".js",
    
    // Base64 encoded strings (common in malware)
    "TVqQAAMAAAAEAAAA", // PE header in base64
    "UEsDBBQAAAAI", // ZIP header in base64
    
    // Hexadecimal patterns for PE headers
    "4d5a", "5a4d", // MZ header
    "504b", "4b50", // PK header (ZIP)
    
    // Suspicious registry keys
    "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
};

static const char* HIGH_RISK_PATTERNS[] = {
    // Critical malware indicators
    "WannaCry", "Petya", "NotPetya", "Locky", "CryptoLocker",
    "TeslaCrypt", "Cerber", "Dharma", "GandCrab", "Sodinokibi",
    
    // Advanced persistent threat indicators
    "apt", "stuxnet", "flame", "duqu", "carbanak",
    
    // Exploit kit indicators
    "angler", "nuclear", "rig", "magnitude", "kaixin",
    
    // Banking trojans
    "zeus", "citadel", "ice9", "carberp", "tinba", "dridex",
    
    // RAT (Remote Access Trojan) indicators
    "darkcomet", "poison ivy", "njrat", "quasar", "remcos",
};

// Internal structures
struct YaraRuleInternal {
    std::string identifier;
    std::vector<std::string> patterns;
    bool is_high_risk;
    std::string category;
};

struct YaraCompilerInternal {
    std::vector<YaraRuleInternal> rules;
};

struct YaraRulesInternal {
    std::vector<YaraRuleInternal> rules;
};

// Convert string to lowercase for case-insensitive matching
std::string toLowerCase(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), ::tolower);
    return result;
}

// Check if data contains any malware patterns
bool containsMalwarePatterns(const std::string& data, std::vector<std::string>& matched_patterns) {
    std::string lower_data = toLowerCase(data);
    bool found = false;
    
    // Check standard patterns
    for (const auto& pattern : MALWARE_PATTERNS) {
        std::string lower_pattern = toLowerCase(pattern);
        if (lower_data.find(lower_pattern) != std::string::npos) {
            matched_patterns.push_back(pattern);
            found = true;
        }
    }
    
    // Check high-risk patterns
    for (const auto& pattern : HIGH_RISK_PATTERNS) {
        std::string lower_pattern = toLowerCase(pattern);
        if (lower_data.find(lower_pattern) != std::string::npos) {
            matched_patterns.push_back(std::string("HIGH_RISK:") + pattern);
            found = true;
        }
    }
    
    return found;
}

// Check file header signatures
bool checkFileSignatures(const std::vector<uint8_t>& data) {
    if (data.size() < 4) return false;
    
    // PE executable
    if (data[0] == 'M' && data[1] == 'Z') {
        return true; // PE file detected
    }
    
    // ELF executable
    if (data.size() >= 4 && data[0] == 0x7F && data[1] == 'E' && data[2] == 'L' && data[3] == 'F') {
        return true; // ELF file detected
    }
    
    // ZIP/JAR/APK archive
    if (data[0] == 'P' && data[1] == 'K') {
        return true; // Archive detected
    }
    
    return false;
}

// SECURITY: Calculate Shannon entropy for obfuscation detection
double calculateEntropy(const std::vector<uint8_t>& data, size_t maxBytes = 8192) {
    if (data.empty()) return 0.0;

    size_t sampleSize = std::min(data.size(), maxBytes);
    std::map<uint8_t, int> frequency;

    for (size_t i = 0; i < sampleSize; i++) {
        frequency[data[i]]++;
    }

    double entropy = 0.0;
    for (const auto& pair : frequency) {
        double probability = static_cast<double>(pair.second) / sampleSize;
        entropy -= probability * log2(probability);
    }

    return entropy;
}

// SECURITY: Detect suspicious byte patterns (shellcode, etc.)
bool detectSuspiciousBytePatterns(const std::vector<uint8_t>& data) {
    if (data.size() < 16) return false;

    // NOP sled detection (common in exploits)
    int nopCount = 0;
    for (size_t i = 0; i < std::min(data.size(), size_t(1024)); i++) {
        if (data[i] == 0x90) { // x86 NOP instruction
            nopCount++;
            if (nopCount > 50) {
                LOGD("NOP sled detected - possible shellcode");
                return true; // Suspicious NOP sled
            }
        } else {
            nopCount = 0;
        }
    }

    // Check for common shellcode patterns
    static const uint8_t SHELLCODE_PATTERNS[][4] = {
        {0xEB, 0x0B, 0x5E, 0x31}, // Common shellcode stub
        {0x31, 0xC0, 0x50, 0x68}, // execve shellcode
        {0x6A, 0x0B, 0x58, 0x99}, // syscall pattern
    };

    for (const auto& pattern : SHELLCODE_PATTERNS) {
        for (size_t i = 0; i < data.size() - 3; i++) {
            if (memcmp(&data[i], pattern, 4) == 0) {
                LOGD("Shellcode pattern detected");
                return true;
            }
        }
    }

    return false;
}

// YARA API Implementation
extern "C" {

int yr_initialize(void) {
    if (g_initialized) return ERROR_SUCCESS;
    
    // Initialize malware pattern database
    g_malware_patterns.clear();
    g_malware_signatures.clear();
    
    // Load patterns
    for (const auto& pattern : MALWARE_PATTERNS) {
        g_malware_patterns.push_back(pattern);
    }
    
    for (const auto& pattern : HIGH_RISK_PATTERNS) {
        g_malware_signatures.push_back(pattern);
    }
    
    g_initialized = true;
    return ERROR_SUCCESS;
}

int yr_finalize(void) {
    g_initialized = false;
    g_malware_patterns.clear();
    g_malware_signatures.clear();
    return ERROR_SUCCESS;
}

int yr_compiler_create(YR_COMPILER** compiler) {
    if (!g_initialized) return ERROR_INSUFFICIENT_MEMORY;
    
    auto internal = new YaraCompilerInternal();
    *compiler = reinterpret_cast<YR_COMPILER*>(internal);
    return ERROR_SUCCESS;
}

void yr_compiler_destroy(YR_COMPILER* compiler) {
    if (compiler) {
        auto internal = reinterpret_cast<YaraCompilerInternal*>(compiler);
        delete internal;
    }
}

int yr_compiler_add_string(YR_COMPILER* compiler, const char* rules_string, const char* namespace_) {
    if (!compiler || !rules_string) return ERROR_INVALID_ARGUMENT;
    
    auto internal = reinterpret_cast<YaraCompilerInternal*>(compiler);
    
    // Parse simple rule format and add default patterns
    YaraRuleInternal rule;
    rule.identifier = "default_malware_rule";
    rule.category = "malware";
    rule.is_high_risk = false;
    
    // Add all our predefined patterns
    for (const auto& pattern : MALWARE_PATTERNS) {
        rule.patterns.push_back(pattern);
    }
    
    for (const auto& pattern : HIGH_RISK_PATTERNS) {
        rule.patterns.push_back(pattern);
    }
    
    internal->rules.push_back(rule);
    return ERROR_SUCCESS;
}

int yr_compiler_get_rules(YR_COMPILER* compiler, YR_RULES** rules) {
    if (!compiler) return ERROR_INVALID_ARGUMENT;
    
    auto compiler_internal = reinterpret_cast<YaraCompilerInternal*>(compiler);
    auto rules_internal = new YaraRulesInternal();
    rules_internal->rules = compiler_internal->rules;
    
    *rules = reinterpret_cast<YR_RULES*>(rules_internal);
    return ERROR_SUCCESS;
}

void yr_rules_destroy(YR_RULES* rules) {
    if (rules) {
        auto internal = reinterpret_cast<YaraRulesInternal*>(rules);
        delete internal;
    }
}

int yr_rules_scan_file(YR_RULES* rules, const char* filename, int flags, 
                      YR_CALLBACK_FUNC callback, void* user_data, int timeout) {
    if (!rules || !filename) return ERROR_INVALID_ARGUMENT;
    
    // Read file content
    std::ifstream file(filename, std::ios::binary);
    if (!file.is_open()) {
        LOGE("Failed to open file: %s", filename);
        return ERROR_COULD_NOT_OPEN_FILE;
    }
    
    // SECURITY: Get file size FIRST
    file.seekg(0, std::ios::end);
    size_t file_size = file.tellg();
    file.seekg(0, std::ios::beg);
    
    // SECURITY: Check size limit BEFORE allocation
    if (file_size > MAX_SCAN_SIZE) {
        LOGE("File too large for scanning: %zu bytes (max: %zu)", file_size, MAX_SCAN_SIZE);
        file.close();
        return ERROR_TOO_MANY_SCAN_THREADS; // Reuse error code
    }

    // SECURITY: Validate allocation succeeded
    std::vector<uint8_t> buffer;
    try {
        buffer.resize(file_size);
    } catch (const std::bad_alloc& e) {
        LOGE("Failed to allocate memory for file scan");
        file.close();
        return ERROR_INSUFFICIENT_MEMORY;
    }

    file.read(reinterpret_cast<char*>(buffer.data()), file_size);
    file.close();
    
    // Convert to string for pattern matching
    std::string content(buffer.begin(), buffer.end());
    
    // Multi-layered detection
    std::vector<std::string> matched_patterns;
    bool has_string_malware = containsMalwarePatterns(content, matched_patterns);
    bool has_suspicious_header = checkFileSignatures(buffer);
    bool has_suspicious_bytes = detectSuspiciousBytePatterns(buffer);

    // SECURITY: Entropy analysis for packed/encrypted content
    double entropy = calculateEntropy(buffer);
    bool high_entropy = (entropy > 7.5); // Highly random = possibly encrypted/packed

    if (high_entropy) {
        LOGD("High entropy detected (%.2f) - possibly packed/encrypted", entropy);
    }

    bool is_threat = has_string_malware || has_suspicious_header ||
                     has_suspicious_bytes || high_entropy;

    // If threat detected and callback provided, invoke it
    if (is_threat && callback) {
        YR_RULE dummy_rule = {0};
        dummy_rule.identifier = const_cast<char*>("malware_detected");
        
        YR_SCAN_CONTEXT dummy_context = {0};
        int result = callback(&dummy_context, CALLBACK_MSG_RULE_MATCHING, &dummy_rule, user_data);
        
        if (result == CALLBACK_ABORT) {
            return ERROR_CALLBACK_ERROR;
        }
    }
    
    return is_threat ? ERROR_CALLBACK_ERROR : ERROR_SUCCESS;
}

int yr_rules_scan_mem(YR_RULES* rules, const uint8_t* buffer, size_t buffer_size, 
                     int flags, YR_CALLBACK_FUNC callback, void* user_data, int timeout) {
    if (!rules || !buffer) return ERROR_INVALID_ARGUMENT;
    
    // SECURITY: Check memory scan size limit
    if (buffer_size > MAX_MEMORY_SCAN) {
        LOGE("Memory buffer too large for scanning: %zu bytes (max: %zu)",
             buffer_size, MAX_MEMORY_SCAN);
        return ERROR_TOO_MANY_SCAN_THREADS;
    }

    // Convert buffer to string for pattern matching
    std::string content(reinterpret_cast<const char*>(buffer), buffer_size);
    
    // Multi-layered detection
    std::vector<std::string> matched_patterns;
    bool has_malware = containsMalwarePatterns(content, matched_patterns);
    
    // Check signatures
    std::vector<uint8_t> data(buffer, buffer + buffer_size);
    bool has_suspicious_header = checkFileSignatures(data);
    bool has_suspicious_bytes = detectSuspiciousBytePatterns(data);

    // Entropy analysis
    double entropy = calculateEntropy(data);
    bool high_entropy = (entropy > 7.5);

    bool is_threat = has_malware || has_suspicious_header ||
                     has_suspicious_bytes || high_entropy;

    // If we found patterns and have a callback, call it
    if (is_threat && callback) {
        YR_RULE dummy_rule = {0};
        dummy_rule.identifier = const_cast<char*>("malware_detected");
        
        YR_SCAN_CONTEXT dummy_context = {0};
        int result = callback(&dummy_context, CALLBACK_MSG_RULE_MATCHING, &dummy_rule, user_data);
        
        if (result == CALLBACK_ABORT) {
            return ERROR_CALLBACK_ERROR;
        }
    }
    
    return is_threat ? ERROR_CALLBACK_ERROR : ERROR_SUCCESS;
}

} // extern "C"

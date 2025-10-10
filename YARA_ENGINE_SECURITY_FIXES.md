# YARA Engine Security Fixes Implementation Guide

## 🚨 CRITICAL SECURITY PATCHES

This document provides step-by-step fixes for all identified vulnerabilities.

---

## Fix #1: Buffer Overflow Protection

### File: `yara-implementation.cpp`

**Add size limits and validation:**

```cpp
// Add at the top of the file
const size_t MAX_SCAN_SIZE = 50 * 1024 * 1024; // 50MB limit
const size_t MAX_MEMORY_SCAN = 10 * 1024 * 1024; // 10MB for memory scans

int yr_rules_scan_file(YR_RULES* rules, const char* filename, int flags, 
                      YR_CALLBACK_FUNC callback, void* user_data, int timeout) {
    if (!rules || !filename) return ERROR_INVALID_ARGUMENT;
    
    std::ifstream file(filename, std::ios::binary);
    if (!file.is_open()) {
        return ERROR_COULD_NOT_OPEN_FILE;
    }
    
    // Get file size FIRST
    file.seekg(0, std::ios::end);
    size_t file_size = file.tellg();
    file.seekg(0, std::ios::beg);
    
    // SECURITY: Check size limit BEFORE allocation
    if (file_size > MAX_SCAN_SIZE) {
        LOGE("File too large for scanning: %zu bytes (max: %zu)", 
             file_size, MAX_SCAN_SIZE);
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
    
    // Rest of implementation...
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
    
    // Rest of implementation...
}
```

---

## Fix #2: Thread Safety with RAII

### File: `yara-engine.cpp`

**Implement RAII lock guard:**

```cpp
// Add at the top of the file
class MutexGuard {
private:
    pthread_mutex_t* mutex_;
    bool locked_;
    
public:
    explicit MutexGuard(pthread_mutex_t* mutex) : mutex_(mutex), locked_(false) {
        if (pthread_mutex_lock(mutex_) == 0) {
            locked_ = true;
        }
    }
    
    ~MutexGuard() {
        if (locked_) {
            pthread_mutex_unlock(mutex_);
        }
    }
    
    bool isLocked() const { return locked_; }
    
    // Prevent copy
    MutexGuard(const MutexGuard&) = delete;
    MutexGuard& operator=(const MutexGuard&) = delete;
};

// Use in all JNI functions
JNIEXPORT jboolean JNICALL
Java_com_shabari_yara_YaraEngine_nativeInitialize(JNIEnv* env, jobject thiz) {
    MutexGuard guard(&g_mutex); // Automatically unlocks on return/exception
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex");
        return JNI_FALSE;
    }
    
    if (g_initialized) {
        LOGD("YARA engine already initialized");
        return JNI_TRUE;
    }
    
    // Rest of implementation - mutex automatically released on return
}
```

---

## Fix #3: Path Traversal Prevention

### File: `YaraEngine.java`

**Add path validation:**

```java
package com.shabari.yara;

import java.io.File;
import java.io.IOException;

public class YaraEngine {
    private static final String TAG = "YaraEngine";
    
    // Define allowed directories
    private static final String[] ALLOWED_DIRECTORIES = {
        "/data/user/0/", // App's private directory
        "/storage/emulated/0/Download/", // Downloads
        "/sdcard/Download/" // Alternative downloads path
    };

    /**
     * Validates file path to prevent path traversal attacks
     */
    private boolean isPathSafe(String filePath) {
        try {
            File file = new File(filePath);
            String canonicalPath = file.getCanonicalPath();
            
            // Check if path is within allowed directories
            for (String allowedDir : ALLOWED_DIRECTORIES) {
                if (canonicalPath.startsWith(allowedDir)) {
                    return true;
                }
            }
            
            // Also allow app's own cache/files directories
            String appDir = context.getFilesDir().getCanonicalPath();
            String cacheDir = context.getCacheDir().getCanonicalPath();
            
            if (canonicalPath.startsWith(appDir) || 
                canonicalPath.startsWith(cacheDir)) {
                return true;
            }
            
            Log.e(TAG, "Path traversal attempt blocked: " + canonicalPath);
            return false;
            
        } catch (IOException e) {
            Log.e(TAG, "Error validating path", e);
            return false;
        }
    }

    public boolean loadRules(String rulesPath) {
        if (!isInitialized) {
            Log.e(TAG, "YARA engine not initialized");
            return false;
        }

        // SECURITY: Validate path before use
        if (!isPathSafe(rulesPath)) {
            Log.e(TAG, "Security: Invalid rules path blocked");
            return false;
        }

        try {
            File rulesFile = new File(rulesPath);
            if (!rulesFile.exists()) {
                Log.e(TAG, "Rules file does not exist: " + rulesPath);
                return false;
            }
            
            // Additional check: file must be readable
            if (!rulesFile.canRead()) {
                Log.e(TAG, "Rules file not readable: " + rulesPath);
                return false;
            }

            // Rest of implementation...
        } catch (Exception e) {
            Log.e(TAG, "Exception loading rules", e);
            return false;
        }
    }

    public YaraScanResult scanFile(String filePath) {
        if (!isInitialized) {
            Log.e(TAG, "YARA engine not initialized");
            return createErrorResult("Engine not initialized");
        }

        // SECURITY: Validate path before scanning
        if (!isPathSafe(filePath)) {
            Log.e(TAG, "Security: Invalid file path blocked");
            return createErrorResult("Invalid file path");
        }

        try {
            File file = new File(filePath);
            if (!file.exists()) {
                Log.e(TAG, "File does not exist: " + filePath);
                return createErrorResult("File not found");
            }

            if (!file.canRead()) {
                Log.e(TAG, "Cannot read file: " + filePath);
                return createErrorResult("File not readable");
            }
            
            // SECURITY: Check file size before scanning
            long fileSize = file.length();
            if (fileSize > 50 * 1024 * 1024) { // 50MB limit
                Log.e(TAG, "File too large for scanning: " + fileSize);
                return createErrorResult("File too large (max 50MB)");
            }

            // Rest of implementation...
        } catch (Exception e) {
            Log.e(TAG, "Exception scanning file", e);
            return createErrorResult("Scan failed: " + e.getMessage());
        }
    }
    
    private YaraScanResult createErrorResult(String message) {
        YaraScanResult result = new YaraScanResult();
        result.setSafe(false);
        result.setThreatName("Error");
        result.setThreatCategory("error");
        result.setSeverity("high");
        result.setDetails(message);
        return result;
    }
}
```

---

## Fix #4: Null Pointer Protection

### File: `YaraScanResult.java`

**Create proper error result class:**

```java
package com.shabari.yara;

import java.util.ArrayList;
import java.util.List;

public class YaraScanResult {
    private boolean isSafe = true;
    private String threatName = "";
    private String threatCategory = "";
    private String severity = "none";
    private List<String> matchedRules = new ArrayList<>();
    private int scanTime = 0;
    private long fileSize = 0;
    private String scanEngine = "Unknown";
    private String details = "";
    private boolean isError = false;
    private String errorMessage = "";

    // Add error state
    public static YaraScanResult error(String message) {
        YaraScanResult result = new YaraScanResult();
        result.isError = true;
        result.errorMessage = message;
        result.isSafe = false;
        result.details = "Error: " + message;
        result.severity = "error";
        return result;
    }
    
    public static YaraScanResult clean(String engine) {
        YaraScanResult result = new YaraScanResult();
        result.isSafe = true;
        result.scanEngine = engine;
        result.details = "No threats detected";
        result.severity = "none";
        return result;
    }
    
    public static YaraScanResult threat(String name, String category, 
                                       String severity, String details) {
        YaraScanResult result = new YaraScanResult();
        result.isSafe = false;
        result.threatName = name;
        result.threatCategory = category;
        result.severity = severity;
        result.details = details;
        return result;
    }

    public boolean isError() {
        return isError;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    // Getters and setters with null checks
    public void setThreatName(String threatName) {
        this.threatName = threatName != null ? threatName : "";
    }

    public void setDetails(String details) {
        this.details = details != null ? details : "";
    }
    
    // ... rest of getters/setters with null protection
}
```

---

## Fix #5: Input Validation in React Native Bridge

### File: `YaraModule.java`

**Add comprehensive validation:**

```java
@ReactMethod
public void scanMemory(ReadableArray data, Promise promise) {
    try {
        if (data == null) {
            promise.reject("INVALID_INPUT", "Memory data cannot be null");
            return;
        }
        
        int dataSize = data.size();
        
        // SECURITY: Enforce size limits
        final int MAX_MEMORY_SCAN = 10 * 1024 * 1024; // 10MB
        if (dataSize > MAX_MEMORY_SCAN) {
            promise.reject("SIZE_LIMIT", 
                "Memory data too large: " + dataSize + " bytes (max: 10MB)");
            return;
        }
        
        if (dataSize == 0) {
            promise.reject("INVALID_INPUT", "Memory data is empty");
            return;
        }
        
        Log.d(TAG, "Scanning memory data: " + dataSize + " bytes");
        
        // SECURITY: Validate before allocation
        byte[] byteArray;
        try {
            byteArray = new byte[dataSize];
        } catch (OutOfMemoryError e) {
            promise.reject("MEMORY_ERROR", "Failed to allocate memory for scan");
            return;
        }
        
        // Convert with bounds checking
        for (int i = 0; i < dataSize; i++) {
            try {
                int value = data.getInt(i);
                // SECURITY: Validate byte range
                if (value < 0 || value > 255) {
                    promise.reject("INVALID_INPUT", 
                        "Invalid byte value at index " + i + ": " + value);
                    return;
                }
                byteArray[i] = (byte) value;
            } catch (Exception e) {
                promise.reject("INVALID_INPUT", 
                    "Failed to read byte at index " + i);
                return;
            }
        }
        
        YaraScanResult result = yaraEngine.scanMemory(byteArray);
        if (result != null && !result.isError()) {
            WritableMap resultMap = result.toWritableMap();
            promise.resolve(resultMap);
        } else {
            String errorMsg = result != null ? result.getErrorMessage() : "Unknown error";
            promise.reject("SCAN_ERROR", "Failed to scan memory: " + errorMsg);
        }
    } catch (Exception e) {
        Log.e(TAG, "Error scanning memory", e);
        promise.reject("SCAN_ERROR", "Error scanning memory: " + e.getMessage());
    }
}

@ReactMethod
public void scanFile(String filePath, Promise promise) {
    try {
        if (filePath == null || filePath.trim().isEmpty()) {
            promise.reject("INVALID_INPUT", "File path cannot be empty");
            return;
        }
        
        // SECURITY: Basic path validation
        if (filePath.contains("..") || filePath.startsWith("/system/") || 
            filePath.startsWith("/data/data/")) {
            promise.reject("SECURITY_ERROR", "Invalid file path");
            return;
        }
        
        Log.d(TAG, "Scanning file: " + filePath);
        YaraScanResult result = yaraEngine.scanFile(filePath);
        
        if (result != null && !result.isError()) {
            WritableMap resultMap = result.toWritableMap();
            promise.resolve(resultMap);
        } else {
            String errorMsg = result != null ? result.getErrorMessage() : "Unknown error";
            promise.reject("SCAN_ERROR", "Failed to scan file: " + errorMsg);
        }
    } catch (Exception e) {
        Log.e(TAG, "Error scanning file", e);
        promise.reject("SCAN_ERROR", "Error scanning file: " + e.getMessage());
    }
}
```

---

## Fix #6: JNI Memory Leak Prevention

### File: `yara-engine.cpp`

**Proper JNI reference cleanup:**

```cpp
jobject createScanResult(JNIEnv* env, bool isSafe, const char* threatName, 
                        const char* category, const char* severity, 
                        jobjectArray matchedRules, const char* details) {
    
    jclass scanResultClass = env->FindClass("com/shabari/yara/YaraScanResult");
    if (!scanResultClass) {
        LOGE("Failed to find YaraScanResult class");
        return NULL;
    }

    jmethodID constructor = env->GetMethodID(scanResultClass, "<init>", "()V");
    if (!constructor) {
        LOGE("Failed to find YaraScanResult constructor");
        env->DeleteLocalRef(scanResultClass); // CLEANUP!
        return NULL;
    }

    jobject scanResult = env->NewObject(scanResultClass, constructor);
    if (!scanResult) {
        LOGE("Failed to create YaraScanResult object");
        env->DeleteLocalRef(scanResultClass); // CLEANUP!
        return NULL;
    }

    // Get all method IDs at once
    jmethodID setSafeMethod = env->GetMethodID(scanResultClass, "setSafe", "(Z)V");
    jmethodID setThreatNameMethod = env->GetMethodID(scanResultClass, "setThreatName", "(Ljava/lang/String;)V");
    jmethodID setThreatCategoryMethod = env->GetMethodID(scanResultClass, "setThreatCategory", "(Ljava/lang/String;)V");
    jmethodID setSeverityMethod = env->GetMethodID(scanResultClass, "setSeverity", "(Ljava/lang/String;)V");
    jmethodID setDetailsMethod = env->GetMethodID(scanResultClass, "setDetails", "(Ljava/lang/String;)V");
    jmethodID setScanEngineMethod = env->GetMethodID(scanResultClass, "setScanEngine", "(Ljava/lang/String;)V");

    // Set fields with proper cleanup
    if (setSafeMethod) {
        env->CallVoidMethod(scanResult, setSafeMethod, isSafe);
    }
    
    if (setThreatNameMethod && threatName) {
        jstring jThreatName = env->NewStringUTF(threatName);
        if (jThreatName) {
            env->CallVoidMethod(scanResult, setThreatNameMethod, jThreatName);
            env->DeleteLocalRef(jThreatName); // ALWAYS CLEANUP!
        }
    }
    
    if (setThreatCategoryMethod && category) {
        jstring jCategory = env->NewStringUTF(category);
        if (jCategory) {
            env->CallVoidMethod(scanResult, setThreatCategoryMethod, jCategory);
            env->DeleteLocalRef(jCategory); // ALWAYS CLEANUP!
        }
    }
    
    if (setSeverityMethod && severity) {
        jstring jSeverity = env->NewStringUTF(severity);
        if (jSeverity) {
            env->CallVoidMethod(scanResult, setSeverityMethod, jSeverity);
            env->DeleteLocalRef(jSeverity); // ALWAYS CLEANUP!
        }
    }
    
    if (setDetailsMethod && details) {
        jstring jDetails = env->NewStringUTF(details);
        if (jDetails) {
            env->CallVoidMethod(scanResult, setDetailsMethod, jDetails);
            env->DeleteLocalRef(jDetails); // ALWAYS CLEANUP!
        }
    }
    
    if (setScanEngineMethod) {
        jstring jEngine = env->NewStringUTF("Shabari YARA v4.5.0");
        if (jEngine) {
            env->CallVoidMethod(scanResult, setScanEngineMethod, jEngine);
            env->DeleteLocalRef(jEngine); // ALWAYS CLEANUP!
        }
    }

    env->DeleteLocalRef(scanResultClass); // CLEANUP CLASS REFERENCE!
    return scanResult;
}
```

---

## Fix #7: Enhanced Pattern Matching

### File: `yara-implementation.cpp`

**Add entropy and byte pattern detection:**

```cpp
#include <cmath>

// Calculate Shannon entropy for obfuscation detection
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

// Detect suspicious byte patterns (shellcode, etc.)
bool detectSuspiciousBytePatterns(const std::vector<uint8_t>& data) {
    if (data.size() < 16) return false;
    
    // NOP sled detection (common in exploits)
    int nopCount = 0;
    for (size_t i = 0; i < std::min(data.size(), size_t(1024)); i++) {
        if (data[i] == 0x90) { // x86 NOP instruction
            nopCount++;
            if (nopCount > 50) return true; // Suspicious NOP sled
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
                return true;
            }
        }
    }
    
    return false;
}

// Enhanced malware detection
int yr_rules_scan_file(YR_RULES* rules, const char* filename, int flags, 
                      YR_CALLBACK_FUNC callback, void* user_data, int timeout) {
    // ... previous size checking code ...
    
    // Convert to string for string pattern matching
    std::string content(buffer.begin(), buffer.end());
    
    // Multi-layered detection
    std::vector<std::string> matched_patterns;
    bool has_string_malware = containsMalwarePatterns(content, matched_patterns);
    bool has_suspicious_header = checkFileSignatures(buffer);
    bool has_suspicious_bytes = detectSuspiciousBytePatterns(buffer);
    
    // Entropy analysis for packed/encrypted content
    double entropy = calculateEntropy(buffer);
    bool high_entropy = (entropy > 7.5); // Highly random = possibly encrypted/packed
    
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
```

---

## Implementation Checklist

### Phase 1: Critical Fixes (Week 1)
- [ ] Implement buffer size limits
- [ ] Add path traversal protection
- [ ] Fix thread safety with RAII
- [ ] Add input validation to React Native bridge

### Phase 2: Memory Safety (Week 2)
- [ ] Fix JNI reference leaks
- [ ] Implement proper error handling
- [ ] Add null pointer protection
- [ ] Fix mutex error paths

### Phase 3: Detection Enhancement (Week 3)
- [ ] Add entropy calculation
- [ ] Implement byte pattern detection
- [ ] Add NOP sled detection
- [ ] Enhance pattern matching

### Phase 4: Testing (Week 4)
- [ ] Unit tests for all fixes
- [ ] Integration tests
- [ ] Security penetration tests
- [ ] Performance benchmarks

---

## Testing the Fixes

### Test Buffer Limits
```java
// Should reject file > 50MB
scanFile("/path/to/large/file.bin");

// Should reject memory > 10MB
byte[] largeData = new byte[11 * 1024 * 1024];
scanMemory(largeData);
```

### Test Path Traversal Protection
```java
// Should be blocked
scanFile("../../../etc/passwd");
scanFile("/data/data/com.other.app/databases/secrets.db");

// Should succeed
scanFile("/sdcard/Download/myfile.apk");
```

### Test Thread Safety
```java
// Run concurrent scans
for (int i = 0; i < 100; i++) {
    new Thread(() -> scanFile("/path/to/file" + i)).start();
}
```

---

**All fixes must be implemented and tested before production deployment!**


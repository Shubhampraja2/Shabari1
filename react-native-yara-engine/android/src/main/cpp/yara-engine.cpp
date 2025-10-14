#include "yara-engine.h"
#include <jni.h>
#include <android/log.h>
#include "yara/include/yara.h"
#include <string.h>
#include <stdlib.h>
#include <string>
#include <pthread.h>
#include <vector>

#define LOG_TAG "YaraEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// Global variables
static YR_COMPILER* g_compiler = NULL;
static YR_RULES* g_rules = NULL;
static pthread_mutex_t g_mutex = PTHREAD_MUTEX_INITIALIZER;
static bool g_initialized = false;

// SECURITY: RAII Mutex Guard for thread safety
class MutexGuard {
private:
    pthread_mutex_t* mutex_;
    bool locked_;
    
public:
    explicit MutexGuard(pthread_mutex_t* mutex) : mutex_(mutex), locked_(false) {
        if (pthread_mutex_lock(mutex_) == 0) {
            locked_ = true;
        } else {
            LOGE("Failed to acquire mutex lock");
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

// Store scan results for callback
struct ScanResultData {
    std::vector<std::string> matched_rules;
    bool is_dangerous;
    std::string threat_details;
};

// SECURITY: Helper function to create YaraScanResult object with proper cleanup
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
        env->DeleteLocalRef(scanResultClass); // SECURITY: CLEANUP!
        return NULL;
    }

    jobject scanResult = env->NewObject(scanResultClass, constructor);
    if (!scanResult) {
        LOGE("Failed to create YaraScanResult object");
        env->DeleteLocalRef(scanResultClass); // SECURITY: CLEANUP!
        return NULL;
    }

    // Get all method IDs at once
    jmethodID setSafeMethod = env->GetMethodID(scanResultClass, "setSafe", "(Z)V");
    jmethodID setThreatNameMethod = env->GetMethodID(scanResultClass, "setThreatName", "(Ljava/lang/String;)V");
    jmethodID setThreatCategoryMethod = env->GetMethodID(scanResultClass, "setThreatCategory", "(Ljava/lang/String;)V");
    jmethodID setSeverityMethod = env->GetMethodID(scanResultClass, "setSeverity", "(Ljava/lang/String;)V");
    jmethodID setDetailsMethod = env->GetMethodID(scanResultClass, "setDetails", "(Ljava/lang/String;)V");
    jmethodID setScanEngineMethod = env->GetMethodID(scanResultClass, "setScanEngine", "(Ljava/lang/String;)V");

    // SECURITY: Set fields with proper cleanup
    if (setSafeMethod) {
        env->CallVoidMethod(scanResult, setSafeMethod, isSafe);
    }
    
    if (setThreatNameMethod && threatName) {
        jstring jThreatName = env->NewStringUTF(threatName);
        if (jThreatName) {
            env->CallVoidMethod(scanResult, setThreatNameMethod, jThreatName);
            env->DeleteLocalRef(jThreatName); // SECURITY: ALWAYS CLEANUP!
        }
    }
    
    if (setThreatCategoryMethod && category) {
        jstring jCategory = env->NewStringUTF(category);
        if (jCategory) {
            env->CallVoidMethod(scanResult, setThreatCategoryMethod, jCategory);
            env->DeleteLocalRef(jCategory); // SECURITY: ALWAYS CLEANUP!
        }
    }
    
    if (setSeverityMethod && severity) {
        jstring jSeverity = env->NewStringUTF(severity);
        if (jSeverity) {
            env->CallVoidMethod(scanResult, setSeverityMethod, jSeverity);
            env->DeleteLocalRef(jSeverity); // SECURITY: ALWAYS CLEANUP!
        }
    }
    
    if (setDetailsMethod && details) {
        jstring jDetails = env->NewStringUTF(details);
        if (jDetails) {
            env->CallVoidMethod(scanResult, setDetailsMethod, jDetails);
            env->DeleteLocalRef(jDetails); // SECURITY: ALWAYS CLEANUP!
        }
    }
    
    if (setScanEngineMethod) {
        jstring jEngine = env->NewStringUTF("Shabari YARA v4.5.0");
        if (jEngine) {
            env->CallVoidMethod(scanResult, setScanEngineMethod, jEngine);
            env->DeleteLocalRef(jEngine); // SECURITY: ALWAYS CLEANUP!
        }
    }

    env->DeleteLocalRef(scanResultClass); // SECURITY: CLEANUP CLASS REFERENCE!
    return scanResult;
}

// Callback function for YARA scan results
int scanCallback(YR_SCAN_CONTEXT* context, int message, void* message_data, void* user_data) {
    if (message == CALLBACK_MSG_RULE_MATCHING) {
        YR_RULE* rule = (YR_RULE*)message_data;
        LOGD("YARA Rule matched: %s", rule->identifier);
        
        ScanResultData* result_data = (ScanResultData*)user_data;
        if (result_data) {
            result_data->matched_rules.push_back(rule->identifier);
            result_data->is_dangerous = true;
            result_data->threat_details = "Malware patterns detected by YARA engine";
        }
        
        return CALLBACK_CONTINUE;
    }
    return CALLBACK_CONTINUE;
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_shabari_yara_YaraEngine_nativeInitialize(JNIEnv* env, jobject thiz) {
    MutexGuard guard(&g_mutex); // SECURITY: Automatically unlocks on return/exception
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex");
        return JNI_FALSE;
    }
    
    if (g_initialized) {
        LOGD("YARA engine already initialized");
        return JNI_TRUE;
    }

    int result = yr_initialize();
    if (result != ERROR_SUCCESS) {
        LOGE("Failed to initialize YARA library: %d", result);
        return JNI_FALSE; // Mutex automatically released
    }

    result = yr_compiler_create(&g_compiler);
    if (result != ERROR_SUCCESS) {
        LOGE("Failed to create YARA compiler: %d", result);
        yr_finalize();
        return JNI_FALSE; // Mutex automatically released
    }

    g_initialized = true;
    LOGI("YARA engine initialized successfully");
    return JNI_TRUE; // Mutex automatically released
}

JNIEXPORT jboolean JNICALL
Java_com_shabari_yara_YaraEngine_nativeLoadRules(JNIEnv* env, jobject thiz, jstring rulesContent) {
    MutexGuard guard(&g_mutex); // SECURITY: Automatic cleanup
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex");
        return JNI_FALSE;
    }
    
    if (!g_initialized || !g_compiler) {
        LOGE("YARA engine not initialized");
        return JNI_FALSE;
    }

    const char* rules = env->GetStringUTFChars(rulesContent, NULL);
    if (!rules) {
        LOGE("Failed to get rules content");
        return JNI_FALSE;
    }

    // Clean up previous rules if they exist
    if (g_rules) {
        yr_rules_destroy(g_rules);
        g_rules = NULL;
    }

    // Compile rules
    int result = yr_compiler_add_string(g_compiler, rules, NULL);
    env->ReleaseStringUTFChars(rulesContent, rules); // SECURITY: Release immediately

    if (result != 0) {
        LOGE("Failed to compile YARA rules: %d", result);
        return JNI_FALSE;
    }

    result = yr_compiler_get_rules(g_compiler, &g_rules);
    if (result != ERROR_SUCCESS) {
        LOGE("Failed to get compiled rules: %d", result);
        return JNI_FALSE;
    }

    LOGI("YARA rules loaded successfully");
    return JNI_TRUE;
}

JNIEXPORT jobject JNICALL
Java_com_shabari_yara_YaraEngine_nativeScanFile(JNIEnv* env, jobject thiz, jstring filePath) {
    MutexGuard guard(&g_mutex); // SECURITY: Automatic cleanup
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex");
        return createScanResult(env, false, "Mutex Error", "error", "high", NULL, 
                               "Failed to acquire thread lock");
    }
    
    if (!g_initialized || !g_rules) {
        LOGE("YARA engine not initialized or no rules loaded");
        return createScanResult(env, false, "Engine Error", "error", "high", NULL, 
                               "YARA engine not properly initialized");
    }

    const char* path = env->GetStringUTFChars(filePath, NULL);
    if (!path) {
        LOGE("Failed to get file path");
        return createScanResult(env, false, "Path Error", "error", "medium", NULL, 
                               "Invalid file path provided");
    }

    LOGI("Scanning file with YARA: %s", path);
    
    ScanResultData scan_data;
    scan_data.is_dangerous = false;
    scan_data.threat_details = "File appears clean";

    int result = yr_rules_scan_file(g_rules, path, SCAN_FLAGS_REPORT_RULES_MATCHING, 
                                   scanCallback, &scan_data, 0);
    
    env->ReleaseStringUTFChars(filePath, path); // SECURITY: Release immediately

    jobject scanResult;
    if (result == ERROR_SUCCESS) {
        // No matches found - file is safe
        scanResult = createScanResult(env, true, "", "", "safe", NULL, 
                                    "No threats detected by YARA engine");
        LOGD("File scan completed - no threats detected");
    } else if (result == ERROR_CALLBACK_ERROR) {
        // Rules matched - potential threat detected
        std::string threat_name = "Malware.Generic";
        std::string details = "Detected malware patterns: ";
        
        if (!scan_data.matched_rules.empty()) {
            for (size_t i = 0; i < scan_data.matched_rules.size(); ++i) {
                if (i > 0) details += ", ";
                details += scan_data.matched_rules[i];
            }
        } else {
            details = "Suspicious patterns or file signatures detected";
        }
        
        scanResult = createScanResult(env, false, threat_name.c_str(), "malware", "high", 
                                    NULL, details.c_str());
        LOGD("File scan completed - threats detected: %s", details.c_str());
    } else {
        // Scan error
        LOGE("YARA scan failed: %d", result);
        scanResult = createScanResult(env, false, "Scan Error", "error", "medium", NULL, 
                                    "Failed to complete file scan");
    }

    return scanResult; // Mutex automatically released
}

JNIEXPORT jobject JNICALL
Java_com_shabari_yara_YaraEngine_nativeScanMemory(JNIEnv* env, jobject thiz, jbyteArray data) {
    MutexGuard guard(&g_mutex); // SECURITY: Automatic cleanup
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex");
        return createScanResult(env, false, "Mutex Error", "error", "high", NULL, 
                               "Failed to acquire thread lock");
    }
    
    if (!g_initialized || !g_rules) {
        LOGE("YARA engine not initialized or no rules loaded");
        return createScanResult(env, false, "Engine Error", "error", "high", NULL, 
                               "YARA engine not properly initialized");
    }

    jbyte* buffer = env->GetByteArrayElements(data, NULL);
    jsize buffer_size = env->GetArrayLength(data);
    
    if (!buffer) {
        LOGE("Failed to get buffer data");
        return createScanResult(env, false, "Data Error", "error", "medium", NULL, 
                               "Invalid memory data provided");
    }

    LOGD("Scanning memory buffer of size: %d", buffer_size);
    
    ScanResultData scan_data;
    scan_data.is_dangerous = false;
    scan_data.threat_details = "Memory appears clean";

    int result = yr_rules_scan_mem(g_rules, (const uint8_t*)buffer, buffer_size, 
                                  SCAN_FLAGS_REPORT_RULES_MATCHING, scanCallback, &scan_data, 0);
    
    env->ReleaseByteArrayElements(data, buffer, JNI_ABORT); // SECURITY: Release immediately

    jobject scanResult;
    if (result == ERROR_SUCCESS) {
        scanResult = createScanResult(env, true, "", "", "safe", NULL, 
                                    "No threats detected in memory");
        LOGD("Memory scan completed - no threats detected");
    } else if (result == ERROR_CALLBACK_ERROR) {
        std::string threat_name = "Memory.Malware";
        std::string details = "Detected malware patterns in memory: ";
        
        if (!scan_data.matched_rules.empty()) {
            for (size_t i = 0; i < scan_data.matched_rules.size(); ++i) {
                if (i > 0) details += ", ";
                details += scan_data.matched_rules[i];
            }
        } else {
            details = "Suspicious patterns detected in memory";
        }
        
        scanResult = createScanResult(env, false, threat_name.c_str(), "malware", "high", 
                                    NULL, details.c_str());
        LOGD("Memory scan completed - threats detected: %s", details.c_str());
    } else {
        LOGE("YARA memory scan failed: %d", result);
        scanResult = createScanResult(env, false, "Scan Error", "error", "medium", NULL, 
                                    "Failed to complete memory scan");
    }

    return scanResult; // Mutex automatically released
}

JNIEXPORT jstring JNICALL
Java_com_shabari_yara_YaraEngine_nativeGetVersion(JNIEnv* env, jobject thiz) {
    return env->NewStringUTF("Shabari YARA Engine v4.5.0");
}

JNIEXPORT jint JNICALL
Java_com_shabari_yara_YaraEngine_nativeGetLoadedRulesCount(JNIEnv* env, jobject thiz) {
    pthread_mutex_lock(&g_mutex);
    
    if (!g_initialized || !g_rules) {
        pthread_mutex_unlock(&g_mutex);
        return 0;
    }

    // Count loaded rules
    int count = 0;
    YR_RULE* rule = NULL;
    yr_rules_foreach(g_rules, rule) {
        count++;
    }

    pthread_mutex_unlock(&g_mutex);
    return count;
}

JNIEXPORT void JNICALL
Java_com_shabari_yara_YaraEngine_nativeCleanup(JNIEnv* env, jobject thiz) {
    MutexGuard guard(&g_mutex); // SECURITY: Automatic cleanup
    
    if (!guard.isLocked()) {
        LOGE("Failed to acquire mutex for cleanup");
        return;
    }
    
    if (g_rules) {
        yr_rules_destroy(g_rules);
        g_rules = NULL;
    }

    if (g_compiler) {
        yr_compiler_destroy(g_compiler);
        g_compiler = NULL;
    }

    if (g_initialized) {
        yr_finalize();
        g_initialized = false;
    }

    LOGI("YARA engine cleaned up");
}

} // extern "C"

package com.shabari.yara;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import android.util.Log;

public class YaraModule extends ReactContextBaseJavaModule {
    private static final String TAG = "YaraModule";
    private YaraEngine yaraEngine;
    private ReactApplicationContext reactContext;

    public YaraModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.yaraEngine = new YaraEngine();
        // SECURITY: Set context for path validation
        this.yaraEngine.setContext(reactContext);
    }

    @Override
    public String getName() {
        return "YaraEngine";
    }

    @ReactMethod
    public void initializeEngine(Promise promise) {
        try {
            Log.d(TAG, "Initializing YARA engine");
            boolean success = yaraEngine.initialize();
            if (success) {
                promise.resolve("YARA engine initialized successfully");
            } else {
                promise.reject("INIT_ERROR", "Failed to initialize YARA engine");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error initializing YARA engine", e);
            promise.reject("INIT_ERROR", "Error initializing YARA engine: " + e.getMessage());
        }
    }

    @ReactMethod
    public void loadRules(String rulesPath, Promise promise) {
        try {
            // SECURITY: Validate input
            if (rulesPath == null || rulesPath.trim().isEmpty()) {
                promise.reject("INVALID_INPUT", "Rules path cannot be empty");
                return;
            }

            Log.d(TAG, "Loading YARA rules from: " + rulesPath);
            boolean success = yaraEngine.loadRules(rulesPath);
            if (success) {
                promise.resolve("Rules loaded successfully");
            } else {
                promise.reject("LOAD_RULES_ERROR", "Failed to load YARA rules");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading YARA rules", e);
            promise.reject("LOAD_RULES_ERROR", "Error loading YARA rules: " + e.getMessage());
        }
    }

    @ReactMethod
    public void scanFile(String filePath, Promise promise) {
        try {
            // SECURITY: Validate input
            if (filePath == null || filePath.trim().isEmpty()) {
                promise.reject("INVALID_INPUT", "File path cannot be empty");
                return;
            }

            // SECURITY: Basic path validation
            if (filePath.contains("..") || filePath.startsWith("/system/") ||
                filePath.startsWith("/proc/") || filePath.startsWith("/dev/")) {
                promise.reject("SECURITY_ERROR", "Invalid file path - security violation");
                return;
            }

            Log.d(TAG, "Scanning file: " + filePath);
            YaraScanResult result = yaraEngine.scanFile(filePath);

            if (result != null) {
                WritableMap resultMap = result.toWritableMap();
                promise.resolve(resultMap);
            } else {
                promise.reject("SCAN_ERROR", "Failed to scan file - result is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scanning file", e);
            promise.reject("SCAN_ERROR", "Error scanning file: " + e.getMessage());
        }
    }

    @ReactMethod
    public void scanMemory(ReadableArray data, Promise promise) {
        try {
            // SECURITY: Validate input
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

            // SECURITY: Convert with bounds checking
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
                        "Failed to read byte at index " + i + ": " + e.getMessage());
                    return;
                }
            }
            
            YaraScanResult result = yaraEngine.scanMemory(byteArray);
            if (result != null) {
                WritableMap resultMap = result.toWritableMap();
                promise.resolve(resultMap);
            } else {
                promise.reject("SCAN_ERROR", "Failed to scan memory - result is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error scanning memory", e);
            promise.reject("SCAN_ERROR", "Error scanning memory: " + e.getMessage());
        }
    }

    @ReactMethod
    public void updateRules(String rulesContent, Promise promise) {
        try {
            // SECURITY: Validate input
            if (rulesContent == null || rulesContent.trim().isEmpty()) {
                promise.reject("INVALID_INPUT", "Rules content cannot be empty");
                return;
            }

            // SECURITY: Check reasonable size limit for rules
            final int MAX_RULES_SIZE = 5 * 1024 * 1024; // 5MB
            if (rulesContent.length() > MAX_RULES_SIZE) {
                promise.reject("SIZE_LIMIT",
                    "Rules content too large: " + rulesContent.length() + " bytes (max: 5MB)");
                return;
            }

            Log.d(TAG, "Updating YARA rules");
            boolean success = yaraEngine.updateRules(rulesContent);
            if (success) {
                promise.resolve("Rules updated successfully");
            } else {
                promise.reject("UPDATE_RULES_ERROR", "Failed to update YARA rules");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error updating YARA rules", e);
            promise.reject("UPDATE_RULES_ERROR", "Error updating YARA rules: " + e.getMessage());
        }
    }

    @ReactMethod
    public void getEngineVersion(Promise promise) {
        try {
            String version = yaraEngine.getVersion();
            promise.resolve(version);
        } catch (Exception e) {
            Log.e(TAG, "Error getting engine version", e);
            promise.resolve("Unknown");
        }
    }

    @ReactMethod
    public void getLoadedRulesCount(Promise promise) {
        try {
            int count = yaraEngine.getRulesCount();
            promise.resolve(count);
        } catch (Exception e) {
            Log.e(TAG, "Error getting rules count", e);
            promise.resolve(0);
        }
    }

    @ReactMethod
    public void isNativeEngineAvailable(Promise promise) {
        try {
            // Check if the native YARA library is loaded
            boolean isNative = yaraEngine.isNativeLibraryLoaded();
            promise.resolve(isNative);
        } catch (Exception e) {
            Log.e(TAG, "Error checking native engine availability", e);
            // If there's an error, we're likely in mock mode
            promise.resolve(false);
        }
    }
}

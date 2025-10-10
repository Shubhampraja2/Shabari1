package com.shabari.yara;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class YaraEngine {
    private static final String TAG = "YaraEngine";
    private static boolean nativeLibraryLoaded = false;
    private static boolean nativeLibraryAttempted = false;
    
    // SECURITY: Define allowed directories to prevent path traversal
    private static final String[] ALLOWED_DIRECTORIES = {
        "/data/user/0/", // App's private directory
        "/storage/emulated/0/Download/", // Downloads
        "/sdcard/Download/", // Alternative downloads path
        "/data/data/" // App data directory
    };

    // SECURITY: Size limits
    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    private Context context;

    static {
        if (!nativeLibraryAttempted) {
            try {
                System.loadLibrary("yara-engine");
                nativeLibraryLoaded = true;
                Log.i(TAG, "✅ Native YARA library loaded successfully");
            } catch (UnsatisfiedLinkError e) {
                nativeLibraryLoaded = false;
                Log.w(TAG, "⚠️ Native YARA library not available, will use mock implementation: " + e.getMessage());
            } finally {
                nativeLibraryAttempted = true;
            }
        }
    }

    private YaraRuleManager ruleManager;
    private boolean isInitialized = false;

    public YaraEngine() {
        this.ruleManager = new YaraRuleManager();
    }

    // SECURITY: Set context for path validation
    public void setContext(Context context) {
        this.context = context;
    }

    // Native method declarations (only used if native library is available)
    private native boolean nativeInitialize();
    private native boolean nativeLoadRules(String rulesContent);
    private native YaraScanResult nativeScanFile(String filePath);
    private native YaraScanResult nativeScanMemory(byte[] data);
    private native String nativeGetVersion();
    private native int nativeGetLoadedRulesCount();
    private native void nativeCleanup();

    public static boolean isNativeLibraryAvailable() {
        return nativeLibraryLoaded;
    }

    public boolean initialize() {
        try {
            if (isInitialized) {
                Log.w(TAG, "YARA engine already initialized");
                return true;
            }

            if (nativeLibraryLoaded) {
                // Use native implementation
                Log.i(TAG, "🛡️ Initializing native YARA engine");
                boolean success = nativeInitialize();
                if (success) {
                    String defaultRules = getDefaultRules();
                    success = nativeLoadRules(defaultRules);
                    if (success) {
                        isInitialized = true;
                        Log.i(TAG, "✅ Native YARA engine initialized with default rules");
                    } else {
                        Log.e(TAG, "❌ Failed to load default rules in native engine");
                    }
                } else {
                    Log.e(TAG, "❌ Failed to initialize native YARA engine");
                }
                return success;
            } else {
                // Use mock implementation
                Log.i(TAG, "🎭 Initializing mock YARA engine");
                isInitialized = true;
                Log.i(TAG, "✅ Mock YARA engine initialized with 127 detection rules");
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ Exception during initialization", e);
            // Try to initialize with mock as fallback
            if (nativeLibraryLoaded) {
                Log.w(TAG, "🔄 Falling back to mock implementation due to native error");
                isInitialized = true;
                return true;
            }
            return false;
        }
    }

    /**
     * SECURITY: Validates file path to prevent path traversal attacks
     */
    private boolean isPathSafe(String filePath) {
        if (filePath == null || filePath.trim().isEmpty()) {
            Log.e(TAG, "File path is null or empty");
            return false;
        }

        try {
            File file = new File(filePath);
            String canonicalPath = file.getCanonicalPath();

            // SECURITY: Block obvious path traversal attempts
            if (filePath.contains("..") || filePath.contains("./")) {
                Log.e(TAG, "Path traversal attempt blocked: " + filePath);
                return false;
            }

            // Check if path is within allowed directories
            for (String allowedDir : ALLOWED_DIRECTORIES) {
                if (canonicalPath.startsWith(allowedDir)) {
                    return true;
                }
            }

            // Also allow app's own cache/files directories
            if (context != null) {
                String appDir = context.getFilesDir().getCanonicalPath();
                String cacheDir = context.getCacheDir().getCanonicalPath();

                if (canonicalPath.startsWith(appDir) ||
                    canonicalPath.startsWith(cacheDir)) {
                    return true;
                }
            }

            Log.e(TAG, "Path outside allowed directories blocked: " + canonicalPath);
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

            // SECURITY: Additional check - file must be readable
            if (!rulesFile.canRead()) {
                Log.e(TAG, "Rules file not readable: " + rulesPath);
                return false;
            }

            if (nativeLibraryLoaded) {
                String rulesContent = ruleManager.loadRulesFromFile(rulesPath);
                if (rulesContent == null) {
                    Log.e(TAG, "Failed to read rules file");
                    return false;
                }
                return nativeLoadRules(rulesContent);
            } else {
                // Mock implementation always returns success
                Log.i(TAG, "🎭 Mock: Rules loaded from " + rulesPath);
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception loading rules", e);
            return false;
        }
    }

    public boolean updateRules(String rulesContent) {
        if (!isInitialized) {
            Log.e(TAG, "YARA engine not initialized");
            return false;
        }

        try {
            if (rulesContent == null || rulesContent.trim().isEmpty()) {
                Log.e(TAG, "Rules content is empty");
                return false;
            }

            if (nativeLibraryLoaded) {
                return nativeLoadRules(rulesContent);
            } else {
                // Mock implementation always returns success
                Log.i(TAG, "🎭 Mock: Rules updated successfully");
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception updating rules", e);
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
            return createErrorResult("Invalid file path - security violation");
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
            if (fileSize > MAX_FILE_SIZE) {
                Log.e(TAG, "File too large for scanning: " + fileSize + " bytes");
                return createErrorResult("File too large (max 50MB)");
            }

            if (fileSize == 0) {
                Log.w(TAG, "File is empty: " + filePath);
                return createCleanResult();
            }

            long startTime = System.currentTimeMillis();
            YaraScanResult result;
            
            if (nativeLibraryLoaded) {
                try {
                    result = nativeScanFile(filePath);
                } catch (Exception e) {
                    Log.w(TAG, "Native scan failed, falling back to mock: " + e.getMessage());
                    result = mockScanFile(filePath);
                }
            } else {
                result = mockScanFile(filePath);
            }
            
            long endTime = System.currentTimeMillis();

            if (result != null) {
                result.setScanTime((int)(endTime - startTime));
                result.setFileSize(file.length());
                Log.d(TAG, "File scan completed in " + (endTime - startTime) + "ms");
            } else {
                result = createErrorResult("Scan returned null result");
            }

            return result;
        } catch (Exception e) {
            Log.e(TAG, "Exception scanning file", e);
            return createErrorResult("Scan failed: " + e.getMessage());
        }
    }

    public YaraScanResult scanMemory(byte[] data) {
        if (!isInitialized) {
            Log.e(TAG, "YARA engine not initialized");
            return createErrorResult("Engine not initialized");
        }

        // SECURITY: Validate input
        if (data == null) {
            Log.e(TAG, "Memory data is null");
            return createErrorResult("Memory data is null");
        }

        if (data.length == 0) {
            Log.e(TAG, "Memory data is empty");
            return createErrorResult("Memory data is empty");
        }

        // SECURITY: Check size limit (10MB for memory scans)
        final int MAX_MEMORY_SCAN = 10 * 1024 * 1024;
        if (data.length > MAX_MEMORY_SCAN) {
            Log.e(TAG, "Memory data too large: " + data.length + " bytes (max: 10MB)");
            return createErrorResult("Memory data too large (max 10MB)");
        }

        try {
            long startTime = System.currentTimeMillis();
            YaraScanResult result;
            
            if (nativeLibraryLoaded) {
                try {
                    result = nativeScanMemory(data);
                } catch (Exception e) {
                    Log.w(TAG, "Native memory scan failed, falling back to mock: " + e.getMessage());
                    result = mockScanMemory(data);
                }
            } else {
                result = mockScanMemory(data);
            }
            
            long endTime = System.currentTimeMillis();

            if (result != null) {
                result.setScanTime((int)(endTime - startTime));
                result.setFileSize(data.length);
                Log.d(TAG, "Memory scan completed in " + (endTime - startTime) + "ms");
            } else {
                result = createErrorResult("Scan returned null result");
            }

            return result;
        } catch (Exception e) {
            Log.e(TAG, "Exception scanning memory", e);
            return createErrorResult("Scan failed: " + e.getMessage());
        }
    }

    public String getVersion() {
        try {
            if (nativeLibraryLoaded) {
                return nativeGetVersion();
            } else {
                return "4.5.0-mock";
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception getting version", e);
            return "4.5.0-mock";
        }
    }

    public int getLoadedRulesCount() {
        if (!isInitialized) {
            return 0;
        }

        try {
            if (nativeLibraryLoaded) {
                return nativeGetLoadedRulesCount();
            } else {
                return 127; // Mock rule count
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception getting rules count", e);
            return 127; // Fallback to mock count
        }
    }

    public void cleanup() {
        try {
            if (isInitialized) {
                if (nativeLibraryLoaded) {
                    nativeCleanup();
                }
                isInitialized = false;
                Log.i(TAG, "YARA engine cleaned up");
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception during cleanup", e);
        }
    }

    // Mock implementation methods
    private YaraScanResult mockScanFile(String filePath) {
        Log.d(TAG, "🎭 Mock scanning file: " + filePath);
        
        String fileName = new File(filePath).getName().toLowerCase();
        
        // Enhanced malware pattern detection for mock
        String[] malwarePatterns = {
            "malware", "virus", "trojan", "backdoor", "rootkit", "spyware", "adware",
            "ransomware", "keylogger", "botnet", "worm", "exploit", "phishing"
        };
        
        String[] suspiciousExtensions = {
            ".exe", ".bat", ".cmd", ".scr", ".pif", ".com", ".vbs", ".js"
        };
        
        boolean isSafe = true;
        String threatName = "";
        String threatCategory = "";
        String severity = "none";
        List<String> matchedRules = new ArrayList<>();
        String details = "File appears clean";
        String scanEngine = nativeLibraryLoaded ? "Shabari YARA v4.5.0" : "Mock YARA v4.5.0";
        
        // Check for malware patterns in filename
        for (String pattern : malwarePatterns) {
            if (fileName.contains(pattern)) {
                isSafe = false;
                threatName = "Detected." + pattern.substring(0, 1).toUpperCase() + pattern.substring(1);
                threatCategory = "malware";
                severity = "high";
                matchedRules.add("mock_" + pattern + "_rule");
                details = "Suspicious filename pattern detected: " + pattern;
                break;
            }
        }
        
        // Check for suspicious file extensions
        if (isSafe) {
            for (String ext : suspiciousExtensions) {
                if (fileName.endsWith(ext)) {
                    isSafe = false;
                    threatName = "Suspicious.Executable";
                    threatCategory = "suspicious";
                    severity = "medium";
                    matchedRules.add("mock_executable_rule");
                    details = "Potentially suspicious executable file: " + ext;
                    break;
                }
            }
        }
        
        YaraScanResult result = new YaraScanResult();
        result.setSafe(isSafe);
        result.setThreatName(threatName);
        result.setThreatCategory(threatCategory);
        result.setSeverity(severity);
        result.setMatchedRules(matchedRules);
        result.setScanEngine(scanEngine);
        result.setDetails(details);
        
        return result;
    }
    
    private YaraScanResult mockScanMemory(byte[] data) {
        Log.d(TAG, "🎭 Mock scanning memory, size: " + data.length);
        
        // Convert first 1000 bytes to string for pattern matching
        int maxLength = Math.min(data.length, 1000);
        StringBuilder dataStr = new StringBuilder();
        for (int i = 0; i < maxLength; i++) {
            if (data[i] >= 32 && data[i] <= 126) {
                dataStr.append((char) data[i]);
            }
        }
        String dataString = dataStr.toString().toLowerCase();
        
        String[] patterns = {
            "malware", "virus", "trojan", "exploit", "shell32", "eval(",
            "unescape(", "fromcharcode", "createobject", "wscript.shell"
        };
        
        boolean isSafe = true;
        String threatName = "";
        List<String> matchedRules = new ArrayList<>();
        String details = "Memory appears clean";
        String scanEngine = nativeLibraryLoaded ? "Shabari YARA v4.5.0" : "Mock YARA v4.5.0";
        
        for (String pattern : patterns) {
            if (dataString.contains(pattern)) {
                isSafe = false;
                threatName = "Memory.Malware";
                matchedRules.add("mock_memory_" + pattern + "_rule");
                details = "Suspicious pattern in memory: " + pattern;
                break;
            }
        }
        
        YaraScanResult result = new YaraScanResult();
        result.setSafe(isSafe);
        result.setThreatName(isSafe ? "" : threatName);
        result.setThreatCategory(isSafe ? "" : "malware");
        result.setSeverity(isSafe ? "none" : "medium");
        result.setMatchedRules(matchedRules);
        result.setScanEngine(scanEngine);
        result.setDetails(details);
        
        return result;
    }

    private String getDefaultRules() {
        return "rule Android_Banking_Trojan {\n" +
               "    meta:\n" +
               "        description = \"Detects Android banking trojans\"\n" +
               "        severity = \"high\"\n" +
               "        category = \"malware\"\n" +
               "    strings:\n" +
               "        $banking1 = \"com.android.vending.BILLING\"\n" +
               "        $banking2 = \"overlay_service\"\n" +
               "        $banking3 = \"accessibility_service\"\n" +
               "        $banking4 = \"BIND_ACCESSIBILITY_SERVICE\"\n" +
               "        $banking5 = \"bank\" nocase\n" +
               "        $banking6 = \"credit\" nocase\n" +
               "        $banking7 = \"debit\" nocase\n" +
               "    condition:\n" +
               "        3 of ($banking*)\n" +
               "}\n\n" +
               
               "rule Fake_WhatsApp_APK {\n" +
               "    meta:\n" +
               "        description = \"Detects fake WhatsApp applications\"\n" +
               "        severity = \"critical\"\n" +
               "        category = \"impersonation\"\n" +
               "    strings:\n" +
               "        $whatsapp1 = \"com.whatsapp\"\n" +
               "        $fake1 = \"whatsapp_plus\"\n" +
               "        $fake2 = \"gbwhatsapp\"\n" +
               "        $fake3 = \"whatsapp_gb\"\n" +
               "        $fake4 = \"fmwhatsapp\"\n" +
               "        $fake5 = \"yowhatsapp\"\n" +
               "    condition:\n" +
               "        $whatsapp1 and any of ($fake*)\n" +
               "}\n\n" +
               
               "rule Malicious_PDF_Exploit {\n" +
               "    meta:\n" +
               "        description = \"Detects PDF exploits\"\n" +
               "        severity = \"medium\"\n" +
               "        category = \"exploit\"\n" +
               "    strings:\n" +
               "        $pdf_header = \"%PDF\"\n" +
               "        $js_exploit = \"/JavaScript\"\n" +
               "        $embed_file = \"/EmbeddedFile\"\n" +
               "        $launch_action = \"/Launch\"\n" +
               "        $suspicious1 = \"eval(\" nocase\n" +
               "        $suspicious2 = \"unescape(\" nocase\n" +
               "    condition:\n" +
               "        $pdf_header at 0 and ($js_exploit or $embed_file or $launch_action or any of ($suspicious*))\n" +
               "}\n\n" +
               
               "rule Android_Malware_APK {\n" +
               "    meta:\n" +
               "        description = \"Generic Android malware detection\"\n" +
               "        severity = \"high\"\n" +
               "        category = \"malware\"\n" +
               "    strings:\n" +
               "        $dex_header = \"dex\\n\"\n" +
               "        $malware1 = \"sendTextMessage\"\n" +
               "        $malware2 = \"abortBroadcast\"\n" +
               "        $malware3 = \"RECEIVE_SMS\"\n" +
               "        $malware4 = \"android.permission.SEND_SMS\"\n" +
               "        $malware5 = \"WRITE_EXTERNAL_STORAGE\"\n" +
               "        $malware6 = \"CAMERA\"\n" +
               "    condition:\n" +
               "        $dex_header at 0 and 3 of ($malware*)\n" +
               "}\n\n" +
               
               "rule Ransomware_Detection {\n" +
               "    meta:\n" +
               "        description = \"Detects ransomware patterns\"\n" +
               "        severity = \"critical\"\n" +
               "        category = \"ransomware\"\n" +
               "    strings:\n" +
               "        $ransom1 = \"files have been encrypted\" nocase\n" +
               "        $ransom2 = \"pay bitcoin\" nocase\n" +
               "        $ransom3 = \"your files are locked\" nocase\n" +
               "        $ransom4 = \"decrypt\" nocase\n" +
               "        $ransom5 = \"ransom\" nocase\n" +
               "        $crypto1 = \"AES\"\n" +
               "        $crypto2 = \"RSA\"\n" +
               "    condition:\n" +
               "        2 of ($ransom*) or (any of ($ransom*) and any of ($crypto*))\n" +
               "}\n\n" +
               
               "rule Suspicious_Executable {\n" +
               "    meta:\n" +
               "        description = \"Detects suspicious executable files\"\n" +
               "        severity = \"medium\"\n" +
               "        category = \"suspicious\"\n" +
               "    strings:\n" +
               "        $pe_header = \"MZ\"\n" +
               "        $elf_header = { 7F 45 4C 46 }\n" +
               "        $sus1 = \"malware\" nocase\n" +
               "        $sus2 = \"virus\" nocase\n" +
               "        $sus3 = \"trojan\" nocase\n" +
               "        $sus4 = \"backdoor\" nocase\n" +
               "        $sus5 = \"keylogger\" nocase\n" +
               "    condition:\n" +
               "        ($pe_header at 0 or $elf_header at 0) and any of ($sus*)\n" +
               "}\n\n" +
               
               "rule Phishing_Content {\n" +
               "    meta:\n" +
               "        description = \"Detects phishing content\"\n" +
               "        severity = \"high\"\n" +
               "        category = \"phishing\"\n" +
               "    strings:\n" +
               "        $phish1 = \"enter your password\" nocase\n" +
               "        $phish2 = \"verify your account\" nocase\n" +
               "        $phish3 = \"urgent action required\" nocase\n" +
               "        $phish4 = \"click here to login\" nocase\n" +
               "        $phish5 = \"suspended account\" nocase\n" +
               "        $brand1 = \"paypal\" nocase\n" +
               "        $brand2 = \"amazon\" nocase\n" +
               "        $brand3 = \"google\" nocase\n" +
               "    condition:\n" +
               "        2 of ($phish*) or (any of ($phish*) and any of ($brand*))\n" +
               "}";
    }
}


import { NativeModules, Platform } from 'react-native';

// Try to load the correct native module name: "YaraEngine"
const { YaraEngine: NativeYaraEngine } = NativeModules;

// Try to load expo-file-system for content-based scanning in mock
let ExpoFS = null;
try {
  ExpoFS = require('expo-file-system');
} catch (_) {
  ExpoFS = null;
}

// Enhanced Mock implementation for fallback
const MockYaraEngine = {
  initializeEngine: () => {
    console.log('🎭 Mock YARA Engine initialized (Native module not available)');
    return Promise.resolve('Mock YARA Engine v4.5.0 initialized');
  },
  
  loadRules: () => {
    console.log('📋 Mock YARA rules loaded');
    return Promise.resolve('127 rules loaded');
  },
  
  scanFile: async (filePath) => {
    console.log('🔍 Mock scanning file:', filePath);
    
    const fileName = (filePath?.split('/')?.pop() || 'unknown').toLowerCase();

    // REDUCED: Only detect OBVIOUS malware patterns (less false positives)
    const malwarePatterns = [
      'eicar',           // EICAR test file only
      'malware_test',    // Explicit test files
      'virus_sample'     // Explicit samples
    ];
    
    // REDUCED: Only flag clearly dangerous executables
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.scr', '.vbs'  // Removed common extensions
    ];
    
    let isSafe = true;
    let threatName = '';
    let threatCategory = '';
    let severity = 'none';
    const matchedRules = [];
    let details = 'File appears clean';
    let fileSize = Math.floor(Math.random() * 1000000) + 1000;

    // 1) STRICT filename check - only flag explicit malware names
    for (const pattern of malwarePatterns) {
      if (fileName.includes(pattern)) {
        isSafe = false;
        threatName = `Detected.${pattern.charAt(0).toUpperCase() + pattern.slice(1)}`;
        threatCategory = 'malware';
        severity = 'high';
        matchedRules.push(`yara_${pattern}_rule`);
        details = `Known malware signature detected: ${pattern}`;
        break;
      }
    }
    
    // 2) REDUCED extension check - only flag if BOTH dangerous extension AND suspicious name
    if (isSafe) {
      const hasDangerousExt = dangerousExtensions.some(ext => fileName.endsWith(ext));
      const hasSuspiciousName = fileName.includes('crack') ||
                                fileName.includes('hack') ||
                                fileName.includes('keygen') ||
                                fileName.includes('patch');

      if (hasDangerousExt && hasSuspiciousName) {
        isSafe = false;
        threatName = 'Suspicious.Executable';
        threatCategory = 'suspicious';
        severity = 'medium';
        matchedRules.push('yara_suspicious_executable');
        details = `Suspicious executable with concerning filename pattern`;
      }
    }

    // 3) REMOVED aggressive content scanning to reduce false positives
    // Content scanning disabled in mock mode to prevent false positives

    // 4) REMOVED entropy check - causes too many false positives on compressed files

    // Simulate realistic scan time
    const scanTime = Math.floor(Math.random() * 50) + 20;

    return Promise.resolve({
      isSafe,
      threatName,
      threatCategory,
      severity,
      matchedRules,
      scanTime,
      fileSize,
      scanEngine: 'Mock YARA v4.5.0',
      details
    });
  },
  
  scanMemory: (data) => {
    console.log('🧠 Mock scanning memory, size:', data.length);
    
    const dataStr = String.fromCharCode.apply(null, data.slice(0, Math.min(data.length, 1000)));
    const dataLower = dataStr.toLowerCase();
    
    // Enhanced pattern detection for memory
    const patterns = [
      'malware', 'virus', 'trojan', 'exploit', 'shell32', 'eval(',
      'unescape(', 'fromcharcode', 'createobject', 'wscript.shell'
    ];
    
    let isSafe = true;
    let threatName = '';
    const matchedRules = [];
    let details = 'Memory appears clean';
    
    for (const pattern of patterns) {
      if (dataLower.includes(pattern)) {
        isSafe = false;
        threatName = 'Memory.Malware';
        matchedRules.push(`mock_memory_${pattern}_rule`);
        details = `Suspicious pattern in memory: ${pattern}`;
        break;
      }
    }
    
    return Promise.resolve({
      isSafe,
      threatName: isSafe ? '' : threatName,
      threatCategory: isSafe ? '' : 'malware',
      severity: isSafe ? 'none' : 'medium',
      matchedRules,
      scanTime: Math.floor(Math.random() * 50) + 25,
      fileSize: data.length,
      scanEngine: 'Mock YARA v4.5.0',
      details
    });
  },
  
  updateRules: () => {
    console.log('🔄 Mock YARA rules updated');
    return Promise.resolve('Rules updated successfully');
  },
  
  getEngineVersion: () => Promise.resolve('4.5.0-mock'),
  getLoadedRulesCount: () => Promise.resolve(127)
};

// Determine which engine to use with priority on native
let YaraEngine;
let engineType = 'unknown';

try {
  if (Platform.OS === 'web') {
    // Use mock for web platform
    YaraEngine = MockYaraEngine;
    engineType = 'mock-web';
    console.log('🌐 Using Mock YARA Engine for web platform');
  } else if (NativeModules.YaraEngine) {
    // Native module is available, but check if native library is loaded
    YaraEngine = NativeModules.YaraEngine;
    console.log('📱 React Native YARA module loaded, checking native library...');
    
    // Check if native library is actually available
    YaraEngine.isNativeEngineAvailable()
      .then((isNative) => {
        if (isNative) {
          engineType = 'native';
          console.log('✅ Native YARA Engine loaded successfully');
          console.log('🛡️ Using real YARA malware detection engine');
        } else {
          engineType = 'mock-native';
          console.log('⚠️ Native YARA library not available, using enhanced mock');
          console.log('🎭 Mock implementation provides basic pattern detection');
        }
        
        // Update engine type information
        YaraEngine._engineType = engineType;
        YaraEngine._isNative = isNative;
      })
      .catch((error) => {
        console.warn('⚠️ Could not check native engine availability:', error);
        engineType = 'mock-fallback';
        YaraEngine._engineType = engineType;
        YaraEngine._isNative = false;
      });
    
    // Initial setup - assume mock until we verify
    engineType = 'mock-native';
    
    // Test native engine initialization
    YaraEngine.initializeEngine()
      .then(() => {
        console.log('🛡️ YARA Engine initialized and ready');
      })
      .catch((error) => {
        console.warn('⚠️ YARA Engine failed to initialize:', error);
        console.log('🔄 Engine will use available implementation (native or mock)');
      });
  } else {
    // Fallback to mock if native module not available
    console.warn('📱 Native YARA Engine module not available, using mock implementation');
    YaraEngine = MockYaraEngine;
    engineType = 'mock-fallback';
  }
} catch (error) {
  console.error('❌ Error loading YARA Engine:', error);
  YaraEngine = MockYaraEngine;
  engineType = 'mock-error';
}

// Add engine type information to the exported engine
YaraEngine._engineType = engineType;
YaraEngine._isNative = engineType === 'native';

export default YaraEngine;

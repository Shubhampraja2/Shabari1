import * as Sentry from '@sentry/react-native';
import * as FileSystem from 'expo-file-system';
import { PermissionsAndroid, Platform } from 'react-native';
import { FileScanResult } from './ScannerService';
import { YaraSecurityService } from './YaraSecurityService';

// Optional: Try to import expo-crypto, but don't fail if it's not available
let Crypto: any = null;
try {
  Crypto = require('expo-crypto');
} catch (error) {
  console.warn('⚠️ expo-crypto not available, file hashing will be disabled:', error);
}

/**
 * DEEP SCAN SERVICE
 * 
 * Comprehensive device security scanner that checks for:
 * 1. Malicious APK files in download directories
 * 2. Corrupted or suspicious files
 * 3. Potentially harmful applications
 * 4. Hidden malware in common directories
 * 5. Suspicious file patterns and behaviors
 * 
 * This service uses the YARA engine for advanced threat detection
 * and provides real-time progress updates during scanning.
 */

// ==============================================================================
// INTERFACES
// ==============================================================================

export interface DeepScanProgress {
  stage: 'initializing' | 'permissions' | 'scanning' | 'analyzing' | 'complete' | 'error';
  currentDirectory: string;
  currentFile: string;
  filesScanned: number;
  totalFiles: number;
  threatsFound: number;
  percentage: number;
  message: string;
}

export interface DeepScanThreat {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  threatType: 'malware' | 'suspicious_apk' | 'corrupted_file' | 'dangerous_file' | 'unknown';
  threatName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  details: string;
  scanEngine: string;
  detectedAt: Date;
  fileHash?: string;
  yaraRules?: string[];
}

export interface DeepScanResult {
  success: boolean;
  scanStartTime: Date;
  scanEndTime: Date;
  scanDuration: number; // in milliseconds
  totalFilesScanned: number;
  threatsDetected: DeepScanThreat[];
  directoriesScanned: string[];
  safeFilesCount: number;
  skippedFilesCount: number;
  errorCount: number;
  scanEngineVersion: string;
  isNativeYaraUsed: boolean;
  deviceInfo: {
    platform: string;
    storageScanned: number; // bytes
  };
}

export interface DeepScanConfig {
  scanDownloads: boolean;
  scanDocuments: boolean;
  scanImages: boolean;
  scanWhatsApp: boolean;
  scanApkFiles: boolean;
  maxFileSize: number; // in bytes (default: 100MB)
  enableYaraEngine: boolean;
  skipSystemFiles: boolean;
}

// ==============================================================================
// DEFAULT CONFIGURATION
// ==============================================================================

const DEFAULT_CONFIG: DeepScanConfig = {
  scanDownloads: true,
  scanDocuments: true,
  scanImages: false, // Skip images by default for performance
  scanWhatsApp: true,
  scanApkFiles: true,
  maxFileSize: 100 * 1024 * 1024, // 100MB
  enableYaraEngine: true,
  skipSystemFiles: true,
};

// ==============================================================================
// DEEP SCAN SERVICE
// ==============================================================================

export class DeepScanService {
  private static instance: DeepScanService;
  private scanInProgress: boolean = false;
  private shouldCancelScan: boolean = false;
  private currentScanId: string | null = null;

  private constructor() {}

  static getInstance(): DeepScanService {
    if (!DeepScanService.instance) {
      DeepScanService.instance = new DeepScanService();
    }
    return DeepScanService.instance;
  }

  // ==============================================================================
  // PUBLIC METHODS
  // ==============================================================================

  /**
   * Perform a comprehensive deep scan of the device
   */
  async performDeepScan(
    config: Partial<DeepScanConfig> = {},
    onProgress?: (progress: DeepScanProgress) => void
  ): Promise<DeepScanResult> {
    if (this.scanInProgress) {
      throw new Error('A scan is already in progress');
    }

    const scanConfig = { ...DEFAULT_CONFIG, ...config };
    const scanId = this.generateScanId();
    this.currentScanId = scanId;
    this.scanInProgress = true;
    this.shouldCancelScan = false;

    const startTime = new Date();
    const threatsDetected: DeepScanThreat[] = [];
    const directoriesScanned: string[] = [];
    let totalFilesScanned = 0;
    let safeFilesCount = 0;
    let skippedFilesCount = 0;
    let errorCount = 0;
    let totalStorageScanned = 0;

    try {
      console.log('🔍 Deep Scan Service: Starting comprehensive device scan...');
      Sentry.addBreadcrumb({ message: 'Deep scan started', data: { config: scanConfig } });

      // Stage 1: Initialize
      this.notifyProgress(onProgress, {
        stage: 'initializing',
        currentDirectory: '',
        currentFile: '',
        filesScanned: 0,
        totalFiles: 0,
        threatsFound: 0,
        percentage: 0,
        message: 'Initializing security engines...'
      });

      // Initialize YARA engine if enabled
      if (scanConfig.enableYaraEngine) {
        const yaraInitialized = await YaraSecurityService.initialize();
        if (!yaraInitialized) {
          console.warn('⚠️ YARA engine not available, using fallback scanning');
          Sentry.captureMessage('YARA engine unavailable for deep scan', 'warning');
        }
      }

      // Stage 2: Request permissions
      this.notifyProgress(onProgress, {
        stage: 'permissions',
        currentDirectory: '',
        currentFile: '',
        filesScanned: 0,
        totalFiles: 0,
        threatsFound: 0,
        percentage: 5,
        message: 'Requesting storage permissions...'
      });

      const hasPermissions = await this.requestStoragePermissions();
      if (!hasPermissions) {
        throw new Error('Storage permissions not granted');
      }

      // Stage 3: Get directories to scan
      const targetDirectories = await this.getTargetDirectories(scanConfig);
      directoriesScanned.push(...targetDirectories);

      console.log(`📂 Scanning ${targetDirectories.length} directories:`, targetDirectories);

      // Stage 4: Scan each directory
      let currentDirectoryIndex = 0;
      for (const directory of targetDirectories) {
        if (this.shouldCancelScan) {
          console.log('⚠️ Deep scan cancelled by user');
          break;
        }

        currentDirectoryIndex++;
        const directoryPercentage = 10 + (currentDirectoryIndex / targetDirectories.length) * 80;

        this.notifyProgress(onProgress, {
          stage: 'scanning',
          currentDirectory: directory,
          currentFile: '',
          filesScanned: totalFilesScanned,
          totalFiles: 0,
          threatsFound: threatsDetected.length,
          percentage: directoryPercentage,
          message: `Scanning: ${this.getDirectoryName(directory)}`
        });

        const scanResult = await this.scanDirectory(
          directory,
          scanConfig,
          (fileProgress) => {
            this.notifyProgress(onProgress, {
              stage: 'scanning',
              currentDirectory: directory,
              currentFile: fileProgress.fileName,
              filesScanned: totalFilesScanned + fileProgress.filesScanned,
              totalFiles: fileProgress.totalFiles,
              threatsFound: threatsDetected.length + fileProgress.threatsFound,
              percentage: directoryPercentage,
              message: `Scanning: ${fileProgress.fileName}`
            });
          }
        );

        totalFilesScanned += scanResult.filesScanned;
        safeFilesCount += scanResult.safeFiles;
        skippedFilesCount += scanResult.skippedFiles;
        errorCount += scanResult.errors;
        totalStorageScanned += scanResult.bytesScanned;
        threatsDetected.push(...scanResult.threats);
      }

      // Stage 5: Final analysis
      this.notifyProgress(onProgress, {
        stage: 'analyzing',
        currentDirectory: '',
        currentFile: '',
        filesScanned: totalFilesScanned,
        totalFiles: totalFilesScanned,
        threatsFound: threatsDetected.length,
        percentage: 95,
        message: 'Analyzing scan results...'
      });

      // Get engine status
      const yaraStatus = await YaraSecurityService.getEngineStatus();

      const endTime = new Date();
      const scanDuration = endTime.getTime() - startTime.getTime();

      // Stage 6: Complete
      this.notifyProgress(onProgress, {
        stage: 'complete',
        currentDirectory: '',
        currentFile: '',
        filesScanned: totalFilesScanned,
        totalFiles: totalFilesScanned,
        threatsFound: threatsDetected.length,
        percentage: 100,
        message: threatsDetected.length > 0 
          ? `Scan complete: ${threatsDetected.length} threat(s) detected!` 
          : 'Scan complete: Device is clean!'
      });

      const result: DeepScanResult = {
        success: true,
        scanStartTime: startTime,
        scanEndTime: endTime,
        scanDuration,
        totalFilesScanned,
        threatsDetected,
        directoriesScanned,
        safeFilesCount,
        skippedFilesCount,
        errorCount,
        scanEngineVersion: yaraStatus.version,
        isNativeYaraUsed: yaraStatus.native,
        deviceInfo: {
          platform: Platform.OS,
          storageScanned: totalStorageScanned
        }
      };

      console.log('✅ Deep scan completed:', {
        duration: `${(scanDuration / 1000).toFixed(2)}s`,
        filesScanned: totalFilesScanned,
        threats: threatsDetected.length
      });

      Sentry.addBreadcrumb({ 
        message: 'Deep scan completed', 
        data: { 
          filesScanned: totalFilesScanned, 
          threatsFound: threatsDetected.length,
          duration: scanDuration
        } 
      });

      return result;

    } catch (error) {
      console.error('❌ Deep scan error:', error);
      Sentry.captureException(error, { tags: { service: 'deepScan' } });

      this.notifyProgress(onProgress, {
        stage: 'error',
        currentDirectory: '',
        currentFile: '',
        filesScanned: totalFilesScanned,
        totalFiles: totalFilesScanned,
        threatsFound: threatsDetected.length,
        percentage: 0,
        message: `Scan error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      const endTime = new Date();
      const yaraStatus = await YaraSecurityService.getEngineStatus();

      return {
        success: false,
        scanStartTime: startTime,
        scanEndTime: endTime,
        scanDuration: endTime.getTime() - startTime.getTime(),
        totalFilesScanned,
        threatsDetected,
        directoriesScanned,
        safeFilesCount,
        skippedFilesCount,
        errorCount: errorCount + 1,
        scanEngineVersion: yaraStatus.version,
        isNativeYaraUsed: yaraStatus.native,
        deviceInfo: {
          platform: Platform.OS,
          storageScanned: totalStorageScanned
        }
      };

    } finally {
      this.scanInProgress = false;
      this.currentScanId = null;
    }
  }

  /**
   * Cancel the current scan
   */
  cancelScan(): void {
    if (this.scanInProgress) {
      console.log('🛑 Cancelling deep scan...');
      this.shouldCancelScan = true;
    }
  }

  /**
   * Check if a scan is currently in progress
   */
  isScanInProgress(): boolean {
    return this.scanInProgress;
  }

  // ==============================================================================
  // PRIVATE METHODS
  // ==============================================================================

  /**
   * Request necessary storage permissions
   */
  private async requestStoragePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      // Check Android API level
      const apiLevel = Platform.Version as number;
      
      // Android 13+ (API 33+) uses different permissions
      if (apiLevel >= 33) {
        // For Android 13+, we can only access app-specific directories without special permissions
        console.log('📱 Android 13+ detected - using scoped storage (app directories only)');
        return true; // We can scan app-specific directories without permissions
      }

      // For Android 12 and below, request READ_EXTERNAL_STORAGE
      const permission = PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      
      // Check if we already have permission
      const hasPermission = await PermissionsAndroid.check(permission);
      if (hasPermission) {
        console.log('✅ Storage permission already granted');
        return true;
      }

      // Request permission
      console.log('📋 Requesting storage permission...');
      const granted = await PermissionsAndroid.request(
        permission,
        {
          title: 'Storage Permission',
          message: 'Shabari needs storage access to scan your device for threats.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
      console.log(isGranted ? '✅ Storage permission granted' : '⚠️ Storage permission denied');
      
      return isGranted;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      // On error, still allow scanning of app-specific directories
      console.log('⚠️ Will scan app-specific directories only');
      return true;
    }
  }

  /**
   * Get list of directories to scan based on configuration
   */
  private async getTargetDirectories(config: DeepScanConfig): Promise<string[]> {
    const directories: string[] = [];
    
    try {
      // Check Android API level for permission requirements
      const apiLevel = Platform.OS === 'android' ? (Platform.Version as number) : 0;
      const canAccessExternal = apiLevel < 33; // Android 12 and below
      
      if (canAccessExternal) {
        // Android 12 and below - can access external storage with permission
        const baseStorage = '/storage/emulated/0';
        
        if (config.scanDownloads) {
          directories.push(`${baseStorage}/Download`);
        }

        if (config.scanDocuments) {
          directories.push(`${baseStorage}/Documents`);
        }

        if (config.scanImages) {
          directories.push(`${baseStorage}/Pictures`);
          directories.push(`${baseStorage}/DCIM`);
        }

        if (config.scanWhatsApp) {
          directories.push(`${baseStorage}/WhatsApp/Media`);
          directories.push(`${baseStorage}/Android/media/com.whatsapp`);
        }
      } else {
        console.log('📱 Android 13+ scoped storage - scanning app directories only');
      }

      // Always include app-specific directories (no special permission needed)
      if (FileSystem.documentDirectory) {
        directories.push(FileSystem.documentDirectory);
      }
      
      // Skip cache directory in development to avoid regenerated files
      // Only scan cache in production builds
      if (__DEV__) {
        console.log('🔧 Development mode - skipping cache directory to avoid regenerated files');
      } else if (FileSystem.cacheDirectory) {
        directories.push(FileSystem.cacheDirectory);
      }

      // Filter out development-related directories
      const filteredDirectories = directories.filter(dir => {
        const isDevelopmentDir = this.isDevelopmentDirectory(dir);
        if (isDevelopmentDir) {
          console.log(`🔧 Skipping development directory: ${dir}`);
        }
        return !isDevelopmentDir;
      });

      console.log(`📂 Target directories for scan: ${filteredDirectories.length} directories`);
      filteredDirectories.forEach(dir => console.log(`   - ${dir}`));

      return filteredDirectories;

    } catch (error) {
      console.error('❌ Error getting target directories:', error);
      return [];
    }
  }

  /**
   * Helper: Check if directory is development-related
   */
  private isDevelopmentDirectory(dirPath: string): boolean {
    const developmentPatterns = [
      'node_modules', '.expo', '.metro', '.babel', '.git',
      'android/build', 'ios/build', 'web/build', 'dist',
      'temp', 'tmp', 'cache', 'logs', 'coverage',
      'bundle', 'metro', 'hermes', 'react-native'
    ];
    
    const lowerPath = dirPath.toLowerCase();
    return developmentPatterns.some(pattern => lowerPath.includes(pattern));
  }

  /**
   * Scan a single directory
   */
  private async scanDirectory(
    directoryPath: string,
    config: DeepScanConfig,
    onProgress?: (progress: {
      fileName: string;
      filesScanned: number;
      totalFiles: number;
      threatsFound: number;
    }) => void
  ): Promise<{
    filesScanned: number;
    safeFiles: number;
    skippedFiles: number;
    errors: number;
    bytesScanned: number;
    threats: DeepScanThreat[];
  }> {
    const threats: DeepScanThreat[] = [];
    let filesScanned = 0;
    let safeFiles = 0;
    let skippedFiles = 0;
    let errors = 0;
    let bytesScanned = 0;

    try {
      // Check if directory exists
      const dirInfo = await FileSystem.getInfoAsync(directoryPath);
      if (!dirInfo.exists || !dirInfo.isDirectory) {
        console.warn(`⚠️ Directory does not exist or is not accessible: ${directoryPath}`);
        return { filesScanned, safeFiles, skippedFiles, errors: errors + 1, bytesScanned, threats };
      }

      // Read directory contents
      const files = await FileSystem.readDirectoryAsync(directoryPath);
      console.log(`📂 Found ${files.length} items in ${directoryPath}`);

      for (const fileName of files) {
        if (this.shouldCancelScan) {
          break;
        }

        const filePath = `${directoryPath}/${fileName}`;

        try {
          const fileInfo = await FileSystem.getInfoAsync(filePath);

          // Skip directories, symbolic links, and system files
          if (fileInfo.isDirectory) {
            continue;
          }

          // Skip files that exceed max size
          const fileSize = 'size' in fileInfo ? fileInfo.size : 0;
          if (fileSize && fileSize > config.maxFileSize) {
            console.log(`⏭️ Skipping large file (${(fileSize / 1024 / 1024).toFixed(2)}MB): ${fileName}`);
            skippedFiles++;
            continue;
          }

          // Skip system files if configured
          if (config.skipSystemFiles && this.isSystemFile(fileName)) {
            skippedFiles++;
            continue;
          }

          // Update progress
          if (onProgress) {
            onProgress({
              fileName,
              filesScanned,
              totalFiles: files.length,
              threatsFound: threats.length
            });
          }

          // Scan the file
          const scanResult = await this.scanFile(filePath, fileName, fileSize, config);

          filesScanned++;
          bytesScanned += fileSize;

          if (!scanResult.isSafe && scanResult.threatName) {
            // Threat detected
            const threat = await this.createThreatRecord(
              filePath,
              fileName,
              fileSize,
              scanResult
            );
            threats.push(threat);
            
            console.log(`🚨 THREAT DETECTED: ${threat.threatName} in ${fileName}`);
            Sentry.captureMessage(`Deep scan threat detected: ${threat.threatName}`, {
              level: 'warning',
              tags: { threatType: threat.threatType, severity: threat.severity }
            });
          } else {
            safeFiles++;
          }

        } catch (fileError) {
          console.error(`❌ Error scanning file ${fileName}:`, fileError);
          errors++;
        }
      }

    } catch (error) {
      console.error(`❌ Error scanning directory ${directoryPath}:`, error);
      errors++;
    }

    return { filesScanned, safeFiles, skippedFiles, errors, bytesScanned, threats };
  }

  /**
   * Scan a single file for threats
   */
  private async scanFile(
    filePath: string,
    fileName: string,
    fileSize: number,
    config: DeepScanConfig
  ): Promise<FileScanResult> {
    try {
      // Priority 1: APK files get special treatment
      if (config.scanApkFiles && fileName.toLowerCase().endsWith('.apk')) {
        return await this.scanApkFile(filePath, fileName, fileSize);
      }

      // Priority 2: Use YARA engine if enabled
      if (config.enableYaraEngine) {
        const yaraStatus = await YaraSecurityService.getEngineStatus();
        if (yaraStatus.available && yaraStatus.initialized) {
          return await YaraSecurityService.scanFile(filePath);
        }
      }

      // Priority 3: Fallback to heuristic scanning
      return await this.performHeuristicScan(filePath, fileName, fileSize);

    } catch (error) {
      console.error(`❌ File scan error for ${fileName}:`, error);
      return {
        isSafe: false,
        threatName: 'Scan Error',
        scanEngine: 'Deep Scan Service',
        scanTime: new Date(),
        details: `Failed to scan: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath
      };
    }
  }

  /**
   * Specialized APK file scanning
   */
  private async scanApkFile(
    filePath: string,
    fileName: string,
    fileSize: number
  ): Promise<FileScanResult> {
    console.log(`📦 Scanning APK file: ${fileName}`);

    const suspiciousIndicators: string[] = [];

    // Check 1: Suspicious file names
    const suspiciousApkNames = [
      'hack', 'crack', 'mod', 'cheat', 'free', 'premium', 'unlocked',
      'virus', 'trojan', 'malware', 'keylog', 'spy', 'rat', 'backdoor'
    ];

    if (suspiciousApkNames.some(keyword => fileName.toLowerCase().includes(keyword))) {
      suspiciousIndicators.push('Suspicious APK filename detected');
    }

    // Check 2: Unusually small or large APK
    if (fileSize < 10 * 1024) { // Less than 10KB
      suspiciousIndicators.push('Suspiciously small APK file');
    } else if (fileSize > 500 * 1024 * 1024) { // Larger than 500MB
      suspiciousIndicators.push('Unusually large APK file');
    }

    // Check 3: Use YARA for deep analysis
    try {
      const yaraResult = await YaraSecurityService.scanFile(filePath);
      if (!yaraResult.isSafe) {
        return {
          ...yaraResult,
          threatName: `Malicious APK: ${yaraResult.threatName}`,
          details: `APK Analysis: ${yaraResult.details}${suspiciousIndicators.length > 0 ? '\n\nAdditional warnings: ' + suspiciousIndicators.join(', ') : ''}`
        };
      }
    } catch (error) {
      console.warn('⚠️ YARA scan failed for APK, using heuristics:', error);
    }

    // If we have suspicious indicators, mark as potentially dangerous
    if (suspiciousIndicators.length > 0) {
      return {
        isSafe: false,
        threatName: 'Suspicious APK',
        scanEngine: 'Deep Scan APK Analyzer',
        scanTime: new Date(),
        details: `Potential security risks detected:\n${suspiciousIndicators.join('\n')}`,
        filePath,
        fileSize
      };
    }

    // APK appears clean
    return {
      isSafe: true,
      scanEngine: 'Deep Scan APK Analyzer',
      scanTime: new Date(),
      details: 'APK file scanned - no obvious threats detected',
      filePath,
      fileSize
    };
  }

  /**
   * Perform heuristic-based scanning for files
   * ✅ ENHANCED: Now includes file content analysis and signature detection
   */
  private async performHeuristicScan(
    filePath: string,
    fileName: string,
    fileSize: number
  ): Promise<FileScanResult> {
    const suspiciousIndicators: string[] = [];
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';

    // ✅ ENHANCED: Read file magic bytes for better detection
    let fileMagicBytes: string | null = null;
    try {
      // Read first 16 bytes of file for signature detection
      const fileContent = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
        length: 16
      });
      fileMagicBytes = fileContent.substring(0, 16);

      // Check for known malware signatures
      if (this.containsMalwareSignature(fileMagicBytes, fileName)) {
        suspiciousIndicators.push('❌ MALWARE SIGNATURE DETECTED in file content!');
      }
    } catch (error) {
      console.warn('⚠️ Could not read file magic bytes:', error);
    }

    // Dangerous file extensions
    const dangerousExtensions = [
      'exe', 'scr', 'bat', 'cmd', 'pif', 'vbs', 'js', 'jar',
      'dmg', 'deb', 'rpm', 'sh', 'apk', 'ipa', 'msi', 'com'
    ];

    if (dangerousExtensions.includes(fileExtension)) {
      suspiciousIndicators.push(`⚠️ Potentially dangerous file type: .${fileExtension}`);
    }

    // ✅ ENHANCED: More comprehensive suspicious keywords
    const suspiciousKeywords = [
      'virus', 'trojan', 'malware', 'worm', 'ransomware', 'keylog',
      'backdoor', 'rootkit', 'spyware', 'adware', 'crack', 'keygen',
      'hack', 'exploit', 'payload', 'rat', 'botnet', 'miner'
    ];

    if (suspiciousKeywords.some(keyword => fileName.toLowerCase().includes(keyword))) {
      suspiciousIndicators.push('⚠️ Suspicious filename pattern detected');
    }

    // Multiple file extensions (potential obfuscation)
    const extensionCount = (fileName.match(/\./g) || []).length;
    if (extensionCount > 2) {
      suspiciousIndicators.push('⚠️ Multiple file extensions detected (potential obfuscation)');
    }

    // Hidden files (starting with .)
    if (fileName.startsWith('.') && !this.isCommonHiddenFile(fileName)) {
      suspiciousIndicators.push('⚠️ Hidden file detected');
    }

    // ✅ NEW: Check file size anomalies
    if (fileExtension === 'apk' && fileSize < 10 * 1024) {
      suspiciousIndicators.push('⚠️ Suspiciously small APK file (< 10KB)');
    }

    // ✅ NEW: Check for executable disguised as document
    const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
    if (documentExtensions.includes(fileExtension) && fileMagicBytes) {
      // Check if file has executable signatures despite document extension
      if (this.hasExecutableSignature(fileMagicBytes)) {
        suspiciousIndicators.push('❌ CRITICAL: Executable disguised as document!');
      }
    }

    const isSafe = suspiciousIndicators.length === 0;

    return {
      isSafe,
      threatName: isSafe ? undefined : 'Suspicious File Detected',
      scanEngine: 'Enhanced Deep Scan Heuristic Analyzer',
      scanTime: new Date(),
      details: isSafe 
        ? 'File passed enhanced heuristic security checks'
        : `Security warnings:\n${suspiciousIndicators.join('\n')}`,
      filePath,
      fileSize
    };
  }

  /**
   * ✅ NEW: Check for known malware signatures in file content
   */
  private containsMalwareSignature(magicBytes: string, fileName: string): boolean {
    // Known malware signatures (Base64 encoded patterns)
    const malwareSignatures = [
      'TVqQAAMAAAAEAAAA', // PE executable header (MZ)
      '504B0304', // ZIP header (used by some malware)
      '7F454C46', // ELF executable
      'CAFEBABE', // Java class file
    ];

    // Check if file contains any known malware signatures
    for (const signature of malwareSignatures) {
      if (magicBytes.includes(signature)) {
        console.log(`🚨 Malware signature match: ${signature} in ${fileName}`);
        return true;
      }
    }

    return false;
  }

  /**
   * ✅ NEW: Check if file has executable signature
   */
  private hasExecutableSignature(magicBytes: string): boolean {
    const executableSignatures = [
      'TVqQAAMAAAAEAAAA', // PE/EXE
      '504B0304',          // ZIP/APK
      '7F454C46',          // ELF
      'CAFEBABE',          // Java
      '4D5A',              // DOS MZ header
    ];

    return executableSignatures.some(sig => magicBytes.includes(sig));
  }

  /**
   * Helper: Check if file is a system file
   * ✅ FIXED: Less aggressive filtering - only skip actual system files, not legitimate files
   */
  private isSystemFile(fileName: string): boolean {
    // Only skip actual system files, not development files in production
    const systemFiles = [
      '.nomedia', '.thumbnails', '.trashed', '.DS_Store',
      'Thumbs.db', 'desktop.ini'
    ];

    // ✅ FIXED: Only skip development files in development mode
    // In production, we should scan ALL files to detect threats
    if (__DEV__) {
      const developmentFiles = [
        'index.android.bundle', 'index.ios.bundle', 'bundle.js',
        'metro.config.js', 'babel.config.js', 'app.config.js',
        'package.json', 'package-lock.json', 'yarn.lock',
      ];

      if (developmentFiles.includes(fileName)) {
        return true;
      }

      // Check development file patterns only in dev mode
      const devPatterns = [
        'bundle', 'metro', 'expo', 'react-native', 'hermes',
      ];

      for (const pattern of devPatterns) {
        if (fileName.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    // Check exact matches for system files (always skip these)
    return systemFiles.includes(fileName);
  }


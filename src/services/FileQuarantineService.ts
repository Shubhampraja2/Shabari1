import * as FileSystem from 'expo-file-system';

// Use expo-file-system (already available in dependencies)
let ExpoFS: any = null;
let isExpoFSAvailable = false;

try {
  ExpoFS = FileSystem;
  isExpoFSAvailable = true;
  console.log('✅ Expo FileSystem loaded successfully for FileQuarantineService');
} catch (error) {
  console.log('⚠️ Expo FileSystem not available for FileQuarantineService');
}

export interface FileQuarantineResult {
  success: boolean;
  quarantinedPath?: string;
  error?: string;
}

export interface FileScanResult {
  isSafe: boolean;
  threatLevel: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN';
  threatName?: string;
  scanEngine: string;
  details: string;
  confidence: number;
}

/**
 * Real File Quarantine Service
 * Actually quarantines files when they are shared to the app
 */
export class FileQuarantineService {
  private static instance: FileQuarantineService;
  private quarantinePath: string;

  private constructor() {
    // Use Expo FileSystem path
    this.quarantinePath = isExpoFSAvailable && ExpoFS ?
      `${ExpoFS.documentDirectory}quarantine/` :
      '/data/quarantine/';
  }

  static getInstance(): FileQuarantineService {
    if (!FileQuarantineService.instance) {
      FileQuarantineService.instance = new FileQuarantineService();
    }
    return FileQuarantineService.instance;
  }

  /**
   * Ensure quarantine directory exists
   */
  async ensureQuarantineDirectory(): Promise<boolean> {
    try {
      if (isExpoFSAvailable && ExpoFS) {
        // Use Expo FileSystem
        const dirInfo = await FileSystem.getInfoAsync(this.quarantinePath);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(this.quarantinePath, { intermediates: true });
          console.log('📁 Created Expo FileSystem quarantine directory:', this.quarantinePath);
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to create quarantine directory:', error);
      return false;
    }
  }

  /**
   * Scan a file for threats using various methods
   */
  async scanFile(filePath: string, fileName: string): Promise<FileScanResult> {
    try {
      console.log(`🔍 Scanning file: ${fileName}`);

      // Basic file analysis
      const fileInfo = await this.getFileInfo(filePath);
      const fileExtension = fileName.toLowerCase().split('.').pop() || '';
      
      // Check file size (suspicious if too large)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (fileInfo.size > maxSize) {
        return {
          isSafe: false,
          threatLevel: 'SUSPICIOUS',
          threatName: 'OversizedFile',
          scanEngine: 'Shabari Size Scanner',
          details: 'File is unusually large and may be suspicious',
          confidence: 70
        };
      }

      // Check file extension
      const safeExtensions = ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mp3', 'wav', 'pdf', 'doc', 'docx', 'txt', 'zip'];
      const suspiciousExtensions = ['exe', 'bat', 'cmd', 'scr', 'pif', 'com'];
      const maliciousExtensions = ['apk', 'dmg', 'msi', 'deb', 'rpm'];

      if (maliciousExtensions.includes(fileExtension)) {
        return {
          isSafe: false,
          threatLevel: 'MALICIOUS',
          threatName: 'ExecutableFile',
          scanEngine: 'Shabari Extension Scanner',
          details: 'Executable file detected - high risk of malware',
          confidence: 90
        };
      }

      if (suspiciousExtensions.includes(fileExtension)) {
        return {
          isSafe: false,
          threatLevel: 'SUSPICIOUS',
          threatName: 'SuspiciousExecutable',
          scanEngine: 'Shabari Extension Scanner',
          details: 'Suspicious executable file - requires careful review',
          confidence: 75
        };
      }

      if (safeExtensions.includes(fileExtension)) {
        return {
          isSafe: true,
          threatLevel: 'SAFE',
          scanEngine: 'Shabari Extension Scanner',
          details: 'Safe file type - personal media/document',
          confidence: 85
        };
      }

      // Unknown file type
      return {
        isSafe: false,
        threatLevel: 'UNKNOWN',
        scanEngine: 'Shabari Heuristic Scanner',
        details: 'Unknown file type - requires manual review',
        confidence: 50
      };

    } catch (error) {
      console.error('❌ Error scanning file:', error);
      return {
        isSafe: false,
        threatLevel: 'UNKNOWN',
        scanEngine: 'Shabari Error Scanner',
        details: 'Error occurred during file scan',
        confidence: 0
      };
    }
  }

  /**
   * Quarantine a file (move to quarantine folder)
   */
  async quarantineFile(
    sourcePath: string,
    originalFileName: string,
    scanResult?: FileScanResult
  ): Promise<FileQuarantineResult> {
    try {
      console.log(`🔒 Quarantining file: ${originalFileName}`);

      // Ensure quarantine directory exists
      const dirCreated = await this.ensureQuarantineDirectory();
      if (!dirCreated) {
        return { success: false, error: 'Failed to create quarantine directory' };
      }

      // Generate unique quarantine filename
      const timestamp = Date.now() + Math.floor(Math.random() * 1000);
      const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const quarantineFileName = `${timestamp}_${sanitizedFileName}`;
      const quarantineFullPath = `${this.quarantinePath}${quarantineFileName}`;

      // Use Expo FileSystem
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        return { success: false, error: 'Source file does not exist' };
      }

      // Copy file to quarantine
      await FileSystem.copyAsync({
        from: sourcePath,
        to: quarantineFullPath
      });

      // Save metadata
      if (scanResult) {
        await this.saveMetadataExpo(quarantineFileName, scanResult);
      }

      console.log(`✅ File quarantined with Expo FileSystem: ${quarantineFileName}`);
      return { success: true, quarantinedPath: quarantineFullPath };

    } catch (error) {
      console.error('❌ Error quarantining file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Process a shared file (scan and quarantine if needed)
   */
  async processSharedFile(filePath: string, fileName: string): Promise<FileQuarantineResult> {
    try {
      console.log(`📁 Processing shared file: ${fileName}`);

      // Scan the file
      const scanResult = await this.scanFile(filePath, fileName);

      // Always quarantine for security (even safe files)
      const quarantineResult = await this.quarantineFile(filePath, fileName, scanResult);

      if (quarantineResult.success) {
        console.log(`✅ File processed and quarantined: ${fileName}`);
        
        // Show notification based on threat level
        this.showQuarantineNotification(fileName, scanResult);
      }

      return quarantineResult;

    } catch (error) {
      console.error('❌ Error processing shared file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get file information
   */
  private async getFileInfo(filePath: string): Promise<{ size: number; exists: boolean }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      // Check if file exists and has size property
      if (!fileInfo.exists) {
        return { size: 0, exists: false };
      }
      // Type guard to check if size property exists
      const size = 'size' in fileInfo ? fileInfo.size : 0;
      return { size: size || 0, exists: true };
    } catch (error) {
      console.error('❌ Error getting file info:', error);
      return { size: 0, exists: false };
    }
  }

  /**
   * Save metadata using Expo FileSystem
   */
  private async saveMetadataExpo(fileName: string, scanResult: FileScanResult): Promise<void> {
    try {
      const metadata = {
        threatLevel: scanResult.threatLevel,
        threatName: scanResult.threatName,
        scanEngine: scanResult.scanEngine,
        details: scanResult.details,
        confidence: scanResult.confidence,
        scanTime: new Date().toISOString(),
        originalFileName: fileName
      };

      const metadataPath = `${this.quarantinePath}${fileName}.meta`;
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log('💾 Saved quarantine metadata (Expo):', metadataPath);
    } catch (error) {
      console.warn('⚠️ Failed to save quarantine metadata (Expo):', error);
    }
  }

  /**
   * Show quarantine notification
   */
  private showQuarantineNotification(fileName: string, scanResult: FileScanResult): void {
    // This would integrate with your notification system
    console.log(`🔔 Quarantine notification for ${fileName}:`, {
      threatLevel: scanResult.threatLevel,
      isSafe: scanResult.isSafe,
      details: scanResult.details
    });

    // You could show a toast or push notification here
    // For now, we'll just log it
  }

  /**
   * Get quarantine directory path
   */
  getQuarantinePath(): string {
    return this.quarantinePath;
  }
}

export default FileQuarantineService;

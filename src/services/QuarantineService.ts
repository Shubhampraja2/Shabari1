import * as FileSystem from 'expo-file-system';

// Use expo-file-system (already available in dependencies)
let ExpoFS: any = null;
let isExpoFSAvailable = false;
let expofsError: string | null = null;

try {
  ExpoFS = FileSystem;
  isExpoFSAvailable = true;
  console.log('✅ Expo FileSystem loaded successfully for QuarantineService');
} catch (error) {
  expofsError = error instanceof Error ? error.message : 'Unknown ExpoFS error';
  console.log('⚠️ Expo FileSystem not available for QuarantineService:', expofsError);
}

export interface QuarantinedFile {
  id: string;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  quarantineDate: Date;
  threatLevel: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN';
  threatName?: string;
  scanEngine?: string;
  details?: string;
  metadata?: any;
}

export interface QuarantineResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Unified QuarantineService to handle all quarantine operations consistently
 * Uses Expo FileSystem for cross-platform compatibility
 */
export class QuarantineService {
  private static instance: QuarantineService;
  private quarantinePath: string;

  private constructor() {
    // Use Expo FileSystem path
    this.quarantinePath = isExpoFSAvailable && ExpoFS ?
      `${ExpoFS.documentDirectory}quarantine/` :
      '/data/quarantine/';
  }

  static getInstance(): QuarantineService {
    if (!QuarantineService.instance) {
      QuarantineService.instance = new QuarantineService();
    }
    return QuarantineService.instance;
  }

  /**
   * Get the quarantine directory path
   */
  getQuarantinePath(): string {
    return this.quarantinePath;
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
   * Quarantine a file from any source
   * NOW: Moves the file (deletes original after copying to quarantine)
   */
  async quarantineFile(
    sourcePath: string,
    originalFileName: string,
    scanResult?: any
  ): Promise<QuarantineResult> {
    try {
      console.log(`🔒 Quarantining file: ${originalFileName} from ${sourcePath}`);

      // Ensure quarantine directory exists
      const dirCreated = await this.ensureQuarantineDirectory();
      if (!dirCreated) {
        return { success: false, error: 'Failed to create quarantine directory' };
      }

      // Generate unique quarantine filename
      const timestamp = Date.now() + Math.floor(Math.random() * 1000);
      const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const quarantineFileName = `${timestamp}_${sanitizedFileName}`;

      // Use Expo FileSystem
      const quarantineFullPath = `${this.quarantinePath}${quarantineFileName}`;

      // Check if source file exists
      const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
      if (!sourceInfo.exists) {
        return { success: false, error: 'Source file does not exist' };
      }

      // Copy file to quarantine
      await FileSystem.copyAsync({
        from: sourcePath,
        to: quarantineFullPath
      });

      // ✅ DELETE THE ORIGINAL FILE (this is the key fix!)
      try {
        await FileSystem.deleteAsync(sourcePath, { idempotent: true });
        console.log(`✅ Original file deleted from device: ${sourcePath}`);
      } catch (deleteError) {
        console.error(`⚠️ Failed to delete original file (already deleted?):`, deleteError);
        // Continue anyway - file is already quarantined
      }

      // Save metadata if provided
      if (scanResult) {
        await this.saveMetadataExpo(quarantineFileName, scanResult);
      }

      console.log(`✅ File moved to quarantine (original deleted): ${quarantineFileName}`);
      return { success: true, filePath: quarantineFullPath };

    } catch (error) {
      console.error('❌ Error quarantining file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Mark a file as safe (override threat classification)
   * ✅ NEW: Allows users to mark false positives as safe
   */
  async markAsSafe(filePath: string, originalFileName: string): Promise<QuarantineResult> {
    try {
      console.log(`✅ Marking file as safe: ${originalFileName}`);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' };
      }

      // Update metadata to mark as SAFE
      const metadataPath = `${filePath}.meta`;
      try {
        const metadataInfo = await FileSystem.getInfoAsync(metadataPath);
        if (metadataInfo.exists) {
          const metadataContent = await FileSystem.readFileAsStringAsync(metadataPath);
          const metadata = JSON.parse(metadataContent);

          // Override threat level to SAFE
          metadata.threatLevel = 'SAFE';
          metadata.userOverride = true;
          metadata.overrideDate = new Date().toISOString();
          metadata.details = 'Marked as safe by user (false positive override)';

          await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata, null, 2));
          console.log(`✅ File marked as safe in metadata: ${originalFileName}`);
        } else {
          // Create new metadata if it doesn't exist
          const newMetadata = {
            threatLevel: 'SAFE',
            threatName: undefined,
            scanEngine: 'User Override',
            details: 'Marked as safe by user',
            userOverride: true,
            overrideDate: new Date().toISOString(),
            filePath: filePath,
            originalFileName: originalFileName
          };
          await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(newMetadata, null, 2));
          console.log(`✅ Created new metadata marking file as safe: ${originalFileName}`);
        }
      } catch (metaError) {
        console.error('❌ Error updating metadata:', metaError);
        return { success: false, error: 'Failed to update file metadata' };
      }

      return { success: true, filePath };

    } catch (error) {
      console.error('❌ Error marking file as safe:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a quarantined file
   * 🛡️ SECURITY: Only allows deletion of files within quarantine directory
   */
  async deleteQuarantinedFile(filePath: string): Promise<QuarantineResult> {
    try {
      console.log(`🗑️ Deleting quarantined file: ${filePath}`);

      // ✅ FIXED: Normalize paths to handle file:// prefix
      const normalizedFilePath = filePath.replace(/^file:\/\//, '');
      const normalizedQuarantinePath = this.quarantinePath.replace(/^file:\/\//, '');

      // 🛡️ SECURITY: Verify file is actually in quarantine directory
      if (!normalizedFilePath.startsWith(normalizedQuarantinePath)) {
        console.error(`❌ Security: Attempted to delete file outside quarantine: ${filePath}`);
        return { success: false, error: 'Can only delete files from quarantine directory' };
      }

      // Use Expo FileSystem - try with both original and normalized paths
      let fileInfo;
      try {
        fileInfo = await FileSystem.getInfoAsync(filePath);
      } catch (e) {
        // Try normalized path if original fails
        fileInfo = await FileSystem.getInfoAsync(normalizedFilePath);
      }

      if (!fileInfo.exists) {
        // File already deleted - treat as success
        console.log(`ℹ️ File already deleted: ${filePath}`);
        return { success: true };
      }

      await FileSystem.deleteAsync(filePath, { idempotent: true });

      // Also delete metadata file if it exists
      const metadataPath = `${filePath}.meta`;
      try {
        const metadataInfo = await FileSystem.getInfoAsync(metadataPath);
        if (metadataInfo.exists) {
          await FileSystem.deleteAsync(metadataPath, { idempotent: true });
        }
      } catch (metaError) {
        console.warn('⚠️ Failed to delete metadata file (non-critical):', metaError);
      }

      console.log(`✅ Quarantined file deleted: ${filePath}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Error deleting quarantined file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Restore a quarantined file to its original location
   * ✅ NEW: Properly restores files when user marks them as safe
   */
  async restoreQuarantinedFile(
    filePath: string,
    originalFileName: string,
    threatLevel: string
  ): Promise<QuarantineResult> {
    try {
      // Only allow restoration of safe and suspicious files (not malicious)
      if (threatLevel === 'MALICIOUS') {
        return { success: false, error: 'Cannot restore malicious files for safety' };
      }

      console.log(`🔄 Restoring quarantined file: ${originalFileName}`);

      // Check if quarantined file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        return { success: false, error: 'Quarantined file does not exist' };
      }

      // Try to read metadata to get original path
      let originalPath: string | null = null;
      const metadataPath = `${filePath}.meta`;

      try {
        const metadataInfo = await FileSystem.getInfoAsync(metadataPath);
        if (metadataInfo.exists) {
          const metadataContent = await FileSystem.readFileAsStringAsync(metadataPath);
          const metadata = JSON.parse(metadataContent);
          originalPath = metadata.originalPath;
          console.log(`📂 Found original path in metadata: ${originalPath}`);
        }
      } catch (metaError) {
        console.warn('⚠️ Could not read metadata file:', metaError);
      }

      // If we have the original path, restore to it
      if (originalPath) {
        try {
          // Check if original location still exists (parent directory)
          const pathParts = originalPath.split('/');
          const parentDir = pathParts.slice(0, -1).join('/');

          // Ensure parent directory exists
          const parentInfo = await FileSystem.getInfoAsync(parentDir);
          if (parentInfo.exists) {
            // Check if a file already exists at original location
            const existingFileInfo = await FileSystem.getInfoAsync(originalPath);
            if (existingFileInfo.exists) {
              console.warn('⚠️ File already exists at original location, restoring with timestamp');
              // Add timestamp to avoid overwriting
              const timestamp = Date.now();
              const newPath = `${originalPath}.restored_${timestamp}`;
              await FileSystem.copyAsync({
                from: filePath,
                to: newPath
              });
              console.log(`✅ File restored to: ${newPath}`);
            } else {
              // Restore to exact original location
              await FileSystem.copyAsync({
                from: filePath,
                to: originalPath
              });
              console.log(`✅ File restored to original location: ${originalPath}`);
            }

            // Delete from quarantine after successful restore
            await FileSystem.deleteAsync(filePath, { idempotent: true });

            // Delete metadata file
            try {
              await FileSystem.deleteAsync(metadataPath, { idempotent: true });
            } catch (err) {
              console.warn('⚠️ Could not delete metadata file');
            }

            return { success: true, filePath: originalPath };
          }
        } catch (restoreError) {
          console.error('❌ Error restoring to original location:', restoreError);
          // Fall through to default restore behavior
        }
      }

      // Fallback: Restore to Documents directory if original path not available
      console.log('📁 Original path not available, restoring to Documents directory');
      const documentsPath = `${FileSystem.documentDirectory}restored_${originalFileName}`;

      try {
        await FileSystem.copyAsync({
          from: filePath,
          to: documentsPath
        });

        // Delete from quarantine
        await FileSystem.deleteAsync(filePath, { idempotent: true });

        // Delete metadata file
        try {
          await FileSystem.deleteAsync(metadataPath, { idempotent: true });
        } catch (err) {
          console.warn('⚠️ Could not delete metadata file');
        }

        console.log(`✅ File restored to Documents: ${documentsPath}`);
        return { success: true, filePath: documentsPath };

      } catch (fallbackError) {
        console.error('❌ Error restoring to Documents:', fallbackError);
        return {
          success: false,
          error: 'Could not restore file to any location'
        };
      }

    } catch (error) {
      console.error('❌ Error restoring quarantined file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * List all quarantined files
   * ✅ NOW: Loads metadata including original path and threat level
   * 🛡️ SECURITY: Validates all files are in quarantine directory
   */
  async listQuarantinedFiles(): Promise<QuarantinedFile[]> {
    try {
      console.log('📋 Listing quarantined files...');

      if (!isExpoFSAvailable || !ExpoFS) {
        console.warn('⚠️ Expo FileSystem not available');
        return [];
      }

      // Use Expo FileSystem
      const dirInfo = await FileSystem.getInfoAsync(this.quarantinePath);
      if (!dirInfo.exists) {
        console.log('📁 Quarantine directory does not exist');
        return [];
      }

      const files = await FileSystem.readDirectoryAsync(this.quarantinePath);
      const quarantinedFiles: QuarantinedFile[] = [];

      for (const fileName of files) {
        try {
          // Skip metadata files
          if (fileName.endsWith('.meta')) {
            continue;
          }

          const filePath = `${this.quarantinePath}${fileName}`;

          // 🛡️ SECURITY: Validate file is actually in quarantine directory
          if (!filePath.startsWith(this.quarantinePath)) {
            console.warn(`⚠️ Skipping file outside quarantine: ${fileName}`);
            continue;
          }

          // Parse filename to extract original name and timestamp
          const timestampMatch = fileName.match(/^(\d+)_(.+)$/);
          if (!timestampMatch) {
            console.warn(`⚠️ Skipping file with invalid naming format: ${fileName}`);
            continue;
          }

          const timestamp = parseInt(timestampMatch[1]);
          const originalFileName = timestampMatch[2].replace(/_/g, ' ');

          // Get file info
          const fileInfo = await FileSystem.getInfoAsync(filePath);

          // ✅ FIXED: Better file size extraction with fallback
          let fileSize = 0;
          if ('size' in fileInfo && fileInfo.size !== undefined && fileInfo.size !== null) {
            fileSize = fileInfo.size;
          } else if (fileInfo.exists && !fileInfo.isDirectory) {
            // Fallback: Try to read the file to get size
            try {
              const fileContent = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
              // Base64 encoding increases size by ~33%, so we need to decode to get actual size
              fileSize = Math.floor((fileContent.length * 3) / 4);
            } catch (sizeError) {
              console.warn(`⚠️ Could not determine size for ${fileName}`);
              fileSize = 0;
            }
          }

          // ✅ CRITICAL FIX: Load metadata to get threat level and details
          let threatLevel: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN' = 'UNKNOWN';
          let threatName: string | undefined;
          let scanEngine = 'Shabari Scanner';
          let details = 'File quarantined via Expo FileSystem';
          let metadata: any = null;

          const metadataPath = `${filePath}.meta`;
          try {
            const metadataInfo = await FileSystem.getInfoAsync(metadataPath);
            if (metadataInfo.exists) {
              // ✅ FIXED: Correct method name
              const metadataContent = await FileSystem.readAsStringAsync(metadataPath);
              metadata = JSON.parse(metadataContent);

              // Extract metadata
              threatLevel = metadata.threatLevel || 'UNKNOWN';
              threatName = metadata.threatName;
              scanEngine = metadata.scanEngine || scanEngine;
              details = metadata.details || details;

              console.log(`📊 Loaded metadata for ${fileName}: threatLevel=${threatLevel}`);
            }
          } catch (metaError) {
            console.warn(`⚠️ Could not load metadata for ${fileName}:`, metaError);
            // Continue with defaults
          }

          quarantinedFiles.push({
            id: fileName,
            fileName,
            originalFileName,
            filePath,
            fileSize: fileSize || 0,
            quarantineDate: new Date(timestamp),
            threatLevel,
            threatName,
            scanEngine,
            details,
            metadata
          });

        } catch (error) {
          console.warn(`⚠️ Error processing quarantined file ${fileName}:`, error);
          // Continue processing other files
        }
      }

      console.log(`📋 Found ${quarantinedFiles.length} quarantined files (Expo FileSystem)`);
      return quarantinedFiles;

    } catch (error) {
      console.error('❌ Error listing quarantined files:', error);
      return [];
    }
  }

  /**
   * Save metadata using Expo FileSystem
   * ✅ NOW: Stores original path for file restoration
   */
  private async saveMetadataExpo(fileName: string, scanResult: any): Promise<void> {
    try {
      const metadata = {
        threatLevel: scanResult.isSafe ? 'SAFE' : (scanResult.threatLevel || 'MALICIOUS'),
        threatName: scanResult.threatName,
        scanEngine: scanResult.scanEngine,
        details: scanResult.details,
        scanTime: scanResult.scanTime || new Date().toISOString(),
        filePath: scanResult.filePath,
        fileSize: scanResult.fileSize,
        originalPath: scanResult.originalPath, // ✅ Store for restoration
        originalFileName: scanResult.originalFileName
      };

      const metadataPath = `${this.quarantinePath}${fileName}.meta`;
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log('💾 Saved quarantine metadata with original path (Expo):', metadataPath);
    } catch (error) {
      console.warn('⚠️ Failed to save quarantine metadata (Expo):', error);
    }
  }
}

export default QuarantineService;

import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import FileQuarantineService from '../services/FileQuarantineService';
import QuarantineService from '../services/QuarantineService';

interface QuarantinedFile {
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
}

const { width: screenWidth } = Dimensions.get('window');

export const QuarantineScreen = () => {
  const [quarantinedFiles, setQuarantinedFiles] = useState<QuarantinedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<QuarantinedFile | null>(null);
  const [showFileDetails, setShowFileDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalFiles: 0,
    safeFiles: 0,
    threats: 0,
    totalSize: 0
  });

  const fileQuarantineService = FileQuarantineService.getInstance();

  // Load quarantined files from the quarantine folder with comprehensive error handling
  const loadQuarantinedFiles = useCallback(async () => {
    console.log('🔍 Starting to load quarantined files...');
    setError(null); // Clear any previous errors

    try {
      const quarantineService = QuarantineService.getInstance();
      const files = await quarantineService.listQuarantinedFiles();

      if (files.length === 0) {
        console.log('📁 No quarantined files found');
        setQuarantinedFiles([]);
        updateStats([]);
        return;
      }

      console.log(`📋 Loaded ${files.length} quarantined files`);

      // Convert to QuarantinedFile format for UI compatibility
      const convertedFiles: QuarantinedFile[] = files.map(file => ({
        id: file.id,
        fileName: file.fileName,
        originalFileName: file.originalFileName,
        filePath: file.filePath,
        fileSize: file.fileSize,
        quarantineDate: file.quarantineDate,
        threatLevel: file.threatLevel as any,
        threatName: file.threatName,
        scanEngine: file.scanEngine,
        details: file.details
      }));

      setQuarantinedFiles(convertedFiles);
      updateStats(convertedFiles);

    } catch (error) {
      console.error('❌ Error loading quarantined files:', error);
      
      // Don't fall back to mock data - show real error instead
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to load quarantine folder: ${errorMessage}`);
      setQuarantinedFiles([]);
      updateStats([]);
      return;
    }
  }, []);

  // Update statistics
  const updateStats = useCallback((files: QuarantinedFile[]) => {
    const newStats = {
      totalFiles: files.length,
      safeFiles: files.filter(f => f.threatLevel === 'SAFE').length,
      threats: files.filter(f => f.threatLevel === 'MALICIOUS').length,
      totalSize: files.reduce((sum, f) => sum + f.fileSize, 0)
    };
    setStats(newStats);
    console.log('📊 Updated stats:', newStats);
  }, []);

  // Load files on component mount with error boundary
  useEffect(() => {
    console.log('🚀 QuarantineScreen mounted, loading files...');
    loadQuarantinedFiles()
      .catch((error) => {
        console.error('❌ Error in useEffect loadQuarantinedFiles:', error);
        setError('Failed to initialize quarantine screen');
      })
      .finally(() => {
        setLoading(false);
        console.log('🏁 Loading completed');
      });
  }, [loadQuarantinedFiles]);

  // Refresh files with error handling
  const onRefresh = useCallback(async () => {
    console.log('🔄 Refreshing quarantine files...');
    setRefreshing(true);
    setError(null);
    try {
      await loadQuarantinedFiles();
    } catch (error) {
      console.error('❌ Error refreshing files:', error);
      setError('Failed to refresh quarantine folder');
    } finally {
      setRefreshing(false);
    }
  }, [loadQuarantinedFiles]);

  // Delete file from quarantine with enhanced error handling
  const deleteFile = async (file: QuarantinedFile) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to permanently delete "${file.originalFileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('🗑️ Attempting to delete file:', file.originalFileName);
            try {
              const quarantineService = QuarantineService.getInstance();
              const result = await quarantineService.deleteQuarantinedFile(file.filePath);

              if (result.success) {
                console.log('✅ File deleted successfully:', file.filePath);

                // Remove from state
                const updatedFiles = quarantinedFiles.filter(f => f.id !== file.id);
                setQuarantinedFiles(updatedFiles);
                updateStats(updatedFiles);

                Alert.alert('Success', 'File deleted successfully');
              } else {
                Alert.alert(
                  'Delete Error',
                  `Failed to delete file: ${result.error}\n\nThe file may still be in the quarantine folder.`,
                  [
                    { text: 'OK' },
                    {
                      text: 'Refresh',
                      onPress: onRefresh
                    }
                  ]
                );
              }
            } catch (error) {
              console.error('❌ Error deleting file:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              Alert.alert(
                'Delete Error',
                `Failed to delete file: ${errorMessage}\n\nThe file may still be in the quarantine folder.`,
                [
                  { text: 'OK' },
                  {
                    text: 'Refresh',
                    onPress: onRefresh
                  }
                ]
              );
            }
          }
        }
      ]
    );
  };

  // Restore safe file (move back to Downloads) with enhanced error handling
  const restoreFile = async (file: QuarantinedFile) => {
    if (file.threatLevel === 'MALICIOUS') {
      Alert.alert(
        'Cannot Restore',
        'This file is malicious and cannot be restored for your safety.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Restore File',
      `Restore "${file.originalFileName}" to Downloads folder?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            console.log('🔄 Attempting to restore file:', file.originalFileName);
            try {
              const quarantineService = QuarantineService.getInstance();
              const result = await quarantineService.restoreQuarantinedFile(
                file.filePath,
                file.originalFileName,
                file.threatLevel
              );

              if (result.success) {
                console.log('✅ File restored successfully:', file.originalFileName);

                // Remove from state
                const updatedFiles = quarantinedFiles.filter(f => f.id !== file.id);
                setQuarantinedFiles(updatedFiles);
                updateStats(updatedFiles);

                Alert.alert('Success', 'File restored to Downloads folder successfully');
              } else {
                Alert.alert(
                  'Restore Error',
                  `Failed to restore file: ${result.error}`,
                  [
                    { text: 'OK' },
                    {
                      text: 'Refresh',
                      onPress: onRefresh
                    }
                  ]
                );
              }
            } catch (error) {
              console.error('❌ Error restoring file:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              Alert.alert(
                'Restore Error',
                `Failed to restore file: ${errorMessage}`,
                [
                  { text: 'OK' },
                  {
                    text: 'Refresh',
                    onPress: onRefresh
                  }
                ]
              );
            }
          }
        }
      ]
    );
  };

  // Test quarantine functionality by creating a test file
  const testQuarantineFunctionality = async () => {
    try {
      Alert.alert(
        'Test Quarantine',
        'This will create a test file and quarantine it to demonstrate real functionality.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Test',
            onPress: async () => {
              console.log('🧪 Testing quarantine functionality...');
              
              try {
                // Create a test file in a writable directory
                const testContent = 'This is a test file for quarantine functionality.';
                const testFileName = `test_file_${Date.now()}.txt`;
                
                // Use the document directory for the test file (writable location)
                const testFilePath = `${FileSystem.documentDirectory}${testFileName}`;
                
                console.log('📝 Creating test file at:', testFilePath);
                
                // Write test file to writable location
                await FileSystem.writeAsStringAsync(testFilePath, testContent);
                console.log('✅ Test file created successfully');
                
                // Process and quarantine the file
                const result = await fileQuarantineService.processSharedFile(testFilePath, testFileName);
                
                if (result.success) {
                  console.log('✅ Test file quarantined successfully');
                  Alert.alert('Success', 'Test file created and quarantined successfully!');
                  
                  // Clean up the original test file
                  try {
                    await FileSystem.deleteAsync(testFilePath, { idempotent: true });
                    console.log('🗑️ Cleaned up original test file');
                  } catch (cleanupError) {
                    console.warn('⚠️ Could not clean up test file:', cleanupError);
                  }
                  
                  // Refresh the quarantine list
                  await loadQuarantinedFiles();
                } else {
                  Alert.alert('Error', `Failed to quarantine test file: ${result.error}`);
                }
              } catch (error) {
                console.error('❌ Error in test quarantine:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                Alert.alert('Error', `Failed to create test file: ${errorMessage}`);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Error in test quarantine:', error);
    }
  };

  // ✅ NEW: Mark file as safe (override threat classification)
  const markAsSafe = async (file: QuarantinedFile) => {
    Alert.alert(
      'Mark as Safe',
      `Mark "${file.originalFileName}" as safe?\n\nThis will override the threat classification and allow you to restore the file.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Safe',
          onPress: async () => {
            console.log('✅ Marking file as safe:', file.originalFileName);
            try {
              const quarantineService = QuarantineService.getInstance();
              const result = await quarantineService.markAsSafe(
                file.filePath,
                file.originalFileName
              );

              if (result.success) {
                console.log('✅ File marked as safe successfully:', file.originalFileName);

                // Reload the file list to show updated threat level
                await loadQuarantinedFiles();

                Alert.alert(
                  'Success',
                  'File marked as safe. You can now restore it if needed.',
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  'Error',
                  `Failed to mark file as safe: ${result.error}`,
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              console.error('❌ Error marking file as safe:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              Alert.alert('Error', `Failed to mark file as safe: ${errorMessage}`);
            }
          }
        }
      ]
    );
  };

  // Clear all safe files with enhanced error handling
  const clearSafeFiles = () => {
    const safeFiles = quarantinedFiles.filter(f => f.threatLevel === 'SAFE');
    if (safeFiles.length === 0) {
      Alert.alert('No Safe Files', 'There are no safe files to clear.');
      return;
    }

    Alert.alert(
      'Clear Safe Files',
      `Delete ${safeFiles.length} safe files from quarantine?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            console.log('🗑️ Clearing', safeFiles.length, 'safe files...');

            const quarantineService = QuarantineService.getInstance();
            let deletedCount = 0;
            let errors: string[] = [];

            try {
              for (const file of safeFiles) {
                try {
                  const result = await quarantineService.deleteQuarantinedFile(file.filePath);

                  if (result.success) {
                    deletedCount++;
                    console.log('✅ Deleted safe file:', file.originalFileName);
                  } else {
                    console.error('❌ Failed to delete file:', file.originalFileName, result.error);
                    errors.push(file.originalFileName);
                  }
                } catch (error) {
                  console.error('❌ Error deleting file:', file.originalFileName, error);
                  errors.push(file.originalFileName);
                }
              }

              // Update state to remove all safe files (even if some deletions failed)
              const updatedFiles = quarantinedFiles.filter(f => f.threatLevel !== 'SAFE');
              setQuarantinedFiles(updatedFiles);
              updateStats(updatedFiles);
              
              // Show result
              if (errors.length === 0) {
                Alert.alert('Success', `${deletedCount} safe files cleared successfully`);
              } else {
                Alert.alert(
                  'Partial Success',
                  `${deletedCount} files cleared successfully.\n${errors.length} files could not be deleted: ${errors.join(', ')}`,
                  [
                    { text: 'OK' },
                    {
                      text: 'Refresh',
                      onPress: onRefresh
                    }
                  ]
                );
              }

            } catch (error) {
              console.error('❌ Critical error clearing safe files:', error);
              Alert.alert(
                'Clear Error',
                'Failed to clear safe files. Please try again.',
                [
                  { text: 'OK' },
                  {
                    text: 'Refresh',
                    onPress: onRefresh
                  }
                ]
              );
            }
          }
        }
      ]
    );
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
  };

  // Get threat level icon and color
  const getThreatDisplay = (threatLevel: QuarantinedFile['threatLevel']) => {
    switch (threatLevel) {
      case 'SAFE':
        return { icon: '✅', color: '#4ecdc4', label: 'Safe' };
      case 'SUSPICIOUS':
        return { icon: '⚠️', color: '#ffa726', label: 'Suspicious' };
      case 'MALICIOUS':
        return { icon: '🚨', color: '#ef5350', label: 'Malicious' };
      default:
        return { icon: '❓', color: '#9e9e9e', label: 'Unknown' };
    }
  };

  // Render file item
  const renderFileItem = (file: QuarantinedFile) => {
    const threat = getThreatDisplay(file.threatLevel);
    
    return (
      <TouchableOpacity
        key={file.id}
        style={[styles.fileItem, { borderLeftColor: threat.color }]}
        onPress={() => {
          setSelectedFile(file);
          setShowFileDetails(true);
        }}
      >
        <View style={styles.fileHeader}>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>
              {file.originalFileName}
            </Text>
            <Text style={styles.fileDetails}>
              {formatFileSize(file.fileSize)} • {formatDate(file.quarantineDate)}
            </Text>
          </View>
          <View style={[styles.threatBadge, { backgroundColor: threat.color }]}>
            <Text style={styles.threatIcon}>{threat.icon}</Text>
          </View>
        </View>
        <View style={styles.fileActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => deleteFile(file)}
          >
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
          {file.threatLevel === 'SAFE' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.restoreButton]}
              onPress={() => restoreFile(file)}
            >
              <Text style={styles.actionButtonText}>Restore</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render file details modal
  const renderFileDetailsModal = () => {
    if (!selectedFile) return null;
    
    const threat = getThreatDisplay(selectedFile.threatLevel);
    
    return (
      <Modal
        visible={showFileDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFileDetails(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>File Details</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowFileDetails(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>File Name</Text>
              <Text style={styles.detailValue}>{selectedFile.originalFileName}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Threat Level</Text>
              <View style={styles.threatDisplay}>
                <Text style={styles.threatIcon}>{threat.icon}</Text>
                <Text style={[styles.threatLabel, { color: threat.color }]}>
                  {threat.label}
                </Text>
              </View>
            </View>
            
            {selectedFile.threatName && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Threat Name</Text>
                <Text style={[styles.detailValue, { color: '#ef5350' }]}>
                  {selectedFile.threatName}
                </Text>
              </View>
            )}
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>File Size</Text>
              <Text style={styles.detailValue}>
                {formatFileSize(selectedFile.fileSize)}
              </Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Quarantined</Text>
              <Text style={styles.detailValue}>
                {selectedFile.quarantineDate.toLocaleString()}
              </Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Scan Engine</Text>
              <Text style={styles.detailValue}>{selectedFile.scanEngine}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Details</Text>
              <Text style={styles.detailDescription}>{selectedFile.details}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>File Path</Text>
              <Text style={[styles.detailValue, styles.pathText]}>
                {selectedFile.filePath}
              </Text>
            </View>
          </ScrollView>
          
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalActionButton, styles.deleteButton]}
              onPress={() => {
                setShowFileDetails(false);
                deleteFile(selectedFile);
              }}
            >
              <Text style={styles.actionButtonText}>Delete File</Text>
            </TouchableOpacity>
            
            {selectedFile.threatLevel === 'SAFE' ? (
              <TouchableOpacity
                style={[styles.modalActionButton, styles.restoreButton]}
                onPress={() => {
                  setShowFileDetails(false);
                  restoreFile(selectedFile);
                }}
              >
                <Text style={styles.actionButtonText}>Restore File</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.modalActionButton, styles.markSafeButton]}
                onPress={() => {
                  setShowFileDetails(false);
                  markAsSafe(selectedFile);
                }}
              >
                <Text style={styles.actionButtonText}>Mark as Safe</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Quarantine" showBack={true} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ecdc4" />
          <Text style={styles.loadingText}>Loading quarantine folder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Quarantine Folder" showBack={true} />
      
      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.totalFiles}</Text>
          <Text style={styles.statLabel}>Total Files</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#4ecdc4' }]}>
            {stats.safeFiles}
          </Text>
          <Text style={styles.statLabel}>Safe</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#ef5350' }]}>
            {stats.threats}
          </Text>
          <Text style={styles.statLabel}>Threats</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{formatFileSize(stats.totalSize)}</Text>
          <Text style={styles.statLabel}>Total Size</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.testButton} onPress={testQuarantineFunctionality}>
          <Text style={styles.testButtonText}>Test Quarantine</Text>
        </TouchableOpacity>
        {quarantinedFiles.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={clearSafeFiles}>
            <Text style={styles.clearButtonText}>Clear Safe Files</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to Access Quarantine Folder</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* File list */}
      <ScrollView
        style={styles.fileList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4ecdc4"
            colors={['#4ecdc4']}
          />
        }
      >
        {!error && quarantinedFiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📁</Text>
            <Text style={styles.emptyTitle}>Quarantine Folder Empty</Text>
            <Text style={styles.emptyDescription}>
              Files shared with Shabari are automatically quarantined here for security analysis.
              When you share files to the app, they will appear here.
            </Text>
          </View>
        ) : !error ? (
          quarantinedFiles.map(renderFileItem)
        ) : null}
      </ScrollView>

      {renderFileDetailsModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 12,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  testButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#ffa726',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ef5350',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorTitle: {
    color: '#c62828',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#d32f2f',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#ef5350',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fileList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 40,
  },
  debugInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#333344',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  debugText: {
    color: '#ffa726',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#16213e',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  detailSection: {
    marginVertical: 12,
  },
  detailLabel: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 16,
  },
  detailDescription: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  pathText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#cccccc',
  },
  threatDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  threatLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#16213e',
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  fileItem: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  fileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  fileInfo: {
    flex: 1,
    marginRight: 12,
  },
  fileName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  fileDetails: {
    color: '#cccccc',
    fontSize: 12,
  },
  threatBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  threatIcon: {
    fontSize: 16,
  },
  fileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ef5350',
  },
  restoreButton: {
    backgroundColor: '#4ecdc4',
  },
  markSafeButton: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});


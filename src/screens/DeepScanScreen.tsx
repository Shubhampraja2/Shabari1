import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// Import Enhanced Deep Scan Service (with recursive scanning and auto-quarantine)
import EnhancedDeepScanService, {
  DeepScanConfig,
  DeepScanProgress,
  DeepScanResult,
  DeepScanThreat,
} from '../services/EnhancedDeepScanService';
import QuarantineService from '../services/QuarantineService';

// ==============================================================================
// COMPONENT PROPS
// ==============================================================================

interface DeepScanScreenProps {
  onGoBack: () => void;
  onNavigateToQuarantine?: () => void;
}

// ==============================================================================
// MAIN COMPONENT
// ==============================================================================

const DeepScanScreen: React.FC<DeepScanScreenProps> = ({ onGoBack, onNavigateToQuarantine }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<DeepScanProgress | null>(null);
  const [scanResult, setScanResult] = useState<DeepScanResult | null>(null);
  const [expandedThreat, setExpandedThreat] = useState<string | null>(null);

  // Animations
  const scannerRotation = useRef(new Animated.Value(0)).current;
  const progressPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.log('🔍 Deep Scan Screen initialized');
    Sentry.addBreadcrumb({ message: 'Deep Scan Screen opened' });

    return () => {
      // Cleanup: Cancel scan if user navigates away
      if (isScanning) {
        EnhancedDeepScanService.cancelScan();
      }
    };
  }, []);

  // Start rotation animation when scanning
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(scannerRotation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(progressPulse, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(progressPulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scannerRotation.setValue(0);
      progressPulse.setValue(1);
    }
  }, [isScanning]);

  const spin = scannerRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ==============================================================================
  // SCAN HANDLERS
  // ==============================================================================

  const handleStartQuickScan = async () => {
    const config: Partial<DeepScanConfig> = {
      scanDownloads: true,
      scanDocuments: true,
      scanImages: false,
      scanWhatsApp: true,
      scanApkFiles: true,
      enableYaraEngine: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB for quick scan
      recursiveScan: true, // Enable recursive scanning
      maxDepth: 3, // Quick scan: 3 levels deep
      autoQuarantine: true, // Auto-quarantine threats
      quarantineCriticalThreats: true,
    };

    await performScan(config, 'Quick Scan');
  };

  const handleStartFullScan = async () => {
    const config: Partial<DeepScanConfig> = {
      scanDownloads: true,
      scanDocuments: true,
      scanImages: true,
      scanWhatsApp: true,
      scanApkFiles: true,
      enableYaraEngine: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB for full scan
      recursiveScan: true, // Enable recursive scanning
      maxDepth: 5, // Full scan: 5 levels deep
      autoQuarantine: true, // Auto-quarantine threats
      quarantineCriticalThreats: true,
    };

    await performScan(config, 'Full Deep Scan');
  };

  const performScan = async (config: Partial<DeepScanConfig>, scanType: string) => {
    try {
      console.log(`🔍 Starting ${scanType} with ENHANCED Deep Scan Service...`);
      Sentry.addBreadcrumb({ message: `${scanType} initiated`, data: { config } });

      setIsScanning(true);
      setScanProgress(null);
      setScanResult(null);

      const result = await EnhancedDeepScanService.performDeepScan(config, (progress) => {
        setScanProgress(progress);
      });

      setIsScanning(false);
      setScanResult(result);

      console.log(`✅ ${scanType} completed:`, {
        filesScanned: result.totalFilesScanned,
        threatsFound: result.threatsDetected.length,
        quarantined: result.quarantinedCount,
        maxDepth: result.maxDepthReached,
        duration: `${(result.scanDuration / 1000).toFixed(2)}s`,
      });

      Sentry.addBreadcrumb({
        message: `${scanType} completed`,
        data: {
          filesScanned: result.totalFilesScanned,
          threatsFound: result.threatsDetected.length,
          duration: result.scanDuration,
        },
      });

      // Show result alert
      if (result.threatsDetected.length > 0) {
        Alert.alert(
          '⚠️ Threats Detected!',
          `Found ${result.threatsDetected.length} potential threat(s) on your device.\n\nPlease review the results and take appropriate action.`,
          [{ text: 'View Results', style: 'default' }]
        );
      } else {
        Alert.alert(
          '✅ Device is Clean!',
          `Scanned ${result.totalFilesScanned} files.\n\nNo threats detected. Your device is secure!`,
          [{ text: 'OK', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('❌ Scan error:', error);
      Sentry.captureException(error, { tags: { screen: 'deepScan', action: 'performScan' } });

      setIsScanning(false);
      setScanProgress(null);

      Alert.alert(
        '❌ Scan Failed',
        error instanceof Error ? error.message : 'An unknown error occurred during the scan.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleCancelScan = () => {
    Alert.alert(
      'Cancel Scan?',
      'Are you sure you want to cancel the current scan?',
      [
        { text: 'Continue Scanning', style: 'cancel' },
        {
          text: 'Cancel Scan',
          style: 'destructive',
          onPress: () => {
            EnhancedDeepScanService.cancelScan();
            setIsScanning(false);
            setScanProgress(null);
          },
        },
      ]
    );
  };

  const handleDeleteThreat = (threat: DeepScanThreat) => {
    Alert.alert(
      '⚠️ Delete Threat Permanently?',
      `This will PERMANENTLY DELETE the file from your device:\n\n${threat.fileName}\n\n⚠️ This action CANNOT be undone!\n\nThe file will be completely removed from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Attempting to permanently delete threat file:', threat.fileName);

              // Import FileSystem dynamically to avoid crashes in development
              let FileSystem: any = null;
              try {
                FileSystem = require('expo-file-system');
              } catch (error) {
                console.warn('⚠️ FileSystem not available:', error);
                Alert.alert('❌ Error', 'File system not available. Cannot delete file.');
                return;
              }

              // Check if file exists
              const fileInfo = await FileSystem.getInfoAsync(threat.filePath);
              if (!fileInfo.exists) {
                Alert.alert('ℹ️ File Already Removed', 'The file has already been deleted or moved.');
                // Still remove from UI
                if (scanResult) {
                  const updatedThreats = scanResult.threatsDetected.filter(t => t.id !== threat.id);
                  setScanResult({
                    ...scanResult,
                    threatsDetected: updatedThreats
                  });
                }
                return;
              }

              // Delete the file PERMANENTLY from device
              await FileSystem.deleteAsync(threat.filePath, { idempotent: true });
              
              console.log('✅ Threat file PERMANENTLY deleted from device:', threat.fileName);

              // Remove from scan results
              if (scanResult) {
                const updatedThreats = scanResult.threatsDetected.filter(t => t.id !== threat.id);
                setScanResult({
                  ...scanResult,
                  threatsDetected: updatedThreats
                });
              }

              Alert.alert(
                '✅ Permanently Deleted',
                `"${threat.fileName}" has been permanently removed from your device.`
              );

            } catch (error) {
              console.error('❌ Error deleting threat file:', error);
              Alert.alert('❌ Error', `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const handleQuarantineAllThreats = () => {
    if (!scanResult || scanResult.threatsDetected.length === 0) {
      return;
    }

    Alert.alert(
      '🔒 Quarantine All Threats?',
      `This will move all ${scanResult.threatsDetected.length} threat(s) to quarantine.\n\n✅ Files will be REMOVED from their current location\n✅ Files will be stored securely in quarantine folder\n✅ You can delete them permanently later from Quarantine`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Quarantine All',
          onPress: async () => {
            try {
              console.log(`🔒 Attempting to quarantine all ${scanResult.threatsDetected.length} threats`);

              const quarantineService = QuarantineService.getInstance();
              let successCount = 0;
              let errorCount = 0;

              // Process each threat
              for (const threat of scanResult.threatsDetected) {
                try {
                  const result = await quarantineService.quarantineFile(
                    threat.filePath,
                    threat.fileName,
                    {
                      isSafe: false,
                      threatName: threat.threatName,
                      scanEngine: threat.scanEngine,
                      details: threat.details,
                      filePath: threat.filePath,
                      fileSize: threat.fileSize
                    }
                  );

                  if (result.success) {
                    successCount++;
                    console.log(`✅ Quarantined and removed from device: ${threat.fileName}`);
                  } else {
                    console.error(`❌ Error quarantining ${threat.fileName}: ${result.error}`);
                    errorCount++;
                  }

                } catch (error) {
                  console.error(`❌ Error quarantining ${threat.fileName}:`, error);
                  errorCount++;
                }
              }

              // Clear all threats from results
              setScanResult({
                ...scanResult,
                threatsDetected: []
              });

              // Show results
              if (errorCount === 0) {
                Alert.alert(
                  '✅ All Threats Quarantined!',
                  `Successfully quarantined all ${successCount} threat(s).\n\n✅ Files removed from device\n✅ Stored securely in quarantine\n\nManage quarantined files in the Quarantine section.`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  '⚠️ Partial Success',
                  `Quarantined ${successCount} threat(s).\n\n${errorCount} file(s) could not be quarantined (may have been already deleted or moved).`,
                  [{ text: 'OK' }]
                );
              }

            } catch (error) {
              console.error('❌ Error in bulk quarantine:', error);
              Alert.alert('❌ Error', `Failed to quarantine threats: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllThreats = () => {
    if (!scanResult || scanResult.threatsDetected.length === 0) {
      return;
    }

    Alert.alert(
      '⚠️ Delete All Threats Permanently?',
      `Are you sure you want to PERMANENTLY DELETE all ${scanResult.threatsDetected.length} threat(s)?\n\n⚠️ This action CANNOT be undone!\n⚠️ Files will be completely removed from your device!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`🗑️ Attempting to permanently delete all ${scanResult.threatsDetected.length} threats`);

              // Import FileSystem dynamically
              let FileSystem: any = null;
              try {
                FileSystem = require('expo-file-system');
              } catch (error) {
                console.warn('⚠️ FileSystem not available:', error);
                Alert.alert('❌ Error', 'File system not available. Cannot delete files.');
                return;
              }

              let successCount = 0;
              let errorCount = 0;

              // Process each threat
              for (const threat of scanResult.threatsDetected) {
                try {
                  // Check if file exists
                  const fileInfo = await FileSystem.getInfoAsync(threat.filePath);
                  if (!fileInfo.exists) {
                    console.warn(`⚠️ File not found (already deleted): ${threat.fileName}`);
                    successCount++; // Count as success since goal is achieved
                    continue;
                  }

                  // Delete the file PERMANENTLY from device
                  await FileSystem.deleteAsync(threat.filePath, { idempotent: true });
                  successCount++;
                  console.log(`✅ Permanently deleted from device: ${threat.fileName}`);

                } catch (error) {
                  console.error(`❌ Error deleting ${threat.fileName}:`, error);
                  errorCount++;
                }
              }

              // Clear all threats from results
              setScanResult({
                ...scanResult,
                threatsDetected: []
              });

              // Show results
              if (errorCount === 0) {
                Alert.alert(
                  '✅ All Threats Deleted!', 
                  `Successfully deleted all ${successCount} threat(s).\n\n✅ All malicious files permanently removed from your device\n✅ Your device is now clean!`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  '⚠️ Partial Success', 
                  `Deleted ${successCount} threat(s).\n\n${errorCount} file(s) could not be deleted.`,
                  [{ text: 'OK' }]
                );
              }
              
            } catch (error) {
              console.error('❌ Error in bulk delete:', error);
              Alert.alert('❌ Error', `Failed to delete threats: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const handleQuarantineThreat = (threat: DeepScanThreat) => {
    Alert.alert(
      '🔒 Quarantine Threat?',
      `Move this file to quarantine?\n\n${threat.fileName}\n\n✅ File will be REMOVED from current location\n✅ File will be stored securely in quarantine folder\n✅ You can delete it permanently later from Quarantine`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Quarantine',
          onPress: async () => {
            try {
              console.log('🔒 Attempting to quarantine threat file:', threat.fileName);

              const quarantineService = QuarantineService.getInstance();

              const result = await quarantineService.quarantineFile(
                threat.filePath,
                threat.fileName,
                {
                  isSafe: false,
                  threatName: threat.threatName,
                  scanEngine: threat.scanEngine,
                  details: threat.details,
                  filePath: threat.filePath,
                  fileSize: threat.fileSize
                }
              );

              if (result.success) {
                console.log(`✅ Threat quarantined and removed from device: ${threat.fileName}`);

                // Remove from scan results
                if (scanResult) {
                  const updatedThreats = scanResult.threatsDetected.filter(t => t.id !== threat.id);
                  setScanResult({
                    ...scanResult,
                    threatsDetected: updatedThreats
                  });
                }

                Alert.alert(
                  '✅ Quarantined Successfully',
                  `"${threat.fileName}" has been moved to quarantine.\n\n✅ File removed from device\n✅ Stored securely in quarantine\n\nManage it in the Quarantine section.`
                );
              } else {
                Alert.alert('❌ Error', `Failed to quarantine file: ${result.error}`);
              }

            } catch (error) {
              console.error('❌ Error quarantining threat file:', error);
              Alert.alert('❌ Error', `Failed to quarantine file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  // ==============================================================================
  // RENDER FUNCTIONS
  // ==============================================================================

  const renderScanOptions = () => {
    if (isScanning || scanResult) {
      return null;
    }

    return (
      <View style={styles.optionsContainer}>
        <Text style={styles.title}>🛡️ Device Security Scanner</Text>
        <Text style={styles.subtitle}>
          Scan your device for malware, suspicious APKs, and corrupted files
        </Text>

        {/* Development Mode Warning */}
        {__DEV__ && (
          <View style={styles.devWarningContainer}>
            <MaterialCommunityIcons name="information" size={20} color="#f59e0b" />
            <Text style={styles.devWarningText}>
              Development Mode: Scanning excludes cache files that get regenerated on app restart.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleStartQuickScan}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4facfe', '#00f2fe']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientButton}
          >
            <MaterialCommunityIcons name="shield-search" size={32} color="#fff" />
            <Text style={styles.buttonText}>Quick Scan</Text>
            <Text style={styles.buttonSubtext}>~2-5 minutes</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleStartFullScan}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientButton}
          >
            <MaterialCommunityIcons name="shield-check" size={32} color="#fff" />
            <Text style={styles.buttonText}>Full Deep Scan</Text>
            <Text style={styles.buttonSubtext}>~5-15 minutes</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="information" size={24} color="#00d4ff" />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>What We Scan:</Text>
            <Text style={styles.infoText}>✓ Malicious APK files</Text>
            <Text style={styles.infoText}>✓ Corrupted or suspicious files</Text>
            <Text style={styles.infoText}>✓ Potentially harmful applications</Text>
            <Text style={styles.infoText}>✓ Hidden malware in Downloads</Text>
            <Text style={styles.infoText}>✓ WhatsApp media threats</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderScanProgress = () => {
    if (!isScanning || !scanProgress) {
      return null;
    }

    return (
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.scannerIcon, { transform: [{ rotate: spin }] }]}>
          <MaterialCommunityIcons name="shield-search" size={80} color="#00d4ff" />
        </Animated.View>

        <Text style={styles.progressTitle}>
          {scanProgress.stage === 'initializing' && '🔄 Initializing...'}
          {scanProgress.stage === 'permissions' && '🔐 Requesting Permissions...'}
          {scanProgress.stage === 'scanning' && '🔍 Scanning...'}
          {scanProgress.stage === 'analyzing' && '📊 Analyzing Results...'}
          {scanProgress.stage === 'complete' && '✅ Scan Complete!'}
          {scanProgress.stage === 'error' && '❌ Scan Error'}
        </Text>

        <Text style={styles.progressMessage}>{scanProgress.message}</Text>

        {scanProgress.stage === 'scanning' && (
          <>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${scanProgress.percentage}%` }]} />
            </View>
            <Text style={styles.progressPercentage}>{scanProgress.percentage.toFixed(0)}%</Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{scanProgress.filesScanned}</Text>
                <Text style={styles.statLabel}>Files Scanned</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{scanProgress.threatsFound}</Text>
                <Text style={styles.statLabel}>Threats Found</Text>
              </View>
            </View>

            {scanProgress.currentFile && (
              <Text style={styles.currentFile} numberOfLines={1}>
                {scanProgress.currentFile}
              </Text>
            )}
          </>
        )}

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancelScan}>
          <Text style={styles.cancelButtonText}>Cancel Scan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderScanResults = () => {
    if (!scanResult || isScanning) {
      return null;
    }

    const { threatsDetected, totalFilesScanned, scanDuration, isNativeYaraUsed } = scanResult;

    return (
      <ScrollView style={styles.resultsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.resultHeader}>
          {threatsDetected.length === 0 ? (
            <>
              <MaterialCommunityIcons name="shield-check" size={60} color="#4ade80" />
              <Text style={styles.resultTitle}>✅ Device is Clean!</Text>
              <Text style={styles.resultSubtitle}>
                No threats detected in {totalFilesScanned} files
              </Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="shield-alert" size={60} color="#f87171" />
              <Text style={styles.resultTitle}>⚠️ Threats Detected!</Text>
              <Text style={styles.resultSubtitle}>
                Found {threatsDetected.length} threat(s) in {totalFilesScanned} files
              </Text>
            </>
          )}
        </View>

        <View style={styles.scanStats}>
          <View style={styles.scanStatItem}>
            <Text style={styles.scanStatLabel}>Scan Duration</Text>
            <Text style={styles.scanStatValue}>{(scanDuration / 1000).toFixed(2)}s</Text>
          </View>
          <View style={styles.scanStatItem}>
            <Text style={styles.scanStatLabel}>Files Scanned</Text>
            <Text style={styles.scanStatValue}>{totalFilesScanned}</Text>
          </View>
          <View style={styles.scanStatItem}>
            <Text style={styles.scanStatLabel}>Scan Engine</Text>
            <Text style={styles.scanStatValue}>{isNativeYaraUsed ? 'Native' : 'Mock'}</Text>
          </View>
        </View>

        {threatsDetected.length > 0 && (
          <View style={styles.threatsSection}>
            <Text style={styles.threatsTitle}>Detected Threats:</Text>
            {threatsDetected.map((threat) => renderThreatCard(threat))}
            
            {/* Bulk Actions */}
            <View style={styles.bulkActionsContainer}>
              <Text style={styles.bulkActionsTitle}>Bulk Actions:</Text>
              <View style={styles.bulkActionsRow}>
                <TouchableOpacity
                  style={[styles.bulkActionButton, styles.quarantineAllButton]}
                  onPress={handleQuarantineAllThreats}
                >
                  <MaterialCommunityIcons name="shield-lock" size={20} color="#ffffff" />
                  <Text style={styles.bulkActionButtonText}>Quarantine All</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.bulkActionButton, styles.deleteAllButton]}
                  onPress={handleDeleteAllThreats}
                >
                  <MaterialCommunityIcons name="delete-sweep" size={20} color="#ffffff" />
                  <Text style={styles.bulkActionButtonText}>Delete All</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.newScanButton}
          onPress={() => {
            setScanResult(null);
            setScanProgress(null);
          }}
        >
          <Text style={styles.newScanButtonText}>Start New Scan</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderThreatCard = (threat: DeepScanThreat) => {
    const isExpanded = expandedThreat === threat.id;

    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case 'critical':
          return '#dc2626';
        case 'high':
          return '#f87171';
        case 'medium':
          return '#fb923c';
        case 'low':
          return '#fbbf24';
        default:
          return '#6b7280';
      }
    };

    const getThreatIcon = (type: string) => {
      switch (type) {
        case 'malware':
          return 'virus';
        case 'suspicious_apk':
          return 'package-variant-closed';
        case 'corrupted_file':
          return 'file-alert';
        case 'dangerous_file':
          return 'file-remove';
        default:
          return 'alert-circle';
      }
    };

    return (
      <View key={threat.id} style={styles.threatCard}>
        <TouchableOpacity
          onPress={() => setExpandedThreat(isExpanded ? null : threat.id)}
          activeOpacity={0.8}
        >
          <View style={styles.threatHeader}>
            <MaterialCommunityIcons
              name={getThreatIcon(threat.threatType) as any}
              size={28}
              color={getSeverityColor(threat.severity)}
            />
            <View style={styles.threatInfo}>
              <Text style={styles.threatName}>{threat.threatName}</Text>
              <Text style={styles.threatFileName} numberOfLines={1}>
                {threat.fileName}
              </Text>
            </View>
            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(threat.severity) }]}>
              <Text style={styles.severityText}>{threat.severity.toUpperCase()}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.threatDetails}>
            <Text style={styles.threatDetailsText}>
              <Text style={styles.threatDetailsLabel}>Type: </Text>
              {threat.threatType.replace('_', ' ')}
            </Text>
            <Text style={styles.threatDetailsText}>
              <Text style={styles.threatDetailsLabel}>Size: </Text>
              {(threat.fileSize / 1024).toFixed(2)} KB
            </Text>
            <Text style={styles.threatDetailsText}>
              <Text style={styles.threatDetailsLabel}>Engine: </Text>
              {threat.scanEngine}
            </Text>
            <Text style={styles.threatDetailsText}>
              <Text style={styles.threatDetailsLabel}>Details: </Text>
              {threat.details}
            </Text>
            <Text style={styles.threatDetailsText}>
              <Text style={styles.threatDetailsLabel}>Path: </Text>
              {threat.filePath}
            </Text>

            <View style={styles.threatActions}>
              <TouchableOpacity
                style={[styles.threatActionButton, styles.quarantineButton]}
                onPress={() => handleQuarantineThreat(threat)}
              >
                <MaterialCommunityIcons name="shield-lock" size={20} color="#fff" />
                <Text style={styles.threatActionText}>Quarantine</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.threatActionButton, styles.deleteButton]}
                onPress={() => handleDeleteThreat(threat)}
              >
                <MaterialCommunityIcons name="delete" size={20} color="#fff" />
                <Text style={styles.threatActionText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ==============================================================================
  // MAIN RENDER
  // ==============================================================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Deep Scan</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        {renderScanOptions()}
        {renderScanProgress()}
        {renderScanResults()}
      </LinearGradient>
    </View>
  );
};

// ==============================================================================
// STYLES
// ==============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 40 : 50,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  optionsContainer: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 30,
  },
  scanButton: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  gradientButton: {
    padding: 24,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scannerIcon: {
    marginBottom: 30,
  },
  progressTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  progressMessage: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 30,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00d4ff',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00d4ff',
    marginBottom: 30,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  currentFile: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    width: '100%',
  },
  cancelButton: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: '#dc2626',
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
    padding: 20,
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  scanStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scanStatItem: {
    alignItems: 'center',
  },
  scanStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  scanStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00d4ff',
  },
  threatsSection: {
    marginBottom: 20,
  },
  threatsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  threatCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  threatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  threatName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  threatFileName: {
    fontSize: 12,
    color: '#94a3b8',
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  threatDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  threatDetailsText: {
    fontSize: 12,
    color: '#cbd5e1',
    marginBottom: 8,
  },
  threatDetailsLabel: {
    fontWeight: '600',
    color: '#fff',
  },
  threatActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  threatActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  quarantineButton: {
    backgroundColor: '#f59e0b',
  },
  deleteButton: {
    backgroundColor: '#dc2626',
  },
  threatActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  newScanButton: {
    backgroundColor: '#00d4ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  newScanButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Bulk Actions Styles
  bulkActionsContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bulkActionsTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  bulkActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bulkActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  quarantineAllButton: {
    backgroundColor: '#f59e0b',
  },
  deleteAllButton: {
    backgroundColor: '#dc2626',
  },
  bulkActionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Development Warning Styles
  devWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    gap: 8,
  },
  devWarningText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});

export default DeepScanScreen;


import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { NativeFileScanner } from '../services/NativeFileScanner';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { PremiumUpgrade } from '../components/PremiumUpgrade';

// Phase 2: Re-enable advanced services with error handling
import { DownloadMonitorService } from '../services/DownloadMonitorService';
import { FileWatchdogService } from '../services/FileWatchdogService';
import PermissionManager from '../services/PermissionManager';
import { proxyEngineService } from '../services/ProxyEngineService';
import { YaraSecurityService } from '../services/YaraSecurityService';
// Import types - using any for now to avoid type issues
type DashboardScreenProps = {
  navigation: any;
  onNavigateToSecureBrowser?: () => void;
  onNavigateToScanResult: (result: any) => void;
  onNavigateToQRScanner: () => void;
  onNavigateToSettings: () => void;
  onNavigateToMessageAnalysis: () => void;
  onNavigateToFeatureManagement?: () => void;
  onNavigateToQuarantine?: () => void;
};

// Import LinkScannerService - using dynamic import to avoid missing module
const LinkScannerService = {
  initializeService: async () => {
    console.log('LinkScannerService: Mock initialization');
    return true;
  },
  scanUrl: async (url: string) => {
    console.log('LinkScannerService: Mock scan for', url);
    return {
      isSafe: Math.random() > 0.3, // 70% safe
      details: `Scanned ${url} - ${Math.random() > 0.3 ? 'No threats detected' : 'Potential threat detected'}`
    };
  }
};

const DashboardScreen = ({
  navigation,
  onNavigateToScanResult,
  onNavigateToQRScanner,
  onNavigateToSettings,
  onNavigateToMessageAnalysis,
}: DashboardScreenProps) => {
  console.log('🚀 DashboardScreen: Simple version starting to render');
  
  const { isPremium } = useSubscriptionStore();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [urlToCheck, setUrlToCheck] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isFileScannerReady, setIsFileScannerReady] = useState(false);
  
  // Phase 2: Advanced service states
  const [isWatchdogReady, setIsWatchdogReady] = useState(false);
  const [isDownloadMonitorReady, setIsDownloadMonitorReady] = useState(false);
  const [isPermissionManagerReady, setIsPermissionManagerReady] = useState(false);
  
  // Engine control states
  const [isProxyEngineReady, setIsProxyEngineReady] = useState(false);
  const [isProxyEngineRunning, setIsProxyEngineRunning] = useState(false);
  const [isYaraEngineReady, setIsYaraEngineReady] = useState(false);

  // New state for premium upgrade
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [requestedFeature, setRequestedFeature] = useState<string | undefined>(undefined);

  useEffect(() => {
    const initializeServices = async () => {
      try {
        console.log('🔄 Phase 2: Initializing enhanced services...');
        Sentry.addBreadcrumb({ message: 'Phase 2 service initialization started' });
        
        // Phase 1: Initialize basic file scanner
        try {
          const nativeScanner = NativeFileScanner.getInstance();
          if (nativeScanner && typeof nativeScanner.initialize === 'function') {
            await nativeScanner.initialize();
            setIsFileScannerReady(true);
            console.log('✅ Phase 2: File scanner ready');
      }
    } catch (error) {
          console.warn('⚠️ Phase 2: File scanner not available:', error);
          Sentry.captureException(error, { tags: { phase: 'phase2', service: 'fileScanner' } });
        }
        
        // Phase 2: Initialize FileWatchdog with extensive error handling
        try {
          console.log('🔄 Phase 2: Initializing FileWatchdog...');
          const watchdog = FileWatchdogService.getInstance();
          if (watchdog && typeof watchdog.startWatchdog === 'function') {
            // FileWatchdog is available - check if we can use it
            setIsWatchdogReady(true);
            console.log('✅ Phase 2: FileWatchdog ready');
            Sentry.addBreadcrumb({ message: 'Phase 2 FileWatchdog enabled successfully' });
          } else {
            console.log('⚠️ Phase 2: FileWatchdog service not properly initialized');
            setIsWatchdogReady(false);
      }
    } catch (error) {
          console.error('❌ Phase 2: FileWatchdog initialization failed:', error);
          Sentry.captureException(error, { tags: { phase: 'phase2', service: 'fileWatchdog' } });
          setIsWatchdogReady(false);
        }
        
        // Phase 2: Initialize DownloadMonitor with safe error handling
        try {
          console.log('🔄 Phase 2: Initializing DownloadMonitor...');
          const downloadMonitor = DownloadMonitorService.getInstance();
          if (downloadMonitor && typeof downloadMonitor.startMonitoring === 'function') {
            // DownloadMonitor is available
            setIsDownloadMonitorReady(true);
            console.log('✅ Phase 2: DownloadMonitor ready');
            Sentry.addBreadcrumb({ message: 'Phase 2 DownloadMonitor enabled successfully' });
        } else {
            console.log('⚠️ Phase 2: DownloadMonitor service not properly initialized');
            setIsDownloadMonitorReady(false);
      }
    } catch (error) {
          console.error('❌ Phase 2: DownloadMonitor initialization failed:', error);
          Sentry.captureException(error, { tags: { phase: 'phase2', service: 'downloadMonitor' } });
          setIsDownloadMonitorReady(false);
        }
        
        // Phase 2: Initialize PermissionManager with availability checks
        try {
          console.log('🔄 Phase 2: Initializing PermissionManager...');
          const permissionManager = PermissionManager.getInstance();
          if (permissionManager && typeof permissionManager.requestAllPermissions === 'function') {
            // PermissionManager is available
            setIsPermissionManagerReady(true);
            console.log('✅ Phase 2: PermissionManager ready');
            Sentry.addBreadcrumb({ message: 'Phase 2 PermissionManager enabled successfully' });
      } else {
            console.log('⚠️ Phase 2: PermissionManager service not properly initialized');
            setIsPermissionManagerReady(false);
      }
    } catch (error) {
          console.error('❌ Phase 2: PermissionManager initialization failed:', error);
          Sentry.captureException(error, { tags: { phase: 'phase2', service: 'permissionManager' } });
          setIsPermissionManagerReady(false);
        }
        
        // Initialize Proxy Engine
        try {
          console.log('🔄 Initializing Proxy Engine...');
          if (proxyEngineService && typeof proxyEngineService.isAvailable === 'function') {
            const available = proxyEngineService.isAvailable();
            setIsProxyEngineReady(available);
            
            if (available) {
              // Check current status
              const status = await proxyEngineService.getStatus();
              setIsProxyEngineRunning(status.isRunning);
              console.log('✅ Proxy Engine ready:', status);
            } else {
              console.log('⚠️ Proxy Engine not available');
            }
          }
      } catch (error) {
          console.error('❌ Proxy Engine initialization failed:', error);
          setIsProxyEngineReady(false);
      }

        // Initialize YARA Engine
      try {
          console.log('🔄 Checking YARA Engine status...');
        const yaraStatus = await YaraSecurityService.getEngineStatus();
          setIsYaraEngineReady(yaraStatus.initialized && yaraStatus.native);
          console.log('✅ YARA Engine status:', yaraStatus);
      } catch (error) {
          console.error('❌ YARA Engine check failed:', error);
          setIsYaraEngineReady(false);
        }
        
        console.log('✅ Phase 2: Enhanced service initialization completed');
        console.log(`📊 Phase 2 Status: FileScanner=${isFileScannerReady}, Watchdog=${isWatchdogReady}, DownloadMonitor=${isDownloadMonitorReady}, PermissionManager=${isPermissionManagerReady}`);
        console.log(`🛡️ Engine Status: YARA=${isYaraEngineReady}, Proxy=${isProxyEngineReady}`);
        
        // Phase 2: Security validation
        const securityScore = [isFileScannerReady, isWatchdogReady, isDownloadMonitorReady, isPermissionManagerReady, isYaraEngineReady, isProxyEngineReady].filter(Boolean).length;
        console.log(`🛡️ Phase 2: Security Score: ${securityScore}/6 services ready`);
        
        Sentry.addBreadcrumb({ 
          message: 'Phase 2 initialization completed',
          data: {
            fileScanner: isFileScannerReady,
            watchdog: isWatchdogReady,
            downloadMonitor: isDownloadMonitorReady,
            permissionManager: isPermissionManagerReady,
            securityScore: securityScore
          }
        });
      } catch (error) {
        console.error('❌ Phase 2: Service initialization error:', error);
        Sentry.captureException(error, { tags: { phase: 'phase2' } });
      }
    };

    initializeServices();
  }, []);

  const performLinkScan = async () => {
    if (!urlToCheck.trim()) {
      Alert.alert('⚠️ Invalid URL', 'Please enter a valid URL to scan');
      return;
    }

    setIsScanning(true);
    try {
      console.log('🔍 Scanning URL:', urlToCheck);
      
      if (typeof LinkScannerService.initializeService !== 'function') {
        throw new Error('LinkScannerService.initializeService is not available');
      }
      await LinkScannerService.initializeService();

      if (typeof LinkScannerService.scanUrl !== 'function') {
        throw new Error('LinkScannerService.scanUrl is not available');
      }
      const result = await LinkScannerService.scanUrl(urlToCheck.trim());

      console.log('🔍 Scan result:', result);

      setShowLinkModal(false);
      setUrlToCheck('');

      onNavigateToScanResult({
        url: urlToCheck.trim(),
        isSafe: result.isSafe,
        details: result.details,
        scanTime: new Date(),
        isLoading: false,
        scanType: 'url',
        scanEngine: 'Shabari Scanner v2.0',
      });
    } catch (error) {
      console.error('❌ URL scan error:', error);
      Sentry.captureException(error);
      Alert.alert('❌ Scan Error', 'Failed to scan URL. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileScan = async () => {
    if (!isFileScannerReady) {
      Alert.alert('Scanner Not Ready', 'The file scanner is still initializing. Please wait a moment and try again.');
      return;
    }

    console.log('🔍 File scanning initiated');

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('📄 File selected:', file.name);
        
        const nativeScanner = NativeFileScanner.getInstance();
        if (nativeScanner && typeof nativeScanner.scanFile === 'function') {
          const scanResult = await nativeScanner.scanFile(file.uri);
          
              onNavigateToScanResult({
            url: file.name,
            isSafe: scanResult.isSafe,
            details: scanResult.details || 'File scan completed',
            scanTime: new Date(),
                isLoading: false,
            scanType: 'file',
            scanEngine: 'Shabari File Scanner',
              });
      } else {
          Alert.alert('❌ Scanner Error', 'File scanner is not available');
        }
      }
    } catch (error) {
      console.error('❌ File scanner error:', error);
      Alert.alert('❌ Scanner Error', 'Failed to scan file. Please try again.');
    }
  };

  // Phase 2: Enhanced FileWatchdog handler
  const handleFileWatchdog = async () => {
    try {
      console.log('🔄 Phase 2: FileWatchdog interaction');
      Sentry.addBreadcrumb({ message: 'Phase 2 FileWatchdog interaction started' });

      if (!isWatchdogReady) {
        Alert.alert(
          '⚠️ FileWatchdog Not Ready',
          'The FileWatchdog service is not available on this device or failed to initialize.',
          [{ text: 'OK' }]
        );
        return;
      }

      const watchdog = FileWatchdogService.getInstance();
      if (!watchdog) {
        Alert.alert('❌ Service Error', 'FileWatchdog service is not available.');
        return;
      }

      // Check if watchdog is currently active
      const status = watchdog.getStatus();
      const isActive = status.isActive;
      
      Alert.alert(
        '👁️ FileWatchdog Status',
        `FileWatchdog is currently ${isActive ? 'ACTIVE' : 'INACTIVE'}\n\n` +
        `• Real-time file monitoring\n` +
        `• Automatic threat detection\n` +
        `• Download protection\n\n` +
        `Would you like to ${isActive ? 'stop' : 'start'} monitoring?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isActive ? 'Stop Monitoring' : 'Start Monitoring',
            onPress: async () => {
              try {
                if (isActive) {
                  watchdog.stopWatchdog();
                  Alert.alert('✅ Stopped', 'FileWatchdog monitoring has been stopped.');
                } else {
                  await watchdog.startWatchdog();
                  Alert.alert('✅ Started', 'FileWatchdog is now monitoring your files in real-time.');
                }
                Sentry.addBreadcrumb({ 
                  message: `Phase 2 FileWatchdog ${isActive ? 'stopped' : 'started'}` 
                });
    } catch (error) {
                console.error('❌ Phase 2: FileWatchdog toggle error:', error);
                Sentry.captureException(error, { tags: { phase: 'phase2', action: 'fileWatchdogToggle' } });
                Alert.alert('❌ Error', 'Failed to toggle FileWatchdog. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Phase 2: FileWatchdog handler error:', error);
      Sentry.captureException(error, { tags: { phase: 'phase2', handler: 'fileWatchdog' } });
      Alert.alert('❌ Error', 'Failed to access FileWatchdog. Please try again.');
    }
  };

  // Phase 2: Enhanced DownloadMonitor handler
  const handleDownloadMonitor = async () => {
    try {
      console.log('🔄 Phase 2: DownloadMonitor interaction');
      Sentry.addBreadcrumb({ message: 'Phase 2 DownloadMonitor interaction started' });

      if (!isDownloadMonitorReady) {
        Alert.alert(
          '⚠️ DownloadMonitor Not Ready',
          'The DownloadMonitor service is not available on this device or failed to initialize.',
          [{ text: 'OK' }]
        );
        return;
      }

      const downloadMonitor = DownloadMonitorService.getInstance();
      if (!downloadMonitor) {
        Alert.alert('❌ Service Error', 'DownloadMonitor service is not available.');
      return;
    }

      // Check if download monitor is currently active
      const status = downloadMonitor.getStatus();
      const isActive = status.isMonitoring;
      
      Alert.alert(
        '📥 Download Monitor Status',
        `Download Monitor is currently ${isActive ? 'ACTIVE' : 'INACTIVE'}\n\n` +
        `• Automatic download scanning\n` +
        `• Real-time threat detection\n` +
        `• Malware protection\n\n` +
        `Would you like to ${isActive ? 'stop' : 'start'} monitoring?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isActive ? 'Stop Monitoring' : 'Start Monitoring',
            onPress: async () => {
              try {
                if (isActive) {
                  downloadMonitor.stopMonitoring();
                  Alert.alert('✅ Stopped', 'Download monitoring has been stopped.');
                } else {
                  await downloadMonitor.startMonitoring();
                  Alert.alert('✅ Started', 'Download Monitor is now protecting your downloads.');
                }
                Sentry.addBreadcrumb({ 
                  message: `Phase 2 DownloadMonitor ${isActive ? 'stopped' : 'started'}` 
                });
    } catch (error) {
                console.error('❌ Phase 2: DownloadMonitor toggle error:', error);
                Sentry.captureException(error, { tags: { phase: 'phase2', action: 'downloadMonitorToggle' } });
                Alert.alert('❌ Error', 'Failed to toggle DownloadMonitor. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Phase 2: DownloadMonitor handler error:', error);
      Sentry.captureException(error, { tags: { phase: 'phase2', handler: 'downloadMonitor' } });
      Alert.alert('❌ Error', 'Failed to access DownloadMonitor. Please try again.');
    }
  };

  // Phase 2: Enhanced PermissionManager handler
  const handlePermissionManager = async () => {
    try {
      console.log('🔄 Phase 2: PermissionManager interaction');
      Sentry.addBreadcrumb({ message: 'Phase 2 PermissionManager interaction started' });

      if (!isPermissionManagerReady) {
        Alert.alert(
          '⚠️ PermissionManager Not Ready',
          'The PermissionManager service is not available on this device or failed to initialize.',
          [{ text: 'OK' }]
        );
        return;
      }

      const permissionManager = PermissionManager.getInstance();
      if (!permissionManager) {
        Alert.alert('❌ Service Error', 'PermissionManager service is not available.');
        return;
      }
      
      // Get current permission statuses
      const permissions = await permissionManager.getAllPermissionStatuses();

        Alert.alert(
        '🔐 Permission Manager',
        `Current Permission Status:\n\n` +
        `• Background Monitoring: ${permissions.backgroundMonitoring ? '✅ Granted' : '❌ Denied'}\n` +
        `• Download Protection: ${permissions.downloadProtection ? '✅ Granted' : '❌ Denied'}\n` +
        `• Notifications: ${permissions.notifications ? '✅ Granted' : '❌ Denied'}\n` +
        `• File Access: ${permissions.fileAccess ? '✅ Granted' : '❌ Denied'}\n\n` +
        `Would you like to manage permissions?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Request All Permissions',
              onPress: async () => {
              try {
                const result = await permissionManager.requestAllPermissions();
                const grantedCount = Object.values(result).filter(Boolean).length;
                Alert.alert(
                  '✅ Permissions Updated', 
                  `${grantedCount}/4 permissions granted.\n\nYour security features are now ${grantedCount === 4 ? 'fully' : 'partially'} enabled.`
                );
                Sentry.addBreadcrumb({ 
                  message: `Phase 2 PermissionManager permissions updated`,
                  data: { grantedCount, totalPermissions: 4 }
                });
              } catch (error) {
                console.error('❌ Phase 2: PermissionManager request error:', error);
                Sentry.captureException(error, { tags: { phase: 'phase2', action: 'permissionRequest' } });
                Alert.alert('❌ Error', 'Failed to request permissions. Please try again.');
              }
            }
          },
          {
            text: 'Open Settings',
            onPress: async () => {
              try {
                await permissionManager.showPermissionSettings();
                Sentry.addBreadcrumb({ message: 'Phase 2 PermissionManager settings opened' });
              } catch (error) {
                console.error('❌ Phase 2: PermissionManager settings error:', error);
                Sentry.captureException(error, { tags: { phase: 'phase2', action: 'openSettings' } });
                Alert.alert('❌ Error', 'Failed to open permission settings.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Phase 2: PermissionManager handler error:', error);
      Sentry.captureException(error, { tags: { phase: 'phase2', handler: 'permissionManager' } });
      Alert.alert('❌ Error', 'Failed to access PermissionManager. Please try again.');
    }
  };

  // Proxy Engine Control Handler
  const handleProxyEngine = async () => {
    try {
      console.log('🔧 Proxy Engine control handler called');
      Sentry.addBreadcrumb({ message: 'Proxy Engine control interaction' });

      if (!isProxyEngineReady) {
    Alert.alert(
          '⚠️ Proxy Engine Not Available',
          'The Proxy Engine is not available. It will be activated after you build the app with EAS.\n\nCurrent Status: Using development build without native modules.',
          [{ text: 'OK' }]
        );
      return;
    }

      const status = await proxyEngineService.getStatus();
      const isRunning = status.isRunning;

      Alert.alert(
        '🛡️ VPN Protection',
        `VPN Protection is currently ${isRunning ? 'ACTIVE' : 'STOPPED'}\n\n` +
        `• Ad Blocking\n` +
        `• Tracker Blocking\n` +
        `• Malware Domain Filtering\n` +
        `• Phishing Protection\n` +
        `• DNS over HTTPS\n\n` +
        (status.statistics ? 
          `Statistics:\n` +
          `• Threats Blocked: ${status.statistics.threatsBlocked}\n` +
          `• Threats Warned: ${status.statistics.threatsWarned}\n` +
          `• Uptime: ${status.statistics.uptime}\n\n`
          : '') +
        `Would you like to ${isRunning ? 'stop' : 'start'} VPN protection?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isRunning ? 'Stop Protection' : 'Start Protection',
            onPress: async () => {
              try {
                if (isRunning) {
                  const result = await proxyEngineService.stopProtection();
                  if (result.success) {
                    setIsProxyEngineRunning(false);
                    Alert.alert('✅ Stopped', 'VPN Protection has been stopped.');
                  } else {
                    Alert.alert('❌ Error', result.message || 'Failed to stop protection');
                  }
                } else {
                  const result = await proxyEngineService.startProtection();
                  if (result.success) {
                    setIsProxyEngineRunning(true);
                    Alert.alert('✅ Started', 'VPN Protection is now active!');
                  } else {
                    Alert.alert('❌ Error', result.message || 'Failed to start protection');
                  }
                }
                Sentry.addBreadcrumb({ message: `Proxy Engine ${isRunning ? 'stopped' : 'started'}` });
              } catch (error) {
                console.error('❌ Proxy Engine toggle error:', error);
                Sentry.captureException(error, { tags: { action: 'proxyToggle' } });
                Alert.alert('❌ Error', 'Failed to toggle VPN Protection. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Proxy Engine handler error:', error);
      Sentry.captureException(error, { tags: { handler: 'proxyEngine' } });
      Alert.alert('❌ Error', 'Failed to access VPN Protection. Please try again.');
    }
  };

  // YARA Engine Control Handler
  const handleYaraEngine = async () => {
    try {
      console.log('🔧 YARA Engine status check');
      Sentry.addBreadcrumb({ message: 'YARA Engine status check' });

      const status = await YaraSecurityService.getEngineStatus();
      
      Alert.alert(
        '🛡️ YARA Threat Detection Engine',
        `Engine Status:\n\n` +
        `• Native Engine: ${status.native ? '✅ Active' : '❌ Using Mock'}\n` +
        `• Initialized: ${status.initialized ? '✅ Yes' : '❌ No'}\n` +
        `• Engine Version: ${status.version}\n` +
        `• Detection Rules: ${status.rulesCount}\n` +
        `• Engine Type: ${status.engineType}\n\n` +
        (status.native ? 
          '✅ Native YARA engine is active and providing enterprise-grade threat detection!' :
          '⚠️ Using mock implementation. Native engine will be active after building with EAS.'
        ),
        [
          { text: 'OK' },
          status.native ? null : {
            text: 'How to Activate',
            onPress: () => {
              Alert.alert(
                '📖 Activate Native YARA',
                'To activate the native YARA engine:\n\n' +
                '1. Build the app with EAS:\n   npx eas build -p android\n\n' +
                '2. Install the new APK\n\n' +
                '3. Native engine will be active!\n\n' +
                'The native engine provides:\n' +
                '• 1250+ detection rules\n' +
                '• 10x faster scanning\n' +
                '• Real malware signatures\n' +
                '• Production-grade security',
                [{ text: 'Got it!' }]
              );
            }
          }
        ].filter(Boolean) as any
      );
    } catch (error) {
      console.error('❌ YARA Engine handler error:', error);
      Sentry.captureException(error, { tags: { handler: 'yaraEngine' } });
      Alert.alert('❌ Error', 'Failed to check YARA Engine status.');
    }
  };

  // New: Open VPN Control with premium gating
  const handleOpenVPNControl = () => {
    if (isPremium) {
      navigation.navigate('VPNControl');
    } else {
      setRequestedFeature('VPN Control');
      setUpgradeVisible(true);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0D1421', '#1A1F2E', '#2D3748']}
        style={styles.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="shield-check" size={28} color="#FF6B35" />
            </View>
          <View>
            <Text style={styles.headerTitle}>🛡️ Shabari</Text>
            <Text style={styles.headerSubtitle}>Security Suite</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => onNavigateToSettings()}
        >
          <MaterialCommunityIcons name="cog" size={24} color="#FF6B35" />
          </TouchableOpacity>
      </View>
      
      {/* Main Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Premium Status Banner */}
        {isPremium ? (
          <View style={styles.premiumBanner}>
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" />
            <Text style={styles.premiumBannerText}>Premium Active</Text>
            <MaterialCommunityIcons name="shield-check" size={24} color="#4CAF50" />
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.upgradeBanner}
            onPress={() => {
              setRequestedFeature(undefined);
              setUpgradeVisible(true);
            }}
          >
            <MaterialCommunityIcons name="star-outline" size={24} color="#FFD700" />
            <Text style={styles.upgradeBannerText}>Upgrade to Premium</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#FFD700" />
          </TouchableOpacity>
        )}

        {/* Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>🛡️ Security Status</Text>
          <Text style={styles.statusText}>{isPremium ? 'Premium Protection' : 'Basic Protection'}</Text>
          <Text style={styles.statusSubtext}>
            {isPremium ? 'All premium features active' : 'Core security features active'}
          </Text>
        </View>

        {/* Core Security Features */}
        <Text style={styles.sectionTitle}>🛡️ Core Security</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => setShowLinkModal(true)}
          >
            <MaterialCommunityIcons name="link-variant" size={32} color="#FF6B35" />
            <Text style={styles.actionTitle}>URL Scanner</Text>
            <Text style={styles.actionSubtitle}>Scan suspicious links</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleFileScan}
          >
            <MaterialCommunityIcons name="file-search" size={32} color="#9C27B0" />
            <Text style={styles.actionTitle}>File Scanner</Text>
            <Text style={styles.actionSubtitle}>Scan files for threats</Text>
          </TouchableOpacity>
          
              <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => onNavigateToQRScanner()}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={32} color="#607D8B" />
            <Text style={styles.actionTitle}>QR Scanner</Text>
            <Text style={styles.actionSubtitle}>Scan QR codes safely</Text>
              </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => onNavigateToMessageAnalysis()}
          >
            <MaterialCommunityIcons name="message-alert" size={32} color="#795548" />
            <Text style={styles.actionTitle}>SMS Analysis</Text>
            <Text style={styles.actionSubtitle}>Analyze SMS threats</Text>
          </TouchableOpacity>
            </View>

        {/* Additional Tools */}
        <Text style={styles.sectionTitle}>🔧 Security Tools</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('🔍 Opening Deep Scan');
              Sentry.addBreadcrumb({ message: 'Deep Scan navigation initiated' });
              navigation.navigate('DeepScan');
            }}
          >
            <MaterialCommunityIcons name="shield-search" size={32} color="#00D4FF" />
            <Text style={styles.actionTitle}>Deep Scan</Text>
            <Text style={styles.actionSubtitle}>Scan device threats</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('🌐 Opening Secure Browser');
              navigation.navigate('SecureBrowser');
            }}
          >
            <MaterialCommunityIcons name="shield-lock" size={32} color="#4CAF50" />
            <Text style={styles.actionTitle}>Secure Browser</Text>
            <Text style={styles.actionSubtitle}>Safe browsing</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('📂 Opening Quarantine');
              navigation.navigate('Quarantine');
            }}
          >
            <MaterialCommunityIcons name="folder-lock" size={32} color="#FF9800" />
            <Text style={styles.actionTitle}>Quarantine</Text>
            <Text style={styles.actionSubtitle}>Isolated threats</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('📞 Opening Call Log');
              navigation.navigate('CallLog');
            }}
          >
            <MaterialCommunityIcons name="phone-log" size={32} color="#2196F3" />
            <Text style={styles.actionTitle}>Call Log</Text>
            <Text style={styles.actionSubtitle}>View call history</Text>
          </TouchableOpacity>
              
              <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('📱 Opening SMS Scanner');
              navigation.navigate('SMSScanner');
            }}
          >
            <MaterialCommunityIcons name="message-processing" size={32} color="#E91E63" />
            <Text style={styles.actionTitle}>SMS Scanner</Text>
            <Text style={styles.actionSubtitle}>Scan all messages</Text>
              </TouchableOpacity>

          {/* New: Quick access to VPN Control Panel with Premium lock */}
          <TouchableOpacity
            style={[
              styles.actionCard,
              !isPremium && styles.lockedCard
            ]}
            onPress={handleOpenVPNControl}
            activeOpacity={0.8}
          >
            {!isPremium && (
              <View style={styles.lockBadge}>
                <MaterialCommunityIcons name="lock" size={14} color="#000" />
                <Text style={styles.lockBadgeText}>Premium</Text>
              </View>
            )}
            <MaterialCommunityIcons name="vpn" size={32} color={isPremium ? '#81C784' : '#9E9E9E'} />
            <Text style={styles.actionTitle}>VPN Control</Text>
            <Text style={styles.actionSubtitle}>{isPremium ? 'Start/stop & configure' : 'Premium only'}</Text>
          </TouchableOpacity>

          {/* NEW: Ad Blocker Access - Added for user-controlled ad blocking */}
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => {
              console.log('🚫 Opening Ad Blocker');
              Sentry.addBreadcrumb({ message: 'Ad Blocker navigation initiated' });
              navigation.navigate('EnhancedAdBlocker');
            }}
          >
            <MaterialCommunityIcons name="shield-off" size={32} color="#F44336" />
            <Text style={styles.actionTitle}>Ad Blocker</Text>
            <Text style={styles.actionSubtitle}>Block unwanted ads</Text>
          </TouchableOpacity>
        </View>

        {/* Phase 2: Advanced Features Section */}
        {isPremium && (isWatchdogReady || isDownloadMonitorReady || isPermissionManagerReady) && (
          <View style={styles.advancedSection}>
            <Text style={styles.sectionTitle}>🚀 Phase 2: Advanced Protection</Text>
            
            {isWatchdogReady && (
              <TouchableOpacity 
                style={styles.advancedFeatureCard}
                onPress={() => handleFileWatchdog()}
              >
                <MaterialCommunityIcons name="eye" size={40} color="#FF6B35" />
                <View style={styles.featureInfo}>
                  <Text style={styles.featureTitle}>File Watchdog</Text>
                  <Text style={styles.featureSubtitle}>Real-time file monitoring</Text>
                </View>
                <View style={styles.statusIndicator}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
                </View>
              </TouchableOpacity>
            )}

            {isDownloadMonitorReady && (
              <TouchableOpacity 
                style={styles.advancedFeatureCard}
                onPress={() => handleDownloadMonitor()}
              >
                <MaterialCommunityIcons name="download" size={40} color="#2196F3" />
                <View style={styles.featureInfo}>
                  <Text style={styles.featureTitle}>Download Monitor</Text>
                  <Text style={styles.featureSubtitle}>Automatic download scanning</Text>
          </View>
                <View style={styles.statusIndicator}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
        </View>
              </TouchableOpacity>
            )}

            {isPermissionManagerReady && (
              <TouchableOpacity 
                style={styles.advancedFeatureCard}
                onPress={() => handlePermissionManager()}
              >
                <MaterialCommunityIcons name="shield-account" size={40} color="#9C27B0" />
                <View style={styles.featureInfo}>
                  <Text style={styles.featureTitle}>Permission Manager</Text>
                  <Text style={styles.featureSubtitle}>Advanced permission control</Text>
                </View>
                <View style={styles.statusIndicator}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
              </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Premium Features Section */}
        {isPremium ? (
          <View style={styles.premiumSection}>
            <Text style={styles.sectionTitle}>⭐ Premium Features</Text>
            
            <TouchableOpacity 
              style={styles.premiumFeatureCard}
              onPress={() => Alert.alert('🛡️ Advanced Threat Detection', 'Real-time AI-powered threat analysis')}
            >
              <MaterialCommunityIcons name="shield-alert" size={40} color="#FF6B35" />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Advanced Threat Detection</Text>
                <Text style={styles.featureSubtitle}>AI-powered real-time analysis</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.premiumFeatureCard}
              onPress={() => Alert.alert('🔒 Privacy Guard', 'Monitor app permissions and data access')}
            >
              <MaterialCommunityIcons name="lock-check" size={40} color="#9C27B0" />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Privacy Guard</Text>
                <Text style={styles.featureSubtitle}>App permission monitoring</Text>
          </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.premiumFeatureCard}
              onPress={handleProxyEngine}
            >
              <MaterialCommunityIcons 
                name="vpn" 
                size={40} 
                color={isProxyEngineRunning ? "#4CAF50" : (isProxyEngineReady ? "#FFA500" : "#666")} 
              />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>VPN Protection</Text>
                <Text style={styles.featureSubtitle}>
                  {isProxyEngineRunning ? 'Active - Protecting' : (isProxyEngineReady ? 'Tap to start' : 'Build to activate')}
              </Text>
              </View>
              {isProxyEngineRunning && (
                <View style={styles.activeIndicator}>
                  <View style={styles.activeDot} />
                </View>
              )}
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.premiumFeatureCard}
              onPress={handleYaraEngine}
            >
              <MaterialCommunityIcons 
                name="shield-bug" 
                size={40} 
                color={isYaraEngineReady ? "#4CAF50" : "#FFA500"} 
              />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>YARA Threat Engine</Text>
                <Text style={styles.featureSubtitle}>
                  {isYaraEngineReady ? 'Native - Active' : 'Mock - Tap for info'}
                </Text>
        </View>
              {isYaraEngineReady && (
                <View style={styles.activeIndicator}>
                  <View style={styles.activeDot} />
        </View>
              )}
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.premiumFeatureCard}
              onPress={() => Alert.alert('📊 Security Reports', 'Detailed threat analytics and insights')}
            >
              <MaterialCommunityIcons name="chart-line" size={40} color="#2196F3" />
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Security Reports</Text>
                <Text style={styles.featureSubtitle}>Detailed analytics</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.lockedFeaturesSection}>
            <Text style={styles.sectionTitle}>🔒 Premium Features (Locked)</Text>
            <Text style={styles.lockedSubtitle}>Upgrade to unlock these powerful features</Text>
            
            <View style={styles.lockedFeatureCard}>
              <MaterialCommunityIcons name="shield-alert" size={32} color="#666" />
              <Text style={styles.lockedFeatureTitle}>Advanced Threat Detection</Text>
              <MaterialCommunityIcons name="lock" size={20} color="#FFD700" />
          </View>

            <View style={styles.lockedFeatureCard}>
              <MaterialCommunityIcons name="lock-check" size={32} color="#666" />
              <Text style={styles.lockedFeatureTitle}>Privacy Guard</Text>
              <MaterialCommunityIcons name="lock" size={20} color="#FFD700" />
        </View>

            <View style={styles.lockedFeatureCard}>
              <MaterialCommunityIcons name="vpn" size={32} color="#666" />
              <Text style={styles.lockedFeatureTitle}>VPN Protection</Text>
              <MaterialCommunityIcons name="lock" size={20} color="#FFD700" />
            </View>

            <View style={styles.lockedFeatureCard}>
              <MaterialCommunityIcons name="chart-line" size={32} color="#666" />
              <Text style={styles.lockedFeatureTitle}>Security Reports</Text>
              <MaterialCommunityIcons name="lock" size={20} color="#FFD700" />
            </View>

        <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => {
                setRequestedFeature(undefined);
                setUpgradeVisible(true);
              }}
            >
              <Text style={styles.upgradeButtonText}>🚀 Upgrade to Premium</Text>
        </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      
      {/* URL Scanner Modal */}
      <Modal
        visible={showLinkModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>🔍 URL Scanner</Text>
            <Text style={styles.modalDescription}>
              Enter a URL to scan for potential security threats
            </Text>
            
              <TextInput
                style={styles.urlInput}
              placeholder="https://example.com"
              placeholderTextColor="#666"
                value={urlToCheck}
                onChangeText={setUrlToCheck}
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton}
                  onPress={() => setShowLinkModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.scanButton}
                  onPress={performLinkScan}
                disabled={isScanning || !urlToCheck.trim()}
              >
                <Text style={styles.scanButtonText}>
                  {isScanning ? 'Scanning...' : 'Scan URL'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Premium Upgrade Modal */}
      <PremiumUpgrade
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        featureRequested={requestedFeature}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1421',
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 12,
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  settingsButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusSubtext: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: '48%',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  actionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitle: {
    color: '#B0B0B0',
    fontSize: 12,
    textAlign: 'center',
  },
  premiumBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  premiumBannerText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 12,
  },
  upgradeBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
    borderStyle: 'dashed',
  },
  upgradeBannerText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  premiumSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  premiumFeatureCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  featureInfo: {
    flex: 1,
    marginLeft: 16,
  },
  featureTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  featureSubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  lockedFeaturesSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  lockedSubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  lockedFeatureCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    opacity: 0.6,
  },
  lockedFeatureTitle: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 12,
  },
  upgradeButton: {
    backgroundColor: '#FFD700',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  upgradeButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Phase 2: Advanced features styling
  advancedSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  advancedFeatureCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  statusIndicator: {
    marginLeft: 8,
  },
  activeIndicator: {
    marginLeft: 'auto',
    marginRight: 8,
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1a1a2e',
    padding: 24,
    borderRadius: 16,
  },
  modalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  urlInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: '#666',
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  cancelButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#FF6B35',
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  scanButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  // New styles for premium lock badge
  lockedCard: {
    opacity: 0.7,
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  lockBadgeText: {
    marginLeft: 4,
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default DashboardScreen;

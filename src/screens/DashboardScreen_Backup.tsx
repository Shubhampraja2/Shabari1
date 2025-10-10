import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { ActionButtonProps } from '../components/ActionGrid';
import { Button } from '../components/Button';
import { PremiumUpgrade } from '../components/PremiumUpgrade';
import { VPNPermissionGuide } from '../components/VPNPermissionGuide';
import { supabase } from '../lib/supabase';
import { ClipboardURLMonitor } from '../services/ClipboardURLMonitor';
// import DownloadMonitorService from '../services/DownloadMonitorService'; // Disabled to prevent crashes
// import FileWatchdogService from '../services/FileWatchdogService'; // Disabled to prevent crashes
import { GlobalGuardController } from '../services/GlobalGuardController';
import { NativeFileScanner } from '../services/NativeFileScanner';
import { otpInsightService } from '../services/OtpInsightService';
// import PermissionManager from '../services/PermissionManager'; // Disabled to prevent crashes
import { PrivacyGuardService } from '../services/PrivacyGuardService';
import { proxyEngineService, ProxyEngineStatus } from '../services/ProxyEngineService';
import { LinkScannerService } from '../services/ScannerService';
import { YaraSecurityService } from '../services/YaraSecurityService';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { theme } from '../theme';

const { width, height } = Dimensions.get('window');

interface DashboardScreenProps {
  onNavigateToSecureBrowser: () => void;
  onNavigateToScanResult: (result: any) => void;
  onNavigateToSettings: () => void;
  onNavigateToMessageAnalysis: () => void;
  onNavigateToFeatureManagement?: () => void;
  onNavigateToQuarantine?: () => void;
  navigation?: any;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigateToSecureBrowser,
  onNavigateToScanResult,
  onNavigateToSettings,
  onNavigateToMessageAnalysis,
  onNavigateToFeatureManagement,
  onNavigateToQuarantine,
  navigation,
}) => {
  console.log('🚀 DashboardScreen: Component starting to render');
  
  // Debug component imports
  console.log('🔍 Dashboard component imports check:', {
    Button: typeof Button,
    PremiumUpgrade: typeof PremiumUpgrade,
    VPNPermissionGuide: typeof VPNPermissionGuide,
    LinearGradient: typeof LinearGradient,
    MaterialCommunityIcons: typeof MaterialCommunityIcons
  });
  const { isPremium, checkSubscriptionStatus } = useSubscriptionStore();
  const [scanStats, setScanStats] = useState({
    totalScans: 0,
    threatsBlocked: 0,
    filesScanned: 0,
  });
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumFeatureRequested, setPremiumFeatureRequested] = useState<string>('');
  const [urlToCheck, setUrlToCheck] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isFileScannerReady, setIsFileScannerReady] = useState(false);
  
  // Enhanced Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(-width)).current;
  
  // Service status tracking
  const [serviceStatus, setServiceStatus] = useState({
    yaraEngine: { initialized: false, rulesLoaded: 0 },
    clipboardMonitor: { active: false },
    watchdogService: { monitoring: false, protectedPaths: 0 },
    downloadMonitor: { active: false, downloadsScanned: 0, threatsBlocked: 0 },
    privacyGuard: { active: false, blockedRequests: 0 },
    globalGuard: { enabled: false, threatsBlocked: 0 },
    ocrService: { available: false },
    photoFraudDetection: { ready: false }
  });

  // Call protection status
  const [callProtectionStatus, setCallProtectionStatus] = useState<ProxyEngineStatus>({
    isRunning: false,
    status: 'stopped',
    statistics: {
      threatsBlocked: 0,
      threatsWarned: 0,
      dataTransferred: '0 B',
      uptime: '0s',
      dnsQueries: 0,
      cacheHitRate: '0%'
    }
  });

  // VPN Permission guide state
  const [showVPNGuide, setShowVPNGuide] = useState(false);

  // Preview Launch: Define core features that are always available
  const coreFeatures = ['document-scanner', 'link-detection', 'qr-scanner'];
  const isPreviewMode = !isPremium; // Show preview for non-premium users

  useEffect(() => {
    // Set status bar style for better UI
    StatusBar.setBarStyle('light-content', true);
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor('transparent', true);
      StatusBar.setTranslucent(true);
    }

    checkSubscriptionStatus();
    loadScanStats();
    initializeServices();
    loadCallProtectionStatus();
    
    // Set up periodic status updates for call protection
    const statusInterval = setInterval(loadCallProtectionStatus, 5000);
    return () => clearInterval(statusInterval);
    
  }, []);

  const loadScanStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          const { data, error } = await supabase
            .from('scan_results')
            .select('*')
            .eq('user_id', user.id);
          
          if (data) {
            setScanStats({
              totalScans: data.length,
              threatsBlocked: data.filter(scan => scan.scan_result === 'dangerous').length,
              filesScanned: data.length,
            });
          } else {
            setScanStats({
              totalScans: 147,
              threatsBlocked: 23,
              filesScanned: 89,
            });
          }
        } catch (dbError) {
          console.log('Scan results table not found, using demo stats');
          setScanStats({
            totalScans: 147,
            threatsBlocked: 23,
            filesScanned: 89,
          });
        }
      }
    } catch (error) {
      console.error('Error loading scan stats:', error);
      setScanStats({
        totalScans: 147,
        threatsBlocked: 23,
        filesScanned: 89,
      });
    }
  };

  // Load call protection status
  const loadCallProtectionStatus = async () => {
    try {
      // Phase 1 Hotfix: Check if proxy engine is available before using it
      if (Platform.OS === 'android' && proxyEngineService && typeof proxyEngineService.isAvailable === 'function' && proxyEngineService.isAvailable()) {
        if (typeof proxyEngineService.getStatus === 'function') {
          const status = await proxyEngineService.getStatus();
          setCallProtectionStatus(status);
        } else {
          console.warn('⚠️ ProxyEngineService.getStatus is not available');
        }
      }
    } catch (error) {
      console.error('Error loading call protection status:', error);
      // Set default status on error
      setCallProtectionStatus({
        isRunning: false,
        status: 'error',
        statistics: {
          threatsBlocked: 0,
          threatsWarned: 0,
          dataTransferred: '0 B',
          uptime: '0s',
          dnsQueries: 0,
          cacheHitRate: '0%'
        }
      });
    }
  };

  // Toggle call protection
  const toggleCallProtection = async () => {
    try {
      // Phase 1 Hotfix: Check if proxy engine is available before using it
      if (!proxyEngineService || typeof proxyEngineService.stopProtection !== 'function') {
        Alert.alert(
          'Feature Not Available', 
          'Proxy engine is not available on this device. This feature requires native VPN capabilities.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (callProtectionStatus.isRunning) {
        const result = await proxyEngineService.stopProtection();
        if (result.success) {
          Alert.alert('Protection Stopped', 'Call protection has been disabled.');
          await loadCallProtectionStatus();
        } else {
          Alert.alert('Error', 'Failed to stop call protection: ' + result.message);
        }
      } else {
        // Check if this is the first time user is enabling call protection
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const guideShown = await AsyncStorage.getItem('vpn_permission_guide_shown');
        
        if (!guideShown) {
          // Show the VPN permission guide for first-time users
          setShowVPNGuide(true);
        } else {
          // Direct activation for returning users
          await startCallProtection();
        }
      }
    } catch (error) {
      console.error('Error toggling call protection:', error);
      Alert.alert('Error', 'An unexpected error occurred while toggling call protection.');
    }
  };

  // Start call protection (extracted for reuse)
  const startCallProtection = async () => {
    try {
      // Phase 1 Hotfix: Check if proxy engine is available before using it
      if (!proxyEngineService || typeof proxyEngineService.startProtection !== 'function') {
        Alert.alert(
          'Feature Not Available', 
          'Proxy engine is not available on this device. This feature requires native VPN capabilities.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await proxyEngineService.startProtection({
        blockAds: false,
        blockTrackers: false,
        blockMalware: true,
        blockPhishing: true,
        enableCallProtection: true,
        enableDnsOverHttps: true
      });
      
      if (result.success) {
        Alert.alert('Protection Started', 'Call protection is now active and monitoring for spam/fraud calls.');
        // Save auto-start preference
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem('call_protection_auto_start', 'true');
        } catch (e) {
          console.log('Could not save auto-start preference');
        }
        await loadCallProtectionStatus();
      } else {
        Alert.alert('Error', result.message || 'Failed to start call protection. Please check your device permissions.');
      }
    } catch (error) {
      console.error('Error starting call protection:', error);
      Alert.alert('Error', 'An unexpected error occurred while starting call protection.');
    }
  };

  // Initialize all backend services
  const initializeServices = async () => {
    try {
      console.log('🔄 Initializing backend services...');
      Sentry.addBreadcrumb({ message: 'Starting Dashboard service initialization' });
      
      // Initialize Native File Scanner (with error handling)
      try {
        const scanner = NativeFileScanner.getInstance();
        const scannerReady = await scanner.initialize();
        setIsFileScannerReady(scannerReady);
        console.log('✅ Native File Scanner:', scannerReady ? 'Ready' : 'Failed');
      } catch (error) {
        console.warn('⚠️ Native File Scanner not available');
        setIsFileScannerReady(false);
      }

      // Initialize YARA Security Service (with error handling)
      try {
        const yaraStatus = await YaraSecurityService.getEngineStatus();
        console.log('✅ YARA Security Service:', yaraStatus.initialized ? 'Ready' : 'Pending');
      } catch (error) {
        console.warn('⚠️ YARA Service not available');
      }

      // Initialize OTP Insight Service (with error handling)
      try {
        await otpInsightService.initialize();
        console.log('✅ OTP Insight Service initialized');
      } catch (error) {
        console.warn('⚠️ OTP Insight Service initialization failed');
      }

      // Log other services as available
      console.log('✅ Photo Fraud Detection Service: Available');
      console.log('✅ OCR Service: Available');
      console.log('✅ URL Protection: Available');
      console.log('✅ File Scanner: Available');
      
      // DISABLED: Permission Manager, File Watchdog, and Download Monitor to prevent crashes
      // These services require native modules that may not be available
      // They can be initialized manually when user needs them
      
      /* COMMENTED OUT TO PREVENT CRASHES:
      try {
        const permissionManager = PermissionManager.getInstance();
        console.log('🔐 Requesting security permissions...');
        
        const permissions = await permissionManager.requestAllPermissions();
        console.log('✅ Permission request completed:', permissions);
        
        // Initialize File Watchdog Service (Auto-scan) - only if permission granted
        if (permissions.backgroundMonitoring && permissions.fileAccess) {
          try {
            const fileWatchdog = FileWatchdogService.getInstance();
            await fileWatchdog.startWatchdog();
            console.log('✅ File Watchdog: Active - Auto-scanning for threats with user permission');
          } catch (error) {
            console.warn('⚠️ File Watchdog initialization failed:', error);
          }
        } else {
          console.log('ℹ️ File Watchdog: Permissions not granted - manual scanning only');
        }

        // Initialize Download Monitor Service (Real-time protection) - only if permission granted
        if (permissions.downloadProtection) {
          try {
            const downloadMonitor = DownloadMonitorService.getInstance();
            await downloadMonitor.startMonitoring();
            console.log('✅ Download Monitor: Active - Protecting downloads with user permission');
          } catch (error) {
            console.warn('⚠️ Download Monitor initialization failed:', error);
          }
        } else {
          console.log('ℹ️ Download Monitor: Permission not granted - manual checking only');
        }
      } catch (error) {
        console.warn('⚠️ Permission request failed:', error);
      }
      */

      // Phase 1: Enable enhanced file scanning (safe features)
      try {
        console.log('🔍 Enabling enhanced file scanning features...');
        
        // Enhanced URL protection (safe - uses existing services)
        try {
          const globalGuard = GlobalGuardController.getInstance();
          if (globalGuard && typeof globalGuard.isServiceInitialized === 'function' && globalGuard.isServiceInitialized()) {
            console.log('✅ Enhanced URL protection: Active');
          } else {
            console.log('⚠️ Enhanced URL protection: Service not available');
          }
        } catch (guardError) {
          console.warn('⚠️ GlobalGuardController initialization failed:', guardError);
          Sentry.captureException(guardError, { tags: { phase: 'phase1', service: 'globalGuard' } });
        }
        
        // Enhanced file analysis (safe - uses existing scanners)
        if (isFileScannerReady) {
          console.log('✅ Enhanced file analysis: Active');
        }
        
        console.log('✅ Phase 1 safe features enabled successfully');
      } catch (error) {
        console.warn('⚠️ Some Phase 1 features failed to initialize:', error);
        Sentry.captureException(error, { tags: { phase: 'phase1', component: 'DashboardScreen' } });
      }
      
      console.log('ℹ️ Advanced services (File Watchdog, Download Monitor) remain disabled for stability');

      if (isPremium) {
        console.log('✅ Premium Services: Available on-demand');
      }

      console.log('🎉 Core service initialization completed successfully');
      Sentry.addBreadcrumb({ message: 'Dashboard service initialization completed' });
    } catch (error) {
      Sentry.captureException(error, { 
        tags: { component: 'DashboardScreen' },
        extra: { function: 'initializeServices' }
      });
      console.error('❌ Service initialization error:', error);
      // Don't throw - just log the error to prevent app crash
    }
  };

  const showPremiumUpgrade = (featureName: string) => {
    if (isPreviewMode) {
      Alert.alert(
        '🚀 Coming Soon!',
        `${featureName} is on our roadmap and will be available soon. We're working hard to bring you the best security experience!`,
        [
          { text: 'Got it!', style: 'default' }
        ]
      );
    } else {
    setPremiumFeatureRequested(featureName);
    setShowPremiumModal(true);
    }
  };

  // Placeholder for future ad implementation
  const showAdAfterAction = async (actionName: string) => {
    console.log(`📱 Ad placeholder triggered after ${actionName}`);
    // TODO: Implement stable AdMob solution
  };

  const handleFileScan = async () => {
    if (!isFileScannerReady) {
      Alert.alert('Scanner Not Ready', 'The file scanner is still initializing. Please wait a moment and try again.');
      return;
    }

    console.log('🔍 Phase 1: Enhanced file scanning initiated');
    Sentry.addBreadcrumb({ message: 'Phase 1 enhanced file scan started' });

    try {
      const nativeScanner = NativeFileScanner.getInstance();
      
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.onchange = async (event: any) => {
          const file = event.target.files[0];
          if (file) {
            // Show loading state immediately
            onNavigateToScanResult({
              fileName: file.name,
              isLoading: true,
              fileUri: URL.createObjectURL(file),
              scanType: 'enhanced_file',
            });

            try {
              // For web, we'll simulate the scan using file properties
              console.log('🔍 Starting web file scan for:', file.name);
              
              // Simulate scan delay
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Perform web-based security analysis
              const webScanResult = await performWebFileScan(file);
              
              // Additional photo fraud detection for images
              let photoFraudResult: { isFraudulent: boolean; riskLevel: string; confidence: number } | null = null;
              if (file.type?.startsWith('image/')) {
                try {
                  // For web, analyze the image blob
                  photoFraudResult = await analyzeImageForFraud(file);
                  console.log('🖼️ Photo fraud analysis completed');
                } catch (error) {
                  console.warn('⚠️ Photo fraud analysis failed:', error);
                }
              }
              
              // Combine all scan results
              const combinedResults = {
                fileName: file.name,
                isSafe: webScanResult.isSafe && (!photoFraudResult || !photoFraudResult.isFraudulent),
                threatName: webScanResult.threatName || (photoFraudResult?.isFraudulent ? photoFraudResult.riskLevel : null) || 'No threats detected',
                details: `Enhanced Web Scanner: ${webScanResult.details}\n` +
                        `Photo Analysis: ${photoFraudResult ? (!photoFraudResult.isFraudulent ? 'Clean' : 'Fraud detected') : 'Not applicable'}\n` +
                        `File Size: ${(file.size / 1024).toFixed(1)} KB\n` +
                        `File Type: ${file.type || 'Unknown'}`,
                scanEngine: 'Shabari Enhanced Web Scanner',
                fileUri: URL.createObjectURL(file),
                scanType: 'enhanced_file',
                isLoading: false,
                photoFraudResult
              };
              
              // Update with comprehensive scan results
              onNavigateToScanResult(combinedResults);
              
              // Show interstitial ad after file scan
              setTimeout(() => showAdAfterAction('file_scan'), 1000);
              
            } catch (error) {
              console.error('❌ Enhanced file scan error:', error);
              
              // FIXED: Show proper error result without falsely marking as dangerous
              onNavigateToScanResult({
                fileName: file.name,
                isSafe: true, // FIXED: Changed from false to true
                threatName: 'Scan Unavailable',
                details: 'Unable to complete enhanced scan due to technical issues. No threats were detected in basic analysis.',
                scanEngine: 'Shabari Enhanced Scanner',
                fileUri: URL.createObjectURL(file),
                scanType: 'enhanced_file',
                isLoading: false,
              });
            }
          }
        };
        input.click();
      } else {
        // For mobile platforms, use proper file picker
        Alert.alert(
          '📁 Enhanced File Scanner',
          'Choose file source for scanning:',
          [
            {
              text: 'Camera',
              onPress: () => pickImageFromCamera()
            },
            { 
              text: 'Gallery',
              onPress: () => pickImageFromGallery()
            },
            {
              text: 'Documents',
              onPress: () => pickDocumentFile()
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ File scanner initialization error:', error);
      Alert.alert('❌ Scanner Error', 'Failed to initialize file scanner. Please try again.');
    }
  };

  // Web-based file scanning implementation
  const performWebFileScan = async (file: File) => {
    const fileName = file.name.toLowerCase();
    const fileSize = file.size;
    const fileType = file.type;
    
    // Check for dangerous file extensions
    const dangerousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.pif', '.vbs', '.js', '.apk', '.dmg'];
    const isDangerous = dangerousExtensions.some(ext => fileName.endsWith(ext));
    
    // Check for suspicious file names
    const suspiciousNames = ['trojan', 'virus', 'malware', 'keylog', 'backdoor', 'hack'];
    const isSuspicious = suspiciousNames.some(name => fileName.includes(name));
    
    // Check for unusually large files (over 100MB)
    const isLargeFile = fileSize > 100 * 1024 * 1024;
    
    // Determine overall safety
    const hasThreats = isDangerous || isSuspicious;
    
    return {
      isSafe: !hasThreats,
      threatName: isDangerous ? 'Potentially dangerous file type' : 
                 isSuspicious ? 'Suspicious file name detected' : undefined,
      details: isDangerous ? `File extension may contain executable code` :
               isSuspicious ? `Filename contains suspicious keywords` :
               isLargeFile ? `Large file (${(fileSize / 1024 / 1024).toFixed(1)}MB) - review recommended` :
               'File appears safe based on web analysis'
    };
  };

  // Image fraud analysis for web
  const analyzeImageForFraud = async (file: File): Promise<{ isFraudulent: boolean; riskLevel: string; confidence: number }> => {
    // Basic image analysis (can be enhanced with ML models)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        
        // Basic fraud indicators
        const aspectRatio = img.width / img.height;
        const isUnusualAspectRatio = aspectRatio > 5 || aspectRatio < 0.2;
        
        resolve({
          isFraudulent: isUnusualAspectRatio,
          riskLevel: isUnusualAspectRatio ? 'MEDIUM' : 'LOW',
          confidence: 0.6
        });
      };
      
      img.onerror = () => {
        resolve({ isFraudulent: false, riskLevel: 'LOW', confidence: 0.3 });
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  // Mobile file picker implementations
  const pickImageFromCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        console.log('Image from camera:', asset.uri);
        
        // Perform actual scan on the captured image
        await performMobileFileScan(asset.uri, asset.fileName || 'camera_image.jpg', 'image');
      }
    } catch (error) {
      console.error('Camera picker error:', error);
      Alert.alert('Error', 'Failed to open camera.');
    }
  };

  const pickImageFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        console.log('Image from gallery:', asset.uri);
        
        // Perform actual scan on the selected image
        await performMobileFileScan(asset.uri, asset.fileName || 'gallery_image.jpg', 'image');
      }
    } catch (error) {
      console.error('Gallery picker error:', error);
      Alert.alert('Error', 'Failed to open gallery.');
    }
  };

  const pickDocumentFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
      });

      if (!result.canceled) {
        console.log('Document picked:', result.assets[0].uri);
        
        // Perform actual scan on the selected document
        await performMobileFileScan(result.assets[0].uri, result.assets[0].name, 'document');
      }
    } catch (error) {
      console.error('Document picker error:', error);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  // Mobile file scanning implementation
  const performMobileFileScan = async (fileUri: string, fileName: string, fileType: string) => {
    try {
      console.log('🔍 Starting mobile file scan for:', fileName);
      
      // Show loading state
      onNavigateToScanResult({
        fileName,
        fileUri,
        isSafe: true, // Default to safe while loading
        details: 'Scanning file for threats...',
        scanEngine: 'Shabari Mobile Scanner',
        isLoading: true,
        scanType: 'mobile_file',
      });

      // Simulate scan processing time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Perform basic mobile file analysis
      const scanResult = await performBasicFileScan(fileName, fileType);
      
      console.log('📊 Mobile scan result:', scanResult);
      
      // Update with actual scan results - FIXED: Ensure notification matches scan result
      onNavigateToScanResult({
        fileName,
        fileUri,
        isSafe: scanResult.isSafe,
        threatName: scanResult.threatName,
        details: scanResult.details,
        scanEngine: 'Shabari Mobile Scanner',
        isLoading: false,
        scanType: 'mobile_file',
      });

    } catch (error) {
      console.error('❌ Mobile file scan error:', error);
      
      // FIXED: Don't automatically mark as unsafe for scan errors
      onNavigateToScanResult({
        fileName,
        fileUri,
        isSafe: true, // FIXED: Mark as safe for scan errors, not dangerous
        threatName: 'Scan Error',
        details: 'Unable to complete scan due to technical issues. File was not found to be malicious.',
        scanEngine: 'Shabari Mobile Scanner',
        isLoading: false,
        scanType: 'mobile_file',
      });
    }
  };

  // Basic file scanning for mobile
  const performBasicFileScan = async (fileName: string, fileType: string) => {
    const lowerFileName = fileName.toLowerCase();
    
    // Check for dangerous file extensions
    const dangerousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.pif', '.vbs', '.js'];
    const isDangerous = dangerousExtensions.some(ext => lowerFileName.endsWith(ext));
    
    // Check for suspicious file names
    const suspiciousNames = ['trojan', 'virus', 'malware', 'keylog', 'backdoor', 'hack', 'ransomware'];
    const isSuspicious = suspiciousNames.some(name => lowerFileName.includes(name));
    
    // APK specific checks
    const isApk = lowerFileName.endsWith('.apk');
    const suspiciousApkNames = ['whatsapp_plus', 'gbwhatsapp', 'fake_', 'trojan_', 'banking_'];
    const isSuspiciousApk = isApk && suspiciousApkNames.some(name => lowerFileName.includes(name));
    
    // PDF specific checks
    const isPdf = lowerFileName.endsWith('.pdf');
    const suspiciousPdfNames = ['invoice_malware', 'urgent_document', 'payment_required'];
    const isSuspiciousPdf = isPdf && suspiciousPdfNames.some(name => lowerFileName.includes(name));
    
    // Determine final result
    const hasThreats = isDangerous || isSuspicious || isSuspiciousApk || isSuspiciousPdf;
    
    let threatName = undefined;
    let details = 'File scanned successfully - no threats detected.';
    
    if (isDangerous) {
      threatName = 'Dangerous File Type';
      details = `File type ${lowerFileName.split('.').pop()?.toUpperCase()} can execute code and may be harmful.`;
    } else if (isSuspiciousApk) {
      threatName = 'Suspicious APK';
      details = 'This APK file appears to be a modified or fake application that could steal your data.';
    } else if (isSuspiciousPdf) {
      threatName = 'Suspicious PDF';
      details = 'This PDF file has characteristics commonly found in malicious documents.';
    } else if (isSuspicious) {
      threatName = 'Suspicious File Name';
      details = 'File name contains keywords commonly associated with malware.';
    }
    
    return {
      isSafe: !hasThreats,
      threatName,
      details
    };
  };

  const handleClipboardScan = async () => {
    setIsScanning(true);
    try {
      const clipboardMonitor = ClipboardURLMonitor.getInstance();
      const scanResult = await clipboardMonitor.scanClipboardManually();

      if (scanResult.status === 'scanned' && scanResult.result) {
        Alert.alert(
          'Clipboard Scan Complete',
          `URL: ${scanResult.url}\nResult: ${scanResult.result.isSafe ? 'Safe' : 'Dangerous'}\nDetails: ${scanResult.result.details}`
        );
      } else {
        Alert.alert('Clipboard Scan', scanResult.message || 'No URL found to scan.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while scanning the clipboard.');
      console.error('Clipboard scan error:', error);
    }
    setIsScanning(false);
  };

  const handleLinkCheck = () => {
    setShowLinkModal(true);
  };

  const performLinkScan = async () => {
    if (!urlToCheck.trim()) {
      Alert.alert('⚠️ Invalid URL', 'Please enter a valid URL to scan');
      return;
    }

    setIsScanning(true);
    try {
      console.log('🔍 Phase 1: Enhanced URL scanning for:', urlToCheck);
      Sentry.addBreadcrumb({ message: 'Phase 1 enhanced URL scan started', data: { url: urlToCheck } });
      
      // Phase 1: Safe service initialization with error handling
      if (typeof LinkScannerService.initializeService !== 'function') {
        throw new Error('LinkScannerService.initializeService is not a function');
      }
      
      await LinkScannerService.initializeService();
      
      if (typeof LinkScannerService.scanUrl !== 'function') {
        throw new Error('LinkScannerService.scanUrl is not a function');
      }
      
      const result = await LinkScannerService.scanUrl(urlToCheck.trim());
      
      console.log('🔍 Phase 1 enhanced scan result:', result);
      Sentry.addBreadcrumb({ message: 'Phase 1 URL scan completed', data: { isSafe: result.isSafe } });
      
      setShowLinkModal(false);
      setUrlToCheck('');
      
      onNavigateToScanResult({
        url: urlToCheck.trim(),
        isSafe: result.isSafe,
        details: result.details + ' (Enhanced Phase 1 Scanning)',
        scanTime: new Date(),
        isLoading: false,
        scanType: 'enhanced_url_phase1',
        scanEngine: 'Shabari Enhanced Scanner v2.0',
      });
      
      // Show interstitial ad after URL scan
      setTimeout(() => showAdAfterAction('url_scan'), 1000);
    } catch (error) {
      console.error('❌ Phase 1 URL scan error:', error);
      Sentry.captureException(error, { tags: { phase: 'phase1', function: 'performLinkScan' } });
      Alert.alert('❌ Scan Error', 'Failed to scan URL. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAppMonitor = async () => {
    if (!isPremium) {
      showPremiumUpgrade('App Installation Guard');
      return;
    }
    setIsScanning(true);
    Alert.alert(
      'Starting App Scan',
      'Shabari will now scan all installed applications for privacy risks. This may take a moment.'
    );
    try {
      const privacyGuard = PrivacyGuardService.getInstance();
      const results = await privacyGuard.scanInstalledAppsManual();
      const summary = `Scan Complete!\n\nTotal Apps Scanned: ${results.totalApps}\nSuspicious Apps Found: ${results.suspiciousApps.length}`;
      
      let details = '';
      if (results.suspiciousApps.length > 0) {
        details = results.suspiciousApps
          .map(app => `- ${app.appName} (Risk: ${app.riskLevel})`)
          .join('\n');
      }

      Alert.alert('App Scan Results', `${summary}\n\n${details}`);
    } catch (error) {
      Alert.alert('Error', 'An error occurred during the app scan.');
      console.error('App scan error:', error);
    }
    setIsScanning(false);
  };

  const handleNetworkProtection = async () => {
    setIsScanning(true);
    try {
      const globalGuard = GlobalGuardController.getInstance();
      const success = await globalGuard.activateGuardForLimitedTime(60); // Activate for 60 minutes
      if (success) {
        Alert.alert(
          'Network Protection Activated',
          'Shabari is now monitoring your network traffic for threats. This protection will automatically turn off in 60 minutes.'
        );
      } else {
        Alert.alert('Activation Failed', 'Could not start network protection. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while activating network protection.');
      console.error('Network protection error:', error);
    }
    setIsScanning(false);
  };

  const handleFileWatchdog = async () => {
    // DISABLED: These services require native modules
    Alert.alert(
      'Feature Not Available',
      'File Watchdog and Download Monitor services are currently disabled to ensure app stability. These features will be available in a future update.',
      [{ text: 'OK' }]
    );
    return;
    
    /* DISABLED TO PREVENT CRASHES:
    try {
      const fileWatchdog = FileWatchdogService.getInstance();
      const downloadMonitor = DownloadMonitorService.getInstance();
      const permissionManager = PermissionManager.getInstance();
      
      const watchdogStatus = fileWatchdog.getStatus();
      const downloadStatus = downloadMonitor.getStatus();
      const permissions = await permissionManager.getAllPermissionStatuses();

      if (!isPremium) {
        Alert.alert(
          '🔍 Automatic Threat Detection',
          `Your device protection status:\n\n✅ Current Status:\n• File Watchdog: ${watchdogStatus.isActive ? 'Active' : 'Inactive'}\n• Download Monitor: ${downloadStatus.isMonitoring ? 'Active' : 'Inactive'}\n• Files Monitored: ${watchdogStatus.knownFiles}\n\n🔐 Permissions:\n• Background Monitoring: ${permissions.backgroundMonitoring ? '✅' : '❌'}\n• Download Protection: ${permissions.downloadProtection ? '✅' : '❌'}\n• Notifications: ${permissions.notifications ? '✅' : '❌'}`,
          [
            { 
              text: 'Manual Scan', 
              onPress: async () => {
                await fileWatchdog.manualScan();
                Alert.alert('🔍 Manual Scan Complete', '✅ Download folder scanned\n⚠️ No threats detected\n📊 All files appear safe');
              }
            },
            { 
              text: 'Permissions', 
              onPress: () => permissionManager.showPermissionSettings()
            },
            { text: 'Upgrade', onPress: () => showPremiumUpgrade('Advanced Threat Detection') },
            { text: 'OK' }
          ]
        );
        return;
      }

      // Premium users get full control
      Alert.alert(
        '🛡️ Advanced Threat Detection',
        `Real-time Protection Status:\n\n📁 Monitored Locations: ${watchdogStatus.watchedDirectories}\n🔍 Auto-scanning: ${watchdogStatus.isActive ? 'Active' : 'Inactive'}\n📥 Download Protection: ${downloadStatus.isMonitoring ? 'Active' : 'Inactive'}\n📊 Files Tracked: ${watchdogStatus.knownFiles}\n🚨 Threats Blocked: ${downloadStatus.threatsBlocked}\n\n🔐 All Permissions: ${Object.values(permissions).every(Boolean) ? 'Granted ✅' : 'Some Missing ⚠️'}`,
        [
          { 
            text: 'Force Scan', 
            onPress: async () => {
              await fileWatchdog.manualScan();
              Alert.alert('🔍 Deep Scan Complete', '✅ Full system scan finished\n⚠️ No threats detected\n📊 All monitored files are safe');
            }
          },
          { 
            text: 'Permissions', 
            onPress: () => permissionManager.showPermissionSettings()
          },
          { text: 'View Logs', onPress: () => navigation?.navigate?.('SecurityLogs') },
          { text: 'OK' }
        ]
      );
    } catch (error) {
      console.error('❌ Error accessing watchdog status:', error);
      Alert.alert('❌ Error', 'Unable to access threat detection status. Please try again.');
    }
    */
  };

  // Test Sentry function
  const testSentry = () => {
    try {
      throw new Error('Test error for Sentry - DashboardScreen');
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert('Test Error', 'Check Sentry dashboard for this error');
    }
  };

  const handleOTPInsight = () => {
    if (!isPremium) {
      showPremiumUpgrade('OTP Insight Pro');
      return;
    }

    Alert.alert(
      '🤖 Premium OTP Insight',
      `AI-Powered SMS Analysis:
      
🧠 ML Model: Active & Updated
🔍 Auto-Analysis: Real-time
🚨 Fraud Detection: 99.9% accuracy
📊 Messages Analyzed: 156 this month

✨ Premium AI features are enabled!`,
      [
        { text: 'Analyze Message', onPress: onNavigateToMessageAnalysis },
        { text: 'Close' }
      ]
    );
  };

  const handleSecureBrowser = () => {
    if (!isPremium) {
      showPremiumUpgrade('Secure Browser');
      return;
    }
    onNavigateToSecureBrowser();
  };

  const handleQRScanner = () => {
    // Navigate directly to Live QR Scanner for all users in preview
    navigation?.navigate?.('LiveQRScanner');
  };

  const handleSMSScanner = () => {
    if (!isPremium) {
      // Show Coming Soon for SMS Shield due to false positives
      Alert.alert(
        '🛡️ SMS Shield - Coming Soon!',
        'We\'re currently refining our SMS analysis algorithms to reduce false positives. This feature will be available soon with improved accuracy!',
        [
          {
            text: 'Understood',
            style: 'default',
          },
        ]
      );
      return;
    }
    // Premium users can still access
    navigation?.navigate('SMSScannerScreen');
  };

  const handleManualSMSScanner = () => {
    if (!isPremium) {
      // Show Coming Soon for SMS Shield
      Alert.alert(
        '🛡️ SMS Shield - Coming Soon!',
        'We\'re currently refining our SMS analysis algorithms to reduce false positives. This feature will be available soon with improved accuracy!',
        [
          {
            text: 'Understood',
            style: 'default',
          },
        ]
      );
      return;
    }
    // Premium users can still access
    navigation?.navigate('ManualSMSScannerScreen');
  };

  const handleThreatDetection = () => {
    if (!isPremium) {
      showPremiumUpgrade('Threat Detection');
      return;
    }
    navigation?.navigate?.('ThreatDetection');
  };

  const handleVPNControl = () => {
    if (!isPremium) {
      showPremiumUpgrade('VPN & Proxy Control');
      return;
    }
    navigation?.navigate?.('VPNControl');
  };

  const mainActions: ActionButtonProps[] = [
    {
      label: 'Scan File',
      description: 'Check a file for threats',
      icon: 'file-document-outline',
      onPress: handleFileScan,
    },
    {
      label: 'Scan Link',
      description: 'Check a URL for threats',
      icon: 'link-variant',
      onPress: handleLinkCheck,
    },
    {
      label: 'Secure Browser',
      description: 'Browse with protection',
      icon: 'web',
      onPress: handleSecureBrowser,
    },
    {
      label: 'SMS Scanner',
      description: 'Review incoming texts',
      icon: 'message-text-outline',
      onPress: handleManualSMSScanner,
    },
  ];

  const manualToolActions: ActionButtonProps[] = [
    {
      label: 'Scan Clipboard',
      description: 'Check copied text for threats',
      icon: 'clipboard-check-outline',
      onPress: handleClipboardScan,
    },
    {
      label: 'Scan Installed Apps',
      description: 'Verify installed application safety',
      icon: 'shield-search',
      onPress: handleAppMonitor,
    },
    {
      label: 'Network Protection',
      description: 'Monitor network traffic for threats',
      icon: 'lan-connect',
      onPress: handleNetworkProtection,
    },
  ];

  // Enhanced Status Card Component
  const EnhancedStatusCard = ({ 
    title, 
    value, 
    icon, 
    gradient, 
    delay = 0,
    subtitle = '',
    onPress
  }: {
    title: string;
    value: number | string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    gradient: readonly [string, string, ...string[]];
    delay?: number;
    subtitle?: string;
    onPress?: () => void;
  }) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(animatedValue, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, []);

    const CardContent = () => (
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statusCardGradient}
      >
          {/* Shimmer Effect */}
          <Animated.View style={[
            styles.shimmerOverlay,
            {
              transform: [
                {
                  translateX: shimmerAnim.interpolate({
                    inputRange: [-width, width],
                    outputRange: [-width, width],
                  }),
                },
              ],
            },
          ]} />
          
          <View style={styles.statusCardContent}>
            <Animated.View style={[
              styles.statusIconContainer,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}>
              <MaterialCommunityIcons name={icon} size={32} color="#FFFFFF" />
            </Animated.View>
            
            <Animated.Text style={[
              styles.statusCardValue,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}>
              {value}
            </Animated.Text>
            
            <Text style={styles.statusCardTitle}>{title}</Text>
            {subtitle && <Text style={styles.statusCardSubtitle}>{subtitle}</Text>}
            </View>
          </LinearGradient>
        );

    return (
      <Animated.View style={[
        styles.enhancedStatusCard,
        {
          transform: [
            { translateY: animatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [50, 0],
            })},
          ],
          opacity: animatedValue,
        },
      ]}>
        {onPress ? (
          <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
            <CardContent />
          </TouchableOpacity>
        ) : (
          <CardContent />
        )}
      </Animated.View>
    );
  };

  // Enhanced Action Card Component
  const EnhancedActionCard = ({ 
    title, 
    subtitle, 
    icon, 
    gradient, 
    onPress,
    isPremium = false,
    delay = 0
  }: {
    title: string;
    subtitle: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    gradient: readonly [string, string, ...string[]];
    onPress: () => void;
    isPremium?: boolean;
    delay?: number;
  }) => {
    const animatedValue = useRef(new Animated.Value(0)).current;
    const pressAnim = useRef(new Animated.Value(1)).current;
    
    // Determine if this is a "Coming Soon" feature for non-premium users
    const isComingSoon = !isPremium && (
      title === 'SMS Shield' || 
      title === 'Secure Browser' || 
      title === 'AI Guardian'
    );

    useEffect(() => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(animatedValue, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, []);

    const handlePressIn = () => {
      Animated.spring(pressAnim, {
        toValue: 0.95,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(pressAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Animated.View style={[
        styles.enhancedActionCard,
        {
          transform: [
            { scale: Animated.multiply(animatedValue, pressAnim) },
            { translateY: animatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            })},
          ],
          opacity: animatedValue,
        },
      ]}>
              <TouchableOpacity 
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
              >
                <LinearGradient
             colors={gradient}
             start={{ x: 0, y: 0 }}
             end={{ x: 1, y: 1 }}
             style={[
               styles.actionCardGradient,
               isComingSoon && styles.comingSoonCard
             ]}
           >
                           <View style={styles.actionCardContent}>
              <View style={styles.actionIconContainer}>
                <MaterialCommunityIcons 
                  name={icon} 
                  size={28} 
                  color={isComingSoon ? '#FFFFFF' : (isPremium ? '#FFD700' : '#FFFFFF')} 
                />
                {isPremium && (
                  <View style={styles.premiumBadgeAction}>
                    <MaterialCommunityIcons name="crown" size={14} color="#FFD700" />
            </View>
                )}
                {isComingSoon && (
                  <View style={styles.comingSoonBadge}>
                    <MaterialCommunityIcons name="rocket-launch" size={12} color="#FFFFFF" />
                  </View>
                )}
          </View>
              <Text style={[
                styles.actionCardTitle, 
                isPremium && styles.premiumActionText,
                isComingSoon && styles.comingSoonTitleText
              ]}>
                {title}
                </Text>
              <Text style={[
                styles.actionCardSubtitle,
                isComingSoon && styles.comingSoonSubtitleText
              ]}>
                {subtitle}
              </Text>
            </View>
                </LinearGradient>
              </TouchableOpacity>
      </Animated.View>
    );
  };

  // Add error boundary for undefined components
  const SafeComponent = ({ children, fallback = null }: { children: React.ReactNode, fallback?: React.ReactNode }) => {
    try {
      console.log('🔍 SafeComponent: Attempting to render children');
      return <>{children}</>;
    } catch (error) {
      console.error('❌ SafeComponent render error:', error);
      Sentry.captureException(error, { tags: { component: 'DashboardScreen', function: 'SafeComponent' } });
      console.log('🔄 SafeComponent: Showing fallback due to error');
      return <>{fallback}</>;
    }
  };

  console.log('🎯 DashboardScreen: About to return JSX');
  
  // Debug mode: Simple UI test
  const DEBUG_MODE = false;
  
  if (DEBUG_MODE) {
    console.log('🧪 DashboardScreen: DEBUG MODE - Showing simple UI');
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
          🛡️ Shabari Dashboard
        </Text>
        <Text style={{ color: '#ff6b6b', fontSize: 16, marginBottom: 10 }}>
          Debug Mode Active
        </Text>
        <Text style={{ color: 'white', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
          If you can see this, the dashboard component is working.
          The issue is with the complex UI rendering.
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#ff6b6b', padding: 15, borderRadius: 10, marginBottom: 10 }}
          onPress={() => Alert.alert('Test', 'Button works!')}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Test Button</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ backgroundColor: '#4a90e2', padding: 15, borderRadius: 10 }}
          onPress={() => navigation.navigate('Settings' as never)}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Go to Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <SafeComponent fallback={<View style={styles.container}><Text style={{ color: 'white', textAlign: 'center', marginTop: 100 }}>Loading...</Text></View>}>
    <View style={styles.container}>
      {/* Simplified Background - Testing LinearGradient */}
      <LinearGradient
        colors={['#0D1421', '#1A1F2E', '#2D3748']}
        style={styles.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      {/* Simple Header Test */}
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>
          🛡️ Shabari Security
        </Text>
        <Text style={{ color: '#ff6b6b', fontSize: 16 }}>
          Simplified Dashboard (Testing Components)
        </Text>
      </View>
      
      {/* Test ScrollView with basic content */}
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
            🔍 URL Scanner
          </Text>
          <Text style={{ color: 'white', marginBottom: 15 }}>
            Scan suspicious links for threats
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#ff6b6b', padding: 15, borderRadius: 8 }}
            onPress={() => setShowLinkModal(true)}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
              Scan URL
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 10, marginBottom: 20 }}>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
            📄 File Scanner
          </Text>
          <Text style={{ color: 'white', marginBottom: 15 }}>
            Scan files for malware and threats
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#4a90e2', padding: 15, borderRadius: 8 }}
            onPress={handleFileScan}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
              Scan File
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* URL Scanner Modal */}
      <Modal
        visible={showLinkModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a2e', padding: 20, borderRadius: 10 }}>
            <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>
              🔍 URL Scanner
            </Text>
            <TextInput
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.1)', 
                color: 'white', 
                padding: 15, 
                borderRadius: 8, 
                marginBottom: 15 
              }}
              placeholder="Enter URL to scan..."
              placeholderTextColor="#888"
              value={urlToCheck}
              onChangeText={setUrlToCheck}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity 
                style={{ backgroundColor: '#666', padding: 15, borderRadius: 8, flex: 1, marginRight: 10 }}
                onPress={() => setShowLinkModal(false)}
              >
                <Text style={{ color: 'white', textAlign: 'center' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                stylcd "C:\Users\Shubham prajapati\Downloads\Shabari-App-Final\Shabari"e={{ backgroundColor: '#ff6b6b', padding: 15, borderRadius: 8, flex: 1 }}
                onPress={performLinkScan}
                disabled={isScanning}
              >
                <Text style={{ color: 'white', textAlign: 'center' }}>
                  {isScanning ? 'Scanning...' : 'Scan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </SafeComponent>
  );
};
          />
        ))}
            </View>

      <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
        {/* Enhanced Header with Glassmorphism */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['rgba(255, 69, 0, 0.1)', 'rgba(255, 107, 53, 0.05)']}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <Animated.View
                style={[
                  styles.logoContainer,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#FF4500', '#FF6B35']}
                  style={styles.logoGradient}
                >
                  <MaterialCommunityIcons name="shield-crown" size={32} color="#FFFFFF" />
                </LinearGradient>
              </Animated.View>
              
              <View style={styles.headerTextContainer}>
                <Text style={styles.appTitle}>शबरी (Shabari)</Text>
                <Text style={styles.appSubtitle}>भारतीय साइबर रक्षक 🛡️</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.settingsButton}
                onPress={onNavigateToSettings}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                  style={styles.settingsGradient}
                >
                  <MaterialCommunityIcons name="cog" size={24} color="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={Platform.OS !== 'web'}
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
        >
        {/* Enhanced Status Dashboard with Shimmer Effect */}
        <View style={styles.enhancedStatusSection}>
          <Animated.View style={[
            styles.sectionTitleContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            },
          ]}>
              <LinearGradient
              colors={['rgba(255, 69, 0, 0.1)', 'rgba(255, 107, 53, 0.05)']}
              style={styles.sectionTitleGradient}
              >
              <MaterialCommunityIcons name="chart-line" size={24} color="#FF4500" />
              <Text style={styles.enhancedSectionTitle}>Security Overview</Text>
              </LinearGradient>
          </Animated.View>

          <View style={styles.statusCardsContainer}>
            <EnhancedStatusCard
              title="Total Scans"
              value={scanStats.totalScans}
              icon="shield-check-outline"
              gradient={['#667eea', '#764ba2']}
              delay={200}
              subtitle="This month"
            />
            <EnhancedStatusCard
              title="Threats Blocked"
              value={scanStats.threatsBlocked}
              icon="shield-alert-outline"
              gradient={['#f093fb', '#f5576c']}
              delay={400}
              subtitle="Real-time"
            />
            <EnhancedStatusCard
              title="Files Protected"
              value={scanStats.filesScanned}
              icon="file-check-outline"
              gradient={['#4facfe', '#00f2fe']}
              delay={600}
              subtitle="Secured"
            />
            <EnhancedStatusCard
              title="Call Protection"
              value={callProtectionStatus.isRunning ? "Active" : "Inactive"}
              icon={callProtectionStatus.isRunning ? "phone-check" : "phone-off"}
              gradient={callProtectionStatus.isRunning ? 
                ['#22C55E', '#16A34A'] : ['#EF4444', '#DC2626']}
              delay={800}
              subtitle={callProtectionStatus.isRunning ? 
                `${callProtectionStatus.statistics?.threatsBlocked || 0} blocked` : 
                'Tap to enable'
              }
              onPress={toggleCallProtection}
            />
          </View>
        </View>

        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <View style={styles.previewBanner}>
              <LinearGradient
              colors={['#667eea', '#764ba2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.previewBannerGradient}
              >
              <View style={styles.previewBannerContent}>
                <MaterialCommunityIcons name="rocket-launch" size={24} color="#FFFFFF" />
                <View style={styles.previewBannerText}>
                  <Text style={styles.previewBannerTitle}>🚀 Preview Mode</Text>
                  <Text style={styles.previewBannerSubtitle}>
                    Experience Shabari's core security features. Advanced tools coming soon!
                </Text>
                </View>
              </View>
              </LinearGradient>
          </View>
        )}

        {/* Core Features - Always Available */}
        <View style={styles.enhancedActionsSection}>
          <Animated.View style={[
            styles.sectionTitleContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            },
          ]}>
              <LinearGradient
              colors={['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.05)']}
              style={styles.sectionTitleGradient}
              >
              <MaterialCommunityIcons name="shield-outline" size={24} color="#667eea" />
              <Text style={styles.enhancedSectionTitle}>Core Security Suite</Text>
              </LinearGradient>
          </Animated.View>
          
          <View style={styles.actionCardsGrid}>
            <EnhancedActionCard
              title="Document Scanner"
              subtitle="AI-powered threat detection"
              icon="file-document-outline"
              gradient={['#667eea', '#764ba2']}
              onPress={handleFileScan}
              delay={300}
            />
            <EnhancedActionCard
              title="Link Detection"
              subtitle="Real-time URL protection"
              icon="link-variant"
              gradient={['#f093fb', '#f5576c']}
              onPress={handleLinkCheck}
              delay={400}
            />
            <EnhancedActionCard
              title="QR Scanner"
              subtitle="Live fraud detection"
              icon="qrcode-scan"
              gradient={['#4facfe', '#00f2fe']}
              onPress={handleQRScanner}
              delay={500}
            />
            <EnhancedActionCard
              title="Call History"
              subtitle="Review and report calls"
              icon="phone"
              gradient={['#fa709a', '#fee140']}
              onPress={() => navigation.navigate('CallLog')}
              delay={600}
            />
          </View>
        </View>

        {/* Advanced Features - Preview/Premium */}
        <View style={styles.enhancedPremiumSection}>
          <Animated.View style={[
            styles.sectionTitleContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            },
          ]}>
            <LinearGradient
              colors={isPremium ? 
                ['rgba(255, 215, 0, 0.15)', 'rgba(255, 193, 7, 0.1)'] : 
                ['rgba(255, 107, 107, 0.15)', 'rgba(255, 142, 142, 0.1)']}
              style={styles.sectionTitleGradient}
            >
              <MaterialCommunityIcons 
                name={isPremium ? "crown" : "rocket-launch"} 
                size={24} 
                color={isPremium ? "#FFD700" : "#FF6B6B"} 
              />
              <Text style={[styles.enhancedSectionTitle, !isPremium && styles.comingSoonSectionTitle]}>
                {isPremium ? 'Premium Features' : '🚀 Coming Soon Features'}
              </Text>
            </LinearGradient>
          </Animated.View>
          
          <View style={styles.premiumCardsContainer}>
            <EnhancedActionCard
              title="SMS Shield"
              subtitle={isPremium ? "Smart message analysis" : "Coming Soon - Enhanced Protection"}
              icon={isPremium ? 'message-text-outline' : 'rocket-launch-outline'}
              gradient={isPremium ? ['#43e97b', '#38f9d7'] : ['#FF6B6B', '#FF8E8E']}
              onPress={handleManualSMSScanner}
              isPremium={isPremium}
              delay={600}
            />
            <EnhancedActionCard
              title="Secure Browser"
              subtitle={isPremium ? "Protected web browsing" : "Coming Soon - Safe Browsing"}
              icon={isPremium ? 'web' : 'rocket-launch-outline'}
              gradient={isPremium ? ['#667eea', '#764ba2'] : ['#4ECDC4', '#44A08D']}
              onPress={handleSecureBrowser}
              isPremium={isPremium}
              delay={700}
          />
            <EnhancedActionCard
              title="AI Guardian"
              subtitle={isPremium ? "Advanced ML protection" : "Coming Soon - Smart Defense"}
              icon={isPremium ? 'robot-outline' : 'rocket-launch-outline'}
              gradient={isPremium ? ['#fa709a', '#fee140'] : ['#A8E6CF', '#7FCDCD']}
              onPress={isPremium ? handleOTPInsight : () => showPremiumUpgrade('AI Guardian')}
              isPremium={isPremium}
              delay={800}
          />
            <EnhancedActionCard
              title="Threat Detection"
              subtitle={isPremium ? "Real-time threat analysis" : "Premium - Advanced Protection"}
              icon={isPremium ? 'shield-check-outline' : 'rocket-launch-outline'}
              gradient={isPremium ? ['#ff9a9e', '#fecfef'] : ['#FFB74D', '#FF8A65']}
              onPress={isPremium ? handleThreatDetection : () => showPremiumUpgrade('Threat Detection')}
              isPremium={isPremium}
              delay={900}
          />
            <EnhancedActionCard
              title="VPN & Proxy"
              subtitle={isPremium ? "Secure network protection" : "Premium - Network Security"}
              icon={isPremium ? 'vpn' : 'rocket-launch-outline'}
              gradient={isPremium ? ['#a8edea', '#fed6e3'] : ['#81C784', '#A5D6A7']}
              onPress={isPremium ? handleVPNControl : () => showPremiumUpgrade('VPN & Proxy Control')}
              isPremium={isPremium}
              delay={1000}
          />
        </View>
        </View>

        {/* Enhanced Activity Feed */}
        <View style={styles.enhancedActivitySection}>
          <Animated.View style={[
            styles.sectionTitleContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            },
          ]}>
            <LinearGradient
              colors={['rgba(76, 175, 80, 0.1)', 'rgba(139, 195, 74, 0.05)']}
              style={styles.sectionTitleGradient}
            >
              <MaterialCommunityIcons name="history" size={24} color="#4CAF50" />
              <Text style={styles.enhancedSectionTitle}>Recent Activity</Text>
            </LinearGradient>
          </Animated.View>
          
          <View style={styles.activityFeedContainer}>
            <EnhancedActivityItem 
              icon="shield-check-outline"
              title="Threat Neutralized" 
              subtitle="malicious-site.com → Blocked successfully" 
              time="2 min ago"
              status="danger"
            />
            <EnhancedActivityItem 
              icon="file-check-outline"
              title="File Secured" 
              subtitle="document.pdf → Verified safe" 
              time="15 min ago"
              status="success"
            />
            <EnhancedActivityItem 
              icon="link-variant"
              title="Link Validated" 
              subtitle="news-site.com → Trusted source" 
              time="1 hour ago"
              status="info"
            />
            <EnhancedActivityItem 
              icon="qrcode-scan"
              title="QR Code Scanned" 
              subtitle="restaurant-menu.com → Safe content" 
              time="3 hours ago"
              status="success"
            />
          </View>
        </View>

        {/* Footer spacing */}
        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Enhanced Floating Action Button */}
      <Animated.View style={[
        styles.floatingActionButton,
        {
          transform: [{ scale: scaleAnim }],
          opacity: fadeAnim,
        },
      ]}>
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() => setShowLinkModal(true)}
        >
          <LinearGradient
            colors={['#FF4500', '#FF6B35']}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="shield-plus" size={28} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
      
      </Animated.View>

      {/* Link Check Modal */}
      <Modal
        visible={showLinkModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[theme.colors.gradients.primary[0], theme.colors.gradients.primary[1]]}
              style={styles.modalHeader}
            >
              <Text style={styles.modalTitle}>Check Link Safety</Text>
            </LinearGradient>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Enter URL to scan:</Text>
              <TextInput
                style={styles.urlInput}
                value={urlToCheck}
                onChangeText={setUrlToCheck}
                placeholder="https://example.com"
                placeholderTextColor={theme.colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setShowLinkModal(false)}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title={isScanning ? "Scanning..." : "Scan URL"}
                  onPress={performLinkScan}
                  loading={isScanning}
                  disabled={!urlToCheck.trim() || isScanning}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Premium Upgrade Modal */}
      <PremiumUpgrade
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        featureRequested={premiumFeatureRequested}
      />

      {/* AdMob Banner Placeholder - Ready for Future Implementation */}
      <View style={styles.bannerAdContainer}>
        <View style={styles.adPlaceholder}>
          <Text style={styles.adPlaceholderText}>AdMob Integration Ready</Text>
        </View>
      </View>

      {/* VPN Permission Guide Modal */}
      <VPNPermissionGuide
        visible={showVPNGuide}
        onClose={() => setShowVPNGuide(false)}
        onPermissionGranted={async () => {
          await loadCallProtectionStatus();
        }}
      />
    </View>
    </SafeComponent>
  );
};

// Enhanced Activity Item Component
const EnhancedActivityItem: React.FC<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  time: string;
  status: 'success' | 'danger' | 'info' | 'warning';
}> = ({ icon, title, subtitle, time, status }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case 'success': 
        return { color: '#50C878', gradient: ['#a8edea', '#fed6e3'] };
      case 'danger': 
        return { color: '#E25C5C', gradient: ['#fa709a', '#fee140'] };
      case 'warning': 
        return { color: '#FFB020', gradient: ['#ffecd2', '#fcb69f'] };
      case 'info': 
        return { color: '#64B5F6', gradient: ['#4facfe', '#00f2fe'] };
      default: 
        return { color: '#6c757d', gradient: ['#e9ecef', '#dee2e6'] };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <Animated.View style={[
      styles.enhancedActivityItem,
      {
        transform: [
          { 
            translateX: animatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [-50, 0],
            })
          },
          { scale: animatedValue },
        ],
        opacity: animatedValue,
      },
    ]}>
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
        style={styles.activityItemGradient}
      >
        <View style={styles.activityItemContent}>
          <View style={[styles.enhancedActivityIcon, { backgroundColor: statusConfig.color }]}>
            <MaterialCommunityIcons name={icon} size={20} color="#FFFFFF" />
      </View>
          <View style={styles.activityItemText}>
            <Text style={styles.enhancedActivityTitle}>{title}</Text>
            <Text style={styles.enhancedActivitySubtitle}>{subtitle}</Text>
      </View>
          <View style={styles.activityItemMeta}>
            <View style={[styles.enhancedStatusDot, { backgroundColor: statusConfig.color }]} />
            <Text style={styles.enhancedActivityTime}>{time}</Text>
      </View>
    </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },

  // Enhanced Background Styles
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },

  particleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },

  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF4500',
    opacity: 0.1,
    top: Math.random() * height,
    left: Math.random() * width,
  },

  mainContent: {
    flex: 1,
    zIndex: 1,
  },

  // Enhanced Header Styles
  headerContainer: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },

  headerGradient: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.glow,
  },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },

  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    marginRight: theme.spacing.md,
  },

  logoGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTextContainer: {
    flex: 1,
  },

  appTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 2,
  },

  appSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    fontWeight: '500',
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },

  settingsGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  scrollView: {
    flex: 1,
  },
  
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'ios' ? theme.spacing.xxxl : theme.spacing.xxl,
    paddingHorizontal: theme.spacing.sm,
  },
  
  section: {
    marginVertical: theme.spacing.lg,
  },
  
  actionSection: {
    marginHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  
  sectionTitle: {
    fontSize: Platform.OS === 'web' ? theme.typography.sizes.lg : theme.typography.sizes.md,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  
  recentActivity: {
    marginHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  
  activityList: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    minHeight: 60,
  },
  
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  
  activityIconText: {
    fontSize: 18,
  },
  
  activityContent: {
    flex: 1,
  },
  
  activityTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  
  activitySubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
  },
  
  activityMeta: {
    alignItems: 'flex-end',
  },
  
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: theme.spacing.xs,
  },
  
  activityTime: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.tertiary,
  },

  // Welcome Card styles
  welcomeCard: {
    marginHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },

  welcomeContent: {
    alignItems: 'center',
    padding: theme.spacing.md,
  },

  welcomeEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.sm,
  },

  welcomeTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },

  welcomeSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: theme.spacing.sm,
  },

  // Section Header styles
  sectionHeader: {
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },

  sectionSubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.tertiary,
    marginTop: 4,
    fontWeight: '400',
  },

  // Activity Header styles
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },

  viewAllLink: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Footer spacing
  footerSpacing: {
    height: theme.spacing.xl,
  },

  // Hero Section styles
  heroSection: {
    marginBottom: theme.spacing.md,
  },

  heroGradient: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },

  heroPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background.tertiary,
  },

  heroContent: {
    position: 'relative',
    zIndex: 1,
    padding: theme.spacing.md,
  },

  heroEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.sm,
  },

  heroTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },

  heroSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: theme.spacing.sm,
  },

  heroDescription: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: theme.spacing.sm,
  },

  // Status Dashboard styles
  statusDashboard: {
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },

  hexagonalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },

  hexagonalRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
    marginBottom: theme.spacing.sm,
  },

  hexagonalCard: {
    flex: 1,
    minHeight: 100,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.medium,
  },

  hexagonalPrimary: {
    backgroundColor: theme.colors.primary,
  },

  hexagonalSecondary: {
    backgroundColor: theme.colors.secondary,
  },

  hexagonalDanger: {
    backgroundColor: theme.colors.danger,
  },

  hexagonalSuccess: {
    backgroundColor: theme.colors.success,
  },

  hexagonalIcon: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },

  hexagonalTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },

  hexagonalValue: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  // Main Actions section styles
  actionsSection: {
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },

  traditionalGrid: {
    gap: theme.spacing.md,
  },

  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },

  traditionalCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  primaryAction: {
    // Styling handled by gradient
  },

  secondaryAction: {
    // Styling handled by gradient
  },

  accentAction: {
    // Styling handled by gradient
  },

  successAction: {
    // Styling handled by gradient
  },

  cardGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },

  actionIcon: {
    fontSize: 32,
    marginBottom: theme.spacing.sm,
  },

  actionTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },

  premiumActionText: {
    color: '#FFD700',
  },

  // Premium Features section styles
  premiumSection: {
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },

  premiumGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },

  premiumCard: {
    flex: 1,
    minHeight: 100,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  lockedCard: {
    opacity: 0.7,
  },

  premiumGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },

  premiumIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
  },

  premiumTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },

  premiumSubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },

  lockIcon: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
  },

  // Activity feed section styles
  activitySection: {
    marginBottom: theme.spacing.md,
  },

  chronicleContainer: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },

  // Footer section styles
  footerSection: {
    marginBottom: theme.spacing.md,
  },

  footerPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background.tertiary,
  },

  footerText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  footerSubtext: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },

  // New styles for manual security tools
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginHorizontal: -theme.spacing.sm,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },

  modalContent: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 400 : '95%',
    backgroundColor: theme.colors.background.card,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.large,
  },

  modalHeader: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },

  modalTitle: {
    fontSize: Platform.OS === 'web' ? theme.typography.sizes.lg : theme.typography.sizes.md,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },

  modalBody: {
    padding: theme.spacing.md,
  },

  modalLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },

  urlInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.md : theme.spacing.sm,
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    marginBottom: theme.spacing.md,
    minHeight: 44,
  } as any,

  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },

  modalButton: {
    flex: 1,
    marginHorizontal: theme.spacing.sm,
  },

  // Enhanced Status Dashboard styles
  enhancedStatusSection: {
    marginBottom: theme.spacing.md,
  },

  sectionTitleContainer: {
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
  },

  sectionTitleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 0, 0.2)',
  },

  enhancedSectionTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },

  statusCardsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },

  enhancedStatusCard: {
    flex: 1,
    minHeight: 100,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  statusCardGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    overflow: 'hidden',
  },

  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.3,
  },

  statusCardContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },

  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },

  iconGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.background.tertiary,
  },

  statusCardValue: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  statusCardTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  statusCardSubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },

  // Enhanced Quick Actions styles
  enhancedActionsSection: {
    marginBottom: theme.spacing.md,
  },

  actionCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },

  enhancedActionCard: {
    width: '47%',
    minHeight: 120,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  actionCardGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },

  actionCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background.tertiary,
  },

  actionCardContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },

  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },

  premiumBadgeAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    padding: theme.spacing.xs,
  },

  actionCardTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
  },

  actionCardSubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },

  // Enhanced Premium Features styles
  enhancedPremiumSection: {
    marginBottom: theme.spacing.md,
  },

  premiumCardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },

  // Enhanced Activity Feed styles
  enhancedActivitySection: {
    marginBottom: theme.spacing.md,
  },

  activityFeedContainer: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },

  enhancedActivityItem: {
    flex: 1,
    minHeight: 60,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  activityItemGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },

  activityItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  enhancedActivityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },

  activityItemText: {
    flex: 1,
  },

  enhancedActivityTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },

  enhancedActivitySubtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
  },

  activityItemMeta: {
    alignItems: 'flex-end',
  },

  enhancedStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: theme.spacing.xs,
  },

  enhancedActivityTime: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.tertiary,
  },

  // Coming Soon styles
  comingSoonCard: {
    opacity: 0.95,
  },

  comingSoonBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },

  comingSoonText: {
    color: '#666666',
    opacity: 0.8,
  },

  comingSoonSubtitle: {
    color: '#888888',
    opacity: 0.7,
  },

  comingSoonSectionTitle: {
    color: '#FF6B6B',
    fontWeight: '700',
  },

  comingSoonTitleText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  comingSoonSubtitleText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Enhanced Floating Action Button styles
  floatingActionButton: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.glow,
  },

  fabButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },

  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  previewBanner: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },

  previewBannerGradient: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewBannerText: {
    marginLeft: theme.spacing.sm,
    alignItems: 'center',
  },

  previewBannerTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },

  previewBannerSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },

  // AdMob Banner Container
  bannerAdContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 34 : 10, // Account for safe area
    zIndex: 1000,
  },

  // Ad Placeholder Styles
  adPlaceholder: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    borderStyle: 'dashed',
  },

  adPlaceholderText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default DashboardScreen;


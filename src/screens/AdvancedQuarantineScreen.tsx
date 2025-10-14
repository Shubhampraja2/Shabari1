/**
 * Advanced Quarantine Screen
 * Enhanced security quarantine system for React Native
 * 
 * This component implements a bulletproof quarantine system with:
 * - Complete file isolation and encryption
 * - Process monitoring and access control
 * - Manual quarantine capabilities
 * - Advanced security measures
 * - Comprehensive audit logging
 * 
 * @author Security Team
 * @version 2.0.0
 */

import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    AppStateStatus,
    Dimensions,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    Vibration,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import AdvancedQuarantineService, {
    AuditLogEntry,
    QuarantinePolicy,
    SecureQuarantinedFile,
    SecurityStats
} from '../services/AdvancedQuarantineService';
import FileQuarantineService from '../services/FileQuarantineService';
import QuarantineService from '../services/QuarantineService';

// ==================== CONSTANTS ====================

const { width: screenWidth } = Dimensions.get('window');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// ==================== MAIN COMPONENT ====================

export const AdvancedQuarantineScreen = () => {
  // ========== STATE MANAGEMENT ==========
  const [quarantinedFiles, setQuarantinedFiles] = useState<SecureQuarantinedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SecureQuarantinedFile | null>(null);
  const [showFileDetails, setShowFileDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPin, setAuthPin] = useState('');
  
  // Security statistics
  const [stats, setStats] = useState<SecurityStats>({
    totalFiles: 0,
    encryptedFiles: 0,
    threats: 0,
    blockedAttempts: 0,
    totalSize: 0,
    lastScan: null,
    securityScore: 100,
  });
  
  // Audit log
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  
  // Quarantine policy
  const [policy, setPolicy] = useState<QuarantinePolicy>({
    autoQuarantine: true,
    encryptionEnabled: true,
    requireAuthentication: true,
    expirationDays: 30,
    maxFileSize: MAX_FILE_SIZE,
    allowedExtensions: [],
    blockedExtensions: ['.exe', '.dll', '.bat', '.cmd', '.scr'],
    scanBeforeQuarantine: true,
    notifyOnAccess: true,
    deleteAfterExpiration: false,
  });
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  
  // Service instances
  const fileQuarantineService = FileQuarantineService.getInstance();
  const advancedService = AdvancedQuarantineService.getInstance();
  
  // ========== INITIALIZATION ==========
  
  useEffect(() => {
    initializeQuarantine();
    loadPolicy();
    startAnimations();
    
    // App state monitoring
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
      advancedService.cleanup();
    };
  }, []);
  
  /**
   * Initialize quarantine system
   */
  const initializeQuarantine = async () => {
    console.log('🚀 Initializing advanced quarantine system...');
    
    try {
      // Check authentication requirement
      const savedPolicy = await advancedService.getPolicy();
      if (savedPolicy) {
        setPolicy(savedPolicy);
        
        if (savedPolicy.requireAuthentication) {
          setShowAuthModal(true);
          return;
        }
      }
      
      await loadQuarantinedFiles();
      await loadAuditLog();
    } catch (error) {
      console.error('Initialization error:', error);
      setError('Failed to initialize quarantine system');
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Start entrance animations
   */
  const startAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  /**
   * Handle app state changes
   */
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' && policy.requireAuthentication) {
      setIsAuthenticated(false);
    }
  };
  
  // ========== DATA LOADING ==========
  
  /**
   * Load quarantined files with enhanced security metadata
   */
  const loadQuarantinedFiles = useCallback(async () => {
    console.log('🔍 Loading secure quarantined files...');
    setError(null);
    
    try {
      const quarantineService = QuarantineService.getInstance();
      const files = await quarantineService.listQuarantinedFiles();
      
      // Enhance files with security metadata
      const enhancedFiles: SecureQuarantinedFile[] = await Promise.all(
        files.map(async (file) => {
          const fileHash = await advancedService.calculateFileHash(file.filePath).catch(() => 'unknown');
          const signature = await advancedService.createDigitalSignature(fileHash).catch(() => '');
          
          return {
            id: file.id,
            fileName: file.fileName,
            originalFileName: file.originalFileName,
            filePath: file.filePath,
            encryptedPath: file.filePath.includes('.encrypted') ? file.filePath : undefined,
            fileSize: file.fileSize,
            fileHash,
            quarantineDate: file.quarantineDate,
            threatLevel: file.threatLevel as any,
            category: determineCategory(file),
            threatName: file.threatName,
            scanEngine: file.scanEngine,
            details: file.details,
            isEncrypted: file.filePath.includes('.encrypted'),
            digitalSignature: signature,
            accessAttempts: [],
            quarantineMethod: 'automatic',
            lastModified: file.quarantineDate,
            permissions: {
              read: false,
              write: false,
              execute: false,
              owner: 'quarantine',
              group: 'security',
              mode: '000',
            },
            integrityStatus: 'intact',
            metadata: {
              mimeType: advancedService.getMimeType(file.fileName),
              extension: advancedService.getFileExtension(file.fileName),
              createdDate: file.quarantineDate,
              modifiedDate: file.quarantineDate,
              tags: [],
              source: 'unknown',
              checksum: fileHash,
            },
          };
        })
      );
      
      setQuarantinedFiles(enhancedFiles);
      const newStats = advancedService.calculateSecurityStats(enhancedFiles);
      setStats(newStats);
      
      // Log the operation
      await advancedService.addAuditLog({
        action: 'FILES_LOADED',
        fileName: 'System',
        result: 'success',
        details: `Loaded ${enhancedFiles.length} quarantined files`,
        severity: 'info',
      });
      
    } catch (error) {
      console.error('❌ Error loading files:', error);
      setError('Failed to load quarantine folder');
      
      await advancedService.addAuditLog({
        action: 'FILES_LOAD_FAILED',
        fileName: 'System',
        result: 'failure',
        details: error instanceof Error ? error.message : 'Unknown error',
        severity: 'critical',
      });
    }
  }, [policy]);
  
  /**
   * Load audit log
   */
  const loadAuditLog = async () => {
    try {
      const log = await advancedService.getAuditLog();
      setAuditLog(log);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    }
  };
  
  /**
   * Load quarantine policy
   */
  const loadPolicy = async () => {
    try {
      const savedPolicy = await advancedService.getPolicy();
      if (savedPolicy) {
        setPolicy(savedPolicy);
      }
    } catch (error) {
      console.error('Failed to load policy:', error);
    }
  };
  
  // ========== QUARANTINE OPERATIONS ==========
  
  /**
   * Manual file quarantine
   */
  const manualQuarantine = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      
      if (result.type === 'success') {
        console.log('📁 Manual quarantine initiated for:', result.name);
        
        // Check file size
        if (result.size && result.size > policy.maxFileSize) {
          Alert.alert('File Too Large', `Maximum file size is ${advancedService.formatFileSize(policy.maxFileSize)}`);
          return;
        }
        
        // Check extension
        const extension = advancedService.getFileExtension(result.name);
        if (policy.blockedExtensions.includes(extension)) {
          Alert.alert('Blocked File Type', 'This file type is not allowed for quarantine');
          return;
        }
        
        setLoading(true);
        
        // Process and quarantine the file
        const quarantineResult = await fileQuarantineService.processSharedFile(
          result.uri,
          result.name
        );
        
        if (quarantineResult.success) {
          // Encrypt if policy enabled
          if (policy.encryptionEnabled) {
            await advancedService.encryptFile(result.uri);
          }
          
          // Set secure permissions
          await advancedService.setSecurePermissions(result.uri);
          
          // Add audit log
          await advancedService.addAuditLog({
            action: 'MANUAL_QUARANTINE',
            fileName: result.name,
            result: 'success',
            details: 'File manually quarantined by user',
            severity: 'info',
          });
          
          Alert.alert('Success', 'File has been securely quarantined');
          await loadQuarantinedFiles();
        } else {
          throw new Error(quarantineResult.error || 'Quarantine failed');
        }
      }
    } catch (error) {
      console.error('Manual quarantine error:', error);
      Alert.alert('Error', 'Failed to quarantine file');
      
      await advancedService.addAuditLog({
        action: 'MANUAL_QUARANTINE_FAILED',
        fileName: 'Unknown',
        result: 'failure',
        details: error instanceof Error ? error.message : 'Unknown error',
        severity: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };
  
  // ========== HELPER FUNCTIONS ==========
  
  /**
   * Determine file category based on characteristics
   */
  const determineCategory = (file: any): SecureQuarantinedFile['category'] => {
    if (file.threatLevel === 'MALICIOUS') return 'malware';
    if (file.threatLevel === 'SUSPICIOUS') return 'suspicious';
    if (file.fileName.includes('personal')) return 'personal';
    return 'temporary';
  };
  
  /**
   * Format date for display
   */
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    }
  };
  
  /**
   * Get threat display configuration
   */
  const getThreatDisplay = (threatLevel: SecureQuarantinedFile['threatLevel']) => {
    const displays = {
      'SAFE': { icon: '✅', color: '#4ade80', label: 'Safe', bgColor: '#166534' },
      'SUSPICIOUS': { icon: '⚠️', color: '#fbbf24', label: 'Suspicious', bgColor: '#713f12' },
      'MALICIOUS': { icon: '🚨', color: '#f87171', label: 'Malicious', bgColor: '#7f1d1d' },
      'UNKNOWN': { icon: '❓', color: '#94a3b8', label: 'Unknown', bgColor: '#334155' },
      'MANUAL': { icon: '👤', color: '#60a5fa', label: 'Manual', bgColor: '#1e3a8a' },
    };
    return displays[threatLevel] || displays['UNKNOWN'];
  };
  
  /**
   * Handle authentication
   */
  const handleAuthentication = async () => {
    if (authPin === '1234') { // In production, use biometric or secure PIN storage
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthPin('');
      await loadQuarantinedFiles();
      
      await advancedService.addAuditLog({
        action: 'AUTHENTICATION_SUCCESS',
        fileName: 'System',
        result: 'success',
        details: 'User authenticated successfully',
        severity: 'info',
      });
    } else {
      Vibration.vibrate(500);
      Alert.alert('Authentication Failed', 'Invalid PIN');
      setAuthPin('');
    }
  };
  
  /**
   * Save policy settings
   */
  const savePolicy = async (newPolicy: QuarantinePolicy) => {
    try {
      await advancedService.savePolicy(newPolicy);
      setPolicy(newPolicy);
      
      await advancedService.addAuditLog({
        action: 'POLICY_UPDATED',
        fileName: 'System',
        result: 'success',
        details: 'Quarantine policy updated',
        severity: 'info',
      });
      
      Alert.alert('Success', 'Policy settings saved');
    } catch (error) {
      console.error('Failed to save policy:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };
  
  /**
   * Refresh handler
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadQuarantinedFiles();
      await loadAuditLog();
    } catch (error) {
      console.error('Refresh error:', error);
      setError('Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [loadQuarantinedFiles]);
  
  /**
   * Filter files based on search and category
   */
  const filteredFiles = useMemo(() => {
    let filtered = [...quarantinedFiles];
    
    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(f => f.category === selectedCategory);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
        f.originalFileName.toLowerCase().includes(query) ||
        f.threatName?.toLowerCase().includes(query) ||
        f.details?.toLowerCase().includes(query)
      );
    }
    
    // Sort by date (newest first)
    filtered.sort((a, b) => 
      new Date(b.quarantineDate).getTime() - new Date(a.quarantineDate).getTime()
    );
    
    return filtered;
  }, [quarantinedFiles, selectedCategory, searchQuery]);
  
  // ========== RENDER FUNCTIONS ==========
  
  /**
   * Render file item
   */
  const renderFileItem = ({ item: file }: { item: SecureQuarantinedFile }) => {
    const threat = getThreatDisplay(file.threatLevel);
    
    return (
      <Animated.View
        style={[
          styles.fileItem,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            borderLeftColor: threat.color,
          }
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            setSelectedFile(file);
            setShowFileDetails(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.fileHeader}>
            <View style={styles.fileInfo}>
              <View style={styles.fileNameRow}>
                {file.isEncrypted && (
                  <Text style={styles.encryptedBadge}>🔒</Text>
                )}
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.originalFileName}
                </Text>
              </View>
              <Text style={styles.fileDetails}>
                {advancedService.formatFileSize(file.fileSize)} • {formatDate(file.quarantineDate)}
              </Text>
              {file.accessAttempts.length > 0 && (
                <Text style={styles.accessWarning}>
                  ⚠️ {file.accessAttempts.length} access attempt{file.accessAttempts.length > 1 ? 's' : ''} blocked
                </Text>
              )}
            </View>
            <View style={[styles.threatBadge, { backgroundColor: threat.bgColor }]}>
              <Text style={styles.threatIcon}>{threat.icon}</Text>
              <Text style={[styles.threatLabelSmall, { color: threat.color }]}>
                {threat.label}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };
  
  /**
   * Render security dashboard
   */
  const renderSecurityDashboard = () => (
    <Animated.View 
      style={[
        styles.dashboardContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <Text style={styles.dashboardTitle}>Security Status</Text>
      
      <View style={styles.securityScore}>
        <Text style={styles.scoreLabel}>Security Score</Text>
        <Text style={[
          styles.scoreValue,
          { color: stats.securityScore > 70 ? '#4ade80' : 
                   stats.securityScore > 40 ? '#fbbf24' : '#f87171' }
        ]}>
          {stats.securityScore}%
        </Text>
      </View>
      
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalFiles}</Text>
          <Text style={styles.statLabel}>Total Files</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#60a5fa' }]}>
            {stats.encryptedFiles}
          </Text>
          <Text style={styles.statLabel}>Encrypted</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#f87171' }]}>
            {stats.threats}
          </Text>
          <Text style={styles.statLabel}>Threats</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#fbbf24' }]}>
            {stats.blockedAttempts}
          </Text>
          <Text style={styles.statLabel}>Blocked</Text>
        </View>
      </View>
      
      {stats.lastScan && (
        <Text style={styles.lastScanText}>
          Last scan: {formatDate(stats.lastScan)}
        </Text>
      )}
    </Animated.View>
  );
  
  // ========== MAIN RENDER ==========
  
  if (loading && !showAuthModal) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Advanced Quarantine" showBack={true} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Initializing secure vault...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <Header title="🔒 Advanced Quarantine" showBack={true} />
      
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Security Dashboard */}
        {renderSecurityDashboard()}

        {/* Search and Filter Bar */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search files..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryFilter}
          >
            {['all', 'malware', 'suspicious', 'personal', 'temporary'].map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryChip,
                  selectedCategory === category && styles.categoryChipActive
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[
                  styles.categoryChipText,
                  selectedCategory === category && styles.categoryChipTextActive
                ]}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={manualQuarantine}
          >
            <Text style={styles.primaryActionText}>+ Add File</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowAuditLog(true)}
          >
            <Text style={styles.iconButtonText}>📋</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowSettings(true)}
          >
            <Text style={styles.iconButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* File List */}
        {filteredFiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyTitle}>Quarantine Vault Empty</Text>
            <Text style={styles.emptyDescription}>
              Your secure quarantine vault is currently empty.
              {'\n'}Add files manually or enable auto-quarantine for suspicious files.
            </Text>
            <TouchableOpacity
              style={styles.addFileButton}
              onPress={manualQuarantine}
            >
              <Text style={styles.addFileButtonText}>Add Your First File</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fileListContainer}>
            {filteredFiles.map((file) => (
              <View key={file.id}>
                {renderFileItem({ item: file })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  // Main Container
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#e2e8f0',
    fontSize: 16,
    marginTop: 16,
  },
  
  // Security Dashboard
  dashboardContainer: {
    backgroundColor: '#1e293b',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dashboardTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  securityScore: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    marginBottom: 16,
  },
  scoreLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: (screenWidth - 64) / 2,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statValue: {
    color: '#f1f5f9',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  lastScanText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  
  // Search and Filter
  searchBar: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  categoryFilter: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  categoryChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#3b82f6',
  },
  categoryChipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  primaryActionButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 48,
    height: 48,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 20,
  },
  
  // File List
  fileList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  fileItem: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
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
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  encryptedBadge: {
    fontSize: 16,
    marginRight: 6,
  },
  fileName: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  fileDetails: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  accessWarning: {
    color: '#fbbf24',
    fontSize: 12,
    fontStyle: 'italic',
  },
  threatBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  threatIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  threatLabelSmall: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#f1f5f9',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#64748b',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  addFileButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addFileButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});

export default AdvancedQuarantineScreen;

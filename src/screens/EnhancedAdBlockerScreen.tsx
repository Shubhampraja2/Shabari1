import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  FlatList,
  RefreshControl,
  TextInput,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userAdBlockerService, BlockedDomain, DetectedAd, AdBlockerStats } from '../services/UserAdBlockerService';

export default function AdBlockerScreen() {
  const [stats, setStats] = useState<AdBlockerStats>({
    totalAdsDetected: 0,
    totalAdsBlocked: 0,
    totalDomainsBlocked: 0,
    blockingEnabled: true,
  });
  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([]);
  const [detectedAds, setDetectedAds] = useState<DetectedAd[]>([]);
  const [activeTab, setActiveTab] = useState<'detected' | 'blocked'>('detected');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState({
    enabled: true,
    autoBlockKnownAds: false,
    showAdNotifications: true,
    strictMode: false,
  });

  useEffect(() => {
    initializeService();
    setupEventListeners();

    return () => {
      removeEventListeners();
    };
  }, []);

  const initializeService = async () => {
    try {
      await userAdBlockerService.initialize();
      loadData();
    } catch (error) {
      console.error('Failed to initialize ad blocker:', error);
      Alert.alert('Error', 'Failed to initialize ad blocker service');
    }
  };

  const setupEventListeners = () => {
    userAdBlockerService.on('adDetected', handleAdDetected);
    userAdBlockerService.on('domainBlocked', handleDomainBlocked);
    userAdBlockerService.on('domainUnblocked', handleDomainUnblocked);
  };

  const removeEventListeners = () => {
    userAdBlockerService.off('adDetected', handleAdDetected);
    userAdBlockerService.off('domainBlocked', handleDomainBlocked);
    userAdBlockerService.off('domainUnblocked', handleDomainUnblocked);
  };

  const handleAdDetected = (ad: DetectedAd) => {
    loadData();
  };

  const handleDomainBlocked = (domain: BlockedDomain) => {
    loadData();
    Alert.alert('✅ Domain Blocked', `${domain.domain} has been blocked successfully`);
  };

  const handleDomainUnblocked = (domain: string) => {
    loadData();
    Alert.alert('✅ Domain Unblocked', `${domain} has been unblocked successfully`);
  };

  const loadData = useCallback(() => {
    const newStats = userAdBlockerService.getStats();
    const newBlockedDomains = userAdBlockerService.getBlockedDomains();
    const newDetectedAds = userAdBlockerService.getDetectedAds(100);
    const newSettings = userAdBlockerService.getSettings();

    setStats(newStats);
    setBlockedDomains(newBlockedDomains);
    setDetectedAds(newDetectedAds);
    setSettings(newSettings);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleBlockDomain = async (domain: string, url?: string) => {
    Alert.alert(
      'Block Domain',
      `Are you sure you want to block all ads from ${domain}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const success = await userAdBlockerService.blockDomain(
              domain,
              url ? `Blocked from ${url}` : 'Blocked by user'
            );
            if (success) {
              loadData();
            } else {
              Alert.alert('Error', 'Failed to block domain');
            }
          },
        },
      ]
    );
  };

  const handleUnblockDomain = async (domain: string) => {
    Alert.alert(
      'Unblock Domain',
      `Are you sure you want to unblock ${domain}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const success = await userAdBlockerService.unblockDomain(domain);
            if (success) {
              loadData();
            } else {
              Alert.alert('Error', 'Failed to unblock domain');
            }
          },
        },
      ]
    );
  };

  const handleToggleSetting = async (key: keyof typeof settings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    await userAdBlockerService.updateSettings(newSettings);
  };

  const handleExportDomains = async () => {
    try {
      const exportData = userAdBlockerService.exportBlockedDomains();
      await Share.share({
        message: exportData,
        title: 'Shabari Blocked Domains',
      });
    } catch (error) {
      console.error('Failed to export domains:', error);
      Alert.alert('Error', 'Failed to export blocked domains');
    }
  };

  const handleClearBlockedDomains = () => {
    Alert.alert(
      'Clear All Blocked Domains',
      'Are you sure you want to remove all blocked domains? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await userAdBlockerService.clearBlockedDomains();
            loadData();
          },
        },
      ]
    );
  };

  const handleClearDetectedAds = () => {
    Alert.alert(
      'Clear Ad History',
      'Are you sure you want to clear the detected ads history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await userAdBlockerService.clearDetectedAds();
            loadData();
          },
        },
      ]
    );
  };

  const filteredDetectedAds = detectedAds.filter(
    ad =>
      ad.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ad.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBlockedDomains = blockedDomains.filter(domain =>
    domain.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderDetectedAdItem = ({ item }: { item: DetectedAd }) => (
    <View style={styles.adItem}>
      <View style={styles.adItemHeader}>
        <View style={styles.adItemTitleContainer}>
          <Ionicons
            name={item.isBlocked ? 'shield-checkmark' : 'warning'}
            size={24}
            color={item.isBlocked ? '#22c55e' : '#f59e0b'}
          />
          <View style={styles.adItemTextContainer}>
            <Text style={styles.adItemDomain} numberOfLines={1}>
              {item.domain}
            </Text>
            <Text style={styles.adItemUrl} numberOfLines={1}>
              {item.url}
            </Text>
            <Text style={styles.adItemTimestamp}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
        </View>
        {!item.isBlocked && (
          <TouchableOpacity
            style={styles.blockButton}
            onPress={() => handleBlockDomain(item.domain, item.url)}
          >
            <Ionicons name="ban" size={20} color="#fff" />
            <Text style={styles.blockButtonText}>Block</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.adItemFooter}>
        <View style={[styles.statusBadge, item.isBlocked ? styles.blockedBadge : styles.detectedBadge]}>
          <Text style={styles.statusBadgeText}>
            {item.isBlocked ? 'BLOCKED' : 'DETECTED'}
          </Text>
        </View>
        <Text style={styles.detectionMethod}>{item.detectionMethod}</Text>
      </View>
    </View>
  );

  const renderBlockedDomainItem = ({ item }: { item: BlockedDomain }) => (
    <View style={styles.blockedDomainItem}>
      <View style={styles.blockedDomainHeader}>
        <View style={styles.blockedDomainInfo}>
          <Ionicons name="shield-checkmark" size={24} color="#22c55e" />
          <View style={styles.blockedDomainTextContainer}>
            <Text style={styles.blockedDomainName}>{item.domain}</Text>
            <Text style={styles.blockedDomainReason}>{item.reason}</Text>
            <Text style={styles.blockedDomainStats}>
              Blocked {item.blockCount} times • Added {new Date(item.blockedAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.unblockButton}
          onPress={() => handleUnblockDomain(item.domain)}
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.unblockButtonText}>Unblock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ad Blocker</Text>
        <Text style={styles.headerSubtitle}>Control your browsing experience</Text>
      </View>

      {/* Stats Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="eye" size={32} color="#3b82f6" />
          <Text style={styles.statValue}>{stats.totalAdsDetected}</Text>
          <Text style={styles.statLabel}>Ads Detected</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="shield-checkmark" size={32} color="#22c55e" />
          <Text style={styles.statValue}>{stats.totalAdsBlocked}</Text>
          <Text style={styles.statLabel}>Ads Blocked</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="ban" size={32} color="#ef4444" />
          <Text style={styles.statValue}>{stats.totalDomainsBlocked}</Text>
          <Text style={styles.statLabel}>Domains Blocked</Text>
        </View>
      </ScrollView>

      {/* Settings */}
      <View style={styles.settingsContainer}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Ionicons name="power" size={24} color={settings.enabled ? '#22c55e' : '#9ca3af'} />
            <Text style={styles.settingLabel}>Enable Ad Blocking</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={() => handleToggleSetting('enabled')}
            trackColor={{ false: '#d1d5db', true: '#86efac' }}
            thumbColor={settings.enabled ? '#22c55e' : '#f3f4f6'}
          />
        </View>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Ionicons name="flash" size={24} color={settings.autoBlockKnownAds ? '#f59e0b' : '#9ca3af'} />
            <Text style={styles.settingLabel}>Auto-block Known Ads</Text>
          </View>
          <Switch
            value={settings.autoBlockKnownAds}
            onValueChange={() => handleToggleSetting('autoBlockKnownAds')}
            trackColor={{ false: '#d1d5db', true: '#fcd34d' }}
            thumbColor={settings.autoBlockKnownAds ? '#f59e0b' : '#f3f4f6'}
          />
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search domains or URLs..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'detected' && styles.activeTab]}
          onPress={() => setActiveTab('detected')}
        >
          <Text style={[styles.tabText, activeTab === 'detected' && styles.activeTabText]}>
            Detected Ads ({filteredDetectedAds.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'blocked' && styles.activeTab]}
          onPress={() => setActiveTab('blocked')}
        >
          <Text style={[styles.tabText, activeTab === 'blocked' && styles.activeTabText]}>
            Blocked Domains ({filteredBlockedDomains.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'detected' ? (
        <FlatList
          data={filteredDetectedAds}
          renderItem={renderDetectedAdItem}
          keyExtractor={item => item.id}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="eye-off" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No ads detected yet</Text>
              <Text style={styles.emptySubtext}>
                Ads will appear here as you browse
              </Text>
            </View>
          }
          ListFooterComponent={
            filteredDetectedAds.length > 0 ? (
              <TouchableOpacity style={styles.clearButton} onPress={handleClearDetectedAds}>
                <Ionicons name="trash" size={20} color="#ef4444" />
                <Text style={styles.clearButtonText}>Clear Ad History</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={filteredBlockedDomains}
          renderItem={renderBlockedDomainItem}
          keyExtractor={item => item.domain}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="ban" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No blocked domains</Text>
              <Text style={styles.emptySubtext}>
                Tap "Block" on detected ads to add them here
              </Text>
            </View>
          }
          ListFooterComponent={
            filteredBlockedDomains.length > 0 ? (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity style={styles.exportButton} onPress={handleExportDomains}>
                  <Ionicons name="share" size={20} color="#3b82f6" />
                  <Text style={styles.exportButtonText}>Export List</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearButton} onPress={handleClearBlockedDomains}>
                  <Ionicons name="trash" size={20} color="#ef4444" />
                  <Text style={styles.clearButtonText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#1f2937',
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  statsContainer: {
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  settingsContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#1f2937',
    marginLeft: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#fff',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  adItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  adItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  adItemTitleContainer: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 8,
  },
  adItemTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  adItemDomain: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  adItemUrl: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  adItemTimestamp: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  blockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  adItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  blockedBadge: {
    backgroundColor: '#dcfce7',
  },
  detectedBadge: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1f2937',
  },
  detectionMethod: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  blockedDomainItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  blockedDomainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  blockedDomainInfo: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 8,
  },
  blockedDomainTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  blockedDomainName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  blockedDomainReason: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  blockedDomainStats: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  unblockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unblockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 8,
  },
  exportButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  clearButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});


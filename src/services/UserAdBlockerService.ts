/**
 * User-Controlled Ad Blocker Service
 * 
 * Features:
 * - User can block ads from specific domains after seeing them
 * - Stores blocked domains locally on device
 * - Integrates with proxy engine for ad blocking
 * - Provides ad domain detection and user control
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple event emitter implementation for React Native
class SimpleEventEmitter {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) return;

    if (callback) {
      const callbacks = this.listeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    } else {
      this.listeners.delete(event);
    }
  }

  emit(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event)!;
    callbacks.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

const STORAGE_KEY_BLOCKED_DOMAINS = '@shabari_blocked_ad_domains';
const STORAGE_KEY_DETECTED_ADS = '@shabari_detected_ads';
const STORAGE_KEY_ADBLOCKER_SETTINGS = '@shabari_adblocker_settings';

export interface DetectedAd {
  id: string;
  domain: string;
  url: string;
  timestamp: number;
  isBlocked: boolean;
  blockedAt?: number;
  detectionMethod: 'proxy' | 'pattern' | 'heuristic';
}

export interface BlockedDomain {
  domain: string;
  blockedAt: number;
  reason: string;
  blockCount: number;
  lastBlockedUrl?: string;
}

export interface AdBlockerSettings {
  enabled: boolean;
  autoBlockKnownAds: boolean;
  showAdNotifications: boolean;
  strictMode: boolean; // More aggressive ad detection
}

export interface AdBlockerStats {
  totalAdsDetected: number;
  totalAdsBlocked: number;
  totalDomainsBlocked: number;
  blockingEnabled: boolean;
}

class UserAdBlockerService extends SimpleEventEmitter {
  private static instance: UserAdBlockerService;
  private blockedDomains: Map<string, BlockedDomain> = new Map();
  private detectedAds: Map<string, DetectedAd> = new Map();
  private settings: AdBlockerSettings = {
    enabled: true,
    autoBlockKnownAds: false,
    showAdNotifications: true,
    strictMode: false,
  };
  private isInitialized = false;

  // Common ad server patterns
  private readonly knownAdPatterns = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'facebook.com/tr',
    'connect.facebook.net',
    'ads.twitter.com',
    'advertising.com',
    'adservice.google',
    'pagead2.googlesyndication.com',
    'googletagmanager.com',
    'google-analytics.com',
    'adnxs.com',
    'adsrvr.org',
    'rubiconproject.com',
    'amazon-adsystem.com',
    'serving-sys.com',
    'criteo.com',
    'outbrain.com',
    'taboola.com',
  ];

  // Ad-related URL patterns
  private readonly adUrlPatterns = [
    /\/ad[s]?\//i,
    /\/banner[s]?\//i,
    /\/promotion[s]?\//i,
    /\/sponsored/i,
    /\/affiliate/i,
    /clicktrack/i,
    /impression/i,
    /adserver/i,
    /adclick/i,
  ];

  private constructor() {
    super();
  }

  static getInstance(): UserAdBlockerService {
    if (!UserAdBlockerService.instance) {
      UserAdBlockerService.instance = new UserAdBlockerService();
    }
    return UserAdBlockerService.instance;
  }

  /**
   * Initialize the ad blocker service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.loadBlockedDomains();
      await this.loadDetectedAds();
      await this.loadSettings();
      this.isInitialized = true;
      console.log('✅ User Ad Blocker Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize User Ad Blocker Service:', error);
      throw error;
    }
  }

  /**
   * Check if a URL is an ad and should be blocked
   */
  async checkUrl(url: string): Promise<{ isAd: boolean; shouldBlock: boolean; domain: string; reason?: string }> {
    try {
      const domain = this.extractDomain(url);
      
      // Check if domain is already blocked
      if (this.blockedDomains.has(domain)) {
        const blockedInfo = this.blockedDomains.get(domain)!;
        blockedInfo.blockCount++;
        blockedInfo.lastBlockedUrl = url;
        await this.saveBlockedDomains();

        return {
          isAd: true,
          shouldBlock: true,
          domain,
          reason: `Blocked by user: ${blockedInfo.reason}`,
        };
      }

      // Check if it's a known ad pattern
      const isKnownAd = this.isKnownAdDomain(domain) || this.isAdUrl(url);
      
      if (isKnownAd) {
        // Detected ad but not blocked yet by user
        await this.recordDetectedAd(url, domain, 'pattern');
        
        const shouldBlock = this.settings.autoBlockKnownAds && this.settings.enabled;
        
        return {
          isAd: true,
          shouldBlock,
          domain,
          reason: shouldBlock ? 'Auto-blocked known ad domain' : 'Known ad domain detected',
        };
      }

      return {
        isAd: false,
        shouldBlock: false,
        domain,
      };
    } catch (error) {
      console.error('Error checking URL:', error);
      return {
        isAd: false,
        shouldBlock: false,
        domain: url,
      };
    }
  }

  /**
   * Block a domain (user action)
   */
  async blockDomain(domain: string, reason: string = 'Blocked by user'): Promise<boolean> {
    try {
      const normalizedDomain = this.normalizeDomain(domain);
      
      if (this.blockedDomains.has(normalizedDomain)) {
        console.log(`Domain ${normalizedDomain} is already blocked`);
        return true;
      }

      const blockedDomain: BlockedDomain = {
        domain: normalizedDomain,
        blockedAt: Date.now(),
        reason,
        blockCount: 0,
      };

      this.blockedDomains.set(normalizedDomain, blockedDomain);
      await this.saveBlockedDomains();

      // Update detected ads for this domain
      for (const [id, ad] of this.detectedAds.entries()) {
        if (ad.domain === normalizedDomain) {
          ad.isBlocked = true;
          ad.blockedAt = Date.now();
        }
      }
      await this.saveDetectedAds();

      this.emit('domainBlocked', blockedDomain);
      console.log(`✅ Domain ${normalizedDomain} blocked successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to block domain ${domain}:`, error);
      return false;
    }
  }

  /**
   * Unblock a domain (user action)
   */
  async unblockDomain(domain: string): Promise<boolean> {
    try {
      const normalizedDomain = this.normalizeDomain(domain);
      
      if (!this.blockedDomains.has(normalizedDomain)) {
        console.log(`Domain ${normalizedDomain} is not blocked`);
        return false;
      }

      this.blockedDomains.delete(normalizedDomain);
      await this.saveBlockedDomains();

      // Update detected ads for this domain
      for (const [id, ad] of this.detectedAds.entries()) {
        if (ad.domain === normalizedDomain) {
          ad.isBlocked = false;
          ad.blockedAt = undefined;
        }
      }
      await this.saveDetectedAds();

      this.emit('domainUnblocked', normalizedDomain);
      console.log(`✅ Domain ${normalizedDomain} unblocked successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to unblock domain ${domain}:`, error);
      return false;
    }
  }

  /**
   * Get all blocked domains
   */
  getBlockedDomains(): BlockedDomain[] {
    return Array.from(this.blockedDomains.values()).sort((a, b) => b.blockedAt - a.blockedAt);
  }

  /**
   * Get all detected ads
   */
  getDetectedAds(limit: number = 100): DetectedAd[] {
    return Array.from(this.detectedAds.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get detected ads for a specific domain
   */
  getDetectedAdsByDomain(domain: string): DetectedAd[] {
    const normalizedDomain = this.normalizeDomain(domain);
    return Array.from(this.detectedAds.values())
      .filter(ad => ad.domain === normalizedDomain)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check if a domain is blocked
   */
  isDomainBlocked(domain: string): boolean {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.blockedDomains.has(normalizedDomain);
  }

  /**
   * Get ad blocker statistics
   */
  getStats(): AdBlockerStats {
    const totalAdsBlocked = Array.from(this.detectedAds.values()).filter(ad => ad.isBlocked).length;
    
    return {
      totalAdsDetected: this.detectedAds.size,
      totalAdsBlocked,
      totalDomainsBlocked: this.blockedDomains.size,
      blockingEnabled: this.settings.enabled,
    };
  }

  /**
   * Update ad blocker settings
   */
  async updateSettings(newSettings: Partial<AdBlockerSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    this.emit('settingsUpdated', this.settings);
  }

  /**
   * Get current settings
   */
  getSettings(): AdBlockerSettings {
    return { ...this.settings };
  }

  /**
   * Clear all blocked domains
   */
  async clearBlockedDomains(): Promise<void> {
    this.blockedDomains.clear();
    await this.saveBlockedDomains();
    this.emit('blockedDomainsCleared');
  }

  /**
   * Clear detected ads history
   */
  async clearDetectedAds(): Promise<void> {
    this.detectedAds.clear();
    await this.saveDetectedAds();
    this.emit('detectedAdsCleared');
  }

  /**
   * Export blocked domains list
   */
  exportBlockedDomains(): string {
    const domains = this.getBlockedDomains();
    return JSON.stringify(domains, null, 2);
  }

  /**
   * Import blocked domains list
   */
  async importBlockedDomains(jsonData: string): Promise<{ success: boolean; imported: number; errors: number }> {
    try {
      const domains: BlockedDomain[] = JSON.parse(jsonData);
      let imported = 0;
      let errors = 0;

      for (const domain of domains) {
        try {
          this.blockedDomains.set(domain.domain, domain);
          imported++;
        } catch (error) {
          errors++;
        }
      }

      await this.saveBlockedDomains();
      this.emit('domainsImported', { imported, errors });

      return { success: true, imported, errors };
    } catch (error) {
      console.error('Failed to import domains:', error);
      return { success: false, imported: 0, errors: 0 };
    }
  }

  // Private helper methods

  private async recordDetectedAd(url: string, domain: string, method: DetectedAd['detectionMethod']): Promise<void> {
    const id = `${domain}_${Date.now()}`;
    const isBlocked = this.blockedDomains.has(domain);

    const detectedAd: DetectedAd = {
      id,
      domain,
      url,
      timestamp: Date.now(),
      isBlocked,
      blockedAt: isBlocked ? Date.now() : undefined,
      detectionMethod: method,
    };

    this.detectedAds.set(id, detectedAd);
    
    // Keep only recent 1000 ads to avoid excessive storage
    if (this.detectedAds.size > 1000) {
      const oldestKey = Array.from(this.detectedAds.keys())[0];
      this.detectedAds.delete(oldestKey);
    }

    await this.saveDetectedAds();
    this.emit('adDetected', detectedAd);

    // Send notification if enabled
    if (this.settings.showAdNotifications) {
      await this.sendAdNotification(detectedAd);
    }
  }

  /**
   * Send notification when ad is detected
   */
  private async sendAdNotification(ad: DetectedAd): Promise<void> {
    try {
      // Dynamically import to avoid circular dependencies
      const { notificationService } = await import('./ExpoNotificationService');

      // Initialize notification service if not already done
      if (!notificationService['isInitialized']) {
        await notificationService.initialize();
      }

      // Send ad detection notification with action buttons
      await notificationService.showAdDetectionNotification({
        domain: ad.domain,
        url: ad.url,
        reason: `${ad.detectionMethod} detection`,
        isBlocked: ad.isBlocked,
      });

      console.log('📢 Ad detection notification sent for:', ad.domain);
    } catch (error) {
      console.error('❌ Failed to send ad notification:', error);
    }
  }

  private extractDomain(url: string): string {
    try {
      let urlToParse = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        urlToParse = `http://${url}`;
      }
      const urlObj = new URL(urlToParse);
      return urlObj.hostname;
    } catch (error) {
      // If URL parsing fails, try to extract domain manually
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/i);
      return match ? match[1] : url;
    }
  }

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '');
  }

  private isKnownAdDomain(domain: string): boolean {
    const normalizedDomain = this.normalizeDomain(domain);
    return this.knownAdPatterns.some(pattern => normalizedDomain.includes(pattern));
  }

  private isAdUrl(url: string): boolean {
    return this.adUrlPatterns.some(pattern => pattern.test(url));
  }

  private async loadBlockedDomains(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_BLOCKED_DOMAINS);
      if (data) {
        const domains: BlockedDomain[] = JSON.parse(data);
        this.blockedDomains = new Map(domains.map(d => [d.domain, d]));
        console.log(`Loaded ${this.blockedDomains.size} blocked domains`);
      }
    } catch (error) {
      console.error('Failed to load blocked domains:', error);
    }
  }

  private async saveBlockedDomains(): Promise<void> {
    try {
      const domains = Array.from(this.blockedDomains.values());
      await AsyncStorage.setItem(STORAGE_KEY_BLOCKED_DOMAINS, JSON.stringify(domains));
    } catch (error) {
      console.error('Failed to save blocked domains:', error);
    }
  }

  private async loadDetectedAds(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_DETECTED_ADS);
      if (data) {
        const ads: DetectedAd[] = JSON.parse(data);
        this.detectedAds = new Map(ads.map(ad => [ad.id, ad]));
        console.log(`Loaded ${this.detectedAds.size} detected ads`);
      }
    } catch (error) {
      console.error('Failed to load detected ads:', error);
    }
  }

  private async saveDetectedAds(): Promise<void> {
    try {
      const ads = Array.from(this.detectedAds.values());
      await AsyncStorage.setItem(STORAGE_KEY_DETECTED_ADS, JSON.stringify(ads));
    } catch (error) {
      console.error('Failed to save detected ads:', error);
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_ADBLOCKER_SETTINGS);
      if (data) {
        this.settings = JSON.parse(data);
        console.log('Loaded ad blocker settings');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_ADBLOCKER_SETTINGS, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
}

export const userAdBlockerService = UserAdBlockerService.getInstance();

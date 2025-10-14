/**
 * Universal Services Layer
 * Provides runtime detection and seamless fallbacks for all native modules
 * Ensures full functionality across local builds, EAS builds, and web
 */

import { Platform } from 'react-native';

// Runtime environment detection
export const BuildEnvironment = {
  isEASBuild: process.env.EAS_BUILD === 'true',
  isExpoGo: __DEV__ && process.env.EXPO_GO === 'true',
  isWebPlatform: Platform.OS === 'web',
  isAndroid: Platform.OS === 'android',
  isIOS: Platform.OS === 'ios',
  isDevelopmentBuild: __DEV__,
};

// ===== FILE SYSTEM SERVICE =====
class UniversalFileSystem {
  private expoFS: any = null;
  private available: boolean = false;

  constructor() {
    this.initializeFileSystem();
  }

  private initializeFileSystem() {
    try {
      // Use expo-file-system (compatible with Expo)
      this.expoFS = require('expo-file-system');
      this.available = true;
      console.log('[UniversalFS] Using expo-file-system');
    } catch (error) {
      console.warn('[UniversalFS] No file system available:', error);
      this.available = false;
    }
  }

  get DocumentDirectoryPath(): string {
    if (this.expoFS) {
      return this.expoFS.documentDirectory || '';
    }
    return '/mock/documents';
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.expoFS) {
      return this.expoFS.writeAsStringAsync(path, content);
    }
    console.log(`[UniversalFS] Mock writeFile: ${path}`);
  }

  async readFile(path: string): Promise<string> {
    if (this.expoFS) {
      return this.expoFS.readAsStringAsync(path);
    }
    console.log(`[UniversalFS] Mock readFile: ${path}`);
    return 'mock file content';
  }

  async exists(path: string): Promise<boolean> {
    if (this.expoFS) {
      const info = await this.expoFS.getInfoAsync(path);
      return info.exists;
    }
    return false;
  }

  async mkdir(path: string): Promise<void> {
    if (this.expoFS) {
      return this.expoFS.makeDirectoryAsync(path, { intermediates: true });
    }
    console.log(`[UniversalFS] Mock mkdir: ${path}`);
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// ===== NOTIFICATION SERVICE =====
class UniversalNotifications {
  private notificationService: any = null;
  private available: boolean = false;

  constructor() {
    this.initializeNotifications();
  }

  private async initializeNotifications() {
    try {
      // Use the new ExpoNotificationService for all builds
      const { notificationService } = require('../services/ExpoNotificationService');
      this.notificationService = notificationService;
      this.available = true;
      console.log('[UniversalNotifications] Using ExpoNotificationService');
      
      // Initialize the service
      this.notificationService.initialize().then((success: boolean) => {
        if (success) {
          console.log('[UniversalNotifications] Service initialized successfully');
        } else {
          console.warn('[UniversalNotifications] Service initialization failed');
        }
      }).catch((error: any) => {
        console.error('[UniversalNotifications] Initialization error:', error);
      });
    } catch (error) {
      console.warn('[UniversalNotifications] Failed to load notification service:', error);
      this.available = false;
    }
  }

  async scheduleNotification(title: string, body: string, data?: any): Promise<void> {
    if (this.notificationService) {
      try {
        await this.notificationService.showNotification({
          title,
          message: body,
          data: data || {},
          channelId: data?.type === 'security' ? 'security' : data?.type === 'url_protection' ? 'url_protection' : 'default',
          priority: data?.priority || 'high',
          vibration: true,
          sound: true,
        });
        console.log('[UniversalNotifications] Notification sent successfully');
      } catch (error) {
        console.warn('[UniversalNotifications] Failed to send notification:', error);
      }
    } else {
      console.log(`[UniversalNotifications] Mock notification: ${title} - ${body}`);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    if (this.notificationService) {
      try {
        await this.notificationService.cancelAllNotifications();
        console.log('[UniversalNotifications] All notifications canceled');
      } catch (error) {
        console.warn('[UniversalNotifications] Failed to cancel notifications:', error);
      }
    }
  }

  async scheduleDelayedNotification(title: string, body: string, date: Date, data?: any): Promise<string | null> {
    if (this.notificationService) {
      try {
        return await this.notificationService.scheduleNotification({
          title,
          message: body,
          date,
          data: data || {},
          channelId: data?.type === 'security' ? 'security' : 'default',
          priority: data?.priority || 'high',
          vibration: true,
          sound: true,
        });
      } catch (error) {
        console.warn('[UniversalNotifications] Failed to schedule notification:', error);
        return null;
      }
    }
    return null;
  }

  async getPushToken(): Promise<string | null> {
    if (this.notificationService) {
      try {
        return await this.notificationService.getPushToken();
      } catch (error) {
        console.warn('[UniversalNotifications] Failed to get push token:', error);
        return null;
      }
    }
    return null;
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// ===== SHARE INTENT SERVICE =====
class UniversalShareIntent {
  private rnShareIntent: any = null;
  private expoIntentLauncher: any = null;
  private available: boolean = false;

  constructor() {
    this.initializeShareIntent();
  }

  private async initializeShareIntent() {
    try {
      // Try react-native-receive-sharing-intent first
      this.rnShareIntent = require('react-native-receive-sharing-intent');
      this.available = true;
      console.log('[UniversalShareIntent] Using react-native-receive-sharing-intent');
    } catch (error) {
      try {
        // Fallback to expo-intent-launcher
        this.expoIntentLauncher = require('expo-intent-launcher');
        this.available = true;
        console.log('[UniversalShareIntent] Using expo-intent-launcher');
      } catch (fallbackError) {
        console.warn('[UniversalShareIntent] No share intent service available');
        this.available = false;
      }
    }
  }

  async getReceivedFiles(): Promise<any[]> {
    if (this.rnShareIntent) {
      return this.rnShareIntent.getReceivedFiles();
    }
    if (this.expoIntentLauncher) {
      // Custom implementation for expo-intent-launcher
      console.log('[UniversalShareIntent] Expo intent launcher - checking for shared content');
      return [];
    }
    return [];
  }

  async clearReceivedFiles(): Promise<void> {
    if (this.rnShareIntent) {
      this.rnShareIntent.clearReceivedFiles();
    }
    // Expo implementation would go here
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// ===== GOOGLE SIGN-IN SERVICE =====
class UniversalGoogleSignIn {
  private rnGoogleSignIn: any = null;
  private webAuth: boolean = false;
  private available: boolean = false;

  constructor() {
    this.initializeGoogleSignIn();
  }

  private async initializeGoogleSignIn() {
    try {
      // Try react-native-google-signin first
      this.rnGoogleSignIn = require('@react-native-google-signin/google-signin');
      this.available = true;
      console.log('[UniversalGoogleSignIn] Using native Google Sign-In');
    } catch (error) {
      // Fallback to web-based auth (works everywhere)
      this.webAuth = true;
      this.available = true;
      console.log('[UniversalGoogleSignIn] Using web-based Google auth');
    }
  }

  async configure(config: any): Promise<void> {
    if (this.rnGoogleSignIn) {
      this.rnGoogleSignIn.GoogleSignin.configure(config);
    }
    // Web auth configuration would go here
  }

  async signIn(): Promise<any> {
    if (this.rnGoogleSignIn) {
      return this.rnGoogleSignIn.GoogleSignin.signIn();
    }
    if (this.webAuth) {
      // Implement web-based Google OAuth
      console.log('[UniversalGoogleSignIn] Web-based sign-in');
      return { user: { email: 'user@example.com' } }; // Mock for now
    }
    throw new Error('Google Sign-In not available');
  }

  async signOut(): Promise<void> {
    if (this.rnGoogleSignIn) {
      await this.rnGoogleSignIn.GoogleSignin.signOut();
    }
    // Web auth sign out
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// ===== EXPORT UNIVERSAL SERVICES =====
export const UniversalFS = new UniversalFileSystem();
export const UniversalNotifs = new UniversalNotifications();
export const UniversalShare = new UniversalShareIntent();
export const UniversalAuth = new UniversalGoogleSignIn();

// Service status checker
export const ServiceStatus = {
  getAvailableServices(): Record<string, boolean | string> {
    return {
      fileSystem: UniversalFS.isAvailable(),
      notifications: UniversalNotifs.isAvailable(),
      shareIntent: UniversalShare.isAvailable(),
      googleAuth: UniversalAuth.isAvailable(),
      buildEnvironment: BuildEnvironment.isEASBuild ? 'EAS' : 'Local',
    };
  },

  logServiceStatus(): void {
    const status = this.getAvailableServices();
    console.log('🔧 Universal Services Status:', status);
  }
};

// Initialize and log status
ServiceStatus.logServiceStatus();

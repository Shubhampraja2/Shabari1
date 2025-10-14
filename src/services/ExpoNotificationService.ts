import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  title: string;
  message: string;
  channelId?: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';
  vibration?: boolean;
  sound?: boolean;
  data?: any;
  smallIcon?: string;
  largeIcon?: string;
  color?: string;
  autoCancel?: boolean;
  ongoing?: boolean;
  categoryIdentifier?: string; // For action buttons
}

export interface ScheduledNotificationData extends NotificationData {
  date: Date;
  repeatType?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
}

export class ExpoNotificationService {
  private static instance: ExpoNotificationService;
  private notificationListener: any;
  private responseListener: any;
  private isInitialized: boolean = false;

  private constructor() {}

  static getInstance(): ExpoNotificationService {
    if (!ExpoNotificationService.instance) {
      ExpoNotificationService.instance = new ExpoNotificationService();
    }
    return ExpoNotificationService.instance;
  }

  /**
   * Initialize notification service with permissions and channels
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🔔 Initializing Expo Notifications Service');

      // Request permissions
      const permissionGranted = await this.requestPermissions();
      if (!permissionGranted) {
        console.warn('⚠️ Notification permissions not granted');
        return false;
      }

      // Set up Android notification channel
      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
        await this.createNotificationCategories();
      }

      // Set up notification listeners
      this.setupNotificationListeners();

      this.isInitialized = true;
      console.log('✅ Expo Notifications Service initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Expo Notifications:', error);
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.warn('Must use physical device for push notifications');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push notification permissions');
        return false;
      }

      console.log('✅ Notification permissions granted');
      return true;

    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Create Android notification channels
   */
  async createNotificationChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      // Default channel for general notifications
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        description: 'Default notifications for the app',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      // Security alerts channel
      await Notifications.setNotificationChannelAsync('security', {
        name: 'Security Alerts',
        description: 'Important security notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 500, 500],
        lightColor: '#FF0000',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
        sound: 'default',
      });

      // URL Protection channel  
      await Notifications.setNotificationChannelAsync('url_protection', {
        name: 'URL Protection',
        description: 'Malicious URL detection alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 300, 300],
        lightColor: '#FFA500',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      // Ad Detection channel - NEW
      await Notifications.setNotificationChannelAsync('ad_detection', {
        name: 'Ad Detection',
        description: 'Detected advertisement notifications with blocking options',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 200, 200],
        lightColor: '#FF6B35',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });

      console.log('✅ Android notification channels created');

    } catch (error) {
      console.error('❌ Error creating notification channels:', error);
    }
  }

  /**
   * Create notification categories with action buttons
   */
  async createNotificationCategories(): Promise<void> {
    try {
      // Ad detection category with block/allow actions
      await Notifications.setNotificationCategoryAsync('ad_detected', [
        {
          identifier: 'block_ad',
          buttonTitle: '🚫 Block This Ad',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'allow_ad',
          buttonTitle: '✅ Allow',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'view_details',
          buttonTitle: '📊 View Details',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      // Blocked ad category with unblock action
      await Notifications.setNotificationCategoryAsync('ad_blocked', [
        {
          identifier: 'view_blocked',
          buttonTitle: '📋 View Blocked Ads',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      console.log('✅ Notification categories created with action buttons');
    } catch (error) {
      console.error('❌ Error creating notification categories:', error);
    }
  }

  /**
   * Set up notification listeners
   */
  setupNotificationListeners(): void {
    // Listen for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received:', notification);
      // Handle foreground notification display
    });

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Notification tapped:', response);
      // Handle notification tap
      this.handleNotificationResponse(response);
    });
  }

  /**
   * Handle notification tap/interaction
   */
  private async handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
    const { notification, actionIdentifier } = response;
    const data = notification.request.content.data;

    console.log('📱 Processing notification response:', { actionIdentifier, data });

    // Handle action button taps
    if (actionIdentifier === 'block_ad' && data?.adDomain) {
      console.log('🚫 User tapped Block Ad button for domain:', data.adDomain);
      await this.handleBlockAdAction(data.adDomain, data.adUrl, data.reason);
      return;
    }

    if (actionIdentifier === 'allow_ad' && data?.adDomain) {
      console.log('✅ User tapped Allow button for domain:', data.adDomain);
      await this.handleAllowAdAction(data.adDomain);
      return;
    }

    if (actionIdentifier === 'view_details' || actionIdentifier === 'view_blocked') {
      console.log('📊 User tapped View Details/Blocked Ads button');
      // This will be handled by navigation in the app
      return;
    }

    // Handle different notification types
    if (data?.type === 'security_alert') {
      // Navigate to security screen
      console.log('🔒 Security alert tapped');
    } else if (data?.type === 'url_protection') {
      // Navigate to scan results
      console.log('🛡️ URL protection alert tapped');
    } else if (data?.type === 'ad_detected') {
      console.log('📢 Ad detection notification tapped');
    } else if (data?.url) {
      // Handle URL notifications
      console.log('🔗 URL notification:', data.url);
    }
  }

  /**
   * Handle block ad action from notification
   */
  private async handleBlockAdAction(domain: string, url: string, reason: string): Promise<void> {
    try {
      // Import dynamically to avoid circular dependencies
      const { userAdBlockerService } = await import('./UserAdBlockerService');
      await userAdBlockerService.initialize();

      const success = await userAdBlockerService.blockDomain(domain, reason || 'Blocked from notification');

      if (success) {
        // Show confirmation notification
        await this.showNotification({
          title: '✅ Ad Blocked',
          message: `Domain "${domain}" has been blocked successfully`,
          channelId: 'ad_detection',
          priority: 'default',
          data: {
            type: 'ad_blocked',
            domain,
          },
          categoryIdentifier: 'ad_blocked',
        });
        console.log('✅ Ad domain blocked from notification:', domain);
      } else {
        console.error('❌ Failed to block ad domain:', domain);
      }
    } catch (error) {
      console.error('❌ Error handling block ad action:', error);
    }
  }

  /**
   * Handle allow ad action from notification
   */
  private async handleAllowAdAction(domain: string): Promise<void> {
    try {
      console.log('✅ User allowed ad from domain:', domain);
      // Just dismiss the notification - no action needed
      // Could optionally add domain to whitelist in the future
    } catch (error) {
      console.error('❌ Error handling allow ad action:', error);
    }
  }

  /**
   * Show ad detection notification with block button
   */
  async showAdDetectionNotification(adData: {
    domain: string;
    url: string;
    reason?: string;
    isBlocked?: boolean;
  }): Promise<string | null> {
    if (!this.isInitialized) {
      console.warn('⚠️ Notification service not initialized');
      return null;
    }

    // Check if ad notifications are enabled in settings
    try {
      const { userAdBlockerService } = await import('./UserAdBlockerService');
      const settings = userAdBlockerService.getSettings();

      if (!settings.showAdNotifications) {
        console.log('🔕 Ad notifications disabled by user - skipping notification');
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not check ad notification preferences:', error);
    }

    // Check if general notifications are enabled
    try {
      const { useFeaturePermissionStore } = await import('../stores/featurePermissionStore');
      const { getFeatureStatus } = useFeaturePermissionStore.getState();
      const notificationStatus = getFeatureStatus('advanced_notifications');

      if (!notificationStatus.isEnabled) {
        console.log('🔕 Notifications disabled by user - skipping notification');
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not check notification preferences:', error);
    }

    const { domain, url, reason, isBlocked } = adData;

    // If already blocked, show different notification
    if (isBlocked) {
      return await this.showNotification({
        title: '🚫 Ad Blocked',
        message: `Ad from "${domain}" was automatically blocked`,
        channelId: 'ad_detection',
        priority: 'default',
        data: {
          type: 'ad_blocked',
          adDomain: domain,
          adUrl: url,
        },
        categoryIdentifier: 'ad_blocked',
      });
    }

    // Show ad detection notification with action buttons
    return await this.showNotification({
      title: '📢 Advertisement Detected',
      message: `Ad detected from "${domain}". Would you like to block it?`,
      channelId: 'ad_detection',
      priority: 'high',
      data: {
        type: 'ad_detected',
        adDomain: domain,
        adUrl: url,
        reason: reason || 'Advertisement detected',
      },
      categoryIdentifier: 'ad_detected',
      sound: true,
      vibration: true,
    });
  }

  /**
   * Show local notification (checks user preferences first)
   */
  async showNotification(notificationData: NotificationData): Promise<string | null> {
    if (!this.isInitialized) {
      console.warn('⚠️ Notification service not initialized');
      return null;
    }

    // Check if notifications are enabled in user settings
    try {
      const { useFeaturePermissionStore } = await import('../stores/featurePermissionStore');
      const { getFeatureStatus } = useFeaturePermissionStore.getState();
      const notificationStatus = getFeatureStatus('advanced_notifications');
      
      if (!notificationStatus.isEnabled) {
        console.log('🔕 Notifications disabled by user - skipping notification');
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not check notification preferences:', error);
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationData.title,
          body: notificationData.message,
          data: notificationData.data || {},
          sound: notificationData.sound !== false,
          vibrate: notificationData.vibration !== false ? [0, 250, 250, 250] : undefined,
          priority: this.mapPriority(notificationData.priority),
          categoryIdentifier: notificationData.categoryIdentifier, // ✅ FIX: Add category for action buttons
        },
        trigger: null, // Show immediately
      });

      console.log('✅ Local notification scheduled:', notificationId);
      return notificationId;

    } catch (error) {
      console.error('❌ Failed to schedule notification:', error);
      return null;
    }
  }

  /**
   * Schedule notification for later (checks user preferences first)
   */
  async scheduleNotification(notificationData: ScheduledNotificationData): Promise<string | null> {
    if (!this.isInitialized) {
      console.warn('⚠️ Notification service not initialized');
      return null;
    }

    // Check if notifications are enabled in user settings
    try {
      const { useFeaturePermissionStore } = await import('../stores/featurePermissionStore');
      const { getFeatureStatus } = useFeaturePermissionStore.getState();
      const notificationStatus = getFeatureStatus('advanced_notifications');
      
      if (!notificationStatus.isEnabled) {
        console.log('🔕 Notifications disabled by user - skipping scheduled notification');
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not check notification preferences:', error);
    }

    try {
      const trigger = notificationData.repeatType 
        ? this.createRepeatingTrigger(notificationData.date, notificationData.repeatType)
        : { date: notificationData.date };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationData.title,
          body: notificationData.message,
          data: notificationData.data || {},
          sound: notificationData.sound !== false,
          vibrate: notificationData.vibration !== false ? [0, 250, 250, 250] : undefined,
          priority: this.mapPriority(notificationData.priority),
        },
        trigger,
      });

      console.log('⏰ Notification scheduled:', notificationId);
      return notificationId;

    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Cancel specific notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('🗑️ Notification canceled:', notificationId);
    } catch (error) {
      console.error('❌ Error canceling notification:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('🗑️ All notifications canceled');
    } catch (error) {
      console.error('❌ Error canceling all notifications:', error);
    }
  }

  /**
   * Get push notification token
   */
  async getPushToken(): Promise<string | null> {
    if (!Device.isDevice) {
      console.warn('Must use physical device for push tokens');
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn('No project ID found in Expo config');
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      console.log('📱 Push token obtained:', token.data);
      return token.data;

    } catch (error) {
      console.error('❌ Error getting push token:', error);
      return null;
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('❌ Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Map priority to Expo format
   */
  private mapPriority(priority?: string): Notifications.AndroidNotificationPriority {
    switch (priority) {
      case 'min': return Notifications.AndroidNotificationPriority.MIN;
      case 'low': return Notifications.AndroidNotificationPriority.LOW;
      case 'high': return Notifications.AndroidNotificationPriority.HIGH;
      case 'max': return Notifications.AndroidNotificationPriority.MAX;
      default: return Notifications.AndroidNotificationPriority.DEFAULT;
    }
  }

  /**
   * Create repeating trigger
   */
  private createRepeatingTrigger(date: Date, repeatType: string): any {
    const now = new Date();
    const triggerDate = new Date(date);

    switch (repeatType) {
      case 'minute':
        return {
          seconds: 60,
          repeats: true,
        };
      case 'hour':
        return {
          seconds: 3600,
          repeats: true,
        };
      case 'day':
        return {
          hour: triggerDate.getHours(),
          minute: triggerDate.getMinutes(),
          repeats: true,
        };
      case 'week':
        return {
          weekday: triggerDate.getDay() + 1,
          hour: triggerDate.getHours(),
          minute: triggerDate.getMinutes(),
          repeats: true,
        };
      default:
        return { date: triggerDate };
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
    this.isInitialized = false;
    console.log('🧹 Notification service cleaned up');
  }
}

// Export singleton instance
export const notificationService = ExpoNotificationService.getInstance();

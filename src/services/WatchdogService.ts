/**
 * Watchdog Service
 * Monitors and ensures critical background services stay active
 * Auto-restarts services if they fail or stop unexpectedly
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundFetch from 'react-native-background-fetch';

interface WatchdogStatus {
  isMonitoring: boolean;
  lastHeartbeat: number;
  servicesChecked: number;
  restartCount: number;
  lastRestartTime: number | null;
  errors: string[];
}

interface ServiceHealthCheck {
  name: string;
  isHealthy: boolean;
  lastCheck: number;
  errorCount: number;
}

class WatchdogServiceClass {
  private isMonitoring: boolean = false;
  private lastHeartbeat: number = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any = null;
  private servicesChecked: number = 0;
  private restartCount: number = 0;
  private lastRestartTime: number | null = null;
  private errors: string[] = [];
  private serviceHealth: Map<string, ServiceHealthCheck> = new Map();

  // Configuration
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly RESTART_COOLDOWN = 120000; // 2 minutes
  private readonly MAX_ERRORS_STORED = 10;

  /**
   * Initialize Watchdog Service
   */
  async initialize(): Promise<boolean> {
    if (this.isMonitoring) {
      console.log('⚠️ Watchdog already monitoring');
      return true;
    }

    try {
      console.log('🐕 Initializing Watchdog Service...');

      // Clear old errors
      this.errors = [];

      // Load previous state
      await this.loadState();

      // Start monitoring app state changes
      this.setupAppStateListener();

      // Start heartbeat
      this.startHeartbeat();

      // Initial health check
      await this.performHealthCheck();

      // Setup background watchdog task
      await this.setupBackgroundWatchdog();

      this.isMonitoring = true;

      console.log('✅ Watchdog Service initialized successfully');
      console.log(`📊 Services monitored: ${this.serviceHealth.size}`);

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Watchdog initialization failed:', errorMsg);
      this.addError(`Initialization failed: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Setup app state listener to detect foreground/background transitions
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
    console.log('👂 Watchdog listening to app state changes');
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log(`🐕 App state changed to: ${nextAppState}`);

    try {
      if (nextAppState === 'active') {
        // App came to foreground - perform immediate health check
        console.log('🔍 App active - performing health check...');
        await this.performHealthCheck();
      } else if (nextAppState === 'background') {
        // App went to background - ensure watchdog continues
        console.log('🔒 App backgrounded - ensuring watchdog continues...');
        await this.ensureBackgroundExecution();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ App state change handler error:', errorMsg);
      this.addError(`App state handler: ${errorMsg}`);
    }
  };

  /**
   * Start heartbeat to confirm watchdog is alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      this.lastHeartbeat = Date.now();

      // Save heartbeat timestamp
      try {
        await AsyncStorage.setItem('watchdog_heartbeat', this.lastHeartbeat.toString());
      } catch (error) {
        console.error('❌ Failed to save heartbeat:', error);
      }

      // Perform periodic health check
      if (Date.now() % this.HEALTH_CHECK_INTERVAL < this.HEARTBEAT_INTERVAL) {
        await this.performHealthCheck();
      }
    }, this.HEARTBEAT_INTERVAL);

    console.log('💓 Watchdog heartbeat started');
  }

  /**
   * Perform comprehensive health check on all services
   */
  private async performHealthCheck(): Promise<void> {
    console.log('🔍 Performing health check...');
    this.servicesChecked++;

    try {
      // Check Background Fetch status
      await this.checkBackgroundFetch();

      // Check critical storage keys
      await this.checkCriticalStorage();

      // Check service timestamps
      await this.checkServiceTimestamps();

      console.log('✅ Health check completed');
      await this.saveState();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Health check failed:', errorMsg);
      this.addError(`Health check: ${errorMsg}`);
    }
  }

  /**
   * Check Background Fetch status
   */
  private async checkBackgroundFetch(): Promise<void> {
    try {
      const status = await BackgroundFetch.status();

      const healthCheck: ServiceHealthCheck = {
        name: 'BackgroundFetch',
        isHealthy: status === BackgroundFetch.STATUS_AVAILABLE,
        lastCheck: Date.now(),
        errorCount: this.serviceHealth.get('BackgroundFetch')?.errorCount || 0
      };

      if (!healthCheck.isHealthy) {
        console.warn('⚠️ Background Fetch not available:', status);
        healthCheck.errorCount++;

        // Attempt restart if within limits
        if (this.shouldAttemptRestart('BackgroundFetch')) {
          await this.restartBackgroundFetch();
        }
      }

      this.serviceHealth.set('BackgroundFetch', healthCheck);
    } catch (error) {
      console.error('❌ Background Fetch check failed:', error);
      this.addError(`BackgroundFetch check: ${error}`);
    }
  }

  /**
   * Check critical storage keys
   */
  private async checkCriticalStorage(): Promise<void> {
    const criticalKeys = [
      'last_background_task',
      'threat_detection_enabled',
      'vpn_protection_config'
    ];

    for (const key of criticalKeys) {
      try {
        const value = await AsyncStorage.getItem(key);

        const healthCheck: ServiceHealthCheck = {
          name: `Storage:${key}`,
          isHealthy: value !== null,
          lastCheck: Date.now(),
          errorCount: this.serviceHealth.get(`Storage:${key}`)?.errorCount || 0
        };

        this.serviceHealth.set(`Storage:${key}`, healthCheck);
      } catch (error) {
        console.error(`❌ Storage check failed for ${key}:`, error);
      }
    }
  }

  /**
   * Check service timestamps to detect stalled services
   */
  private async checkServiceTimestamps(): Promise<void> {
    try {
      const lastTaskTime = await AsyncStorage.getItem('last_background_task');

      if (lastTaskTime) {
        const timeSinceLastTask = Date.now() - parseInt(lastTaskTime);
        const stalledThreshold = 30 * 60 * 1000; // 30 minutes

        if (timeSinceLastTask > stalledThreshold) {
          console.warn('⚠️ Background tasks appear stalled');
          console.log(`   Last task: ${Math.floor(timeSinceLastTask / 60000)} minutes ago`);

          // Attempt restart
          if (this.shouldAttemptRestart('BackgroundTasks')) {
            await this.restartBackgroundFetch();
          }
        }
      }
    } catch (error) {
      console.error('❌ Timestamp check failed:', error);
    }
  }

  /**
   * Determine if we should attempt a restart
   */
  private shouldAttemptRestart(serviceName: string): boolean {
    // Check restart count
    if (this.restartCount >= this.MAX_RESTART_ATTEMPTS) {
      console.warn(`⚠️ Max restart attempts reached for ${serviceName}`);
      return false;
    }

    // Check cooldown period
    if (this.lastRestartTime) {
      const timeSinceRestart = Date.now() - this.lastRestartTime;
      if (timeSinceRestart < this.RESTART_COOLDOWN) {
        console.warn(`⚠️ Restart cooldown active for ${serviceName}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Restart Background Fetch
   */
  private async restartBackgroundFetch(): Promise<void> {
    console.log('🔄 Attempting to restart Background Fetch...');

    try {
      // Stop current instance
      await BackgroundFetch.stop();

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart with aggressive configuration
      await BackgroundFetch.configure({
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiresCharging: false,
        requiresDeviceIdle: false,
        requiresBatteryNotLow: false,
        requiresStorageNotLow: false,
      }, async (taskId) => {
        console.log('🐕 Watchdog background task executed:', taskId);
        await this.performHealthCheck();
        BackgroundFetch.finish(taskId);
      }, (taskId) => {
        console.warn('⚠️ Watchdog task timeout:', taskId);
        BackgroundFetch.finish(taskId);
      });

      this.restartCount++;
      this.lastRestartTime = Date.now();

      console.log('✅ Background Fetch restarted successfully');
      await this.saveState();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to restart Background Fetch:', errorMsg);
      this.addError(`Restart failed: ${errorMsg}`);
    }
  }

  /**
   * Ensure watchdog continues in background
   */
  private async ensureBackgroundExecution(): Promise<void> {
    console.log('🔒 Ensuring background execution...');

    try {
      // Update last activity timestamp
      await AsyncStorage.setItem('watchdog_last_active', Date.now().toString());

      // Verify background task is scheduled
      const status = await BackgroundFetch.status();
      if (status !== BackgroundFetch.STATUS_AVAILABLE) {
        console.warn('⚠️ Background task not available, attempting restart...');
        await this.restartBackgroundFetch();
      }
    } catch (error) {
      console.error('❌ Failed to ensure background execution:', error);
    }
  }

  /**
   * Setup background watchdog task
   */
  private async setupBackgroundWatchdog(): Promise<void> {
    try {
      await BackgroundFetch.configure({
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
      }, async (taskId) => {
        console.log('🐕 Watchdog background check:', taskId);
        await this.performHealthCheck();
        BackgroundFetch.finish(taskId);
      }, (taskId) => {
        console.warn('⚠️ Watchdog timeout:', taskId);
        BackgroundFetch.finish(taskId);
      });

      console.log('✅ Background watchdog configured');
    } catch (error) {
      console.error('❌ Failed to setup background watchdog:', error);
    }
  }

  /**
   * Add error to error log
   */
  private addError(error: string): void {
    const timestamp = new Date().toISOString();
    this.errors.unshift(`[${timestamp}] ${error}`);

    // Keep only recent errors
    if (this.errors.length > this.MAX_ERRORS_STORED) {
      this.errors = this.errors.slice(0, this.MAX_ERRORS_STORED);
    }
  }

  /**
   * Get current watchdog status
   */
  async getStatus(): Promise<WatchdogStatus> {
    return {
      isMonitoring: this.isMonitoring,
      lastHeartbeat: this.lastHeartbeat,
      servicesChecked: this.servicesChecked,
      restartCount: this.restartCount,
      lastRestartTime: this.lastRestartTime,
      errors: [...this.errors]
    };
  }

  /**
   * Get detailed service health information
   */
  getServiceHealth(): ServiceHealthCheck[] {
    return Array.from(this.serviceHealth.values());
  }

  /**
   * Manual restart trigger (for testing)
   */
  async manualRestart(): Promise<boolean> {
    console.log('🔧 Manual restart triggered by user');

    try {
      await this.restartBackgroundFetch();
      return true;
    } catch (error) {
      console.error('❌ Manual restart failed:', error);
      return false;
    }
  }

  /**
   * Load watchdog state from storage
   */
  private async loadState(): Promise<void> {
    try {
      const savedState = await AsyncStorage.getItem('watchdog_state');
      if (savedState) {
        const state = JSON.parse(savedState);
        this.restartCount = state.restartCount || 0;
        this.lastRestartTime = state.lastRestartTime || null;
        console.log('📂 Loaded watchdog state:', state);
      }
    } catch (error) {
      console.warn('⚠️ Could not load watchdog state:', error);
    }
  }

  /**
   * Save watchdog state to storage
   */
  private async saveState(): Promise<void> {
    try {
      const state = {
        restartCount: this.restartCount,
        lastRestartTime: this.lastRestartTime,
        lastSaved: Date.now()
      };
      await AsyncStorage.setItem('watchdog_state', JSON.stringify(state));
    } catch (error) {
      console.warn('⚠️ Could not save watchdog state:', error);
    }
  }

  /**
   * Reset watchdog counters
   */
  async reset(): Promise<void> {
    console.log('🔄 Resetting watchdog counters...');

    this.restartCount = 0;
    this.lastRestartTime = null;
    this.errors = [];
    this.servicesChecked = 0;

    await AsyncStorage.removeItem('watchdog_state');
    console.log('✅ Watchdog reset complete');
  }

  /**
   * Stop watchdog service
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Watchdog Service...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    await this.saveState();

    this.isMonitoring = false;
    console.log('✅ Watchdog Service stopped');
  }
}

// Export singleton instance
export const WatchdogService = new WatchdogServiceClass();


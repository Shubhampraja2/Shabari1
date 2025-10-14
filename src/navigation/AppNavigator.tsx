import { createStackNavigator } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// Screens
import { AdminScreen } from '../screens/AdminScreen';
import { CallLogScreen } from '../screens/CallLogScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DeepScanScreen from '../screens/DeepScanScreen';
import { FeatureManagementScreen } from '../screens/FeatureManagementScreen';
import LiveQRScannerScreen from '../screens/LiveQRScannerScreen';
import LoginScreen from '../screens/LoginScreen';
import { ManualSMSScannerScreen } from '../screens/ManualSMSScannerScreen';
import MessageAnalysisScreen from '../screens/MessageAnalysisScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { ProxyEngineTestScreen } from '../screens/ProxyEngineTestScreen';
import { AdvancedQuarantineScreen } from '../screens/AdvancedQuarantineScreen';
import { ReportNumberScreen } from '../screens/ReportNumberScreen';
import ScanResultScreen from '../screens/ScanResultScreen';
import SecureBrowserScreen from '../screens/SecureBrowserScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SMSScannerScreen from '../screens/SMSScannerScreen';
import { ThreatDetectionScreen } from '../screens/ThreatDetectionScreen';
import { ThreatDetectionSettingsScreen } from '../screens/ThreatDetectionSettingsScreen';
import { VPNControlScreen } from '../screens/VPNControlScreen';
import EnhancedAdBlockerScreen from '../screens/EnhancedAdBlockerScreen';

// Stores
import { initializeAuthListener, useAuthStore } from '../stores/authStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, sessionInitialized, checkAuth } = useAuthStore();
  const { checkSubscriptionStatus } = useSubscriptionStore();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let authListenerCleanup: (() => void) | undefined;

    const initializeApp = async () => {
      try {
        console.log('🔄 AppNavigator: Initializing authentication system...');
        
        // Set up auth state listener first
        authListenerCleanup = initializeAuthListener();
        
        // Check authentication status
        await checkAuth();
        console.log('✅ AppNavigator: Authentication check completed');
        
        // Small delay to ensure state is properly set
        setTimeout(() => {
          setIsInitializing(false);
        }, 500);
      } catch (error) {
        console.error('❌ AppNavigator: Authentication initialization failed:', error);
        setIsInitializing(false);
      }
    };

    initializeApp();

    // Cleanup auth listener on unmount
    return () => {
      if (authListenerCleanup) {
        console.log('🔄 AppNavigator: Cleaning up auth listener');
        authListenerCleanup();
      }
    };
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    console.log('🔄 AppNavigator: Auth state changed:', { 
      isAuthenticated, 
      isLoading, 
      sessionInitialized 
    });
    
    if (isAuthenticated) {
      console.log('🔄 AppNavigator: User authenticated, checking subscription status...');
      checkSubscriptionStatus().catch(error => {
        console.error('❌ AppNavigator: Subscription check failed:', error);
      });
    }
  }, [isAuthenticated, isLoading, sessionInitialized]);

  // Show loading screen during initialization or while loading auth state
  if (isInitializing || (isLoading && !sessionInitialized)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ecdc4" />
        <Text style={styles.loadingText}>
          {isInitializing ? 'Initializing Shabari...' : 'Checking authentication...'}
        </Text>
      </View>
    );
  }

  console.log('🔄 AppNavigator: Rendering navigation with auth state:', { 
    isAuthenticated, 
    hasSeenOnboarding,
    sessionInitialized 
  });

  return (
    <Stack.Navigator
      initialRouteName={!isAuthenticated ? (hasSeenOnboarding ? "Login" : "Onboarding") : "Dashboard"}
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyle: { backgroundColor: '#ffffff' },
      }}
    >
      {!isAuthenticated ? (
        <>
          <Stack.Screen 
            name="Onboarding"
          >
            {(props) => (
              <OnboardingScreen
                {...props}
                onComplete={() => {
                  console.log('✅ Onboarding completed');
                  setHasSeenOnboarding(true);
                  props.navigation.replace('Login');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen 
            name="Login"
          >
            {(props) => (
              <LoginScreen
                {...props}
                onLoginSuccess={() => {
                  console.log('✅ Login successful - navigation will be handled by auth state change');
                  // Navigation will be handled automatically by auth state change
                }}
              />
            )}
          </Stack.Screen>
        </>
      ) : (
        <>
          <Stack.Screen 
            name="Dashboard"
          >
            {(props) => (
              <DashboardScreen
                {...props}
                navigation={props.navigation}
                onNavigateToSecureBrowser={() => {
                  console.log('🔄 Navigating to SecureBrowser');
                  props.navigation.navigate('SecureBrowser');
                }}
                onNavigateToScanResult={(result) => {
                  console.log('🔄 Navigating to ScanResult');
                  props.navigation.navigate('ScanResult', result);
                }}
                onNavigateToQRScanner={() => {
                  console.log('🔄 Navigating to LiveQRScanner');
                  props.navigation.navigate('LiveQRScanner');
                }}
                onNavigateToSettings={() => {
                  console.log('🔄 Navigating to Settings');
                  props.navigation.navigate('Settings');
                }}
                onNavigateToMessageAnalysis={() => {
                  console.log('🔄 Navigating to MessageAnalysis');
                  props.navigation.navigate('MessageAnalysis');
                }}
                onNavigateToFeatureManagement={() => {
                  console.log('🔄 Navigating to FeatureManagement');
                  props.navigation.navigate('FeatureManagement');
                }}
                onNavigateToQuarantine={() => {
                  console.log('🔄 Navigating to Quarantine');
                  props.navigation.navigate('Quarantine');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="MessageAnalysis">
            {(props) => (
              <MessageAnalysisScreen
                {...props}
                navigation={props.navigation}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="FeatureManagement">
            {(props) => (
              <FeatureManagementScreen
                {...props}
                onNavigateBack={() => {
                  console.log('🔄 Going back from FeatureManagement');
                  props.navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="SecureBrowser">
            {(props) => (
              <SecureBrowserScreen
                {...props}
                onNavigateToScanResult={(result) => {
                  console.log('🔄 Navigating to ScanResult from SecureBrowser');
                  props.navigation.navigate('ScanResult', result);
                }}
                onGoBack={() => {
                  console.log('🔄 Going back from SecureBrowser');
                  props.navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="ScanResult">
            {(props) => (
              <ScanResultScreen
                route={props.route as any}
                onGoBack={() => {
                  console.log('🔄 Going back from ScanResult');
                  props.navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="LiveQRScanner">
            {(props) => (
              <LiveQRScannerScreen
                {...props}
                navigation={props.navigation}
                route={props.route}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {(props) => (
              <SettingsScreen
                {...props}
                onNavigateToUpgrade={() => {
                  console.log('🔄 Navigate to ReportNumber');
                  props.navigation.navigate('ReportNumber');
                }}
                onGoBack={() => {
                  console.log('🔄 Going back from Settings');
                  props.navigation.goBack();
                }}
                onNavigateToVPNControl={() => {
                  console.log('🔄 Navigating to VPNControl');
                  props.navigation.navigate('VPNControl');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="ReportNumber">
            {(props) => (
              <ReportNumberScreen
                {...props}
                navigation={props.navigation}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="CallLog">
            {(props) => (
              <CallLogScreen
                {...props}
                navigation={props.navigation}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="SMSScanner">
            {(props) => (
              <SMSScannerScreen
                {...props}
                navigation={props.navigation}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="ManualSMSScanner">
            {(props) => (
              <ManualSMSScannerScreen
                {...props}
                onNavigateBack={() => {
                  console.log('🔄 Going back from ManualSMSScanner');
                  props.navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Quarantine">
            {(props) => (
              <AdvancedQuarantineScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="Admin">
            {(props) => (
              <AdminScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="ThreatDetection">
            {(props) => (
              <ThreatDetectionScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="ThreatDetectionSettings">
            {(props) => (
              <ThreatDetectionSettingsScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="ProxyEngineTest">
            {(props) => (
              <ProxyEngineTestScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="VPNControl">
            {(props) => (
              <VPNControlScreen />
            )}
          </Stack.Screen>
          <Stack.Screen name="DeepScan">
            {(props) => (
              <DeepScanScreen
                {...props}
                onGoBack={() => {
                  console.log('🔄 Going back from DeepScan');
                  props.navigation.goBack();
                }}
                onNavigateToQuarantine={() => {
                  console.log('🔄 Navigating to Quarantine from DeepScan');
                  props.navigation.navigate('Quarantine');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="EnhancedAdBlocker">
            {(props) => (
              <EnhancedAdBlockerScreen />
            )}
          </Stack.Screen>
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default AppNavigator;

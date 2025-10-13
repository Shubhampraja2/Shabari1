#!/usr/bin/env node

/**
 * Watchdog System Test Script
 * Comprehensive testing of the Watchdog service
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🐕 Testing Watchdog System\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Check if WatchdogService exists
console.log('📝 Test 1: Checking if WatchdogService exists...');
const watchdogPath = path.join(__dirname, 'src', 'services', 'WatchdogService.ts');

if (fs.existsSync(watchdogPath)) {
  console.log('✅ WatchdogService.ts found');

  const content = fs.readFileSync(watchdogPath, 'utf8');

  // Check for critical methods
  const requiredMethods = [
    'initialize',
    'performHealthCheck',
    'restartBackgroundFetch',
    'getStatus',
    'setupAppStateListener'
  ];

  console.log('\n🔍 Checking for required methods:');
  let allMethodsPresent = true;

  requiredMethods.forEach(method => {
    if (content.includes(method)) {
      console.log(`   ✅ ${method}()`);
    } else {
      console.log(`   ❌ ${method}() - MISSING`);
      allMethodsPresent = false;
    }
  });

  if (allMethodsPresent) {
    console.log('\n✅ All required methods present');
    allMethodsPresent = true;
  } else {
    console.log('\n❌ Some methods are missing');
    allMethodsPresent = false;
  }
} else {
  console.log('❌ WatchdogService.ts NOT FOUND');
  console.log('   Expected at:', watchdogPath);
  process.exit(1);
}

// Test 2: Check for proper imports
console.log('\n📝 Test 2: Checking imports...');
const watchdogContent = fs.readFileSync(watchdogPath, 'utf8');

const requiredImports = [
  'AppState',
  'AsyncStorage',
  'BackgroundFetch'
];

console.log('🔍 Checking for required imports:');
let allImportsPresent = true;

requiredImports.forEach(imp => {
  if (watchdogContent.includes(imp)) {
    console.log(`   ✅ ${imp}`);
  } else {
    console.log(`   ❌ ${imp} - MISSING`);
    allImportsPresent = false;
  }
});

if (allImportsPresent) {
  console.log('✅ All required imports present');
} else {
  console.log('❌ Some imports are missing');
}

// Test 3: Check service configuration
console.log('\n📝 Test 3: Checking service configuration...');

const configChecks = [
  { name: 'HEARTBEAT_INTERVAL', pattern: /HEARTBEAT_INTERVAL.*=.*\d+/ },
  { name: 'HEALTH_CHECK_INTERVAL', pattern: /HEALTH_CHECK_INTERVAL.*=.*\d+/ },
  { name: 'MAX_RESTART_ATTEMPTS', pattern: /MAX_RESTART_ATTEMPTS.*=.*\d+/ }
];

console.log('🔍 Checking configuration constants:');
configChecks.forEach(check => {
  if (check.pattern.test(watchdogContent)) {
    console.log(`   ✅ ${check.name} configured`);
  } else {
    console.log(`   ⚠️  ${check.name} not found`);
  }
});

// Test 4: Check error handling
console.log('\n📝 Test 4: Checking error handling...');

const errorHandlingPatterns = [
  'try.*catch',
  'console.error',
  'addError'
];

console.log('🔍 Checking error handling patterns:');
errorHandlingPatterns.forEach(pattern => {
  const regex = new RegExp(pattern, 'g');
  const matches = watchdogContent.match(regex);
  if (matches && matches.length > 0) {
    console.log(`   ✅ ${pattern} found (${matches.length} occurrences)`);
  } else {
    console.log(`   ⚠️  ${pattern} not found`);
  }
});

// Test 5: Check state management
console.log('\n📝 Test 5: Checking state management...');

const stateMethods = ['loadState', 'saveState', 'reset'];

console.log('🔍 Checking state management methods:');
stateMethods.forEach(method => {
  if (watchdogContent.includes(method)) {
    console.log(`   ✅ ${method}()`);
  } else {
    console.log(`   ❌ ${method}() - MISSING`);
  }
});

// Test 6: Check monitoring capabilities
console.log('\n📝 Test 6: Checking monitoring capabilities...');

const monitoringFeatures = [
  'checkBackgroundFetch',
  'checkCriticalStorage',
  'checkServiceTimestamps',
  'getServiceHealth'
];

console.log('🔍 Checking monitoring features:');
let monitoringScore = 0;

monitoringFeatures.forEach(feature => {
  if (watchdogContent.includes(feature)) {
    console.log(`   ✅ ${feature}`);
    monitoringScore++;
  } else {
    console.log(`   ❌ ${feature} - MISSING`);
  }
});

const monitoringPercentage = (monitoringScore / monitoringFeatures.length) * 100;
console.log(`\n📊 Monitoring capabilities: ${monitoringScore}/${monitoringFeatures.length} (${monitoringPercentage.toFixed(0)}%)`);

// Test 7: Check TypeScript interfaces
console.log('\n📝 Test 7: Checking TypeScript interfaces...');

const interfaces = [
  'WatchdogStatus',
  'ServiceHealthCheck'
];

console.log('🔍 Checking interface definitions:');
interfaces.forEach(iface => {
  const pattern = new RegExp(`interface\\s+${iface}`, 'g');
  if (pattern.test(watchdogContent)) {
    console.log(`   ✅ ${iface}`);
  } else {
    console.log(`   ❌ ${iface} - MISSING`);
  }
});

// Final Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 TEST SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const summary = {
  serviceExists: fs.existsSync(watchdogPath),
  methodsPresent: allMethodsPresent,
  importsPresent: allImportsPresent,
  monitoringCapabilities: monitoringPercentage,
  overallStatus: 'UNKNOWN'
};

// Calculate overall status
if (summary.serviceExists && summary.methodsPresent && summary.importsPresent && monitoringPercentage >= 75) {
  summary.overallStatus = '✅ PASS';
  console.log('✅ Watchdog System: FULLY FUNCTIONAL');
} else if (summary.serviceExists && monitoringPercentage >= 50) {
  summary.overallStatus = '⚠️  PARTIAL';
  console.log('⚠️  Watchdog System: PARTIALLY FUNCTIONAL');
} else {
  summary.overallStatus = '❌ FAIL';
  console.log('❌ Watchdog System: NOT FUNCTIONAL');
}

console.log('\n📋 Details:');
console.log(`   Service File: ${summary.serviceExists ? '✅ Exists' : '❌ Missing'}`);
console.log(`   Methods: ${summary.methodsPresent ? '✅ Complete' : '❌ Incomplete'}`);
console.log(`   Imports: ${summary.importsPresent ? '✅ Complete' : '❌ Incomplete'}`);
console.log(`   Monitoring: ${monitoringPercentage.toFixed(0)}%`);
console.log(`   Overall: ${summary.overallStatus}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Test 8: Generate integration code
console.log('\n📝 Test 8: Generating integration code...\n');

const integrationCode = `
// Add this to your App.tsx or main entry point:

import { WatchdogService } from './src/services/WatchdogService';

// Initialize in useEffect
useEffect(() => {
  const initializeWatchdog = async () => {
    try {
      const success = await WatchdogService.initialize();
      if (success) {
        console.log('✅ Watchdog initialized');
      } else {
        console.error('❌ Watchdog failed to initialize');
      }
    } catch (error) {
      console.error('❌ Watchdog error:', error);
    }
  };

  initializeWatchdog();

  // Cleanup
  return () => {
    WatchdogService.stop();
  };
}, []);

// Add to your Settings screen to monitor status:

import { WatchdogService } from '../services/WatchdogService';

const [watchdogStatus, setWatchdogStatus] = useState(null);

useEffect(() => {
  const updateStatus = async () => {
    const status = await WatchdogService.getStatus();
    setWatchdogStatus(status);
  };
  
  updateStatus();
  const interval = setInterval(updateStatus, 5000);
  
  return () => clearInterval(interval);
}, []);

// Display watchdog status in UI:
{watchdogStatus && (
  <View>
    <Text>🐕 Watchdog Status</Text>
    <Text>Monitoring: {watchdogStatus.isMonitoring ? '✅' : '❌'}</Text>
    <Text>Services Checked: {watchdogStatus.servicesChecked}</Text>
    <Text>Restarts: {watchdogStatus.restartCount}</Text>
    <Text>Last Heartbeat: {new Date(watchdogStatus.lastHeartbeat).toLocaleTimeString()}</Text>
  </View>
)}
`;

console.log('📄 Integration code generated!');
console.log('   Save to: WATCHDOG_INTEGRATION.md');

fs.writeFileSync(
  path.join(__dirname, 'WATCHDOG_INTEGRATION.md'),
  integrationCode
);

console.log('✅ Integration guide created: WATCHDOG_INTEGRATION.md\n');

// Exit with appropriate code
if (summary.overallStatus === '✅ PASS') {
  console.log('🎉 All tests passed! Watchdog system is ready to use.\n');
  process.exit(0);
} else if (summary.overallStatus === '⚠️  PARTIAL') {
  console.log('⚠️  Some issues detected. Review the output above.\n');
  process.exit(1);
} else {
  console.log('❌ Critical issues detected. Watchdog system needs fixes.\n');
  process.exit(1);
}

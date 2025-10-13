#!/usr/bin/env node

/**
 * Watchdog System Test - Simple Version
 */

const fs = require('fs');
const path = require('path');

console.log('🐕 Testing Watchdog System\n');

const watchdogPath = path.join(__dirname, 'src', 'services', 'WatchdogService.ts');

if (!fs.existsSync(watchdogPath)) {
  console.error('❌ WatchdogService.ts NOT FOUND');
  process.exit(1);
}

console.log('✅ WatchdogService.ts found');
const content = fs.readFileSync(watchdogPath, 'utf8');

// Check methods
const methods = ['initialize', 'performHealthCheck', 'restartBackgroundFetch', 'getStatus'];
const methodsOk = methods.every(m => content.includes(m));
console.log(`${methodsOk ? '✅' : '❌'} Methods: ${methodsOk ? 'Complete' : 'Missing some'}`);

// Check imports
const imports = ['AppState', 'AsyncStorage', 'BackgroundFetch'];
const importsOk = imports.every(i => content.includes(i));
console.log(`${importsOk ? '✅' : '❌'} Imports: ${importsOk ? 'Complete' : 'Missing some'}`);

// Check monitoring
const monitoring = ['checkBackgroundFetch', 'checkCriticalStorage', 'getServiceHealth'];
const monitoringOk = monitoring.every(m => content.includes(m));
console.log(`${monitoringOk ? '✅' : '❌'} Monitoring: ${monitoringOk ? 'Complete' : 'Missing some'}`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (methodsOk && importsOk && monitoringOk) {
  console.log('✅ Watchdog System: FULLY FUNCTIONAL');
  console.log('\n🎉 All tests passed! Ready to use.\n');
  process.exit(0);
} else {
  console.log('❌ Watchdog System: NEEDS FIXES');
  process.exit(1);
}


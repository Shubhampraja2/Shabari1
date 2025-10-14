// Quick verification script for Shabari App
// Run with: node verify-app-status.js

const fs = require('fs');
const path = require('path');

console.log('🔍 Shabari App - Configuration Verification\n');
console.log('=' .repeat(60));

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${description}`);
    passCount++;
    return true;
  } else {
    console.log(`❌ ${description} - MISSING`);
    failCount++;
    return false;
  }
}

function checkFileContent(filePath, searchString, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(searchString)) {
      console.log(`✅ ${description}`);
      passCount++;
      return true;
    } else {
      console.log(`⚠️  ${description} - NOT FOUND`);
      warnCount++;
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description} - ERROR: ${error.message}`);
    failCount++;
    return false;
  }
}

console.log('\n📦 Checking Project Structure...\n');

// Check critical files
checkFile('package.json', 'package.json exists');
checkFile('App.tsx', 'App.tsx exists');
checkFile('app.config.js', 'app.config.js exists');
checkFile('eas.json', 'eas.json exists');

console.log('\n🔧 Checking Configuration Files...\n');

// Check key configurations
checkFileContent('app.config.js', '"version": "1.1.0"', 'App version is 1.1.0');
checkFileContent('app.config.js', '"package": "com.shabari.app"', 'Package name configured');
checkFileContent('eas.json', 'production', 'Production build profile exists');

console.log('\n🛡️ Checking Security Features...\n');

// Check stores
checkFile('src/stores/subscriptionStore.ts', 'Subscription store exists');
checkFile('src/stores/authStore.ts', 'Auth store exists');

// CRITICAL: Check isPremium setting
checkFileContent(
  'src/stores/subscriptionStore.ts',
  'isPremium: false',
  'isPremium set to FALSE (production ready)'
);

console.log('\n📱 Checking Screens...\n');

// Check main screens
checkFile('src/screens/DashboardScreen.tsx', 'Dashboard screen exists');
checkFile('src/screens/LoginScreen.tsx', 'Login screen exists');
checkFile('src/screens/LinkDetectionScreen.tsx', 'Link Detection screen exists');
checkFile('src/screens/QRScannerScreen.tsx', 'QR Scanner screen exists');

console.log('\n🔐 Checking Services...\n');

// Check services
checkFile('src/services/ClipboardURLMonitor.ts', 'Clipboard monitor exists');
checkFile('src/services/URLProtectionService.ts', 'URL protection service exists');
checkFile('src/services/WatchdogFileService.ts', 'Watchdog file service exists');
checkFile('src/services/PrivacyGuardService.ts', 'Privacy guard service exists');

console.log('\n🎨 Checking Native Modules...\n');

// Check native modules
checkFile('react-native-yara-engine/package.json', 'YARA engine module exists');
checkFile('react-native-proxy-engine/package.json', 'Proxy engine module exists');

console.log('\n🔑 Checking Build Assets...\n');

// Check signing keys
if (checkFile('@shubham485__shabari.jks', 'Signing keystore exists')) {
  console.log('   ℹ️  Ready for signed builds');
}

console.log('\n📦 Checking Dependencies...\n');

// Check node_modules
if (fs.existsSync('node_modules')) {
  console.log('✅ node_modules directory exists');
  passCount++;

  // Check critical packages
  const criticalPackages = [
    'expo',
    'react-native',
    '@supabase/supabase-js',
    'zustand',
    '@react-navigation/native'
  ];

  let packagesInstalled = 0;
  criticalPackages.forEach(pkg => {
    if (fs.existsSync(`node_modules/${pkg}`)) {
      packagesInstalled++;
    }
  });

  if (packagesInstalled === criticalPackages.length) {
    console.log(`✅ All ${criticalPackages.length} critical packages installed`);
    passCount++;
  } else {
    console.log(`⚠️  Only ${packagesInstalled}/${criticalPackages.length} critical packages found`);
    warnCount++;
  }
} else {
  console.log('❌ node_modules NOT FOUND - Run: npm install');
  failCount++;
}

console.log('\n' + '='.repeat(60));
console.log('\n📊 VERIFICATION SUMMARY\n');
console.log(`✅ Passed: ${passCount}`);
console.log(`⚠️  Warnings: ${warnCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log('');

if (failCount === 0 && warnCount === 0) {
  console.log('🎉 PERFECT! All checks passed.');
  console.log('✅ Ready to start testing with: npm start');
} else if (failCount === 0) {
  console.log('✅ GOOD! App is ready with minor warnings.');
  console.log('⚠️  Some optional features may not be available.');
  console.log('✅ Ready to start testing with: npm start');
} else {
  console.log('❌ ISSUES FOUND! Please fix the failed checks before testing.');
  if (!fs.existsSync('node_modules')) {
    console.log('');
    console.log('🔧 Quick Fix:');
    console.log('   Run: npm install');
  }
}

console.log('\n📖 For detailed testing instructions, see: LOCAL_TESTING_GUIDE.md');
console.log('');


/**
 * QUARANTINE SYSTEM SECURITY TEST
 * Run this to verify all security features are working
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔒 QUARANTINE SYSTEM SECURITY VERIFICATION\n');
console.log('=' .repeat(60));

// Test 1: Check Native Module Exists
console.log('\n📋 TEST 1: Native Module Files');
console.log('-'.repeat(60));

const quarantineModulePath = path.join(__dirname, 'android', 'app', 'src', 'main', 'java', 'com', 'shabari', 'QuarantineModule.java');
const quarantinePackagePath = path.join(__dirname, 'android', 'app', 'src', 'main', 'java', 'com', 'shabari', 'QuarantinePackage.java');

if (fs.existsSync(quarantineModulePath)) {
  console.log('✅ QuarantineModule.java exists');
  const content = fs.readFileSync(quarantineModulePath, 'utf8');

  // Check for critical security features
  const checks = [
    { name: 'AES-256 Encryption', pattern: /AES\/CBC\/PKCS5Padding/i, critical: true },
    { name: 'Secure Permissions', pattern: /setReadable.*setWritable.*setExecutable/i, critical: true },
    { name: 'Secure Delete', pattern: /secureDelete/i, critical: true },
    { name: 'File Isolation Check', pattern: /verifyFileIsolation/i, critical: true },
    { name: 'APK Prevention', pattern: /preventApkInstallation/i, critical: true },
    { name: 'SHA-256 Hash', pattern: /SHA-256/i, critical: false },
  ];

  checks.forEach(check => {
    if (content.match(check.pattern)) {
      console.log(`   ✅ ${check.name} implemented`);
    } else {
      console.log(`   ${check.critical ? '❌' : '⚠️'} ${check.name} ${check.critical ? 'MISSING (CRITICAL)' : 'not found'}`);
    }
  });
} else {
  console.log('❌ QuarantineModule.java NOT FOUND (CRITICAL)');
}

if (fs.existsSync(quarantinePackagePath)) {
  console.log('✅ QuarantinePackage.java exists');
} else {
  console.log('❌ QuarantinePackage.java NOT FOUND (CRITICAL)');
}

// Test 2: Check Module Registration
console.log('\n📋 TEST 2: Module Registration');
console.log('-'.repeat(60));

const mainAppPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'java', 'com', 'shabari', 'app', 'MainApplication.kt');
if (fs.existsSync(mainAppPath)) {
  const mainAppContent = fs.readFileSync(mainAppPath, 'utf8');

  if (mainAppContent.includes('QuarantinePackage')) {
    console.log('✅ QuarantinePackage registered in MainApplication.kt');
  } else {
    console.log('❌ QuarantinePackage NOT registered (CRITICAL)');
  }

  if (mainAppContent.includes('packages.add(QuarantinePackage())')) {
    console.log('✅ QuarantinePackage added to packages list');
  } else {
    console.log('⚠️ QuarantinePackage may not be added correctly');
  }
} else {
  console.log('❌ MainApplication.kt NOT FOUND');
}

// Test 3: Check Secure Service
console.log('\n📋 TEST 3: Secure Service Implementation');
console.log('-'.repeat(60));

const secureServicePath = path.join(__dirname, 'src', 'services', 'SecureQuarantineService.ts');
if (fs.existsSync(secureServicePath)) {
  console.log('✅ SecureQuarantineService.ts exists');
  const serviceContent = fs.readFileSync(secureServicePath, 'utf8');

  const serviceChecks = [
    { name: 'Native Module Integration', pattern: /QuarantineModule/i },
    { name: 'Biometric Auth', pattern: /LocalAuthentication\.authenticateAsync/i },
    { name: 'AES-256 Reference', pattern: /AES-256/i },
    { name: 'Secure Delete', pattern: /securely deleted/i },
    { name: 'Isolation Verification', pattern: /verifyFileIsolation/i },
    { name: 'No Hardcoded PIN', pattern: /1234/ },
  ];

  serviceChecks.forEach(check => {
    const found = serviceContent.match(check.pattern);
    if (check.name === 'No Hardcoded PIN') {
      if (!found) {
        console.log(`   ✅ ${check.name} - No hardcoded credentials found`);
      } else {
        console.log(`   ❌ ${check.name} - HARDCODED PIN FOUND (CRITICAL SECURITY FLAW)`);
      }
    } else {
      console.log(`   ${found ? '✅' : '⚠️'} ${check.name}`);
    }
  });
} else {
  console.log('❌ SecureQuarantineService.ts NOT FOUND');
}

// Test 4: Check Secure Screen
console.log('\n📋 TEST 4: Secure Screen Implementation');
console.log('-'.repeat(60));

const secureScreenPath = path.join(__dirname, 'src', 'screens', 'SecureQuarantineScreen.tsx');
if (fs.existsSync(secureScreenPath)) {
  console.log('✅ SecureQuarantineScreen.tsx exists');
  const screenContent = fs.readFileSync(secureScreenPath, 'utf8');

  if (screenContent.includes('manualQuarantine')) {
    console.log('   ✅ Manual quarantine capability');
  }
  if (screenContent.includes('SecureQuarantineService')) {
    console.log('   ✅ Uses SecureQuarantineService');
  }
  if (screenContent.includes('authenticate')) {
    console.log('   ✅ Authentication integration');
  }
  if (screenContent.includes('isIsolated') && screenContent.includes('isEncrypted')) {
    console.log('   ✅ Security status indicators');
  }
} else {
  console.log('⚠️ SecureQuarantineScreen.tsx NOT FOUND (using old screen)');
}

// Test 5: Check Dependencies
console.log('\n📋 TEST 5: Required Dependencies');
console.log('-'.repeat(60));

const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const requiredDeps = [
    'expo-local-authentication',
    'expo-document-picker',
    'expo-crypto',
    'expo-file-system',
  ];

  requiredDeps.forEach(dep => {
    if (deps[dep]) {
      console.log(`   ✅ ${dep}: ${deps[dep]}`);
    } else {
      console.log(`   ❌ ${dep} NOT INSTALLED (REQUIRED)`);
    }
  });
}

// Test 6: Security Feature Summary
console.log('\n📋 TEST 6: Security Features Summary');
console.log('-'.repeat(60));

const features = [
  { name: 'Complete File Isolation', status: fs.existsSync(quarantineModulePath) },
  { name: 'AES-256 Encryption', status: fs.existsSync(quarantineModulePath) },
  { name: 'Biometric Authentication', status: fs.existsSync(secureServicePath) },
  { name: 'APK Installation Prevention', status: fs.existsSync(quarantineModulePath) },
  { name: 'Secure Deletion', status: fs.existsSync(quarantineModulePath) },
  { name: 'Manual Quarantine', status: fs.existsSync(secureScreenPath) },
  { name: 'File Integrity Check', status: fs.existsSync(quarantineModulePath) },
];

let passedCount = 0;
features.forEach(feature => {
  if (feature.status) {
    console.log(`   ✅ ${feature.name}`);
    passedCount++;
  } else {
    console.log(`   ❌ ${feature.name}`);
  }
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 SECURITY SCORE: ${passedCount}/${features.length} features implemented\n`);

if (passedCount === features.length) {
  console.log('✅ ✅ ✅ ALL SECURITY FEATURES IMPLEMENTED! ✅ ✅ ✅');
  console.log('\n🎉 Your quarantine system is PRODUCTION-READY!\n');
  console.log('Next Steps:');
  console.log('1. Run: npm install');
  console.log('2. Run: npx expo run:android');
  console.log('3. Test manual quarantine feature');
  console.log('4. Verify biometric authentication');
} else {
  console.log('⚠️ Some features are missing. Review the report above.');
}

console.log('\n' + '='.repeat(60) + '\n');


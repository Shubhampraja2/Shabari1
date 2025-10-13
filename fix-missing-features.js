#!/usr/bin/env node

/**
 * Fix Missing Features in Production APK
 *
 * This script analyzes and fixes common issues that cause features
 * to disappear in production builds.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Analyzing Missing Features Issue...\n');

// Check for common issues
const issues = [];

// 1. Check DashboardScreen for conditional rendering
console.log('1️⃣ Checking DashboardScreen...');
const dashboardPath = path.join(__dirname, 'src', 'screens', 'DashboardScreen.tsx');
if (fs.existsSync(dashboardPath)) {
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  // Check if all core features are present
  const coreFeatures = [
    'URL Scanner',
    'File Scanner',
    'QR Scanner',
    'SMS Analysis',
    'Deep Scan',
    'Secure Browser',
    'Quarantine',
    'Call Log',
    'SMS Scanner'
  ];

  coreFeatures.forEach(feature => {
    if (dashboardContent.includes(feature)) {
      console.log(`   ✅ ${feature} - Found in code`);
    } else {
      console.log(`   ❌ ${feature} - MISSING from code`);
      issues.push(`Missing feature: ${feature}`);
    }
  });
}

// 2. Check for __DEV__ conditionals that might hide features
console.log('\n2️⃣ Checking for development-only code...');
const filesToCheck = [
  'src/screens/DashboardScreen.tsx',
  'src/screens/DeepScanScreen.tsx',
  'src/components/ActionGrid.tsx'
];

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const devMatches = content.match(/__DEV__/g);
    if (devMatches) {
      console.log(`   ⚠️ ${file}: Found ${devMatches.length} __DEV__ check(s)`);
    } else {
      console.log(`   ✅ ${file}: No __DEV__ checks`);
    }
  }
});

// 3. Check navigation routes
console.log('\n3️⃣ Checking navigation routes...');
const navPath = path.join(__dirname, 'src', 'navigation', 'AppNavigator.tsx');
if (fs.existsSync(navPath)) {
  const navContent = fs.readFileSync(navPath, 'utf8');

  const requiredScreens = [
    'Dashboard',
    'SecureBrowser',
    'Quarantine',
    'CallLog',
    'SMSScanner',
    'LiveQRScanner',
    'DeepScan',
    'MessageAnalysis'
  ];

  requiredScreens.forEach(screen => {
    if (navContent.includes(`name="${screen}"`)) {
      console.log(`   ✅ ${screen} - Route registered`);
    } else {
      console.log(`   ❌ ${screen} - Route MISSING`);
      issues.push(`Missing route: ${screen}`);
    }
  });
}

// 4. Check app.config.js for permissions
console.log('\n4️⃣ Checking permissions...');
const configPath = path.join(__dirname, 'app.config.js');
if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');

  const requiredPermissions = [
    'CAMERA',
    'INTERNET',
    'ACCESS_NETWORK_STATE'
  ];

  requiredPermissions.forEach(perm => {
    if (configContent.includes(perm)) {
      console.log(`   ✅ ${perm} - Declared`);
    } else {
      console.log(`   ⚠️ ${perm} - Not found`);
    }
  });
}

// Summary
console.log('\n' + '='.repeat(50));
if (issues.length === 0) {
  console.log('✅ All features appear to be properly configured!\n');
  console.log('📋 Possible reasons for missing features in APK:');
  console.log('   1. ProGuard removing code (check proguard-rules.pro)');
  console.log('   2. Build optimization removing "unused" code');
  console.log('   3. Premium features hidden due to subscription status');
  console.log('   4. Native modules not properly linked in production');
  console.log('\n💡 Recommended actions:');
  console.log('   1. Check if features are locked behind premium status');
  console.log('   2. Test with a clean build: eas build --clear-cache');
  console.log('   3. Verify ProGuard rules aren\'t too aggressive');
  console.log('   4. Check runtime logs from production APK');
} else {
  console.log('❌ Found ' + issues.length + ' potential issue(s):\n');
  issues.forEach((issue, i) => {
    console.log(`   ${i + 1}. ${issue}`);
  });
  console.log('\n⚠️ Please provide screenshots or describe which features');
  console.log('   are missing so I can create targeted fixes.');
}
console.log('='.repeat(50) + '\n');

// Create a test checklist
const checklistContent = `# APK Feature Checklist

## Dashboard Screen - Core Features
- [ ] URL Scanner button visible
- [ ] File Scanner button visible
- [ ] QR Scanner button visible
- [ ] SMS Analysis button visible

## Dashboard Screen - Security Tools
- [ ] Deep Scan button visible
- [ ] Secure Browser button visible
- [ ] Quarantine button visible
- [ ] Call Log button visible
- [ ] SMS Scanner button visible

## Dashboard Screen - Premium Section
- [ ] VPN Control visible (may be locked)
- [ ] Premium features section visible
- [ ] "Upgrade to Premium" button visible (if not premium)

## Feature Functionality
- [ ] Clicking URL Scanner opens modal
- [ ] Clicking File Scanner opens file picker
- [ ] Clicking QR Scanner opens camera
- [ ] Clicking SMS Analysis navigates to screen
- [ ] Clicking Deep Scan navigates to screen
- [ ] Clicking Secure Browser navigates to screen
- [ ] Clicking Quarantine navigates to screen
- [ ] Clicking Call Log navigates to screen
- [ ] Clicking SMS Scanner navigates to screen

## Notes:
Please mark which items are NOT working and provide details.
`;

fs.writeFileSync(
  path.join(__dirname, 'APK_FEATURE_CHECKLIST.md'),
  checklistContent
);

console.log('✅ Created APK_FEATURE_CHECKLIST.md');
console.log('   Please fill out this checklist with your APK test results.\n');


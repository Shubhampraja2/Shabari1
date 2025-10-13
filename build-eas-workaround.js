#!/usr/bin/env node

/**
 * Shabari EAS Build Workaround
 * This script bypasses the fingerprint computation issue
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting EAS Build with Fingerprint Workaround\n');

// Step 1: Set environment variable
process.env.EAS_SKIP_AUTO_FINGERPRINT = '1';
process.env.EXPO_NO_CAPABILITY_SYNC = '1';

// Step 2: Check if @expo/fingerprint needs to be temporarily removed
const fingerprintPath = path.join(__dirname, 'node_modules', '@expo', 'fingerprint');
const fingerprintBackup = path.join(__dirname, 'node_modules', '@expo', 'fingerprint.backup');

console.log('🔧 Step 1: Temporarily disabling fingerprint computation...');
try {
  if (fs.existsSync(fingerprintPath) && !fs.existsSync(fingerprintBackup)) {
    fs.renameSync(fingerprintPath, fingerprintBackup);
    console.log('✅ Fingerprint module disabled');
  }
} catch (error) {
  console.log('⚠️ Could not disable fingerprint module:', error.message);
}

// Step 3: Run EAS build
console.log('\n🚀 Step 2: Starting EAS Build...\n');
try {
  execSync('eas build --platform android --profile production --non-interactive', {
    stdio: 'inherit',
    env: {
      ...process.env,
      EAS_SKIP_AUTO_FINGERPRINT: '1',
      EXPO_NO_CAPABILITY_SYNC: '1'
    }
  });

  console.log('\n✅ Build started successfully!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);

  // Restore fingerprint module
  try {
    if (fs.existsSync(fingerprintBackup)) {
      fs.renameSync(fingerprintBackup, fingerprintPath);
      console.log('🔄 Fingerprint module restored');
    }
  } catch (restoreError) {
    console.log('⚠️ Could not restore fingerprint module');
  }

  process.exit(1);
}

// Step 4: Restore fingerprint module
console.log('\n🔄 Step 3: Restoring fingerprint module...');
try {
  if (fs.existsSync(fingerprintBackup)) {
    fs.renameSync(fingerprintBackup, fingerprintPath);
    console.log('✅ Fingerprint module restored');
  }
} catch (error) {
  console.log('⚠️ Could not restore fingerprint module');
}

console.log('\n✅ Build process completed!');
console.log('📱 Check build status: eas build:list');


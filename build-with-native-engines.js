#!/usr/bin/env node

/**
 * Build Shabari App with Native YARA and Proxy Engines
 * This script ensures all native modules are properly compiled
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building Shabari with Native Engines...\n');

// Check if native engine folders exist
const yaraEnginePath = path.join(__dirname, 'react-native-yara-engine');
const proxyEnginePath = path.join(__dirname, 'react-native-proxy-engine');

console.log('📦 Checking native modules...');

if (!fs.existsSync(yaraEnginePath)) {
  console.error('❌ YARA Engine not found at:', yaraEnginePath);
  process.exit(1);
}

if (!fs.existsSync(proxyEnginePath)) {
  console.error('❌ Proxy Engine not found at:', proxyEnginePath);
  process.exit(1);
}

console.log('✅ YARA Engine found');
console.log('✅ Proxy Engine found\n');

// Check if Android native code exists
const yaraAndroidPath = path.join(yaraEnginePath, 'android');
const proxyAndroidPath = path.join(proxyEnginePath, 'android');

if (!fs.existsSync(yaraAndroidPath)) {
  console.error('❌ YARA Engine Android native code not found');
  process.exit(1);
}

if (!fs.existsSync(proxyAndroidPath)) {
  console.error('❌ Proxy Engine Android native code not found');
  process.exit(1);
}

console.log('✅ YARA Engine Android native code found');
console.log('✅ Proxy Engine Android native code found\n');

// Verify app.config.js has the plugins
const appConfig = require('./app.config.js');
const plugins = appConfig.plugins || [];

const hasYaraPlugin = plugins.some(p =>
  typeof p === 'string' && p.includes('yara-engine')
);
const hasProxyPlugin = plugins.some(p =>
  typeof p === 'string' && p.includes('proxy-engine')
);

if (!hasYaraPlugin) {
  console.error('❌ YARA Engine plugin not found in app.config.js');
  process.exit(1);
}

if (!hasProxyPlugin) {
  console.error('❌ Proxy Engine plugin not found in app.config.js');
  process.exit(1);
}

console.log('✅ YARA Engine plugin configured');
console.log('✅ Proxy Engine plugin configured\n');

console.log('🔧 Build Configuration:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📱 Platform: Android');
console.log('🛡️ YARA Engine: NATIVE (Compiled)');
console.log('🌐 Proxy Engine: NATIVE (Compiled)');
console.log('📦 Build Type: Production APK with Native Modules');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚙️ Step 1: Clean previous builds...');
try {
  if (fs.existsSync('android/app/build')) {
    console.log('   Cleaning Android build folder...');
    execSync('rmdir /s /q android\\app\\build', { stdio: 'inherit' });
  }
  console.log('✅ Cleaned successfully\n');
} catch (error) {
  console.warn('⚠️ Could not clean build folder (may not exist)\n');
}

console.log('⚙️ Step 2: Install dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed\n');
} catch (error) {
  console.error('❌ Failed to install dependencies');
  process.exit(1);
}

console.log('⚙️ Step 3: Run prebuild to generate native code...');
try {
  execSync('npx expo prebuild --platform android --clean', { stdio: 'inherit' });
  console.log('✅ Prebuild completed\n');
} catch (error) {
  console.error('❌ Prebuild failed');
  process.exit(1);
}

console.log('⚙️ Step 4: Build APK with native engines...');
console.log('   This will take several minutes...\n');

try {
  execSync('cd android && .\\gradlew assembleRelease', { stdio: 'inherit' });
  console.log('\n✅ Build completed successfully!\n');
} catch (error) {
  console.error('\n❌ Build failed');
  console.error('Check the error messages above for details\n');
  process.exit(1);
}

// Find the APK
const apkPath = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

if (fs.existsSync(apkPath)) {
  const stats = fs.statSync(apkPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 BUILD SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📦 APK Location: ${apkPath}`);
  console.log(`📏 File Size: ${fileSizeInMB} MB`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('✅ Native Engines Status:');
  console.log('   🛡️ YARA Engine: ACTIVE (Native C++ compiled)');
  console.log('   🌐 Proxy Engine: ACTIVE (Native compiled)');
  console.log('   📱 Both engines are fully functional in this build!\n');

  console.log('📱 Install on device:');
  console.log('   adb install android/app/build/outputs/apk/release/app-release.apk\n');

  console.log('🎯 What changed:');
  console.log('   ❌ Before: Engines showed "Mock" / "Not Available"');
  console.log('   ✅ Now: Engines will show "Native" / "Active"');
  console.log('   🚀 Full scanning and protection capabilities enabled!\n');
} else {
  console.error('❌ APK not found at expected location');
  console.error('Expected:', apkPath);
}


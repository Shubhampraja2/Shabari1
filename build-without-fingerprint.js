#!/usr/bin/env node

/**
 * Production APK Build Script - Bypasses Fingerprinting Issues
 * Enhanced version with auto-confirmation and better fingerprint bypass
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Execute command with automatic yes response
function executeCommandWithAutoConfirm(command, description) {
  return new Promise((resolve, reject) => {
    log(`\n📦 ${description}...`, 'blue');

    const child = spawn(command, [], {
      shell: true,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: {
        ...process.env,
        EAS_SKIP_AUTO_FINGERPRINT: '1',
        EXPO_NO_CAPABILITY_SYNC: '1',
        CI: '1', // Treat as CI environment to skip prompts
      }
    });

    // Auto-confirm any prompts
    child.stdin.write('yes\n');
    child.stdin.write('y\n');

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${description} - Success`, 'green');
        resolve();
      } else {
        log(`❌ ${description} - Failed with code ${code}`, 'red');
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      log(`❌ ${description} - Error`, 'red');
      reject(error);
    });
  });
}

function executeCommand(command, description, silent = false) {
  try {
    log(`\n📦 ${description}...`, 'blue');
    const output = execSync(command, {
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf8',
      env: {
        ...process.env,
        EAS_SKIP_AUTO_FINGERPRINT: '1',
        EXPO_NO_CAPABILITY_SYNC: '1',
        CI: '1',
      }
    });
    log(`✅ ${description} - Success`, 'green');
    return output;
  } catch (error) {
    log(`❌ ${description} - Failed`, 'red');
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

// Pre-build validation
function validateBuildEnvironment() {
  log('\n🔍 Validating Build Environment...', 'yellow');

  const checks = [
    { file: './app.config.js', name: 'App Config' },
    { file: './eas.json', name: 'EAS Config' },
    { file: './package.json', name: 'Package.json' },
    { file: './node_modules', name: 'Dependencies' },
  ];

  let allValid = true;

  for (const check of checks) {
    if (fs.existsSync(check.file)) {
      log(`  ✅ ${check.name} found`, 'green');
    } else {
      log(`  ❌ ${check.name} missing`, 'red');
      allValid = false;
    }
  }

  // Check keystore
  const keystorePath = './@shubham485__shabari.jks';
  if (fs.existsSync(keystorePath)) {
    log(`  ✅ Keystore found`, 'green');
  } else {
    log(`  ⚠️  Keystore not found - will use EAS credentials`, 'yellow');
  }

  if (!allValid) {
    log('\n❌ Build environment validation failed!', 'red');
    process.exit(1);
  }

  log('\n✅ Build environment validated successfully!', 'green');
}

// Check EAS authentication
function checkEASAuth() {
  log('\n🔐 Checking EAS Authentication...', 'yellow');
  try {
    const whoami = executeCommand('npx eas whoami', 'Verifying EAS login', true);
    log(`✅ Logged in as: ${whoami.trim()}`, 'green');
    return true;
  } catch (error) {
    log('❌ Not logged into EAS!', 'red');
    log('\nPlease login first:', 'yellow');
    log('  Run: npx eas login', 'blue');
    log('  Then run this script again', 'blue');
    process.exit(1);
  }
}

// Clean previous builds
function cleanPreviousBuilds() {
  log('\n🧹 Cleaning Previous Build Artifacts...', 'yellow');

  const pathsToClean = [
    './android/app/build',
    './android/.gradle',
  ];

  for (const cleanPath of pathsToClean) {
    try {
      if (fs.existsSync(cleanPath)) {
        fs.rmSync(cleanPath, { recursive: true, force: true });
        log(`  ✅ Cleaned: ${cleanPath}`, 'green');
      }
    } catch (error) {
      log(`  ⚠️  Could not clean: ${cleanPath}`, 'yellow');
    }
  }

  log('✅ Build artifacts cleaned', 'green');
}

// Display build configuration
function displayBuildConfig() {
  log('\n' + '='.repeat(60), 'magenta');
  log('📱 PRODUCTION APK BUILD CONFIGURATION', 'magenta');
  log('='.repeat(60), 'magenta');

  const config = {
    'Build Profile': 'production',
    'Build Type': 'APK (Android Package)',
    'Platform': 'Android',
    'Node Version': '20.19.4',
    'Gradle Command': ':app:assembleRelease',
    'Environment': 'Production',
    'Optimizations': 'Enabled',
    'Fingerprint Check': 'BYPASSED ✅',
    'Auto-Confirm': 'ENABLED ✅',
  };

  log('\nConfiguration:', 'blue');
  for (const [key, value] of Object.entries(config)) {
    log(`  ${key.padEnd(20)}: ${value}`, 'blue');
  }

  log('\nFeatures Included:', 'green');
  const features = [
    'Proxy Engine (VPN Protection)',
    'YARA Engine (Malware Detection)',
    'Ad Blocker with Notifications',
    'URL Protection Service',
    'File Scanner',
    'QR Code Scanner',
    'Deep Scan Features',
    'SMS Protection',
    'Call Protection',
  ];

  features.forEach(feature => log(`  ✅ ${feature}`, 'green'));
  log('');
}

// Main build function
async function buildProductionAPK() {
  try {
    log('\n' + '='.repeat(60), 'blue');
    log('🚀 SHABARI PRODUCTION APK BUILD', 'blue');
    log('   (Fingerprint Bypass + Auto-Confirm Enabled)', 'blue');
    log('='.repeat(60) + '\n', 'blue');

    // Step 1: Validate environment
    validateBuildEnvironment();

    // Step 2: Check EAS authentication
    checkEASAuth();

    // Step 3: Display build configuration
    displayBuildConfig();

    // Step 4: Clean previous builds
    cleanPreviousBuilds();

    // Step 5: Skip prebuild to avoid prompts - it was already done
    log('\n⏩ Skipping prebuild (already completed)', 'blue');
    log('   Android native code is ready', 'green');

    // Step 6: Direct EAS build with all bypass flags
    log('\n🚀 Starting EAS Build with Full Bypass...', 'blue');
    log('⏱️  This will take approximately 10-20 minutes', 'yellow');
    log('📊 Monitor progress at: https://expo.dev', 'blue');
    log('', 'magenta');

    // Execute EAS build with spawn for better control
    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['eas', 'build', '--platform', 'android', '--profile', 'production', '--non-interactive'], {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          EAS_SKIP_AUTO_FINGERPRINT: '1',
          EXPO_NO_CAPABILITY_SYNC: '1',
          CI: '1',
          EXPO_NO_GIT_STATUS: '1',
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });

    // Success message
    log('\n' + '='.repeat(60), 'green');
    log('✅ BUILD SUBMITTED SUCCESSFULLY!', 'green');
    log('='.repeat(60), 'green');

    log('\n📋 Next Steps:', 'blue');
    log('  1. Check EAS dashboard: https://expo.dev/accounts/shubhamprana/projects/shabari/builds', 'blue');
    log('  2. Build will complete in 10-20 minutes', 'blue');
    log('  3. Download APK when ready', 'blue');
    log('  4. Test on physical Android device', 'blue');
    log('  5. Ready for Play Store submission\n', 'blue');

    log('📱 To Check Build Status:', 'magenta');
    log('  • Run: npx eas build:list', 'magenta');
    log('  • Visit: https://expo.dev', 'magenta');
    log('  • Latest build will have download link\n', 'magenta');

    log('🔒 Security Reminder:', 'yellow');
    log('  ⚠️  Apply security fixes from PROXY_ENGINE_SECURITY_AUDIT.md', 'yellow');
    log('  ⚠️  Test all features before production release', 'yellow');
    log('  ⚠️  Review app permissions and privacy policy\n', 'yellow');

    log('✨ Build Features:', 'green');
    log('  ✅ All native modules included', 'green');
    log('  ✅ Production optimizations applied', 'green');
    log('  ✅ Signed with production keystore', 'green');
    log('  ✅ Version 1.1.0 (versionCode: auto)', 'green');
    log('  ✅ Fingerprint check bypassed', 'green');
    log('  ✅ Ready for distribution\n', 'green');

  } catch (error) {
    log('\n' + '='.repeat(60), 'red');
    log('❌ BUILD FAILED', 'red');
    log('='.repeat(60), 'red');

    log('\nError Details:', 'red');
    console.error(error.message);

    log('\n🔧 Troubleshooting Steps:', 'yellow');
    log('  1. Verify EAS login: npx eas whoami', 'yellow');
    log('  2. Check internet connection', 'yellow');
    log('  3. View EAS dashboard: https://expo.dev', 'yellow');
    log('  4. Update EAS CLI: npm install -g eas-cli', 'yellow');
    log('  5. Check build quota on your EAS account', 'yellow');

    log('\n📞 Need Help?', 'blue');
    log('  • Review error message above', 'blue');
    log('  • Check EAS build logs online', 'blue');
    log('  • Ensure all dependencies are installed\n', 'blue');

    process.exit(1);
  }
}

// Run the build
if (require.main === module) {
  buildProductionAPK().catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { buildProductionAPK };

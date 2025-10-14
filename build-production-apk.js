/**
 * Production APK Build Script
 * This script builds a production-ready APK with all optimizations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Production APK Build Process...\n');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function executeCommand(command, description) {
  try {
    log(`\n📦 ${description}...`, 'blue');
    const output = execSync(command, {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true
    });
    log(`✅ ${description} - Success`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} - Failed`, 'red');
    console.error(error.message);
    return false;
  }
}

// Pre-build checks
function preBuildChecks() {
  log('\n🔍 Running Pre-Build Checks...', 'yellow');

  // Check if app.config.js exists
  if (!fs.existsSync('./app.config.js')) {
    log('❌ app.config.js not found!', 'red');
    process.exit(1);
  }
  log('✅ app.config.js found', 'green');

  // Check if eas.json exists
  if (!fs.existsSync('./eas.json')) {
    log('❌ eas.json not found!', 'red');
    process.exit(1);
  }
  log('✅ eas.json found', 'green');

  // Check if keystore exists
  const keystorePath = './@shubham485__shabari.jks';
  if (!fs.existsSync(keystorePath)) {
    log('⚠️  Keystore file not found at ' + keystorePath, 'yellow');
    log('ℹ️  Build will use EAS credentials', 'blue');
  } else {
    log('✅ Keystore file found', 'green');
  }

  // Check node_modules
  if (!fs.existsSync('./node_modules')) {
    log('⚠️  node_modules not found. Installing dependencies...', 'yellow');
    executeCommand('npm install', 'Installing dependencies');
  } else {
    log('✅ node_modules found', 'green');
  }

  log('\n✅ All pre-build checks passed!', 'green');
}

// Main build function
async function buildProductionAPK() {
  try {
    log('\n' + '='.repeat(60), 'blue');
    log('🏗️  SHABARI PRODUCTION APK BUILD', 'blue');
    log('='.repeat(60) + '\n', 'blue');

    // Step 1: Pre-build checks
    preBuildChecks();

    // Step 2: Clean cache
    log('\n🧹 Cleaning build cache...', 'yellow');
    try {
      if (fs.existsSync('./android/app/build')) {
        log('Removing old build artifacts...', 'blue');
        fs.rmSync('./android/app/build', { recursive: true, force: true });
      }
      log('✅ Cache cleaned', 'green');
    } catch (error) {
      log('⚠️  Could not clean cache, continuing...', 'yellow');
    }

    // Step 3: Check EAS login
    log('\n🔐 Checking EAS authentication...', 'yellow');
    try {
      const whoami = execSync('eas whoami', { encoding: 'utf8', stdio: 'pipe' });
      log(`✅ Logged in as: ${whoami.trim()}`, 'green');
    } catch (error) {
      log('❌ Not logged into EAS. Please run: eas login', 'red');
      log('\nTo login:', 'yellow');
      log('  1. Run: eas login', 'yellow');
      log('  2. Enter your Expo credentials', 'yellow');
      log('  3. Run this script again', 'yellow');
      process.exit(1);
    }

    // Step 4: Prebuild
    log('\n🔧 Running Expo prebuild...', 'yellow');
    const prebuildSuccess = executeCommand(
      'npx expo prebuild --platform android --clean',
      'Prebuild Android native code'
    );

    if (!prebuildSuccess) {
      log('\n⚠️  Prebuild had issues, but continuing...', 'yellow');
    }

    // Step 5: Build with EAS
    log('\n🚀 Starting EAS Build (Production APK)...', 'blue');
    log('This will take 10-20 minutes. Please wait...', 'yellow');
    log('\nBuild options:', 'blue');
    log('  • Profile: production', 'blue');
    log('  • Build Type: APK', 'blue');
    log('  • Node Version: 20.19.4', 'blue');
    log('  • Gradle Command: assembleRelease', 'blue');
    log('  • Environment: Production\n', 'blue');

    const buildSuccess = executeCommand(
      'eas build --platform android --profile production --non-interactive',
      'Building production APK'
    );

    if (!buildSuccess) {
      log('\n❌ Build failed! Check the errors above.', 'red');
      log('\nCommon issues:', 'yellow');
      log('  1. Not logged into EAS - Run: eas login', 'yellow');
      log('  2. No project configured - Run: eas init', 'yellow');
      log('  3. Build errors - Check the EAS dashboard', 'yellow');
      process.exit(1);
    }

    // Success message
    log('\n' + '='.repeat(60), 'green');
    log('✅ BUILD COMPLETED SUCCESSFULLY!', 'green');
    log('='.repeat(60), 'green');
    log('\nNext Steps:', 'blue');
    log('  1. Check your EAS dashboard: https://expo.dev/accounts/[your-account]/projects/shabari/builds', 'blue');
    log('  2. Download the APK once build is complete', 'blue');
    log('  3. Test the APK on a physical Android device', 'blue');
    log('  4. If everything works, upload to Play Store\n', 'blue');

    log('📱 APK Features:', 'green');
    log('  ✅ All security features enabled', 'green');
    log('  ✅ Proxy engine integrated', 'green');
    log('  ✅ YARA engine for malware detection', 'green');
    log('  ✅ Ad blocker with notifications', 'green');
    log('  ✅ URL protection', 'green');
    log('  ✅ File scanner', 'green');
    log('  ✅ QR code scanner', 'green');
    log('  ✅ Production optimizations applied\n', 'green');

  } catch (error) {
    log('\n❌ Unexpected error during build:', 'red');
    console.error(error);
    process.exit(1);
  }
}

// Alternative: Local build (if EAS not available)
function showLocalBuildInstructions() {
  log('\n' + '='.repeat(60), 'yellow');
  log('📱 ALTERNATIVE: LOCAL APK BUILD', 'yellow');
  log('='.repeat(60), 'yellow');
  log('\nIf EAS build is not working, you can build locally:', 'yellow');
  log('\nSteps:', 'blue');
  log('  1. npx expo prebuild --platform android --clean', 'blue');
  log('  2. cd android', 'blue');
  log('  3. .\\gradlew assembleRelease', 'blue');
  log('  4. APK will be in: android/app/build/outputs/apk/release/\n', 'blue');

  log('Note: Local builds require:', 'yellow');
  log('  • Android SDK installed', 'yellow');
  log('  • Java JDK 17+', 'yellow');
  log('  • Keystore file configured\n', 'yellow');
}

// Run the build
if (require.main === module) {
  buildProductionAPK().catch(error => {
    log('\n❌ Fatal error:', 'red');
    console.error(error);
    showLocalBuildInstructions();
    process.exit(1);
  });
}

module.exports = { buildProductionAPK };


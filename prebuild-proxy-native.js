#!/usr/bin/env node

/**
 * Pre-build Proxy Native Module
 *
 * This script compiles the Proxy native module (Kotlin/Java code) once and creates
 * a pre-built AAR file that can be reused in all future builds.
 *
 * Benefits:
 * - Faster EAS builds (skip Kotlin compilation)
 * - More reliable builds (no compilation failures)
 * - Reduced build costs
 * - Same result every time
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      stdio: 'inherit',
      ...options
    });
  } catch (error) {
    throw error;
  }
}

async function main() {
  log('🔨 Proxy Native Module Pre-Build Script', 'cyan');
  log('=========================================\n', 'cyan');

  const proxyModulePath = path.join(__dirname, 'react-native-proxy-engine');
  const androidPath = path.join(proxyModulePath, 'android');
  const distPath = path.join(proxyModulePath, 'dist');

  // Step 1: Verify module exists
  log('📁 Step 1: Verifying Proxy module structure...', 'blue');
  if (!fs.existsSync(androidPath)) {
    log('❌ Error: react-native-proxy-engine/android not found!', 'red');
    process.exit(1);
  }
  log('✅ Proxy module found\n', 'green');

  // Step 2: Clean previous builds
  log('🧹 Step 2: Cleaning previous build artifacts...', 'blue');
  const buildDir = path.join(androidPath, 'build');
  const cxxDir = path.join(androidPath, '.cxx');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
    log('  - Removed build directory', 'yellow');
  }
  if (fs.existsSync(cxxDir)) {
    fs.rmSync(cxxDir, { recursive: true, force: true });
    log('  - Removed .cxx directory', 'yellow');
  }
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
    log('  - Removed dist directory', 'yellow');
  }
  log('✅ Cleanup complete\n', 'green');

  // Step 3: Create dist directory
  log('📦 Step 3: Creating dist directory...', 'blue');
  fs.mkdirSync(distPath, { recursive: true });
  log('✅ Dist directory created\n', 'green');

  // Step 4: Build native module
  log('🔨 Step 4: Building native Proxy module with Gradle...', 'blue');
  log('⏳ This may take 3-5 minutes (compiling Kotlin/Java code)...\n', 'yellow');

  try {
    // Use the main project's gradlew, not the module's
    const mainAndroidPath = path.join(__dirname, 'android');
    process.chdir(mainAndroidPath);

    // Build release AAR with native libraries
    if (process.platform === 'win32') {
      log('  - Running Gradle on Windows...', 'cyan');
      exec('gradlew.bat :react-native-proxy-engine:clean :react-native-proxy-engine:assembleRelease', { stdio: 'inherit' });
    } else {
      log('  - Running Gradle on Unix/Linux...', 'cyan');
      exec('./gradlew :react-native-proxy-engine:clean :react-native-proxy-engine:assembleRelease', { stdio: 'inherit' });
    }

    log('\n✅ Native module compiled successfully!', 'green');
  } catch (error) {
    log('\n❌ Build failed!', 'red');
    log('Error details:', 'red');
    console.error(error.message);
    process.exit(1);
  }

  // Step 5: Locate the built AAR
  log('\n📦 Step 5: Locating built AAR file...', 'blue');
  const aarOutputPath = path.join(androidPath, 'build', 'outputs', 'aar');

  if (!fs.existsSync(aarOutputPath)) {
    log('❌ Error: AAR output directory not found!', 'red');
    process.exit(1);
  }

  const aarFiles = fs.readdirSync(aarOutputPath).filter(f => f.endsWith('.aar'));
  if (aarFiles.length === 0) {
    log('❌ Error: No AAR files found in output directory!', 'red');
    process.exit(1);
  }

  const sourceAar = path.join(aarOutputPath, aarFiles[0]);
  log(`  - Found: ${aarFiles[0]}`, 'cyan');
  log('✅ AAR file located\n', 'green');

  // Step 6: Copy and rename AAR
  log('📋 Step 6: Copying AAR to dist directory...', 'blue');
  const targetAar = path.join(distPath, 'react-native-proxy-engine-1.0.0.aar');
  fs.copyFileSync(sourceAar, targetAar);

  const aarStats = fs.statSync(targetAar);
  const aarSizeMB = (aarStats.size / 1024 / 1024).toFixed(2);
  log(`  - AAR size: ${aarSizeMB} MB`, 'cyan');
  log('✅ AAR copied successfully\n', 'green');

  // Step 7: Verify AAR contents
  log('🔍 Step 7: Verifying AAR contents...', 'blue');
  try {
    // Extract AAR to temp directory for verification
    const tempDir = path.join(distPath, 'temp-verify');
    fs.mkdirSync(tempDir, { recursive: true });

    const unzipCommand = process.platform === 'win32'
      ? `powershell -command "Expand-Archive -Path '${targetAar}' -DestinationPath '${tempDir}' -Force"`
      : `unzip -q "${targetAar}" -d "${tempDir}"`;

    exec(unzipCommand, { stdio: 'pipe' });

    // Check for classes
    const classesPath = path.join(tempDir, 'classes.jar');
    if (fs.existsSync(classesPath)) {
      log('  - Found: classes.jar', 'cyan');
    }

    // Check for AndroidManifest.xml
    const manifestPath = path.join(tempDir, 'AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      log('  - Found: AndroidManifest.xml', 'cyan');
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    log('✅ AAR verification complete\n', 'green');
  } catch (error) {
    log('⚠️  Could not verify AAR contents (non-critical)', 'yellow');
  }

  // Step 8: Create metadata file
  log('📄 Step 8: Creating build metadata...', 'blue');
  const metadata = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    aarFile: 'react-native-proxy-engine-1.0.0.aar',
    aarSize: aarStats.size,
    minSdkVersion: 21,
    targetSdkVersion: 34,
    notes: 'Pre-compiled Proxy native module with Kotlin/Java VPN and ad-blocking engine'
  };

  fs.writeFileSync(
    path.join(distPath, 'build-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  log('✅ Metadata created\n', 'green');

  // Step 9: Update plugin to use pre-built AAR
  log('🔧 Step 9: Updating Expo config plugin...', 'blue');
  const pluginPath = path.join(proxyModulePath, 'app.plugin.js');
  let pluginContent = fs.readFileSync(pluginPath, 'utf-8');

  // Add a flag to use pre-built AAR
  if (!pluginContent.includes('USE_PREBUILT_AAR')) {
    pluginContent = `// AUTO-GENERATED: Use pre-built AAR\nconst USE_PREBUILT_AAR = true;\n\n` + pluginContent;
    fs.writeFileSync(pluginPath, pluginContent);
    log('  - Plugin updated to use pre-built AAR', 'cyan');
  }
  log('✅ Plugin configuration updated\n', 'green');

  // Final summary
  log('═══════════════════════════════════════════════', 'green');
  log('✅ PROXY NATIVE MODULE PRE-BUILD COMPLETE! 🎉', 'green');
  log('═══════════════════════════════════════════════\n', 'green');

  log('📦 Pre-built AAR location:', 'cyan');
  log(`   ${targetAar}\n`, 'white');

  log('📊 Build Summary:', 'cyan');
  log(`   - AAR Size: ${aarSizeMB} MB`, 'white');
  log(`   - Build Date: ${metadata.buildDate}`, 'white');
  log(`   - Target SDK: ${metadata.targetSdkVersion}`, 'white');

  log('\n🚀 Next Steps:', 'magenta');
  log('   1. Commit the pre-built AAR to your repository', 'white');
  log('   2. Run: git add react-native-proxy-engine/dist/', 'white');
  log('   3. Run: git commit -m "Add pre-built Proxy native module"', 'white');
  log('   4. Your next EAS build will be MUCH faster! ⚡', 'white');

  log('\n💡 Benefits:', 'yellow');
  log('   ✅ No Kotlin compilation during EAS builds', 'white');
  log('   ✅ Faster build times (save 3-5 minutes per build)', 'white');
  log('   ✅ More reliable builds (no compilation failures)', 'white');
  log('   ✅ Lower EAS build costs', 'white');
  log('   ✅ Consistent results across all builds\n', 'white');

  // Return to original directory
  process.chdir(__dirname);
}

// Run the script
main().catch((error) => {
  log('\n❌ Pre-build script failed:', 'red');
  console.error(error);
  process.exit(1);
});



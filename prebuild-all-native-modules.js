#!/usr/bin/env node

/**
 * Pre-build ALL Native Modules
 *
 * This script identifies and compiles all native modules with C++ code,
 * creating pre-built AARs that can be reused in all future EAS builds.
 *
 * Modules Detected:
 * - react-native-yara-engine (C++ with CMake)
 * - react-native-proxy-engine (Pure Kotlin - no compilation needed)
 *
 * Benefits:
 * - Skip CMake compilation in EAS builds
 * - Faster builds (save 5-10 minutes per build)
 * - More reliable (no compilation failures)
 * - Lower EAS build costs
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
  white: '\x1b[37m',
  gray: '\x1b[90m',
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

// Native module configuration
const NATIVE_MODULES = [
  {
    name: 'YARA Engine',
    path: 'react-native-yara-engine',
    hasNativeCode: true,
    cmakePath: 'android/src/main/cpp/CMakeLists.txt',
    description: 'C++ malware detection engine with YARA rules',
  },
  {
    name: 'Proxy Engine',
    path: 'react-native-proxy-engine',
    hasNativeCode: false,
    description: 'Pure Kotlin proxy detection module (no C++ compilation)',
  }
];

async function detectNativeModules() {
  log('\n🔍 Detecting Native Modules...', 'cyan');
  log('═'.repeat(50), 'cyan');

  const modulesToBuild = [];

  for (const module of NATIVE_MODULES) {
    const modulePath = path.join(__dirname, module.path);

    if (!fs.existsSync(modulePath)) {
      log(`  ⚠️  ${module.name}: Not found (skipping)`, 'yellow');
      continue;
    }

    log(`\n  📦 ${module.name}`, 'blue');
    log(`     Path: ${module.path}`, 'gray');
    log(`     Type: ${module.hasNativeCode ? 'C++ Native' : 'Pure Kotlin/Java'}`, 'gray');

    if (module.hasNativeCode) {
      const cmakeFullPath = path.join(modulePath, module.cmakePath);
      if (fs.existsSync(cmakeFullPath)) {
        log(`     Status: ✅ Requires compilation`, 'green');
        modulesToBuild.push(module);
      } else {
        log(`     Status: ⚠️  No CMakeLists.txt found`, 'yellow');
      }
    } else {
      log(`     Status: ℹ️  No compilation needed`, 'cyan');
    }
  }

  log('\n' + '═'.repeat(50), 'cyan');
  log(`\n✅ Found ${modulesToBuild.length} module(s) requiring native compilation\n`, 'green');

  return modulesToBuild;
}

async function buildNativeModule(module) {
  log(`\n${'═'.repeat(60)}`, 'magenta');
  log(`🔨 Building: ${module.name}`, 'magenta');
  log(`${'═'.repeat(60)}\n`, 'magenta');

  const modulePath = path.join(__dirname, module.path);
  const androidPath = path.join(modulePath, 'android');
  const distPath = path.join(modulePath, 'dist');

  // Step 1: Clean previous builds
  log('🧹 Step 1: Cleaning previous build artifacts...', 'blue');
  const buildDir = path.join(androidPath, 'build');
  const cxxDir = path.join(androidPath, '.cxx');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
    log('  - Removed build directory', 'gray');
  }
  if (fs.existsSync(cxxDir)) {
    fs.rmSync(cxxDir, { recursive: true, force: true });
    log('  - Removed .cxx directory', 'gray');
  }
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
    log('  - Removed dist directory', 'gray');
  }
  log('✅ Cleanup complete\n', 'green');

  // Step 2: Create dist directory
  log('📦 Step 2: Creating dist directory...', 'blue');
  fs.mkdirSync(distPath, { recursive: true });
  log('✅ Dist directory created\n', 'green');

  // Step 3: Build native module using main project's Gradle wrapper
  log('🔨 Step 3: Compiling native module...', 'blue');
  log(`⏳ This may take 5-10 minutes (compiling C++ code with CMake)...\n`, 'yellow');

  try {
    const originalDir = process.cwd();

    // Use the main project's android directory which has gradlew
    const mainAndroidPath = path.join(__dirname, 'android');

    // Check if main project has gradle wrapper
    const hasGradleWrapper = process.platform === 'win32'
      ? fs.existsSync(path.join(mainAndroidPath, 'gradlew.bat'))
      : fs.existsSync(path.join(mainAndroidPath, 'gradlew'));

    if (hasGradleWrapper) {
      log('  - Using main project Gradle wrapper...', 'cyan');
      process.chdir(mainAndroidPath);

      if (process.platform === 'win32') {
        // Build the module using the main project's gradle
        exec(`gradlew.bat :${module.path}:clean :${module.path}:assembleRelease`, { stdio: 'inherit' });
      } else {
        exec(`./gradlew :${module.path}:clean :${module.path}:assembleRelease`, { stdio: 'inherit' });
      }
    } else {
      // Fallback: Try to build directly in module directory
      log('  - Building in module directory...', 'cyan');
      process.chdir(androidPath);

      if (process.platform === 'win32') {
        // Try gradlew.bat first, fall back to gradle command
        try {
          exec('gradlew.bat clean assembleRelease', { stdio: 'inherit' });
        } catch (e) {
          log('  - gradlew.bat not found, trying gradle command...', 'yellow');
          exec('gradle clean assembleRelease', { stdio: 'inherit' });
        }
      } else {
        try {
          exec('./gradlew clean assembleRelease', { stdio: 'inherit' });
        } catch (e) {
          log('  - gradlew not found, trying gradle command...', 'yellow');
          exec('gradle clean assembleRelease', { stdio: 'inherit' });
        }
      }
    }

    process.chdir(originalDir);
    log('\n✅ Native module compiled successfully!', 'green');
  } catch (error) {
    log('\n❌ Build failed!', 'red');
    throw error;
  }

  // Step 4: Locate built AAR
  log('\n📦 Step 4: Locating built AAR file...', 'blue');
  const aarOutputPath = path.join(androidPath, 'build', 'outputs', 'aar');

  if (!fs.existsSync(aarOutputPath)) {
    throw new Error('AAR output directory not found!');
  }

  const aarFiles = fs.readdirSync(aarOutputPath).filter(f => f.endsWith('.aar'));
  if (aarFiles.length === 0) {
    throw new Error('No AAR files found in output directory!');
  }

  const sourceAar = path.join(aarOutputPath, aarFiles[0]);
  log(`  - Found: ${aarFiles[0]}`, 'cyan');
  log('✅ AAR file located\n', 'green');

  // Step 5: Copy and rename AAR
  log('📋 Step 5: Copying AAR to dist directory...', 'blue');
  const targetAarName = `${module.path}-1.0.0.aar`;
  const targetAar = path.join(distPath, targetAarName);
  fs.copyFileSync(sourceAar, targetAar);

  const aarStats = fs.statSync(targetAar);
  const aarSizeMB = (aarStats.size / 1024 / 1024).toFixed(2);
  log(`  - AAR size: ${aarSizeMB} MB`, 'cyan');
  log('✅ AAR copied successfully\n', 'green');

  // Step 6: Verify AAR contents
  log('🔍 Step 6: Verifying AAR contents...', 'blue');
  try {
    const tempDir = path.join(distPath, 'temp-verify');
    fs.mkdirSync(tempDir, { recursive: true });

    const unzipCommand = process.platform === 'win32'
      ? `powershell -command "Expand-Archive -Path '${targetAar}' -DestinationPath '${tempDir}' -Force"`
      : `unzip -q "${targetAar}" -d "${tempDir}"`;

    exec(unzipCommand, { stdio: 'pipe' });

    // Check for native libraries
    const jniPath = path.join(tempDir, 'jni');
    if (fs.existsSync(jniPath)) {
      const abis = fs.readdirSync(jniPath);
      log('  - Found native libraries in ABIs:', 'cyan');
      abis.forEach(abi => {
        const abiPath = path.join(jniPath, abi);
        const libs = fs.readdirSync(abiPath);
        log(`    ✅ ${abi}: ${libs.join(', ')}`, 'green');
      });
    } else {
      log('  - No JNI libraries found (pure Java/Kotlin module)', 'yellow');
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    log('✅ AAR verification complete\n', 'green');
  } catch (error) {
    log('⚠️  Could not verify AAR contents (non-critical)\n', 'yellow');
  }

  // Step 7: Create metadata
  log('📄 Step 7: Creating build metadata...', 'blue');
  const metadata = {
    module: module.name,
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    aarFile: targetAarName,
    aarSize: aarStats.size,
    aarSizeMB: aarSizeMB,
    hasNativeCode: module.hasNativeCode,
    ndkVersion: '27.1.12297006',
    minSdkVersion: 21,
    targetSdkVersion: 34,
    abis: ['arm64-v8a', 'armeabi-v7a'],
    description: module.description,
  };

  fs.writeFileSync(
    path.join(distPath, 'build-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  log('✅ Metadata created\n', 'green');

  return { module, targetAar, aarSizeMB, metadata };
}

async function main() {
  const startTime = Date.now();

  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║  🔨 ALL NATIVE MODULES PRE-BUILD SCRIPT              ║', 'cyan');
  log('║  Compile once, use forever in EAS builds             ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

  // Detect native modules
  const modulesToBuild = await detectNativeModules();

  if (modulesToBuild.length === 0) {
    log('ℹ️  No native modules require compilation', 'cyan');
    log('All modules are either pure Kotlin/Java or already pre-built\n', 'gray');
    return;
  }

  // Build each module
  const results = [];

  for (const module of modulesToBuild) {
    try {
      const result = await buildNativeModule(module);
      results.push(result);
    } catch (error) {
      log(`\n❌ Failed to build ${module.name}:`, 'red');
      log(error.message, 'red');
      log('\n⚠️  Continuing with other modules...\n', 'yellow');
    }
  }

  const endTime = Date.now();
  const totalTime = ((endTime - startTime) / 1000 / 60).toFixed(2);

  // Final summary
  log('\n╔════════════════════════════════════════════════════════╗', 'green');
  log('║  ✅ NATIVE MODULES PRE-BUILD COMPLETE! 🎉            ║', 'green');
  log('╚════════════════════════════════════════════════════════╝\n', 'green');

  log('📊 Build Summary:', 'cyan');
  log('═'.repeat(60), 'cyan');

  results.forEach(({ module, aarSizeMB, metadata }) => {
    log(`\n  📦 ${module.name}`, 'blue');
    log(`     AAR Size: ${aarSizeMB} MB`, 'white');
    log(`     Location: ${module.path}/dist/`, 'white');
    log(`     ABIs: ${metadata.abis.join(', ')}`, 'white');
    log(`     Status: ✅ Ready for EAS builds`, 'green');
  });

  log(`\n  ⏱️  Total Build Time: ${totalTime} minutes`, 'cyan');
  log(`  ✅ Successfully built: ${results.length}/${modulesToBuild.length} modules\n`, 'green');

  log('═'.repeat(60), 'cyan');

  log('\n🚀 Next Steps:', 'magenta');
  log('  1. Commit the pre-built AARs to your repository:', 'white');
  log('     git add react-native-*/dist/', 'gray');
  log('     git commit -m "Add pre-built native module AARs"', 'gray');
  log('     git push', 'gray');

  log('\n  2. Your next EAS build will use pre-built AARs:', 'white');
  log('     eas build --platform android --profile production', 'gray');

  log('\n  3. Expected in build logs:', 'white');
  results.forEach(({ module }) => {
    log(`     "✅ ${module.name}: Using pre-built AAR"`, 'gray');
  });

  log('\n💡 Benefits:', 'yellow');
  log('  ✅ No CMake compilation during EAS builds', 'white');
  log('  ✅ Faster build times (save 5-10 minutes per build)', 'white');
  log('  ✅ More reliable builds (no compilation failures)', 'white');
  log('  ✅ Lower EAS build costs', 'white');
  log('  ✅ Consistent results across all builds', 'white');

  log('\n📝 When to rebuild:', 'yellow');
  log('  - Only when you modify C++ code', 'white');
  log('  - For JS/TS changes: No rebuild needed!', 'white');

  log('\n═'.repeat(60) + '\n', 'green');
}

// Run the script
main().catch((error) => {
  log('\n❌ Pre-build script failed:', 'red');
  console.error(error);
  process.exit(1);
});

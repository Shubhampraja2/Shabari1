const { withPlugins, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Check if pre-built AAR exists
const PREBUILT_AAR_PATH = path.join(__dirname, 'dist', 'react-native-yara-engine-1.0.0.aar');
const USE_PREBUILT_AAR = fs.existsSync(PREBUILT_AAR_PATH);

if (USE_PREBUILT_AAR) {
  console.log('✅ YARA Engine: Using pre-built AAR (native module already compiled)');
} else {
  console.log('⚠️  YARA Engine: Pre-built AAR not found, will compile during build');
  console.log('💡 Run: node prebuild-yara-native.js to create pre-built AAR');
}

function withYaraEngine(config) {
  return withPlugins(config, [
    // Android configuration
    (config) => {
      // Inject react-native-yara-engine into settings.gradle and build.gradle
      const { withSettingsGradle, withAppBuildGradle } = require('@expo/config-plugins');

      config = withSettingsGradle(config, (gradleConfig) => {
        if (!gradleConfig?.modResults?.contents.includes("react-native-yara-engine")) {
          if (USE_PREBUILT_AAR) {
            // Using pre-built AAR - no need to include project in settings.gradle
            console.log('  - Skipping settings.gradle modification (using AAR)');
          } else {
            // Compile from source - add project reference
            gradleConfig.modResults.contents += `\ninclude ':react-native-yara-engine'\nproject(':react-native-yara-engine').projectDir = new File(rootProject.projectDir, '../react-native-yara-engine/android')\n`;
            console.log('  - Added YARA project to settings.gradle');
          }
        }
        return gradleConfig;
      });

      config = withAppBuildGradle(config, (gradleConfig) => {
        try {
          if (!gradleConfig?.modResults?.contents.includes("react-native-yara-engine")) {
            // Safe projectRoot extraction with fallbacks
            const projectRoot = config.modRequest?.projectRoot ||
                               config._internal?.projectRoot ||
                               process.cwd();

            if (USE_PREBUILT_AAR) {
              // Use pre-built AAR file
              const androidRoot = path.join(projectRoot, 'android');
              const relativePath = path.relative(
                path.join(androidRoot, 'app'),
                PREBUILT_AAR_PATH
              ).replace(/\\/g, '/');

              // Add flatDir repository for AAR
              const repositoriesRegex = /repositories\s*\{/;
              if (repositoriesRegex.test(gradleConfig.modResults.contents)) {
                gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
                  repositoriesRegex,
                  `repositories {\n        flatDirs {\n            dirs '${path.dirname(relativePath).replace(/\\/g, '/')}'\n        }`
                );
              }

              // Add AAR dependency
              gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
                /dependencies \{/,
                `dependencies {\n    implementation(name: 'react-native-yara-engine-1.0.0', ext: 'aar')`
              );

              console.log('✅ YARA Engine: Added pre-built AAR to build.gradle dependencies');
            } else {
              // Compile from source - add project dependency
              const dependenciesMatch = gradleConfig.modResults.contents.match(/dependencies \{[\s\S]*?\n\}/m);
              if (dependenciesMatch && !dependenciesMatch[0].includes("implementation project(':react-native-yara-engine')")) {
                gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
                  /dependencies \{/,
                  `dependencies {\n    implementation project(':react-native-yara-engine')`
                );
                console.log('✅ YARA Engine: Added to build.gradle dependencies (will compile C++)');
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ YARA Engine: Error configuring build.gradle:', error.message);
        }
        return gradleConfig;
      });

      return withDangerousMod(config, [
        'android',
        async (config) => {
          try {
            // Safe projectRoot extraction with fallbacks
            const projectRoot = config.modRequest?.projectRoot ||
                               config._internal?.projectRoot ||
                               process.cwd();
            const androidRoot = path.join(projectRoot, 'android');

            // Ensure the YARA engine has necessary permissions
            // (Already handled by main app permissions)
            
            console.log('✅ YARA Engine: Android configuration completed');
            return config;
          } catch (error) {
            console.warn('⚠️ YARA Engine: Error in dangerous mod:', error.message);
            return config;
          }
        },
      ]);
    },
    
    // Add YaraPackage to MainApplication
    (config) => {
      return withMainApplication(config, async (config) => {
        try {
          // Safe projectRoot extraction with fallbacks
          const projectRoot = config.modRequest?.projectRoot ||
                             config._internal?.projectRoot ||
                             process.cwd();
          const androidRoot = path.join(projectRoot, 'android');
        
          const mainApplicationJavaPath = path.join(
            androidRoot,
            'app',
            'src',
            'main',
            'java',
            'com',
            'shabari',
            'app',
            'MainApplication.java'
          );

          const mainApplicationKotlinPath = path.join(
            androidRoot,
            'app',
            'src',
            'main',
            'java',
            'com',
            'shabari',
            'app',
            'MainApplication.kt'
          );

          let mainApplicationPath = null;
          let isKotlin = false;

          if (fs.existsSync(mainApplicationJavaPath)) {
            mainApplicationPath = mainApplicationJavaPath;
            isKotlin = false;
          } else if (fs.existsSync(mainApplicationKotlinPath)) {
            mainApplicationPath = mainApplicationKotlinPath;
            isKotlin = true;
          }

          if (mainApplicationPath) {
            let mainApplicationContent = fs.readFileSync(mainApplicationPath, 'utf-8');

            // Add import if not present
            if (!mainApplicationContent.includes('import com.shabari.yara.YaraPackage')) {
              const importIndex = mainApplicationContent.lastIndexOf('import');
              const endOfImport = mainApplicationContent.indexOf('\n', importIndex);
              mainApplicationContent =
                mainApplicationContent.slice(0, endOfImport + 1) +
                '\n// Import YARA package\n' +
                'import com.shabari.yara.YaraPackage\n' +
                mainApplicationContent.slice(endOfImport + 1);
            }

            // Add package to the list if not present
            if (!mainApplicationContent.includes('YaraPackage()')) {
              if (isKotlin) {
                // Handle Kotlin syntax - add after PackageList(this).packages
                const packageListRegex = /val packages = PackageList\(this\)\.packages/;
                mainApplicationContent = mainApplicationContent.replace(
                  packageListRegex,
                  (match) => {
                    return match + '\n            // Add YARA package for native malware detection\n            packages.add(YaraPackage())';
                  }
                );
              } else {
                // Handle Java syntax
                const getPackagesRegex = /protected List<ReactPackage> getPackages\(\) {[\s\S]*?return packages;/;
                mainApplicationContent = mainApplicationContent.replace(
                  getPackagesRegex,
                  (match) => {
                    const returnIndex = match.lastIndexOf('return packages;');
                    return match.slice(0, returnIndex) +
                      '      packages.add(new YaraPackage());\n' +
                      '      ' + match.slice(returnIndex);
                  }
                );
              }

              fs.writeFileSync(mainApplicationPath, mainApplicationContent);
              console.log('✅ YaraPackage added to', isKotlin ? 'Kotlin' : 'Java', 'MainApplication');
            }
          }
        } catch (error) {
          console.warn('⚠️ YARA Engine: Error adding to MainApplication:', error.message);
        }

        return config;
      });
    },
  ]);
}

module.exports = withYaraEngine;

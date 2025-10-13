module.exports = {
  dependencies: {
    'react-native-yara-engine': {
      platforms: {
        android: {
          sourceDir: __dirname + '/react-native-yara-engine/android',
          packageImportPath: 'import com.shabari.yara.YaraPackage;',
          packageInstance: 'new YaraPackage()',
        },
      },
    },
    'react-native-proxy-engine': {
      platforms: {
        android: {
          sourceDir: __dirname + '/react-native-proxy-engine/android/app',
          packageImportPath: 'import com.reactnativeproxyengine.ReactNativeProxyEnginePackage;',
          packageInstance: 'new ReactNativeProxyEnginePackage()',
        },
      },
    },
  },
};

module.exports = {
  "name": "Shabari",
  "slug": "shabari",
  "version": "1.1.0",
  "platforms": ["android"],
  "orientation": "portrait",
  "icon": "./assets/images/icon.png",
  "userInterfaceStyle": "light",
  "splash": {
    "image": "./assets/images/splash-icon.png",
    "resizeMode": "contain",
    "backgroundColor": "#ffffff"
  },
  "assetBundlePatterns": ["**/*"],
  "scheme": "shabari",
  "android": {
    "adaptiveIcon": {
      "foregroundImage": "./assets/images/icon.png",
      "backgroundColor": "#ffffff"
    },
    "package": "com.shabari.app",
    "versionCode": 3,
    "privacyPolicy": "https://shubham485.github.io/shabari-privacy-policy/",
    "intentFilters": [
      {
        "action": "VIEW",
        "autoVerify": true,
        "data": [
          {
            "scheme": "shabari"
          }
        ],
        "category": ["BROWSABLE", "DEFAULT"]
      }
    ],
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.POST_NOTIFICATIONS"
    ]
  },
  "owner": "shubhamprana1",
  "extra": {
    "eas": {
      "projectId": "352370c7-352b-4b07-999b-cf492f1bffa9"
    }
  },
  "plugins": [
    "expo-dev-client",
    "expo-notifications",
    "./expo-plugins/withGmsDependencies",
    "./react-native-yara-engine/app.plugin.js",
    "./react-native-proxy-engine/app.plugin.js",
    ["expo-image-picker", {
      "photosPermission": "The app accesses your photos to scan suspicious images.",
      "cameraPermission": "The app accesses your camera to capture screenshots."
    }],
    ["expo-barcode-scanner", {
      "cameraPermission": "The app uses the camera to scan QR codes."
    }],
    ["expo-build-properties", {
      "android": {
        "minSdkVersion": 24,
        "compileSdkVersion": 35,
        "targetSdkVersion": 34,
        "enableProguardInReleaseBuilds": true,
        "proguardFiles": ["./proguard-rules.pro"],
        "extraProguardRules": "-keep class com.google.android.gms.auth.api.credentials.** { *; }\n-dontwarn com.google.android.gms.**\n-dontwarn me.furtado.smsretriever.**\n-keep class com.google.android.gms.common.** { *; }\n-keep class com.google.android.gms.tasks.** { *; }\n"
      }
    }]
  ]
};
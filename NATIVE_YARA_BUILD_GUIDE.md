# 🔥 Native YARA Engine Build Guide

## Problem Identified

Your APK is using the **mock YARA engine** instead of the **native C++ engine** because:

1. ❌ The native libraries (`.so` files) were **never built**
2. ❌ The `jniLibs` folders are **completely empty**
3. ❌ Without the native libraries, the app falls back to the JavaScript mock

## Root Cause

The YARA engine has C++ source code that needs to be compiled into native ARM libraries (.so files). These were never generated, so the native module can't load at runtime.

## 🎯 Solution: Build Native Libraries Locally

Since EAS cloud builds have issues compiling C++ code, we'll:
1. **Build the native libraries on YOUR local machine** (where you have Android SDK/NDK)
2. **Commit the prebuilt .so files** to the repository
3. **EAS will use the prebuilt libraries** (no compilation needed)

---

## 📋 Prerequisites

You need on your local machine:
- ✅ Android Studio (with SDK)
- ✅ Android NDK version 26.x
- ✅ CMake (installed via Android Studio SDK Manager)
- ✅ Java JDK 17 or higher

---

## 🚀 Step-by-Step Instructions

### Step 1: Open Android Studio SDK Manager

1. Open Android Studio
2. Go to: `Tools` → `SDK Manager`
3. Click on `SDK Tools` tab
4. Ensure these are installed:
   - ✅ NDK (Side by side)
   - ✅ CMake
   - ✅ Android SDK Build-Tools

### Step 2: Run the Build Script

Open Command Prompt in your project folder and run:

```cmd
BUILD_NATIVE_YARA_LOCALLY.bat
```

This will:
- Clean previous builds
- Compile the C++ YARA engine
- Copy the native libraries to `jniLibs` folders
- Take 5-10 minutes

### Step 3: Verify Native Libraries Were Built

After the script completes, check these folders have `.so` files:

```
react-native-yara-engine/android/src/main/jniLibs/
├── arm64-v8a/
│   └── libyara-engine.so  ← Should exist!
└── armeabi-v7a/
    └── libyara-engine.so  ← Should exist!
```

### Step 4: Commit the Native Libraries

```cmd
git add react-native-yara-engine/android/src/main/jniLibs/
git commit -m "Add prebuilt YARA native libraries"
git push
```

### Step 5: Build with EAS

Now EAS will use your prebuilt native libraries:

```cmd
eas build --platform android --profile production
```

---

## ✅ Expected Result

After following these steps, your APK will:
- ✅ Load the **real native YARA engine** (not the mock)
- ✅ Use actual C++ malware detection
- ✅ Show "Native YARA Engine v4.5.0" instead of "Mock YARA Engine"
- ✅ Provide real file scanning with 127+ YARA rules

---

## 🐛 Troubleshooting

### Error: "CMake not found"

**Solution:** Install CMake via Android Studio SDK Manager

### Error: "NDK not found"

**Solution:** 
1. Open Android Studio → SDK Manager → SDK Tools
2. Install "NDK (Side by side)"
3. Set `ANDROID_NDK_HOME` environment variable

### Error: "Build failed with C++ compilation errors"

**Solution:**
1. Make sure you're using NDK version 26.x (not 27 or higher)
2. Check that CMake version 3.22.1 is installed
3. Try cleaning: `gradlew clean` then rebuild

### Error: "jniLibs folders still empty"

**Solution:**
The build script copies from:
```
react-native-yara-engine/android/build/intermediates/library_jni/release/jni/
```

If this folder doesn't exist after build, the compilation didn't complete. Check the Gradle build output for errors.

---

## 🎯 Alternative: EAS Cloud Build with NDK (Advanced)

If you want EAS to compile the C++ code (not recommended due to complexity):

1. The C++ compilation is already re-enabled in the build.gradle
2. EAS needs NDK configuration in eas.json
3. Build times will be 10-15 minutes longer
4. Higher chance of build failures

**Recommendation:** Use the local build approach above - it's more reliable.

---

## 📝 Summary

**Before:** Mock YARA Engine (JavaScript fallback)
**After:** Native YARA Engine (Real C++ malware detection)

The key is building the native libraries locally, then letting EAS use the prebuilt binaries. This avoids EAS C++ compilation issues while still giving you the full native functionality.

Good luck! 🚀


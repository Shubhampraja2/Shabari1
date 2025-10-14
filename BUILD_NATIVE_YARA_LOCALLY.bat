@echo off
echo ========================================
echo Building YARA Native Module Locally
echo ========================================
echo.
echo This will compile the C++ YARA engine on your local machine
echo Then EAS will use the prebuilt libraries
echo.

cd /d "%~dp0"

echo Step 1: Clean previous builds...
if exist "react-native-yara-engine\android\build" rmdir /s /q "react-native-yara-engine\android\build"
if exist "react-native-yara-engine\android\.cxx" rmdir /s /q "react-native-yara-engine\android\.cxx"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
if exist "android\app\build" rmdir /s /q "android\app\build"

echo.
echo Step 2: Building native libraries with Gradle...
echo This will take 5-10 minutes...
echo.

cd android
call gradlew.bat :react-native-yara-engine:assembleRelease

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: Build failed!
    echo ========================================
    pause
    exit /b 1
)

cd ..

echo.
echo Step 3: Copying native libraries to jniLibs...
echo.

set SOURCE_DIR=react-native-yara-engine\android\build\intermediates\library_jni\release\jni
set TARGET_DIR=react-native-yara-engine\android\src\main\jniLibs

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

if exist "%SOURCE_DIR%\arm64-v8a" (
    echo Copying arm64-v8a libraries...
    xcopy /E /I /Y "%SOURCE_DIR%\arm64-v8a" "%TARGET_DIR%\arm64-v8a"
)

if exist "%SOURCE_DIR%\armeabi-v7a" (
    echo Copying armeabi-v7a libraries...
    xcopy /E /I /Y "%SOURCE_DIR%\armeabi-v7a" "%TARGET_DIR%\armeabi-v7a"
)

echo.
echo ========================================
echo SUCCESS! Native libraries built!
echo ========================================
echo.
echo The prebuilt native libraries are now in:
echo react-native-yara-engine\android\src\main\jniLibs\
echo.
echo Now you can run: eas build --platform android
echo.
pause

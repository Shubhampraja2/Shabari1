@echo off
echo ========================================
echo Shabari App - Local APK Build
echo ========================================
echo.
echo This will build the APK locally on your machine (FREE)
echo No EAS credits required!
echo.
pause

echo.
echo [1/4] Installing dependencies...
call npm install

echo.
echo [2/4] Prebuild Android native code...
call npx expo prebuild --platform android

echo.
echo [3/4] Building release APK...
cd android
call gradlew assembleRelease

echo.
echo [4/4] Build complete!
echo.
echo APK Location:
echo android\app\build\outputs\apk\release\app-release.apk
echo.
echo You can install this APK on any Android device!
echo.
pause


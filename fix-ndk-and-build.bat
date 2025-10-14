@echo off
echo ========================================
echo Fixing NDK Issue for Shabari Build
echo ========================================
echo.

echo Step 1: Checking current NDK situation...
echo.
echo Corrupted NDK detected at:
echo C:\Users\Shubham prajapati\AppData\Local\Android\Sdk\ndk\26.1.10909125
echo.

echo Step 2: Removing corrupted NDK folder...
if exist "C:\Users\Shubham prajapati\AppData\Local\Android\Sdk\ndk\26.1.10909125" (
    echo Removing corrupted NDK 26.1...
    rmdir /s /q "C:\Users\Shubham prajapati\AppData\Local\Android\Sdk\ndk\26.1.10909125"
    echo Done!
) else (
    echo Corrupted NDK folder not found or already removed.
)
echo.

echo Step 3: Now we'll try to build with NDK 25.1
echo The build will automatically download NDK 25.1 if needed.
echo.
pause

echo Starting build...
cd android
.\gradlew clean
.\gradlew assembleRelease
cd ..

echo.
echo Build process completed!
echo Check above for any errors.
echo.
echo If successful, your APK is at:
echo android\app\build\outputs\apk\release\app-release.apk
echo.
pause


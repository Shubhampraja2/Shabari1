@echo off
echo ========================================
echo Fixing Long Path Issue for Build
echo ========================================
echo.

echo Problem: Your project path is too long for Windows build tools.
echo Solution: We'll use shorter paths in Gradle configuration.
echo.

cd android

echo [1/3] Creating gradle.properties with short path settings...
echo. >> gradle.properties
echo # Fix for long path issues on Windows >> gradle.properties
echo org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m >> gradle.properties
echo android.enableJetifier=true >> gradle.properties
echo android.useAndroidX=true >> gradle.properties
echo android.injected.build.abi=armeabi-v7a,arm64-v8a >> gradle.properties

echo.
echo [2/3] Cleaning previous build artifacts...
call gradlew.bat clean

echo.
echo [3/3] Building APK with optimized settings...
echo This may take 10-15 minutes...
echo.

call gradlew.bat assembleRelease --no-daemon --max-workers=2

if exist "app\build\outputs\apk\release\app-release.apk" (
    echo.
    echo ========================================
    echo SUCCESS! APK Built Successfully!
    echo ========================================
    echo.
    echo APK Location:
    echo %cd%\app\build\outputs\apk\release\app-release.apk
    echo.
    echo File Size:
    dir app\build\outputs\apk\release\app-release.apk | findstr "app-release.apk"
    echo.
    echo You can now install this APK on your Android device!
    echo.
) else (
    echo.
    echo ========================================
    echo Build completed but APK not found.
    echo Check the build output above for errors.
    echo ========================================
    echo.
)

pause


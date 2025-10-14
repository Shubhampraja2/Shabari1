@echo off
echo ========================================
echo YARA Engine Build Diagnostics
echo ========================================
echo.

cd android

echo [1/2] Cleaning previous build...
call gradlew.bat clean

echo.
echo [2/2] Building YARA module with detailed output...
call gradlew.bat :react-native-yara-engine:compileReleaseJavaWithJavac --stacktrace > yara-build-error.log 2>&1

echo.
echo Build log saved to: android\yara-build-error.log
echo.
echo Showing Java errors:
echo ========================================
findstr /C:"error:" /C:"cannot find symbol" /C:"package does not exist" yara-build-error.log

echo.
echo.
echo Full log file: android\yara-build-error.log
pause


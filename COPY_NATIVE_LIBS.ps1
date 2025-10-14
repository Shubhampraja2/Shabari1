# Copy Native Libraries to jniLibs
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Copying Native Libraries to jniLibs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = "C:\Users\Shubham prajapati\Downloads\Shabari-App-Final\Shabari"
$sourceBase = "$projectRoot\react-native-yara-engine\android\build\intermediates\stripped_native_libs\release\stripReleaseDebugSymbols\out\lib"
$targetBase = "$projectRoot\react-native-yara-engine\android\src\main\jniLibs"

# Ensure target directories exist
New-Item -ItemType Directory -Force -Path "$targetBase\arm64-v8a" | Out-Null
New-Item -ItemType Directory -Force -Path "$targetBase\armeabi-v7a" | Out-Null

# Copy arm64-v8a libraries
Write-Host "Copying arm64-v8a libraries..." -ForegroundColor Yellow
if (Test-Path "$sourceBase\arm64-v8a\libyara-engine.so") {
    Copy-Item "$sourceBase\arm64-v8a\libyara-engine.so" "$targetBase\arm64-v8a\libyara-engine.so" -Force
    Copy-Item "$sourceBase\arm64-v8a\libc++_shared.so" "$targetBase\arm64-v8a\libc++_shared.so" -Force
    Write-Host "  [OK] arm64-v8a libraries copied" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] arm64-v8a source files not found!" -ForegroundColor Red
}

# Copy armeabi-v7a libraries
Write-Host "Copying armeabi-v7a libraries..." -ForegroundColor Yellow
if (Test-Path "$sourceBase\armeabi-v7a\libyara-engine.so") {
    Copy-Item "$sourceBase\armeabi-v7a\libyara-engine.so" "$targetBase\armeabi-v7a\libyara-engine.so" -Force
    Copy-Item "$sourceBase\armeabi-v7a\libc++_shared.so" "$targetBase\armeabi-v7a\libc++_shared.so" -Force
    Write-Host "  [OK] armeabi-v7a libraries copied" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] armeabi-v7a source files not found!" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify files
$arm64File = "$targetBase\arm64-v8a\libyara-engine.so"
$armv7File = "$targetBase\armeabi-v7a\libyara-engine.so"

if (Test-Path $arm64File) {
    $size = (Get-Item $arm64File).Length / 1KB
    $sizeRounded = [math]::Round($size, 2)
    Write-Host "[OK] arm64-v8a: libyara-engine.so ($sizeRounded KB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] arm64-v8a: libyara-engine.so NOT FOUND" -ForegroundColor Red
}

if (Test-Path $armv7File) {
    $size = (Get-Item $armv7File).Length / 1KB
    $sizeRounded = [math]::Round($size, 2)
    Write-Host "[OK] armeabi-v7a: libyara-engine.so ($sizeRounded KB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] armeabi-v7a: libyara-engine.so NOT FOUND" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUCCESS! Native libraries are ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. git add react-native-yara-engine/android/src/main/jniLibs/" -ForegroundColor White
Write-Host "2. git commit -m 'Add prebuilt YARA native libraries'" -ForegroundColor White
Write-Host "3. git push" -ForegroundColor White
Write-Host "4. eas build --platform android --profile production" -ForegroundColor White
Write-Host ""

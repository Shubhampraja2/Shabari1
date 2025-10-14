# 🧪 Shabari App - Local Testing Guide

**Date:** October 12, 2025  
**Version:** 1.1.0  
**Status:** ✅ Ready for Local Testing

---

## 🎯 What We Fixed

### Critical Production Fix Applied ✅
- **Changed `isPremium: false`** in `subscriptionStore.ts`
- **Before:** All users had premium features (testing mode)
- **After:** Users start with free tier (production ready)
- **Impact:** Free users will now see upgrade prompts for premium features

---

## 📱 How to Test Locally

### Step 1: Install Dependencies (If Not Already Installed)

```bash
cd "C:\Users\Shubham prajapati\Downloads\Shabari-App-Final\Shabari"
npm install
```

**Expected Result:** All dependencies installed successfully (may take 5-10 minutes)

---

### Step 2: Start the Development Server

```bash
npm start
```

**OR**

```bash
npx expo start
```

**Expected Result:** You should see:
- ✅ Expo development server starts
- ✅ QR code displayed in terminal
- ✅ Options to open in Android, iOS, or web

---

### Step 3: Open the App

#### Option A: Using Expo Go (Easiest)
1. Install **Expo Go** from Play Store on your Android device
2. Scan the QR code from the terminal
3. App will load on your device

#### Option B: Using Android Emulator
```bash
npm run android
```
**Note:** Requires Android Studio and emulator setup

#### Option C: On Physical Device (Development Build)
```bash
npx expo run:android
```
**Note:** Requires USB debugging enabled

---

## ✅ What to Test

### 1. **Free Tier Experience** (Most Important)

#### Test: User Without Login
- [ ] Open app without signing in
- [ ] Navigate to Dashboard
- [ ] **Expected:** See basic manual scanning features
- [ ] Try to access premium features (Watchdog, Privacy Guard, etc.)
- [ ] **Expected:** See "Upgrade to Premium" prompt

#### Test: Manual Features Work
- [ ] **URL Scanner:** Enter a URL manually and scan
- [ ] **QR Scanner:** Scan a QR code
- [ ] **Document Scanner:** Select a document to scan
- [ ] **SMS Analysis:** View SMS messages (basic analysis)
- [ ] **Expected:** All manual features work without premium

---

### 2. **Premium Tier Experience**

#### Test: Login with Premium Account
1. Sign in with account that has `is_premium: true` in Supabase
2. Navigate to Dashboard
3. **Expected:** All premium features unlocked
4. Check for:
   - [ ] Privacy Guard toggle visible
   - [ ] Watchdog File Service available
   - [ ] Clipboard Monitor active
   - [ ] OTP Insight Pro enabled
   - [ ] No upgrade prompts

#### Test: Premium Features Activate
- [ ] Toggle Privacy Guard ON
- [ ] Enable Watchdog File Service
- [ ] Activate Clipboard Monitor
- [ ] **Expected:** Services start successfully with status indicators

---

### 3. **Authentication Flow**

#### Test: Sign Up as New User
- [ ] Click "Sign Up" on login screen
- [ ] Enter email and password
- [ ] **Expected:** Account created, starts as FREE tier
- [ ] **Expected:** Dashboard shows free tier features only

#### Test: Premium Status Sync
1. Login as free user
2. In Supabase, update user's `is_premium: true`
3. Close and reopen app (or trigger sync)
4. **Expected:** App detects premium status and unlocks features

#### Test: Logout
- [ ] Sign out from settings
- [ ] **Expected:** Returns to login screen
- [ ] **Expected:** Premium status resets to free

---

### 4. **Core Security Features**

#### Test: URL Protection
1. Go to Link Detection screen
2. Enter suspicious URL: `http://malware-test.com`
3. **Expected:** Threat detected and blocked
4. Try safe URL: `https://google.com`
5. **Expected:** Verified as safe

#### Test: QR Code Scanner
1. Open QR Scanner from dashboard
2. Generate test QR code with URL
3. Scan it with app
4. **Expected:** URL analyzed before opening
5. **Expected:** Warning if suspicious

#### Test: Document Scanner
1. Go to Document Scanner
2. Pick a document or image
3. **Expected:** Text extracted and analyzed
4. **Expected:** Threats detected if present

#### Test: SMS Shield
1. Navigate to Message Analysis
2. View recent SMS messages
3. **Expected:** OTP messages identified
4. **Expected:** Basic analysis for free users
5. **Expected:** Advanced AI analysis for premium users

---

### 5. **Call Protection** (NEW in v1.1.0)

#### Test: Call Screen Features
1. Make a call from your phone
2. **Expected:** Call Protection screen appears (if feature is active)
3. Check number reputation
4. **Expected:** Shows "Safe", "Spam", or "Unknown"

#### Test: Manual Number Reporting
1. Go to Call Protection settings
2. Report a spam number manually
3. **Expected:** Number added to local blocklist

---

### 6. **UI/UX Testing**

#### Test: Navigation
- [ ] Dashboard → All feature screens accessible
- [ ] Bottom tabs work smoothly
- [ ] Back navigation functions correctly
- [ ] Settings screen opens properly

#### Test: Visual Appearance
- [ ] Beautiful gradients display correctly
- [ ] Icons load properly
- [ ] Text is readable
- [ ] No overlapping UI elements
- [ ] Loading states show appropriately

#### Test: Notifications
- [ ] Threat detection triggers notification
- [ ] Notifications are clear and informative
- [ ] Action buttons work in notifications

---

## 🐛 Common Issues & Solutions

### Issue 1: "npm install" Fails
**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rmdir /s /q node_modules
del package-lock.json

# Reinstall
npm install
```

### Issue 2: Metro Bundler Error
**Solution:**
```bash
# Clear Metro cache
npx expo start -c
```

### Issue 3: Native Module Not Found
**Solution:**
```bash
# Rebuild native modules
npm run prebuild:all

# Or specifically for YARA
npm run prebuild:yara
```

### Issue 4: App Crashes on Startup
**Check:**
1. View logs: `npx react-native log-android`
2. Check Sentry dashboard for crash reports
3. Verify all permissions granted

### Issue 5: Premium Features Not Working
**Solution:**
1. Check user login status
2. Verify `is_premium: true` in Supabase
3. Trigger sync: Close and reopen app
4. Check console logs for "Premium status synced"

---

## 📊 Testing Checklist Summary

### Critical Tests (Must Pass)
- [x] App starts without crashes
- [ ] Free users see upgrade prompts
- [ ] Premium users access all features
- [ ] Authentication works correctly
- [ ] Manual scanning features work
- [ ] UI displays correctly

### Important Tests (Should Pass)
- [ ] Premium status syncs from Supabase
- [ ] Background services start (premium)
- [ ] Notifications work
- [ ] Call protection functions
- [ ] Navigation is smooth

### Nice to Have Tests
- [ ] Performance is good
- [ ] No memory leaks
- [ ] Battery usage acceptable
- [ ] All animations smooth

---

## 🚀 After Testing - Next Steps

### If All Tests Pass ✅
1. Commit the `isPremium: false` change
2. Build production APK:
   ```bash
   eas build --platform android --profile production-fixed
   ```
3. Wait for build to complete (~10-15 minutes)
4. Download and test APK on real device
5. Submit to Play Store if ready

### If Issues Found ❌
1. Note which tests failed
2. Check console logs and Sentry
3. Fix issues in code
4. Re-test locally
5. Repeat until all tests pass

---

## 📝 Test Results Log

**Date:** _______________  
**Tester:** _______________

| Test Category | Status | Notes |
|--------------|--------|-------|
| Free Tier | ⬜ Pass / ⬜ Fail | |
| Premium Tier | ⬜ Pass / ⬜ Fail | |
| Authentication | ⬜ Pass / ⬜ Fail | |
| Security Features | ⬜ Pass / ⬜ Fail | |
| Call Protection | ⬜ Pass / ⬜ Fail | |
| UI/UX | ⬜ Pass / ⬜ Fail | |

**Overall Status:** ⬜ APPROVED FOR PRODUCTION / ⬜ NEEDS FIXES

**Additional Notes:**
_________________________________________________
_________________________________________________
_________________________________________________

---

## 💡 Pro Tips

1. **Test on Real Device:** Always test on actual Android device, not just emulator
2. **Check Different Android Versions:** Test on Android 7, 10, and 13+ if possible
3. **Monitor Logs:** Keep `npx react-native log-android` running during tests
4. **Test Network Issues:** Try with WiFi, mobile data, and offline
5. **Test Low Memory:** Check performance on devices with 2GB RAM
6. **Clear App Data:** Test fresh install experience by clearing app data between tests

---

**Ready to begin testing!** 🚀


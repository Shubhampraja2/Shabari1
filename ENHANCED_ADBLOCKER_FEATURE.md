# Enhanced Ad Blocker Feature - User-Controlled Domain Blocking

## Overview

The enhanced ad blocker feature provides users with granular control over ad blocking in Shabari. Instead of just blocking ads automatically, users can now see detected ads and choose which domains to block, building their own personalized ad block list.

## Key Features

### 1. **User-Controlled Blocking**
- Ads are detected in real-time as users browse
- Users see detected ads and can choose to block specific domains
- One-tap blocking/unblocking of ad domains
- Personal block list stored locally on device

### 2. **Smart Ad Detection**
- Integrates with the proxy engine for network-level detection
- Pattern-based detection for common ad servers
- Heuristic analysis of URL patterns
- Known ad domain database

### 3. **Comprehensive Tracking**
- View all detected ads with timestamps
- See which domains are blocked
- Track statistics (total ads detected, blocked, domains blocked)
- Export/import block lists

### 4. **Privacy-Focused**
- All data stored locally on user's device
- No external tracking or data collection
- User has complete control over blocked domains

## Architecture

### Services

#### 1. **UserAdBlockerService** (`src/services/UserAdBlockerService.ts`)
Core service managing user-controlled ad blocking:

**Key Methods:**
- `initialize()` - Initialize the service and load stored data
- `checkUrl(url)` - Check if a URL is an ad
- `blockDomain(domain, reason)` - Block a domain
- `unblockDomain(domain)` - Unblock a domain
- `getBlockedDomains()` - Get all blocked domains
- `getDetectedAds()` - Get all detected ads
- `getStats()` - Get blocking statistics
- `updateSettings(settings)` - Update ad blocker settings

**Data Structures:**
```typescript
interface DetectedAd {
  id: string;
  domain: string;
  url: string;
  timestamp: number;
  isBlocked: boolean;
  blockedAt?: number;
  detectionMethod: 'proxy' | 'pattern' | 'heuristic';
}

interface BlockedDomain {
  domain: string;
  blockedAt: number;
  reason: string;
  blockCount: number;
  lastBlockedUrl?: string;
}

interface AdBlockerSettings {
  enabled: boolean;
  autoBlockKnownAds: boolean;
  showAdNotifications: boolean;
  strictMode: boolean;
}
```

#### 2. **ProxyEngineService Integration**
Enhanced proxy engine service with ad blocking methods:

**New Methods:**
- `checkUrlForAds(url)` - Check if URL contains ads
- `blockAdDomain(domain, reason)` - Block an ad domain
- `unblockAdDomain(domain)` - Unblock an ad domain
- `getAdBlockerStats()` - Get ad blocker statistics

### UI Components

#### **EnhancedAdBlockerScreen** (`src/screens/EnhancedAdBlockerScreen.tsx`)

Beautiful, modern UI for ad blocker management:

**Features:**
- Real-time statistics cards
- Toggle switches for settings
- Search functionality
- Two tabs: "Detected Ads" and "Blocked Domains"
- One-tap block/unblock actions
- Export/import functionality
- Clear history options

**UI Elements:**
1. **Header** - Title and subtitle
2. **Stats Cards** - Ads detected, ads blocked, domains blocked
3. **Settings Panel** - Enable blocking, auto-block known ads
4. **Search Bar** - Filter domains and URLs
5. **Tabs** - Switch between detected ads and blocked domains
6. **Lists** - Scrollable lists with pull-to-refresh
7. **Action Buttons** - Block, unblock, export, clear

## How It Works

### Ad Detection Flow

```
1. User browses or makes network request
   ↓
2. Proxy engine intercepts the request
   ↓
3. ProxyEngineService.checkUrlForAds(url)
   ↓
4. UserAdBlockerService.checkUrl(url)
   ↓
5. Check against:
   - User's blocked domains list
   - Known ad patterns
   - URL heuristics
   ↓
6. Return result:
   - isAd: true/false
   - shouldBlock: true/false
   - domain: extracted domain
   - reason: why it's detected/blocked
```

### User Blocking Flow

```
1. User sees detected ad in the app
   ↓
2. User taps "Block" button
   ↓
3. Confirmation dialog appears
   ↓
4. User confirms blocking
   ↓
5. UserAdBlockerService.blockDomain(domain)
   ↓
6. Domain added to blocked list
   ↓
7. All future requests to this domain are blocked
   ↓
8. Notification shown to user
   ↓
9. UI updates to reflect blocked status
```

## Integration with Proxy Engine

The ad blocker integrates seamlessly with the existing proxy engine:

### Kotlin Side (Android)

The `ProxyServer.kt` already has basic ad blocking in the `checkThreatDetection()` method. The enhancement adds:

1. **User block list integration** - Check user's blocked domains
2. **Ad detection callbacks** - Notify JavaScript layer of detected ads
3. **Dynamic updates** - Update block list in real-time

### JavaScript Side

The `ProxyEngineService` now exposes ad blocking methods that:

1. Initialize the UserAdBlockerService
2. Check URLs during proxy operations
3. Apply user's block list
4. Send notifications about blocked ads

## Settings

### Available Settings

1. **Enable Ad Blocking** - Master on/off switch
2. **Auto-block Known Ads** - Automatically block known ad domains
3. **Show Ad Notifications** - Show notifications when ads are detected/blocked
4. **Strict Mode** - More aggressive ad detection (future)

## Data Storage

All data is stored locally using AsyncStorage:

```
@shabari_blocked_ad_domains - List of blocked domains
@shabari_detected_ads - History of detected ads
@shabari_adblocker_settings - User settings
```

**Storage Keys:**
- Persistent across app restarts
- Backed up with app data
- User can export/import for backup

## User Interface

### Detected Ads Tab

Shows all ads detected while browsing:
- Domain name
- Full URL
- Detection timestamp
- Detection method (proxy/pattern/heuristic)
- Status (Detected/Blocked)
- "Block" button for unblocked ads

### Blocked Domains Tab

Shows all domains user has blocked:
- Domain name
- Reason for blocking
- Block count (how many times blocked)
- Date added
- "Unblock" button

### Statistics

Real-time stats displayed in cards:
- Total ads detected
- Total ads blocked
- Total domains blocked

## Export/Import

### Export
Users can export their blocked domains list as JSON:
```json
[
  {
    "domain": "ads.example.com",
    "blockedAt": 1697012345678,
    "reason": "Blocked by user",
    "blockCount": 15,
    "lastBlockedUrl": "https://ads.example.com/banner.jpg"
  }
]
```

### Import
Users can import blocked domains from JSON file to:
- Transfer settings to new device
- Share block lists with others
- Restore from backup

## Performance Considerations

1. **Fast Lookup** - Uses Map data structure for O(1) domain lookups
2. **Limited History** - Keeps only last 1000 detected ads
3. **Lazy Loading** - Initializes only when needed
4. **Efficient Patterns** - Optimized regex patterns for ad detection

## Privacy & Security

1. **Local Storage** - No cloud sync, all data on device
2. **No Tracking** - No analytics or telemetry
3. **User Control** - Complete control over blocked domains
4. **Transparent** - Users see exactly what's being blocked

## Usage Example

```typescript
import { userAdBlockerService } from './services/UserAdBlockerService';

// Initialize
await userAdBlockerService.initialize();

// Check if URL is an ad
const result = await userAdBlockerService.checkUrl('https://ads.example.com/banner');
if (result.isAd && !result.shouldBlock) {
  // Show user option to block this domain
  console.log(`Ad detected from ${result.domain}`);
}

// Block a domain
await userAdBlockerService.blockDomain('ads.example.com', 'User blocked');

// Get statistics
const stats = userAdBlockerService.getStats();
console.log(`Blocked ${stats.totalAdsBlocked} ads from ${stats.totalDomainsBlocked} domains`);

// Get blocked domains
const blockedDomains = userAdBlockerService.getBlockedDomains();
blockedDomains.forEach(domain => {
  console.log(`${domain.domain}: ${domain.blockCount} blocks`);
});
```

## Navigation Setup

Add to your navigation:

```typescript
import EnhancedAdBlockerScreen from './screens/EnhancedAdBlockerScreen';

// In your navigation stack:
<Stack.Screen 
  name="AdBlocker" 
  component={EnhancedAdBlockerScreen}
  options={{ title: 'Ad Blocker' }}
/>
```

## Future Enhancements

1. **Community Lists** - Share and import community block lists
2. **Whitelist** - Allow specific domains even if they match ad patterns
3. **Advanced Patterns** - User can add custom regex patterns
4. **Analytics** - Detailed statistics and charts
5. **Scheduled Updates** - Auto-update known ad domains list
6. **Backup to Cloud** - Optional cloud backup (with user consent)
7. **Category Blocking** - Block by ad category (social, tracking, etc.)

## Known Ad Patterns

The service includes detection for common ad servers:
- Google Ads (doubleclick.net, googlesyndication.com)
- Facebook Ads (facebook.com/tr, connect.facebook.net)
- Twitter Ads (ads.twitter.com)
- Amazon Ads (amazon-adsystem.com)
- And many more...

## Benefits

### For Users
1. **Control** - Choose exactly what to block
2. **Learning** - See what ads are being served
3. **Privacy** - Data stays on device
4. **Performance** - Faster browsing with blocked ads
5. **Transparency** - Know what's being blocked and why

### For App
1. **Differentiation** - Unique user-controlled approach
2. **Privacy-Focused** - No controversial always-on blocking
3. **User Engagement** - Users actively manage their experience
4. **Compliance** - Users make blocking decisions

## Testing

Test the ad blocker:

```typescript
// Test ad detection
const testUrls = [
  'https://doubleclick.net/ad',
  'https://example.com/page',
  'https://ads.example.com/banner'
];

for (const url of testUrls) {
  const result = await userAdBlockerService.checkUrl(url);
  console.log(`${url}: ${result.isAd ? 'AD' : 'NOT AD'}`);
}

// Test blocking
await userAdBlockerService.blockDomain('ads.example.com');
const isBlocked = userAdBlockerService.isDomainBlocked('ads.example.com');
console.log(`ads.example.com blocked: ${isBlocked}`);
```

## Summary

This enhanced ad blocker feature gives users complete control over their ad blocking experience while maintaining privacy and transparency. The integration with the proxy engine ensures network-level blocking, and the beautiful UI makes it easy for users to manage their block list.

The approach is unique in that:
1. **User decides** - Ads are shown first, then user can block
2. **Transparent** - User sees what's detected
3. **Private** - All data stays on device
4. **Flexible** - Easy to block/unblock as needed

This creates a better user experience than aggressive auto-blocking while still providing powerful ad blocking capabilities.


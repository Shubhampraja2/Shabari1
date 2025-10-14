package com.reactnativeproxyengine

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.VpnService
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.ReactPackage
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

/**
 * Production-ready Native Module Bridge for Shabari VPN Protection Engine
 * Provides comprehensive API for React Native integration
 */
class ShabariVpnModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext),
    LifecycleEventListener,
    ActivityEventListener {
    
    companion object {
        private const val TAG = "ShabariVpnModule"
        private const val MODULE_NAME = "ShabariVpn"
        
        // Event names
        private const val EVENT_STATUS_CHANGED = "ShabariVpnStatusChanged"
        private const val EVENT_BLOCKED = "ShabariVpnBlocked"
        private const val EVENT_WARNING = "ShabariVpnWarning"
        private const val EVENT_ERROR = "ShabariVpnError"
        private const val EVENT_STATISTICS = "ShabariVpnStatistics"
        private const val EVENT_CALL_BLOCKED = "ShabariCallBlocked"
        private const val EVENT_CALL_WARNING = "ShabariCallWarning"
        
        // Request codes
        private const val VPN_REQUEST_CODE = 1001
        private const val PERMISSION_REQUEST_CODE = 1002
        
        // Error codes
        private const val ERROR_VPN_PERMISSION_DENIED = "VPN_PERMISSION_DENIED"
        private const val ERROR_VPN_START_FAILED = "VPN_START_FAILED"
        private const val ERROR_VPN_ALREADY_RUNNING = "VPN_ALREADY_RUNNING"
        private const val ERROR_VPN_NOT_RUNNING = "VPN_NOT_RUNNING"
        private const val ERROR_MISSING_PERMISSIONS = "MISSING_PERMISSIONS"
        private const val ERROR_INVALID_CONFIG = "INVALID_CONFIG"
        private const val ERROR_FIREBASE_SYNC_FAILED = "FIREBASE_SYNC_FAILED"
    }
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var vpnPreparePromise: Promise? = null
    private var permissionPromise: Promise? = null
    private var statusReceiver: BroadcastReceiver? = null
    private var blockedReceiver: BroadcastReceiver? = null
    private var warningReceiver: BroadcastReceiver? = null
    private var callReceiver: BroadcastReceiver? = null
    
    // Cache for recent events to prevent duplicates
    private val recentEvents = ConcurrentHashMap<String, Long>()
    
    init {
        reactContext.addLifecycleEventListener(this)
        reactContext.addActivityEventListener(this)
        registerReceivers()
    }
    
    override fun getName(): String = MODULE_NAME
    
    override fun getConstants(): Map<String, Any> {
        return mapOf(
            "isAvailable" to true,
            "platform" to "android",
            "version" to "1.0.0",
            "events" to mapOf(
                "statusChanged" to EVENT_STATUS_CHANGED,
                "blocked" to EVENT_BLOCKED,
                "warning" to EVENT_WARNING,
                "error" to EVENT_ERROR,
                "statistics" to EVENT_STATISTICS,
                "callBlocked" to EVENT_CALL_BLOCKED,
                "callWarning" to EVENT_CALL_WARNING
            ),
            "errors" to mapOf(
                "vpnPermissionDenied" to ERROR_VPN_PERMISSION_DENIED,
                "vpnStartFailed" to ERROR_VPN_START_FAILED,
                "vpnAlreadyRunning" to ERROR_VPN_ALREADY_RUNNING,
                "vpnNotRunning" to ERROR_VPN_NOT_RUNNING,
                "missingPermissions" to ERROR_MISSING_PERMISSIONS,
                "invalidConfig" to ERROR_INVALID_CONFIG,
                "firebaseSyncFailed" to ERROR_FIREBASE_SYNC_FAILED
            )
        )
    }
    
    /**
     * Start VPN protection with optional configuration
     */
    @ReactMethod
    fun startProtection(config: ReadableMap?, promise: Promise) {
        scope.launch {
            try {
                // Check if VPN is already running
                if (ShabariVpnService.isServiceRunning()) {
                    promise.reject(ERROR_VPN_ALREADY_RUNNING, "VPN protection is already running")
                    return@launch
                }
                
                // Prepare VPN if needed
                val vpnIntent = VpnService.prepare(reactApplicationContext)
                if (vpnIntent != null) {
                    // Need user permission
                    vpnPreparePromise = promise
                    currentActivity?.startActivityForResult(vpnIntent, VPN_REQUEST_CODE)
                } else {
                    // Already have permission, start VPN
                    startVpnService(config)
                    promise.resolve(createSuccessResponse("VPN protection started"))
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start protection", e)
                promise.reject(ERROR_VPN_START_FAILED, "Failed to start VPN protection: ${e.message}", e)
            }
        }
    }
    
    /**
     * Stop VPN protection
     */
    @ReactMethod
    fun stopProtection(promise: Promise) {
        try {
            if (!ShabariVpnService.isServiceRunning()) {
                promise.reject(ERROR_VPN_NOT_RUNNING, "VPN protection is not running")
                return
            }
            
            val intent = Intent(reactApplicationContext, ShabariVpnService::class.java).apply {
                action = ShabariVpnService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            
            promise.resolve(createSuccessResponse("VPN protection stopped"))
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop protection", e)
            promise.reject(ERROR_VPN_START_FAILED, "Failed to stop VPN protection: ${e.message}", e)
        }
    }
    
    /**
     * Get current VPN status
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val status = if (ShabariVpnService.isServiceRunning()) {
                val vpnService = ShabariVpnService.getInstance()
                val stats = vpnService?.getStatistics() ?: emptyMap()
                
                Arguments.createMap().apply {
                    putString("status", "running")
                    putBoolean("isRunning", true)
                    putMap("statistics", convertMapToWritableMap(stats))
                }
            } else {
                Arguments.createMap().apply {
                    putString("status", "stopped")
                    putBoolean("isRunning", false)
                    putNull("statistics")
                }
            }
            
            promise.resolve(status)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get status", e)
            promise.reject("STATUS_ERROR", "Failed to get VPN status: ${e.message}", e)
        }
    }
    
    /**
     * Report a suspicious domain, IP, or phone number
     */
    @ReactMethod
    fun report(target: String, type: String, details: String?, promise: Promise) {
        scope.launch {
            try {
                val filterEngine = FilterEngine(reactApplicationContext)
                
                // Validate report type
                val validTypes = listOf("domain", "ip", "phone", "app", "other")
                if (type !in validTypes) {
                    promise.reject(ERROR_INVALID_CONFIG, "Invalid report type: $type")
                    return@launch
                }
                
                // Report to Firebase
                filterEngine.reportWarning(
                    target = target,
                    type = type,
                    message = details ?: "User reported suspicious activity"
                )
                
                promise.resolve(createSuccessResponse("Report submitted successfully"))
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to submit report", e)
                promise.reject("REPORT_ERROR", "Failed to submit report: ${e.message}", e)
            }
        }
    }
    
    /**
     * Update filter rules from Firebase
     */
    @ReactMethod
    fun updateFilters(promise: Promise) {
        scope.launch {
            try {
                val intent = Intent(reactApplicationContext, ShabariVpnService::class.java).apply {
                    action = ShabariVpnService.ACTION_UPDATE_FILTERS
                }
                reactApplicationContext.startService(intent)
                
                promise.resolve(createSuccessResponse("Filter update initiated"))
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update filters", e)
                promise.reject(ERROR_FIREBASE_SYNC_FAILED, "Failed to update filters: ${e.message}", e)
            }
        }
    }
    
    /**
     * Update filters with custom JSON feed (for testing)
     */
    @ReactMethod
    fun updateFiltersWithCustomFeed(feedData: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val filterEngine = FilterEngine(reactApplicationContext)
                
                // Parse domains from JSON feed
                val domains = feedData.getArray("domains")
                if (domains != null) {
                    for (i in 0 until domains.size()) {
                        val domainObj = domains.getMap(i)
                        val domain = domainObj?.getString("domain") ?: continue
                        val category = domainObj.getString("category") ?: "other"
                        val threatLevel = domainObj.getString("threat_level") ?: "medium"
                        val reason = domainObj.getString("reason") ?: "Custom feed entry"
                        
                        // Add to filter engine based on threat level
                        when (threatLevel) {
                            "critical", "high" -> filterEngine.addBlockedDomain(domain, reason)
                            "medium" -> filterEngine.addWarnDomain(domain, reason)
                            "low" -> filterEngine.addMonitorDomain(domain, reason)
                        }
                    }
                }
                
                // Parse IPs from JSON feed
                val ips = feedData.getArray("ips")
                if (ips != null) {
                    for (i in 0 until ips.size()) {
                        val ipObj = ips.getMap(i)
                        val ip = ipObj?.getString("ip") ?: continue
                        val category = ipObj.getString("category") ?: "other"
                        val threatLevel = ipObj.getString("threat_level") ?: "medium"
                        val reason = ipObj.getString("reason") ?: "Custom feed entry"
                        
                        when (threatLevel) {
                            "critical", "high" -> filterEngine.addBlockedIp(ip, reason)
                            "medium" -> filterEngine.addWarnIp(ip, reason)
                            "low" -> filterEngine.addMonitorIp(ip, reason)
                        }
                    }
                }
                
                // Parse phone numbers from JSON feed
                val phoneNumbers = feedData.getArray("phone_numbers")
                if (phoneNumbers != null) {
                    for (i in 0 until phoneNumbers.size()) {
                        val phoneObj = phoneNumbers.getMap(i)
                        val number = phoneObj?.getString("number") ?: continue
                        val category = phoneObj.getString("category") ?: "scam_call"
                        val threatLevel = phoneObj.getString("threat_level") ?: "medium"
                        val reason = phoneObj.getString("reason") ?: "Custom feed entry"
                        
                        when (threatLevel) {
                            "critical", "high" -> filterEngine.addBlockedPhoneNumber(number, reason)
                            "medium" -> filterEngine.addWarnPhoneNumber(number, reason)
                            "low" -> filterEngine.addMonitorPhoneNumber(number, reason)
                        }
                    }
                }
                
                // Parse Android packages from JSON feed
                val packages = feedData.getArray("android_packages")
                if (packages != null) {
                    for (i in 0 until packages.size()) {
                        val packageObj = packages.getMap(i)
                        val packageName = packageObj?.getString("package") ?: continue
                        val category = packageObj.getString("category") ?: "malware"
                        val threatLevel = packageObj.getString("threat_level") ?: "medium"
                        val reason = packageObj.getString("reason") ?: "Custom feed entry"
                        
                        when (threatLevel) {
                            "critical", "high" -> filterEngine.addBlockedApp(packageName, reason)
                            "medium" -> filterEngine.addWarnApp(packageName, reason)
                        }
                    }
                }
                
                // Apply the updated filters to running VPN service
                if (ShabariVpnService.isServiceRunning()) {
                    val intent = Intent(reactApplicationContext, ShabariVpnService::class.java).apply {
                        action = ShabariVpnService.ACTION_UPDATE_FILTERS
                    }
                    reactApplicationContext.startService(intent)
                }
                
                promise.resolve(createSuccessResponse("Custom feed applied successfully"))
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to apply custom feed", e)
                promise.reject("CUSTOM_FEED_ERROR", "Failed to apply custom feed: ${e.message}", e)
            }
        }
    }
    
    /**
     * Get protection statistics
     */
    @ReactMethod
    fun getStatistics(promise: Promise) {
        try {
            val vpnService = ShabariVpnService.getInstance()
            val stats = vpnService?.getStatistics() ?: emptyMap()
            
            promise.resolve(convertMapToWritableMap(stats))
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get statistics", e)
            promise.reject("STATS_ERROR", "Failed to get statistics: ${e.message}", e)
        }
    }
    
    /**
     * Check if a specific domain/IP/phone is blocked
     */
    @ReactMethod
    fun checkTarget(target: String, type: String, promise: Promise) {
        scope.launch {
            try {
                val filterEngine = FilterEngine(reactApplicationContext)
                
                val result = when (type) {
                    "domain" -> filterEngine.checkDomain(target)
                    "ip" -> filterEngine.checkIp(target)
                    "phone" -> filterEngine.checkPhoneNumber(target)
                    else -> {
                        promise.reject(ERROR_INVALID_CONFIG, "Invalid target type: $type")
                        return@launch
                    }
                }
                
                val response = Arguments.createMap().apply {
                    putString("target", target)
                    putString("type", type)
                    putString("result", result.name)
                    putBoolean("isBlocked", result == FilterEngine.FilterResult.BLOCK)
                    putBoolean("isWarning", result == FilterEngine.FilterResult.WARN)
                    putBoolean("isMonitored", result == FilterEngine.FilterResult.MONITOR)
                }
                
                promise.resolve(response)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to check target", e)
                promise.reject("CHECK_ERROR", "Failed to check target: ${e.message}", e)
            }
        }
    }
    
    /**
     * Request necessary permissions
     */
    @ReactMethod
    fun requestPermissions(promise: Promise) {
        try {
            val activity = currentActivity
            
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity")
                return
            }
            
            if (activity !is PermissionAwareActivity) {
                promise.reject("INVALID_ACTIVITY", "Activity doesn't support permissions")
                return
            }
            
            val permissions = arrayOf(
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.READ_CALL_LOG,
                android.Manifest.permission.CALL_PHONE,
                android.Manifest.permission.ANSWER_PHONE_CALLS
            )
            
            permissionPromise = promise
            
            activity.requestPermissions(
                permissions,
                PERMISSION_REQUEST_CODE,
                object : PermissionListener {
                    override fun onRequestPermissionsResult(
                        requestCode: Int,
                        permissions: Array<String>,
                        grantResults: IntArray
                    ): Boolean {
                        if (requestCode == PERMISSION_REQUEST_CODE) {
                            handlePermissionResult(permissions, grantResults)
                            return true
                        }
                        return false
                    }
                }
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request permissions", e)
            promise.reject("PERMISSION_ERROR", "Failed to request permissions: ${e.message}", e)
        }
    }
    
    /**
     * Configure protection settings
     */
    @ReactMethod
    fun configure(settings: ReadableMap, promise: Promise) {
        try {
            // Parse and validate settings
            val blockAds = settings.getBoolean("blockAds")
            val blockTrackers = settings.getBoolean("blockTrackers")
            val blockMalware = settings.getBoolean("blockMalware")
            val blockPhishing = settings.getBoolean("blockPhishing")
            val enableCallProtection = settings.getBoolean("enableCallProtection")
            val enableDnsOverHttps = settings.getBoolean("enableDnsOverHttps")
            
            // Store settings in SharedPreferences
            val prefs = reactApplicationContext.getSharedPreferences("shabari_settings", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("block_ads", blockAds)
                putBoolean("block_trackers", blockTrackers)
                putBoolean("block_malware", blockMalware)
                putBoolean("block_phishing", blockPhishing)
                putBoolean("enable_call_protection", enableCallProtection)
                putBoolean("enable_doh", enableDnsOverHttps)
                apply()
            }
            
            // Apply settings if VPN is running
            if (ShabariVpnService.isServiceRunning()) {
                val intent = Intent(reactApplicationContext, ShabariVpnService::class.java).apply {
                    action = ShabariVpnService.ACTION_UPDATE_FILTERS
                }
                reactApplicationContext.startService(intent)
            }
            
            promise.resolve(createSuccessResponse("Settings configured successfully"))
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to configure settings", e)
            promise.reject(ERROR_INVALID_CONFIG, "Failed to configure settings: ${e.message}", e)
        }
    }
    
    /**
     * Get current configuration
     */
    @ReactMethod
    fun getConfiguration(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("shabari_settings", Context.MODE_PRIVATE)
            
            val config = Arguments.createMap().apply {
                putBoolean("blockAds", prefs.getBoolean("block_ads", true))
                putBoolean("blockTrackers", prefs.getBoolean("block_trackers", true))
                putBoolean("blockMalware", prefs.getBoolean("block_malware", true))
                putBoolean("blockPhishing", prefs.getBoolean("block_phishing", true))
                putBoolean("enableCallProtection", prefs.getBoolean("enable_call_protection", true))
                putBoolean("enableDnsOverHttps", prefs.getBoolean("enable_doh", false))
            }
            
            promise.resolve(config)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get configuration", e)
            promise.reject("CONFIG_ERROR", "Failed to get configuration: ${e.message}", e)
        }
    }
    
    /**
     * Clear all cached data
     */
    @ReactMethod
    fun clearCache(promise: Promise) {
        scope.launch {
            try {
                // Clear DNS cache, filter cache, etc.
                val filterEngine = FilterEngine(reactApplicationContext)
                filterEngine.cleanup()
                
                // Clear SharedPreferences cache
                val prefs = reactApplicationContext.getSharedPreferences("shabari_filter_prefs", Context.MODE_PRIVATE)
                prefs.edit().clear().apply()
                
                promise.resolve(createSuccessResponse("Cache cleared successfully"))
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear cache", e)
                promise.reject("CACHE_ERROR", "Failed to clear cache: ${e.message}", e)
            }
        }
    }
    
    // Activity and Lifecycle handlers
    
    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        when (requestCode) {
            VPN_REQUEST_CODE -> {
                if (resultCode == Activity.RESULT_OK) {
                    // VPN permission granted
                    startVpnService(null)
                    vpnPreparePromise?.resolve(createSuccessResponse("VPN protection started"))
                } else {
                    // VPN permission denied
                    vpnPreparePromise?.reject(ERROR_VPN_PERMISSION_DENIED, "User denied VPN permission")
                }
                vpnPreparePromise = null
            }
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        // Handle new intents
    }
    
    override fun onHostResume() {
        // Re-register receivers if needed
        registerReceivers()
    }
    
    override fun onHostPause() {
        // Keep receivers registered
    }
    
    override fun onHostDestroy() {
        // Cleanup
        unregisterReceivers()
        scope.cancel()
    }
    
    // Private helper methods
    
    private fun startVpnService(config: ReadableMap?) {
        val intent = Intent(reactApplicationContext, ShabariVpnService::class.java).apply {
            action = ShabariVpnService.ACTION_START
            
            // Add configuration if provided
            config?.let {
                // Parse and add config to intent
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }
    
    private fun registerReceivers() {
        // Status change receiver
        if (statusReceiver == null) {
            statusReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val status = intent.getStringExtra("status") ?: return
                    val stats = intent.getSerializableExtra("statistics") as? HashMap<String, Any>
                    
                    sendEvent(EVENT_STATUS_CHANGED, Arguments.createMap().apply {
                        putString("status", status)
                        stats?.let { putMap("statistics", convertMapToWritableMap(it)) }
                    })
                }
            }
            reactApplicationContext.registerReceiver(
                statusReceiver,
                IntentFilter("com.shabari.vpn.STATUS")
            )
        }
        
        // Blocked event receiver
        if (blockedReceiver == null) {
            blockedReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val target = intent.getStringExtra("target") ?: return
                    val reason = intent.getStringExtra("reason") ?: ""
                    val type = intent.getStringExtra("type") ?: "unknown"
                    
                    // Prevent duplicate events
                    val eventKey = "blocked:$target:$type"
                    if (isDuplicateEvent(eventKey)) return
                    
                    sendEvent(EVENT_BLOCKED, Arguments.createMap().apply {
                        putString("target", target)
                        putString("reason", reason)
                        putString("type", type)
                        putBoolean("isProxyBlock", type.startsWith("proxy_"))
                        putBoolean("isVpnBlock", type == "packet")
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                    })
                }
            }
            reactApplicationContext.registerReceiver(
                blockedReceiver,
                IntentFilter("com.shabari.vpn.BLOCKED")
            )
        }
        
        // Warning event receiver
        if (warningReceiver == null) {
            warningReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val target = intent.getStringExtra("target") ?: return
                    val message = intent.getStringExtra("message") ?: ""
                    
                    sendEvent(EVENT_WARNING, Arguments.createMap().apply {
                        putString("target", target)
                        putString("message", message)
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                    })
                }
            }
            reactApplicationContext.registerReceiver(
                warningReceiver,
                IntentFilter("com.shabari.vpn.WARNING")
            )
        }
        
        // Call event receivers
        if (callReceiver == null) {
            callReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    when (intent.action) {
                        "com.shabari.CALL_BLOCKED" -> {
                            val phoneNumber = intent.getStringExtra("phone_number") ?: return
                            val fraudType = intent.getStringExtra("fraud_type")
                            val confidence = intent.getFloatExtra("confidence", 0f)
                            
                            sendEvent(EVENT_CALL_BLOCKED, Arguments.createMap().apply {
                                putString("phoneNumber", phoneNumber)
                                putString("fraudType", fraudType)
                                putDouble("confidence", confidence.toDouble())
                                putDouble("timestamp", System.currentTimeMillis().toDouble())
                            })
                        }
                        
                        "com.shabari.CALL_WARNING" -> {
                            val phoneNumber = intent.getStringExtra("phone_number") ?: return
                            val fraudType = intent.getStringExtra("fraud_type")
                            val confidence = intent.getFloatExtra("confidence", 0f)
                            
                            sendEvent(EVENT_CALL_WARNING, Arguments.createMap().apply {
                                putString("phoneNumber", phoneNumber)
                                putString("fraudType", fraudType)
                                putDouble("confidence", confidence.toDouble())
                                putDouble("timestamp", System.currentTimeMillis().toDouble())
                            })
                        }
                    }
                }
            }
            
            val callFilter = IntentFilter().apply {
                addAction("com.shabari.CALL_BLOCKED")
                addAction("com.shabari.CALL_WARNING")
            }
            reactApplicationContext.registerReceiver(callReceiver, callFilter)
        }
    }
    
    private fun unregisterReceivers() {
        statusReceiver?.let {
            try {
                reactApplicationContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // Already unregistered
            }
            statusReceiver = null
        }
        
        blockedReceiver?.let {
            try {
                reactApplicationContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // Already unregistered
            }
            blockedReceiver = null
        }
        
        warningReceiver?.let {
            try {
                reactApplicationContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // Already unregistered
            }
            warningReceiver = null
        }
        
        callReceiver?.let {
            try {
                reactApplicationContext.unregisterReceiver(it)
            } catch (e: Exception) {
                // Already unregistered
            }
            callReceiver = null
        }
    }
    
    private fun handlePermissionResult(permissions: Array<String>, grantResults: IntArray) {
        val results = Arguments.createMap()
        var allGranted = true
        
        permissions.forEachIndexed { index, permission ->
            val granted = grantResults[index] == android.content.pm.PackageManager.PERMISSION_GRANTED
            results.putBoolean(permission, granted)
            if (!granted) allGranted = false
        }
        
        val response = Arguments.createMap().apply {
            putBoolean("allGranted", allGranted)
            putMap("permissions", results)
        }
        
        if (allGranted) {
            permissionPromise?.resolve(response)
        } else {
            permissionPromise?.reject(ERROR_MISSING_PERMISSIONS, "Some permissions were denied")
        }
        
        permissionPromise = null
    }
    
    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send event: $eventName", e)
        }
    }
    
    private fun isDuplicateEvent(key: String): Boolean {
        val now = System.currentTimeMillis()
        val lastTime = recentEvents[key] ?: 0
        
        return if (now - lastTime < 1000) { // 1 second deduplication
            true
        } else {
            recentEvents[key] = now
            // Clean old entries
            if (recentEvents.size > 100) {
                recentEvents.entries.removeIf { now - it.value > 60000 }
            }
            false
        }
    }
    
    private fun createSuccessResponse(message: String): WritableMap {
        return Arguments.createMap().apply {
            putBoolean("success", true)
            putString("message", message)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
    }
    
    private fun convertMapToWritableMap(map: Map<String, Any>): WritableMap {
        val writableMap = Arguments.createMap()
        
        for ((key, value) in map) {
            when (value) {
                is String -> writableMap.putString(key, value)
                is Int -> writableMap.putInt(key, value)
                is Long -> writableMap.putDouble(key, value.toDouble())
                is Double -> writableMap.putDouble(key, value)
                is Float -> writableMap.putDouble(key, value.toDouble())
                is Boolean -> writableMap.putBoolean(key, value)
                is Map<*, *> -> {
                    @Suppress("UNCHECKED_CAST")
                    writableMap.putMap(key, convertMapToWritableMap(value as Map<String, Any>))
                }
                is List<*> -> {
                    writableMap.putArray(key, convertListToWritableArray(value))
                }
                else -> writableMap.putString(key, value.toString())
            }
        }
        
        return writableMap
    }
    
    private fun convertListToWritableArray(list: List<*>): WritableArray {
        val array = Arguments.createArray()
        
        for (item in list) {
            when (item) {
                is String -> array.pushString(item)
                is Int -> array.pushInt(item)
                is Long -> array.pushDouble(item.toDouble())
                is Double -> array.pushDouble(item)
                is Float -> array.pushDouble(item.toDouble())
                is Boolean -> array.pushBoolean(item)
                is Map<*, *> -> {
                    @Suppress("UNCHECKED_CAST")
                    array.pushMap(convertMapToWritableMap(item as Map<String, Any>))
                }
                is List<*> -> array.pushArray(convertListToWritableArray(item))
                else -> array.pushString(item.toString())
            }
        }
        
        return array
    }
}

/**
 * Package for registering the module
 */
class ShabariVpnPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ShabariVpnModule(reactContext))
    }
    
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}

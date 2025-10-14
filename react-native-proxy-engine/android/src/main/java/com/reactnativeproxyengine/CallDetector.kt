package com.reactnativeproxyengine

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.Executors

/**
 * Production-ready Call Detector for fraud call detection and blocking
 * Integrates with Android Telephony APIs for real-time call screening
 */
class CallDetector(
    private val context: Context,
    private val filterEngine: FilterEngine
) {
    
    // Add Supabase phone service
    private val supabasePhoneService = SupabasePhoneService(context)
    
    companion object {
        private const val TAG = "CallDetector"
        
        // Permissions required
        val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.ANSWER_PHONE_CALLS
        )
        
        // Call blocking actions
        const val ACTION_BLOCK = "block"
        const val ACTION_SILENCE = "silence"
        const val ACTION_WARN = "warn"
        const val ACTION_ALLOW = "allow"
        
        // Fraud confidence levels
        const val CONFIDENCE_HIGH = 0.8f
        const val CONFIDENCE_MEDIUM = 0.5f
        const val CONFIDENCE_LOW = 0.3f
    }
    
    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var telephonyCallback: Any? = null // TelephonyCallback for Android 12+
    private var callReceiver: BroadcastReceiver? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Statistics
    private val totalCallsChecked = AtomicLong(0)
    private val fraudCallsBlocked = AtomicLong(0)
    private val fraudCallsWarned = AtomicLong(0)
    
    // Recent call cache for quick lookup
    private val recentCallCache = ConcurrentHashMap<String, CallAnalysis>()
    
    // Call analysis results
    data class CallAnalysis(
        val phoneNumber: String,
        val isFraud: Boolean,
        val fraudType: String?,
        val confidence: Float,
        val action: String,
        val timestamp: Long = System.currentTimeMillis(),
        val metadata: Map<String, Any> = emptyMap()
    )
    
    // Fraud patterns
    private val fraudPatterns = FraudPatternMatcher()
    
    fun start() {
        if (!checkPermissions()) {
            Log.w(TAG, "Missing required permissions for call detection")
            return
        }
        
        try {
            telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            
            // Register phone state listener based on Android version
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                registerTelephonyCallback()
            } else {
                registerPhoneStateListener()
            }
            
            // Register broadcast receiver for incoming calls
            registerCallReceiver()
            
            // Initialize fraud number database
            updateFraudNumbers()
            
            Log.i(TAG, "Call detector started successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start call detector", e)
        }
    }
    
    fun stop() {
        try {
            // Unregister listeners
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                unregisterTelephonyCallback()
            } else {
                unregisterPhoneStateListener()
            }
            
            // Unregister broadcast receiver
            callReceiver?.let {
                context.unregisterReceiver(it)
                callReceiver = null
            }
            
            // Cancel coroutines
            scope.cancel()
            
            Log.i(TAG, "Call detector stopped")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping call detector", e)
        }
    }
    
    private fun checkPermissions(): Boolean {
        return REQUIRED_PERMISSIONS.all { permission ->
            ActivityCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    @RequiresApi(Build.VERSION_CODES.S)
    private fun registerTelephonyCallback() {
        telephonyCallback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                handleCallStateChange(state)
            }
        }
        
        val executor = Executors.newSingleThreadExecutor()
        telephonyManager?.registerTelephonyCallback(executor, telephonyCallback as TelephonyCallback)
    }
    
    private fun registerPhoneStateListener() {
        phoneStateListener = object : PhoneStateListener() {
            @Deprecated("Deprecated in API 31")
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                handleCallStateChange(state, phoneNumber)
            }
        }
        
        telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
    }
    
    @RequiresApi(Build.VERSION_CODES.S)
    private fun unregisterTelephonyCallback() {
        telephonyCallback?.let {
            telephonyManager?.unregisterTelephonyCallback(it as TelephonyCallback)
            telephonyCallback = null
        }
    }
    
    private fun unregisterPhoneStateListener() {
        phoneStateListener?.let {
            telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
            phoneStateListener = null
        }
    }
    
    private fun registerCallReceiver() {
        callReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    TelephonyManager.ACTION_PHONE_STATE_CHANGED -> {
                        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
                        val phoneNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
                        
                        if (state == TelephonyManager.EXTRA_STATE_RINGING && phoneNumber != null) {
                            handleIncomingCall(phoneNumber)
                        }
                    }
                }
            }
        }
        
        val filter = IntentFilter().apply {
            addAction(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
        }
        
        context.registerReceiver(callReceiver, filter)
    }
    
    private fun handleCallStateChange(state: Int, phoneNumber: String? = null) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                phoneNumber?.let { handleIncomingCall(it) }
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                // Call answered or outgoing call
                Log.d(TAG, "Call active")
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                // Call ended or no call
                Log.d(TAG, "Call ended")
            }
        }
    }
    
    private fun handleIncomingCall(phoneNumber: String) {
        scope.launch {
            try {
                totalCallsChecked.incrementAndGet()
                
                Log.i(TAG, "Checking incoming call from: ${maskPhoneNumber(phoneNumber)}")
                
                // Check cache first
                val cachedAnalysis = recentCallCache[phoneNumber]
                if (cachedAnalysis != null && isRecentAnalysis(cachedAnalysis)) {
                    processCallAnalysis(cachedAnalysis)
                    return@launch
                }
                
                // Analyze the phone number
                val analysis = analyzePhoneNumber(phoneNumber)
                
                // Cache the result
                recentCallCache[phoneNumber] = analysis
                
                // Process the analysis result
                processCallAnalysis(analysis)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling incoming call", e)
            }
        }
    }
    
    private suspend fun analyzePhoneNumber(phoneNumber: String): CallAnalysis {
        return withContext(Dispatchers.IO) {
            // Check with Supabase phone service (primary)
            val supabaseResult = supabasePhoneService.checkPhoneNumber(phoneNumber)
            val supabaseReputation = supabasePhoneService.getPhoneReputation(phoneNumber)
            
            // Check with filter engine (fallback)
            val filterResult = filterEngine.checkPhoneNumber(phoneNumber)
            
            // Perform additional fraud checks
            val fraudCheck = fraudPatterns.checkNumber(phoneNumber)
            
            // Calculate confidence score (enhanced with Supabase data)
            val confidence = calculateEnhancedConfidence(
                supabaseResult, supabaseReputation, filterResult, fraudCheck
            )
            
            // Determine action (prioritize Supabase data)
            val action = when {
                supabaseResult == SupabasePhoneService.PhoneResult.BLOCK -> ACTION_BLOCK
                supabaseResult == SupabasePhoneService.PhoneResult.WARN -> ACTION_WARN
                filterResult == FilterEngine.FilterResult.BLOCK -> ACTION_BLOCK
                filterResult == FilterEngine.FilterResult.WARN -> ACTION_WARN
                fraudCheck.isSuspicious && confidence >= CONFIDENCE_HIGH -> ACTION_BLOCK
                fraudCheck.isSuspicious && confidence >= CONFIDENCE_MEDIUM -> ACTION_SILENCE
                fraudCheck.isSuspicious && confidence >= CONFIDENCE_LOW -> ACTION_WARN
                supabaseResult == SupabasePhoneService.PhoneResult.MONITOR -> ACTION_WARN
                else -> ACTION_ALLOW
            }
            
            // Determine fraud type (enhanced)
            val fraudType = when {
                supabaseReputation?.category == "fraud" -> "database_fraud"
                supabaseReputation?.category == "spam" -> "database_spam"
                supabaseReputation?.category == "telemarketer" -> "telemarketer"
                fraudCheck.fraudType != null -> fraudCheck.fraudType
                else -> "unknown"
            }
            
            // Build analysis result with enhanced metadata
            CallAnalysis(
                phoneNumber = phoneNumber,
                isFraud = action != ACTION_ALLOW,
                fraudType = fraudType,
                confidence = confidence,
                action = action,
                metadata = mapOf(
                    "supabase_result" to supabaseResult.name,
                    "supabase_score" to (supabaseReputation?.reputationScore ?: -1),
                    "supabase_reports" to (supabaseReputation?.totalReports ?: 0),
                    "caller_name" to (supabaseReputation?.callerName ?: "unknown"),
                    "is_verified_business" to (supabaseReputation?.isVerifiedBusiness ?: false),
                    "filter_result" to filterResult.name,
                    "fraud_indicators" to fraudCheck.indicators,
                    "country_code" to extractCountryCode(phoneNumber),
                    "is_premium_rate" to isPremiumRate(phoneNumber),
                    "is_international" to isInternational(phoneNumber)
                )
            )
        }
    }
    
    private fun processCallAnalysis(analysis: CallAnalysis) {
        when (analysis.action) {
            ACTION_BLOCK -> {
                fraudCallsBlocked.incrementAndGet()
                blockCall(analysis.phoneNumber)
                notifyUserOfBlockedCall(analysis)
                reportFraudCall(analysis)
            }
            
            ACTION_SILENCE -> {
                fraudCallsWarned.incrementAndGet()
                silenceCall(analysis.phoneNumber)
                notifyUserOfSuspiciousCall(analysis)
            }
            
            ACTION_WARN -> {
                fraudCallsWarned.incrementAndGet()
                notifyUserOfSuspiciousCall(analysis)
            }
            
            ACTION_ALLOW -> {
                // Normal call, no action needed
                Log.d(TAG, "Call allowed: ${maskPhoneNumber(analysis.phoneNumber)}")
            }
        }
    }
    
    private fun blockCall(phoneNumber: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // Use TelecomManager to end call on Android 9+
                val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) 
                    == PackageManager.PERMISSION_GRANTED) {
                    telecomManager.endCall()
                    Log.i(TAG, "Blocked call from: ${maskPhoneNumber(phoneNumber)}")
                }
            } else {
                // For older versions, use reflection (less reliable)
                endCallUsingReflection()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to block call", e)
        }
    }
    
    private fun silenceCall(phoneNumber: String) {
        try {
            // Silence the ringer
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val previousMode = audioManager.ringerMode
            audioManager.ringerMode = android.media.AudioManager.RINGER_MODE_SILENT
            
            // Restore ringer mode after a delay
            scope.launch {
                delay(5000) // 5 seconds
                audioManager.ringerMode = previousMode
            }
            
            Log.i(TAG, "Silenced call from: ${maskPhoneNumber(phoneNumber)}")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to silence call", e)
        }
    }
    
    @Suppress("DEPRECATION")
    private fun endCallUsingReflection() {
        try {
            val telephonyClass = Class.forName(telephonyManager?.javaClass?.name ?: return)
            val method = telephonyClass.getDeclaredMethod("getITelephony")
            method.isAccessible = true
            val telephonyInterface = method.invoke(telephonyManager)
            val endCallMethod = telephonyInterface?.javaClass?.getDeclaredMethod("endCall")
            endCallMethod?.invoke(telephonyInterface)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to end call using reflection", e)
        }
    }
    
    private fun notifyUserOfBlockedCall(analysis: CallAnalysis) {
        val intent = Intent("com.shabari.CALL_BLOCKED").apply {
            putExtra("phone_number", maskPhoneNumber(analysis.phoneNumber))
            putExtra("fraud_type", analysis.fraudType)
            putExtra("confidence", analysis.confidence)
            putExtra("timestamp", System.currentTimeMillis())
        }
        context.sendBroadcast(intent)
        
        // Also show notification
        showNotification(
            title = "Fraud Call Blocked",
            message = "Blocked suspicious call from ${maskPhoneNumber(analysis.phoneNumber)}",
            analysis = analysis
        )
    }
    
    private fun notifyUserOfSuspiciousCall(analysis: CallAnalysis) {
        val intent = Intent("com.shabari.CALL_WARNING").apply {
            putExtra("phone_number", maskPhoneNumber(analysis.phoneNumber))
            putExtra("fraud_type", analysis.fraudType)
            putExtra("confidence", analysis.confidence)
            putExtra("timestamp", System.currentTimeMillis())
        }
        context.sendBroadcast(intent)
        
        // Show warning notification
        showNotification(
            title = "Suspicious Call",
            message = "Possible fraud call from ${maskPhoneNumber(analysis.phoneNumber)}",
            analysis = analysis
        )
    }
    
    private fun showNotification(title: String, message: String, analysis: CallAnalysis) {
        try {
            // Send notification data to React Native for display
            val notificationData = mapOf(
                "type" to "call_notification",
                "title" to title,
                "message" to message,
                "phoneNumber" to analysis.phoneNumber,
                "maskedNumber" to maskPhoneNumber(analysis.phoneNumber),
                "fraudType" to analysis.fraudType,
                "confidence" to analysis.confidence,
                "timestamp" to System.currentTimeMillis(),
                "action" to analysis.action,
                "showReportAction" to shouldShowReportAction(analysis),
                "callerName" to (analysis.metadata["caller_name"] as? String ?: "Unknown"),
                "isVerifiedBusiness" to (analysis.metadata["is_verified_business"] as? Boolean ?: false)
            )
            
            // Send to React Native via broadcast
            val intent = Intent("com.shabari.CALL_NOTIFICATION").apply {
                putExtra("notification_data", notificationData.toString())
                putExtra("phone_number", analysis.phoneNumber)
                putExtra("action_type", analysis.action)
                putExtra("show_report", shouldShowReportAction(analysis))
            }
            context.sendBroadcast(intent)
            
            Log.i(TAG, "Call notification sent: $title - ${maskPhoneNumber(analysis.phoneNumber)}")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error showing call notification", e)
        }
    }
    
    private fun shouldShowReportAction(analysis: CallAnalysis): Boolean {
        // Show report action for:
        // 1. Calls that were allowed (not already blocked)
        // 2. Calls with low-medium confidence (might be false positives/negatives)
        // 3. Unknown numbers without existing reputation
        return when (analysis.action) {
            ACTION_ALLOW -> true // Always allow reporting of allowed calls
            ACTION_WARN -> true  // Suspicious calls might need user feedback
            ACTION_SILENCE -> true // User might want to upgrade to block
            ACTION_BLOCK -> false // Already blocked, no need to report
            else -> true
        }
    }
    
    private fun reportFraudCall(analysis: CallAnalysis) {
        scope.launch {
            try {
                // Report to Supabase (primary)
                val supabaseSuccess = supabasePhoneService.reportPhoneNumber(
                    phoneNumber = analysis.phoneNumber,
                    category = when (analysis.fraudType) {
                        "database_fraud", "known_fraud_prefix", "pattern_match" -> "fraud"
                        "database_spam" -> "spam"
                        "telemarketer" -> "telemarketer"
                        else -> "spam"
                    },
                    reason = "Automatically detected: ${analysis.fraudType}",
                    deviceId = getDeviceId()
                )
                
                // Also report to FilterEngine (fallback)
                filterEngine.reportBlocked(
                    target = analysis.phoneNumber,
                    type = "phone_call",
                    reason = "Fraud call detected: ${analysis.fraudType}"
                )
                
                Log.d(TAG, "Fraud call reported - Supabase: $supabaseSuccess, FilterEngine: completed")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to report fraud call", e)
            }
        }
    }
    
    private fun getDeviceId(): String {
        val prefs = context.getSharedPreferences("shabari_call_detector", Context.MODE_PRIVATE)
        var deviceId = prefs.getString("device_id", null)
        if (deviceId == null) {
            deviceId = java.util.UUID.randomUUID().toString()
            prefs.edit().putString("device_id", deviceId).apply()
        }
        return deviceId
    }
    
    private fun calculateConfidence(
        filterResult: FilterEngine.FilterResult,
        fraudCheck: FraudPatternMatcher.FraudCheck
    ): Float {
        var confidence = 0f
        
        // Weight based on filter result
        confidence += when (filterResult) {
            FilterEngine.FilterResult.BLOCK -> 0.5f
            FilterEngine.FilterResult.WARN -> 0.3f
            FilterEngine.FilterResult.MONITOR -> 0.1f
            FilterEngine.FilterResult.ALLOW -> 0f
        }
        
        // Weight based on fraud indicators
        confidence += fraudCheck.indicators.size * 0.1f
        
        // Weight based on fraud pattern confidence
        confidence += fraudCheck.confidence * 0.3f
        
        return minOf(confidence, 1.0f)
    }
    
    private fun calculateEnhancedConfidence(
        supabaseResult: SupabasePhoneService.PhoneResult,
        supabaseReputation: SupabasePhoneService.PhoneReputation?,
        filterResult: FilterEngine.FilterResult,
        fraudCheck: FraudPatternMatcher.FraudCheck
    ): Float {
        var confidence = 0f
        
        // Primary: Supabase reputation score (highest weight)
        if (supabaseReputation != null) {
            val reputationScore = supabaseReputation.reputationScore
            val reportCount = supabaseReputation.totalReports
            
            // Convert reputation score to confidence (inverse relationship)
            confidence += (100 - reputationScore) / 100.0f * 0.6f
            
            // Boost confidence if many reports
            if (reportCount >= 10) confidence += 0.2f
            else if (reportCount >= 5) confidence += 0.1f
        }
        
        // Secondary: Supabase result
        confidence += when (supabaseResult) {
            SupabasePhoneService.PhoneResult.BLOCK -> 0.3f
            SupabasePhoneService.PhoneResult.WARN -> 0.2f
            SupabasePhoneService.PhoneResult.MONITOR -> 0.1f
            SupabasePhoneService.PhoneResult.ALLOW -> 0f
        }
        
        // Tertiary: Filter engine result
        confidence += when (filterResult) {
            FilterEngine.FilterResult.BLOCK -> 0.2f
            FilterEngine.FilterResult.WARN -> 0.15f
            FilterEngine.FilterResult.MONITOR -> 0.05f
            FilterEngine.FilterResult.ALLOW -> 0f
        }
        
        // Quaternary: Pattern matching
        confidence += fraudCheck.indicators.size * 0.05f
        confidence += fraudCheck.confidence * 0.1f
        
        return minOf(confidence, 1.0f)
    }
    
    private fun isRecentAnalysis(analysis: CallAnalysis): Boolean {
        val ageMs = System.currentTimeMillis() - analysis.timestamp
        return ageMs < 300000 // 5 minutes
    }
    
    private fun maskPhoneNumber(phoneNumber: String): String {
        return if (phoneNumber.length > 6) {
            "${phoneNumber.substring(0, 3)}****${phoneNumber.substring(phoneNumber.length - 3)}"
        } else {
            "****"
        }
    }
    
    private fun extractCountryCode(phoneNumber: String): String {
        return when {
            phoneNumber.startsWith("+1") -> "US"
            phoneNumber.startsWith("+44") -> "UK"
            phoneNumber.startsWith("+91") -> "IN"
            phoneNumber.startsWith("+86") -> "CN"
            phoneNumber.startsWith("+234") -> "NG"
            else -> "UNKNOWN"
        }
    }
    
    private fun isPremiumRate(phoneNumber: String): Boolean {
        val premiumPrefixes = listOf(
            "1-900", "1-976", // US premium
            "0900", "0901",   // Various countries
            "+44-90",         // UK premium
            "+91-900"         // India premium
        )
        
        return premiumPrefixes.any { phoneNumber.startsWith(it) }
    }
    
    private fun isInternational(phoneNumber: String): Boolean {
        return phoneNumber.startsWith("+") && !phoneNumber.startsWith("+1") // Assuming US as home country
    }
    
    fun updateFraudNumbers() {
        scope.launch {
            try {
                // This would sync with Firestore
                // For now, using local patterns
                fraudPatterns.updatePatterns()
                
                Log.i(TAG, "Fraud numbers updated")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update fraud numbers", e)
            }
        }
    }
    
    fun getStatistics(): Map<String, Any> {
        return mapOf(
            "total_calls_checked" to totalCallsChecked.get(),
            "fraud_calls_blocked" to fraudCallsBlocked.get(),
            "fraud_calls_warned" to fraudCallsWarned.get(),
            "cache_size" to recentCallCache.size
        )
    }
    
    /**
     * Inner class for fraud pattern matching
     */
    private class FraudPatternMatcher {
        
        data class FraudCheck(
            val isSuspicious: Boolean,
            val fraudType: String?,
            val indicators: List<String>,
            val confidence: Float
        )
        
        private val knownFraudPrefixes = mutableSetOf<String>()
        private val fraudPatterns = mutableListOf<Regex>()
        
        init {
            loadDefaultPatterns()
        }
        
        private fun loadDefaultPatterns() {
            // Known fraud prefixes
            knownFraudPrefixes.addAll(listOf(
                "+234", // Nigerian scams
                "+91-900", // Indian tech support scams
                "1-900", // US premium rate
                "+44-70", // UK personal numbering (often misused)
                "+86-400" // Chinese fraud calls
            ))
            
            // Fraud patterns
            fraudPatterns.addAll(listOf(
                Regex("^\\+\\d{1,3}9{5,}.*"), // Multiple 9s (premium rate indicator)
                Regex("^\\+\\d{1,3}0{5,}.*"), // Multiple 0s (suspicious)
                Regex("^\\+\\d{15,}$"), // Very long numbers
                Regex("^[^+]\\d{3,4}$") // Short codes without country code
            ))
        }
        
        fun checkNumber(phoneNumber: String): FraudCheck {
            val indicators = mutableListOf<String>()
            var fraudType: String? = null
            
            // Check known fraud prefixes
            for (prefix in knownFraudPrefixes) {
                if (phoneNumber.startsWith(prefix)) {
                    indicators.add("Known fraud prefix: $prefix")
                    fraudType = "known_fraud_prefix"
                    break
                }
            }
            
            // Check fraud patterns
            for (pattern in fraudPatterns) {
                if (pattern.matches(phoneNumber)) {
                    indicators.add("Matches fraud pattern")
                    if (fraudType == null) {
                        fraudType = "pattern_match"
                    }
                }
            }
            
            // Check for spoofed local numbers
            if (phoneNumber.length == 10 && phoneNumber.startsWith("555")) {
                indicators.add("Possible spoofed number")
                fraudType = "spoofed"
            }
            
            // Check for neighbor spoofing
            if (isNeighborSpoofing(phoneNumber)) {
                indicators.add("Neighbor spoofing detected")
                fraudType = "neighbor_spoofing"
            }
            
            // Calculate confidence
            val confidence = when (indicators.size) {
                0 -> 0f
                1 -> 0.3f
                2 -> 0.6f
                else -> 0.9f
            }
            
            return FraudCheck(
                isSuspicious = indicators.isNotEmpty(),
                fraudType = fraudType,
                indicators = indicators,
                confidence = confidence
            )
        }
        
        private fun isNeighborSpoofing(phoneNumber: String): Boolean {
            // Check if the number is suspiciously similar to local numbers
            // This would need access to the user's phone number for comparison
            // Simplified implementation
            return false
        }
        
        fun updatePatterns() {
            // This would sync with Firebase to get latest patterns
            // For now, just reload defaults
            knownFraudPrefixes.clear()
            fraudPatterns.clear()
            loadDefaultPatterns()
        }
    }
}

/**
 * Call Screening Service for Android 10+ 
 * Provides system-level call screening capabilities
 */
@RequiresApi(Build.VERSION_CODES.Q)
class ShabariCallScreeningService : CallScreeningService() {
    
    private lateinit var filterEngine: FilterEngine
    
    override fun onCreate() {
        super.onCreate()
        filterEngine = FilterEngine(applicationContext)
    }
    
    override fun onScreenCall(callDetails: Call.Details) {
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: return
        
        // Check if the number is fraudulent
        val result = filterEngine.checkPhoneNumber(phoneNumber)
        
        val response = when (result) {
            FilterEngine.FilterResult.BLOCK -> {
                // Block the call
                CallResponse.Builder()
                    .setDisallowCall(true)
                    .setRejectCall(true)
                    .setSkipCallLog(false)
                    .setSkipNotification(true)
                    .build()
            }
            
            FilterEngine.FilterResult.WARN -> {
                // Silence the call but allow it
                CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .setSilenceCall(true)
                    .setSkipCallLog(false)
                    .setSkipNotification(false)
                    .build()
            }
            
            else -> {
                // Allow the call normally
                CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .build()
            }
        }
        
        respondToCall(callDetails, response)
    }
}

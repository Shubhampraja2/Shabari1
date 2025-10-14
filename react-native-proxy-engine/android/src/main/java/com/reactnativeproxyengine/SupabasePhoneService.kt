package com.reactnativeproxyengine

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.util.Base64

/**
 * Supabase Phone Service
 * Handles phone number reputation checking using Supabase REST API
 */
class SupabasePhoneService(private val context: Context) {
    
    companion object {
        private const val TAG = "SupabasePhoneService"
        private const val PREFS_NAME = "supabase_phone_prefs"
        private const val KEY_LAST_SYNC = "last_sync_timestamp"
        private const val SYNC_INTERVAL = 1800000L // 30 minutes
        
        // Supabase configuration - these should be loaded from environment or config
        private const val SUPABASE_URL = "https://your-project.supabase.co"
        private const val SUPABASE_ANON_KEY = "your-anon-key"

        // Reputation score thresholds
        private const val SCORE_BLOCK_THRESHOLD = 30
        private const val SCORE_WARN_THRESHOLD = 50
        private const val SCORE_MONITOR_THRESHOLD = 70

        // Rate limiting
        private const val MAX_REQUESTS_PER_MINUTE = 60
        private const val MAX_REQUESTS_PER_HOUR = 1000
    }
    
    enum class PhoneResult {
        BLOCK,    // Block the call
        WARN,     // Show warning
        MONITOR,  // Monitor but allow
        ALLOW     // Allow normally
    }
    
    data class PhoneReputation(
        val number: String,
        val reputationScore: Int,
        val spamReports: Int,
        val fraudReports: Int,
        val totalReports: Int,
        val category: String,
        val isVerifiedBusiness: Boolean,
        val callerName: String?
    )
    
    // Get credentials from BuildConfig (injected at build time)
    private var supabaseUrl: String = ""
    private var supabaseAnonKey: String = ""

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Certificate pinning for Supabase (security enhancement)
    private val certificatePinner = CertificatePinner.Builder()
        .add("*.supabase.co", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") // TODO: Add actual cert hash
        .build()

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .certificatePinner(certificatePinner)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Local cache for phone reputations
    private val phoneCache = ConcurrentHashMap<String, PhoneReputation>()
    private val cacheTimestamps = ConcurrentHashMap<String, Long>()
    private val cacheExpiryTime = 3600000L // 1 hour

    // Statistics
    private val totalChecks = AtomicLong(0)
    private val cacheHits = AtomicLong(0)
    private val apiCalls = AtomicLong(0)

    // Rate limiting
    private val requestTimestamps = mutableListOf<Long>()

    init {
        // Load credentials from Android resources (secure method)
        val resources = context.resources
        val packageName = context.packageName

        // Try to get from BuildConfig first (best practice)
        try {
            val buildConfigClass = Class.forName("$packageName.BuildConfig")
            supabaseUrl = buildConfigClass.getField("SUPABASE_URL").get(null) as? String
                ?: getFromResources(resources, "supabase_url", packageName)
            supabaseAnonKey = buildConfigClass.getField("SUPABASE_ANON_KEY").get(null) as? String
                ?: getFromResources(resources, "supabase_anon_key", packageName)
        } catch (e: Exception) {
            Log.w(TAG, "BuildConfig not available, falling back to resources", e)
            supabaseUrl = getFromResources(resources, "supabase_url", packageName)
            supabaseAnonKey = getFromResources(resources, "supabase_anon_key", packageName)
        }

        startPeriodicCacheCleanup()
    }

    private fun getFromResources(resources: android.content.res.Resources, key: String, packageName: String): String {
        val id = resources.getIdentifier(key, "string", packageName)
        return if (id != 0) resources.getString(id) else ""
    }

    /**
     * Rate limiting check to prevent abuse
     */
    private fun checkRateLimit(): Boolean {
        val now = System.currentTimeMillis()
        synchronized(requestTimestamps) {
            // Remove timestamps older than 1 hour
            requestTimestamps.removeAll { now - it > 3600000L }

            // Check per-minute limit
            val lastMinute = requestTimestamps.count { now - it < 60000L }
            if (lastMinute >= MAX_REQUESTS_PER_MINUTE) {
                Log.w(TAG, "Rate limit exceeded: $lastMinute requests in last minute")
                return false
            }

            // Check per-hour limit
            if (requestTimestamps.size >= MAX_REQUESTS_PER_HOUR) {
                Log.w(TAG, "Rate limit exceeded: ${requestTimestamps.size} requests in last hour")
                return false
            }

            // Add current timestamp
            requestTimestamps.add(now)
            return true
        }
    }
    
    /**
     * Check phone number reputation with input validation and rate limiting
     */
    suspend fun checkPhoneNumber(phoneNumber: String): PhoneResult {
        return withContext(Dispatchers.IO) {
            try {
                totalChecks.incrementAndGet()

                // Input validation
                if (phoneNumber.isBlank() || phoneNumber.length < 6 || phoneNumber.length > 20) {
                    Log.w(TAG, "Invalid phone number format")
                    return@withContext PhoneResult.ALLOW
                }

                // Rate limiting check
                if (!checkRateLimit()) {
                    Log.w(TAG, "Rate limit exceeded, allowing by default")
                    return@withContext PhoneResult.ALLOW
                }

                val cleanNumber = cleanPhoneNumber(phoneNumber)
                Log.d(TAG, "Checking phone number: ${maskPhoneNumber(cleanNumber)}")

                // Check cache first
                val cachedReputation = getCachedReputation(cleanNumber)
                if (cachedReputation != null) {
                    cacheHits.incrementAndGet()
                    Log.d(TAG, "Cache hit for ${maskPhoneNumber(cleanNumber)}")
                    return@withContext determineResult(cachedReputation)
                }

                // Fetch from Supabase
                val reputation = fetchPhoneReputation(cleanNumber)
                if (reputation != null) {
                    // Cache the result
                    phoneCache[cleanNumber] = reputation
                    cacheTimestamps[cleanNumber] = System.currentTimeMillis()

                    Log.d(TAG, "Fetched reputation for ${maskPhoneNumber(cleanNumber)}: score=${reputation.reputationScore}")
                    return@withContext determineResult(reputation)
                }

                // No reputation data found
                Log.d(TAG, "No reputation data found for ${maskPhoneNumber(cleanNumber)}")
                PhoneResult.ALLOW

            } catch (e: Exception) {
                Log.e(TAG, "Error checking phone number", e)
                PhoneResult.ALLOW // Allow on error to avoid blocking legitimate calls
            }
        }
    }
    
    /**
     * Report a phone number (used by automatic detection)
     */
    suspend fun reportPhoneNumber(
        phoneNumber: String,
        category: String,
        reason: String,
        deviceId: String
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val cleanNumber = cleanPhoneNumber(phoneNumber)
                Log.d(TAG, "Reporting phone number: ${maskPhoneNumber(cleanNumber)}")
                
                val reportData = JSONObject().apply {
                    put("phone_number", cleanNumber)
                    put("category", category)
                    put("description", reason)
                    put("device_info", JSONObject().apply {
                        put("device_id", deviceId)
                        put("platform", "android")
                        put("automatic", true)
                    })
                    put("created_at", getCurrentTimestamp())
                }
                
                val success = makeSupabaseRequest(
                    endpoint = "phone_reports",
                    method = "POST",
                    data = reportData
                )
                
                if (success) {
                    Log.d(TAG, "Successfully reported ${maskPhoneNumber(cleanNumber)}")
                    // Invalidate cache for this number
                    phoneCache.remove(cleanNumber)
                    cacheTimestamps.remove(cleanNumber)
                } else {
                    Log.w(TAG, "Failed to report ${maskPhoneNumber(cleanNumber)}")
                }
                
                success
                
            } catch (e: Exception) {
                Log.e(TAG, "Error reporting phone number", e)
                false
            }
        }
    }
    
    /**
     * Get phone reputation details
     */
    suspend fun getPhoneReputation(phoneNumber: String): PhoneReputation? {
        return withContext(Dispatchers.IO) {
            try {
                val cleanNumber = cleanPhoneNumber(phoneNumber)
                
                // Check cache first
                getCachedReputation(cleanNumber) ?: fetchPhoneReputation(cleanNumber)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error getting phone reputation", e)
                null
            }
        }
    }
    
    /**
     * Sync phone reputation data from Supabase
     */
    suspend fun syncReputationData(): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val lastSync = prefs.getLong(KEY_LAST_SYNC, 0)
                val now = System.currentTimeMillis()
                
                if (now - lastSync < SYNC_INTERVAL) {
                    Log.d(TAG, "Skipping sync, last sync was recent")
                    return@withContext true
                }
                
                Log.d(TAG, "Starting reputation data sync...")
                
                // Fetch recently updated reputations
                val url = "$SUPABASE_URL/rest/v1/phone_reputation" +
                        "?select=*" +
                        "&last_updated=gte.${getISOTimestamp(lastSync)}" +
                        "&order=last_updated.desc" +
                        "&limit=1000"
                
                val request = Request.Builder()
                    .url(url)
                    .header("apikey", SUPABASE_ANON_KEY)
                    .header("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    .build()
                
                apiCalls.incrementAndGet()
                val response = httpClient.newCall(request).execute()
                
                if (response.isSuccessful) {
                    val responseBody = response.body?.string()
                    if (responseBody != null) {
                        val jsonArray = JSONArray(responseBody)
                        var syncedCount = 0
                        
                        for (i in 0 until jsonArray.length()) {
                            val item = jsonArray.getJSONObject(i)
                            val reputation = parsePhoneReputation(item)
                            if (reputation != null) {
                                phoneCache[reputation.number] = reputation
                                cacheTimestamps[reputation.number] = now
                                syncedCount++
                            }
                        }
                        
                        prefs.edit().putLong(KEY_LAST_SYNC, now).apply()
                        Log.d(TAG, "Synced $syncedCount phone reputation records")
                        return@withContext true
                    }
                }
                
                Log.w(TAG, "Sync failed with response code: ${response.code}")
                false
                
            } catch (e: Exception) {
                Log.e(TAG, "Error syncing reputation data", e)
                false
            }
        }
    }
    
    /**
     * Get statistics
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "total_checks" to totalChecks.get(),
            "cache_hits" to cacheHits.get(),
            "api_calls" to apiCalls.get(),
            "cache_size" to phoneCache.size,
            "cache_hit_rate" to if (totalChecks.get() > 0) {
                (cacheHits.get() * 100.0 / totalChecks.get()).toInt()
            } else 0
        )
    }
    
    // Private helper methods
    
    private fun getCachedReputation(phoneNumber: String): PhoneReputation? {
        val reputation = phoneCache[phoneNumber]
        val timestamp = cacheTimestamps[phoneNumber]
        
        if (reputation != null && timestamp != null) {
            if (System.currentTimeMillis() - timestamp < cacheExpiryTime) {
                return reputation
            } else {
                // Cache expired, remove it
                phoneCache.remove(phoneNumber)
                cacheTimestamps.remove(phoneNumber)
            }
        }
        
        return null
    }
    
    private suspend fun fetchPhoneReputation(phoneNumber: String): PhoneReputation? {
        return try {
            val url = "$SUPABASE_URL/rest/v1/phone_reputation" +
                    "?select=*" +
                    "&number=eq.$phoneNumber" +
                    "&limit=1"
            
            val request = Request.Builder()
                .url(url)
                .header("apikey", SUPABASE_ANON_KEY)
                .header("Authorization", "Bearer $SUPABASE_ANON_KEY")
                .build()
            
            apiCalls.incrementAndGet()
            val response = httpClient.newCall(request).execute()
            
            if (response.isSuccessful) {
                val responseBody = response.body?.string()
                if (responseBody != null) {
                    val jsonArray = JSONArray(responseBody)
                    if (jsonArray.length() > 0) {
                        return parsePhoneReputation(jsonArray.getJSONObject(0))
                    }
                }
            }
            
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching phone reputation", e)
            null
        }
    }
    
    private fun parsePhoneReputation(json: JSONObject): PhoneReputation? {
        return try {
            PhoneReputation(
                number = json.getString("number"),
                reputationScore = json.getInt("reputation_score"),
                spamReports = json.getInt("spam_reports"),
                fraudReports = json.getInt("fraud_reports"),
                totalReports = json.getInt("total_reports"),
                category = json.getString("category"),
                isVerifiedBusiness = json.getBoolean("is_verified_business"),
                callerName = if (json.has("caller_name") && !json.isNull("caller_name")) {
                    json.getString("caller_name")
                } else null
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing phone reputation", e)
            null
        }
    }
    
    private fun determineResult(reputation: PhoneReputation): PhoneResult {
        return when {
            reputation.reputationScore <= SCORE_BLOCK_THRESHOLD -> PhoneResult.BLOCK
            reputation.reputationScore <= SCORE_WARN_THRESHOLD -> PhoneResult.WARN
            reputation.reputationScore <= SCORE_MONITOR_THRESHOLD -> PhoneResult.MONITOR
            else -> PhoneResult.ALLOW
        }
    }
    
    private suspend fun makeSupabaseRequest(
        endpoint: String,
        method: String,
        data: JSONObject? = null
    ): Boolean {
        return try {
            val url = "$SUPABASE_URL/rest/v1/$endpoint"
            val requestBuilder = Request.Builder().url(url)
                .header("apikey", SUPABASE_ANON_KEY)
                .header("Authorization", "Bearer $SUPABASE_ANON_KEY")
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
            
            when (method) {
                "POST" -> {
                    val body = data?.toString()?.toRequestBody("application/json".toMediaType())
                    requestBuilder.post(body ?: "".toRequestBody())
                }
                "PUT" -> {
                    val body = data?.toString()?.toRequestBody("application/json".toMediaType())
                    requestBuilder.put(body ?: "".toRequestBody())
                }
                "PATCH" -> {
                    val body = data?.toString()?.toRequestBody("application/json".toMediaType())
                    requestBuilder.patch(body ?: "".toRequestBody())
                }
                else -> requestBuilder.get()
            }
            
            apiCalls.incrementAndGet()
            val response = httpClient.newCall(requestBuilder.build()).execute()
            val success = response.isSuccessful
            
            if (!success) {
                Log.w(TAG, "Supabase request failed: ${response.code} - ${response.message}")
            }
            
            success
        } catch (e: Exception) {
            Log.e(TAG, "Error making Supabase request", e)
            false
        }
    }
    
    private fun cleanPhoneNumber(phoneNumber: String): String {
        // Remove all non-digit characters except +
        var cleaned = phoneNumber.replace(Regex("[^\\d+]"), "")
        
        // Ensure it starts with + for international format
        if (!cleaned.startsWith("+") && cleaned.length > 10) {
            cleaned = "+$cleaned"
        }
        
        return cleaned
    }
    
    private fun maskPhoneNumber(phoneNumber: String): String {
        if (phoneNumber.length <= 4) return phoneNumber
        val start = phoneNumber.substring(0, 3)
        val end = phoneNumber.substring(phoneNumber.length - 2)
        val middle = "*".repeat(phoneNumber.length - 5)
        return "$start$middle$end"
    }
    
    private fun getCurrentTimestamp(): String {
        return java.time.Instant.now().toString()
    }
    
    private fun getISOTimestamp(timestamp: Long): String {
        return java.time.Instant.ofEpochMilli(timestamp).toString()
    }
    
    private fun startPeriodicCacheCleanup() {
        scope.launch {
            while (true) {
                delay(600000L) // 10 minutes
                cleanupExpiredCache()
            }
        }
    }
    
    private fun cleanupExpiredCache() {
        val now = System.currentTimeMillis()
        val expiredKeys = mutableListOf<String>()
        
        for ((key, timestamp) in cacheTimestamps) {
            if (now - timestamp > cacheExpiryTime) {
                expiredKeys.add(key)
            }
        }
        
        for (key in expiredKeys) {
            phoneCache.remove(key)
            cacheTimestamps.remove(key)
        }
        
        if (expiredKeys.isNotEmpty()) {
            Log.d(TAG, "Cleaned up ${expiredKeys.size} expired cache entries")
        }
    }
    
    fun cleanup() {
        scope.cancel()
        httpClient.dispatcher.executorService.shutdown()
    }
}

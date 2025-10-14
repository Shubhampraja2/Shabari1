package com.reactnativeproxyengine

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Ad Blocker Manager for Proxy Engine
 * Manages user-blocked domains and ad detection
 */
class AdBlockerManager(private val context: Context) {

    companion object {
        private const val TAG = "AdBlockerManager"
        private const val PREFS_NAME = "shabari_adblocker_prefs"
        private const val KEY_BLOCKED_DOMAINS = "blocked_domains"
        private const val KEY_SETTINGS = "adblocker_settings"

        // Common ad server patterns
        private val KNOWN_AD_PATTERNS = listOf(
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "google-analytics.com",
            "facebook.com/tr",
            "connect.facebook.net",
            "ads.twitter.com",
            "advertising.com",
            "adservice.google",
            "pagead2.googlesyndication.com",
            "googletagmanager.com",
            "adnxs.com",
            "adsrvr.org",
            "rubiconproject.com",
            "amazon-adsystem.com",
            "serving-sys.com",
            "criteo.com",
            "outbrain.com",
            "taboola.com",
            "pubmatic.com",
            "openx.net",
            "advertising.com",
            "adtechus.com",
            "exponential.com",
            "quantserve.com"
        )

        // Ad-related URL patterns
        private val AD_URL_PATTERNS = listOf(
            Regex("/ad[s]?/", RegexOption.IGNORE_CASE),
            Regex("/banner[s]?/", RegexOption.IGNORE_CASE),
            Regex("/promotion[s]?/", RegexOption.IGNORE_CASE),
            Regex("/sponsored", RegexOption.IGNORE_CASE),
            Regex("/affiliate", RegexOption.IGNORE_CASE),
            Regex("clicktrack", RegexOption.IGNORE_CASE),
            Regex("impression", RegexOption.IGNORE_CASE),
            Regex("adserver", RegexOption.IGNORE_CASE),
            Regex("adclick", RegexOption.IGNORE_CASE)
        )
    }

    data class BlockedDomain(
        val domain: String,
        val blockedAt: Long,
        val reason: String,
        var blockCount: Int = 0,
        var lastBlockedUrl: String? = null
    )

    data class AdCheckResult(
        val isAd: Boolean,
        val shouldBlock: Boolean,
        val domain: String,
        val reason: String = "",
        val detectionMethod: String = "unknown"
    )

    data class Settings(
        var enabled: Boolean = true,
        var autoBlockKnownAds: Boolean = false,
        var showAdNotifications: Boolean = true,
        var strictMode: Boolean = false
    )

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val blockedDomains = ConcurrentHashMap<String, BlockedDomain>()
    private var settings = Settings()
    private var adDetectionCallback: ((String, String, String) -> Unit)? = null

    init {
        loadBlockedDomains()
        loadSettings()
    }

    /**
     * Set callback for ad detection events
     */
    fun setAdDetectionCallback(callback: (domain: String, url: String, method: String) -> Unit) {
        this.adDetectionCallback = callback
    }

    /**
     * Check if a URL should be blocked as an ad
     */
    fun checkUrl(url: String): AdCheckResult {
        if (!settings.enabled) {
            return AdCheckResult(false, false, url)
        }

        val domain = extractDomain(url)
        val normalizedDomain = normalizeDomain(domain)

        // Check if domain is user-blocked
        if (blockedDomains.containsKey(normalizedDomain)) {
            val blockedInfo = blockedDomains[normalizedDomain]!!
            blockedInfo.blockCount++
            blockedInfo.lastBlockedUrl = url
            saveBlockedDomains()

            return AdCheckResult(
                isAd = true,
                shouldBlock = true,
                domain = normalizedDomain,
                reason = "Blocked by user: ${blockedInfo.reason}",
                detectionMethod = "user_blocked"
            )
        }

        // Check if it's a known ad domain
        val isKnownAd = isKnownAdDomain(normalizedDomain)
        if (isKnownAd) {
            // Notify detection
            adDetectionCallback?.invoke(normalizedDomain, url, "pattern")

            val shouldBlock = settings.autoBlockKnownAds
            return AdCheckResult(
                isAd = true,
                shouldBlock = shouldBlock,
                domain = normalizedDomain,
                reason = if (shouldBlock) "Auto-blocked known ad domain" else "Known ad domain detected",
                detectionMethod = "pattern"
            )
        }

        // Check if URL matches ad patterns
        val isAdUrl = isAdUrlPattern(url)
        if (isAdUrl) {
            // Notify detection
            adDetectionCallback?.invoke(normalizedDomain, url, "heuristic")

            return AdCheckResult(
                isAd = true,
                shouldBlock = settings.autoBlockKnownAds,
                domain = normalizedDomain,
                reason = "URL matches ad pattern",
                detectionMethod = "heuristic"
            )
        }

        return AdCheckResult(false, false, normalizedDomain)
    }

    /**
     * Block a domain
     */
    fun blockDomain(domain: String, reason: String = "Blocked by user"): Boolean {
        return try {
            val normalizedDomain = normalizeDomain(domain)

            if (blockedDomains.containsKey(normalizedDomain)) {
                // Already blocked
                return true
            }

            val blockedDomain = BlockedDomain(
                domain = normalizedDomain,
                blockedAt = System.currentTimeMillis(),
                reason = reason,
                blockCount = 0
            )

            blockedDomains[normalizedDomain] = blockedDomain
            saveBlockedDomains()

            true
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to block domain: $domain", e)
            false
        }
    }

    /**
     * Unblock a domain
     */
    fun unblockDomain(domain: String): Boolean {
        return try {
            val normalizedDomain = normalizeDomain(domain)

            if (!blockedDomains.containsKey(normalizedDomain)) {
                // Not blocked
                return false
            }

            blockedDomains.remove(normalizedDomain)
            saveBlockedDomains()

            true
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to unblock domain: $domain", e)
            false
        }
    }

    /**
     * Check if a domain is blocked
     */
    fun isDomainBlocked(domain: String): Boolean {
        val normalizedDomain = normalizeDomain(domain)
        return blockedDomains.containsKey(normalizedDomain)
    }

    /**
     * Get all blocked domains
     */
    fun getBlockedDomains(): List<BlockedDomain> {
        return blockedDomains.values.sortedByDescending { it.blockedAt }
    }

    /**
     * Get statistics
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "totalDomainsBlocked" to blockedDomains.size,
            "blockingEnabled" to settings.enabled,
            "autoBlockEnabled" to settings.autoBlockKnownAds
        )
    }

    /**
     * Update settings
     */
    fun updateSettings(enabled: Boolean? = null, autoBlockKnownAds: Boolean? = null) {
        enabled?.let { settings.enabled = it }
        autoBlockKnownAds?.let { settings.autoBlockKnownAds = it }
        saveSettings()
    }

    /**
     * Clear all blocked domains
     */
    fun clearBlockedDomains() {
        blockedDomains.clear()
        saveBlockedDomains()
    }

    // Private helper methods

    private fun extractDomain(url: String): String {
        return try {
            var urlToParse = url
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                urlToParse = "http://$url"
            }

            val uri = java.net.URI(urlToParse)
            uri.host ?: url
        } catch (e: Exception) {
            // If URL parsing fails, try manual extraction
            val match = Regex("(?:https?://)?(?:www\\.)?([^/\\?]+)").find(url)
            match?.groupValues?.get(1) ?: url
        }
    }

    private fun normalizeDomain(domain: String): String {
        return domain.lowercase().removePrefix("www.")
    }

    private fun isKnownAdDomain(domain: String): Boolean {
        return KNOWN_AD_PATTERNS.any { pattern -> domain.contains(pattern) }
    }

    private fun isAdUrlPattern(url: String): Boolean {
        return AD_URL_PATTERNS.any { pattern -> pattern.containsMatchIn(url) }
    }

    private fun loadBlockedDomains() {
        try {
            val json = prefs.getString(KEY_BLOCKED_DOMAINS, null)
            if (json != null) {
                val jsonArray = JSONArray(json)
                for (i in 0 until jsonArray.length()) {
                    val obj = jsonArray.getJSONObject(i)
                    val domain = BlockedDomain(
                        domain = obj.getString("domain"),
                        blockedAt = obj.getLong("blockedAt"),
                        reason = obj.getString("reason"),
                        blockCount = obj.optInt("blockCount", 0),
                        lastBlockedUrl = obj.optString("lastBlockedUrl", null)
                    )
                    blockedDomains[domain.domain] = domain
                }
                android.util.Log.i(TAG, "Loaded ${blockedDomains.size} blocked domains")
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to load blocked domains", e)
        }
    }

    private fun saveBlockedDomains() {
        try {
            val jsonArray = JSONArray()
            for (domain in blockedDomains.values) {
                val obj = JSONObject()
                obj.put("domain", domain.domain)
                obj.put("blockedAt", domain.blockedAt)
                obj.put("reason", domain.reason)
                obj.put("blockCount", domain.blockCount)
                domain.lastBlockedUrl?.let { obj.put("lastBlockedUrl", it) }
                jsonArray.put(obj)
            }

            prefs.edit().putString(KEY_BLOCKED_DOMAINS, jsonArray.toString()).apply()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to save blocked domains", e)
        }
    }

    private fun loadSettings() {
        try {
            val json = prefs.getString(KEY_SETTINGS, null)
            if (json != null) {
                val obj = JSONObject(json)
                settings = Settings(
                    enabled = obj.optBoolean("enabled", true),
                    autoBlockKnownAds = obj.optBoolean("autoBlockKnownAds", false),
                    showAdNotifications = obj.optBoolean("showAdNotifications", true),
                    strictMode = obj.optBoolean("strictMode", false)
                )
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to load settings", e)
        }
    }

    private fun saveSettings() {
        try {
            val obj = JSONObject()
            obj.put("enabled", settings.enabled)
            obj.put("autoBlockKnownAds", settings.autoBlockKnownAds)
            obj.put("showAdNotifications", settings.showAdNotifications)
            obj.put("strictMode", settings.strictMode)

            prefs.edit().putString(KEY_SETTINGS, obj.toString()).apply()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to save settings", e)
        }
    }
}


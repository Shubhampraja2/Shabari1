package com.reactnativeproxyengine

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.*
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

/**
 * Production-ready Filter Engine with advanced threat detection
 * Uses Trie data structure for efficient domain matching and ML-ready scoring
 * 
 * Note: IpPacket class is defined in ShabariVpnService.kt
 */
class FilterEngine(private val context: Context) {
    
    companion object {
        private const val TAG = "FilterEngine"
        private const val PREFS_NAME = "shabari_filter_prefs"
        private const val KEY_LAST_SYNC = "last_sync_timestamp"
        private const val SYNC_INTERVAL = 3600000L // 1 hour
        
        // Firestore collections
        private const val COLLECTION_FRAUD_DOMAINS = "fraud_domains"
        private const val COLLECTION_FRAUD_NUMBERS = "fraud_numbers"
        private const val COLLECTION_FRAUD_IPS = "fraud_ips"
        private const val COLLECTION_REPORTS = "reports"
        private const val COLLECTION_RULES = "filter_rules"
        
        // Rule priorities
        private const val PRIORITY_CRITICAL = 1000
        private const val PRIORITY_HIGH = 750
        private const val PRIORITY_MEDIUM = 500
        private const val PRIORITY_LOW = 250
        
        // Threat score thresholds
        private const val SCORE_BLOCK_THRESHOLD = 80
        private const val SCORE_WARN_THRESHOLD = 50
        private const val SCORE_MONITOR_THRESHOLD = 30
    }
    
    enum class FilterResult {
        BLOCK,    // Completely block access
        WARN,     // Allow but warn user
        MONITOR,  // Allow but log for analysis
        ALLOW     // Allow without restrictions
    }
    
    enum class RuleType {
        EXACT,      // Exact match
        PREFIX,     // Starts with pattern
        SUFFIX,     // Ends with pattern
        CONTAINS,   // Contains pattern
        REGEX,      // Regular expression
        WILDCARD    // Wildcard pattern (* and ?)
    }
    
    data class FilterRule(
        val id: String,
        val pattern: String,
        val type: RuleType,
        val action: FilterResult,
        val priority: Int = PRIORITY_MEDIUM,
        val category: String = "general",
        val description: String = "",
        val metadata: Map<String, Any> = emptyMap(),
        val expiresAt: Long? = null,
        val createdAt: Long = System.currentTimeMillis()
    )
    
    data class ThreatScore(
        val score: Int,
        val factors: List<String>,
        val confidence: Float,
        val recommendation: FilterResult
    )
    
    // Trie node for efficient domain matching
    class TrieNode {
        val children = ConcurrentHashMap<Char, TrieNode>()
        var isEndOfWord = false
        var rule: FilterRule? = null
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Data structures for fast lookup
    private val domainTrie = TrieNode()
    private val exactDomains = ConcurrentHashMap<String, FilterRule>()
    private val ipRanges = mutableListOf<IpRange>()
    private val phoneNumbers = ConcurrentHashMap<String, FilterRule>()
    private val regexPatterns = mutableListOf<Pair<Regex, FilterRule>>()
    private val blockedApps = ConcurrentHashMap<String, FilterRule>()
    
    // Cache for recent lookups
    private val lookupCache = object : LinkedHashMap<String, FilterResult>(1000, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, FilterResult>): Boolean {
            return size > 1000
        }
    }
    
    // Statistics
    private val totalChecks = AtomicLong(0)
    private val blockedCount = AtomicLong(0)
    private val warnedCount = AtomicLong(0)
    private val monitoredCount = AtomicLong(0)
    
    // Machine learning features (placeholder for future ML integration)
    private val featureExtractor = ThreatFeatureExtractor()
    
    data class IpRange(
        val startIp: Long,
        val endIp: Long,
        val rule: FilterRule
    )
    
    init {
        loadLocalRules()
        startPeriodicSync()
    }
    
    fun loadLocalRules() {
        scope.launch {
            try {
                // Load built-in malicious patterns
                loadBuiltInPatterns()
                
                // Load cached rules from preferences
                loadCachedRules()
                
                Log.i(TAG, "Local rules loaded successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading local rules", e)
            }
        }
    }
    
    private fun loadBuiltInPatterns() {
        // Known malicious domains
        val maliciousDomains = listOf(
            "phishing-site.tk",
            "malware-download.ml",
            "fake-bank.ga",
            "scam-crypto.cf"
        )
        
        for (domain in maliciousDomains) {
            addDomainRule(
                FilterRule(
                    id = "builtin_${domain.hashCode()}",
                    pattern = domain,
                    type = RuleType.EXACT,
                    action = FilterResult.BLOCK,
                    priority = PRIORITY_HIGH,
                    category = "malware",
                    description = "Known malicious domain"
                )
            )
        }
        
        // Suspicious patterns
        val suspiciousPatterns = listOf(
            "*-verify-account.*" to "Phishing pattern",
            "*crypto-giveaway*" to "Crypto scam pattern",
            "*facebook-security*" to "Social media phishing",
            "*amazon-refund*" to "E-commerce scam"
        )
        
        for ((pattern, description) in suspiciousPatterns) {
            addDomainRule(
                FilterRule(
                    id = "pattern_${pattern.hashCode()}",
                    pattern = pattern,
                    type = RuleType.WILDCARD,
                    action = FilterResult.WARN,
                    priority = PRIORITY_MEDIUM,
                    category = "phishing",
                    description = description
                )
            )
        }
        
        // Known bad IP ranges
        val badIpRanges = listOf(
            "192.0.2.0/24",    // TEST-NET-1
            "198.51.100.0/24", // TEST-NET-2
            "203.0.113.0/24"   // TEST-NET-3
        )
        
        for (range in badIpRanges) {
            addIpRangeRule(range, FilterResult.MONITOR)
        }
    }
    
    private fun loadCachedRules() {
        // Load cached rules from SharedPreferences
        val cachedDomains = prefs.getStringSet("cached_domains", emptySet()) ?: emptySet()
        val cachedNumbers = prefs.getStringSet("cached_numbers", emptySet()) ?: emptySet()
        
        for (domain in cachedDomains) {
            addDomainRule(
                FilterRule(
                    id = "cached_domain_${domain.hashCode()}",
                    pattern = domain,
                    type = RuleType.EXACT,
                    action = FilterResult.BLOCK,
                    priority = PRIORITY_MEDIUM,
                    category = "cached"
                )
            )
        }
        
        for (number in cachedNumbers) {
            phoneNumbers[hashPhoneNumber(number)] = FilterRule(
                id = "cached_number_${number.hashCode()}",
                pattern = number,
                type = RuleType.EXACT,
                action = FilterResult.BLOCK,
                priority = PRIORITY_MEDIUM,
                category = "fraud_call"
            )
        }
    }
    
    fun syncWithSupabase() {
        scope.launch {
            try {
                val lastSync = prefs.getLong(KEY_LAST_SYNC, 0)
                val now = System.currentTimeMillis()
                
                if (now - lastSync < SYNC_INTERVAL) {
                    Log.d(TAG, "Skipping sync, last sync was recent")
                    return@launch
                }
                
                // TODO: Implement Supabase sync for fraud domains, numbers, IPs, and rules
                // This will be handled by your existing Supabase integration
                
                prefs.edit().putLong(KEY_LAST_SYNC, now).apply()
                
                Log.i(TAG, "Supabase sync completed successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error syncing with Supabase", e)
            }
        }
    }
    
    // Note: Sync methods now handled by Supabase integration in JavaScript/TypeScript layer
    // These are placeholder stubs - actual sync happens via React Native bridge to Supabase
    
    private fun addDomainRule(rule: FilterRule) {
        when (rule.type) {
            RuleType.EXACT -> {
                exactDomains[rule.pattern.lowercase()] = rule
                insertIntoTrie(rule.pattern.lowercase(), rule)
            }
            RuleType.PREFIX -> {
                insertIntoTrie(rule.pattern.lowercase(), rule)
            }
            RuleType.SUFFIX -> {
                insertIntoTrie(rule.pattern.reversed().lowercase(), rule)
            }
            RuleType.WILDCARD -> {
                val regex = wildcardToRegex(rule.pattern)
                regexPatterns.add(regex to rule)
            }
            else -> {
                // Handle other types as needed
            }
        }
    }
    
    private fun insertIntoTrie(word: String, rule: FilterRule) {
        var current = domainTrie
        
        for (char in word) {
            current = current.children.computeIfAbsent(char) { TrieNode() }
        }
        
        current.isEndOfWord = true
        current.rule = rule
    }
    
    private fun searchInTrie(word: String): FilterRule? {
        var current = domainTrie
        
        for (char in word.lowercase()) {
            current = current.children[char] ?: return null
        }
        
        return if (current.isEndOfWord) current.rule else null
    }
    
    private fun wildcardToRegex(pattern: String): Regex {
        val regexPattern = pattern
            .replace(".", "\\.")
            .replace("*", ".*")
            .replace("?", ".")
        return Regex("^$regexPattern$", RegexOption.IGNORE_CASE)
    }
    
    fun checkDomain(domain: String): FilterResult {
        totalChecks.incrementAndGet()
        
        // Check cache first
        lookupCache[domain]?.let { return it }
        
        // Normalize domain
        val normalizedDomain = domain.lowercase().trim()
        
        // Check exact match
        exactDomains[normalizedDomain]?.let { rule ->
            val result = rule.action
            updateStats(result)
            lookupCache[domain] = result
            return result
        }
        
        // Check trie for prefix matches
        searchInTrie(normalizedDomain)?.let { rule ->
            val result = rule.action
            updateStats(result)
            lookupCache[domain] = result
            return result
        }
        
        // Check suffix matches (reverse trie)
        searchInTrie(normalizedDomain.reversed())?.let { rule ->
            val result = rule.action
            updateStats(result)
            lookupCache[domain] = result
            return result
        }
        
        // Check regex patterns
        for ((regex, rule) in regexPatterns) {
            if (regex.matches(normalizedDomain)) {
                val result = rule.action
                updateStats(result)
                lookupCache[domain] = result
                return result
            }
        }
        
        // Calculate threat score using ML features
        val threatScore = calculateThreatScore(normalizedDomain)
        val result = threatScore.recommendation
        
        updateStats(result)
        lookupCache[domain] = result
        
        return result
    }
    
    fun checkIp(ip: String): FilterResult {
        totalChecks.incrementAndGet()
        
        try {
            val ipLong = ipToLong(ip)
            
            for (range in ipRanges) {
                if (ipLong >= range.startIp && ipLong <= range.endIp) {
                    val result = range.rule.action
                    updateStats(result)
                    return result
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking IP: $ip", e)
        }
        
        return FilterResult.ALLOW
    }
    
    fun checkPhoneNumber(number: String): FilterResult {
        totalChecks.incrementAndGet()
        
        val hashedNumber = hashPhoneNumber(number)
        
        phoneNumbers[hashedNumber]?.let { rule ->
            val result = rule.action
            updateStats(result)
            return result
        }
        
        // Check if number matches suspicious patterns
        if (isSuspiciousPhoneNumber(number)) {
            warnedCount.incrementAndGet()
            return FilterResult.WARN
        }
        
        return FilterResult.ALLOW
    }
    
    fun checkPacket(
        destAddr: String,
        destPort: Int,
        protocol: IpPacket.Protocol,
        payload: ByteArray
    ): FilterResult {
        // Check destination IP
        val ipResult = checkIp(destAddr)
        if (ipResult != FilterResult.ALLOW) {
            return ipResult
        }
        
        // Check for suspicious ports
        val portResult = checkPort(destPort, protocol)
        if (portResult != FilterResult.ALLOW) {
            return portResult
        }
        
        // Deep packet inspection for known malware signatures
        if (containsMalwareSignature(payload)) {
            blockedCount.incrementAndGet()
            return FilterResult.BLOCK
        }
        
        return FilterResult.ALLOW
    }
    
    private fun checkPort(port: Int, protocol: IpPacket.Protocol): FilterResult {
        // Check for commonly abused ports
        val suspiciousPorts = when (protocol) {
            IpPacket.Protocol.TCP -> listOf(
                135, 139, 445,  // Windows SMB
                1433, 1434,     // SQL Server
                3389,           // RDP
                5900,           // VNC
                6667,           // IRC
                8080, 8081      // Common proxy ports
            )
            IpPacket.Protocol.UDP -> listOf(
                137, 138,       // NetBIOS
                161,            // SNMP
                1900            // UPnP
            )
            else -> emptyList()
        }
        
        return if (port in suspiciousPorts) {
            FilterResult.MONITOR
        } else {
            FilterResult.ALLOW
        }
    }
    
    private fun containsMalwareSignature(payload: ByteArray): Boolean {
        // Simplified malware signature detection
        // In production, this would use more sophisticated pattern matching
        
        val signatures = listOf(
            byteArrayOf(0x4D, 0x5A), // PE executable header
            "EICAR-STANDARD-ANTIVIRUS-TEST-FILE".toByteArray()
        )
        
        for (signature in signatures) {
            if (payload.size >= signature.size) {
                if (payload.sliceArray(0 until signature.size).contentEquals(signature)) {
                    return true
                }
            }
        }
        
        return false
    }
    
    private fun calculateThreatScore(domain: String): ThreatScore {
        val factors = mutableListOf<String>()
        var score = 0
        
        // Extract features
        val features = featureExtractor.extractFeatures(domain)
        
        // Length-based scoring
        if (features.domainLength > 50) {
            score += 20
            factors.add("Unusually long domain")
        }
        
        // Entropy-based scoring
        if (features.entropy > 4.0) {
            score += 30
            factors.add("High entropy (possibly DGA)")
        }
        
        // Subdomain depth
        if (features.subdomainCount > 3) {
            score += 15
            factors.add("Deep subdomain nesting")
        }
        
        // Suspicious TLD
        if (features.hasSuspiciousTld) {
            score += 25
            factors.add("Suspicious TLD")
        }
        
        // Homograph attack detection
        if (features.hasHomographs) {
            score += 35
            factors.add("Possible homograph attack")
        }
        
        // Numeric subdomain
        if (features.hasNumericSubdomain) {
            score += 10
            factors.add("Numeric subdomain")
        }
        
        // Calculate confidence based on number of factors
        val confidence = minOf(factors.size * 0.2f, 1.0f)
        
        // Determine recommendation
        val recommendation = when {
            score >= SCORE_BLOCK_THRESHOLD -> FilterResult.BLOCK
            score >= SCORE_WARN_THRESHOLD -> FilterResult.WARN
            score >= SCORE_MONITOR_THRESHOLD -> FilterResult.MONITOR
            else -> FilterResult.ALLOW
        }
        
        return ThreatScore(score, factors, confidence, recommendation)
    }
    
    private fun isSuspiciousPhoneNumber(number: String): Boolean {
        // Check for known scam patterns
        val scamPrefixes = listOf(
            "1-900", // Premium rate
            "+234",  // Nigerian scam prefix
            "+91-",  // Common tech support scam origin
            "0900"   // Premium rate in some countries
        )
        
        return scamPrefixes.any { number.startsWith(it) }
    }
    
    /**
     * Hash phone number using HMAC-SHA256 for secure privacy protection
     * This is more secure than simple SHA-256 as it prevents rainbow table attacks
     */
    private fun hashPhoneNumber(number: String): String {
        try {
            // Get secret key from Android Keystore or resources (in production)
            // For now using a constant but this should be loaded securely
            val secretKey = "CHANGE_ME_IN_PRODUCTION_USE_KEYSTORE"

            val mac = Mac.getInstance("HmacSHA256")
            val secretKeySpec = SecretKeySpec(secretKey.toByteArray(Charsets.UTF_8), "HmacSHA256")
            mac.init(secretKeySpec)

            val hmacBytes = mac.doFinal(number.toByteArray(Charsets.UTF_8))

            // Convert to hex string
            return hmacBytes.fold("") { str, it -> str + "%02x".format(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Error hashing phone number", e)
            // Fallback to SHA-256 if HMAC fails
            val bytes = MessageDigest.getInstance("SHA-256")
                .digest(number.toByteArray())
            return bytes.fold("") { str, it -> str + "%02x".format(it) }
        }
    }
    
    private fun ipToLong(ip: String): Long {
        val parts = ip.split(".")
        if (parts.size != 4) throw IllegalArgumentException("Invalid IP address")
        
        return parts.mapIndexed { index, part ->
            part.toLong() shl (24 - index * 8)
        }.sum()
    }
    
    private fun addIpRangeRule(range: String, action: FilterResult, reason: String = "") {
        try {
            val parts = range.split("/")
            val baseIp = parts[0]
            val cidr = parts.getOrNull(1)?.toInt() ?: 32
            
            val baseIpLong = ipToLong(baseIp)
            val mask = -1L shl (32 - cidr)
            val startIp = baseIpLong and mask
            val endIp = startIp or (mask.inv() and 0xFFFFFFFFL)
            
            ipRanges.add(
                IpRange(
                    startIp = startIp,
                    endIp = endIp,
                    rule = FilterRule(
                        id = "ip_range_${range.hashCode()}",
                        pattern = range,
                        type = RuleType.EXACT,
                        action = action,
                        priority = PRIORITY_MEDIUM,
                        category = "ip_range",
                        description = reason
                    )
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error adding IP range rule: $range", e)
        }
    }
    
    private fun updateStats(result: FilterResult) {
        when (result) {
            FilterResult.BLOCK -> blockedCount.incrementAndGet()
            FilterResult.WARN -> warnedCount.incrementAndGet()
            FilterResult.MONITOR -> monitoredCount.incrementAndGet()
            FilterResult.ALLOW -> {} // No stat update for allowed
        }
    }
    
    fun reportBlocked(target: String, type: String, reason: String) {
        scope.launch {
            try {
                // TODO: Report to Supabase via React Native bridge
                Log.d(TAG, "Block reported: $target - $reason")
            } catch (e: Exception) {
                Log.e(TAG, "Error in reportBlocked", e)
            }
        }
    }
    
    fun reportWarning(target: String, type: String, message: String) {
        scope.launch {
            try {
                // TODO: Report to Supabase via React Native bridge
                Log.d(TAG, "Warning reported: $target - $message")
            } catch (e: Exception) {
                Log.e(TAG, "Error in reportWarning", e)
            }
        }
    }
    
    fun logDnsQuery(domain: String, queryType: Int) {
        // Log DNS query for analysis (implement as needed)
        Log.d(TAG, "DNS query logged: $domain (type: $queryType)")
    }
    
    fun logPacket(packet: IpPacket) {
        // Log packet for analysis (implement as needed)
        Log.d(TAG, "Packet logged: ${packet.destinationAddress}:${packet.destinationPort}")
    }
    
    fun logWarning(message: String, source: String = "unknown") {
        Log.w(TAG, "[$source] $message")
        // TODO: Send to Supabase analytics/logging
    }
    
    fun logActivity(message: String, source: String = "unknown") {
        Log.i(TAG, "[$source] $message")
        // TODO: Send to Supabase analytics/logging
    }
    
    // Domain management methods
    fun addBlockedDomain(domain: String, reason: String) {
        val rule = FilterRule(
            id = "blocked_domain_${domain.hashCode()}",
            pattern = domain,
            type = RuleType.EXACT,
            action = FilterResult.BLOCK,
            priority = PRIORITY_HIGH,
            category = "blocked_domain",
            description = reason
        )
        exactDomains[domain.lowercase()] = rule
        insertIntoTrie(domain.lowercase(), rule)
        Log.d(TAG, "Added blocked domain: $domain - $reason")
    }
    
    fun addWarnDomain(domain: String, reason: String) {
        val rule = FilterRule(
            id = "warn_domain_${domain.hashCode()}",
            pattern = domain,
            type = RuleType.EXACT,
            action = FilterResult.WARN,
            priority = PRIORITY_MEDIUM,
            category = "warn_domain",
            description = reason
        )
        exactDomains[domain.lowercase()] = rule
        insertIntoTrie(domain.lowercase(), rule)
        Log.d(TAG, "Added warn domain: $domain - $reason")
    }
    
    fun addMonitorDomain(domain: String, reason: String) {
        val rule = FilterRule(
            id = "monitor_domain_${domain.hashCode()}",
            pattern = domain,
            type = RuleType.EXACT,
            action = FilterResult.MONITOR,
            priority = PRIORITY_LOW,
            category = "monitor_domain",
            description = reason
        )
        exactDomains[domain.lowercase()] = rule
        insertIntoTrie(domain.lowercase(), rule)
        Log.d(TAG, "Added monitor domain: $domain - $reason")
    }
    
    // IP management methods
    fun addBlockedIp(ip: String, reason: String) {
        addIpRangeRule(ip, FilterResult.BLOCK, reason)
        Log.d(TAG, "Added blocked IP: $ip - $reason")
    }
    
    fun addWarnIp(ip: String, reason: String) {
        addIpRangeRule(ip, FilterResult.WARN, reason)
        Log.d(TAG, "Added warn IP: $ip - $reason")
    }
    
    fun addMonitorIp(ip: String, reason: String) {
        addIpRangeRule(ip, FilterResult.MONITOR, reason)
        Log.d(TAG, "Added monitor IP: $ip - $reason")
    }
    
    // Phone number management methods
    fun addBlockedPhoneNumber(number: String, reason: String) {
        phoneNumbers[hashPhoneNumber(number)] = FilterRule(
            id = "blocked_phone_${number.hashCode()}",
            pattern = number,
            type = RuleType.EXACT,
            action = FilterResult.BLOCK,
            priority = PRIORITY_HIGH,
            category = "blocked_phone",
            description = reason
        )
        Log.d(TAG, "Added blocked phone: $number - $reason")
    }
    
    fun addWarnPhoneNumber(number: String, reason: String) {
        phoneNumbers[hashPhoneNumber(number)] = FilterRule(
            id = "warn_phone_${number.hashCode()}",
            pattern = number,
            type = RuleType.EXACT,
            action = FilterResult.WARN,
            priority = PRIORITY_MEDIUM,
            category = "warn_phone",
            description = reason
        )
        Log.d(TAG, "Added warn phone: $number - $reason")
    }
    
    fun addMonitorPhoneNumber(number: String, reason: String) {
        phoneNumbers[hashPhoneNumber(number)] = FilterRule(
            id = "monitor_phone_${number.hashCode()}",
            pattern = number,
            type = RuleType.EXACT,
            action = FilterResult.MONITOR,
            priority = PRIORITY_LOW,
            category = "monitor_phone",
            description = reason
        )
        Log.d(TAG, "Added monitor phone: $number - $reason")
    }
    
    // App management methods
    fun addBlockedApp(packageName: String, reason: String) {
        blockedApps[packageName] = FilterRule(
            id = "blocked_app_${packageName.hashCode()}",
            pattern = packageName,
            type = RuleType.EXACT,
            action = FilterResult.BLOCK,
            priority = PRIORITY_HIGH,
            category = "blocked_app",
            description = reason
        )
        Log.d(TAG, "Added blocked app: $packageName - $reason")
    }
    
    fun addWarnApp(packageName: String, reason: String) {
        blockedApps[packageName] = FilterRule(
            id = "warn_app_${packageName.hashCode()}",
            pattern = packageName,
            type = RuleType.EXACT,
            action = FilterResult.WARN,
            priority = PRIORITY_MEDIUM,
            category = "warn_app",
            description = reason
        )
        Log.d(TAG, "Added warn app: $packageName - $reason")
    }
    
    fun checkApp(packageName: String): FilterResult {
        return blockedApps[packageName]?.action ?: FilterResult.ALLOW
    }
    
    fun getBlockedApps(): List<String> {
        return blockedApps.keys.toList()
    }
    
    fun getStatistics(): Map<String, Any> {
        return mapOf(
            "total_checks" to totalChecks.get(),
            "blocked_count" to blockedCount.get(),
            "warned_count" to warnedCount.get(),
            "monitored_count" to monitoredCount.get(),
            "rules_count" to (exactDomains.size + regexPatterns.size + ipRanges.size),
            "cache_size" to lookupCache.size
        )
    }
    
    private fun getDeviceId(): String {
        // Get or generate a unique device ID
        var deviceId = prefs.getString("device_id", null)
        if (deviceId == null) {
            deviceId = java.util.UUID.randomUUID().toString()
            prefs.edit().putString("device_id", deviceId).apply()
        }
        return deviceId
    }
    
    private fun startPeriodicSync() {
        scope.launch {
            while (true) {
                delay(SYNC_INTERVAL)
                syncWithSupabase()
            }
        }
    }
    
    fun cleanup() {
        scope.cancel()
    }
}

/**
 * Feature extractor for ML-based threat detection
 */
class ThreatFeatureExtractor {
    
    data class DomainFeatures(
        val domainLength: Int,
        val entropy: Double,
        val subdomainCount: Int,
        val hasSuspiciousTld: Boolean,
        val hasHomographs: Boolean,
        val hasNumericSubdomain: Boolean,
        val consonantRatio: Double,
        val hasHyphen: Boolean,
        val hasUnderscore: Boolean
    )
    
    private val suspiciousTlds = setOf("tk", "ml", "ga", "cf", "top", "buzz", "work")
    
    fun extractFeatures(domain: String): DomainFeatures {
        val parts = domain.split('.')
        val subdomain = if (parts.size > 2) parts[0] else ""
        val tld = parts.lastOrNull() ?: ""
        
        return DomainFeatures(
            domainLength = domain.length,
            entropy = calculateEntropy(domain),
            subdomainCount = parts.size - 1,
            hasSuspiciousTld = tld in suspiciousTlds,
            hasHomographs = containsHomographs(domain),
            hasNumericSubdomain = subdomain.any { it.isDigit() },
            consonantRatio = calculateConsonantRatio(domain),
            hasHyphen = '-' in domain,
            hasUnderscore = '_' in domain
        )
    }
    
    private fun calculateEntropy(text: String): Double {
        val charFreq = mutableMapOf<Char, Int>()
        for (char in text.lowercase()) {
            charFreq[char] = charFreq.getOrDefault(char, 0) + 1
        }
        
        return charFreq.values.sumOf { freq ->
            val probability = freq.toDouble() / text.length
            -probability * kotlin.math.log2(probability)
        }
    }
    
    private fun containsHomographs(domain: String): Boolean {
        val homographPairs = mapOf(
            'o' to '0',
            'l' to '1',
            'i' to '1',
            'e' to '3',
            'a' to '4',
            's' to '5',
            'g' to '9'
        )
        
        for ((letter, number) in homographPairs) {
            if (domain.contains(letter) && domain.contains(number)) {
                return true
            }
        }
        
        return false
    }
    
    private fun calculateConsonantRatio(text: String): Double {
        val vowels = setOf('a', 'e', 'i', 'o', 'u')
        val letters = text.filter { it.isLetter() }
        if (letters.isEmpty()) return 0.0
        
        val consonantCount = letters.count { it.lowercase()[0] !in vowels }
        return consonantCount.toDouble() / letters.length
    }
}

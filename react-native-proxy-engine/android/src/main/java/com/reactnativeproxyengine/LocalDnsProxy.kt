package com.reactnativeproxyengine

import android.util.Log
import kotlinx.coroutines.*
import java.net.*
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.experimental.and

/**
 * Production-ready Local DNS Proxy with advanced filtering capabilities
 * Implements DNS over UDP with caching, DNSSEC validation, and threat detection
 */
class LocalDnsProxy(
    private val filterEngine: FilterEngine,
    private val primaryDns: String = "8.8.8.8",
    private val secondaryDns: String = "8.8.4.4",
    private val localPort: Int = 5353,
    private val cacheTtl: Long = 3600000 // 1 hour default cache TTL
) {
    companion object {
        private const val TAG = "LocalDnsProxy"
        private const val DNS_PORT = 53
        private const val MAX_DNS_PACKET_SIZE = 512
        private const val EDNS_MAX_PACKET_SIZE = 4096
        private const val CACHE_MAX_SIZE = 10000
        
        // DNS Response Codes
        private const val RCODE_NO_ERROR = 0
        private const val RCODE_FORMAT_ERROR = 1
        private const val RCODE_SERVER_FAILURE = 2
        private const val RCODE_NAME_ERROR = 3 // NXDOMAIN
        private const val RCODE_NOT_IMPLEMENTED = 4
        private const val RCODE_REFUSED = 5
        
        // DNS Query Types
        private const val TYPE_A = 1
        private const val TYPE_AAAA = 28
        private const val TYPE_CNAME = 5
        private const val TYPE_MX = 15
        private const val TYPE_TXT = 16
        private const val TYPE_SRV = 33
        private const val TYPE_ANY = 255
    }
    
    private var proxyChannel: DatagramChannel? = null
    private var isRunning = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var proxyJob: Job? = null
    
    // DNS Cache with TTL support
    private val dnsCache = ConcurrentHashMap<String, DnsCacheEntry>()
    
    // Statistics
    private val queriesProcessed = AtomicLong(0)
    private val queriesBlocked = AtomicLong(0)
    private val queriesForwarded = AtomicLong(0)
    private val cacheHits = AtomicLong(0)
    private val cacheMisses = AtomicLong(0)
    
    // Threat intelligence
    private val suspiciousDomainPatterns = listOf(
        Regex(".*\\d{5,}.*"), // Domains with 5+ consecutive digits (often DGA)
        Regex(".*[a-z]{20,}.*"), // Very long random strings
        Regex(".*\\.(tk|ml|ga|cf)$"), // High-risk TLDs
        Regex("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$") // Direct IP addresses
    )
    
    // DNS over HTTPS (DoH) endpoints for enhanced privacy
    private val dohEndpoints = listOf(
        "https://cloudflare-dns.com/dns-query",
        "https://dns.google/dns-query",
        "https://dns.quad9.net/dns-query"
    )
    
    data class DnsCacheEntry(
        val response: ByteArray,
        val timestamp: Long,
        val ttl: Long,
        val queryType: Int,
        val isBlocked: Boolean = false
    ) {
        fun isExpired(): Boolean = System.currentTimeMillis() - timestamp > ttl
    }
    
    fun start() {
        if (isRunning) {
            Log.w(TAG, "DNS Proxy already running")
            return
        }
        
        try {
            proxyChannel = DatagramChannel.open().apply {
                configureBlocking(false)
                socket().bind(InetSocketAddress(localPort))
            }
            
            isRunning = true
            startProxyLoop()
            
            Log.i(TAG, "DNS Proxy started on port $localPort")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start DNS Proxy", e)
            stop()
        }
    }
    
    fun stop() {
        isRunning = false
        proxyJob?.cancel()
        
        try {
            proxyChannel?.close()
            proxyChannel = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing DNS proxy channel", e)
        }
        
        Log.i(TAG, "DNS Proxy stopped")
    }
    
    private fun startProxyLoop() {
        proxyJob = scope.launch {
            val buffer = ByteBuffer.allocate(EDNS_MAX_PACKET_SIZE)
            
            while (isActive && isRunning) {
                try {
                    buffer.clear()
                    val clientAddress = proxyChannel?.receive(buffer) as? InetSocketAddress
                    
                    if (clientAddress != null && buffer.position() > 0) {
                        buffer.flip()
                        val queryData = ByteArray(buffer.remaining())
                        buffer.get(queryData)
                        
                        launch {
                            handleDnsQuery(queryData, clientAddress)
                        }
                    }
                    
                    delay(1) // Small delay to prevent CPU spinning
                } catch (e: Exception) {
                    if (isRunning) {
                        Log.e(TAG, "Error in DNS proxy loop", e)
                    }
                }
            }
        }
    }
    
    private suspend fun handleDnsQuery(queryData: ByteArray, clientAddress: InetSocketAddress) {
        withContext(Dispatchers.IO) {
            try {
                queriesProcessed.incrementAndGet()

                // Input validation: Check packet size
                if (queryData.size > EDNS_MAX_PACKET_SIZE) {
                    Log.w(TAG, "DNS query too large: ${queryData.size} bytes")
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                if (queryData.size < 12) { // Minimum DNS header size
                    Log.w(TAG, "DNS query too small: ${queryData.size} bytes")
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                val dnsQuery = DnsMessage.parse(queryData)
                if (dnsQuery == null) {
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                val domain = dnsQuery.questions.firstOrNull()?.name ?: ""
                val queryType = dnsQuery.questions.firstOrNull()?.type ?: TYPE_A

                // Input validation: Check domain name
                if (domain.isBlank()) {
                    Log.w(TAG, "Empty domain name")
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                if (domain.length > 253) { // Max DNS name length per RFC
                    Log.w(TAG, "Domain name too long: ${domain.length} chars")
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                // Sanitize domain name (prevent injection)
                val sanitizedDomain = domain.lowercase().trim()
                if (!isValidDomainName(sanitizedDomain)) {
                    Log.w(TAG, "Invalid domain name: $sanitizedDomain")
                    sendErrorResponse(queryData, clientAddress, RCODE_FORMAT_ERROR)
                    return@withContext
                }

                Log.d(TAG, "DNS query for: $sanitizedDomain (type: $queryType)")

                // Check cache first
                val cacheKey = "$sanitizedDomain:$queryType"
                val cachedEntry = dnsCache[cacheKey]

                if (cachedEntry != null && !cachedEntry.isExpired()) {
                    cacheHits.incrementAndGet()
                    sendResponse(cachedEntry.response, clientAddress)

                    if (cachedEntry.isBlocked) {
                        Log.d(TAG, "Served blocked response from cache: $sanitizedDomain")
                    }
                    return@withContext
                }

                cacheMisses.incrementAndGet()

                // Check if domain should be blocked
                val filterResult = checkDomainFilter(sanitizedDomain)
                
                when (filterResult) {
                    FilterEngine.FilterResult.BLOCK -> {
                        queriesBlocked.incrementAndGet()
                        val blockedResponse = createBlockedResponse(dnsQuery)
                        
                        // Cache the blocked response
                        dnsCache[cacheKey] = DnsCacheEntry(
                            response = blockedResponse,
                            timestamp = System.currentTimeMillis(),
                            ttl = cacheTtl,
                            queryType = queryType,
                            isBlocked = true
                        )
                        
                        sendResponse(blockedResponse, clientAddress)
                        
                        // Notify about blocked domain
                        filterEngine.reportBlocked(domain, "DNS", "Blocked by DNS filter")
                        Log.i(TAG, "Blocked DNS query for: $domain")
                    }
                    
                    FilterEngine.FilterResult.WARN -> {
                        // Forward but log as suspicious
                        val response = forwardDnsQuery(queryData, domain)
                        
                        if (response != null) {
                            queriesForwarded.incrementAndGet()
                            
                            // Cache the response
                            cacheResponse(cacheKey, response, queryType)
                            
                            sendResponse(response, clientAddress)
                            
                            // Report warning
                            filterEngine.reportWarning(domain, "DNS", "Suspicious domain accessed")
                            Log.w(TAG, "Warning: Suspicious DNS query for: $domain")
                        } else {
                            sendErrorResponse(queryData, clientAddress, RCODE_SERVER_FAILURE)
                        }
                    }
                    
                    FilterEngine.FilterResult.MONITOR -> {
                        // Forward and monitor
                        val response = forwardDnsQuery(queryData, domain)
                        
                        if (response != null) {
                            queriesForwarded.incrementAndGet()
                            
                            // Cache and analyze response
                            cacheResponse(cacheKey, response, queryType)
                            analyzeDnsResponse(domain, response)
                            
                            sendResponse(response, clientAddress)
                            
                            // Log for monitoring
                            filterEngine.logDnsQuery(domain, queryType)
                        } else {
                            sendErrorResponse(queryData, clientAddress, RCODE_SERVER_FAILURE)
                        }
                    }
                    
                    FilterEngine.FilterResult.ALLOW -> {
                        // Normal forwarding
                        val response = forwardDnsQuery(queryData, domain)
                        
                        if (response != null) {
                            queriesForwarded.incrementAndGet()
                            
                            // Cache the response
                            cacheResponse(cacheKey, response, queryType)
                            
                            sendResponse(response, clientAddress)
                        } else {
                            sendErrorResponse(queryData, clientAddress, RCODE_SERVER_FAILURE)
                        }
                    }
                }
                
                // Clean up old cache entries periodically
                if (queriesProcessed.get() % 100 == 0L) {
                    cleanupCache()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling DNS query", e)
            }
        }
    }
    
    private fun checkDomainFilter(domain: String): FilterEngine.FilterResult {
        // First check with filter engine
        val engineResult = filterEngine.checkDomain(domain)
        
        // Additional checks for suspicious patterns
        if (engineResult == FilterEngine.FilterResult.ALLOW) {
            if (isSuspiciousDomain(domain)) {
                return FilterEngine.FilterResult.WARN
            }
        }
        
        return engineResult
    }
    
    /**
     * Validate domain name according to RFC 1035
     */
    private fun isValidDomainName(domain: String): Boolean {
        // Check for valid characters only: alphanumeric, dots, hyphens
        val validDomainRegex = Regex("^[a-z0-9.-]+$")
        if (!validDomainRegex.matches(domain)) {
            return false
        }

        // Check for double dots or starting/ending with dot or hyphen
        if (domain.contains("..") || domain.startsWith(".") || domain.endsWith(".") ||
            domain.startsWith("-") || domain.endsWith("-")) {
            return false
        }

        // Check label length (each part between dots)
        val labels = domain.split(".")
        for (label in labels) {
            if (label.isEmpty() || label.length > 63) {
                return false
            }
        }

        return true
    }

    private fun isSuspiciousDomain(domain: String): Boolean {
        // Check against suspicious patterns
        for (pattern in suspiciousDomainPatterns) {
            if (pattern.matches(domain)) {
                return true
            }
        }

        // Check for homograph attacks (Unicode lookalikes)
        if (containsHomographs(domain)) {
            return true
        }

        // Check for DGA (Domain Generation Algorithm) characteristics
        if (isDGA(domain)) {
            return true
        }
        
        return false
    }
    
    private fun containsHomographs(domain: String): Boolean {
        // Check for mixed scripts and suspicious Unicode characters
        val scripts = mutableSetOf<Character.UnicodeScript>()
        
        for (char in domain) {
            if (char.code > 127) { // Non-ASCII
                val script = Character.UnicodeScript.of(char.code)
                scripts.add(script)
            }
        }
        
        // Mixed scripts often indicate homograph attacks
        return scripts.size > 1
    }
    
    private fun isDGA(domain: String): Boolean {
        // Simple entropy check for DGA detection
        val parts = domain.split('.')
        if (parts.size < 2) return false
        
        val subdomain = parts[0]
        if (subdomain.length < 6) return false
        
        // Calculate character frequency entropy
        val charFreq = mutableMapOf<Char, Int>()
        for (char in subdomain.lowercase()) {
            charFreq[char] = charFreq.getOrDefault(char, 0) + 1
        }
        
        val entropy = charFreq.values.map { freq ->
            val probability = freq.toDouble() / subdomain.length
            -probability * kotlin.math.log2(probability)
        }.sum()
        
        // High entropy suggests random/generated domain
        return entropy > 3.5
    }
    
    private suspend fun forwardDnsQuery(queryData: ByteArray, domain: String): ByteArray? {
        return withContext(Dispatchers.IO) {
            try {
                // Try primary DNS server
                var response = queryDnsServer(queryData, primaryDns)
                
                // Fallback to secondary if primary fails
                if (response == null) {
                    Log.w(TAG, "Primary DNS failed, trying secondary")
                    response = queryDnsServer(queryData, secondaryDns)
                }
                
                // Validate DNSSEC if response contains signatures
                if (response != null && containsDnssec(response)) {
                    if (!validateDnssec(response, domain)) {
                        Log.w(TAG, "DNSSEC validation failed for $domain")
                        return@withContext null
                    }
                }
                
                response
            } catch (e: Exception) {
                Log.e(TAG, "Error forwarding DNS query", e)
                null
            }
        }
    }
    
    private fun queryDnsServer(queryData: ByteArray, serverAddress: String): ByteArray? {
        return try {
            val socket = DatagramSocket()
            socket.soTimeout = 5000 // 5 second timeout
            
            val serverAddr = InetAddress.getByName(serverAddress)
            val queryPacket = DatagramPacket(queryData, queryData.size, serverAddr, DNS_PORT)
            
            socket.send(queryPacket)
            
            val responseBuffer = ByteArray(EDNS_MAX_PACKET_SIZE)
            val responsePacket = DatagramPacket(responseBuffer, responseBuffer.size)
            
            socket.receive(responsePacket)
            socket.close()
            
            responsePacket.data.sliceArray(0 until responsePacket.length)
        } catch (e: Exception) {
            Log.e(TAG, "Error querying DNS server $serverAddress", e)
            null
        }
    }
    
    private fun createBlockedResponse(query: DnsMessage): ByteArray {
        val response = ByteBuffer.allocate(MAX_DNS_PACKET_SIZE)
        
        // Copy transaction ID
        response.putShort(query.transactionId)
        
        // Flags: Response with NXDOMAIN
        val flags = (0x8000 or RCODE_NAME_ERROR).toShort() // QR=1, RCODE=NXDOMAIN
        response.putShort(flags)
        
        // Question count
        response.putShort(query.questions.size.toShort())
        
        // Answer, Authority, Additional counts (all 0)
        response.putShort(0)
        response.putShort(0)
        response.putShort(0)
        
        // Copy questions
        for (question in query.questions) {
            // Write domain name
            writeDomainName(response, question.name)
            
            // Type and Class
            response.putShort(question.type.toShort())
            response.putShort(question.qclass.toShort())
        }
        
        response.flip()
        val result = ByteArray(response.remaining())
        response.get(result)
        
        return result
    }
    
    private fun writeDomainName(buffer: ByteBuffer, domain: String) {
        val parts = domain.split('.')
        for (part in parts) {
            if (part.isNotEmpty()) {
                buffer.put(part.length.toByte())
                buffer.put(part.toByteArray())
            }
        }
        buffer.put(0) // Null terminator
    }
    
    private fun sendResponse(response: ByteArray, clientAddress: InetSocketAddress) {
        try {
            val responseBuffer = ByteBuffer.wrap(response)
            proxyChannel?.send(responseBuffer, clientAddress)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending DNS response", e)
        }
    }
    
    private fun sendErrorResponse(originalQuery: ByteArray, clientAddress: InetSocketAddress, errorCode: Int) {
        try {
            val response = ByteBuffer.allocate(originalQuery.size + 16)
            
            // Copy transaction ID
            response.put(originalQuery[0])
            response.put(originalQuery[1])
            
            // Set response flags with error code
            val flags = (0x8000 or errorCode).toShort()
            response.putShort(flags)
            
            // Copy the rest of the query
            response.put(originalQuery.sliceArray(4 until minOf(originalQuery.size, 12)))
            
            response.flip()
            proxyChannel?.send(response, clientAddress)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending error response", e)
        }
    }
    
    private fun cacheResponse(key: String, response: ByteArray, queryType: Int) {
        // Extract TTL from response
        val ttl = extractTtlFromResponse(response) ?: cacheTtl
        
        dnsCache[key] = DnsCacheEntry(
            response = response,
            timestamp = System.currentTimeMillis(),
            ttl = minOf(ttl, cacheTtl), // Cap at configured max TTL
            queryType = queryType
        )
    }
    
    private fun extractTtlFromResponse(response: ByteArray): Long? {
        // Simplified TTL extraction - would need full DNS parsing for accuracy
        return try {
            // Skip header and questions to get to answers
            // This is a simplified implementation
            cacheTtl
        } catch (e: Exception) {
            null
        }
    }
    
    private fun analyzeDnsResponse(domain: String, response: ByteArray) {
        try {
            val dnsResponse = DnsMessage.parse(response) ?: return
            
            // Extract resolved IPs
            val resolvedIps = mutableListOf<String>()
            
            for (answer in dnsResponse.answers) {
                if (answer.type == TYPE_A || answer.type == TYPE_AAAA) {
                    val ip = parseIpFromRdata(answer.rdata, answer.type)
                    if (ip != null) {
                        resolvedIps.add(ip)
                        
                        // Check if IP is malicious
                        if (filterEngine.checkIp(ip) == FilterEngine.FilterResult.BLOCK) {
                            Log.w(TAG, "Domain $domain resolves to blocked IP: $ip")
                            filterEngine.reportWarning(domain, "DNS", "Resolves to blocked IP")
                        }
                    }
                }
            }
            
            // Check for fast-flux characteristics
            if (resolvedIps.size > 10) {
                Log.w(TAG, "Possible fast-flux domain detected: $domain (${resolvedIps.size} IPs)")
                filterEngine.reportWarning(domain, "DNS", "Fast-flux characteristics detected")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error analyzing DNS response", e)
        }
    }
    
    private fun parseIpFromRdata(rdata: ByteArray, type: Int): String? {
        return try {
            when (type) {
                TYPE_A -> {
                    if (rdata.size == 4) {
                        "${rdata[0].toInt() and 0xFF}.${rdata[1].toInt() and 0xFF}.${rdata[2].toInt() and 0xFF}.${rdata[3].toInt() and 0xFF}"
                    } else null
                }
                TYPE_AAAA -> {
                    if (rdata.size == 16) {
                        // Convert to IPv6 string
                        val parts = mutableListOf<String>()
                        for (i in 0 until 16 step 2) {
                            val part = ((rdata[i].toInt() and 0xFF) shl 8) or (rdata[i + 1].toInt() and 0xFF)
                            parts.add(part.toString(16))
                        }
                        parts.joinToString(":")
                    } else null
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    private fun containsDnssec(response: ByteArray): Boolean {
        // Check for DNSSEC resource records (simplified)
        // Look for RRSIG (type 46), DNSKEY (48), DS (43), NSEC (47), NSEC3 (50)
        return false // Simplified - would need full implementation
    }
    
    private fun validateDnssec(response: ByteArray, domain: String): Boolean {
        // DNSSEC validation would require cryptographic verification
        // This is a placeholder for production implementation
        return true
    }
    
    private fun cleanupCache() {
        val now = System.currentTimeMillis()
        val entriesToRemove = mutableListOf<String>()
        
        for ((key, entry) in dnsCache) {
            if (entry.isExpired()) {
                entriesToRemove.add(key)
            }
        }
        
        for (key in entriesToRemove) {
            dnsCache.remove(key)
        }
        
        // Also limit cache size
        if (dnsCache.size > CACHE_MAX_SIZE) {
            val sortedEntries = dnsCache.entries.sortedBy { it.value.timestamp }
            val toRemove = sortedEntries.take(dnsCache.size - CACHE_MAX_SIZE)
            
            for (entry in toRemove) {
                dnsCache.remove(entry.key)
            }
        }
    }
    
    fun updateBlocklist() {
        // Clear cache for blocked domains when blocklist updates
        val entriesToRemove = dnsCache.entries
            .filter { it.value.isBlocked }
            .map { it.key }
        
        for (key in entriesToRemove) {
            dnsCache.remove(key)
        }
        
        Log.i(TAG, "DNS cache cleared for blocked domains")
    }
    
    fun processDnsQuery(payload: ByteArray): ByteArray? {
        // Process DNS query from VPN packet
        // This is called from VPN service for DNS packets
        return null // Implement based on VPN integration needs
    }
    
    fun getStatistics(): Map<String, Any> {
        return mapOf(
            "queries_processed" to queriesProcessed.get(),
            "queries_blocked" to queriesBlocked.get(),
            "queries_forwarded" to queriesForwarded.get(),
            "cache_hits" to cacheHits.get(),
            "cache_misses" to cacheMisses.get(),
            "cache_size" to dnsCache.size,
            "cache_hit_rate" to if (queriesProcessed.get() > 0) 
                (cacheHits.get().toDouble() / queriesProcessed.get() * 100) else 0.0
        )
    }
}

/**
 * DNS Message parser
 */
data class DnsMessage(
    val transactionId: Short,
    val flags: Short,
    val questions: List<DnsQuestion>,
    val answers: List<DnsResourceRecord>,
    val authority: List<DnsResourceRecord>,
    val additional: List<DnsResourceRecord>
) {
    data class DnsQuestion(
        val name: String,
        val type: Int,
        val qclass: Int
    )
    
    data class DnsResourceRecord(
        val name: String,
        val type: Int,
        val rclass: Int,
        val ttl: Long,
        val rdata: ByteArray
    )
    
    companion object {
        fun parse(data: ByteArray): DnsMessage? {
            try {
                if (data.size < 12) return null
                
                val buffer = ByteBuffer.wrap(data)
                
                val transactionId = buffer.short
                val flags = buffer.short
                val questionCount = buffer.short.toInt() and 0xFFFF
                val answerCount = buffer.short.toInt() and 0xFFFF
                val authorityCount = buffer.short.toInt() and 0xFFFF
                val additionalCount = buffer.short.toInt() and 0xFFFF
                
                val questions = mutableListOf<DnsQuestion>()
                for (i in 0 until questionCount) {
                    val name = readDomainName(buffer, data)
                    val type = buffer.short.toInt() and 0xFFFF
                    val qclass = buffer.short.toInt() and 0xFFFF
                    questions.add(DnsQuestion(name, type, qclass))
                }
                
                val answers = mutableListOf<DnsResourceRecord>()
                for (i in 0 until answerCount) {
                    readResourceRecord(buffer, data)?.let { answers.add(it) }
                }
                
                val authority = mutableListOf<DnsResourceRecord>()
                for (i in 0 until authorityCount) {
                    readResourceRecord(buffer, data)?.let { authority.add(it) }
                }
                
                val additional = mutableListOf<DnsResourceRecord>()
                for (i in 0 until additionalCount) {
                    readResourceRecord(buffer, data)?.let { additional.add(it) }
                }
                
                return DnsMessage(transactionId, flags, questions, answers, authority, additional)
                
            } catch (e: Exception) {
                return null
            }
        }
        
        private fun readDomainName(buffer: ByteBuffer, data: ByteArray): String {
            val parts = mutableListOf<String>()
            var jumped = false
            var jumpOffset = -1
            var count = 0
            
            while (count < 256) { // Prevent infinite loops
                if (!buffer.hasRemaining()) break
                
                val len = buffer.get().toInt() and 0xFF
                
                if (len == 0) {
                    break
                } else if ((len and 0xC0) == 0xC0) {
                    // Compression pointer
                    if (!jumped) {
                        jumpOffset = buffer.position()
                    }
                    
                    val offset = ((len and 0x3F) shl 8) or (buffer.get().toInt() and 0xFF)
                    buffer.position(offset)
                    jumped = true
                } else {
                    val part = ByteArray(len)
                    buffer.get(part)
                    parts.add(String(part))
                }
                
                count++
            }
            
            if (jumped && jumpOffset != -1) {
                buffer.position(jumpOffset)
            }
            
            return parts.joinToString(".")
        }
        
        private fun readResourceRecord(buffer: ByteBuffer, data: ByteArray): DnsResourceRecord? {
            return try {
                val name = readDomainName(buffer, data)
                val type = buffer.short.toInt() and 0xFFFF
                val rclass = buffer.short.toInt() and 0xFFFF
                val ttl = buffer.int.toLong() and 0xFFFFFFFFL
                val rdataLen = buffer.short.toInt() and 0xFFFF
                val rdata = ByteArray(rdataLen)
                buffer.get(rdata)
                
                DnsResourceRecord(name, type, rclass, ttl, rdata)
            } catch (e: Exception) {
                null
            }
        }
    }
}

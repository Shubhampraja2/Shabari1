package com.reactnativeproxyengine

import kotlinx.coroutines.*
import okhttp3.*
import okio.Buffer
import okio.BufferedSink
import okio.BufferedSource
import okio.buffer
import java.io.IOException
import java.net.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class ProxyServer {
    private var serverSocket: ServerSocket? = null
    private var isRunning = AtomicBoolean(false)
    private var proxyJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Statistics
    private val requestCount = AtomicLong(0)
    private val bytesTransferred = AtomicLong(0)
    
    // Configuration
    data class ProxyConfig(
        val host: String = "127.0.0.1",
        val port: Int = 8080,
        val username: String? = null,
        val password: String? = null,
        val type: ProxyType = ProxyType.HTTP
    )
    
    enum class ProxyType {
        HTTP, HTTPS, SOCKS4, SOCKS5
    }
    
    private var config = ProxyConfig()
    private var threatDetectionEngine: FilterEngine? = null
    private var adBlockerManager: AdBlockerManager? = null
    private var eventCallback: ((String, String, String) -> Unit)? = null
    
    fun setConfig(newConfig: ProxyConfig) {
        config = newConfig
    }
    
    fun setThreatDetectionEngine(engine: FilterEngine) {
        threatDetectionEngine = engine
    }
    
    fun setAdBlockerManager(manager: AdBlockerManager) {
        adBlockerManager = manager
        // Set callback to notify about detected ads
        manager.setAdDetectionCallback { domain, url, method ->
            eventCallback?.invoke(domain, "Ad detected from $domain", "proxy_ad_detected")
        }
    }

    fun setEventCallback(callback: (String, String, String) -> Unit) {
        eventCallback = callback
    }
    
    fun start(config: ProxyConfig): Boolean {
        if (isRunning.get()) {
            return false
        }
        
        this.config = config
        
        return try {
            serverSocket = ServerSocket(config.port, 50, InetAddress.getByName(config.host))
            isRunning.set(true)
            
            proxyJob = scope.launch {
                acceptConnections()
            }
            
            true
        } catch (e: Exception) {
            false
        }
    }
    
    fun stop(): Boolean {
        if (!isRunning.get()) {
            return false
        }
        
        isRunning.set(false)
        proxyJob?.cancel()
        
        try {
            serverSocket?.close()
            serverSocket = null
            return true
        } catch (e: Exception) {
            return false
        }
    }
    
    fun isRunning(): Boolean = isRunning.get()
    
    fun getStats(): Map<String, Any> {
        return mapOf(
            "isRunning" to isRunning.get(),
            "requestCount" to requestCount.get(),
            "bytesTransferred" to bytesTransferred.get(),
            "config" to mapOf(
                "host" to config.host,
                "port" to config.port,
                "type" to config.type.name
            )
        )
    }
    
    private suspend fun acceptConnections() {
        while (isRunning.get() && !Thread.currentThread().isInterrupted) {
            try {
                val clientSocket = serverSocket?.accept()
                if (clientSocket != null) {
                    scope.launch {
                        handleClient(clientSocket)
                    }
                }
            } catch (e: Exception) {
                if (isRunning.get()) {
                    // Log error but continue
                }
            }
        }
    }
    
    private suspend fun handleClient(clientSocket: Socket) {
        try {
            when (config.type) {
                ProxyType.HTTP, ProxyType.HTTPS -> handleHttpProxy(clientSocket)
                ProxyType.SOCKS4 -> handleSocks4Proxy(clientSocket)
                ProxyType.SOCKS5 -> handleSocks5Proxy(clientSocket)
            }
        } catch (e: Exception) {
            // Log error
        } finally {
            try {
                clientSocket.close()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }
    
    private suspend fun handleHttpProxy(clientSocket: Socket) {
        val clientInput = clientSocket.getInputStream().bufferedReader()
        val clientOutput = clientSocket.getOutputStream()
        
        try {
            val requestLine = clientInput.readLine() ?: return
            val parts = requestLine.split(" ")
            
            if (parts.size < 3) return
            
            val method = parts[0]
            val url = parts[1]
            val version = parts[2]
            
            requestCount.incrementAndGet()
            
            if (method == "CONNECT") {
                handleHttpsConnect(clientSocket, url, clientOutput)
            } else {
                handleHttpRequest(clientSocket, method, url, version, clientInput, clientOutput)
            }
        } catch (e: Exception) {
            // Log error
        }
    }
    
    private suspend fun handleHttpsConnect(clientSocket: Socket, url: String, clientOutput: java.io.OutputStream) {
        val parts = url.split(":")
        val host = parts[0]
        val port = if (parts.size > 1) parts[1].toInt() else 443
        
        // Check threat detection for HTTPS CONNECT requests
        val threatResult = checkThreatDetection("https://$host")
        if (threatResult.shouldBlock) {
            sendBlockedConnectResponse(clientOutput, threatResult.reason)
            return
        }
        
        try {
            val targetSocket = Socket(host, port)
            
            // Send 200 Connection established
            clientOutput.write("HTTP/1.1 200 Connection established\r\n\r\n".toByteArray())
            clientOutput.flush()
            
            // Start tunneling
            val job1 = scope.launch {
                tunnel(clientSocket.getInputStream(), targetSocket.getOutputStream())
            }
            
            val job2 = scope.launch {
                tunnel(targetSocket.getInputStream(), clientSocket.getOutputStream())
            }
            
            joinAll(job1, job2)
            
            targetSocket.close()
        } catch (e: Exception) {
            sendErrorResponse(clientOutput, "502 Bad Gateway", "Unable to connect to destination server")
        }
    }
    
    private suspend fun handleHttpRequest(
        clientSocket: Socket,
        method: String,
        url: String,
        version: String,
        clientInput: java.io.BufferedReader,
        clientOutput: java.io.OutputStream
    ) {
        val headers = mutableMapOf<String, String>()
        
        // Read headers
        var line = clientInput.readLine()
        while (line != null && line.isNotEmpty()) {
            val colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
                val key = line.substring(0, colonIndex).trim()
                val value = line.substring(colonIndex + 1).trim()
                headers[key] = value
            }
            line = clientInput.readLine()
        }
        
        try {
            // Check threat detection before processing request
            val threatResult = checkThreatDetection(url)
            if (threatResult.shouldBlock) {
                sendBlockedResponse(clientOutput, threatResult.reason)
                return
            }
            
            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
            
            val requestBuilder = Request.Builder().url(url)
            
            // Add headers
            headers.forEach { (key, value) ->
                if (key.lowercase() != "host" && key.lowercase() != "connection") {
                    requestBuilder.addHeader(key, value)
                }
            }
            
            // Handle request body for POST/PUT
            if (method in listOf("POST", "PUT", "PATCH")) {
                val contentLength = headers["Content-Length"]?.toIntOrNull() ?: 0
                if (contentLength > 0) {
                    val body = CharArray(contentLength)
                    clientInput.read(body, 0, contentLength)
                    requestBuilder.method(method, RequestBody.create(null, String(body)))
                } else {
                    requestBuilder.method(method, RequestBody.create(null, ""))
                }
            }
            
            val request = requestBuilder.build()
            val response = client.newCall(request).execute()
            
            // Send response
            val responseHeaders = StringBuilder()
            responseHeaders.append("$version ${response.code} ${response.message}\r\n")
            
            response.headers.forEach { (name, value) ->
                responseHeaders.append("$name: $value\r\n")
            }
            responseHeaders.append("\r\n")
            
            clientOutput.write(responseHeaders.toString().toByteArray())
            
            response.body?.let { body ->
                val bytes = body.bytes()
                clientOutput.write(bytes)
                bytesTransferred.addAndGet(bytes.size.toLong())
            }
            
            clientOutput.flush()
            response.close()
            
        } catch (e: Exception) {
            sendErrorResponse(clientOutput, "502 Bad Gateway", "Request processing failed: ${e.message}")
        }
    }
    
    private suspend fun handleSocks4Proxy(clientSocket: Socket) {
        // SOCKS4 implementation
        val input = clientSocket.getInputStream()
        val output = clientSocket.getOutputStream()
        
        try {
            val buffer = ByteArray(1024)
            val bytesRead = input.read(buffer)
            
            if (bytesRead < 8) {
                output.write(byteArrayOf(0x00, 0x5B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                return
            }
            
            val version = buffer[0].toInt()
            val command = buffer[1].toInt()
            val port = ((buffer[2].toInt() and 0xFF) shl 8) or (buffer[3].toInt() and 0xFF)
            val ip = "${buffer[4].toInt() and 0xFF}.${buffer[5].toInt() and 0xFF}.${buffer[6].toInt() and 0xFF}.${buffer[7].toInt() and 0xFF}"
            
            if (version != 4 || command != 1) {
                output.write(byteArrayOf(0x00, 0x5B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                return
            }
            
            try {
                val targetSocket = Socket(ip, port)
                
                // Send success response
                output.write(byteArrayOf(0x00, 0x5A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                output.flush()
                
                // Start tunneling
                val job1 = scope.launch {
                    tunnel(clientSocket.getInputStream(), targetSocket.getOutputStream())
                }
                
                val job2 = scope.launch {
                    tunnel(targetSocket.getInputStream(), clientSocket.getOutputStream())
                }
                
                joinAll(job1, job2)
                
                targetSocket.close()
                
            } catch (e: Exception) {
                output.write(byteArrayOf(0x00, 0x5B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
            }
            
        } catch (e: Exception) {
            // Log error
        }
    }
    
    private suspend fun handleSocks5Proxy(clientSocket: Socket) {
        // SOCKS5 implementation
        val input = clientSocket.getInputStream()
        val output = clientSocket.getOutputStream()
        
        try {
            // Authentication negotiation
            val buffer = ByteArray(1024)
            var bytesRead = input.read(buffer)
            
            if (bytesRead < 3) return
            
            val version = buffer[0].toInt()
            val nMethods = buffer[1].toInt()
            
            if (version != 5) return
            
            // Send no authentication required
            output.write(byteArrayOf(0x05, 0x00))
            output.flush()
            
            // Read connection request
            bytesRead = input.read(buffer)
            if (bytesRead < 4) return
            
            val cmd = buffer[1].toInt()
            val atyp = buffer[3].toInt()
            
            if (cmd != 1) { // Only support CONNECT
                output.write(byteArrayOf(0x05, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                return
            }
            
            val host: String
            val port: Int
            
            when (atyp) {
                1 -> { // IPv4
                    host = "${buffer[4].toInt() and 0xFF}.${buffer[5].toInt() and 0xFF}.${buffer[6].toInt() and 0xFF}.${buffer[7].toInt() and 0xFF}"
                    port = ((buffer[8].toInt() and 0xFF) shl 8) or (buffer[9].toInt() and 0xFF)
                }
                3 -> { // Domain name
                    val domainLength = buffer[4].toInt() and 0xFF
                    host = String(buffer, 5, domainLength)
                    port = ((buffer[5 + domainLength].toInt() and 0xFF) shl 8) or (buffer[6 + domainLength].toInt() and 0xFF)
                }
                else -> {
                    output.write(byteArrayOf(0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                    return
                }
            }
            
            try {
                val targetSocket = Socket(host, port)
                
                // Send success response
                output.write(byteArrayOf(0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
                output.flush()
                
                requestCount.incrementAndGet()
                
                // Start tunneling
                val job1 = scope.launch {
                    tunnel(clientSocket.getInputStream(), targetSocket.getOutputStream())
                }
                
                val job2 = scope.launch {
                    tunnel(targetSocket.getInputStream(), clientSocket.getOutputStream())
                }
                
                joinAll(job1, job2)
                
                targetSocket.close()
                
            } catch (e: Exception) {
                output.write(byteArrayOf(0x05, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00))
            }
            
        } catch (e: Exception) {
            // Log error
        }
    }
    
    private suspend fun tunnel(input: java.io.InputStream, output: java.io.OutputStream) {
        withContext(Dispatchers.IO) {
            try {
                val buffer = ByteArray(4096)
                var bytesRead: Int
                
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    output.flush()
                    bytesTransferred.addAndGet(bytesRead.toLong())
                }
            } catch (e: Exception) {
                // Connection closed or error
            }
        }
    }
    
    // Threat detection integration methods
    
    private data class ThreatCheckResult(
        val shouldBlock: Boolean,
        val reason: String,
        val threatLevel: String = "medium"
    )
    
    private fun checkThreatDetection(url: String): ThreatCheckResult {
        val engine = threatDetectionEngine ?: return ThreatCheckResult(false, "")
        
        try {
            // Extract domain and IP from URL
            val domain = extractDomain(url)
            val ip = extractIP(url)
            
            // Check domain first
            val domainResult = engine.checkDomain(domain)
            when (domainResult) {
                FilterEngine.FilterResult.BLOCK -> {
                    eventCallback?.invoke(domain, "Blocked: $domain (malicious domain)", "proxy_domain")
                    return ThreatCheckResult(true, "Blocked: $domain (malicious domain)", "high")
                }
                FilterEngine.FilterResult.WARN -> {
                    engine.logWarning("Suspicious domain accessed: $domain", "proxy")
                    return ThreatCheckResult(false, "Warning: $domain (suspicious domain)", "medium")
                }
                FilterEngine.FilterResult.MONITOR -> {
                    engine.logActivity("Monitored domain accessed: $domain", "proxy")
                }
                FilterEngine.FilterResult.ALLOW -> {
                    // Continue to IP check
                }
            }
            
            // Check IP if we have one
            if (ip.isNotEmpty() && ip != domain) {
                val ipResult = engine.checkIp(ip)
                when (ipResult) {
                    FilterEngine.FilterResult.BLOCK -> {
                        eventCallback?.invoke(ip, "Blocked: $ip (malicious IP address)", "proxy_ip")
                        return ThreatCheckResult(true, "Blocked: $ip (malicious IP address)", "high")
                    }
                    FilterEngine.FilterResult.WARN -> {
                        engine.logWarning("Suspicious IP accessed: $ip", "proxy")
                        return ThreatCheckResult(false, "Warning: $ip (suspicious IP)", "medium")
                    }
                    FilterEngine.FilterResult.MONITOR -> {
                        engine.logActivity("Monitored IP accessed: $ip", "proxy")
                    }
                    FilterEngine.FilterResult.ALLOW -> {
                        // Continue
                    }
                }
            }
            
            // Additional heuristic checks
            val heuristicResult = performHeuristicChecks(url, domain)
            if (heuristicResult.shouldBlock) {
                return heuristicResult
            }
            
            return ThreatCheckResult(false, "")
            
        } catch (e: Exception) {
            // On error, allow but log
            return ThreatCheckResult(false, "Error checking threat: ${e.message}")
        }
    }
    
    private fun extractDomain(url: String): String {
        return try {
            val urlWithProtocol = if (!url.startsWith("http://") && !url.startsWith("https://")) {
                "http://$url"
            } else {
                url
            }
            
            val uri = java.net.URI(urlWithProtocol)
            uri.host ?: url
        } catch (e: Exception) {
            // If URL parsing fails, return the original URL
            url
        }
    }
    
    private fun extractIP(url: String): String {
        return try {
            val domain = extractDomain(url)
            
            // Check if domain is already an IP address
            if (isValidIP(domain)) {
                return domain
            }
            
            // Try to resolve domain to IP
            val address = java.net.InetAddress.getByName(domain)
            address.hostAddress ?: ""
        } catch (e: Exception) {
            // Unable to resolve IP
            ""
        }
    }
    
    private fun isValidIP(address: String): Boolean {
        return try {
            val parts = address.split(".")
            if (parts.size != 4) return false
            
            parts.all { part ->
                val num = part.toIntOrNull()
                num != null && num in 0..255
            }
        } catch (e: Exception) {
            false
        }
    }
    
    private fun performHeuristicChecks(url: String, domain: String): ThreatCheckResult {
        try {
            // Check for suspicious patterns in URLs
            val suspiciousPatterns = listOf(
                "phishing", "fraud", "scam", "malware", "virus", "trojan",
                "hack", "crack", "keygen", "warez", "torrent", "pirat",
                "xxx", "porn", "adult", "casino", "gambling", "drugs"
            )
            
            val urlLower = url.lowercase()
            val domainLower = domain.lowercase()
            
            // Check for suspicious keywords
            for (pattern in suspiciousPatterns) {
                if (domainLower.contains(pattern) || urlLower.contains(pattern)) {
                    return ThreatCheckResult(
                        false, 
                        "Warning: Potentially suspicious content detected",
                        "medium"
                    )
                }
            }
            
            // Check for typosquatting patterns (common misspellings of popular sites)
            val popularDomains = mapOf(
                "gooogle.com" to "google.com",
                "youtub.com" to "youtube.com",
                "facebok.com" to "facebook.com",
                "twiter.com" to "twitter.com",
                "amazom.com" to "amazon.com",
                "paypa1.com" to "paypal.com",
                "microsft.com" to "microsoft.com"
            )
            
            for ((typo, legitimate) in popularDomains) {
                if (domainLower.contains(typo)) {
                    val reason = "Blocked: Potential typosquatting of $legitimate"
                    eventCallback?.invoke(domain, reason, "proxy_typosquatting")
                    return ThreatCheckResult(true, reason, "high")
                }
            }
            
            // Check for suspicious TLDs
            val suspiciousTlds = listOf(".tk", ".ml", ".ga", ".cf", ".click", ".download")
            for (tld in suspiciousTlds) {
                if (domainLower.endsWith(tld)) {
                    return ThreatCheckResult(
                        false,
                        "Warning: Domain uses suspicious TLD ($tld)",
                        "medium"
                    )
                }
            }
            
            // Check for excessive subdomains (potential DGA)
            val subdomains = domain.split(".")
            if (subdomains.size > 4) {
                return ThreatCheckResult(
                    false,
                    "Warning: Unusual subdomain structure detected",
                    "low"
                )
            }
            
            return ThreatCheckResult(false, "")
            
        } catch (e: Exception) {
            return ThreatCheckResult(false, "")
        }
    }
    
    private fun sendBlockedResponse(clientOutput: java.io.OutputStream, reason: String) {
        try {
            val blockedHtml = """
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Shabari Protection - Blocked</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .blocked { color: #d32f2f; }
                        .logo { color: #1976d2; font-size: 24px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="logo">🛡️ Shabari Protection</div>
                    <h1 class="blocked">Access Blocked</h1>
                    <p>This request was blocked for your protection.</p>
                    <p><strong>Reason:</strong> $reason</p>
                    <p><small>If you believe this is an error, please contact support.</small></p>
                </body>
                </html>
            """.trimIndent()
            
            val response = "HTTP/1.1 403 Forbidden\r\n" +
                    "Content-Type: text/html\r\n" +
                    "Content-Length: ${blockedHtml.length}\r\n" +
                    "Connection: close\r\n" +
                    "\r\n" +
                    blockedHtml
            
            clientOutput.write(response.toByteArray())
            clientOutput.flush()
            
        } catch (e: Exception) {
            // Fallback simple blocked response
            val simpleResponse = "HTTP/1.1 403 Forbidden\r\n\r\nBlocked by Shabari Protection"
            clientOutput.write(simpleResponse.toByteArray())
            clientOutput.flush()
        }
    }
    
    private fun sendBlockedConnectResponse(clientOutput: java.io.OutputStream, reason: String) {
        try {
            val response = "HTTP/1.1 403 Forbidden\r\n" +
                    "Content-Type: text/plain\r\n" +
                    "Connection: close\r\n" +
                    "\r\n" +
                    "Connection blocked by Shabari Protection: $reason"
            
            clientOutput.write(response.toByteArray())
            clientOutput.flush()
            
        } catch (e: Exception) {
            // Fallback
            val simpleResponse = "HTTP/1.1 403 Forbidden\r\n\r\nBlocked by Shabari Protection"
            clientOutput.write(simpleResponse.toByteArray())
            clientOutput.flush()
        }
    }
    
    private fun sendErrorResponse(clientOutput: java.io.OutputStream, status: String, message: String) {
        try {
            val errorHtml = """
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Shabari Protection - Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #f44336; }
                        .logo { color: #1976d2; font-size: 24px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="logo">🛡️ Shabari Protection</div>
                    <h1 class="error">$status</h1>
                    <p>$message</p>
                    <p><small>Proxy server error - please try again later.</small></p>
                </body>
                </html>
            """.trimIndent()
            
            val response = "HTTP/1.1 $status\r\n" +
                    "Content-Type: text/html\r\n" +
                    "Content-Length: ${errorHtml.length}\r\n" +
                    "Connection: close\r\n" +
                    "\r\n" +
                    errorHtml
            
            clientOutput.write(response.toByteArray())
            clientOutput.flush()
            
        } catch (e: Exception) {
            // Fallback simple error response
            val simpleResponse = "HTTP/1.1 $status\r\n\r\n$message"
            clientOutput.write(simpleResponse.toByteArray())
            clientOutput.flush()
        }
    }
}


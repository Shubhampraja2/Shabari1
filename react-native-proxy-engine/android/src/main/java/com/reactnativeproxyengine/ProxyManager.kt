package com.reactnativeproxyengine

import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ProxyManager {
    private val proxyServer = ProxyServer()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    fun startProxy(config: Map<String, Any>): Map<String, Any> {
        return try {
            val host = config["host"] as? String ?: "127.0.0.1"
            val port = (config["port"] as? Number)?.toInt() ?: 8080
            val username = config["username"] as? String
            val password = config["password"] as? String
            val typeStr = config["type"] as? String ?: "HTTP"
            
            val type = when (typeStr.uppercase()) {
                "HTTP" -> ProxyServer.ProxyType.HTTP
                "HTTPS" -> ProxyServer.ProxyType.HTTPS
                "SOCKS4" -> ProxyServer.ProxyType.SOCKS4
                "SOCKS5" -> ProxyServer.ProxyType.SOCKS5
                else -> ProxyServer.ProxyType.HTTP
            }
            
            val proxyConfig = ProxyServer.ProxyConfig(
                host = host,
                port = port,
                username = username,
                password = password,
                type = type
            )
            
            val success = proxyServer.start(proxyConfig)
            
            mapOf(
                "success" to success,
                "message" to if (success) "Proxy server started successfully" else "Failed to start proxy server",
                "data" to mapOf(
                    "host" to host,
                    "port" to port,
                    "type" to typeStr
                )
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "Error starting proxy: ${e.message}"
            )
        }
    }
    
    fun stopProxy(): Map<String, Any> {
        return try {
            val success = proxyServer.stop()
            
            mapOf(
                "success" to success,
                "message" to if (success) "Proxy server stopped successfully" else "Failed to stop proxy server"
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "Error stopping proxy: ${e.message}"
            )
        }
    }
    
    fun getProxyStatus(): Map<String, Any> {
        return try {
            val stats = proxyServer.getStats()
            
            mapOf(
                "success" to true,
                "data" to stats
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "Error getting proxy status: ${e.message}"
            )
        }
    }
    
    fun setProxyConfig(config: Map<String, Any>): Map<String, Any> {
        return try {
            val host = config["host"] as? String ?: "127.0.0.1"
            val port = (config["port"] as? Number)?.toInt() ?: 8080
            val username = config["username"] as? String
            val password = config["password"] as? String
            val typeStr = config["type"] as? String ?: "HTTP"
            
            val type = when (typeStr.uppercase()) {
                "HTTP" -> ProxyServer.ProxyType.HTTP
                "HTTPS" -> ProxyServer.ProxyType.HTTPS
                "SOCKS4" -> ProxyServer.ProxyType.SOCKS4
                "SOCKS5" -> ProxyServer.ProxyType.SOCKS5
                else -> ProxyServer.ProxyType.HTTP
            }
            
            val proxyConfig = ProxyServer.ProxyConfig(
                host = host,
                port = port,
                username = username,
                password = password,
                type = type
            )
            
            proxyServer.setConfig(proxyConfig)
            
            mapOf(
                "success" to true,
                "message" to "Proxy configuration updated successfully",
                "data" to config
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "Error setting proxy config: ${e.message}"
            )
        }
    }
    
    suspend fun makeProxyRequest(url: String, options: Map<String, Any>?): Map<String, Any> {
        return withContext(Dispatchers.IO) {
            try {
                val method = options?.get("method") as? String ?: "GET"
                val headers = options?.get("headers") as? Map<String, String> ?: emptyMap()
                val body = options?.get("body") as? String
                
                val client = OkHttpClient.Builder()
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .build()
                
                val requestBuilder = Request.Builder().url(url)
                
                // Add headers
                headers.forEach { (key, value) ->
                    requestBuilder.addHeader(key, value)
                }
                
                // Handle request body
                when (method.uppercase()) {
                    "POST", "PUT", "PATCH" -> {
                        val requestBody = body?.toRequestBody("application/json".toMediaTypeOrNull())
                            ?: ByteArray(0).toRequestBody(null, 0, 0)
                        requestBuilder.method(method, requestBody)
                    }
                    else -> requestBuilder.method(method, null)
                }
                
                val request = requestBuilder.build()
                val response = client.newCall(request).execute()
                
                val responseHeaders = mutableMapOf<String, String>()
                response.headers.forEach { (name, value) ->
                    responseHeaders[name] = value
                }
                
                val responseBody = response.body?.string() ?: ""
                
                mapOf(
                    "success" to true,
                    "data" to mapOf(
                        "status" to response.code,
                        "statusText" to response.message,
                        "headers" to responseHeaders,
                        "body" to responseBody
                    )
                )
            } catch (e: Exception) {
                mapOf(
                    "success" to false,
                    "message" to "Error making proxy request: ${e.message}"
                )
            }
        }
    }
    
    fun getProxyStats(): Map<String, Any> {
        return try {
            val stats = proxyServer.getStats()
            
            mapOf(
                "success" to true,
                "data" to stats
            )
        } catch (e: Exception) {
            mapOf(
                "success" to false,
                "message" to "Error getting proxy stats: ${e.message}"
            )
        }
    }
}


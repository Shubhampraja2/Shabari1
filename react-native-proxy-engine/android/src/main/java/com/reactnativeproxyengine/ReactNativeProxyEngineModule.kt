package com.reactnativeproxyengine

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

class ReactNativeProxyEngineModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private val proxyManager = ProxyManager()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    override fun getName(): String {
        return "ReactNativeProxyEngine"
    }
    
    @ReactMethod
    fun startProxy(config: ReadableMap, promise: Promise) {
        try {
            val configMap = config.toHashMap()
            val result = proxyManager.startProxy(configMap)
            
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("success", result["success"] as Boolean)
            resultMap.putString("message", result["message"] as? String)
            
            val data = result["data"] as? Map<String, Any>
            if (data != null) {
                val dataMap = Arguments.createMap()
                data.forEach { (key, value) ->
                    when (value) {
                        is String -> dataMap.putString(key, value)
                        is Int -> dataMap.putInt(key, value)
                        is Double -> dataMap.putDouble(key, value)
                        is Boolean -> dataMap.putBoolean(key, value)
                    }
                }
                resultMap.putMap("data", dataMap)
            }
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PROXY_START_ERROR", "Failed to start proxy: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun stopProxy(promise: Promise) {
        try {
            val result = proxyManager.stopProxy()
            
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("success", result["success"] as Boolean)
            resultMap.putString("message", result["message"] as? String)
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PROXY_STOP_ERROR", "Failed to stop proxy: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun getProxyStatus(promise: Promise) {
        try {
            val result = proxyManager.getProxyStatus()
            
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("success", result["success"] as Boolean)
            
            val data = result["data"] as? Map<String, Any>
            if (data != null) {
                val dataMap = Arguments.createMap()
                convertMapToWritableMap(data, dataMap)
                resultMap.putMap("data", dataMap)
            }
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PROXY_STATUS_ERROR", "Failed to get proxy status: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun setProxyConfig(config: ReadableMap, promise: Promise) {
        try {
            val configMap = config.toHashMap()
            val result = proxyManager.setProxyConfig(configMap)
            
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("success", result["success"] as Boolean)
            resultMap.putString("message", result["message"] as? String)
            
            val data = result["data"] as? Map<String, Any>
            if (data != null) {
                val dataMap = Arguments.createMap()
                convertMapToWritableMap(data, dataMap)
                resultMap.putMap("data", dataMap)
            }
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PROXY_CONFIG_ERROR", "Failed to set proxy config: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun makeProxyRequest(url: String, options: ReadableMap?, promise: Promise) {
        scope.launch {
            try {
                val optionsMap = options?.toHashMap()
                val result = proxyManager.makeProxyRequest(url, optionsMap)
                
                val resultMap = Arguments.createMap()
                resultMap.putBoolean("success", result["success"] as Boolean)
                
                if (result["message"] != null) {
                    resultMap.putString("message", result["message"] as String)
                }
                
                val data = result["data"] as? Map<String, Any>
                if (data != null) {
                    val dataMap = Arguments.createMap()
                    convertMapToWritableMap(data, dataMap)
                    resultMap.putMap("data", dataMap)
                }
                
                promise.resolve(resultMap)
            } catch (e: Exception) {
                promise.reject("PROXY_REQUEST_ERROR", "Failed to make proxy request: ${e.message}", e)
            }
        }
    }
    
    @ReactMethod
    fun getProxyStats(promise: Promise) {
        try {
            val result = proxyManager.getProxyStats()
            
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("success", result["success"] as Boolean)
            
            val data = result["data"] as? Map<String, Any>
            if (data != null) {
                val dataMap = Arguments.createMap()
                convertMapToWritableMap(data, dataMap)
                resultMap.putMap("data", dataMap)
            }
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PROXY_STATS_ERROR", "Failed to get proxy stats: ${e.message}", e)
        }
    }
    
    private fun convertMapToWritableMap(map: Map<String, Any>, writableMap: WritableMap) {
        map.forEach { (key, value) ->
            when (value) {
                is String -> writableMap.putString(key, value)
                is Int -> writableMap.putInt(key, value)
                is Long -> writableMap.putDouble(key, value.toDouble())
                is Double -> writableMap.putDouble(key, value)
                is Float -> writableMap.putDouble(key, value.toDouble())
                is Boolean -> writableMap.putBoolean(key, value)
                is Map<*, *> -> {
                    val nestedMap = Arguments.createMap()
                    @Suppress("UNCHECKED_CAST")
                    convertMapToWritableMap(value as Map<String, Any>, nestedMap)
                    writableMap.putMap(key, nestedMap)
                }
                else -> writableMap.putString(key, value.toString())
            }
        }
    }
    
    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}


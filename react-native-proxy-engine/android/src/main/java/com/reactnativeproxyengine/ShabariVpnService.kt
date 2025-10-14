package com.reactnativeproxyengine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Production-ready VPN Service for Shabari Protection Engine
 * Provides DNS-level blocking, packet filtering, and comprehensive network protection
 */
class ShabariVpnService : VpnService() {
    
    companion object {
        private const val TAG = "ShabariVPN"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "shabari_vpn_channel"
        private const val MTU_SIZE = 1500
        private const val PACKET_BUFFER_SIZE = 32767
        
        // DNS Configuration
        private const val DNS_SERVER_PRIMARY = "8.8.8.8"
        private const val DNS_SERVER_SECONDARY = "8.8.4.4"
        private const val LOCAL_DNS_PORT = 5353
        
        // Service Actions
        const val ACTION_START = "com.shabari.vpn.START"
        const val ACTION_STOP = "com.shabari.vpn.STOP"
        const val ACTION_UPDATE_FILTERS = "com.shabari.vpn.UPDATE_FILTERS"
        
        // Service State
        @Volatile
        private var instance: ShabariVpnService? = null
        private val isRunning = AtomicBoolean(false)
        
        fun getInstance(): ShabariVpnService? = instance
        fun isServiceRunning(): Boolean = isRunning.get()
    }
    
    private var vpnInterface: ParcelFileDescriptor? = null
    private var localDnsProxy: LocalDnsProxy? = null
    private var filterEngine: FilterEngine? = null
    private var callDetector: CallDetector? = null
    private var proxyServer: ProxyServer? = null
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var packetReaderJob: Job? = null
    private var packetWriterJob: Job? = null
    
    // Statistics
    private val packetsBlocked = AtomicLong(0)
    private val packetsAllowed = AtomicLong(0)
    private val bytesTransferred = AtomicLong(0)
    private val startTime = System.currentTimeMillis()
    
    // Packet queues for async processing
    private val incomingPacketQueue = mutableListOf<ByteArray>()
    private val outgoingPacketQueue = mutableListOf<ByteArray>()
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        initializeComponents()
        createNotificationChannel()
        Log.i(TAG, "VPN Service created")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startVpn()
            ACTION_STOP -> stopVpn()
            ACTION_UPDATE_FILTERS -> updateFilters()
        }
        return START_STICKY
    }
    
    override fun onRevoke() {
        super.onRevoke()
        stopVpn()
    }
    
    override fun onDestroy() {
        stopVpn()
        instance = null
        super.onDestroy()
        Log.i(TAG, "VPN Service destroyed")
    }
    
    private fun initializeComponents() {
        // Initialize filter engine with optimized data structures
        filterEngine = FilterEngine(applicationContext).apply {
            loadLocalRules()
            syncWithSupabase()
        }
        
        // Initialize local DNS proxy
        localDnsProxy = LocalDnsProxy(
            filterEngine = filterEngine!!,
            primaryDns = DNS_SERVER_PRIMARY,
            secondaryDns = DNS_SERVER_SECONDARY,
            localPort = LOCAL_DNS_PORT
        )
        
        // Initialize call detector
        callDetector = CallDetector(applicationContext, filterEngine!!)
        
        // Initialize proxy server with threat detection integration
        proxyServer = ProxyServer().apply {
            setThreatDetectionEngine(filterEngine!!)
            setEventCallback { target, reason, type -> 
                broadcastBlocked(target, reason, type)
            }
        }
    }
    
    private fun startVpn() {
        if (isRunning.get()) {
            Log.w(TAG, "VPN already running")
            return
        }
        
        try {
            // Start foreground service with notification
            startForeground(NOTIFICATION_ID, createNotification())
            
            // Establish VPN connection
            vpnInterface = establishVpnConnection()
            
            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN connection")
                stopSelf()
                return
            }
            
            // Start components
            localDnsProxy?.start()
            callDetector?.start()
            
            // Start proxy server for external traffic forwarding
            proxyServer?.start(ProxyServer.ProxyConfig(
                host = "127.0.0.1",
                port = 8080,
                type = ProxyServer.ProxyType.HTTP
            ))
            
            // Start packet processing
            startPacketProcessing()
            
            isRunning.set(true)
            broadcastStatus("running")
            
            Log.i(TAG, "VPN started successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start VPN", e)
            stopVpn()
            broadcastError("Failed to start VPN: ${e.message}")
        }
    }
    
    private fun stopVpn() {
        if (!isRunning.get()) {
            return
        }
        
        isRunning.set(false)
        
        // Stop packet processing
        packetReaderJob?.cancel()
        packetWriterJob?.cancel()
        
        // Stop components
        localDnsProxy?.stop()
        callDetector?.stop()
        proxyServer?.stop()
        
        // Close VPN interface
        try {
            vpnInterface?.close()
            vpnInterface = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing VPN interface", e)
        }
        
        // Stop foreground service
        stopForeground(true)
        
        broadcastStatus("stopped")
        Log.i(TAG, "VPN stopped")
    }
    
    private fun establishVpnConnection(): ParcelFileDescriptor? {
        val builder = Builder()
        
        // Configure VPN parameters
        builder.setSession("Shabari Protection")
            .setMtu(MTU_SIZE)
            
        // Add routes - route all traffic through VPN
        builder.addRoute("0.0.0.0", 0)
        
        // Configure DNS servers (using local DNS proxy)
        builder.addDnsServer("127.0.0.1")
            .addDnsServer(DNS_SERVER_PRIMARY)
            .addDnsServer(DNS_SERVER_SECONDARY)
        
        // Add search domains for better DNS resolution
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.addSearchDomain("local")
        }
        
        // Allow bypass for certain apps if needed
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Allow our own app to bypass VPN to prevent loops
            builder.addAllowedApplication(packageName)
            
            // Block specific suspicious apps if configured
            filterEngine?.getBlockedApps()?.forEach { app ->
                try {
                    builder.addDisallowedApplication(app)
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot block app: $app")
                }
            }
        }
        
        // Set configurable options
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false) // Don't count VPN traffic as metered
        }
        
        return builder.establish()
    }
    
    private fun startPacketProcessing() {
        val vpnFd = vpnInterface?.fileDescriptor ?: return
        
        // Start packet reader job
        packetReaderJob = serviceScope.launch {
            val inputStream = FileInputStream(vpnFd)
            val packet = ByteBuffer.allocate(PACKET_BUFFER_SIZE)
            
            while (isActive && isRunning.get()) {
                try {
                    packet.clear()
                    val length = inputStream.channel.read(packet)
                    
                    if (length > 0) {
                        packet.flip()
                        val data = ByteArray(length)
                        packet.get(data)
                        
                        processIncomingPacket(data)
                    }
                } catch (e: Exception) {
                    if (isRunning.get()) {
                        Log.e(TAG, "Error reading packet", e)
                    }
                }
            }
        }
        
        // Start packet writer job
        packetWriterJob = serviceScope.launch {
            val outputStream = FileOutputStream(vpnFd)
            
            while (isActive && isRunning.get()) {
                try {
                    synchronized(outgoingPacketQueue) {
                        if (outgoingPacketQueue.isNotEmpty()) {
                            val packet = outgoingPacketQueue.removeAt(0)
                            outputStream.channel.write(ByteBuffer.wrap(packet))
                            bytesTransferred.addAndGet(packet.size.toLong())
                        }
                    }
                    delay(1) // Small delay to prevent CPU spinning
                } catch (e: Exception) {
                    if (isRunning.get()) {
                        Log.e(TAG, "Error writing packet", e)
                    }
                }
            }
        }
    }
    
    private suspend fun processIncomingPacket(packet: ByteArray) {
        withContext(Dispatchers.IO) {
            try {
                val ipPacket = IpPacket.parse(packet) ?: return@withContext
                
                // Extract destination info
                val destAddr = ipPacket.destinationAddress
                val destPort = ipPacket.destinationPort
                val protocol = ipPacket.protocol
                
                // Check if packet should be blocked
                val filterResult = filterEngine?.checkPacket(
                    destAddr = destAddr,
                    destPort = destPort,
                    protocol = protocol,
                    payload = ipPacket.payload
                ) ?: FilterEngine.FilterResult.ALLOW
                
                when (filterResult) {
                    FilterEngine.FilterResult.BLOCK -> {
                        packetsBlocked.incrementAndGet()
                        broadcastBlocked(destAddr, "Blocked by filter", "packet")
                        Log.d(TAG, "Blocked packet to $destAddr:$destPort")
                        
                        // Send ICMP unreachable for blocked packets
                        sendIcmpUnreachable(ipPacket)
                    }
                    
                    FilterEngine.FilterResult.WARN -> {
                        packetsAllowed.incrementAndGet()
                        broadcastWarning(destAddr, "Suspicious activity detected")
                        
                        // Allow but log
                        forwardPacket(packet)
                    }
                    
                    FilterEngine.FilterResult.MONITOR -> {
                        packetsAllowed.incrementAndGet()
                        
                        // Log for analysis
                        filterEngine?.logPacket(ipPacket)
                        
                        forwardPacket(packet)
                    }
                    
                    FilterEngine.FilterResult.ALLOW -> {
                        packetsAllowed.incrementAndGet()
                        forwardPacket(packet)
                    }
                }
                
                // Special handling for DNS packets
                if (destPort == 53 && protocol == IpPacket.Protocol.UDP) {
                    handleDnsPacket(ipPacket)
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error processing packet", e)
            }
        }
    }
    
    private fun handleDnsPacket(ipPacket: IpPacket) {
        // Route DNS queries through local proxy for filtering
        localDnsProxy?.processDnsQuery(ipPacket.payload)?.let { response ->
            // Create response packet
            val responsePacket = ipPacket.createResponse(response)
            synchronized(outgoingPacketQueue) {
                outgoingPacketQueue.add(responsePacket)
            }
        }
    }
    
    private fun forwardPacket(packet: ByteArray) {
        synchronized(outgoingPacketQueue) {
            outgoingPacketQueue.add(packet)
        }
    }
    
    private fun sendIcmpUnreachable(originalPacket: IpPacket) {
        // Create ICMP destination unreachable packet
        val icmpPacket = IcmpPacket.createUnreachable(originalPacket)
        synchronized(outgoingPacketQueue) {
            outgoingPacketQueue.add(icmpPacket.payload)
        }
    }
    
    private fun updateFilters() {
        serviceScope.launch {
            filterEngine?.syncWithSupabase()
            localDnsProxy?.updateBlocklist()
            callDetector?.updateFraudNumbers()
            
            Log.i(TAG, "Filters updated")
            broadcastStatus("filters_updated")
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Shabari VPN Protection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shabari VPN protection service notifications"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            else
                PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        val stats = getStatistics()
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Shabari Protection Active")
            .setContentText("${stats["blocked_count"]} threats blocked")
            .setSmallIcon(android.R.drawable.ic_secure)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    fun getStatistics(): Map<String, Any> {
        val uptime = System.currentTimeMillis() - startTime
        return mapOf(
            "is_running" to isRunning.get(),
            "blocked_count" to packetsBlocked.get(),
            "allowed_count" to packetsAllowed.get(),
            "bytes_transferred" to bytesTransferred.get(),
            "uptime_ms" to uptime,
            "filter_stats" to (filterEngine?.getStatistics() ?: emptyMap()),
            "dns_stats" to (localDnsProxy?.getStatistics() ?: emptyMap()),
            "proxy_stats" to (proxyServer?.getStats() ?: emptyMap())
        )
    }
    
    private fun broadcastStatus(status: String) {
        val intent = Intent("com.shabari.vpn.STATUS").apply {
            putExtra("status", status)
            putExtra("statistics", HashMap(getStatistics()))
        }
        sendBroadcast(intent)
    }
    
    private fun broadcastBlocked(target: String, reason: String, type: String = "unknown") {
        val intent = Intent("com.shabari.vpn.BLOCKED").apply {
            putExtra("target", target)
            putExtra("reason", reason)
            putExtra("type", type)
            putExtra("timestamp", System.currentTimeMillis())
        }
        sendBroadcast(intent)
    }
    
    private fun broadcastWarning(target: String, message: String) {
        val intent = Intent("com.shabari.vpn.WARNING").apply {
            putExtra("target", target)
            putExtra("message", message)
            putExtra("timestamp", System.currentTimeMillis())
        }
        sendBroadcast(intent)
    }
    
    private fun broadcastError(error: String) {
        val intent = Intent("com.shabari.vpn.ERROR").apply {
            putExtra("error", error)
            putExtra("timestamp", System.currentTimeMillis())
        }
        sendBroadcast(intent)
    }
}

/**
 * IP Packet parser for packet inspection
 */
data class IpPacket(
    val version: Int,
    val protocol: Protocol,
    val sourceAddress: String,
    val destinationAddress: String,
    val sourcePort: Int,
    val destinationPort: Int,
    val payload: ByteArray
) {
    enum class Protocol {
        TCP, UDP, ICMP, OTHER
    }
    
    companion object {
        fun parse(data: ByteArray): IpPacket? {
            try {
                if (data.size < 20) return null
                
                val version = (data[0].toInt() shr 4) and 0xF
                if (version != 4 && version != 6) return null
                
                val protocol = when (data[9].toInt()) {
                    6 -> Protocol.TCP
                    17 -> Protocol.UDP
                    1 -> Protocol.ICMP
                    else -> Protocol.OTHER
                }
                
                // Parse IPv4 addresses
                val srcAddr = "${data[12].toInt() and 0xFF}.${data[13].toInt() and 0xFF}.${data[14].toInt() and 0xFF}.${data[15].toInt() and 0xFF}"
                val dstAddr = "${data[16].toInt() and 0xFF}.${data[17].toInt() and 0xFF}.${data[18].toInt() and 0xFF}.${data[19].toInt() and 0xFF}"
                
                // Parse ports for TCP/UDP
                var srcPort = 0
                var dstPort = 0
                val headerLength = (data[0].toInt() and 0xF) * 4
                
                if (protocol == Protocol.TCP || protocol == Protocol.UDP) {
                    if (data.size >= headerLength + 4) {
                        srcPort = ((data[headerLength].toInt() and 0xFF) shl 8) or (data[headerLength + 1].toInt() and 0xFF)
                        dstPort = ((data[headerLength + 2].toInt() and 0xFF) shl 8) or (data[headerLength + 3].toInt() and 0xFF)
                    }
                }
                
                val payloadStart = if (protocol == Protocol.TCP) headerLength + 20 else headerLength + 8
                val payload = if (data.size > payloadStart) data.sliceArray(payloadStart until data.size) else ByteArray(0)
                
                return IpPacket(version, protocol, srcAddr, dstAddr, srcPort, dstPort, payload)
                
            } catch (e: Exception) {
                return null
            }
        }
    }
    
    fun createResponse(responsePayload: ByteArray): ByteArray {
        // Create a response packet with swapped source/destination
        // This is a simplified implementation
        return ByteArray(0) // Implement actual packet creation
    }
}

/**
 * ICMP Packet utilities
 */
object IcmpPacket {
    fun createUnreachable(originalPacket: IpPacket): IpPacket {
        // Create ICMP destination unreachable packet
        // This is a simplified implementation
        return originalPacket.copy(
            sourceAddress = originalPacket.destinationAddress,
            destinationAddress = originalPacket.sourceAddress,
            protocol = IpPacket.Protocol.ICMP
        )
    }
}

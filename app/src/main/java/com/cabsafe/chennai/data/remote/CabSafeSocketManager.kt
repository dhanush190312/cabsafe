package com.cabsafe.chennai.data.remote

import com.cabsafe.chennai.data.model.CaptainLocationEventDto
import com.cabsafe.chennai.data.model.GeoCoordinate
import com.cabsafe.chennai.data.model.RideDto
import com.google.gson.Gson
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.net.URI

/**
 * Native Android Socket.IO Client Manager (Socket.IO v4 compatible via io.socket:socket.io-client:2.1.1).
 *
 * Strictly distinguishes:
 * 1. Underlying transport connection state (`isConnected`)
 * 2. Authenticated & authorized ride session (`joinedSession` with verified JWT `token`)
 * 3. Automatic state-recovery notifications (`reconnectedEvents`) so ViewModels restore active trips from the server.
 */
class CabSafeSocketManager(
    private val baseUrl: String,
    private val gson: Gson = Gson()
) {
    private var socket: Socket? = null
    private var lastAuthToken: String? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _joinedSession = MutableStateFlow<Pair<String, String>?>(null)
    val joinedSession: StateFlow<Pair<String, String>?> = _joinedSession.asStateFlow()

    private val _reconnectedEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val reconnectedEvents: SharedFlow<Unit> = _reconnectedEvents.asSharedFlow()

    private val _newRideEvents = MutableSharedFlow<RideDto>(extraBufferCapacity = 8)
    val newRideEvents: SharedFlow<RideDto> = _newRideEvents.asSharedFlow()

    private val _rideLifecycleEvents = MutableSharedFlow<Pair<String, RideDto>>(extraBufferCapacity = 16)
    val rideLifecycleEvents: SharedFlow<Pair<String, RideDto>> = _rideLifecycleEvents.asSharedFlow()

    private val _captainLocationEvents = MutableSharedFlow<CaptainLocationEventDto>(extraBufferCapacity = 16)
    val captainLocationEvents: SharedFlow<CaptainLocationEventDto> = _captainLocationEvents.asSharedFlow()

    fun connectAndJoin(userId: String, userType: String, token: String?) {
        if (socket?.connected() == true &&
            _joinedSession.value == Pair(userId, userType) &&
            lastAuthToken == token
        ) {
            return
        }
        disconnect()
        lastAuthToken = token

        val options = IO.Options.builder()
            .setTransports(arrayOf("websocket", "polling"))
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(5000)
            .build()

        val client = IO.socket(URI.create(baseUrl.trimEnd('/')), options)

        client.on(Socket.EVENT_CONNECT) {
            val wasPreviouslyJoined = _joinedSession.value != null
            _isConnected.value = true
            val joinPayload = JSONObject().apply {
                put("userId", userId)
                put("userType", userType)
                if (!token.isNullOrBlank()) {
                    put("token", token)
                }
            }
            client.emit("join", joinPayload)
            _joinedSession.value = Pair(userId, userType)
            if (wasPreviouslyJoined) {
                _reconnectedEvents.tryEmit(Unit)
            }
        }

        client.on(Socket.EVENT_DISCONNECT) {
            _isConnected.value = false
        }

        // Emitted by backend on SIGTERM during AWS Auto Scaling instance draining
        client.on("server-draining") {
            _reconnectedEvents.tryEmit(Unit)
        }

        client.on("new-ride") { args ->
            parseRideArg(args)?.let { ride ->
                _newRideEvents.tryEmit(ride)
            }
        }

        listOf(
            "ride-confirmed",
            "ride-started",
            "ride-ended",
            "ride-cancelled",
            "ride-updated"
        ).forEach { eventName ->
            client.on(eventName) { args ->
                parseRideArg(args)?.let { ride ->
                    _rideLifecycleEvents.tryEmit(eventName to ride)
                }
            }
        }

        client.on("captain-location-updated") { args ->
            if (args.isNotEmpty() && args[0] != null) {
                try {
                    val update = gson.fromJson(args[0].toString(), CaptainLocationEventDto::class.java)
                    _captainLocationEvents.tryEmit(update)
                } catch (_: Exception) {
                }
            }
        }

        socket = client
        client.connect()
    }

    /**
     * Emits `update-location-captain` with `{ userId, location: { lat, lon }, token }`.
     * Server validates both captain JWT ownership and the Chennai operating boundary.
     */
    fun emitCaptainLocation(captainId: String, location: GeoCoordinate, token: String?) {
        val activeSocket = socket ?: return
        if (!activeSocket.connected()) return

        val payload = JSONObject().apply {
            put("userId", captainId)
            put("location", JSONObject().apply {
                put("lat", location.lat)
                put("lon", location.lon)
            })
            if (!token.isNullOrBlank()) {
                put("token", token)
            }
        }
        activeSocket.emit("update-location-captain", payload)
    }

    fun disconnect() {
        socket?.let {
            it.off()
            it.disconnect()
        }
        socket = null
        _isConnected.value = false
        _joinedSession.value = null
    }

    private fun parseRideArg(args: Array<Any>): RideDto? {
        if (args.isEmpty()) return null
        val raw = args[0] ?: return null
        return try {
            gson.fromJson(raw.toString(), RideDto::class.java)
        } catch (_: Exception) {
            null
        }
    }
}

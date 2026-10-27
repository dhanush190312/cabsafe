package com.cabsafe.chennai.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.CaptainDto
import com.cabsafe.chennai.data.model.GeoCoordinate
import com.cabsafe.chennai.data.model.RideDto
import com.cabsafe.chennai.data.remote.CabSafeSocketManager
import com.cabsafe.chennai.data.repository.CabSafeRepository
import com.cabsafe.chennai.data.repository.RepoResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Deterministic Driver Bottom-Sheet Stage Machine.
 * - Offline captains never see incoming ride offers.
 * - Completed trips show a dedicated `TRIP_SUMMARY` sheet before returning to `DRIVER_HOME`.
 */
enum class CaptainSheetStage {
    DRIVER_HOME,                  // 01 · Driver home (Chennai map + Online/Offline switch + INR earnings)
    INCOMING_REQUEST,             // 02 · Incoming ride request card (Accept / Dismiss)
    NAVIGATE_TO_PICKUP_AND_OTP,   // 03 & 04 · Navigate to pickup & verify passenger's 6-digit OTP
    ACTIVE_TRIP,                  // 05 · Active trip in progress (route to destination + Complete Trip)
    TRIP_SUMMARY                  // 06 · Confirmed trip completion & INR earnings summary
}

data class CaptainUiState(
    val isAuthenticated: Boolean = false,
    val captain: CaptainDto? = null,
    val sheetStage: CaptainSheetStage = CaptainSheetStage.DRIVER_HOME,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errorCode: String? = null,
    val currentCoords: GeoCoordinate = GeoCoordinate(lat = 13.0432, lon = 80.2365), // T. Nagar
    val pendingOffers: List<RideDto> = emptyList(),
    val assignedRide: RideDto? = null,
    val completedTripSummary: RideDto? = null,
    val otpInput: String = "",
    val isSocketConnected: Boolean = false
)

class CaptainViewModel(
    private val repository: CabSafeRepository,
    private val socketManager: CabSafeSocketManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(CaptainUiState())
    val uiState: StateFlow<CaptainUiState> = _uiState.asStateFlow()

    init {
        observeSocketEvents()
        restoreSessionIfAvailable()
    }

    private fun observeSocketEvents() {
        viewModelScope.launch {
            socketManager.isConnected.collect { connected ->
                _uiState.update { it.copy(isSocketConnected = connected) }
            }
        }
        viewModelScope.launch {
            socketManager.reconnectedEvents.collect {
                recoverCaptainStateFromServer()
            }
        }
        viewModelScope.launch {
            socketManager.newRideEvents.collect { newRide ->
                _uiState.update { state ->
                    // Requirement: Do not display new requests while offline
                    if (state.captain?.status != "active" || state.assignedRide != null) {
                        return@update state
                    }
                    val updatedOffers = listOf(newRide) + state.pendingOffers.filterNot { it.id == newRide.id }
                    state.copy(
                        pendingOffers = updatedOffers,
                        sheetStage = CaptainSheetStage.INCOMING_REQUEST
                    )
                }
            }
        }
        viewModelScope.launch {
            socketManager.rideLifecycleEvents.collect { (eventName, updatedRide) ->
                _uiState.update { state ->
                    val remainingOffers = state.pendingOffers.filterNot { it.id == updatedRide.id }
                    val isOurRide = state.assignedRide?.id == updatedRide.id

                    if (isOurRide && (eventName == "ride-cancelled" || updatedRide.status == "cancelled")) {
                        return@update state.copy(
                            assignedRide = null,
                            pendingOffers = remainingOffers,
                            sheetStage = if (remainingOffers.isNotEmpty() && state.captain?.status == "active") {
                                CaptainSheetStage.INCOMING_REQUEST
                            } else {
                                CaptainSheetStage.DRIVER_HOME
                            },
                            errorMessage = "Ride was cancelled."
                        )
                    }

                    val nextAssigned = if (isOurRide) updatedRide else state.assignedRide
                    val nextStage = computeCaptainStage(
                        captainStatus = state.captain?.status,
                        assignedRide = nextAssigned,
                        pendingOffers = remainingOffers,
                        completedSummary = state.completedTripSummary
                    )
                    state.copy(
                        pendingOffers = remainingOffers,
                        assignedRide = nextAssigned,
                        sheetStage = nextStage
                    )
                }
            }
        }
    }

    private fun computeCaptainStage(
        captainStatus: String?,
        assignedRide: RideDto?,
        pendingOffers: List<RideDto>,
        completedSummary: RideDto?
    ): CaptainSheetStage {
        if (completedSummary != null) return CaptainSheetStage.TRIP_SUMMARY
        if (assignedRide != null) {
            return when (assignedRide.status) {
                "accepted" -> CaptainSheetStage.NAVIGATE_TO_PICKUP_AND_OTP
                "ongoing" -> CaptainSheetStage.ACTIVE_TRIP
                "completed" -> CaptainSheetStage.TRIP_SUMMARY
                else -> CaptainSheetStage.DRIVER_HOME
            }
        }
        if (captainStatus == "active" && pendingOffers.isNotEmpty()) {
            return CaptainSheetStage.INCOMING_REQUEST
        }
        return CaptainSheetStage.DRIVER_HOME
    }

    fun restoreSessionIfAvailable() {
        val token = repository.tokenStore.getToken("captain")
        if (token.isNullOrBlank()) return

        viewModelScope.launch {
            when (val res = repository.getCaptainProfile()) {
                is RepoResult.Success -> {
                    val captain = res.data
                    _uiState.update {
                        it.copy(
                            isAuthenticated = true,
                            captain = captain,
                            currentCoords = captain.location?.toGeoCoordinate() ?: it.currentCoords
                        )
                    }
                    socketManager.connectAndJoin(captain.id, "captain", token)
                    recoverCaptainStateFromServer()
                }
                is RepoResult.Error -> {
                    if (res.httpStatus == 401) {
                        repository.tokenStore.clearToken("captain")
                        _uiState.update { it.copy(isAuthenticated = false, captain = null) }
                    }
                }
            }
        }
    }

    fun recoverCaptainStateFromServer() {
        viewModelScope.launch {
            when (val res = repository.getActiveRide("captain")) {
                is RepoResult.Success -> {
                    val activeRide = res.data.ride
                    val offers = if (_uiState.value.captain?.status == "active") {
                        res.data.pendingOffers
                    } else {
                        emptyList()
                    }
                    _uiState.update { state ->
                        val stage = computeCaptainStage(
                            captainStatus = state.captain?.status,
                            assignedRide = activeRide,
                            pendingOffers = offers,
                            completedSummary = state.completedTripSummary
                        )
                        state.copy(
                            assignedRide = activeRide,
                            pendingOffers = offers,
                            sheetStage = stage
                        )
                    }
                }
                is RepoResult.Error -> Unit
            }
        }
    }

    // ---------------- Captain Auth ----------------

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, errorCode = null) }
            when (val res = repository.loginCaptain(email, password)) {
                is RepoResult.Success -> {
                    val captain = res.data.captain
                    val token = res.data.token
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            captain = captain,
                            currentCoords = captain.location?.toGeoCoordinate() ?: it.currentCoords,
                            sheetStage = CaptainSheetStage.DRIVER_HOME
                        )
                    }
                    socketManager.connectAndJoin(captain.id, "captain", token)
                    recoverCaptainStateFromServer()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    fun register(
        firstname: String,
        lastname: String,
        email: String,
        phone: String,
        password: String,
        color: String,
        plate: String,
        capacity: Int,
        vehicleType: String,
        model: String
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, errorCode = null) }
            when (
                val res = repository.registerCaptain(
                    firstname = firstname,
                    lastname = lastname,
                    email = email,
                    phone = phone,
                    password = password,
                    color = color,
                    plate = plate,
                    capacity = capacity,
                    vehicleType = vehicleType,
                    model = model
                )
            ) {
                is RepoResult.Success -> {
                    val captain = res.data.captain
                    val token = res.data.token
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            captain = captain,
                            currentCoords = captain.location?.toGeoCoordinate() ?: it.currentCoords,
                            sheetStage = CaptainSheetStage.DRIVER_HOME
                        )
                    }
                    socketManager.connectAndJoin(captain.id, "captain", token)
                    recoverCaptainStateFromServer()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    // ---------------- Step 01: Online / Offline & Chennai Location ----------------

    fun toggleAvailability() {
        val currentStatus = _uiState.value.captain?.status ?: "inactive"
        val nextStatus = if (currentStatus == "active") "inactive" else "active"
        viewModelScope.launch {
            when (val res = repository.updateCaptainStatus(nextStatus)) {
                is RepoResult.Success -> {
                    _uiState.update { state ->
                        val offers = if (nextStatus == "active") state.pendingOffers else emptyList()
                        state.copy(
                            captain = res.data,
                            pendingOffers = offers,
                            sheetStage = computeCaptainStage(
                                captainStatus = nextStatus,
                                assignedRide = state.assignedRide,
                                pendingOffers = offers,
                                completedSummary = state.completedTripSummary
                            ),
                            errorMessage = null
                        )
                    }
                    if (nextStatus == "active") {
                        recoverCaptainStateFromServer()
                    }
                }
                is RepoResult.Error -> {
                    _uiState.update { it.copy(errorMessage = res.message, errorCode = res.code) }
                }
            }
        }
    }

    fun updateLocationInChennai(lat: Double, lon: Double) {
        val point = GeoCoordinate(lat = lat, lon = lon)
        if (!ChennaiServiceArea.isPointInServiceArea(point)) {
            _uiState.update {
                it.copy(
                    errorMessage = "Captain location (${String.format("%.4f", lat)}, ${String.format("%.4f", lon)}) is outside the Chennai operating boundary.",
                    errorCode = "CAPTAIN_LOCATION_OUTSIDE_SERVICE_AREA"
                )
            }
            return
        }
        viewModelScope.launch {
            when (val res = repository.updateCaptainLocation(lat, lon)) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            captain = res.data,
                            currentCoords = point,
                            errorMessage = null,
                            errorCode = null
                        )
                    }
                    socketManager.emitCaptainLocation(
                        captainId = res.data.id,
                        location = point,
                        token = repository.tokenStore.getToken("captain")
                    )
                }
                is RepoResult.Error -> {
                    _uiState.update { it.copy(errorMessage = res.message, errorCode = res.code) }
                }
            }
        }
    }

    // ---------------- Step 02: Incoming Request Accept / Dismiss ----------------

    fun acceptRideOffer(rideId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val res = repository.confirmRide(rideId)) {
                is RepoResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            assignedRide = res.data,
                            pendingOffers = state.pendingOffers.filterNot { it.id == rideId },
                            sheetStage = CaptainSheetStage.NAVIGATE_TO_PICKUP_AND_OTP
                        )
                    }
                }
                is RepoResult.Error -> {
                    // Handle 409 Conflict when another driver already claimed the ride
                    _uiState.update { state ->
                        val remaining = state.pendingOffers.filterNot { it.id == rideId }
                        state.copy(
                            isLoading = false,
                            pendingOffers = remaining,
                            sheetStage = if (remaining.isNotEmpty()) CaptainSheetStage.INCOMING_REQUEST else CaptainSheetStage.DRIVER_HOME,
                            errorMessage = res.message,
                            errorCode = res.code
                        )
                    }
                }
            }
        }
    }

    fun dismissOfferLocally(rideId: String) {
        _uiState.update { state ->
            val remaining = state.pendingOffers.filterNot { it.id == rideId }
            state.copy(
                pendingOffers = remaining,
                sheetStage = if (remaining.isNotEmpty()) CaptainSheetStage.INCOMING_REQUEST else CaptainSheetStage.DRIVER_HOME
            )
        }
    }

    // ---------------- Step 03 & 04: Navigate to Pickup & Verify Passenger OTP ----------------

    fun onOtpChanged(otp: String) {
        _uiState.update { it.copy(otpInput = otp.filter { ch -> ch.isDigit() }.take(6), errorMessage = null) }
    }

    fun verifyOtpAndStartTrip() {
        val rideId = _uiState.value.assignedRide?.id ?: return
        val otp = _uiState.value.otpInput
        if (otp.length != 6) {
            _uiState.update { it.copy(errorMessage = "Please enter the passenger's 6-digit pickup OTP.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val res = repository.startRideWithOtp(rideId, otp)) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            assignedRide = res.data,
                            otpInput = "",
                            sheetStage = CaptainSheetStage.ACTIVE_TRIP
                        )
                    }
                }
                is RepoResult.Error -> {
                    // Invalid OTP keeps the ride in NAVIGATE_TO_PICKUP_AND_OTP without mutating server state
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    // ---------------- Step 05 & 06: Complete Trip & Trip Summary ----------------

    fun completeTrip() {
        val rideId = _uiState.value.assignedRide?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val res = repository.endRide(rideId)) {
                is RepoResult.Success -> {
                    val completedRide = res.data
                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            assignedRide = null,
                            completedTripSummary = completedRide,
                            captain = completedRide.captain ?: state.captain,
                            sheetStage = CaptainSheetStage.TRIP_SUMMARY
                        )
                    }
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    fun acknowledgeSummaryAndReturnHome() {
        _uiState.update {
            it.copy(
                completedTripSummary = null,
                sheetStage = CaptainSheetStage.DRIVER_HOME,
                errorMessage = null
            )
        }
        recoverCaptainStateFromServer()
    }

    fun cancelAssignedRide() {
        val rideId = _uiState.value.assignedRide?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val res = repository.cancelRide(rideId, role = "captain", reason = "Captain cancelled before pickup")) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            assignedRide = null,
                            otpInput = "",
                            sheetStage = CaptainSheetStage.DRIVER_HOME
                        )
                    }
                    recoverCaptainStateFromServer()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null, errorCode = null) }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logoutCaptain()
            socketManager.disconnect()
            _uiState.value = CaptainUiState()
        }
    }
}

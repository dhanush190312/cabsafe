package com.cabsafe.chennai.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.*
import com.cabsafe.chennai.data.remote.CabSafeSocketManager
import com.cabsafe.chennai.data.repository.CabSafeRepository
import com.cabsafe.chennai.data.repository.RepoResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class MapPinTarget {
    PICKUP,
    DESTINATION
}

/**
 * Deterministic Passenger Bottom-Sheet Stage Machine.
 * Server-owned ride states (`FINDING_DRIVER`, `DRIVER_ASSIGNED`, `TRIP_IN_PROGRESS`, `TRIP_COMPLETED`)
 * are entered ONLY when confirmed by the backend API or authenticated Socket.IO event.
 */
enum class PassengerSheetStage {
    HOME_MAP,                  // 01 · Home map ("Where to?" + pickup pin + recent/saved places)
    DESTINATION_SEARCH,        // 02 · Choose destination (debounced search + map pin mode)
    CONFIRM_PICKUP_AND_ROUTE,  // 03 · Confirm pickup & route (map polyline + distance/duration)
    SELECT_VEHICLE,            // 04 · Select a ride (CabSafe Go / Auto / Moto cards + INR fares)
    FINDING_DRIVER,            // 05 · Finding a driver (server status = "pending")
    DRIVER_ASSIGNED,           // 06 · Driver assigned (server status = "accepted" + 6-digit OTP)
    TRIP_IN_PROGRESS,          // 07 · Trip in progress (server status = "ongoing")
    TRIP_COMPLETED             // 08 · Trip completed & rate driver (server status = "completed")
}

data class PassengerUiState(
    val isAuthenticated: Boolean = false,
    val passenger: UserDto? = null,
    val sheetStage: PassengerSheetStage = PassengerSheetStage.HOME_MAP,
    val isLoading: Boolean = false,
    val isSearchingSuggestions: Boolean = false,
    val isSubmittingRide: Boolean = false,
    val errorMessage: String? = null,
    val errorCode: String? = null,
    val pickupInput: String = "",
    val destinationInput: String = "",
    val pickupCoords: GeoCoordinate? = null,
    val destinationCoords: GeoCoordinate? = null,
    val pickupInServiceArea: Boolean = true,
    val destinationInServiceArea: Boolean = true,
    val activeFieldTarget: MapPinTarget = MapPinTarget.PICKUP,
    val suggestions: List<LandmarkSuggestionDto> = ChennaiServiceArea.SUPPORTED_CHENNAI_LOCALITIES,
    val recentRides: List<RideDto> = emptyList(),
    val selectedVehicleType: String = "car", // "car" | "cng" | "motorcycle"
    val fareEstimate: FareEstimateResponseDto? = null,
    val activeRide: RideDto? = null,
    val liveCaptainCoords: GeoCoordinate? = null,
    val selectedPaymentMethod: String = "Card",
    val ratingStars: Int = 5,
    val ratingFeedback: String = "",
    val isSocketConnected: Boolean = false,
    val gpsStatusBanner: String? = null
)

class PassengerViewModel(
    private val repository: CabSafeRepository,
    private val socketManager: CabSafeSocketManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(PassengerUiState())
    val uiState: StateFlow<PassengerUiState> = _uiState.asStateFlow()

    private var searchDebounceJob: Job? = null

    init {
        observeSocketStreams()
        restoreSessionIfAvailable()
    }

    private fun observeSocketStreams() {
        viewModelScope.launch {
            socketManager.isConnected.collect { connected ->
                _uiState.update { it.copy(isSocketConnected = connected) }
            }
        }
        viewModelScope.launch {
            socketManager.reconnectedEvents.collect {
                // Stage 6 & 8: Automatically restore real active ride from server on Socket reconnect
                recoverActiveRideFromServer()
            }
        }
        viewModelScope.launch {
            socketManager.rideLifecycleEvents.collect { (eventName, ride) ->
                applyServerRideState(ride, eventName)
            }
        }
        viewModelScope.launch {
            socketManager.captainLocationEvents.collect { update ->
                _uiState.update { state ->
                    val currentRide = state.activeRide
                    if (currentRide != null &&
                        currentRide.id == update.rideId &&
                        currentRide.status in listOf("accepted", "ongoing")
                    ) {
                        state.copy(liveCaptainCoords = update.location)
                    } else {
                        state
                    }
                }
            }
        }
    }

    /**
     * Restores persisted JWT session and active trip on Activity launch or recreation.
     */
    fun restoreSessionIfAvailable() {
        val token = repository.tokenStore.getToken("user")
        if (token.isNullOrBlank()) return

        viewModelScope.launch {
            when (val profileRes = repository.getUserProfile()) {
                is RepoResult.Success -> {
                    val user = profileRes.data
                    _uiState.update {
                        it.copy(isAuthenticated = true, passenger = user)
                    }
                    socketManager.connectAndJoin(user.id, "user", token)
                    loadLandmarksAndHistory()
                    recoverActiveRideFromServer()
                }
                is RepoResult.Error -> {
                    if (profileRes.httpStatus == 401) {
                        repository.tokenStore.clearToken("user")
                        _uiState.update { it.copy(isAuthenticated = false, passenger = null) }
                    }
                }
            }
        }
    }

    private fun loadLandmarksAndHistory() {
        viewModelScope.launch {
            when (val res = repository.getChennaiLandmarks()) {
                is RepoResult.Success -> {
                    if (res.data.isNotEmpty()) {
                        _uiState.update { it.copy(suggestions = res.data) }
                    }
                }
                is RepoResult.Error -> Unit
            }
            when (val hist = repository.getRideHistory("user")) {
                is RepoResult.Success -> {
                    _uiState.update { it.copy(recentRides = hist.data) }
                }
                is RepoResult.Error -> Unit
            }
        }
    }

    fun recoverActiveRideFromServer() {
        viewModelScope.launch {
            when (val res = repository.getActiveRide("user")) {
                is RepoResult.Success -> {
                    val ride = res.data.ride
                    if (ride != null) {
                        applyServerRideState(ride, "recovered")
                    }
                }
                is RepoResult.Error -> Unit
            }
        }
    }

    private fun applyServerRideState(ride: RideDto, sourceEvent: String) {
        _uiState.update { state ->
            val capCoords = ride.captain?.location?.toGeoCoordinate() ?: state.liveCaptainCoords
            val nextStage = when (ride.status) {
                "pending" -> PassengerSheetStage.FINDING_DRIVER
                "accepted" -> PassengerSheetStage.DRIVER_ASSIGNED
                "ongoing" -> PassengerSheetStage.TRIP_IN_PROGRESS
                "completed" -> PassengerSheetStage.TRIP_COMPLETED
                "cancelled" -> PassengerSheetStage.HOME_MAP
                else -> state.sheetStage
            }
            state.copy(
                activeRide = if (ride.status == "cancelled") null else ride,
                sheetStage = nextStage,
                pickupCoords = ride.pickupCoords,
                destinationCoords = ride.destinationCoords,
                liveCaptainCoords = if (ride.status in listOf("accepted", "ongoing")) capCoords else null,
                isSubmittingRide = false,
                errorMessage = if (sourceEvent == "ride-cancelled") "Ride was cancelled." else state.errorMessage
            )
        }
    }

    // ---------------- Auth Actions ----------------

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, errorCode = null) }
            when (val res = repository.loginPassenger(email, password)) {
                is RepoResult.Success -> {
                    val user = res.data.user
                    val token = res.data.token
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            passenger = user,
                            sheetStage = PassengerSheetStage.HOME_MAP
                        )
                    }
                    socketManager.connectAndJoin(user.id, "user", token)
                    loadLandmarksAndHistory()
                    recoverActiveRideFromServer()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    fun register(firstname: String, lastname: String, email: String, phone: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, errorCode = null) }
            when (val res = repository.registerPassenger(firstname, lastname, email, phone, password)) {
                is RepoResult.Success -> {
                    val user = res.data.user
                    val token = res.data.token
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            passenger = user,
                            sheetStage = PassengerSheetStage.HOME_MAP
                        )
                    }
                    socketManager.connectAndJoin(user.id, "user", token)
                    loadLandmarksAndHistory()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    // ---------------- Step 01 -> 02 -> 03 -> 04 Navigation ----------------

    fun openDestinationSearch(target: MapPinTarget = MapPinTarget.DESTINATION) {
        _uiState.update {
            it.copy(
                sheetStage = PassengerSheetStage.DESTINATION_SEARCH,
                activeFieldTarget = target,
                errorMessage = null,
                errorCode = null
            )
        }
    }

    fun handleBackNavigation(): Boolean {
        val current = _uiState.value.sheetStage
        return when (current) {
            PassengerSheetStage.SELECT_VEHICLE -> {
                _uiState.update { it.copy(sheetStage = PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE) }
                true
            }
            PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE -> {
                _uiState.update { it.copy(sheetStage = PassengerSheetStage.DESTINATION_SEARCH) }
                true
            }
            PassengerSheetStage.DESTINATION_SEARCH -> {
                _uiState.update { it.copy(sheetStage = PassengerSheetStage.HOME_MAP) }
                true
            }
            else -> false
        }
    }

    fun setPinTarget(target: MapPinTarget) {
        _uiState.update { it.copy(activeFieldTarget = target) }
    }

    fun onAddressQueryChanged(query: String, target: MapPinTarget) {
        _uiState.update {
            if (target == MapPinTarget.PICKUP) {
                it.copy(pickupInput = query, activeFieldTarget = MapPinTarget.PICKUP, errorMessage = null)
            } else {
                it.copy(destinationInput = query, activeFieldTarget = MapPinTarget.DESTINATION, errorMessage = null)
            }
        }
        searchDebounceJob?.cancel()
        if (query.trim().length < 2) {
            _uiState.update {
                it.copy(
                    isSearchingSuggestions = false,
                    suggestions = ChennaiServiceArea.SUPPORTED_CHENNAI_LOCALITIES
                )
            }
            return
        }
        searchDebounceJob = viewModelScope.launch {
            _uiState.update { it.copy(isSearchingSuggestions = true) }
            delay(300) // Debounce 300ms
            when (val res = repository.getAddressSuggestions(query)) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isSearchingSuggestions = false,
                            suggestions = res.data.ifEmpty { ChennaiServiceArea.SUPPORTED_CHENNAI_LOCALITIES }
                        )
                    }
                }
                is RepoResult.Error -> {
                    _uiState.update { it.copy(isSearchingSuggestions = false) }
                }
            }
        }
    }

    fun selectSuggestion(suggestion: LandmarkSuggestionDto) {
        val target = _uiState.value.activeFieldTarget
        val point = GeoCoordinate(lat = suggestion.lat, lon = suggestion.lon)
        val inArea = (suggestion.inServiceArea != false) && ChennaiServiceArea.isPointInServiceArea(point)

        _uiState.update { state ->
            if (target == MapPinTarget.PICKUP) {
                state.copy(
                    pickupInput = suggestion.display_name,
                    pickupCoords = point,
                    pickupInServiceArea = inArea,
                    activeFieldTarget = MapPinTarget.DESTINATION,
                    errorMessage = if (!inArea) "Pickup '${suggestion.name}' is outside the supported Chennai operating boundary." else null,
                    errorCode = if (!inArea) "PICKUP_OUTSIDE_SERVICE_AREA" else null
                )
            } else {
                state.copy(
                    destinationInput = suggestion.display_name,
                    destinationCoords = point,
                    destinationInServiceArea = inArea,
                    activeFieldTarget = if (state.pickupCoords == null) MapPinTarget.PICKUP else state.activeFieldTarget,
                    errorMessage = if (!inArea) "Destination '${suggestion.name}' is outside the supported Chennai operating boundary." else null,
                    errorCode = if (!inArea) "DESTINATION_OUTSIDE_SERVICE_AREA" else null
                )
            }
        }

        // If both pickup & destination are now set inside Chennai, advance to 03 · Confirm Pickup & Route
        val after = _uiState.value
        if (after.pickupInServiceArea &&
            after.destinationInServiceArea &&
            after.pickupCoords != null &&
            after.destinationCoords != null &&
            after.pickupInput.isNotBlank() &&
            after.destinationInput.isNotBlank()
        ) {
            previewRouteAndFare(advanceToStep = PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE)
        }
    }

    fun selectRecentDestination(ride: RideDto) {
        _uiState.update {
            it.copy(
                destinationInput = ride.destination,
                destinationCoords = ride.destinationCoords,
                destinationInServiceArea = ChennaiServiceArea.isPointInServiceArea(ride.destinationCoords),
                errorMessage = null,
                errorCode = null
            )
        }
        if (_uiState.value.pickupCoords != null && _uiState.value.pickupInput.isNotBlank()) {
            previewRouteAndFare(advanceToStep = PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE)
        } else {
            _uiState.update { it.copy(activeFieldTarget = MapPinTarget.PICKUP) }
        }
    }

    /**
     * Preserves exact tapped coordinates without silently snapping out-of-area points into Chennai.
     */
    fun onMapTap(lat: Double, lon: Double) {
        val currentStage = _uiState.value.sheetStage
        if (currentStage in listOf(
                PassengerSheetStage.FINDING_DRIVER,
                PassengerSheetStage.DRIVER_ASSIGNED,
                PassengerSheetStage.TRIP_IN_PROGRESS,
                PassengerSheetStage.TRIP_COMPLETED
            )
        ) {
            return
        }

        val target = if (currentStage == PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE) {
            MapPinTarget.PICKUP
        } else if (currentStage == PassengerSheetStage.HOME_MAP) {
            if (_uiState.value.pickupCoords == null) MapPinTarget.PICKUP
            else if (_uiState.value.destinationCoords == null) MapPinTarget.DESTINATION
            else _uiState.value.activeFieldTarget
        } else {
            _uiState.value.activeFieldTarget
        }
        val exactPoint = GeoCoordinate(lat = lat, lon = lon)
        val insideLocal = ChennaiServiceArea.isPointInServiceArea(exactPoint)

        viewModelScope.launch {
            when (val res = repository.reverseGeocode(lat, lon)) {
                is RepoResult.Success -> {
                    val info = res.data
                    val inArea = info.inServiceArea && insideLocal
                    _uiState.update { state ->
                        if (target == MapPinTarget.PICKUP) {
                            state.copy(
                                pickupInput = info.display_name,
                                pickupCoords = info.coords,
                                pickupInServiceArea = inArea,
                                activeFieldTarget = if (state.destinationCoords == null) MapPinTarget.DESTINATION else state.activeFieldTarget,
                                errorMessage = if (!inArea) "Selected pickup (${String.format("%.4f", lat)}, ${String.format("%.4f", lon)}) is outside the Chennai operating boundary." else null,
                                errorCode = if (!inArea) "PICKUP_OUTSIDE_SERVICE_AREA" else null
                            )
                        } else {
                            state.copy(
                                destinationInput = info.display_name,
                                destinationCoords = info.coords,
                                destinationInServiceArea = inArea,
                                activeFieldTarget = if (state.pickupCoords == null) MapPinTarget.PICKUP else state.activeFieldTarget,
                                errorMessage = if (!inArea) "Selected destination (${String.format("%.4f", lat)}, ${String.format("%.4f", lon)}) is outside the Chennai operating boundary." else null,
                                errorCode = if (!inArea) "DESTINATION_OUTSIDE_SERVICE_AREA" else null
                            )
                        }
                    }
                    if (inArea && _uiState.value.pickupCoords != null && _uiState.value.destinationCoords != null) {
                        previewRouteAndFare(
                            advanceToStep = if (currentStage == PassengerSheetStage.HOME_MAP) {
                                PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE
                            } else {
                                currentStage
                            }
                        )
                    }
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(errorMessage = res.message, errorCode = res.code)
                    }
                }
            }
        }
    }

    fun onDeviceLocationResolved(lat: Double, lon: Double) {
        val exact = GeoCoordinate(lat = lat, lon = lon)
        val insideChennai = ChennaiServiceArea.isPointInServiceArea(exact)
        if (!insideChennai) {
            _uiState.update {
                it.copy(
                    gpsStatusBanner = "Your current GPS (${String.format("%.4f", lat)}, ${String.format("%.4f", lon)}) is outside Chennai. Pickup was not moved.",
                    errorMessage = "Device GPS is outside the Chennai operating boundary. Please select a Chennai pickup.",
                    errorCode = "PICKUP_OUTSIDE_SERVICE_AREA"
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                gpsStatusBanner = "Pickup updated from live Chennai GPS",
                activeFieldTarget = MapPinTarget.PICKUP
            )
        }
        onMapTap(lat, lon)
    }

    fun onLocationPermissionDenied() {
        _uiState.update {
            it.copy(
                gpsStatusBanner = "Location permission denied. Search any Chennai locality or tap the map directly."
            )
        }
    }

    /**
     * Step 03 & 04: Requests authoritative route & INR fare estimate from backend.
     */
    fun previewRouteAndFare(advanceToStep: PassengerSheetStage = PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE) {
        val state = _uiState.value
        if (state.pickupInput.isBlank() || state.destinationInput.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = "Please enter both a Chennai pickup and destination.")
            }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, errorCode = null) }
            when (
                val res = repository.getFareEstimate(
                    pickup = state.pickupInput,
                    destination = state.destinationInput,
                    pickupCoords = state.pickupCoords,
                    destinationCoords = state.destinationCoords
                )
            ) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            fareEstimate = res.data,
                            pickupCoords = res.data.originCoords,
                            destinationCoords = res.data.destinationCoords,
                            pickupInServiceArea = true,
                            destinationInServiceArea = true,
                            sheetStage = advanceToStep
                        )
                    }
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            fareEstimate = null,
                            errorMessage = res.message,
                            errorCode = res.code
                        )
                    }
                }
            }
        }
    }

    fun proceedToVehicleSelection() {
        if (_uiState.value.fareEstimate != null) {
            _uiState.update { it.copy(sheetStage = PassengerSheetStage.SELECT_VEHICLE, errorMessage = null) }
        } else {
            previewRouteAndFare(advanceToStep = PassengerSheetStage.SELECT_VEHICLE)
        }
    }

    fun selectVehicleType(vehicleType: String) {
        if (vehicleType in listOf("car", "cng", "motorcycle")) {
            _uiState.update { it.copy(selectedVehicleType = vehicleType) }
        }
    }

    /**
     * Step 05: Submits ride request to backend with duplicate-tap lock.
     * Transitions to `FINDING_DRIVER` only after server confirms creation (`status = "pending"`).
     */
    fun confirmAndRequestRide() {
        val state = _uiState.value
        if (state.isSubmittingRide || state.activeRide != null) return
        if (!state.pickupInServiceArea || !state.destinationInServiceArea) {
            _uiState.update {
                it.copy(
                    errorMessage = "Pickup and destination must be inside the Chennai operating boundary.",
                    errorCode = "OUTSIDE_SERVICE_AREA"
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingRide = true, errorMessage = null, errorCode = null) }
            when (
                val res = repository.createRide(
                    pickup = state.pickupInput,
                    destination = state.destinationInput,
                    vehicleType = state.selectedVehicleType,
                    pickupCoords = state.pickupCoords,
                    destinationCoords = state.destinationCoords
                )
            ) {
                is RepoResult.Success -> {
                    applyServerRideState(res.data, "created")
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isSubmittingRide = false,
                            errorMessage = res.message,
                            errorCode = res.code
                        )
                    }
                }
            }
        }
    }

    fun cancelActiveRide() {
        val rideId = _uiState.value.activeRide?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val res = repository.cancelRide(rideId, role = "user", reason = "Passenger cancelled request")) {
                is RepoResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            activeRide = null,
                            liveCaptainCoords = null,
                            sheetStage = PassengerSheetStage.HOME_MAP
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

    // ---------------- Step 08: Trip Completed, Rating & Return Home ----------------

    fun selectPaymentMethod(method: String) {
        _uiState.update { it.copy(selectedPaymentMethod = method) }
    }

    fun setRatingStars(stars: Int) {
        _uiState.update { it.copy(ratingStars = stars.coerceIn(1, 5)) }
    }

    fun setRatingFeedback(feedback: String) {
        _uiState.update { it.copy(ratingFeedback = feedback) }
    }

    fun submitRatingAndReturnHome() {
        val rideId = _uiState.value.activeRide?.id
        if (rideId == null) {
            returnToHomeMap()
            return
        }
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            when (
                val res = repository.payAndRateRide(
                    rideId = rideId,
                    paymentMethod = state.selectedPaymentMethod,
                    rating = state.ratingStars,
                    feedback = state.ratingFeedback.ifBlank { null }
                )
            ) {
                is RepoResult.Success -> {
                    loadLandmarksAndHistory()
                    returnToHomeMap()
                }
                is RepoResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message)
                    }
                }
            }
        }
    }

    fun returnToHomeMap() {
        _uiState.update {
            it.copy(
                isLoading = false,
                activeRide = null,
                liveCaptainCoords = null,
                fareEstimate = null,
                destinationInput = "",
                destinationCoords = null,
                ratingFeedback = "",
                ratingStars = 5,
                sheetStage = PassengerSheetStage.HOME_MAP,
                errorMessage = null,
                errorCode = null
            )
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null, errorCode = null) }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logoutPassenger()
            socketManager.disconnect()
            _uiState.value = PassengerUiState()
        }
    }
}

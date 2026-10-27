package com.cabsafe.chennai.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.FareEstimateResponseDto
import com.cabsafe.chennai.data.model.LandmarkSuggestionDto
import com.cabsafe.chennai.data.model.RideDto
import com.cabsafe.chennai.ui.components.ChennaiOsmMapView
import com.cabsafe.chennai.ui.viewmodel.MapPinTarget
import com.cabsafe.chennai.ui.viewmodel.PassengerSheetStage
import com.cabsafe.chennai.ui.viewmodel.PassengerUiState
import com.cabsafe.chennai.ui.viewmodel.PassengerViewModel
import com.google.android.gms.location.LocationServices

@SuppressLint("MissingPermission")
@Composable
fun PassengerScreen(
    viewModel: PassengerViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Handle system Back button across pre-booking contextual sheets
    BackHandler(
        enabled = state.sheetStage in listOf(
            PassengerSheetStage.DESTINATION_SEARCH,
            PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE,
            PassengerSheetStage.SELECT_VEHICLE
        )
    ) {
        viewModel.handleBackNavigation()
    }

    val fusedLocationClient = remember {
        LocationServices.getFusedLocationProviderClient(context)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            fusedLocationClient.lastLocation
                .addOnSuccessListener { location ->
                    if (location != null) {
                        viewModel.onDeviceLocationResolved(location.latitude, location.longitude)
                    } else {
                        viewModel.onLocationPermissionDenied()
                    }
                }
                .addOnFailureListener {
                    viewModel.onLocationPermissionDenied()
                }
        } else {
            viewModel.onLocationPermissionDenied()
        }
    }

    if (!state.isAuthenticated) {
        PassengerAuthCard(
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
            onLogin = viewModel::login,
            onRegister = viewModel::register,
            modifier = modifier
        )
        return
    }

    // Map-First Layout: Map remains the primary canvas while the bottom sheet adapts to `state.sheetStage`
    val mapWeight = if (state.sheetStage == PassengerSheetStage.DESTINATION_SEARCH) 0.34f else 0.54f
    val sheetWeight = 1f - mapWeight

    Column(modifier = modifier.fillMaxSize()) {
        // Primary Interactive Chennai Map Canvas
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(mapWeight)
        ) {
            val activeRide = state.activeRide
            val routeGeo = activeRide?.routeGeometry ?: state.fareEstimate?.routeGeometry

            ChennaiOsmMapView(
                pickupCoords = activeRide?.pickupCoords ?: state.pickupCoords,
                destinationCoords = activeRide?.destinationCoords ?: state.destinationCoords,
                captainCoords = state.liveCaptainCoords,
                routeGeometry = routeGeo,
                onMapTap = { lat, lon -> viewModel.onMapTap(lat, lon) },
                modifier = Modifier.fillMaxSize()
            )

            // Floating Top Pill: Pickup summary + Connection Status
            Surface(
                color = Color(0xEE0B0D12),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "CHENNAI",
                        color = Color(0xFFE2FF44),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = state.passenger?.fullname?.firstname ?: "Rider",
                        color = Color.White,
                        fontSize = 12.sp
                    )
                }
            }

            // One-Hand Floating GPS Button (Bottom-Right of Map)
            SmallFloatingActionButton(
                onClick = {
                    permissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                },
                containerColor = Color(0xFF181B22),
                contentColor = Color(0xFFE2FF44),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(12.dp)
            ) {
                Text("GPS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        // Contextual Obsidian Bottom Sheet (Switches cleanly across the 8 Uber-style passenger stages)
        Surface(
            color = Color(0xFF0B0D12),
            contentColor = Color.White,
            tonalElevation = 4.dp,
            shadowElevation = 10.dp,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(sheetWeight)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Global Error Banner with Retry/Dismiss
                state.errorMessage?.let { errorMsg ->
                    Surface(
                        color = Color(0xFF450A0A),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = errorMsg,
                                color = Color(0xFFFECACA),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = viewModel::dismissError) {
                                Text("Dismiss", fontSize = 11.sp, color = Color(0xFFE2FF44))
                            }
                        }
                    }
                }

                when (state.sheetStage) {
                    PassengerSheetStage.HOME_MAP -> HomeMapSheet(
                        state = state,
                        onOpenDestinationSearch = { viewModel.openDestinationSearch(MapPinTarget.DESTINATION) },
                        onOpenPickupEdit = { viewModel.openDestinationSearch(MapPinTarget.PICKUP) },
                        onSelectSuggestion = viewModel::selectSuggestion,
                        onSelectRecentRide = viewModel::selectRecentDestination,
                        onLogout = viewModel::logout
                    )

                    PassengerSheetStage.DESTINATION_SEARCH -> DestinationSearchSheet(
                        state = state,
                        onQueryChanged = viewModel::onAddressQueryChanged,
                        onSetPinTarget = viewModel::setPinTarget,
                        onSelectSuggestion = viewModel::selectSuggestion,
                        onConfirmRoute = { viewModel.previewRouteAndFare(PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE) },
                        onBack = { viewModel.handleBackNavigation() }
                    )

                    PassengerSheetStage.CONFIRM_PICKUP_AND_ROUTE -> ConfirmPickupRouteSheet(
                        state = state,
                        onAdjustLocations = { viewModel.openDestinationSearch(MapPinTarget.PICKUP) },
                        onChooseRide = viewModel::proceedToVehicleSelection
                    )

                    PassengerSheetStage.SELECT_VEHICLE -> SelectVehicleSheet(
                        state = state,
                        onSelectVehicle = viewModel::selectVehicleType,
                        onConfirmBooking = viewModel::confirmAndRequestRide,
                        onBackToRoute = { viewModel.handleBackNavigation() }
                    )

                    PassengerSheetStage.FINDING_DRIVER -> FindingDriverSheet(
                        ride = state.activeRide,
                        isLoading = state.isLoading,
                        onCancel = viewModel::cancelActiveRide
                    )

                    PassengerSheetStage.DRIVER_ASSIGNED -> DriverAssignedSheet(
                        ride = state.activeRide,
                        isLoading = state.isLoading,
                        onCancel = viewModel::cancelActiveRide
                    )

                    PassengerSheetStage.TRIP_IN_PROGRESS -> TripInProgressSheet(
                        ride = state.activeRide
                    )

                    PassengerSheetStage.TRIP_COMPLETED -> TripCompletedAndRateSheet(
                        state = state,
                        onSelectPaymentMethod = viewModel::selectPaymentMethod,
                        onSelectStars = viewModel::setRatingStars,
                        onFeedbackChanged = viewModel::setRatingFeedback,
                        onSubmitRating = viewModel::submitRatingAndReturnHome
                    )
                }
            }
        }
    }
}

/**
 * 01 · HOME_MAP Sheet:
 * Reference Screen 1 ("Where do you want to go?", dual stacked location pills, and chartreuse "Where to?" CTA).
 */
@Composable
private fun HomeMapSheet(
    state: PassengerUiState,
    onOpenDestinationSearch: () -> Unit,
    onOpenPickupEdit: () -> Unit,
    onSelectSuggestion: (LandmarkSuggestionDto) -> Unit,
    onSelectRecentRide: (RideDto) -> Unit,
    onLogout: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Where do you\nwant to go?",
            fontSize = 22.sp,
            lineHeight = 26.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White
        )
        TextButton(onClick = onLogout) {
            Text("Sign Out", fontSize = 12.sp, color = Color(0xFFE2FF44))
        }
    }

    // Dual Stacked Location Card (#252932 container with #0D0F14 inner pills)
    Surface(
        color = Color(0xFF252932),
        shape = RoundedCornerShape(22.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                color = Color(0xFF0D0F14),
                shape = RoundedCornerShape(50),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenPickupEdit() }
            ) {
                Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Text("PICK-UP LOCATION", fontSize = 9.sp, color = Color(0xFFE2FF44), fontWeight = FontWeight.Bold)
                    Text(state.pickupInput, fontSize = 12.sp, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }

            Surface(
                color = Color(0xFF0D0F14),
                shape = RoundedCornerShape(50),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenDestinationSearch() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Where to?",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Surface(
                        color = Color(0xFFE2FF44),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Text(
                            text = "Driver · Chennai",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF0B0D12),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }

    // Recent Destinations (when actual trip history is available)
    if (state.recentRides.isNotEmpty()) {
        Text(
            text = "Recent Destinations",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF94A3B8)
        )
        state.recentRides.take(2).forEach { ride ->
            Surface(
                color = Color(0xFF181B22),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectRecentRide(ride) }
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(ride.destination, fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.Medium, maxLines = 1)
                        Text("Recent trip · ₹${String.format("%.2f", ride.fare)}", fontSize = 11.sp, color = Color(0xFF94A3B8))
                    }
                    Text("Book →", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFE2FF44))
                }
            }
        }
    }

    // Popular Chennai Localities
    Text(
        text = "Popular Chennai Destinations",
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFF94A3B8)
    )
    ChennaiServiceArea.SUPPORTED_CHENNAI_LOCALITIES.take(4).forEach { item ->
        Surface(
            color = Color(0xFF181B22),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onSelectSuggestion(item) }
        ) {
            Row(
                modifier = Modifier.padding(10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.name, fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
                    Text(item.display_name, fontSize = 11.sp, color = Color(0xFF94A3B8), maxLines = 1)
                }
                Text(item.category, fontSize = 10.sp, color = Color(0xFFE2FF44))
            }
        }
    }
}

/**
 * 02 · DESTINATION_SEARCH Sheet:
 * Editable Pickup & Destination inputs, 300ms debounced suggestions, and map-tap pin selection.
 */
@Composable
private fun DestinationSearchSheet(
    state: PassengerUiState,
    onQueryChanged: (String, MapPinTarget) -> Unit,
    onSetPinTarget: (MapPinTarget) -> Unit,
    onSelectSuggestion: (LandmarkSuggestionDto) -> Unit,
    onConfirmRoute: () -> Unit,
    onBack: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Plan Your Chennai Ride", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        TextButton(onClick = onBack) {
            Text("Back")
        }
    }

    OutlinedTextField(
        value = state.pickupInput,
        onValueChange = { onQueryChanged(it, MapPinTarget.PICKUP) },
        label = { Text("Pickup Location (Chennai)") },
        singleLine = true,
        isError = !state.pickupInServiceArea,
        modifier = Modifier.fillMaxWidth()
    )

    OutlinedTextField(
        value = state.destinationInput,
        onValueChange = { onQueryChanged(it, MapPinTarget.DESTINATION) },
        label = { Text("Where to? (Destination in Chennai)") },
        singleLine = true,
        isError = !state.destinationInServiceArea,
        modifier = Modifier.fillMaxWidth()
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = state.activeFieldTarget == MapPinTarget.PICKUP,
                onClick = { onSetPinTarget(MapPinTarget.PICKUP) },
                label = { Text("Tap Map = Pickup", fontSize = 11.sp) }
            )
            FilterChip(
                selected = state.activeFieldTarget == MapPinTarget.DESTINATION,
                onClick = { onSetPinTarget(MapPinTarget.DESTINATION) },
                label = { Text("Tap Map = Destination", fontSize = 11.sp) }
            )
        }
        if (state.isSearchingSuggestions) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        }
    }

    state.suggestions.take(6).forEach { suggestion ->
        val inArea = suggestion.inServiceArea != false
        Surface(
            color = Color(0xFFF8FAFC),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onSelectSuggestion(suggestion) }
        ) {
            Row(
                modifier = Modifier.padding(10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(suggestion.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(suggestion.display_name, fontSize = 11.sp, color = Color.Gray, maxLines = 1)
                }
                Text(
                    text = if (inArea) "Chennai" else "Outside Area",
                    color = if (inArea) Color(0xFF047857) else Color(0xFFB91C1C),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }

    Button(
        onClick = onConfirmRoute,
        enabled = state.pickupInput.isNotBlank() && state.destinationInput.isNotBlank() && !state.isLoading,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(if (state.isLoading) "Checking Route..." else "Confirm Pickup & Route")
    }
}

/**
 * 03 · CONFIRM_PICKUP_AND_ROUTE Sheet:
 * Shows both locations on the map, route polyline, distance & duration, and option to adjust pickup.
 */
@Composable
private fun ConfirmPickupRouteSheet(
    state: PassengerUiState,
    onAdjustLocations: () -> Unit,
    onChooseRide: () -> Unit
) {
    val fare = state.fareEstimate
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Confirm Pickup & Route", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            if (fare != null) {
                Text(
                    text = "${fare.distance.text} · Est. ${fare.duration.text}",
                    fontSize = 12.sp,
                    color = Color(0xFF047857),
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        TextButton(onClick = onAdjustLocations) {
            Text("Edit Locations")
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("PICKUP (Tap map to fine-tune pin)", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
            Text(state.pickupInput, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            Text("DESTINATION", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
            Text(state.destinationInput, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }
    }

    Button(
        onClick = onChooseRide,
        enabled = !state.isLoading && state.pickupInServiceArea && state.destinationInServiceArea,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("Choose a Ride Option")
    }
}

/**
 * 04 · SELECT_VEHICLE Sheet:
 * Compact cards for backend-supported categories (`car`, `cng`, `motorcycle`) with INR (`₹`) fares and one clear CTA.
 */
@Composable
private fun SelectVehicleSheet(
    state: PassengerUiState,
    onSelectVehicle: (String) -> Unit,
    onConfirmBooking: () -> Unit,
    onBackToRoute: () -> Unit
) {
    val fareData: FareEstimateResponseDto? = state.fareEstimate
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Choose a Ride", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            if (fareData != null) {
                Text("${fareData.distance.text} · ${fareData.duration.text}", fontSize = 12.sp, color = Color.Gray)
            }
        }
        TextButton(onClick = onBackToRoute) {
            Text("Back")
        }
    }

    val vehicleTiers = listOf(
        Triple("car", "CabSafe Go", "4 seats · AC Sedan · 2 mins away"),
        Triple("cng", "CabSafe Auto", "3 seats · Chennai Auto · 3 mins away"),
        Triple("motorcycle", "CabSafe Moto", "1 seat · Fast Bike · 1 min away")
    )

    vehicleTiers.forEach { (typeKey, name, subtitle) ->
        val selected = state.selectedVehicleType == typeKey
        val price = fareData?.fares?.get(typeKey) ?: when (typeKey) {
            "car" -> fareData?.car
            "cng" -> fareData?.cng
            else -> fareData?.motorcycle
        }
        Surface(
            color = if (selected) Color(0xFFF1F5F9) else Color.White,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) Color(0xFF0F172A) else Color(0xFFE2E8F0)),
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onSelectVehicle(typeKey) }
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(subtitle, fontSize = 12.sp, color = Color(0xFF64748B))
                }
                Text(
                    text = if (price != null) "₹${String.format("%.2f", price)}" else "—",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }

    val selectedLabel = when (state.selectedVehicleType) {
        "car" -> "CabSafe Go"
        "cng" -> "CabSafe Auto"
        else -> "CabSafe Moto"
    }
    val selectedFare = fareData?.fares?.get(state.selectedVehicleType)

    Button(
        onClick = onConfirmBooking,
        enabled = !state.isSubmittingRide && fareData != null,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            if (state.isSubmittingRide) "Requesting Ride..."
            else if (selectedFare != null) "Confirm $selectedLabel · ₹${String.format("%.2f", selectedFare)}"
            else "Confirm $selectedLabel"
        )
    }
}

/**
 * 05 · FINDING_DRIVER Sheet:
 * Progress feedback while awaiting server `ride-confirmed`, duplicate guard, and cancel option.
 */
@Composable
private fun FindingDriverSheet(
    ride: RideDto?,
    isLoading: Boolean,
    onCancel: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Finding your driver…", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("Connecting with nearby Chennai captains", fontSize = 12.sp, color = Color.Gray)
            }
            if (ride != null) {
                Text(
                    text = "₹${String.format("%.2f", ride.fare)}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

        if (ride != null) {
            Text("Pickup: ${ride.pickup}", fontSize = 12.sp, maxLines = 1)
            Text("Destination: ${ride.destination}", fontSize = 12.sp, maxLines = 1)
        }

        OutlinedButton(
            onClick = onCancel,
            enabled = !isLoading,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isLoading) "Cancelling..." else "Cancel Ride Request")
        }
    }
}

/**
 * 06 · DRIVER_ASSIGNED Sheet:
 * Shows verified captain name, rating, vehicle model, TN plate, pickup ETA, and passenger's 6-digit OTP.
 */
@Composable
private fun DriverAssignedSheet(
    ride: RideDto?,
    isLoading: Boolean,
    onCancel: () -> Unit
) {
    val captain = ride?.captain
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Driver Assigned & Arriving", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF047857))
                Text(
                    text = "ETA ~${ride?.matchExplanation?.etaMinutes ?: 3} mins to pickup",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
            }
            if (ride != null) {
                Text(
                    text = "₹${String.format("%.2f", ride.fare)}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        // 6-Digit Pickup Verification OTP
        if (!ride?.otp.isNullOrBlank()) {
            Surface(
                color = Color(0xFF0F172A),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Pickup Verification OTP", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("Share this 6-digit code with your captain", color = Color(0xFF94A3B8), fontSize = 11.sp)
                    }
                    Text(
                        text = ride?.otp ?: "",
                        color = Color(0xFFFBBF24),
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Verified Captain Card
        if (captain != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(captain.fullname.displayName, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            text = "${captain.vehicle.color} ${captain.vehicle.model ?: captain.vehicle.vehicleType}",
                            fontSize = 12.sp,
                            color = Color(0xFF475569)
                        )
                        Text(
                            text = "Rating ★ ${String.format("%.2f", captain.metrics.rating)} · ${captain.metrics.completedRides} trips",
                            fontSize = 11.sp,
                            color = Color.Gray
                        )
                    }
                    Surface(
                        color = Color(0xFFFEF3C7),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = captain.vehicle.plate,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp,
                            color = Color(0xFF92400E),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        OutlinedButton(
            onClick = onCancel,
            enabled = !isLoading,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Cancel Ride")
        }
    }
}

/**
 * 07 · TRIP_IN_PROGRESS Sheet:
 * Shows active route, destination, captain details, and live status.
 */
@Composable
private fun TripInProgressSheet(ride: RideDto?) {
    val captain = ride?.captain
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Trip in Progress", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF047857))
                Text("En route to Chennai destination", fontSize = 12.sp, color = Color.Gray)
            }
            if (ride != null) {
                Text(
                    text = "₹${String.format("%.2f", ride.fare)}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        if (captain != null) {
            Surface(
                color = Color(0xFFF8FAFC),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${captain.fullname.displayName} · ${captain.vehicle.plate}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                    Text("Live GPS Active", fontSize = 11.sp, color = Color(0xFF047857), fontWeight = FontWeight.Bold)
                }
            }
        }

        if (ride != null) {
            Text("Destination: ${ride.destination}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }
    }
}

/**
 * 08 · TRIP_COMPLETED Sheet:
 * Confirmed final fare in INR (`₹`), summary, payment method, 1-5 star driver rating, and Return Home CTA.
 */
@Composable
private fun TripCompletedAndRateSheet(
    state: PassengerUiState,
    onSelectPaymentMethod: (String) -> Unit,
    onSelectStars: (Int) -> Unit,
    onFeedbackChanged: (String) -> Unit,
    onSubmitRating: () -> Unit
) {
    val ride = state.activeRide
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Trip Completed", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text(ride?.destination ?: "Arrived in Chennai", fontSize = 12.sp, color = Color.Gray, maxLines = 1)
        }
        Text(
            text = "₹${String.format("%.2f", ride?.fare ?: 0.0)}",
            fontWeight = FontWeight.ExtraBold,
            fontSize = 18.sp,
            color = Color(0xFF047857),
            fontFamily = FontFamily.Monospace
        )
    }

    Text("Payment Method", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("Card", "Cash", "Wallet").forEach { method ->
            FilterChip(
                selected = state.selectedPaymentMethod == method,
                onClick = { onSelectPaymentMethod(method) },
                label = { Text(method) }
            )
        }
    }

    Text("Rate Your Captain", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (1..5).forEach { star ->
            FilterChip(
                selected = star <= state.ratingStars,
                onClick = { onSelectStars(star) },
                label = { Text("$star ★") }
            )
        }
    }

    OutlinedTextField(
        value = state.ratingFeedback,
        onValueChange = onFeedbackChanged,
        label = { Text("Optional trip feedback") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )

    Button(
        onClick = onSubmitRating,
        enabled = !state.isLoading,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(if (state.isLoading) "Saving..." else "Submit Rating & Return Home")
    }
}

@Composable
private fun PassengerAuthCard(
    isLoading: Boolean,
    errorMessage: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String, String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    var isRegisterMode by remember { mutableStateOf(false) }
    var firstname by remember { mutableStateOf("Alex") }
    var lastname by remember { mutableStateOf("Rivera") }
    var email by remember { mutableStateOf("alex.passenger@cabsafe.demo") }
    var phone by remember { mutableStateOf("+91 98401 23410") }
    var password by remember { mutableStateOf("password123") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "CabSafe Chennai",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Passenger Mobility · Chennai Operating Boundary (13.0827° N, 80.2707° E)",
            fontSize = 13.sp,
            color = Color.Gray,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        errorMessage?.let {
            Text(
                text = it,
                color = Color(0xFFB91C1C),
                modifier = Modifier.padding(bottom = 12.dp)
            )
        }

        if (isRegisterMode) {
            OutlinedTextField(
                value = firstname,
                onValueChange = { firstname = it },
                label = { Text("First Name") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = lastname,
                onValueChange = { lastname = it },
                label = { Text("Last Name") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("Mobile Phone") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Passenger Email") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                if (isRegisterMode) {
                    onRegister(firstname, lastname, email, phone, password)
                } else {
                    onLogin(email, password)
                }
            },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isRegisterMode) "Create Passenger Account" else "Sign In as Passenger")
        }

        TextButton(
            onClick = { isRegisterMode = !isRegisterMode },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text(
                if (isRegisterMode) "Already have an account? Sign In"
                else "New to CabSafe Chennai? Create Account"
            )
        }
    }
}

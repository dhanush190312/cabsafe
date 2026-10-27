package com.cabsafe.chennai.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.RideDto
import com.cabsafe.chennai.ui.components.ChennaiOsmMapView
import com.cabsafe.chennai.ui.viewmodel.CaptainSheetStage
import com.cabsafe.chennai.ui.viewmodel.CaptainUiState
import com.cabsafe.chennai.ui.viewmodel.CaptainViewModel

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CaptainScreen(
    viewModel: CaptainViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()

    if (!state.isAuthenticated) {
        CaptainAuthCard(
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
            onLogin = viewModel::login,
            onRegister = viewModel::register,
            modifier = modifier
        )
        return
    }

    val activeOrOffer = state.assignedRide ?: state.pendingOffers.firstOrNull()
    val isOnline = state.captain?.status == "active"

    Column(modifier = modifier.fillMaxSize()) {
        // Primary Chennai Map Canvas (52% height)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.52f)
        ) {
            ChennaiOsmMapView(
                pickupCoords = activeOrOffer?.pickupCoords,
                destinationCoords = activeOrOffer?.destinationCoords,
                captainCoords = state.currentCoords,
                routeGeometry = activeOrOffer?.routeGeometry,
                onMapTap = { lat, lon -> viewModel.updateLocationInChennai(lat, lon) },
                modifier = Modifier.fillMaxSize()
            )

            // Top Floating Online/Offline Control Bar
            Surface(
                color = Color(0xEE0F172A),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = viewModel::toggleAvailability,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isOnline) Color(0xFFE2FF44) else Color(0xFF1C1F26),
                            contentColor = if (isOnline) Color(0xFF0B0D12) else Color.White
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Text(if (isOnline) "ONLINE" else "OFFLINE", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    Surface(
                        color = Color.White,
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Text(
                            text = state.captain?.vehicle?.plate ?: "",
                            color = Color(0xFF0B0D12),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }
        }

        // Contextual Obsidian Driver Bottom Sheet (Switches cleanly across the 6 Driver stages)
        Surface(
            color = Color(0xFF0B0D12),
            contentColor = Color.White,
            tonalElevation = 4.dp,
            shadowElevation = 10.dp,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(0.48f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                state.errorMessage?.let { err ->
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
                                text = err,
                                color = Color(0xFFFECACA),
                                fontSize = 12.sp,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = viewModel::dismissError) {
                                Text("Dismiss", fontSize = 11.sp, color = Color(0xFFE2FF44))
                            }
                        }
                    }
                }

                when (state.sheetStage) {
                    CaptainSheetStage.DRIVER_HOME -> DriverHomeSheet(
                        state = state,
                        onToggleOnline = viewModel::toggleAvailability,
                        onUpdateStandLocation = viewModel::updateLocationInChennai,
                        onRefresh = viewModel::recoverCaptainStateFromServer,
                        onLogout = viewModel::logout
                    )

                    CaptainSheetStage.INCOMING_REQUEST -> IncomingRequestSheet(
                        offer = state.pendingOffers.firstOrNull(),
                        isLoading = state.isLoading,
                        onAccept = viewModel::acceptRideOffer,
                        onDismiss = viewModel::dismissOfferLocally
                    )

                    CaptainSheetStage.NAVIGATE_TO_PICKUP_AND_OTP -> NavigateToPickupAndOtpSheet(
                        ride = state.assignedRide,
                        otpInput = state.otpInput,
                        isLoading = state.isLoading,
                        onOtpChanged = viewModel::onOtpChanged,
                        onVerifyOtp = viewModel::verifyOtpAndStartTrip,
                        onCancel = viewModel::cancelAssignedRide
                    )

                    CaptainSheetStage.ACTIVE_TRIP -> ActiveTripSheet(
                        ride = state.assignedRide,
                        isLoading = state.isLoading,
                        onCompleteTrip = viewModel::completeTrip
                    )

                    CaptainSheetStage.TRIP_SUMMARY -> TripSummarySheet(
                        completedRide = state.completedTripSummary,
                        totalEarningsInr = state.captain?.metrics?.totalEarnings ?: 0.0,
                        onReturnHome = viewModel::acknowledgeSummaryAndReturnHome
                    )
                }
            }
        }
    }
}

/**
 * 01 · DRIVER_HOME Sheet:
 * Shows online/offline state, Chennai stand location selector, and trip/earnings summary in INR (`₹`).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DriverHomeSheet(
    state: CaptainUiState,
    onToggleOnline: () -> Unit,
    onUpdateStandLocation: (Double, Double) -> Unit,
    onRefresh: () -> Unit,
    onLogout: () -> Unit
) {
    val captain = state.captain
    val isOnline = captain?.status == "active"

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = if (isOnline) "You're Online in Chennai" else "You're Offline",
                fontWeight = FontWeight.Bold,
                fontSize = 17.sp,
                color = if (isOnline) Color(0xFF047857) else Color(0xFF475569)
            )
            Text(
                text = if (isOnline) "Listening for nearby ride requests…" else "Go online to receive Chennai ride requests",
                fontSize = 12.sp,
                color = Color.Gray
            )
        }
        TextButton(onClick = onLogout) {
            Text("Sign Out", fontSize = 12.sp)
        }
    }

    if (captain != null) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Total Earned (INR)", fontSize = 11.sp, color = Color.Gray)
                    Text(
                        text = "₹${String.format("%.2f", captain.metrics.totalEarnings)}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Completed", fontSize = 11.sp, color = Color.Gray)
                    Text("${captain.metrics.completedRides} trips", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Rating", fontSize = 11.sp, color = Color.Gray)
                    Text("★ ${String.format("%.2f", captain.metrics.rating)}", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }

    Text("Set Captain Stand in Chennai (or tap map):", fontSize = 11.sp, color = Color.Gray)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        ChennaiServiceArea.SUPPORTED_CHENNAI_LOCALITIES.take(5).forEach { loc ->
            AssistChip(
                onClick = { onUpdateStandLocation(loc.lat, loc.lon) },
                label = { Text(loc.name, fontSize = 11.sp) }
            )
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = onToggleOnline,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isOnline) Color(0xFF475569) else Color(0xFF059669)
            ),
            modifier = Modifier.weight(1f)
        ) {
            Text(if (isOnline) "Go Offline" else "Go Online Now")
        }
        if (isOnline) {
            OutlinedButton(onClick = onRefresh) {
                Text("Check Offers")
            }
        }
    }
}

/**
 * 02 · INCOMING_REQUEST Sheet:
 * Prominent request card with pickup area, destination area, distance, INR fare (`₹`), and Accept CTA.
 */
@Composable
private fun IncomingRequestSheet(
    offer: RideDto?,
    isLoading: Boolean,
    onAccept: (String) -> Unit,
    onDismiss: (String) -> Unit
) {
    if (offer == null) return

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("NEW CHENNAI RIDE REQUEST", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF92400E))
                Text(
                    text = offer.user?.fullname?.displayName ?: "Verified Passenger",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "₹${String.format("%.2f", offer.fare)}",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "${String.format("%.1f", offer.distance / 1000.0)} km",
                    fontSize = 12.sp,
                    color = Color(0xFF475569)
                )
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("PICKUP", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
        Text(offer.pickup, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Spacer(modifier = Modifier.height(4.dp))
        Text("DESTINATION", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
        Text(offer.destination, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        OutlinedButton(
            onClick = { onDismiss(offer.id) },
            enabled = !isLoading,
            modifier = Modifier.weight(1f)
        ) {
            Text("Dismiss")
        }
        Button(
            onClick = { onAccept(offer.id) },
            enabled = !isLoading,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
            modifier = Modifier.weight(2f)
        ) {
            Text(if (isLoading) "Confirming..." else "Accept Ride (₹${String.format("%.2f", offer.fare)})")
        }
    }
}

/**
 * 03 & 04 · NAVIGATE_TO_PICKUP_AND_OTP Sheet:
 * Shows pickup point, passenger details, and requires server-verified 6-digit OTP to start the trip.
 */
@Composable
private fun NavigateToPickupAndOtpSheet(
    ride: RideDto?,
    otpInput: String,
    isLoading: Boolean,
    onOtpChanged: (String) -> Unit,
    onVerifyOtp: () -> Unit,
    onCancel: () -> Unit
) {
    if (ride == null) return

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Navigate to Passenger Pickup", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(
                text = "Passenger: ${ride.user?.fullname?.displayName ?: "Rider"}",
                fontSize = 12.sp,
                color = Color.Gray
            )
        }
        Text(
            text = "₹${String.format("%.2f", ride.fare)}",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            fontFamily = FontFamily.Monospace
        )
    }

    Text("Pickup: ${ride.pickup}", fontSize = 13.sp, fontWeight = FontWeight.Medium)

    OutlinedTextField(
        value = otpInput,
        onValueChange = onOtpChanged,
        label = { Text("Enter Passenger's 6-Digit Pickup OTP") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedButton(
            onClick = onCancel,
            enabled = !isLoading,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
            modifier = Modifier.weight(1f)
        ) {
            Text("Cancel")
        }
        Button(
            onClick = onVerifyOtp,
            enabled = otpInput.length == 6 && !isLoading,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
            modifier = Modifier.weight(2f)
        ) {
            Text(if (isLoading) "Verifying OTP..." else "Verify OTP & Start Trip")
        }
    }
}

/**
 * 05 · ACTIVE_TRIP Sheet:
 * Shows destination, route, and authorized "Complete Trip" action (`POST /rides/end-ride`).
 */
@Composable
private fun ActiveTripSheet(
    ride: RideDto?,
    isLoading: Boolean,
    onCompleteTrip: () -> Unit
) {
    if (ride == null) return

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Active Trip in Progress", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF047857))
            Text("Navigating to Chennai destination", fontSize = 12.sp, color = Color.Gray)
        }
        Text(
            text = "₹${String.format("%.2f", ride.fare)}",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            fontFamily = FontFamily.Monospace
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("DROPOFF DESTINATION", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
            Text(ride.destination, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }
    }

    Button(
        onClick = onCompleteTrip,
        enabled = !isLoading,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(if (isLoading) "Completing Trip..." else "Complete Trip · Collect ₹${String.format("%.2f", ride.fare)}")
    }
}

/**
 * 06 · TRIP_SUMMARY Sheet:
 * Dedicated completion summary showing server-confirmed fare (`₹`) and updated captain earnings.
 */
@Composable
private fun TripSummarySheet(
    completedRide: RideDto?,
    totalEarningsInr: Double,
    onReturnHome: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Trip Completed!", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF047857))
                Text("Server-confirmed trip summary", fontSize = 12.sp, color = Color.Gray)
            }
            Text(
                text = "+₹${String.format("%.2f", completedRide?.fare ?: 0.0)}",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                color = Color(0xFF047857),
                fontFamily = FontFamily.Monospace
            )
        }

        if (completedRide != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Pickup: ${completedRide.pickup}", fontSize = 12.sp)
                    Text("Dropoff: ${completedRide.destination}", fontSize = 12.sp)
                    Text(
                        text = "Updated Total Earnings: ₹${String.format("%.2f", totalEarningsInr)}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }

        Button(
            onClick = onReturnHome,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Back to Driver Home — Ready for Next Request")
        }
    }
}

@Composable
private fun CaptainAuthCard(
    isLoading: Boolean,
    errorMessage: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String, String, String, String, String, Int, String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    var isRegisterMode by remember { mutableStateOf(false) }
    var firstname by remember { mutableStateOf("Marcus") }
    var lastname by remember { mutableStateOf("Vance") }
    var email by remember { mutableStateOf("marcus.captain@cabsafe.demo") }
    var phone by remember { mutableStateOf("+91 98407 01441") }
    var password by remember { mutableStateOf("password123") }
    var color by remember { mutableStateOf("Obsidian Black") }
    var plate by remember { mutableStateOf("TN-09-CB-8921") }
    var model by remember { mutableStateOf("Toyota Camry Hybrid") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "CabSafe Chennai — Driver",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Captain Dispatch · 6-Digit OTP Handshake · INR Earnings",
            fontSize = 13.sp,
            color = Color.Gray,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        errorMessage?.let {
            Text(text = it, color = Color(0xFFB91C1C), modifier = Modifier.padding(bottom = 12.dp))
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
                value = plate,
                onValueChange = { plate = it },
                label = { Text("TN Registration Plate (e.g., TN-09-CB-8921)") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Captain Email") },
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
                    onRegister(firstname, lastname, email, phone, password, color, plate, 4, "car", model)
                } else {
                    onLogin(email, password)
                }
            },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isRegisterMode) "Register Chennai Captain" else "Sign In as Captain")
        }

        TextButton(
            onClick = { isRegisterMode = !isRegisterMode },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text(
                if (isRegisterMode) "Already registered? Captain Sign In"
                else "New Captain? Register TN Vehicle"
            )
        }
    }
}

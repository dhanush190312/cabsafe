package com.cabsafe.chennai.data.repository

import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.local.SecureTokenStore
import com.cabsafe.chennai.data.model.*
import com.cabsafe.chennai.data.remote.CabSafeApiService
import com.cabsafe.chennai.data.remote.CabSafeNetworkModule
import org.json.JSONObject
import retrofit2.Response

sealed class RepoResult<out T> {
    data class Success<T>(val data: T) : RepoResult<T>()
    data class Error(
        val message: String,
        val code: String? = null,
        val httpStatus: Int? = null
    ) : RepoResult<Nothing>()
}

/**
 * Repository coordinating Retrofit REST calls, Chennai service-boundary validation,
 * and EncryptedSharedPreferences token persistence.
 */
class CabSafeRepository(
    val tokenStore: SecureTokenStore,
    private val api: CabSafeApiService = CabSafeNetworkModule.createApiService(tokenStore)
) {

    // ---------------- Passenger Auth & Session ----------------

    suspend fun loginPassenger(email: String, password: String): RepoResult<AuthUserResponse> =
        safeCall { api.loginUser(LoginRequest(email.trim(), password)) }.also { res ->
            if (res is RepoResult.Success) {
                tokenStore.saveToken("user", res.data.token)
            }
        }

    suspend fun registerPassenger(
        firstname: String,
        lastname: String,
        email: String,
        phone: String,
        password: String
    ): RepoResult<AuthUserResponse> =
        safeCall {
            api.registerUser(
                RegisterUserRequest(
                    fullname = FullNameDto(firstname.trim(), lastname.trim().ifEmpty { null }),
                    email = email.trim(),
                    phone = phone.trim().ifEmpty { "+91 98401 23410" },
                    password = password
                )
            )
        }.also { res ->
            if (res is RepoResult.Success) {
                tokenStore.saveToken("user", res.data.token)
            }
        }

    suspend fun getUserProfile(): RepoResult<UserDto> =
        safeCall { api.getUserProfile(role = "user") }

    suspend fun logoutPassenger(): RepoResult<Map<String, String>> =
        safeCall { api.logoutUser(role = "user") }.also {
            tokenStore.clearToken("user")
        }

    // ---------------- Captain Auth & Session ----------------

    suspend fun loginCaptain(email: String, password: String): RepoResult<AuthCaptainResponse> =
        safeCall { api.loginCaptain(LoginRequest(email.trim(), password)) }.also { res ->
            if (res is RepoResult.Success) {
                tokenStore.saveToken("captain", res.data.token)
            }
        }

    suspend fun registerCaptain(
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
    ): RepoResult<AuthCaptainResponse> =
        safeCall {
            api.registerCaptain(
                RegisterCaptainRequest(
                    fullname = FullNameDto(firstname.trim(), lastname.trim().ifEmpty { null }),
                    email = email.trim(),
                    phone = phone.trim().ifEmpty { "+91 98407 01441" },
                    password = password,
                    vehicle = VehicleDto(
                        color = color.trim(),
                        plate = plate.trim().uppercase(),
                        capacity = capacity,
                        vehicleType = vehicleType,
                        model = model.trim().ifEmpty { "Sedan" }
                    )
                )
            )
        }.also { res ->
            if (res is RepoResult.Success) {
                tokenStore.saveToken("captain", res.data.token)
            }
        }

    suspend fun getCaptainProfile(): RepoResult<CaptainDto> =
        safeCall { api.getCaptainProfile(role = "captain") }

    suspend fun updateCaptainStatus(status: String): RepoResult<CaptainDto> =
        safeCall { api.updateCaptainStatus(UpdateCaptainStatusRequest(status), role = "captain") }

    suspend fun updateCaptainLocation(lat: Double, lon: Double): RepoResult<CaptainDto> {
        val point = GeoCoordinate(lat = lat, lon = lon)
        if (!ChennaiServiceArea.isPointInServiceArea(point)) {
            return RepoResult.Error(
                message = "Captain coordinates ($lat, $lon) are outside the supported Chennai operating boundary.",
                code = "CAPTAIN_LOCATION_OUTSIDE_SERVICE_AREA",
                httpStatus = 422
            )
        }
        return safeCall {
            api.updateCaptainLocation(UpdateCaptainLocationRequest(lat = lat, lon = lon), role = "captain")
        }
    }

    suspend fun logoutCaptain(): RepoResult<Map<String, String>> =
        safeCall { api.logoutCaptain(role = "captain") }.also {
            tokenStore.clearToken("captain")
        }

    // ---------------- Maps & Chennai Boundary Validation ----------------

    suspend fun getChennaiLandmarks(): RepoResult<List<LandmarkSuggestionDto>> =
        safeCall { api.getChennaiLandmarks() }

    suspend fun getAddressSuggestions(input: String): RepoResult<List<LandmarkSuggestionDto>> =
        safeCall { api.getAddressSuggestions(input.trim(), role = "user") }

    suspend fun reverseGeocode(lat: Double, lon: Double): RepoResult<ReverseGeocodeResponse> =
        safeCall { api.reverseGeocode(lat = lat, lon = lon, role = "user") }

    // ---------------- Authoritative Ride Lifecycle ----------------

    suspend fun getFareEstimate(
        pickup: String,
        destination: String,
        pickupCoords: GeoCoordinate?,
        destinationCoords: GeoCoordinate?
    ): RepoResult<FareEstimateResponseDto> {
        if (pickupCoords != null && destinationCoords != null) {
            val check = ChennaiServiceArea.validateTripEndpoints(pickupCoords, destinationCoords)
            if (!check.valid) {
                return RepoResult.Error(
                    message = check.message ?: "Locations must be inside the Chennai operating area.",
                    code = check.code ?: "OUTSIDE_SERVICE_AREA",
                    httpStatus = 422
                )
            }
        }
        return safeCall {
            api.getFareEstimate(
                pickup = pickup.trim(),
                destination = destination.trim(),
                pickupLat = pickupCoords?.lat,
                pickupLon = pickupCoords?.lon,
                destLat = destinationCoords?.lat,
                destLon = destinationCoords?.lon,
                role = "user"
            )
        }
    }

    suspend fun createRide(
        pickup: String,
        destination: String,
        vehicleType: String,
        pickupCoords: GeoCoordinate?,
        destinationCoords: GeoCoordinate?
    ): RepoResult<RideDto> {
        if (pickupCoords != null && destinationCoords != null) {
            val check = ChennaiServiceArea.validateTripEndpoints(pickupCoords, destinationCoords)
            if (!check.valid) {
                return RepoResult.Error(
                    message = check.message ?: "Ride endpoints are outside the Chennai operating boundary.",
                    code = check.code ?: "OUTSIDE_SERVICE_AREA",
                    httpStatus = 422
                )
            }
        }
        return safeCall {
            api.createRide(
                CreateRideRequest(
                    pickup = pickup.trim(),
                    destination = destination.trim(),
                    vehicleType = vehicleType,
                    pickupCoords = pickupCoords,
                    destinationCoords = destinationCoords
                ),
                role = "user"
            )
        }
    }

    suspend fun getActiveRide(role: String): RepoResult<ActiveRideResponseDto> =
        safeCall { api.getActiveRide(role = role) }

    suspend fun getRideHistory(role: String): RepoResult<List<RideDto>> =
        safeCall { api.getRideHistory(role = role) }

    suspend fun confirmRide(rideId: String): RepoResult<RideDto> =
        safeCall { api.confirmRide(ConfirmRideRequest(rideId), role = "captain") }

    suspend fun startRideWithOtp(rideId: String, otp: String): RepoResult<RideDto> =
        safeCall { api.startRideWithOtp(StartRideOtpRequest(rideId, otp.trim()), role = "captain") }

    suspend fun endRide(rideId: String): RepoResult<RideDto> =
        safeCall { api.endRide(EndRideRequest(rideId), role = "captain") }

    suspend fun cancelRide(rideId: String, role: String, reason: String? = null): RepoResult<RideDto> =
        safeCall { api.cancelRide(CancelRideRequest(rideId, reason), role = role) }

    suspend fun payAndRateRide(
        rideId: String,
        paymentMethod: String,
        rating: Int,
        feedback: String?
    ): RepoResult<RideDto> =
        safeCall {
            api.payAndRateRide(
                PayAndRateRequest(
                    rideId = rideId,
                    paymentMethod = paymentMethod,
                    rating = rating,
                    feedback = feedback
                ),
                role = "user"
            )
        }

    private suspend fun <T> safeCall(block: suspend () -> Response<T>): RepoResult<T> {
        return try {
            val response = block()
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    RepoResult.Success(body)
                } else {
                    @Suppress("UNCHECKED_CAST")
                    RepoResult.Success(Unit as T)
                }
            } else {
                val rawError = response.errorBody()?.string()
                var parsedMsg: String? = null
                var parsedCode: String? = null
                if (!rawError.isNullOrBlank()) {
                    try {
                        val json = JSONObject(rawError)
                        parsedMsg = json.optString("message").ifBlank { json.optString("error") }
                        if (parsedMsg.isNullOrBlank() && json.has("errors")) {
                            val arr = json.optJSONArray("errors")
                            if (arr != null && arr.length() > 0) {
                                parsedMsg = arr.optJSONObject(0)?.optString("msg")
                            }
                        }
                        parsedCode = json.optString("code").ifBlank { null }
                    } catch (_: Exception) {
                    }
                }
                RepoResult.Error(
                    message = parsedMsg?.ifBlank { null } ?: "Request failed (HTTP ${response.code()})",
                    code = parsedCode,
                    httpStatus = response.code()
                )
            }
        } catch (e: Exception) {
            RepoResult.Error(
                message = e.localizedMessage ?: "Network connection error. Please check your connection."
            )
        }
    }
}

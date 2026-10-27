package com.cabsafe.chennai.data.model

import com.google.gson.annotations.SerializedName

data class GeoCoordinate(
    val lat: Double,
    val lon: Double
)

data class FullNameDto(
    val firstname: String,
    val lastname: String? = ""
) {
    val displayName: String
        get() = listOfNotNull(firstname, lastname).joinToString(" ").trim()
}

data class UserDto(
    @SerializedName("_id") val id: String,
    val fullname: FullNameDto,
    val email: String,
    val phone: String? = null,
    val rating: Double = 5.0
)

data class VehicleDto(
    val color: String,
    val plate: String,
    val capacity: Int,
    val vehicleType: String, // "car" | "cng" | "motorcycle"
    val model: String? = null
)

data class CaptainMetricsDto(
    val rating: Double = 4.9,
    val completedRides: Int = 0,
    val assignedRides: Int = 0,
    val totalEarnings: Double = 0.0,
    val distanceKm: Double = 0.0,
    val hoursOnline: Double = 0.0
)

data class GeoJsonPointDto(
    val type: String = "Point",
    val coordinates: List<Double> = listOf(80.2707, 13.0827), // [lon, lat]
    val updatedAt: String? = null
) {
    fun toGeoCoordinate(): GeoCoordinate? {
        if (coordinates.size < 2) return null
        return GeoCoordinate(lat = coordinates[1], lon = coordinates[0])
    }
}

data class CaptainDto(
    @SerializedName("_id") val id: String,
    val fullname: FullNameDto,
    val email: String,
    val phone: String? = null,
    val status: String = "active",
    val vehicle: VehicleDto,
    val location: GeoJsonPointDto? = null,
    val metrics: CaptainMetricsDto = CaptainMetricsDto()
)

data class AuthUserResponse(
    val user: UserDto,
    val token: String
)

data class AuthCaptainResponse(
    val captain: CaptainDto,
    val token: String
)

data class LandmarkSuggestionDto(
    val name: String,
    val city: String,
    val country: String,
    val lat: Double,
    val lon: Double,
    val display_name: String,
    val placeId: String,
    val category: String,
    val inServiceArea: Boolean? = true
)

data class ReverseGeocodeResponse(
    val coords: GeoCoordinate,
    val display_name: String,
    val locality: String,
    val inServiceArea: Boolean,
    val source: String
)

data class DistanceDurationItemDto(
    val text: String,
    val value: Int
)

data class FareBreakdownDto(
    val baseFare: Double,
    val distanceFare: Double,
    val timeFare: Double,
    val total: Double
)

data class MatchExplanationDto(
    val captainId: String,
    val captainName: String,
    val vehicleType: String,
    val plate: String,
    val distanceKm: Double,
    val etaMinutes: Int,
    val finalScore: Double,
    val explanation: String
)

data class FareEstimateResponseDto(
    val car: Double,
    val cng: Double,
    val motorcycle: Double,
    val fares: Map<String, Double>,
    val breakdowns: Map<String, FareBreakdownDto>,
    val distance: DistanceDurationItemDto,
    val duration: DistanceDurationItemDto,
    val originCoords: GeoCoordinate,
    val destinationCoords: GeoCoordinate,
    val routeGeometry: List<List<Double>> = emptyList(),
    val dataSource: String = "live_osm",
    val candidateRankings: List<MatchExplanationDto> = emptyList(),
    val serviceAreaStatus: String? = null
)

data class RideDto(
    @SerializedName("_id") val id: String,
    val user: UserDto? = null,
    val captain: CaptainDto? = null,
    val pickup: String,
    val destination: String,
    val pickupCoords: GeoCoordinate,
    val destinationCoords: GeoCoordinate,
    val routeGeometry: List<List<Double>>? = null,
    val vehicleType: String,
    val fare: Double,
    val fareBreakdown: FareBreakdownDto? = null,
    val status: String, // "pending" | "accepted" | "ongoing" | "completed" | "cancelled"
    val duration: Int = 0,
    val distance: Int = 0,
    val otp: String? = null, // Present for passenger, stripped for captain
    val paymentStatus: String = "pending",
    val paymentMethod: String = "Card",
    val userRating: Int? = null,
    val matchExplanation: MatchExplanationDto? = null
)

data class ActiveRideResponseDto(
    val ride: RideDto? = null,
    val pendingOffers: List<RideDto> = emptyList()
)

data class CaptainLocationEventDto(
    val rideId: String,
    val captainId: String,
    val location: GeoCoordinate,
    val updatedAt: String? = null
)

// Request DTOs
data class LoginRequest(val email: String, val password: String)

data class RegisterUserRequest(
    val fullname: FullNameDto,
    val email: String,
    val phone: String?,
    val password: String
)

data class RegisterCaptainRequest(
    val fullname: FullNameDto,
    val email: String,
    val phone: String?,
    val password: String,
    val vehicle: VehicleDto
)

data class CreateRideRequest(
    val pickup: String,
    val destination: String,
    val vehicleType: String,
    val pickupCoords: GeoCoordinate? = null,
    val destinationCoords: GeoCoordinate? = null
)

data class ConfirmRideRequest(val rideId: String)

data class StartRideOtpRequest(val rideId: String, val otp: String)

data class EndRideRequest(val rideId: String)

data class CancelRideRequest(val rideId: String, val reason: String? = null)

data class UpdateCaptainStatusRequest(val status: String)

data class UpdateCaptainLocationRequest(val lat: Double, val lon: Double)

data class PayAndRateRequest(
    val rideId: String,
    val paymentMethod: String,
    val rating: Int,
    val feedback: String? = null
)

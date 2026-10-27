package com.cabsafe.chennai.config

import com.cabsafe.chennai.data.model.GeoCoordinate

/**
 * Single configurable source of truth for the Chennai operating area in the native Android app.
 * Matches backend `/src/config/chennaiServiceArea.ts` exactly.
 *
 * IMPORTANT: The polygon defined below is a PROVISIONAL DEVELOPMENT CONFIGURATION
 * (`isProductionApproved = false`) and must be reviewed by operations before commercial release.
 */
object ChennaiServiceArea {

    const val CITY_NAME = "Chennai"
    const val STATE_NAME = "Tamil Nadu"
    const val COUNTRY_NAME = "India"

    const val DEFAULT_LAT = 13.0827
    const val DEFAULT_LON = 80.2707
    const val DEFAULT_ZOOM = 12.0
    const val MIN_ZOOM = 10.0
    const val MAX_ZOOM = 19.0

    val DEFAULT_CENTER = GeoCoordinate(lat = DEFAULT_LAT, lon = DEFAULT_LON)

    const val BOUNDARY_STATUS = "PROVISIONAL_DEVELOPMENT_CONFIG"
    const val IS_PRODUCTION_APPROVED = false
    const val BOUNDARY_DISCLAIMER =
        "Provisional Chennai development boundary (approximate polygon). Not an official municipal boundary."

    // Bounding box pre-filter matching backend CHENNAI_BOUNDING_BOX
    private const val MIN_LAT = 12.865
    private const val MAX_LAT = 13.185
    private const val MIN_LON = 80.075
    private const val MAX_LON = 80.325

    /**
     * Provisional polygon vertices ordered [lat, lon] covering Chennai city,
     * T. Nagar, Anna Nagar, Adyar, Velachery, Guindy, Tambaram, and OMR through Sholinganallur.
     */
    val PROVISIONAL_POLYGON: List<GeoCoordinate> = listOf(
        GeoCoordinate(13.185, 80.325), // North-East Ennore / Tiruvottiyur coast
        GeoCoordinate(13.185, 80.165), // North-West Madhavaram / Red Hills edge
        GeoCoordinate(13.115, 80.110), // West Ambattur / Avadi edge
        GeoCoordinate(13.030, 80.095), // South-West Poonamallee / Porur corridor
        GeoCoordinate(12.900, 80.075), // Tambaram / Vandalur outer edge
        GeoCoordinate(12.865, 80.220), // South OMR / Sholinganallur / Navalur edge
        GeoCoordinate(12.885, 80.262), // ECR / Neelankarai / Injambakkam coast
        GeoCoordinate(13.005, 80.285), // Adyar / Besant Nagar / Marina coast
        GeoCoordinate(13.085, 80.305), // Chennai Port / Royapuram coast
        GeoCoordinate(13.185, 80.325)  // Close polygon
    )

    data class BoundaryValidationResult(
        val valid: Boolean,
        val pickupInside: Boolean,
        val destinationInside: Boolean,
        val code: String? = null,
        val message: String? = null,
        val boundaryStatus: String = BOUNDARY_STATUS
    )

    fun isValidCoordinate(coord: GeoCoordinate?): Boolean {
        if (coord == null) return false
        if (coord.lat.isNaN() || coord.lon.isNaN()) return false
        return coord.lat in -90.0..90.0 && coord.lon in -180.0..180.0
    }

    /**
     * Ray-casting point-in-polygon check against PROVISIONAL_POLYGON.
     */
    fun isPointInServiceArea(coord: GeoCoordinate?): Boolean {
        if (coord == null || !isValidCoordinate(coord)) return false

        if (coord.lat < MIN_LAT || coord.lat > MAX_LAT || coord.lon < MIN_LON || coord.lon > MAX_LON) {
            return false
        }

        val lat = coord.lat
        val lon = coord.lon
        var inside = false
        var j = PROVISIONAL_POLYGON.size - 1

        for (i in PROVISIONAL_POLYGON.indices) {
            val xi = PROVISIONAL_POLYGON[i].lat
            val yi = PROVISIONAL_POLYGON[i].lon
            val xj = PROVISIONAL_POLYGON[j].lat
            val yj = PROVISIONAL_POLYGON[j].lon

            val intersect = ((yi > lon) != (yj > lon)) &&
                (lat < (xj - xi) * (lon - yi) / ((yj - yi) + 1e-12) + xi)
            if (intersect) {
                inside = !inside
            }
            j = i
        }
        return inside
    }

    fun validateTripEndpoints(
        pickup: GeoCoordinate?,
        destination: GeoCoordinate?
    ): BoundaryValidationResult {
        if (!isValidCoordinate(pickup) || !isValidCoordinate(destination)) {
            return BoundaryValidationResult(
                valid = false,
                pickupInside = false,
                destinationInside = false,
                code = "INVALID_COORDINATES",
                message = "Invalid pickup or destination coordinates."
            )
        }

        val pickupIn = isPointInServiceArea(pickup)
        val destIn = isPointInServiceArea(destination)

        return when {
            !pickupIn && !destIn -> BoundaryValidationResult(
                valid = false,
                pickupInside = false,
                destinationInside = false,
                code = "BOTH_OUTSIDE_SERVICE_AREA",
                message = "Both pickup and destination are outside the supported Chennai operating boundary."
            )
            !pickupIn -> BoundaryValidationResult(
                valid = false,
                pickupInside = false,
                destinationInside = true,
                code = "PICKUP_OUTSIDE_SERVICE_AREA",
                message = "Pickup location is outside the supported Chennai service area."
            )
            !destIn -> BoundaryValidationResult(
                valid = false,
                pickupInside = true,
                destinationInside = false,
                code = "DESTINATION_OUTSIDE_SERVICE_AREA",
                message = "Destination is outside the supported Chennai service area."
            )
            else -> BoundaryValidationResult(
                valid = true,
                pickupInside = true,
                destinationInside = true
            )
        }
    }

    val SUPPORTED_CHENNAI_LOCALITIES: List<com.cabsafe.chennai.data.model.LandmarkSuggestionDto> = listOf(
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "T. Nagar (Panagal Park)",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 13.0418,
            lon = 80.2341,
            display_name = "T. Nagar, Panagal Park, Thyagaraya Nagar, Chennai, Tamil Nadu",
            placeId = "maa-t-nagar",
            category = "Commercial Hub",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Anna Nagar Tower Park",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 13.0850,
            lon = 80.2101,
            display_name = "Anna Nagar, 2nd Avenue, Tower Park, Chennai, Tamil Nadu",
            placeId = "maa-anna-nagar",
            category = "Residential & Dining",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Adyar Signal (LB Road)",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 13.0067,
            lon = 80.2572,
            display_name = "Adyar, Sardar Patel Rd & LB Road Junction, Chennai, Tamil Nadu",
            placeId = "maa-adyar",
            category = "South Chennai Hub",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Velachery (Phoenix Marketcity)",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9784,
            lon = 80.2180,
            display_name = "Velachery Main Road, Phoenix Marketcity, Velachery, Chennai, Tamil Nadu",
            placeId = "maa-velachery",
            category = "Transit & Mall",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Guindy Kathipara & Metro Hub",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 13.0067,
            lon = 80.2206,
            display_name = "Guindy Industrial Estate, GST Road, Guindy, Chennai, Tamil Nadu",
            placeId = "maa-guindy",
            category = "Metro & Transit",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Tambaram Railway & Bus Terminus",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9249,
            lon = 80.1000,
            display_name = "Tambaram Sanatorium / GST Road Terminus, Tambaram, Chennai, Tamil Nadu",
            placeId = "maa-tambaram",
            category = "Suburban Rail Hub",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Sholinganallur OMR Junction",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9010,
            lon = 80.2279,
            display_name = "Sholinganallur Junction, Rajiv Gandhi Salai (OMR), Chennai, Tamil Nadu",
            placeId = "maa-sholinganallur",
            category = "IT Corridor",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Thoraipakkam OMR PTC Stop",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9387,
            lon = 80.2323,
            display_name = "Thoraipakkam, Old Mahabalipuram Road (OMR), Chennai, Tamil Nadu",
            placeId = "maa-thoraipakkam",
            category = "IT Corridor",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "Perungudi World Trade Center",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9654,
            lon = 80.2461,
            display_name = "Perungudi, WTC Brigade, Rajiv Gandhi Salai (OMR), Chennai, Tamil Nadu",
            placeId = "maa-perungudi",
            category = "Tech Park",
            inServiceArea = true
        ),
        com.cabsafe.chennai.data.model.LandmarkSuggestionDto(
            name = "OMR (TIDEL Park / Taramani)",
            city = "Chennai, Tamil Nadu",
            country = "India",
            lat = 12.9896,
            lon = 80.2486,
            display_name = "OMR (Old Mahabalipuram Road), TIDEL Park, Taramani, Chennai, Tamil Nadu",
            placeId = "maa-omr-tidel",
            category = "IT Corridor",
            inServiceArea = true
        )
    )
}


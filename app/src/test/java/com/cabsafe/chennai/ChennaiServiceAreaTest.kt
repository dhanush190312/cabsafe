package com.cabsafe.chennai

import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.GeoCoordinate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChennaiServiceAreaTest {

    @Test
    fun defaultMapCenterIsConfiguredForChennai() {
        assertEquals(13.0827, ChennaiServiceArea.DEFAULT_CENTER.lat, 0.0001)
        assertEquals(80.2707, ChennaiServiceArea.DEFAULT_CENTER.lon, 0.0001)
        assertEquals(12.0, ChennaiServiceArea.DEFAULT_ZOOM, 0.01)
        assertFalse(ChennaiServiceArea.IS_PRODUCTION_APPROVED)
    }

    @Test
    fun supportedChennaiLocalitiesAreInsideBoundary() {
        val tNagar = GeoCoordinate(lat = 13.0418, lon = 80.2341)
        val annaNagar = GeoCoordinate(lat = 13.0850, lon = 80.2101)
        val adyar = GeoCoordinate(lat = 13.0067, lon = 80.2572)
        val velachery = GeoCoordinate(lat = 12.9784, lon = 80.2180)
        val tambaram = GeoCoordinate(lat = 12.9249, lon = 80.1000)
        val sholinganallur = GeoCoordinate(lat = 12.9010, lon = 80.2279)

        assertTrue(ChennaiServiceArea.isPointInServiceArea(tNagar))
        assertTrue(ChennaiServiceArea.isPointInServiceArea(annaNagar))
        assertTrue(ChennaiServiceArea.isPointInServiceArea(adyar))
        assertTrue(ChennaiServiceArea.isPointInServiceArea(velachery))
        assertTrue(ChennaiServiceArea.isPointInServiceArea(tambaram))
        assertTrue(ChennaiServiceArea.isPointInServiceArea(sholinganallur))
        assertTrue(ChennaiServiceArea.validateTripEndpoints(tNagar, adyar).valid)
    }

    @Test
    fun nonChennaiLocationsAreRejectedWithoutSilentRelocation() {
        val bengaluru = GeoCoordinate(lat = 12.9716, lon = 77.5946)
        val mumbai = GeoCoordinate(lat = 19.0760, lon = 72.8777)
        val kanchipuram = GeoCoordinate(lat = 12.8342, lon = 79.7036)
        val tNagar = GeoCoordinate(lat = 13.0418, lon = 80.2341)

        assertFalse(ChennaiServiceArea.isPointInServiceArea(bengaluru))
        assertFalse(ChennaiServiceArea.isPointInServiceArea(mumbai))
        assertFalse(ChennaiServiceArea.isPointInServiceArea(kanchipuram))

        assertEquals(
            "PICKUP_OUTSIDE_SERVICE_AREA",
            ChennaiServiceArea.validateTripEndpoints(bengaluru, tNagar).code
        )
        assertEquals(
            "DESTINATION_OUTSIDE_SERVICE_AREA",
            ChennaiServiceArea.validateTripEndpoints(tNagar, mumbai).code
        )
        assertEquals(
            "BOTH_OUTSIDE_SERVICE_AREA",
            ChennaiServiceArea.validateTripEndpoints(bengaluru, mumbai).code
        )
    }
}

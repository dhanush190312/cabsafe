package com.cabsafe.chennai.ui.components

import android.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.cabsafe.chennai.config.ChennaiServiceArea
import com.cabsafe.chennai.data.model.GeoCoordinate
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline

/**
 * Native Android Map View powered by osmdroid (`org.osmdroid:osmdroid-android`).
 *
 * Configured specifically for Chennai, Tamil Nadu, India:
 * - Default center: `ChennaiServiceArea.DEFAULT_CENTER` (13.0827, 80.2707)
 * - Default zoom: `ChennaiServiceArea.DEFAULT_ZOOM` (12.0)
 * - Renders the provisional Chennai service-area polygon (`ChennaiServiceArea.PROVISIONAL_POLYGON`)
 * - Renders pickup marker, destination marker, multi-point OSRM route geometry, and live captain marker
 * - Supports direct map tap for selecting pickup or destination coordinates
 */
@Composable
fun ChennaiOsmMapView(
    pickupCoords: GeoCoordinate?,
    destinationCoords: GeoCoordinate?,
    captainCoords: GeoCoordinate?,
    routeGeometry: List<List<Double>>? = null,
    onMapTap: ((Double, Double) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            MapView(context).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setMultiTouchControls(true)
                minZoomLevel = ChennaiServiceArea.MIN_ZOOM
                maxZoomLevel = ChennaiServiceArea.MAX_ZOOM
                controller.setZoom(ChennaiServiceArea.DEFAULT_ZOOM)
                controller.setCenter(
                    GeoPoint(
                        ChennaiServiceArea.DEFAULT_CENTER.lat,
                        ChennaiServiceArea.DEFAULT_CENTER.lon
                    )
                )
            }
        },
        update = { mapView ->
            mapView.overlays.clear()

            // 1. Provisional Chennai Service Boundary Polygon
            val boundaryPolygon = Polygon(mapView).apply {
                points = ChennaiServiceArea.PROVISIONAL_POLYGON.map { pt ->
                    GeoPoint(pt.lat, pt.lon)
                }
                fillPaint.color = Color.argb(24, 16, 185, 129)
                outlinePaint.color = Color.rgb(5, 150, 105)
                outlinePaint.strokeWidth = 4f
                title = "Chennai Provisional Operating Area"
            }
            mapView.overlays.add(boundaryPolygon)

            // 2. Map Tap Receiver for Pickup / Destination Selection
            if (onMapTap != null) {
                val tapReceiver = object : MapEventsReceiver {
                    override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                        if (p != null) {
                            onMapTap(p.latitude, p.longitude)
                            return true
                        }
                        return false
                    }

                    override fun longPressHelper(p: GeoPoint?): Boolean = false
                }
                mapView.overlays.add(MapEventsOverlay(tapReceiver))
            }

            // 3. Route Polyline (multi-point OSRM geometry when available, or direct segment fallback)
            if (!routeGeometry.isNullOrEmpty() && routeGeometry.size >= 2) {
                val routeLine = Polyline(mapView).apply {
                    setPoints(
                        routeGeometry.mapNotNull { pair ->
                            if (pair.size >= 2) GeoPoint(pair[0], pair[1]) else null
                        }
                    )
                    outlinePaint.color = Color.rgb(15, 23, 42)
                    outlinePaint.strokeWidth = 8f
                }
                mapView.overlays.add(routeLine)
            } else if (pickupCoords != null && destinationCoords != null) {
                val routeLine = Polyline(mapView).apply {
                    setPoints(
                        listOf(
                            GeoPoint(pickupCoords.lat, pickupCoords.lon),
                            GeoPoint(destinationCoords.lat, destinationCoords.lon)
                        )
                    )
                    outlinePaint.color = Color.rgb(15, 23, 42)
                    outlinePaint.strokeWidth = 8f
                }
                mapView.overlays.add(routeLine)
            }

            // 4. Pickup Marker
            if (pickupCoords != null) {
                val pickupMarker = Marker(mapView).apply {
                    position = GeoPoint(pickupCoords.lat, pickupCoords.lon)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    title = "Pickup (${String.format("%.4f", pickupCoords.lat)}, ${String.format("%.4f", pickupCoords.lon)})"
                }
                mapView.overlays.add(pickupMarker)
            }

            // 5. Destination Marker
            if (destinationCoords != null) {
                val destMarker = Marker(mapView).apply {
                    position = GeoPoint(destinationCoords.lat, destinationCoords.lon)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    title = "Destination (${String.format("%.4f", destinationCoords.lat)}, ${String.format("%.4f", destinationCoords.lon)})"
                }
                mapView.overlays.add(destMarker)
            }

            // 6. Live Captain Marker (shown only when captainCoords is non-null)
            if (captainCoords != null) {
                val captainMarker = Marker(mapView).apply {
                    position = GeoPoint(captainCoords.lat, captainCoords.lon)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = "Assigned Captain (Live GPS)"
                }
                mapView.overlays.add(captainMarker)
            }

            mapView.invalidate()
        }
    )
}

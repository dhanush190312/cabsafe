import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { Coordinates, CaptainRecord, VehicleType } from '../types';
import {
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_MAJOR_CORRIDORS,
  TAMIL_NADU_MAP_CONFIG,
  TAMIL_NADU_BORDER_POLYGON,
  TAMIL_NADU_MAJOR_CITIES,
  TAMIL_NADU_CORRIDORS,
  MajorCityHub,
  MajorCorridor,
  isPointInChennaiServiceArea,
  isPointInTamilNaduServiceArea,
  getTamilNaduRegionLabel,
} from '../config/chennaiServiceArea';

export interface LiveMapProps {
  pickupCoords?: Coordinates | null;
  destinationCoords?: Coordinates | null;
  captainCoords?: Coordinates | null;
  captainLabel?: string;
  captainHeading?: number;
  vehicleType?: VehicleType;
  routeGeometry?: [number, number][] | null;
  routeDistanceText?: string | null;
  routeDurationText?: string | null;
  fleetCaptains?: Array<Omit<CaptainRecord, 'password'>>;
  showFleetMarkers?: boolean;
  onMapClick?: (coords: Coordinates) => void;
  onSelectLandmark?: (coords: Coordinates, name: string) => void;
  interactiveHint?: string;
  initialRegion?: 'tamilnadu' | 'chennai';
}

const CHENNAI_CENTER: [number, number] = [
  CHENNAI_MAP_CONFIG.defaultCenter.lat,
  CHENNAI_MAP_CONFIG.defaultCenter.lon,
];

const TAMIL_NADU_CENTER: [number, number] = [
  TAMIL_NADU_MAP_CONFIG.defaultCenter.lat,
  TAMIL_NADU_MAP_CONFIG.defaultCenter.lon,
];

/**
 * Curated Chennai quick-navigation hotspots with verified coordinates
 */
const CHENNAI_QUICK_LANDMARKS = [
  { name: 'T. Nagar', lat: 13.0418, lon: 80.2341, icon: '🛍️' },
  { name: 'MAA Airport', lat: 12.9902, lon: 80.1693, icon: '✈️' },
  { name: 'Chennai Central', lat: 13.0827, lon: 80.2755, icon: '🚉' },
  { name: 'OMR IT Hub', lat: 12.901, lon: 80.2279, icon: '💻' },
  { name: 'Marina Beach', lat: 13.05, lon: 80.2825, icon: '🏖️' },
  { name: 'Velachery', lat: 12.9784, lon: 80.218, icon: '🏬' },
  { name: 'Anna Nagar', lat: 13.085, lon: 80.2101, icon: '🏛️' },
];

/**
 * Calculates bearing angle (0-360 degrees) between two points
 */
function calculateBearing(start: Coordinates, end: Coordinates): number {
  const startLat = (start.lat * Math.PI) / 180;
  const startLon = (start.lon * Math.PI) / 180;
  const endLat = (end.lat * Math.PI) / 180;
  const endLon = (end.lon * Math.PI) / 180;

  const dLon = endLon - startLon;
  const y = Math.sin(dLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);

  const radians = Math.atan2(y, x);
  const degrees = (radians * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * Creates standard monospace tag pin - Royal Red & Executive White
 */
function createPinIcon(
  bgColor: string,
  labelText: string,
  ringColor: string = '#DC2626',
  textColor: string = '#FFFFFF'
) {
  return L.divIcon({
    className: 'custom-cabsafe-pin',
    html: `
      <div style="
        display:inline-flex;
        flex-direction:column;
        align-items:center;
        gap:3px;
        transform:translate(-50%, -50%);
      ">
        <div style="
          display:inline-flex;
          align-items:center;
          gap:5px;
          background:${bgColor};
          color:${textColor};
          padding:3px 8px;
          border-radius:9999px;
          font-family:'Plus Jakarta Sans', -apple-system, sans-serif;
          font-size:9px;
          line-height:1.2;
          font-weight:700;
          border:1.5px solid ${ringColor};
          box-shadow:0 4px 14px rgba(0,0,0,0.25);
          white-space:nowrap;
          width:max-content;
        ">
          <span>${labelText}</span>
        </div>
        <span style="
          width:13px;
          height:13px;
          border-radius:9999px;
          background:#FFFFFF;
          border:3.5px solid ${ringColor};
          box-shadow:0 2px 8px rgba(220,38,38,0.5);
          display:inline-block;
        "></span>
      </div>
    `,
  });
}

/**
 * Creates a radar sonar pulsating pickup pin for active pickup beacons
 */
function createPickupPulseIcon(labelText: string, inside: boolean = true) {
  const ringColor = inside ? '#DC2626' : '#EF4444';
  const bgColor = inside ? '#DC2626' : '#991B1B';
  return L.divIcon({
    className: 'custom-cabsafe-pin',
    html: `
      <div style="
        display:inline-flex;
        flex-direction:column;
        align-items:center;
        gap:3px;
        transform:translate(-50%, -50%);
      ">
        <div style="
          display:inline-flex;
          align-items:center;
          gap:5px;
          background:${bgColor};
          color:#FFFFFF;
          padding:3px 8px;
          border-radius:9999px;
          font-family:'Plus Jakarta Sans', -apple-system, sans-serif;
          font-size:9px;
          font-weight:700;
          border:1.5px solid #FFFFFF;
          box-shadow:0 4px 14px rgba(220,38,38,0.4);
          white-space:nowrap;
        ">
          <span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:#FFFFFF;box-shadow:0 0 6px #FFFFFF"></span>
          <span>${labelText}</span>
        </div>
        <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
          <span style="
            position:absolute;
            inset:-4px;
            border-radius:9999px;
            border:2px solid ${ringColor};
            animation:cabsafePulse 2s cubic-bezier(0,0,0.2,1) infinite;
          "></span>
          <span style="
            width:14px;
            height:14px;
            border-radius:9999px;
            background:#FFFFFF;
            border:3.5px solid ${ringColor};
            box-shadow:0 0 10px rgba(220,38,38,0.6);
            display:inline-block;
            position:relative;
            z-index:2;
          "></span>
        </div>
      </div>
    `,
  });
}

/**
 * Creates an animated top-down car vector with heading rotation and royal accents
 */
function createVehicleIcon(
  headingDeg: number,
  vehicleType: VehicleType = 'car',
  color: string = '#DC2626',
  label?: string
) {
  const isBike = vehicleType === 'motorcycle';
  const isAuto = vehicleType === 'cng';

  return L.divIcon({
    className: 'custom-cabsafe-car-pin',
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        transform:translate(-50%, -50%);
        pointer-events:auto;
      ">
        ${
          label
            ? `
        <div style="
          background:#FFFFFF;
          color:#DC2626;
          border:1.5px solid #DC2626;
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:9px;
          font-weight:700;
          padding:2px 7px;
          border-radius:9999px;
          margin-bottom:4px;
          box-shadow:0 3px 10px rgba(0,0,0,0.18);
          white-space:nowrap;
        ">
          ${label}
        </div>`
            : ''
        }
        <div style="
          width:38px;
          height:38px;
          transform:rotate(${headingDeg}deg);
          transition:transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          filter:drop-shadow(0 2px 8px rgba(220,38,38,0.45));
          position:relative;
        ">
          <svg viewBox="0 0 64 64" fill="none" style="width:100%;height:100%;">
            <!-- Headlight beams -->
            <path d="M22 6 L12 0 M42 6 L52 0" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
            <polygon points="20,12 8,-2 18,-4" fill="${color}" opacity="0.22"/>
            <polygon points="44,12 56,-2 46,-4" fill="${color}" opacity="0.22"/>

            <!-- Vehicle Body -->
            ${
              isBike
                ? `
              <rect x="26" y="8" width="12" height="48" rx="6" fill="#1E293B" stroke="${color}" stroke-width="2.5"/>
              <circle cx="32" cy="18" r="4" fill="${color}"/>
              <circle cx="32" cy="46" r="4" fill="${color}"/>
              <rect x="22" y="22" width="20" height="3" rx="1.5" fill="#CBD5E1"/>
            `
                : isAuto
                  ? `
              <polygon points="32,6 46,24 46,54 18,54 18,24" fill="#1E293B" stroke="${color}" stroke-width="2.5"/>
              <rect x="22" y="26" width="20" height="18" rx="3" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
              <path d="M22 28 L42 28 L38 20 L26 20 Z" fill="${color}" opacity="0.7"/>
              <circle cx="32" cy="10" r="3" fill="${color}"/>
            `
                  : `
              <rect x="18" y="10" width="28" height="44" rx="8" fill="#FFFFFF" stroke="${color}" stroke-width="2.5"/>
              <rect x="22" y="20" width="20" height="22" rx="4" fill="#0F172A" stroke="#CBD5E1" stroke-width="1.5"/>
              <path d="M22 22 L42 22 L39 16 L25 16 Z" fill="${color}" opacity="0.8"/>
              <path d="M24 40 L40 40 L38 43 L26 43 Z" fill="#64748B" opacity="0.8"/>
              <rect x="20" y="52" width="6" height="2" rx="1" fill="#DC2626"/>
              <rect x="38" y="52" width="6" height="2" rx="1" fill="#DC2626"/>
            `
            }
          </svg>
        </div>
      </div>
    `,
  });
}

/**
 * Creates custom pill pin for Tamil Nadu Major City Hubs
 */
function createCityHubIcon(city: MajorCityHub) {
  const isMetro = Boolean(city.isMetro);
  return L.divIcon({
    className: 'custom-cabsafe-city-pin',
    html: `
      <div style="
        display:inline-flex;
        flex-direction:column;
        align-items:center;
        transform:translate(-50%, -50%);
        cursor:pointer;
        transition:transform 0.15s ease;
      ">
        <div style="
          display:inline-flex;
          align-items:center;
          gap:4px;
          background:${isMetro ? '#DC2626' : '#FFFFFF'};
          color:${isMetro ? '#FFFFFF' : '#0F172A'};
          padding:2px 7px;
          border-radius:9999px;
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:9px;
          font-weight:700;
          border:1.5px solid ${isMetro ? '#FFFFFF' : '#E2E8F0'};
          box-shadow:0 3px 10px rgba(0,0,0,0.18);
          white-space:nowrap;
        ">
          <span>${city.icon}</span>
          <span>${city.name}</span>
          ${
            isMetro
              ? '<span style="background:#FFFFFF;color:#DC2626;padding:0.5px 3.5px;border-radius:3px;font-size:7px;font-weight:800">METRO</span>'
              : ''
          }
        </div>
        <div style="
          width:6px;
          height:6px;
          border-radius:9999px;
          background:${isMetro ? '#DC2626' : '#475569'};
          border:1.5px solid #FFFFFF;
          margin-top:2px;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
  });
}

/**
 * Clean Executive Silver Canvas vector grid base layer
 */
function createUrbanCanvasGridLayer(): L.GridLayer {
  const UrbanGrid = L.GridLayer.extend({
    createTile: function (coords: L.Coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d');
      if (!ctx) return tile;

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, size.x, size.y);

      ctx.fillStyle = '#F1F5F9';
      const step = 64;
      for (let x = 8; x < size.x; x += step) {
        for (let y = 8; y < size.y; y += step) {
          ctx.fillRect(x, y, step - 12, step - 12);
        }
      }

      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= size.x; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size.x, i);
        ctx.stroke();
      }

      return tile;
    },
  });
  return new (UrbanGrid as unknown as { new (opts?: L.GridLayerOptions): L.GridLayer })({
    tileSize: 256,
  });
}

export const LiveMap: React.FC<LiveMapProps> = ({
  pickupCoords,
  destinationCoords,
  captainCoords,
  captainLabel,
  captainHeading,
  vehicleType = 'car',
  routeGeometry,
  routeDistanceText,
  routeDurationText,
  fleetCaptains = [],
  showFleetMarkers = false,
  onMapClick,
  onSelectLandmark,
  interactiveHint,
  initialRegion = 'tamilnadu',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const corridorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const cityHubsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const prevCaptainCoordsRef = useRef<Coordinates | null>(null);

  const [regionMode, setRegionMode] = useState<'tamilnadu' | 'chennai'>(initialRegion);
  const [showCorridors, setShowCorridors] = useState<boolean>(true);
  const [showCityHubs, setShowCityHubs] = useState<boolean>(true);
  const [mapTileStyle, setMapTileStyle] = useState<'standard' | 'satellite'>('standard');
  const [currentZoom, setCurrentZoom] = useState<number>(
    initialRegion === 'tamilnadu' ? TAMIL_NADU_MAP_CONFIG.defaultZoom : CHENNAI_MAP_CONFIG.defaultZoom
  );
  const [centerDistrict, setCenterDistrict] = useState<string>('Tamil Nadu (Statewide)');

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const onSelectLandmarkRef = useRef(onSelectLandmark);
  onSelectLandmarkRef.current = onSelectLandmark;

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter =
      initialRegion === 'tamilnadu' ? TAMIL_NADU_CENTER : CHENNAI_CENTER;
    const initialZoom =
      initialRegion === 'tamilnadu'
        ? TAMIL_NADU_MAP_CONFIG.defaultZoom
        : CHENNAI_MAP_CONFIG.defaultZoom;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 6,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
    });

    createUrbanCanvasGridLayer().addTo(map);

    const tile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.9,
      className: 'cabsafe-dark-osm-tiles',
    }).addTo(map);
    tileLayerRef.current = tile;

    // 1. Outer Tamil Nadu State Boundary Polygon
    L.polygon(TAMIL_NADU_BORDER_POLYGON as [number, number][], {
      color: '#4F46E5', // Royal Indigo Stroke
      weight: 2,
      opacity: 0.75,
      dashArray: '6, 6',
      fillColor: '#4F46E5',
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(map);

    // 2. Inner Chennai Metropolitan Area Boundary Polygon
    L.polygon(CHENNAI_PROVISIONAL_POLYGON as [number, number][], {
      color: '#DC2626', // Royal Crimson Stroke
      weight: 2,
      opacity: 0.85,
      dashArray: '4, 4',
      fillColor: '#DC2626',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    const corridorGroup = L.layerGroup().addTo(map);
    const cityHubsGroup = L.layerGroup().addTo(map);

    layerGroupRef.current = group;
    corridorLayerGroupRef.current = corridorGroup;
    cityHubsLayerGroupRef.current = cityHubsGroup;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({
          lat: Number(e.latlng.lat.toFixed(5)),
          lon: Number(e.latlng.lng.toFixed(5)),
        });
      }
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      const label = getTamilNaduRegionLabel({
        lat: Number(center.lat.toFixed(4)),
        lon: Number(center.lng.toFixed(4)),
      });
      setCenterDistrict(label);
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      corridorLayerGroupRef.current = null;
      cityHubsLayerGroupRef.current = null;
    };
  }, [initialRegion]);

  // Update Tile Style (Standard OSM vs Satellite Imagery)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    if (mapTileStyle === 'satellite') {
      const satTile = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          opacity: 0.95,
        }
      ).addTo(map);
      tileLayerRef.current = satTile;
    } else {
      const osmTile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.9,
        className: 'cabsafe-dark-osm-tiles',
      }).addTo(map);
      tileLayerRef.current = osmTile;
    }
  }, [mapTileStyle]);

  // Render Tamil Nadu City Hub Markers
  useEffect(() => {
    const cityHubsGroup = cityHubsLayerGroupRef.current;
    const map = mapRef.current;
    if (!cityHubsGroup || !map) return;

    cityHubsGroup.clearLayers();

    if (showCityHubs) {
      for (const city of TAMIL_NADU_MAJOR_CITIES) {
        const marker = L.marker([city.lat, city.lon], {
          icon: createCityHubIcon(city),
          zIndexOffset: city.isMetro ? 700 : 600,
        });

        marker.on('click', () => {
          map.flyTo([city.lat, city.lon], city.zoomLevel, { duration: 1 });
          if (onSelectLandmarkRef.current) {
            onSelectLandmarkRef.current({ lat: city.lat, lon: city.lon }, city.name);
          }
        });

        marker.bindTooltip(
          `<strong>${city.name} (${city.district} District)</strong><br/><span style="color:#64748B">${city.tagline}</span><br/><span style="color:#DC2626;font-weight:600">Click to focus & route</span>`,
          {
            className: 'cabsafe-corridor-tooltip',
            sticky: true,
          }
        );

        marker.addTo(cityHubsGroup);
      }
    }
  }, [showCityHubs]);

  // Render Arterial & State Traffic Corridors when enabled
  useEffect(() => {
    const corridorGroup = corridorLayerGroupRef.current;
    if (!corridorGroup) return;

    corridorGroup.clearLayers();

    if (showCorridors) {
      const allCorridors: ReadonlyArray<MajorCorridor> = [
        ...TAMIL_NADU_CORRIDORS,
        ...CHENNAI_MAJOR_CORRIDORS,
      ];

      for (const corridor of allCorridors) {
        // Outer glow
        L.polyline(corridor.points, {
          color: corridor.color,
          weight: 6,
          opacity: 0.35,
          lineCap: 'round',
        }).addTo(corridorGroup);

        // Core polyline
        const line = L.polyline(corridor.points, {
          color: corridor.color,
          weight: 3,
          opacity: 0.95,
          lineCap: 'round',
        }).addTo(corridorGroup);

        line.bindTooltip(
          `<strong>${corridor.name}</strong><br/>Corridor: <span style="color:#FFFFFF">${corridor.shortName}</span><br/>Live Traffic: <span style="color:#E2FF44;font-weight:bold">${corridor.trafficStatus.toUpperCase()}</span>`,
          {
            className: 'cabsafe-corridor-tooltip',
            sticky: true,
          }
        );
      }
    }
  }, [showCorridors]);

  // Update markers & route polyline
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    // 1. Fleet Captains
    if (showFleetMarkers) {
      for (const cap of fleetCaptains) {
        if (cap.status !== 'active' || !cap.location?.coordinates) continue;
        const [lon, lat] = cap.location.coordinates;
        const vBadge =
          cap.vehicle.vehicleType === 'car'
            ? 'CAR'
            : cap.vehicle.vehicleType === 'cng'
              ? 'AUTO'
              : 'MOTO';
        const marker = L.marker([lat, lon], {
          icon: createPinIcon(
            '#FFFFFF',
            `${vBadge} · ${cap.fullname.firstname}`,
            '#DC2626',
            '#0F172A'
          ),
        });
        marker.bindPopup(
          `<strong>${cap.fullname.firstname} ${cap.fullname.lastname || ''}</strong><br/>${cap.vehicle.color} ${cap.vehicle.model || cap.vehicle.vehicleType} (${cap.vehicle.plate})`
        );
        marker.addTo(group);
      }
    }

    // 2. Royal Crimson (#DC2626) Route Polyline with White Underlay
    if (routeGeometry && routeGeometry.length > 1) {
      L.polyline(routeGeometry, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.95,
      }).addTo(group);

      const polyline = L.polyline(routeGeometry, {
        color: '#DC2626',
        weight: 4.5,
        opacity: 1,
      });
      polyline.addTo(group);
      for (const pt of routeGeometry) {
        boundsPoints.push(pt);
      }
    }

    // 3. Pickup Marker with pulsating radar sonar ring
    if (pickupCoords) {
      const pt: [number, number] = [pickupCoords.lat, pickupCoords.lon];
      const inChennai = isPointInChennaiServiceArea(pickupCoords);
      const inTN = isPointInTamilNaduServiceArea(pickupCoords);
      const label = inChennai ? 'PICKUP' : inTN ? 'PICKUP · TN' : 'PICKUP (OUTSIDE)';
      boundsPoints.push(pt);
      L.marker(pt, {
        icon: createPickupPulseIcon(label, inChennai || inTN),
        zIndexOffset: 850,
      }).addTo(group);
    }

    // 4. Dropoff Marker
    if (destinationCoords) {
      const pt: [number, number] = [destinationCoords.lat, destinationCoords.lon];
      const inChennai = isPointInChennaiServiceArea(destinationCoords);
      const inTN = isPointInTamilNaduServiceArea(destinationCoords);
      const label = inChennai ? 'DROPOFF' : inTN ? 'DROPOFF · TN' : 'DROPOFF (OUTSIDE)';
      boundsPoints.push(pt);
      L.marker(pt, {
        icon: createPinIcon(
          inChennai || inTN ? '#DC2626' : '#7F1D1D',
          label,
          inChennai || inTN ? '#991B1B' : '#DC2626',
          '#FFFFFF'
        ),
        zIndexOffset: 800,
      }).addTo(group);
    }

    // 5. Active Captain with Animated Top-Down Car & Bearing Rotation
    if (captainCoords) {
      const pt: [number, number] = [captainCoords.lat, captainCoords.lon];
      boundsPoints.push(pt);

      let heading = captainHeading ?? 0;
      if (captainHeading === undefined) {
        if (prevCaptainCoordsRef.current) {
          heading = calculateBearing(prevCaptainCoordsRef.current, captainCoords);
        } else if (destinationCoords) {
          heading = calculateBearing(captainCoords, destinationCoords);
        }
      }
      prevCaptainCoordsRef.current = captainCoords;

      L.marker(pt, {
        icon: createVehicleIcon(
          heading,
          vehicleType,
          '#DC2626',
          captainLabel || 'ROYAL CAPTAIN'
        ),
        zIndexOffset: 1000,
      }).addTo(group);
    }

    map.invalidateSize();
    if (boundsPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        paddingTopLeft: [48, 64],
        paddingBottomRight: [48, 48],
        maxZoom: 15,
      });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 13);
    }
  }, [
    pickupCoords,
    destinationCoords,
    captainCoords,
    captainLabel,
    captainHeading,
    vehicleType,
    routeGeometry,
    fleetCaptains,
    showFleetMarkers,
  ]);

  const handleSwitchToTamilNadu = () => {
    setRegionMode('tamilnadu');
    if (mapRef.current) {
      mapRef.current.flyTo(TAMIL_NADU_CENTER, TAMIL_NADU_MAP_CONFIG.defaultZoom, {
        duration: 1.2,
      });
    }
  };

  const handleSwitchToChennai = () => {
    setRegionMode('chennai');
    if (mapRef.current) {
      mapRef.current.flyTo(CHENNAI_CENTER, CHENNAI_MAP_CONFIG.defaultZoom, {
        duration: 1.2,
      });
    }
  };

  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  const handleLocateMe = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(5));
          const lon = Number(pos.coords.longitude.toFixed(5));
          if (mapRef.current) {
            mapRef.current.setView([lat, lon], 14);
          }
          if (onMapClickRef.current) {
            onMapClickRef.current({ lat, lon });
          }
        },
        (err) => console.warn('Geolocation unavailable:', err.message),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  // Quick hotspots list based on active region mode
  const currentHotspots = useMemo(() => {
    if (regionMode === 'tamilnadu') {
      return TAMIL_NADU_MAJOR_CITIES.map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        icon: c.icon,
        zoom: c.zoomLevel,
      }));
    }
    return CHENNAI_QUICK_LANDMARKS.map((c) => ({
      ...c,
      zoom: 14,
    }));
  }, [regionMode]);

  return (
    <div
      className="relative w-full h-full bg-[#11141C] select-none overflow-hidden"
      data-testid="live-map-container"
      data-default-center={`${CHENNAI_MAP_CONFIG.defaultCenter.lat},${CHENNAI_MAP_CONFIG.defaultCenter.lon}`}
      data-tn-center={`${TAMIL_NADU_MAP_CONFIG.defaultCenter.lat},${TAMIL_NADU_MAP_CONFIG.defaultCenter.lon}`}
      data-region-mode={regionMode}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* Top Floating Region Mode Switcher & Quick Navigation Bar */}
      {!routeGeometry && (
        <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-col gap-1.5 pointer-events-none">
          {/* Region Tabs Header */}
          <div className="flex items-center justify-between gap-2 pointer-events-auto">
            {/* Dual Region Mode Switcher Pills */}
            <div className="inline-flex bg-slate-900/90 backdrop-blur-md p-1 rounded-full border border-slate-700/80 shadow-xl">
              <button
                type="button"
                onClick={handleSwitchToTamilNadu}
                className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  regionMode === 'tamilnadu'
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Switch to All Tamil Nadu Statewide View (38 Districts)"
              >
                <span>🗺️</span>
                <span>Tamil Nadu (All 38 Districts)</span>
              </button>
              <button
                type="button"
                onClick={handleSwitchToChennai}
                className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  regionMode === 'chennai'
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Switch to Chennai Metropolitan Zone (Central & Corridors)"
              >
                <span>📍</span>
                <span>Chennai Metro</span>
              </button>
            </div>

            {/* Live Center HUD Indicator */}
            <div className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200 shadow-md text-[11px] font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{centerDistrict}</span>
              <span className="text-slate-400 font-mono text-[10px]">z{currentZoom}</span>
            </div>
          </div>

          {/* Quick-Pick Hotspots Carousel */}
          <div className="overflow-x-auto no-scrollbar flex items-center gap-1.5 py-1 pointer-events-auto">
            {currentHotspots.map((lm) => (
              <button
                key={lm.name}
                type="button"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo([lm.lat, lm.lon], lm.zoom || 12, { duration: 1 });
                  }
                  if (onSelectLandmark) {
                    onSelectLandmark({ lat: lm.lat, lon: lm.lon }, lm.name);
                  } else if (onMapClickRef.current) {
                    onMapClickRef.current({ lat: lm.lat, lon: lm.lon });
                  }
                }}
                className="bg-white/95 hover:bg-red-50/90 border border-slate-200 hover:border-red-400 px-2.5 py-1 rounded-full text-[10px] font-semibold text-slate-700 hover:text-red-700 whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
              >
                <span>{lm.icon}</span>
                <span>{lm.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Route Distance & Duration HUD Badge */}
      {(routeDistanceText || routeDurationText) && (
        <div className="absolute top-2.5 left-3 right-3 z-20 flex justify-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md border border-red-200 px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs font-bold text-slate-800 pointer-events-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span className="text-red-600 font-bold">{routeDistanceText}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-800">{routeDurationText}</span>
            <span className="text-slate-500 text-[10px] hidden sm:inline">
              via Tamil Nadu National Highways & Expressways
            </span>
          </div>
        </div>
      )}

      {/* Interactive Hint */}
      {interactiveHint && (
        <div className="pointer-events-none absolute top-20 left-12 right-12 z-20 flex justify-center">
          <div className="bg-white/95 backdrop-blur-md text-slate-700 border border-slate-200 text-[10px] font-semibold px-3.5 py-1 rounded-full truncate shadow-md">
            {interactiveHint}
          </div>
        </div>
      )}

      {/* Floating Bottom Control Suite */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
        {/* Left Side: Overlays and Quick Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto flex-wrap">
          {/* Quick Recenter Button */}
          <button
            type="button"
            onClick={regionMode === 'tamilnadu' ? handleSwitchToTamilNadu : handleSwitchToChennai}
            title={
              regionMode === 'tamilnadu'
                ? 'Recenter on Tamil Nadu State Center (11.12°N, 78.65°E)'
                : 'Recenter on Chennai Metro (13.08°N, 80.27°E)'
            }
            className="bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold text-red-600 cursor-pointer shadow-md transition-colors"
          >
            {regionMode === 'tamilnadu' ? 'TN State (11.12°N, 78.65°E)' : 'Chennai (13.08°N, 80.27°E)'}
          </button>

          {/* Toggle Corridors */}
          <button
            type="button"
            onClick={() => setShowCorridors((prev) => !prev)}
            title="Toggle Tamil Nadu State Highways & Expressways (NH44, NH45, NH48/544, ECR, OMR)"
            className={`border px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer shadow-md transition-colors ${
              showCorridors
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {showCorridors ? '✓ Corridors ON' : 'Corridors'}
          </button>

          {/* Toggle City Hubs */}
          <button
            type="button"
            onClick={() => setShowCityHubs((prev) => !prev)}
            title="Toggle Major City Hub Markers across Tamil Nadu"
            className={`border px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer shadow-md transition-colors ${
              showCityHubs
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {showCityHubs ? '✓ City Hubs' : 'City Hubs'}
          </button>

          {/* Satellite / Standard Vector Toggle */}
          <button
            type="button"
            onClick={() => setMapTileStyle((prev) => (prev === 'standard' ? 'satellite' : 'standard'))}
            title="Toggle Satellite Imagery vs Clean Vector Cartography"
            className={`border px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer shadow-md transition-colors ${
              mapTileStyle === 'satellite'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {mapTileStyle === 'satellite' ? '🛰️ Satellite ON' : '🗺️ Satellite'}
          </button>
        </div>

        {/* Right Side: Zoom & Locate Controls */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full p-0.5 shadow-md pointer-events-auto">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            -
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            title="Locate my current GPS position in Tamil Nadu"
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-red-600 text-[11px] font-bold cursor-pointer"
          >
            ◎
          </button>
        </div>
      </div>
    </div>
  );
};

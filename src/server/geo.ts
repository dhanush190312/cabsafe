import {
  Coordinates,
  LandmarkSuggestion,
  URBAN_LANDMARKS,
  OUTSIDE_CHENNAI_REFERENCE_LOCATIONS,
  CHENNAI_MAP_CONFIG,
  TAMIL_NADU_MAP_CONFIG,
  TAMIL_NADU_MAJOR_CITIES,
  calculateHaversineKm,
  interpolateRouteGeometry,
  isPointInChennaiServiceArea,
  isPointInTamilNaduServiceArea,
  validateChennaiTripEndpoints,
  validateTamilNaduTripEndpoints,
  isValidCoordinatePair,
  formatChennaiReverseGeocodeLabel,
  getTamilNaduRegionLabel,
} from './domain';

async function fetchWithTimeout(url: string, timeoutMs = 2600): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CabSafe-Chennai-Dispatch/2.1',
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts explicit "(lat, lon)" or "lat, lon" coordinates from a string if present.
 * Ensures passenger map-tap selections are never silently moved to another point.
 */
export function extractCoordinatesFromText(input: string): Coordinates | null {
  const match = input.match(/(-?\d{1,2}\.\d{3,8})\s*,\s*(-?\d{1,3}\.\d{3,8})/);
  if (!match) return null;
  const lat = Number(parseFloat(match[1]).toFixed(6));
  const lon = Number(parseFloat(match[2]).toFixed(6));
  if (isValidCoordinatePair({ lat, lon })) {
    return { lat, lon };
  }
  return null;
}

const KNOWN_OUTSIDE_CITIES: Record<string, Coordinates> = {
  mahabalipuram: { lat: 12.6208, lon: 80.1945 },
  mamallapuram: { lat: 12.6208, lon: 80.1945 },
  kanchipuram: { lat: 12.8342, lon: 79.7036 },
  sriperumbudur: { lat: 12.9675, lon: 79.9419 },
  chengalpattu: { lat: 12.6939, lon: 79.9757 },
  tiruvallur: { lat: 13.1439, lon: 79.9086 },
  arakkonam: { lat: 13.084, lon: 79.6705 },
  puducherry: { lat: 11.934, lon: 79.8306 },
  pondicherry: { lat: 11.934, lon: 79.8306 },
  vellore: { lat: 12.9165, lon: 79.1325 },
  bengaluru: { lat: 12.9716, lon: 77.5946 },
  bangalore: { lat: 12.9716, lon: 77.5946 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  delhi: { lat: 28.6139, lon: 77.209 },
  hyderabad: { lat: 17.385, lon: 78.4867 },
  coimbatore: { lat: 11.0168, lon: 76.9558 },
  madurai: { lat: 9.9252, lon: 78.1198 },
  trichy: { lat: 10.7905, lon: 78.7047 },
  tiruchirappalli: { lat: 10.7905, lon: 78.7047 },
  salem: { lat: 11.6643, lon: 78.1460 },
  tirunelveli: { lat: 8.7139, lon: 77.7567 },
  erode: { lat: 11.3410, lon: 77.7172 },
  tiruppur: { lat: 11.1085, lon: 77.3411 },
  thanjavur: { lat: 10.7870, lon: 79.1378 },
  dindigul: { lat: 10.3673, lon: 77.9803 },
  kanyakumari: { lat: 8.0883, lon: 77.5385 },
  ooty: { lat: 11.4102, lon: 76.6950 },
  udhagamandalam: { lat: 11.4102, lon: 76.6950 },
  kodaikanal: { lat: 10.2381, lon: 77.4892 },
  rameswaram: { lat: 9.2876, lon: 79.3129 },
  hosur: { lat: 12.7409, lon: 77.8253 },
  thoothukudi: { lat: 8.7642, lon: 78.1348 },
  tuticorin: { lat: 8.7642, lon: 78.1348 },
  cuddalore: { lat: 11.7480, lon: 79.7714 },
  nagercoil: { lat: 8.1833, lon: 77.4119 },
  'san francisco': { lat: 37.7879, lon: -122.4075 },
};

/**
 * Resolves an address string to coordinates without ever fabricating or silently moving
 * a passenger's chosen location.
 */
export async function resolveAddressCoordinate(
  address: string,
  explicitCoords?: Coordinates | null
): Promise<{
  coords: Coordinates;
  source: 'live_osm' | 'fallback_geodata';
  inServiceArea: boolean;
}> {
  if (explicitCoords && isValidCoordinatePair(explicitCoords)) {
    const coords = {
      lat: Number(explicitCoords.lat.toFixed(6)),
      lon: Number(explicitCoords.lon.toFixed(6)),
    };
    return {
      coords,
      source: 'fallback_geodata',
      inServiceArea: isPointInChennaiServiceArea(coords),
    };
  }

  const query = (address || '').trim();
  if (!query || query.length < 2) {
    const err = new Error('A valid pickup or destination address is required');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  // 1. If the string contains explicit coordinates (e.g., from tapping on the map), preserve them
  const embedded = extractCoordinatesFromText(query);
  if (embedded) {
    return {
      coords: embedded,
      source: 'fallback_geodata',
      inServiceArea: isPointInChennaiServiceArea(embedded),
    };
  }

  const lower = query.toLowerCase();

  // 2. Check known out-of-area cities & reference locations first so they are never snapped into Chennai
  const outsideRef = OUTSIDE_CHENNAI_REFERENCE_LOCATIONS.find(
    (l) =>
      l.display_name.toLowerCase().includes(lower) ||
      lower.includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(lower)
  );
  if (outsideRef) {
    return {
      coords: { lat: outsideRef.lat, lon: outsideRef.lon },
      source: 'fallback_geodata',
      inServiceArea: false,
    };
  }

  for (const [cityKey, cityCoords] of Object.entries(KNOWN_OUTSIDE_CITIES)) {
    if (lower.includes(cityKey)) {
      return {
        coords: cityCoords,
        source: 'fallback_geodata',
        inServiceArea: isPointInChennaiServiceArea(cityCoords),
      };
    }
  }

  // 3. Check curated Chennai localities (T. Nagar, Anna Nagar, Adyar, Velachery, Guindy, Tambaram, OMR, etc.)
  const normalizedQuery = lower.replace(/\./g, '').replace(/\s+/g, ' ');
  const landmark = URBAN_LANDMARKS.find((l) => {
    const normName = l.name.toLowerCase().replace(/\./g, '');
    const normDisplay = l.display_name.toLowerCase().replace(/\./g, '');
    return (
      normDisplay.includes(normalizedQuery) ||
      normalizedQuery.includes(normName) ||
      normName.includes(normalizedQuery)
    );
  });
  if (landmark) {
    const coords = { lat: landmark.lat, lon: landmark.lon };
    return {
      coords,
      source: 'fallback_geodata',
      inServiceArea: isPointInChennaiServiceArea(coords),
    };
  }

  // 4. Query live OpenStreetMap Nominatim biased toward Chennai, Tamil Nadu, India
  try {
    const [minLon, minLat, maxLon, maxLat] = CHENNAI_MAP_CONFIG.searchViewbox;
    const biasedQuery =
      lower.includes('chennai') || lower.includes('tamil nadu') || lower.includes('india')
        ? query
        : `${query}, Chennai, Tamil Nadu, India`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      biasedQuery
    )}&viewbox=${minLon},${maxLat},${maxLon},${minLat}&limit=1`;
    const res = await fetchWithTimeout(url, 2400);
    if (res.ok) {
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (Array.isArray(data) && data.length > 0) {
        const coords = {
          lat: Number(parseFloat(data[0].lat).toFixed(6)),
          lon: Number(parseFloat(data[0].lon).toFixed(6)),
        };
        return {
          coords,
          source: 'live_osm',
          inServiceArea: isPointInChennaiServiceArea(coords),
        };
      }
    }
  } catch {
    // Fall through to honest error reporting
  }

  // Requirement 2 & 4: Do not silently move an unrecognized location to a random coordinate
  const notFoundErr = new Error(
    `Could not resolve location "${query}" within Chennai. Please select a suggested Chennai locality or tap a point directly on the map.`
  );
  (notFoundErr as Error & { statusCode?: number; code?: string }).statusCode = 404;
  (notFoundErr as Error & { statusCode?: number; code?: string }).code = 'ADDRESS_NOT_FOUND';
  throw notFoundErr;
}

/**
 * Reverse geocodes a map-selected coordinate in or near Chennai.
 * Never alters the passenger's selected coordinates.
 */
export async function reverseGeocodeCoordinate(coords: Coordinates): Promise<{
  coords: Coordinates;
  display_name: string;
  locality: string;
  inServiceArea: boolean;
  source: 'live_osm' | 'fallback_geodata';
}> {
  if (!isValidCoordinatePair(coords)) {
    const err = new Error('Invalid coordinates provided for reverse geocoding');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const localFormatted = formatChennaiReverseGeocodeLabel(coords);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}&zoom=16`;
    const res = await fetchWithTimeout(url, 1800);
    if (res.ok) {
      const data = (await res.json()) as {
        display_name?: string;
        address?: {
          suburb?: string;
          neighbourhood?: string;
          city_district?: string;
          city?: string;
          town?: string;
        };
      };
      if (data?.display_name) {
        const locality =
          data.address?.suburb ||
          data.address?.neighbourhood ||
          data.address?.city_district ||
          data.address?.city ||
          data.address?.town ||
          localFormatted.locality;
        const suffix = localFormatted.inServiceArea
          ? `(${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`
          : `(${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}) — Outside Chennai Service Boundary`;
        return {
          coords,
          display_name: `${data.display_name.split(',').slice(0, 3).join(',')} ${suffix}`,
          locality,
          inServiceArea: localFormatted.inServiceArea,
          source: 'live_osm',
        };
      }
    }
  } catch {
    // Use local Chennai landmark reverse formatter
  }

  return {
    coords,
    display_name: localFormatted.display_name,
    locality: localFormatted.locality,
    inServiceArea: localFormatted.inServiceArea,
    source: 'fallback_geodata',
  };
}

/**
 * Accurately formats distance in meters into human-readable text.
 * e.g., 650 -> "650 m", 5300 -> "5.3 km", 12450 -> "12.5 km"
 */
export function formatDistanceText(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(100, Math.round(meters))} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

/**
 * Accurately formats duration in seconds into human-readable text.
 * e.g., 45 -> "< 1 min", 720 -> "12 mins", 3900 -> "1 hr 5 mins", 7200 -> "2 hrs"
 */
export function formatDurationText(seconds: number): string {
  if (seconds < 60) {
    return '< 1 min';
  }
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} mins`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  if (remainingMins === 0) {
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  }
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${remainingMins} mins`;
}

/**
 * Computes the real-world traffic multiplier based on Indian Standard Time (IST, UTC+5:30).
 * Factors morning office rush, evening exit rush, and clear late-night travel.
 */
export function getIndianTrafficMultiplier(distanceKm: number): {
  multiplier: number;
  condition: 'peak_rush' | 'moderate' | 'light' | 'free_flow';
  periodLabel: string;
} {
  const istDate = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hour = istDate.getUTCHours();
  const min = istDate.getUTCMinutes();
  const time = hour + min / 60;

  const isHighway = distanceKm > 50;

  // Morning Office Rush: 08:30 - 11:15 IST
  if (time >= 8.5 && time < 11.25) {
    return {
      multiplier: isHighway ? 1.12 : 1.26,
      condition: 'peak_rush',
      periodLabel: 'Morning Peak Rush',
    };
  }

  // Evening Peak Office Commute: 17:15 - 20:45 IST
  if (time >= 17.25 && time < 20.75) {
    return {
      multiplier: isHighway ? 1.15 : 1.30,
      condition: 'peak_rush',
      periodLabel: 'Evening Peak Rush',
    };
  }

  // Late Night Free-Flow: 23:00 - 05:30 IST
  if (time >= 23 || time < 5.5) {
    return {
      multiplier: 0.88,
      condition: 'free_flow',
      periodLabel: 'Late Night Free-Flow',
    };
  }

  // Regular daytime
  return {
    multiplier: 1.0,
    condition: 'moderate',
    periodLabel: 'Standard Traffic',
  };
}

/**
 * High-precision road distance and duration physics model calibrated for Tamil Nadu & Chennai.
 * Uses tiered curvature coefficients, road-class speeds, and live traffic multipliers.
 */
export function computeCalibratedRoadPhysics(
  origin: Coordinates,
  destination: Coordinates
): {
  distanceMeters: number;
  durationSeconds: number;
  roadKm: number;
  straightKm: number;
  trafficCondition: string;
} {
  const straightKm = calculateHaversineKm(origin, destination);

  // 1. Distance-dependent road network curvature factor (K_road)
  let kRoad = 1.28;
  if (straightKm < 2.5) {
    kRoad = 1.34;
  } else if (straightKm < 8.0) {
    kRoad = 1.28;
  } else if (straightKm < 25.0) {
    kRoad = 1.23;
  } else if (straightKm < 75.0) {
    kRoad = 1.18;
  } else {
    kRoad = 1.14;
  }

  const roadKm = Math.max(0.6, Number((straightKm * kRoad).toFixed(2)));
  const distanceMeters = Math.round(roadKm * 1000);

  // 2. Base Speed and Traffic Signal Cycle Buffer
  let baseSpeedKmH = 26;
  let signalBufferSeconds = 90;

  if (roadKm < 3.0) {
    baseSpeedKmH = 20;
    signalBufferSeconds = 60;
  } else if (roadKm < 10.0) {
    baseSpeedKmH = 25;
    signalBufferSeconds = 90;
  } else if (roadKm < 30.0) {
    baseSpeedKmH = 34;
    signalBufferSeconds = 120;
  } else if (roadKm < 80.0) {
    baseSpeedKmH = 55;
    signalBufferSeconds = 90;
  } else {
    baseSpeedKmH = 72;
    signalBufferSeconds = 180;
  }

  const baseTravelSeconds = (roadKm / baseSpeedKmH) * 3600 + signalBufferSeconds;

  // 3. Indian Standard Time traffic multiplier (minimum 1.4x calibration)
  const { multiplier, condition, periodLabel } = getIndianTrafficMultiplier(roadKm);
  const calibratedTrafficMultiplier = Math.max(1.4, multiplier * 1.4);
  const durationSeconds = Math.max(180, Math.round(baseTravelSeconds * calibratedTrafficMultiplier));

  return {
    distanceMeters,
    durationSeconds,
    roadKm,
    straightKm,
    trafficCondition: `${periodLabel} (${condition})`,
  };
}

/**
 * Computes driving distance, duration, and route geometry between two locations.
 * Validates boundaries against Chennai Metro and Tamil Nadu statewide operating boundaries.
 * Uses live OpenStreetMap OSRM routing with secondary mirror and calibrated traffic physics.
 */
export async function resolveDistanceAndTime(
  originAddress: string,
  destinationAddress: string,
  explicitOriginCoords?: Coordinates | null,
  explicitDestCoords?: Coordinates | null
): Promise<{
  originCoords: Coordinates;
  destinationCoords: Coordinates;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  routeGeometry: [number, number][];
  source: 'live_osm' | 'fallback_geodata';
}> {
  const [originRes, destRes] = await Promise.all([
    resolveAddressCoordinate(originAddress, explicitOriginCoords),
    resolveAddressCoordinate(destinationAddress, explicitDestCoords),
  ]);

  const originCoords = originRes.coords;
  const destinationCoords = destRes.coords;

  // Authoritative boundary validation (Chennai core or Tamil Nadu statewide)
  const chennaiCheck = validateChennaiTripEndpoints(originCoords, destinationCoords);
  const tnCheck = validateTamilNaduTripEndpoints(originCoords, destinationCoords);

  if (!chennaiCheck.valid && !tnCheck.valid) {
    const err = new Error(
      chennaiCheck.message || tnCheck.message || 'Selected location is outside the supported service area.'
    ) as Error & {
      statusCode?: number;
      code?: string;
      originCoords?: Coordinates;
      destinationCoords?: Coordinates;
      pickupInside?: boolean;
      destinationInside?: boolean;
    };
    err.statusCode = 422;
    err.code = chennaiCheck.code || tnCheck.code || 'OUTSIDE_SERVICE_AREA';
    err.originCoords = originCoords;
    err.destinationCoords = destinationCoords;
    err.pickupInside = chennaiCheck.pickupInside || tnCheck.pickupInside;
    err.destinationInside = chennaiCheck.destinationInside || tnCheck.destinationInside;
    throw err;
  }

  // 1. Attempt primary Live OSRM Car routing
  const osrmUrls = [
    `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destinationCoords.lon},${destinationCoords.lat}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoords.lon},${originCoords.lat};${destinationCoords.lon},${destinationCoords.lat}?overview=full&geometries=geojson`,
  ];

  for (const osrmUrl of osrmUrls) {
    try {
      const res = await fetchWithTimeout(osrmUrl, 2800);
      if (res.ok) {
        const json = (await res.json()) as {
          code?: string;
          routes?: Array<{
            distance: number;
            duration: number;
            geometry?: { coordinates: [number, number][] };
          }>;
        };
        const route = json.routes?.[0];
        if (json.code === 'Ok' && route) {
          const distMeters = Math.max(300, Math.round(route.distance));
          const rawDuration = Math.max(60, Math.round(route.duration));

          // Calibrate raw OSRM nominal duration with Indian traffic and signal dynamics (minimum 1.4x calibration)
          const { multiplier } = getIndianTrafficMultiplier(distMeters / 1000);
          const calibratedTrafficMultiplier = Math.max(1.4, multiplier * 1.4);
          const signalBuffer =
            distMeters < 20000 ? Math.min(180, Math.round((distMeters / 1000) * 12)) : 90;
          const durSeconds = Math.max(180, Math.round((rawDuration + signalBuffer) * calibratedTrafficMultiplier));

          const kmText = formatDistanceText(distMeters);
          const minText = formatDurationText(durSeconds);
          const geometry: [number, number][] = route.geometry?.coordinates
            ? route.geometry.coordinates.map(([lon, lat]) => [lat, lon])
            : interpolateRouteGeometry(originCoords, destinationCoords);

          return {
            originCoords,
            destinationCoords,
            distance: { text: kmText, value: distMeters },
            duration: { text: minText, value: durSeconds },
            routeGeometry: geometry,
            source: 'live_osm',
          };
        }
      }
    } catch {
      // Continue to next mirror or fallback physics model
    }
  }

  // 2. High-Precision Calibrated Road Physics Fallback (When live routing servers are unreachable)
  const physics = computeCalibratedRoadPhysics(originCoords, destinationCoords);

  return {
    originCoords,
    destinationCoords,
    distance: {
      text: formatDistanceText(physics.distanceMeters),
      value: physics.distanceMeters,
    },
    duration: {
      text: formatDurationText(physics.durationSeconds),
      value: physics.durationSeconds,
    },
    routeGeometry: interpolateRouteGeometry(originCoords, destinationCoords, 16),
    source: 'fallback_geodata',
  };
}

/**
 * Returns address autocomplete suggestions biased toward Chennai, Tamil Nadu, India.
 * Includes curated Chennai localities and tags each result with `inServiceArea`.
 */
export async function getAutocompleteSuggestions(
  input: string
): Promise<LandmarkSuggestion[]> {
  const q = (input || '').trim().toLowerCase();
  if (!q) {
    return URBAN_LANDMARKS.slice(0, 8);
  }

  const normQ = q.replace(/\./g, '');
  const localChennaiMatches = URBAN_LANDMARKS.filter((item) => {
    const normName = item.name.toLowerCase().replace(/\./g, '');
    const normDisplay = item.display_name.toLowerCase().replace(/\./g, '');
    return (
      normName.includes(normQ) ||
      normDisplay.includes(normQ) ||
      item.category.toLowerCase().includes(normQ)
    );
  });

  const outsideMatches = OUTSIDE_CHENNAI_REFERENCE_LOCATIONS.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.display_name.toLowerCase().includes(q)
  );

  const tnCityMatches: LandmarkSuggestion[] = TAMIL_NADU_MAJOR_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.district.toLowerCase().includes(q) ||
      c.tagline.toLowerCase().includes(q)
  ).map((c) => ({
    name: c.name,
    city: `${c.district}, Tamil Nadu`,
    country: 'India',
    lat: c.lat,
    lon: c.lon,
    display_name: `${c.name}, ${c.district} District, Tamil Nadu`,
    placeId: `tn-${c.id}`,
    category: c.tagline,
    inServiceArea: isPointInChennaiServiceArea({ lat: c.lat, lon: c.lon }),
  }));

  const combinedLocal = [...localChennaiMatches, ...outsideMatches, ...tnCityMatches];
  if (combinedLocal.length >= 5) {
    return combinedLocal.slice(0, 8);
  }

  // Query Photon API biased to Chennai center (13.0827, 80.2707)
  try {
    const { lat, lon } = CHENNAI_MAP_CONFIG.defaultCenter;
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      `${input} Chennai`
    )}&lat=${lat}&lon=${lon}&limit=6`;
    const res = await fetchWithTimeout(url, 2000);
    if (res.ok) {
      const data = (await res.json()) as {
        features?: Array<{
          properties: {
            name?: string;
            city?: string;
            county?: string;
            state?: string;
            country?: string;
            osm_id?: string | number;
            osm_value?: string;
          };
          geometry: { coordinates: [number, number] };
        }>;
      };
      const liveItems: LandmarkSuggestion[] = (data.features || [])
        .filter((f) => f.properties?.name && f.geometry?.coordinates)
        .map((f) => {
          const name = f.properties.name || input;
          const city =
            f.properties.city || f.properties.county || f.properties.state || 'Chennai';
          const country = f.properties.country || 'India';
          const itemLat = Number(f.geometry.coordinates[1].toFixed(6));
          const itemLon = Number(f.geometry.coordinates[0].toFixed(6));
          const inServiceArea = isPointInChennaiServiceArea({
            lat: itemLat,
            lon: itemLon,
          });
          return {
            name,
            city,
            country,
            lat: itemLat,
            lon: itemLon,
            display_name:
              name + (city ? `, ${city}` : '') + (country ? `, ${country}` : ''),
            placeId: String(f.properties.osm_id || Math.random()),
            category: inServiceArea
              ? f.properties.osm_value || 'Chennai Locality'
              : 'Outside Boundary',
            inServiceArea,
          };
        });

      const merged = [...combinedLocal];
      for (const item of liveItems) {
        if (!merged.some((m) => m.display_name === item.display_name)) {
          merged.push(item);
        }
      }
      if (merged.length > 0) {
        return merged.slice(0, 8);
      }
    }
  } catch {
    // Use local fallback
  }

  return combinedLocal.length > 0 ? combinedLocal : URBAN_LANDMARKS.slice(0, 8);
}

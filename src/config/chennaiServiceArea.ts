export interface Coordinates {
  lat: number;
  lon: number;
}

export interface ServiceAreaValidationResult {
  valid: boolean;
  pickupInside: boolean;
  destinationInside: boolean;
  code?:
    | 'INVALID_COORDINATES'
    | 'PICKUP_OUTSIDE_SERVICE_AREA'
    | 'DESTINATION_OUTSIDE_SERVICE_AREA'
    | 'BOTH_OUTSIDE_SERVICE_AREA';
  message?: string;
  boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG';
}

/**
 * Single configurable source of truth for the default Chennai map center and zoom level.
 * Requirement 1: Set initial map center to ~13.0827, 80.2707 and keep it configurable in one location.
 */
export const CHENNAI_MAP_CONFIG = {
  city: 'Chennai',
  state: 'Tamil Nadu',
  country: 'India',
  defaultCenter: {
    lat: 13.0827,
    lon: 80.2707,
  } as Coordinates,
  defaultZoom: 12,
  minZoom: 10,
  maxZoom: 19,
  /**
   * Nominatim / Photon viewbox [minLon, minLat, maxLon, maxLat] for biasing searches to Greater Chennai
   */
  searchViewbox: [80.06, 12.84, 80.34, 13.21] as [number, number, number, number],
} as const;

/**
 * Provisional development service-area polygon for Chennai, Tamil Nadu, India.
 *
 * NOTE: This is an approximate development configuration and is NOT yet an approved
 * production municipal boundary. It covers core Chennai city neighborhoods
 * (Central, Egmore, T. Nagar, Anna Nagar, Adyar, Mylapore, Guindy, Velachery),
 * airport/GST corridor down to Tambaram, and the OMR IT corridor through Perungudi,
 * Thoraipakkam, and Sholinganallur.
 *
 * Vertices are ordered [lat, lon].
 */
export const CHENNAI_PROVISIONAL_POLYGON: ReadonlyArray<[number, number]> = [
  [13.185, 80.325], // North-East Ennore / Tiruvottiyur coast
  [13.185, 80.165], // North-West Madhavaram / Red Hills edge
  [13.115, 80.110], // West Ambattur / Avadi edge
  [13.030, 80.095], // South-West Poonamallee / Porur corridor
  [12.900, 80.075], // Tambaram / Vandalur outer edge
  [12.865, 80.220], // South OMR / Sholinganallur / Navalur edge
  [12.885, 80.262], // ECR / Neelankarai / Injambakkam coast
  [13.005, 80.285], // Adyar / Besant Nagar / Marina coast
  [13.085, 80.305], // Chennai Port / Royapuram coast
  [13.185, 80.325], // Close polygon
];

export const CHENNAI_BOUNDING_BOX = {
  minLat: 12.865,
  maxLat: 13.185,
  minLon: 80.075,
  maxLon: 80.325,
} as const;

export const CHENNAI_SERVICE_AREA_METADATA = {
  id: 'chennai-service-area-dev-v1',
  name: 'Chennai Operating Zone (Provisional Dev Config)',
  status: 'PROVISIONAL_DEVELOPMENT_CONFIG' as const,
  isProductionApproved: false,
  notice:
    'Provisional development boundary for Chennai, Tamil Nadu. Approximate polygon for development and verification; requires geographical review prior to production release.',
};

export function isValidCoordinatePair(coords?: Coordinates | null): coords is Coordinates {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
    return false;
  }
  if (Number.isNaN(coords.lat) || Number.isNaN(coords.lon)) {
    return false;
  }
  return coords.lat >= -90 && coords.lat <= 90 && coords.lon >= -180 && coords.lon <= 180;
}

/**
 * Ray-casting point-in-polygon check against CHENNAI_PROVISIONAL_POLYGON.
 */
export function isPointInChennaiServiceArea(coords: Coordinates): boolean {
  if (!isValidCoordinatePair(coords)) {
    return false;
  }

  // Fast bounding-box pre-filter
  if (
    coords.lat < CHENNAI_BOUNDING_BOX.minLat ||
    coords.lat > CHENNAI_BOUNDING_BOX.maxLat ||
    coords.lon < CHENNAI_BOUNDING_BOX.minLon ||
    coords.lon > CHENNAI_BOUNDING_BOX.maxLon
  ) {
    return false;
  }

  const lat = coords.lat;
  const lon = coords.lon;
  let inside = false;

  for (
    let i = 0, j = CHENNAI_PROVISIONAL_POLYGON.length - 1;
    i < CHENNAI_PROVISIONAL_POLYGON.length;
    j = i++
  ) {
    const xi = CHENNAI_PROVISIONAL_POLYGON[i][0];
    const yi = CHENNAI_PROVISIONAL_POLYGON[i][1];
    const xj = CHENNAI_PROVISIONAL_POLYGON[j][0];
    const yj = CHENNAI_PROVISIONAL_POLYGON[j][1];

    const intersect =
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Validates both pickup and destination coordinates against the provisional Chennai service area.
 */
export function validateChennaiTripEndpoints(
  pickupCoords: Coordinates,
  destinationCoords: Coordinates
): ServiceAreaValidationResult {
  if (!isValidCoordinatePair(pickupCoords) || !isValidCoordinatePair(destinationCoords)) {
    return {
      valid: false,
      pickupInside: false,
      destinationInside: false,
      code: 'INVALID_COORDINATES',
      message: 'Invalid pickup or destination coordinates.',
      boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG',
    };
  }

  const pickupInside = isPointInChennaiServiceArea(pickupCoords);
  const destinationInside = isPointInChennaiServiceArea(destinationCoords);

  if (!pickupInside && !destinationInside) {
    return {
      valid: false,
      pickupInside: false,
      destinationInside: false,
      code: 'BOTH_OUTSIDE_SERVICE_AREA',
      message:
        'Both pickup and destination are outside the supported Chennai operating boundary. CabSafe currently operates only within serviceable areas of Chennai.',
      boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG',
    };
  }

  if (!pickupInside) {
    return {
      valid: false,
      pickupInside: false,
      destinationInside: true,
      code: 'PICKUP_OUTSIDE_SERVICE_AREA',
      message:
        'Pickup location is outside the supported Chennai service area. Please select a pickup point inside the Chennai operating boundary.',
      boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG',
    };
  }

  if (!destinationInside) {
    return {
      valid: false,
      pickupInside: true,
      destinationInside: false,
      code: 'DESTINATION_OUTSIDE_SERVICE_AREA',
      message:
        'Destination is outside the supported Chennai service area. Please select a destination inside the Chennai operating boundary.',
      boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG',
    };
  }

  return {
    valid: true,
    pickupInside: true,
    destinationInside: true,
    boundaryStatus: 'PROVISIONAL_DEVELOPMENT_CONFIG',
  };
}

export interface MajorCorridor {
  id: string;
  name: string;
  shortName: string;
  color: string;
  trafficStatus: 'normal' | 'moderate' | 'heavy';
  points: [number, number][]; // [lat, lon]
}

export const CHENNAI_MAJOR_CORRIDORS: ReadonlyArray<MajorCorridor> = [
  {
    id: 'omr',
    name: 'OMR IT Corridor (Rajiv Gandhi Salai)',
    shortName: 'OMR IT Expressway',
    color: '#00F0FF',
    trafficStatus: 'normal',
    points: [
      [13.0067, 80.2572], // Madhya Kailash
      [12.9698, 80.2458], // Taramani / SRP Tools
      [12.9516, 80.2412], // Perungudi
      [12.9352, 80.2312], // Thoraipakkam
      [12.901, 80.2279],  // Sholinganallur
      [12.8458, 80.2265], // Siruseri SIPCOT
    ],
  },
  {
    id: 'anna-salai',
    name: 'Anna Salai (Mount Road Arterial)',
    shortName: 'Anna Salai Arterial',
    color: '#E2FF44',
    trafficStatus: 'moderate',
    points: [
      [13.0827, 80.2707], // Central / Park Town
      [13.0645, 80.2605], // Thousand Lights
      [13.0418, 80.245],  // T. Nagar / Nandanam
      [13.0163, 80.2155], // Saidapet
      [13.0067, 80.2025], // Guindy / Kathipara
    ],
  },
  {
    id: 'gst-road',
    name: 'GST Road (Grand Southern Trunk / Airport Corridor)',
    shortName: 'GST Airport Highway',
    color: '#A78BFA',
    trafficStatus: 'normal',
    points: [
      [13.0067, 80.2025], // Guindy Kathipara
      [12.9902, 80.1693], // Meenambakkam Airport
      [12.9682, 80.1415], // Pallavaram
      [12.9515, 80.1388], // Chromepet
      [12.9249, 80.1],    // Tambaram
    ],
  },
  {
    id: 'inner-ring',
    name: '100 Feet Inner Ring Road (Jawaharlal Nehru Rd)',
    shortName: '100 Ft Inner Ring',
    color: '#38BDF8',
    trafficStatus: 'moderate',
    points: [
      [13.085, 80.2101],  // Anna Nagar Roundtana
      [13.0694, 80.1948], // Koyambedu CMBT
      [13.0512, 80.2122], // Vadapalani
      [13.0315, 80.2055], // Ashok Nagar
      [13.0067, 80.2025], // Kathipara
    ],
  },
  {
    id: 'ecr',
    name: 'East Coast Road (ECR Scenic Coastal Highway)',
    shortName: 'ECR Coastal',
    color: '#34D399',
    trafficStatus: 'normal',
    points: [
      [12.9865, 80.2612], // Thiruvanmiyur
      [12.9525, 80.2588], // Kottivakkam
      [12.9245, 80.2575], // Neelankarai
      [12.9085, 80.2512], // Injambakkam
      [12.875, 80.245],   // Akkarai
    ],
  },
];


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

/**
 * Single configurable source of truth for Tamil Nadu statewide map bounds & default view.
 * Centered in the central heartland (Tiruchirappalli / Karur area) to frame the entire state cleanly.
 */
export const TAMIL_NADU_MAP_CONFIG = {
  state: 'Tamil Nadu',
  country: 'India',
  defaultCenter: {
    lat: 11.1271,
    lon: 78.6569, // Central Heartland (Trichy / Karur)
  } as Coordinates,
  defaultZoom: 7.5,
  minZoom: 6,
  maxZoom: 19,
  bounds: [
    [8.05, 76.15],  // Southwest: Kanyakumari / Western Ghats
    [13.55, 80.38], // Northeast: Pulicat / Chennai Coast
  ] as [[number, number], [number, number]],
  /**
   * Nominatim / Photon search viewbox [minLon, minLat, maxLon, maxLat] covering all 38 districts of Tamil Nadu
   */
  searchViewbox: [76.15, 8.05, 80.38, 13.55] as [number, number, number, number],
} as const;

/**
 * Detailed boundary polygon tracing the perimeter of Tamil Nadu, India.
 * Vertices ordered [lat, lon].
 */
export const TAMIL_NADU_BORDER_POLYGON: ReadonlyArray<[number, number]> = [
  [13.50, 80.20], // Pulicat Lake / Gummidipoondi (North)
  [13.40, 79.90], // Uthukkottai / Nagari hills border
  [13.18, 79.60], // Arakkonam / Tiruttani border
  [12.98, 79.15], // Katpadi / Vellore North
  [12.75, 78.60], // Vaniyambadi / Jolarpettai
  [12.72, 77.82], // Hosur / Krishnagiri border
  [12.50, 77.70], // Denkanikottai
  [12.12, 77.77], // Hogenakkal Falls / Dharmapuri border
  [11.90, 77.60], // Mettur / Salem border
  [11.60, 77.10], // Sathyamangalam / Erode border
  [11.55, 76.50], // Mudumalai / Nilgiris North
  [11.45, 76.35], // Gudalur / Devala (West Nilgiris)
  [11.30, 76.60], // Ooty / Kundah
  [11.00, 76.85], // Coimbatore West / Maruthamalai
  [10.65, 76.90], // Pollachi / Anaimalai
  [10.32, 76.95], // Valparai / Western Ghats
  [10.15, 77.20], // Chinnakanal / Theni border
  [9.80, 77.30],  // Bodi / Megamalai
  [9.50, 77.35],  // Srivilliputhur / Megamalai
  [9.20, 77.25],  // Rajapalayam / Western Ghats
  [8.95, 77.25],  // Tenkasi / Courtallam border
  [8.65, 77.30],  // Papanasam / Kalakkad Mundanthurai
  [8.35, 77.35],  // Pechiparai / Kanyakumari hills
  [8.078, 77.555], // Cape Comorin / Kanyakumari Tip (South)
  [8.20, 77.75],  // Koodankulam coast
  [8.49, 78.12],  // Tiruchendur Temple coast
  [8.80, 78.16],  // Tuticorin VOC Port
  [9.15, 78.60],  // Sayalgudi coast
  [9.28, 79.15],  // Mandapam / Ramanathapuram
  [9.287, 79.313], // Rameswaram Island / Pamban
  [9.18, 79.42],  // Dhanushkodi Tip
  [9.74, 79.02],  // Tondi / Palk Strait
  [10.05, 79.25], // Manamelkudi coast
  [10.30, 79.86], // Point Calimere / Kodikkarai
  [10.58, 79.85], // Vedaranyam
  [10.76, 79.84], // Nagapattinam Port
  [11.00, 79.85], // Karaikal / Nagore border
  [11.15, 79.84], // Tarangambadi (Tranquebar)
  [11.40, 79.73], // Chidambaram / Pichavaram Mangroves
  [11.75, 79.77], // Cuddalore / Silver Beach
  [11.93, 79.83], // Puducherry coastline
  [12.25, 79.98], // Marakkanam Salt Pans
  [12.62, 80.19], // Mahabalipuram UNESCO coast
  [12.88, 80.26], // Kovalam / ECR coast
  [13.08, 80.30], // Chennai Port / Marina
  [13.25, 80.33], // Ennore Port / Kattupalli
  [13.50, 80.20], // Close polygon at Pulicat
];

export const TAMIL_NADU_BOUNDING_BOX = {
  minLat: 8.05,
  maxLat: 13.55,
  minLon: 76.15,
  maxLon: 80.38,
} as const;

export const TAMIL_NADU_SERVICE_AREA_METADATA = {
  id: 'tamil-nadu-statewide-v1',
  name: 'Tamil Nadu Statewide Operating Zone',
  status: 'STATEWIDE_TAMIL_NADU' as const,
  districtsCount: 38,
  notice:
    'Comprehensive statewide map and transit coverage across all 38 districts of Tamil Nadu, India.',
};

export interface MajorCityHub {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  icon: string;
  tagline: string;
  zoomLevel: number;
  isMetro?: boolean;
}

/**
 * Curated premier urban centers and transit hubs across Tamil Nadu
 */
export const TAMIL_NADU_MAJOR_CITIES: ReadonlyArray<MajorCityHub> = [
  {
    id: 'chennai',
    name: 'Chennai Metro',
    district: 'Chennai',
    lat: 13.0827,
    lon: 80.2707,
    icon: '🏛️',
    tagline: 'Capital Metropolis & Gateway of South India',
    zoomLevel: 12,
    isMetro: true,
  },
  {
    id: 'coimbatore',
    name: 'Coimbatore',
    district: 'Coimbatore',
    lat: 11.0168,
    lon: 76.9558,
    icon: '🏭',
    tagline: 'Manchester of South India & Tech Hub',
    zoomLevel: 12,
  },
  {
    id: 'madurai',
    name: 'Madurai',
    district: 'Madurai',
    lat: 9.9252,
    lon: 78.1198,
    icon: '🛕',
    tagline: 'Cultural Capital & Historic Meenakshi City',
    zoomLevel: 12,
  },
  {
    id: 'trichy',
    name: 'Tiruchirappalli (Trichy)',
    district: 'Tiruchirappalli',
    lat: 10.7905,
    lon: 78.7047,
    icon: '🏰',
    tagline: 'Central Heartland & Ancient Rockfort',
    zoomLevel: 12,
  },
  {
    id: 'salem',
    name: 'Salem',
    district: 'Salem',
    lat: 11.6643,
    lon: 78.1460,
    icon: '⚡',
    tagline: 'Steel City & Strategic Highway Crossroad',
    zoomLevel: 12,
  },
  {
    id: 'tirunelveli',
    name: 'Tirunelveli',
    district: 'Tirunelveli',
    lat: 8.7139,
    lon: 77.7567,
    icon: '🍬',
    tagline: 'Oxford of South India & Thamirabarani Basin',
    zoomLevel: 12,
  },
  {
    id: 'vellore',
    name: 'Vellore',
    district: 'Vellore',
    lat: 12.9165,
    lon: 79.1325,
    icon: '🛡️',
    tagline: 'Historic Fort & Premier Medical Corridor',
    zoomLevel: 12,
  },
  {
    id: 'erode',
    name: 'Erode',
    district: 'Erode',
    lat: 11.3410,
    lon: 77.7172,
    icon: '🌿',
    tagline: 'Turmeric City & Handloom Powerhouse',
    zoomLevel: 12,
  },
  {
    id: 'tiruppur',
    name: 'Tiruppur',
    district: 'Tiruppur',
    lat: 11.1085,
    lon: 77.3411,
    icon: '🧵',
    tagline: 'Knitwear & Apparel Export Capital of India',
    zoomLevel: 12,
  },
  {
    id: 'thanjavur',
    name: 'Thanjavur',
    district: 'Thanjavur',
    lat: 10.7870,
    lon: 79.1378,
    icon: '🌾',
    tagline: 'Cauvery Delta Granary & UNESCO Brihadeeswarar',
    zoomLevel: 12,
  },
  {
    id: 'dindigul',
    name: 'Dindigul',
    district: 'Dindigul',
    lat: 10.3673,
    lon: 77.9803,
    icon: '🔐',
    tagline: 'Rock Fort & Gateway to Sirumalai',
    zoomLevel: 12,
  },
  {
    id: 'kanyakumari',
    name: 'Kanyakumari',
    district: 'Kanyakumari',
    lat: 8.0883,
    lon: 77.5385,
    icon: '🌊',
    tagline: 'Cape Comorin & Triveni Ocean Confluence',
    zoomLevel: 12,
  },
  {
    id: 'ooty',
    name: 'Ooty (Nilgiris)',
    district: 'Nilgiris',
    lat: 11.4102,
    lon: 76.6950,
    icon: '⛰️',
    tagline: 'Queen of Hill Stations & UNESCO Mountain Railway',
    zoomLevel: 12,
  },
  {
    id: 'kodaikanal',
    name: 'Kodaikanal',
    district: 'Dindigul',
    lat: 10.2381,
    lon: 77.4892,
    icon: '🌲',
    tagline: 'Princess of Hill Stations & Palani Hills',
    zoomLevel: 12,
  },
  {
    id: 'rameswaram',
    name: 'Rameswaram',
    district: 'Ramanathapuram',
    lat: 9.2876,
    lon: 79.3129,
    icon: '🌉',
    tagline: 'Historic Pamban Sea Bridge & Ramanathaswamy',
    zoomLevel: 12,
  },
  {
    id: 'mahabalipuram',
    name: 'Mahabalipuram',
    district: 'Chengalpattu',
    lat: 12.6208,
    lon: 80.1945,
    icon: '🏖️',
    tagline: 'UNESCO World Heritage Shore Temple & ECR Coast',
    zoomLevel: 12,
  },
  {
    id: 'kanchipuram',
    name: 'Kanchipuram',
    district: 'Kanchipuram',
    lat: 12.8342,
    lon: 79.7036,
    icon: '🥻',
    tagline: 'Silk City of India & Thousand Temples',
    zoomLevel: 12,
  },
  {
    id: 'hosur',
    name: 'Hosur',
    district: 'Krishnagiri',
    lat: 12.7409,
    lon: 77.8253,
    icon: '🚀',
    tagline: 'Electric Mobility Hub & Border Expressway',
    zoomLevel: 12,
  },
  {
    id: 'thoothukudi',
    name: 'Thoothukudi (Tuticorin)',
    district: 'Thoothukudi',
    lat: 8.7642,
    lon: 78.1348,
    icon: '⚓',
    tagline: 'Pearl City & Major Deepwater Seaport',
    zoomLevel: 12,
  },
  {
    id: 'cuddalore',
    name: 'Cuddalore',
    district: 'Cuddalore',
    lat: 11.7480,
    lon: 79.7714,
    icon: '🏖️',
    tagline: 'Silver Beach & Coromandel Coastal Port',
    zoomLevel: 12,
  },
  {
    id: 'nagercoil',
    name: 'Nagercoil',
    district: 'Kanyakumari',
    lat: 8.1833,
    lon: 77.4119,
    icon: '🌴',
    tagline: 'Southern Spice Gateway & Railway Junction',
    zoomLevel: 12,
  },
];

/**
 * Statewide Tamil Nadu National Highway Expressways & Arterial Corridors
 */
export const TAMIL_NADU_CORRIDORS: ReadonlyArray<MajorCorridor> = [
  {
    id: 'nh-44-spine',
    name: 'NH 44 (North-South Grand Highway Spine)',
    shortName: 'NH 44 Spine',
    color: '#F59E0B',
    trafficStatus: 'normal',
    points: [
      [12.7409, 77.8253], // Hosur
      [12.1211, 78.1582], // Dharmapuri
      [11.6643, 78.1460], // Salem
      [11.2189, 78.1674], // Namakkal
      [10.9601, 78.0766], // Karur
      [10.3673, 77.9803], // Dindigul
      [9.9252, 78.1198],  // Madurai
      [9.5872, 77.9579],  // Virudhunagar
      [8.7139, 77.7567],  // Tirunelveli
      [8.0883, 77.5385],  // Kanyakumari
    ],
  },
  {
    id: 'nh-45-gst',
    name: 'NH 45 / GST Road (Chennai - Trichy Grand Southern Trunk)',
    shortName: 'NH 45 GST Highway',
    color: '#DC2626',
    trafficStatus: 'moderate',
    points: [
      [13.0827, 80.2707], // Chennai Central
      [12.9249, 80.1],    // Tambaram
      [12.6939, 79.9757], // Chengalpattu
      [12.2334, 79.6508], // Tindivanam
      [11.9401, 79.4861], // Villupuram
      [11.2342, 78.8820], // Perambalur
      [10.7905, 78.7047], // Tiruchirappalli
      [10.3673, 77.9803], // Dindigul
    ],
  },
  {
    id: 'nh-48-544-west',
    name: 'NH 48 / NH 544 (Chennai - Vellore - Salem - Coimbatore Western Expressway)',
    shortName: 'NH 48/544 West Expressway',
    color: '#8B5CF6',
    trafficStatus: 'normal',
    points: [
      [13.0827, 80.2707], // Chennai
      [12.9675, 79.9419], // Sriperumbudur
      [12.8342, 79.7036], // Kanchipuram
      [12.9272, 79.3330], // Ranipet
      [12.9165, 79.1325], // Vellore
      [12.7904, 78.7166], // Ambur
      [12.6825, 78.6206], // Vaniyambadi
      [11.6643, 78.1460], // Salem
      [11.4878, 77.8687], // Sankari
      [11.3410, 77.7172], // Erode
      [11.1085, 77.3411], // Tiruppur
      [11.0168, 76.9558], // Coimbatore
    ],
  },
  {
    id: 'ecr-scenic',
    name: 'East Coast Road (ECR Scenic Coastal Expressway)',
    shortName: 'ECR Coastal Expressway',
    color: '#10B981',
    trafficStatus: 'normal',
    points: [
      [12.9865, 80.2612], // Thiruvanmiyur (Chennai)
      [12.6208, 80.1945], // Mahabalipuram
      [12.1983, 79.9547], // Marakkanam
      [11.9340, 79.8306], // Puducherry
      [11.7480, 79.7714], // Cuddalore
      [11.3992, 79.6934], // Chidambaram
      [11.2384, 79.7342], // Sirkazhi
      [10.7672, 79.8449], // Nagapattinam
      [8.7642, 78.1348],  // Thoothukudi
      [8.0883, 77.5385],  // Kanyakumari
    ],
  },
  {
    id: 'omr-it-corridor',
    name: 'OMR (Rajiv Gandhi Salai IT Expressway)',
    shortName: 'OMR IT Expressway',
    color: '#06B6D4',
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
    id: 'nh-83-delta',
    name: 'NH 83 (Cauvery Delta Corridor: Coimbatore - Trichy - Nagapattinam)',
    shortName: 'NH 83 Delta Corridor',
    color: '#EC4899',
    trafficStatus: 'normal',
    points: [
      [11.0168, 76.9558], // Coimbatore
      [10.6609, 77.0048], // Pollachi
      [10.3673, 77.9803], // Dindigul
      [10.7905, 78.7047], // Trichy
      [10.7870, 79.1378], // Thanjavur
      [10.7725, 79.6366], // Tiruvarur
      [10.7672, 79.8449], // Nagapattinam
    ],
  },
];

/**
 * Checks whether a given coordinate pair falls within the state boundary of Tamil Nadu.
 */
export function isPointInTamilNaduServiceArea(coords: Coordinates): boolean {
  if (!isValidCoordinatePair(coords)) {
    return false;
  }

  // Fast bounding-box pre-filter
  if (
    coords.lat < TAMIL_NADU_BOUNDING_BOX.minLat ||
    coords.lat > TAMIL_NADU_BOUNDING_BOX.maxLat ||
    coords.lon < TAMIL_NADU_BOUNDING_BOX.minLon ||
    coords.lon > TAMIL_NADU_BOUNDING_BOX.maxLon
  ) {
    return false;
  }

  const lat = coords.lat;
  const lon = coords.lon;
  let inside = false;

  for (
    let i = 0, j = TAMIL_NADU_BORDER_POLYGON.length - 1;
    i < TAMIL_NADU_BORDER_POLYGON.length;
    j = i++
  ) {
    const xi = TAMIL_NADU_BORDER_POLYGON[i][0];
    const yi = TAMIL_NADU_BORDER_POLYGON[i][1];
    const xj = TAMIL_NADU_BORDER_POLYGON[j][0];
    const yj = TAMIL_NADU_BORDER_POLYGON[j][1];

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
 * Validates both pickup and destination coordinates against the Tamil Nadu statewide boundary.
 */
export function validateTamilNaduTripEndpoints(
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

  const pickupInside = isPointInTamilNaduServiceArea(pickupCoords);
  const destinationInside = isPointInTamilNaduServiceArea(destinationCoords);

  if (!pickupInside && !destinationInside) {
    return {
      valid: false,
      pickupInside: false,
      destinationInside: false,
      code: 'BOTH_OUTSIDE_SERVICE_AREA',
      message:
        'Both pickup and destination are outside Tamil Nadu. CabSafe operates across Tamil Nadu state and Chennai Metropolitan Area.',
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
        'Pickup location is outside Tamil Nadu. Please select a pickup point within Tamil Nadu or Chennai.',
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
        'Destination is outside Tamil Nadu. Please select a destination within Tamil Nadu or Chennai.',
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

/**
 * Returns a human-friendly regional descriptor for coordinates anywhere in Tamil Nadu.
 */
export function getTamilNaduRegionLabel(coords: Coordinates): string {
  if (!isValidCoordinatePair(coords)) return 'Tamil Nadu';

  // Check if inside Chennai Metro
  if (isPointInChennaiServiceArea(coords)) {
    return 'Chennai Metro';
  }

  // Find nearest major city
  let closestCity = TAMIL_NADU_MAJOR_CITIES[0];
  let minDistanceSq = Number.MAX_VALUE;

  for (const city of TAMIL_NADU_MAJOR_CITIES) {
    const dLat = city.lat - coords.lat;
    const dLon = city.lon - coords.lon;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestCity = city;
    }
  }

  // If reasonably close (< ~0.45 deg ~ 50 km)
  if (minDistanceSq < 0.2) {
    return `${closestCity.name} Region, TN`;
  }
  return `${closestCity.district} District, TN`;
}



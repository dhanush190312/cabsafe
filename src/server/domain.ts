import crypto from 'crypto';
import {
  Coordinates,
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_SERVICE_AREA_METADATA,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
  ServiceAreaValidationResult,
} from '../config/chennaiServiceArea';

export {
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_SERVICE_AREA_METADATA,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
};
export type { Coordinates, ServiceAreaValidationResult };

export type VehicleType = 'car' | 'cng' | 'motorcycle';
export type RideStatus = 'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled';
export type UserRole = 'user' | 'captain' | 'admin';

export interface FullName {
  firstname: string;
  lastname?: string;
}

export interface UserRecord {
  _id: string;
  fullname: FullName;
  email: string;
  phone?: string;
  password?: string; // bcrypt hash, stripped in safe responses
  socketId?: string | null;
  rating: number;
  createdAt: string;
}

export interface VehicleInfo {
  color: string;
  plate: string;
  capacity: number;
  vehicleType: VehicleType;
  model?: string;
}

export interface CaptainMetrics {
  rating: number;
  completedRides: number;
  assignedRides: number;
  totalEarnings: number;
  distanceKm: number;
  hoursOnline: number;
}

export interface CaptainRecord {
  _id: string;
  fullname: FullName;
  email: string;
  phone?: string;
  password?: string; // bcrypt hash, stripped in safe responses
  socketId?: string | null;
  status: 'active' | 'inactive';
  vehicle: VehicleInfo;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
    updatedAt?: string;
  };
  metrics: CaptainMetrics;
  createdAt: string;
}

export interface ScoreComponent {
  raw: string;
  score: number; // 0.0 to 1.0
  weighted: number; // 0 to 100 scale contribution
}

export interface MatchExplanation {
  captainId: string;
  captainName: string;
  vehicleType: VehicleType;
  vehicleModel?: string;
  vehicleColor?: string;
  plate: string;
  rating?: number;
  completedRides?: number;
  distanceKm: number;
  etaMinutes: number;
  finalScore: number; // 0 to 100
  driverFare?: number;
  scoreBreakdown: {
    distance: ScoreComponent;
    rating: ScoreComponent;
    completion: ScoreComponent;
    vehicle: ScoreComponent;
  };
  explanation: string;
}

export interface RideRecord {
  _id: string;
  user: UserRecord | string;
  captain?: CaptainRecord | string | null;
  pickup: string;
  destination: string;
  pickupCoords: Coordinates;
  destinationCoords: Coordinates;
  routeGeometry?: [number, number][]; // Array of [lat, lon] points
  vehicleType: VehicleType;
  fare: number;
  fareBreakdown: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    total: number;
  };
  status: RideStatus;
  duration: number; // seconds
  distance: number; // meters
  otp?: string; // 6-digit string; stripped from captain responses before start
  paymentStatus: 'pending' | 'paid';
  paymentMethod: 'Cash' | 'Card' | 'Wallet';
  userRating?: number;
  userFeedback?: string;
  cancelledBy?: 'user' | 'captain' | null;
  cancelReason?: string;
  preferredCaptainId?: string;
  matchExplanation?: MatchExplanation | null;
  candidateRankings?: MatchExplanation[];
  dataSource: 'live_osm' | 'fallback_geodata';
  createdAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface LandmarkSuggestion {
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  display_name: string;
  placeId: string;
  category: string;
  inServiceArea?: boolean;
}

/**
 * Curated Chennai localities within the provisional operating boundary.
 * Covers all requested localities: T. Nagar, Anna Nagar, Adyar, Velachery,
 * Guindy, Tambaram, Sholinganallur, Thoraipakkam, Perungudi, OMR, plus Central & Airport.
 */
export const URBAN_LANDMARKS: LandmarkSuggestion[] = [
  {
    name: 'T. Nagar (Panagal Park)',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 13.0418,
    lon: 80.2341,
    display_name: 'T. Nagar, Panagal Park, Thyagaraya Nagar, Chennai, Tamil Nadu',
    placeId: 'maa-t-nagar',
    category: 'Commercial Hub',
    inServiceArea: true,
  },
  {
    name: 'Anna Nagar Tower Park',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 13.085,
    lon: 80.2101,
    display_name: 'Anna Nagar, 2nd Avenue, Tower Park, Chennai, Tamil Nadu',
    placeId: 'maa-anna-nagar',
    category: 'Residential & Dining',
    inServiceArea: true,
  },
  {
    name: 'Adyar Signal (LB Road)',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 13.0067,
    lon: 80.2572,
    display_name: 'Adyar, Sardar Patel Rd & LB Road Junction, Chennai, Tamil Nadu',
    placeId: 'maa-adyar',
    category: 'South Chennai Hub',
    inServiceArea: true,
  },
  {
    name: 'Velachery (Phoenix Marketcity)',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9784,
    lon: 80.218,
    display_name: 'Velachery Main Road, Phoenix Marketcity, Velachery, Chennai, Tamil Nadu',
    placeId: 'maa-velachery',
    category: 'Transit & Mall',
    inServiceArea: true,
  },
  {
    name: 'Guindy Kathipara & Metro Hub',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 13.0067,
    lon: 80.2206,
    display_name: 'Guindy Industrial Estate, GST Road, Guindy, Chennai, Tamil Nadu',
    placeId: 'maa-guindy',
    category: 'Metro & Transit',
    inServiceArea: true,
  },
  {
    name: 'Tambaram Railway & Bus Terminus',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9249,
    lon: 80.1,
    display_name: 'Tambaram Sanatorium / GST Road Terminus, Tambaram, Chennai, Tamil Nadu',
    placeId: 'maa-tambaram',
    category: 'Suburban Rail Hub',
    inServiceArea: true,
  },
  {
    name: 'Sholinganallur OMR Junction',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.901,
    lon: 80.2279,
    display_name: 'Sholinganallur Junction, Rajiv Gandhi Salai (OMR), Chennai, Tamil Nadu',
    placeId: 'maa-sholinganallur',
    category: 'IT Corridor',
    inServiceArea: true,
  },
  {
    name: 'Thoraipakkam OMR PTC Stop',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9387,
    lon: 80.2323,
    display_name: 'Thoraipakkam, Old Mahabalipuram Road (OMR), Chennai, Tamil Nadu',
    placeId: 'maa-thoraipakkam',
    category: 'IT Corridor',
    inServiceArea: true,
  },
  {
    name: 'Perungudi World Trade Center',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9654,
    lon: 80.2461,
    display_name: 'Perungudi, WTC Brigade, Rajiv Gandhi Salai (OMR), Chennai, Tamil Nadu',
    placeId: 'maa-perungudi',
    category: 'Tech Park',
    inServiceArea: true,
  },
  {
    name: 'OMR (TIDEL Park / SRP Tools)',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9896,
    lon: 80.2486,
    display_name: 'OMR (Old Mahabalipuram Road), TIDEL Park, Taramani, Chennai, Tamil Nadu',
    placeId: 'maa-omr-tidel',
    category: 'IT Corridor',
    inServiceArea: true,
  },
  {
    name: 'MGR Chennai Central Station',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 13.0827,
    lon: 80.275,
    display_name: 'Puratchi Thalaivar Dr. M.G.R. Central Railway Station, Park Town, Chennai',
    placeId: 'maa-central-station',
    category: 'Rail Terminal',
    inServiceArea: true,
  },
  {
    name: 'Chennai International Airport (MAA)',
    city: 'Chennai, Tamil Nadu',
    country: 'India',
    lat: 12.9941,
    lon: 80.1709,
    display_name: 'Chennai International Airport (MAA), GST Road, Meenambakkam, Chennai',
    placeId: 'maa-airport',
    category: 'Airport',
    inServiceArea: true,
  },
];

/**
 * Known locations outside the Chennai operating boundary used to verify
 * that out-of-area searches resolve to their real coordinates and are rejected
 * rather than being silently moved inside Chennai.
 */
export const OUTSIDE_CHENNAI_REFERENCE_LOCATIONS: LandmarkSuggestion[] = [
  {
    name: 'Mahabalipuram Shore Temple',
    city: 'Chengalpattu, Tamil Nadu',
    country: 'India',
    lat: 12.6208,
    lon: 80.1945,
    display_name: 'Mahabalipuram (Mamallapuram), ECR, Chengalpattu District, Tamil Nadu',
    placeId: 'out-mahabalipuram',
    category: 'Outside Boundary',
    inServiceArea: false,
  },
  {
    name: 'Kanchipuram Bus Stand',
    city: 'Kanchipuram, Tamil Nadu',
    country: 'India',
    lat: 12.8342,
    lon: 79.7036,
    display_name: 'Kanchipuram Central Bus Stand, Kanchipuram, Tamil Nadu',
    placeId: 'out-kanchipuram',
    category: 'Outside Boundary',
    inServiceArea: false,
  },
  {
    name: 'Sriperumbudur SIPCOT',
    city: 'Kanchipuram, Tamil Nadu',
    country: 'India',
    lat: 12.9675,
    lon: 79.9419,
    display_name: 'Sriperumbudur NH48 Corridor, Tamil Nadu',
    placeId: 'out-sriperumbudur',
    category: 'Outside Boundary',
    inServiceArea: false,
  },
  {
    name: 'Puducherry White Town',
    city: 'Puducherry',
    country: 'India',
    lat: 11.934,
    lon: 79.8306,
    display_name: 'Promenade Beach, White Town, Puducherry, India',
    placeId: 'out-puducherry',
    category: 'Outside Boundary',
    inServiceArea: false,
  },
  {
    name: 'Bengaluru MG Road',
    city: 'Bengaluru, Karnataka',
    country: 'India',
    lat: 12.9716,
    lon: 77.5946,
    display_name: 'MG Road Metro Station, Bengaluru, Karnataka, India',
    placeId: 'out-bengaluru',
    category: 'Outside Boundary',
    inServiceArea: false,
  },
];

/**
 * Cryptographically secure N-digit OTP generator (matches Backend/services/ride.service.js)
 */
export function generateOtp(digits = 6): string {
  const buffer = crypto.randomBytes(4);
  const value = buffer.readUInt32BE(0);
  return (value % Math.pow(10, digits)).toString().padStart(digits, '0');
}

/**
 * Haversine formula to compute great-circle distance in kilometers between two coordinates.
 */
export function calculateHaversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return Number((R * c).toFixed(3));
}

/**
 * Formats a coordinate pair into a meaningful Chennai locality label without moving the point.
 */
export function formatChennaiReverseGeocodeLabel(coords: Coordinates): {
  display_name: string;
  locality: string;
  inServiceArea: boolean;
} {
  const inArea = isPointInChennaiServiceArea(coords);
  const allKnown = [...URBAN_LANDMARKS, ...OUTSIDE_CHENNAI_REFERENCE_LOCATIONS];

  let nearest = allKnown[0];
  let minKm = Infinity;
  for (const item of allKnown) {
    const d = calculateHaversineKm(coords, { lat: item.lat, lon: item.lon });
    if (d < minKm) {
      minKm = d;
      nearest = item;
    }
  }

  const coordTag = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
  if (!inArea) {
    if (minKm <= 8) {
      return {
        display_name: `Near ${nearest.name} (${coordTag}) — Outside Chennai Service Boundary`,
        locality: nearest.name,
        inServiceArea: false,
      };
    }
    return {
      display_name: `Pinned Point (${coordTag}) — Outside Chennai Service Boundary`,
      locality: 'Outside Chennai Boundary',
      inServiceArea: false,
    };
  }

  if (minKm <= 0.45) {
    return {
      display_name: `${nearest.display_name} (${coordTag})`,
      locality: nearest.name,
      inServiceArea: true,
    };
  }

  return {
    display_name: `Near ${nearest.name}, Chennai (${coordTag})`,
    locality: nearest.name,
    inServiceArea: true,
  };
}

/**
 * Generates an interpolated road-like route polyline between two coordinates
 */
export function interpolateRouteGeometry(
  origin: Coordinates,
  destination: Coordinates,
  steps = 12
): [number, number][] {
  const points: [number, number][] = [];
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curve = Math.sin(t * Math.PI) * 0.0012;
    const lat = Number((origin.lat + dLat * t + curve).toFixed(6));
    const lon = Number((origin.lon + dLon * t - curve * 0.6).toFixed(6));
    points.push([lat, lon]);
  }
  return points;
}

/**
 * Deterministic fare calculation for all three vehicle types (`car`, `cng`, `motorcycle`)
 */
export function calculateFaresFromDistanceAndDuration(
  distanceMeters: number,
  durationSeconds: number
): {
  fares: Record<VehicleType, number>;
  breakdowns: Record<VehicleType, { baseFare: number; distanceFare: number; timeFare: number; total: number }>;
} {
  const distanceKm = Math.max(0.4, distanceMeters / 1000);
  const durationMin = Math.max(2, durationSeconds / 60);

  // Chennai INR (₹) fare rates
  const pricing: Record<VehicleType, { base: number; perKm: number; perMin: number }> = {
    car: { base: 60, perKm: 18, perMin: 2.5 },
    cng: { base: 35, perKm: 13, perMin: 1.5 },
    motorcycle: { base: 25, perKm: 8, perMin: 1.0 },
  };

  const fares = {} as Record<VehicleType, number>;
  const breakdowns = {} as Record<
    VehicleType,
    { baseFare: number; distanceFare: number; timeFare: number; total: number }
  >;

  (['car', 'cng', 'motorcycle'] as VehicleType[]).forEach((type) => {
    const p = pricing[type];
    const baseFare = Number(p.base.toFixed(2));
    const distanceFare = Number((distanceKm * p.perKm).toFixed(2));
    const timeFare = Number((durationMin * p.perMin).toFixed(2));
    const total = Number((baseFare + distanceFare + timeFare).toFixed(2));
    fares[type] = total;
    breakdowns[type] = { baseFare, distanceFare, timeFare, total };
  });

  return { fares, breakdowns };
}

/**
 * Explainable Multi-Factor Driver Matching Engine
 *
 * Weights:
 * - Distance Weight (W_d): 0.45 (Proximity within D_max = 8.0 km for Chennai metro)
 * - Rating Weight (W_r): 0.25 (Service quality on 1.0 - 5.0 scale)
 * - Historical Reliability (W_c): 0.20 (Completed / Assigned rides ratio)
 * - Vehicle Compatibility (W_v): 0.10 (1.0 if exact match, 0.5 if upgraded category)
 */
export function rankCaptainsExplainably(
  captains: CaptainRecord[],
  pickupCoords: Coordinates,
  requestedVehicle?: VehicleType,
  maxRadiusKm = 25.0,
  distanceMeters = 5000,
  durationSeconds = 720
): MatchExplanation[] {
  const D_MAX = 8.0; // Normalization reference radius in km
  const W_d = 0.45;
  const W_r = 0.25;
  const W_c = 0.20;
  const W_v = 0.10;

  const eligible = captains.filter((c) => c.status === 'active');
  const baseFares = calculateFaresFromDistanceAndDuration(distanceMeters, durationSeconds).fares;

  const ranked: MatchExplanation[] = [];

  for (const captain of eligible) {
    const capCoords: Coordinates = {
      lon: captain.location?.coordinates?.[0] ?? CHENNAI_MAP_CONFIG.defaultCenter.lon,
      lat: captain.location?.coordinates?.[1] ?? CHENNAI_MAP_CONFIG.defaultCenter.lat,
    };

    const distanceKm = calculateHaversineKm(pickupCoords, capCoords);
    if (distanceKm > maxRadiusKm) {
      continue;
    }

    // Vehicle compatibility check: exact match = 1.0, car upgrading cng = 0.5, motorcycle/cng cannot fulfill car
    const capType = captain.vehicle.vehicleType;
    let sVehicle = 1.0;
    if (requestedVehicle) {
      if (capType === requestedVehicle) {
        sVehicle = 1.0;
      } else if (capType === 'car' && requestedVehicle === 'cng') {
        sVehicle = 0.5; // Car upgrade for Auto request
      } else {
        sVehicle = 0.0; // Incompatible tier (e.g. motorcycle cannot fulfill Car or Auto)
      }
    }

    // Individual driver pricing variation based on vehicle model, efficiency & rating
    const tierBaseFare = baseFares[capType] || baseFares['car'];
    let driverMultiplier = 1.0;
    if (captain.fullname.firstname === 'Marcus') {
      driverMultiplier = 1.08; // Hybrid Camry Luxury tier
    } else if (captain.fullname.firstname === 'Elena') {
      driverMultiplier = 0.94; // Economy City Sedan tier
    } else if (captain.fullname.firstname === 'Tariq') {
      driverMultiplier = 1.02; // Auto Standard
    } else if (captain.fullname.firstname === 'Kenji') {
      driverMultiplier = 0.95; // Solo Moto Express
    }
    const driverFare = Number((tierBaseFare * driverMultiplier).toFixed(2));

    // 1. Distance score: max(0, 1 - D / D_max)
    const sDistance = Math.max(0, Math.min(1, 1 - distanceKm / D_MAX));

    // 2. Rating score: (Rating - 1.0) / 4.0
    const rawRating = Math.max(1, Math.min(5, captain.metrics?.rating ?? 4.8));
    const sRating = (rawRating - 1.0) / 4.0;

    // 3. Reliability score: Completed / Assigned
    const completed = captain.metrics?.completedRides ?? 10;
    const assigned = Math.max(completed, captain.metrics?.assignedRides ?? 10);
    const sCompletion = assigned > 0 ? Math.min(1, completed / assigned) : 0.95;

    const weightedDistance = Number((sDistance * W_d * 100).toFixed(2));
    const weightedRating = Number((sRating * W_r * 100).toFixed(2));
    const weightedCompletion = Number((sCompletion * W_c * 100).toFixed(2));
    const weightedVehicle = Number((sVehicle * W_v * 100).toFixed(2));

    const finalScore = Number(
      (weightedDistance + weightedRating + weightedCompletion + weightedVehicle).toFixed(1)
    );

    const etaMinutes = Math.max(1, Math.round((distanceKm / 26) * 60 + 1));
    const captainName = `${captain.fullname.firstname} ${captain.fullname.lastname || ''}`.trim();

    ranked.push({
      captainId: captain._id,
      captainName,
      vehicleType: capType,
      vehicleModel: captain.vehicle.model || capType,
      vehicleColor: captain.vehicle.color,
      plate: captain.vehicle.plate,
      rating: rawRating,
      completedRides: completed,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMinutes,
      finalScore,
      driverFare,
      scoreBreakdown: {
        distance: {
          raw: `${distanceKm.toFixed(2)} km`,
          score: Number(sDistance.toFixed(3)),
          weighted: weightedDistance,
        },
        rating: {
          raw: `${rawRating.toFixed(1)} stars`,
          score: Number(sRating.toFixed(3)),
          weighted: weightedRating,
        },
        completion: {
          raw: `${Math.round(sCompletion * 100)}%`,
          score: Number(sCompletion.toFixed(3)),
          weighted: weightedCompletion,
        },
        vehicle: {
          raw: capType === requestedVehicle ? `${capType} (exact)` : `${capType} (alternative)`,
          score: sVehicle,
          weighted: weightedVehicle,
        },
      },
      explanation: `Matched ${captainName} (₹${driverFare.toFixed(2)}): ${distanceKm.toFixed(1)} km pickup (${weightedDistance.toFixed(1)} pts), ${rawRating.toFixed(1)}★ rating (${weightedRating.toFixed(1)} pts), ${Math.round(sCompletion * 100)}% completion (${weightedCompletion.toFixed(1)} pts), and ${capType} match (${weightedVehicle.toFixed(1)} pts).`,
    });
  }

  return ranked.sort((a, b) => {
    // If a specific vehicle tier was requested, exact matches always come first
    if (requestedVehicle) {
      const aExact = a.vehicleType === requestedVehicle ? 1 : 0;
      const bExact = b.vehicleType === requestedVehicle ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
    }
    return b.finalScore - a.finalScore;
  });
}

/**
 * Validates ride state transitions strictly
 */
export function isValidRideTransition(from: RideStatus, to: RideStatus): boolean {
  const allowed: Record<RideStatus, RideStatus[]> = {
    pending: ['accepted', 'cancelled'],
    accepted: ['ongoing', 'cancelled'],
    ongoing: ['completed'],
    completed: [],
    cancelled: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

/**
 * Strips password and sensitive fields from User/Captain/Ride objects
 */
export function sanitizeUser(user: UserRecord): Omit<UserRecord, 'password'> {
  const { password: _p, ...rest } = user;
  return rest;
}

export function sanitizeCaptain(captain: CaptainRecord): Omit<CaptainRecord, 'password'> {
  const { password: _p, ...rest } = captain;
  return rest;
}

export function sanitizeRideForRole(ride: RideRecord, role: UserRole): RideRecord {
  const clone: RideRecord = JSON.parse(JSON.stringify(ride));
  if (typeof clone.user === 'object' && clone.user) {
    delete clone.user.password;
  }
  if (typeof clone.captain === 'object' && clone.captain) {
    delete clone.captain.password;
  }
  // Never expose OTP to captains via API or Socket responses; captain must obtain OTP from rider
  if (role === 'captain') {
    delete clone.otp;
  }
  return clone;
}

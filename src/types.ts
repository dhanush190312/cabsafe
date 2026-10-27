import type {
  UserRecord,
  CaptainRecord,
  RideRecord,
  LandmarkSuggestion,
  Coordinates,
  VehicleType,
  MatchExplanation,
  ServiceAreaValidationResult,
} from './server/domain';
import {
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_SERVICE_AREA_METADATA,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
} from './config/chennaiServiceArea';

export {
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_SERVICE_AREA_METADATA,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
};

export type {
  UserRecord,
  CaptainRecord,
  RideRecord,
  LandmarkSuggestion,
  Coordinates,
  VehicleType,
  MatchExplanation,
  ServiceAreaValidationResult,
};

export type WorkspaceTab = 'passenger' | 'captain' | 'admin' | 'audit';

export interface FareEstimateResponse {
  car: number;
  cng: number;
  motorcycle: number;
  fares: Record<VehicleType, number>;
  breakdowns: Record<
    VehicleType,
    { baseFare: number; distanceFare: number; timeFare: number; total: number }
  >;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  originCoords: Coordinates;
  destinationCoords: Coordinates;
  routeGeometry: [number, number][];
  dataSource: 'live_osm' | 'fallback_geodata';
  candidateRankings: MatchExplanation[];
  serviceAreaStatus?: string;
}

export const STORAGE_KEYS = {
  USER_TOKEN: 'cabsafe_user_token',
  CAPTAIN_TOKEN: 'cabsafe_captain_token',
  LEGACY_TOKEN: 'token',
  LEGACY_USER_TYPE: 'userType',
};

export function getStoredToken(role: 'user' | 'captain'): string | null {
  const key = role === 'user' ? STORAGE_KEYS.USER_TOKEN : STORAGE_KEYS.CAPTAIN_TOKEN;
  return localStorage.getItem(key);
}

export function setStoredToken(role: 'user' | 'captain', token: string) {
  const key = role === 'user' ? STORAGE_KEYS.USER_TOKEN : STORAGE_KEYS.CAPTAIN_TOKEN;
  localStorage.setItem(key, token);
  localStorage.setItem(STORAGE_KEYS.LEGACY_TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.LEGACY_USER_TYPE, role);
}

export function clearStoredToken(role: 'user' | 'captain') {
  const key = role === 'user' ? STORAGE_KEYS.USER_TOKEN : STORAGE_KEYS.CAPTAIN_TOKEN;
  localStorage.removeItem(key);
  if (localStorage.getItem(STORAGE_KEYS.LEGACY_USER_TYPE) === role) {
    localStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_USER_TYPE);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    role?: 'user' | 'captain';
    tokenOverride?: string | null;
  } = {}
): Promise<T> {
  const { method = 'GET', body, role, tokenOverride } = options;
  const token =
    tokenOverride !== undefined
      ? tokenOverride
      : role
        ? getStoredToken(role)
        : localStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errMessage =
      typeof data === 'object' && data !== null
        ? (data as { error?: string; message?: string; errors?: Array<{ msg: string }> }).error ||
          (data as { message?: string }).message ||
          (data as { errors?: Array<{ msg: string }> }).errors?.[0]?.msg ||
          `Request failed (${response.status})`
        : `Request failed (${response.status})`;
    const error = new Error(errMessage) as Error & {
      status?: number;
      code?: string;
      payload?: unknown;
    };
    error.status = response.status;
    error.code =
      typeof data === 'object' && data !== null ? (data as { code?: string }).code : undefined;
    error.payload = data;
    throw error;
  }

  return data as T;
}

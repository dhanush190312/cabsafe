import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  LogOut,
  User as UserIcon,
  History,
  Star,
  X,
  Check,
  Car,
  Bike,
  Zap,
  ShieldCheck,
  AlertCircle,
  LocateFixed,
  Search,
  ArrowLeft,
  ArrowUpDown,
  ChevronsRight,
  Users,
  Compass,
  MessageSquare,
  Scale,
} from 'lucide-react';
import type {
  UserRecord,
  CaptainRecord,
  RideRecord,
  LandmarkSuggestion,
  FareEstimateResponse,
  VehicleType,
  Coordinates,
  MatchExplanation,
} from '../types';
import {
  apiRequest,
  setStoredToken,
  clearStoredToken,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
} from '../types';
import { LiveMap } from './LiveMap';
import { TopDownCarSvg } from './TopDownCarSvg';

interface PassengerAppProps {
  user: Omit<UserRecord, 'password'> | null;
  setUser: (u: Omit<UserRecord, 'password'> | null) => void;
  activeRide: RideRecord | null;
  setActiveRide: (r: RideRecord | null) => void;
  fleetCaptains: Array<Omit<CaptainRecord, 'password'>>;
  captainLiveCoords: Coordinates | null;
  captainLastUpdatedAt?: string | null;
  onFarePreviewChange?: (fareData: FareEstimateResponse | null) => void;
  onSelectedCandidateChange?: (cand: MatchExplanation | null) => void;
  onRefreshState: () => Promise<void>;
}

/**
 * Pre-booking UI stages on the single Chennai map screen:
 * - 'home': 01 · Home Map (Interactive dark Chennai map + "Where do you want to go?" + dual location card)
 * - 'search': 02 · Choose Destination (Debounced Chennai search + editable pickup/destination + map tap)
 * - 'route': 03 · Confirm Pickup & Route (Map route polyline + distance/duration + adjust pickup pin)
 * - 'vehicle': 04 · Select a Ride (Tall reference cards for CabSafe Go / Auto / Moto + top-down vehicle spec view)
 *
 * Server-driven active ride stages (05 Finding Driver -> 06 Driver Assigned -> 07 Trip in Progress -> 08 Completed & Rate)
 * automatically take precedence when `activeRide` or `completedRideToRate` is present.
 */
type PreBookingStage = 'home' | 'search' | 'route' | 'vehicle';

export const PassengerApp: React.FC<PassengerAppProps> = ({
  user,
  setUser,
  activeRide,
  setActiveRide,
  fleetCaptains,
  captainLiveCoords,
  captainLastUpdatedAt,
  onFarePreviewChange,
  onSelectedCandidateChange,
  onRefreshState,
}) => {
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('alex.passenger@cabsafe.demo');
  const [password, setPassword] = useState('password123');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Chennai Booking flow state — starts empty so PICKUP and DROPOFF pins appear only after user selection
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coordinates | null>(null);
  const [activeField, setActiveField] = useState<'pickup' | 'destination'>('pickup');
  const [suggestions, setSuggestions] = useState<LandmarkSuggestion[]>([]);
  const [landmarks, setLandmarks] = useState<LandmarkSuggestion[]>([]);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<FareEstimateResponse | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('car');
  const [selectedCaptainId, setSelectedCaptainId] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<PreBookingStage>('home');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [gpsStatusNotice, setGpsStatusNotice] = useState<string | null>(null);

  const allCandidates = fareEstimate?.candidateRankings || [];
  const tierMatchingDrivers = allCandidates.filter((c) => c.vehicleType === selectedVehicle);
  const activeCandidate =
    (selectedCaptainId && allCandidates.find((c) => c.captainId === selectedCaptainId)) ||
    tierMatchingDrivers[0] ||
    allCandidates[0] ||
    null;

  useEffect(() => {
    onSelectedCandidateChange?.(activeCandidate);
  }, [activeCandidate, onSelectedCandidateChange]);

  // Drawers & Post-Ride Modals
  const [drawer, setDrawer] = useState<'none' | 'history' | 'profile'>('none');
  const [rideHistory, setRideHistory] = useState<RideRecord[]>([]);
  const [completedRideToRate, setCompletedRideToRate] = useState<RideRecord | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [ratingFeedback, setRatingFeedback] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash' | 'Wallet'>('Card');
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  // Load Chennai landmarks & recent ride history once authenticated
  useEffect(() => {
    apiRequest<LandmarkSuggestion[]>('/maps/landmarks')
      .then((list) => {
        setLandmarks(list);
        if (suggestions.length === 0) setSuggestions(list.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<RideRecord[]>('/rides/history', { role: 'user' })
      .then((list) => setRideHistory(list))
      .catch(() => {});
  }, [user, activeRide?.status]);

  // 300ms Debounced Chennai-biased autocomplete when user types in pickup or destination
  useEffect(() => {
    if (!user || !activeField) return;
    const query = activeField === 'pickup' ? pickup : destination;
    const isExactLandmark = landmarks.some((l) => l.display_name === query.trim());
    if (query.trim().length < 2 || isExactLandmark) {
      setSuggestions(landmarks.slice(0, 10));
      setSearchingSuggestions(false);
      return;
    }
    setSearchingSuggestions(true);
    const timer = setTimeout(() => {
      apiRequest<LandmarkSuggestion[]>(
        `/maps/get-suggestions?input=${encodeURIComponent(query)}`,
        { role: 'user' }
      )
        .then((res) => setSuggestions(res))
        .catch(() => setSuggestions(landmarks.slice(0, 10)))
        .finally(() => setSearchingSuggestions(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [pickup, destination, activeField, user, landmarks]);

  // Sync profile fields when user loads
  useEffect(() => {
    if (user) {
      setFirstName(user.fullname.firstname);
      setLastName(user.fullname.lastname || '');
      setPhone(user.phone || '+91 98401 23410');
    }
  }, [user]);

  // Detect ride completion (08 · Trip Completed) to show receipt & rating sheet
  useEffect(() => {
    if (activeRide && activeRide.status === 'completed' && !activeRide.userRating) {
      setCompletedRideToRate(activeRide);
    }
  }, [activeRide]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
          '/users/login',
          {
            method: 'POST',
            body: { email, password },
          }
        );
        setStoredToken('user', res.token);
        setUser(res.user);
      } else {
        const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
          '/users/register',
          {
            method: 'POST',
            body: {
              fullname: { firstname: firstName, lastname: lastName },
              email,
              phone,
              password,
            },
          }
        );
        setStoredToken('user', res.token);
        setUser(res.user);
      }
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDemoPassengerLogin = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
        '/users/login',
        {
          method: 'POST',
          body: { email: 'alex.passenger@cabsafe.demo', password: 'password123' },
        }
      );
      setStoredToken('user', res.token);
      setUser(res.user);
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/users/logout', { method: 'POST', role: 'user' });
    } catch {
      // Ignore network errors on logout
    }
    clearStoredToken('user');
    setUser(null);
    setActiveRide(null);
  };

  const handleSwapLocations = () => {
    const prevPickup = pickup;
    const prevPickupCoords = pickupCoords;
    setPickup(destination);
    setPickupCoords(destinationCoords);
    setDestination(prevPickup);
    setDestinationCoords(prevPickupCoords);
    setFareEstimate(null);
    setBookingError(null);
  };

  /**
   * Requests route & fare estimate from the backend and transitions to Step 03 (`route`) or Step 04 (`vehicle`).
   */
  const handleFindTrip = async (
    targetStage: PreBookingStage = 'route',
    overridePickup?: string,
    overridePickupCoords?: Coordinates | null,
    overrideDest?: string,
    overrideDestCoords?: Coordinates | null
  ) => {
    const effectivePickup = overridePickup ?? pickup;
    const effectivePickupCoords = overridePickupCoords ?? pickupCoords;
    const effectiveDest = overrideDest ?? destination;
    const effectiveDestCoords = overrideDestCoords ?? destinationCoords;

    if (!effectivePickup.trim() && !effectiveDest.trim()) {
      setBookingError('Please choose your pick-up and drop-off locations in Chennai first.');
      return;
    }
    if (!effectivePickup.trim()) {
      setActiveField('pickup');
      setBookingError('Please select a pick-up location in Chennai.');
      return;
    }
    if (!effectiveDest.trim()) {
      setActiveField('destination');
      setBookingError('Please select a drop-off destination in Chennai.');
      return;
    }
    if (effectivePickup.trim().toLowerCase() === effectiveDest.trim().toLowerCase()) {
      setBookingError('Pickup and destination cannot be the same location.');
      return;
    }

    if (effectivePickupCoords && effectiveDestCoords) {
      const check = validateChennaiTripEndpoints(effectivePickupCoords, effectiveDestCoords);
      if (!check.valid) {
        setBookingError(check.message || 'Location is outside the Chennai service area.');
        return;
      }
    }

    setBookingError(null);
    setGpsStatusNotice(null);
    setBookingBusy(true);
    try {
      const coordParams =
        effectivePickupCoords && effectiveDestCoords
          ? `&pickupLat=${effectivePickupCoords.lat}&pickupLon=${effectivePickupCoords.lon}&destLat=${effectiveDestCoords.lat}&destLon=${effectiveDestCoords.lon}`
          : '';
      const data = await apiRequest<FareEstimateResponse>(
        `/rides/get-fare?pickup=${encodeURIComponent(
          effectivePickup
        )}&destination=${encodeURIComponent(effectiveDest)}${coordParams}`,
        { role: 'user' }
      );
      setPickupCoords(data.originCoords);
      setDestinationCoords(data.destinationCoords);
      setFareEstimate(data);
      const topMatch = data.candidateRankings?.find((c) => c.vehicleType === selectedVehicle) || data.candidateRankings?.[0];
      if (topMatch) {
        setSelectedCaptainId(topMatch.captainId);
      }
      onFarePreviewChange?.(data);
      setBookingStep(targetStage);
    } catch (err) {
      const payload = (err as {
        payload?: { originCoords?: Coordinates; destinationCoords?: Coordinates };
      }).payload;
      if (payload?.originCoords) setPickupCoords(payload.originCoords);
      if (payload?.destinationCoords) setDestinationCoords(payload.destinationCoords);
      setFareEstimate(null);
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  /**
   * Separately assigns either Pickup or Drop-off when user selects a locality or search suggestion.
   * Only places the corresponding pin marker on the map; once both are chosen, previews the route.
   */
  const handleSelectLocationOption = (
    displayName: string,
    coords: Coordinates,
    isOutside?: boolean,
    explicitTarget?: 'pickup' | 'destination'
  ) => {
    setBookingError(null);
    setGpsStatusNotice(null);

    const targetField: 'pickup' | 'destination' =
      explicitTarget ??
      (bookingStep === 'home'
        ? !pickupCoords
          ? 'pickup'
          : !destinationCoords
            ? 'destination'
            : activeField
        : activeField);

    if (targetField === 'pickup') {
      setPickup(displayName);
      setPickupCoords(coords);
      if (isOutside) {
        setBookingError(
          `Selected pick-up "${displayName}" is outside the supported Chennai operating boundary.`
        );
        return;
      }
      if (destination.trim() && destinationCoords) {
        handleFindTrip('route', displayName, coords, destination, destinationCoords);
      } else {
        setActiveField('destination');
      }
    } else {
      setDestination(displayName);
      setDestinationCoords(coords);
      if (isOutside) {
        setBookingError(
          `Selected drop-off "${displayName}" is outside the supported Chennai operating boundary.`
        );
        return;
      }
      if (pickup.trim() && pickupCoords) {
        handleFindTrip('route', pickup, pickupCoords, displayName, coords);
      } else {
        setActiveField('pickup');
      }
    }
  };

  /**
   * Handles selecting a point directly on the Chennai map.
   * Never silently moves the passenger's selected coordinates.
   */
  const handleMapClickSelect = async (coords: Coordinates, forceTarget?: 'pickup' | 'destination') => {
    if (activeRide && ['pending', 'accepted', 'ongoing'].includes(activeRide.status)) {
      return;
    }
    const targetField: 'pickup' | 'destination' =
      forceTarget ??
      (bookingStep === 'route'
        ? 'pickup'
        : bookingStep === 'home'
          ? !pickupCoords
            ? 'pickup'
            : !destinationCoords
              ? 'destination'
              : activeField
          : activeField);

    setBookingError(null);
    setGpsStatusNotice(null);
    setFareEstimate(null);

    const inside = isPointInChennaiServiceArea(coords);
    if (targetField === 'pickup') {
      setPickupCoords(coords);
      if (!destinationCoords) setActiveField('destination');
    } else {
      setDestinationCoords(coords);
      if (!pickupCoords) setActiveField('pickup');
    }

    try {
      const rev = await apiRequest<{
        coords: Coordinates;
        display_name: string;
        inServiceArea: boolean;
      }>(`/maps/reverse-geocode?lat=${coords.lat}&lon=${coords.lon}`, {
        role: 'user',
      });
      if (targetField === 'pickup') {
        setPickup(rev.display_name);
        setPickupCoords(rev.coords);
      } else {
        setDestination(rev.display_name);
        setDestinationCoords(rev.coords);
      }
      if (!rev.inServiceArea) {
        setBookingError(
          `Selected ${targetField === 'pickup' ? 'pick-up' : 'drop-off'} point (${coords.lat.toFixed(
            4
          )}, ${coords.lon.toFixed(4)}) is outside the supported Chennai operating boundary.`
        );
      }
    } catch {
      const fallbackLabel = inside
        ? `Chennai Pinned Location (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`
        : `Pinned Point (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(
            4
          )}) — Outside Chennai Service Boundary`;
      if (targetField === 'pickup') {
        setPickup(fallbackLabel);
      } else {
        setDestination(fallbackLabel);
      }
      if (!inside) {
        setBookingError(
          `Selected ${targetField === 'pickup' ? 'pick-up' : 'drop-off'} point (${coords.lat.toFixed(
            4
          )}, ${coords.lon.toFixed(4)}) is outside the supported Chennai operating boundary.`
        );
      }
    }
  };

  /**
   * Current-location support with runtime permission handling and graceful manual fallback.
   */
  const handleUseDeviceGps = () => {
    setBookingError(null);
    setGpsStatusNotice(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusNotice(
        'Device geolocation is unavailable in this environment. Manual Chennai search and map-pin selection remain active.'
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: Coordinates = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
        };
        setPickupCoords(coords);
        const inside = isPointInChennaiServiceArea(coords);
        if (!inside) {
          setPickup(`Device GPS (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`);
          setBookingError(
            `Your current device GPS (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(
              4
            )}) is outside the Chennai operating boundary. Please select a pickup within Chennai.`
          );
          return;
        }
        await handleMapClickSelect(coords, 'pickup');
        setGpsStatusNotice('Pickup set from live device GPS within Chennai.');
      },
      (err) => {
        const reason =
          err.code === 1
            ? 'Location permission denied.'
            : 'Device GPS signal unavailable.';
        setGpsStatusNotice(
          `${reason} Manual Chennai locality search and map-tap selection are ready.`
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 10000 }
    );
  };

  /**
   * Step 04 -> 05: Submits ride request to backend with duplicate-tap lock.
   * Transitions to 05 · Finding Your Driver only when backend returns the created pending ride.
   */
  const handleCreateRide = async () => {
    if (bookingBusy || activeRide) return;
    setBookingError(null);
    setBookingBusy(true);
    try {
      const created = await apiRequest<RideRecord>('/rides/create', {
        method: 'POST',
        role: 'user',
        body: {
          pickup,
          destination,
          pickupCoords,
          destinationCoords,
          vehicleType: selectedVehicle,
          preferredCaptainId: selectedCaptainId || undefined,
        },
      });
      setActiveRide(created);
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide || bookingBusy) return;
    setBookingBusy(true);
    try {
      await apiRequest<RideRecord>('/rides/cancel', {
        method: 'POST',
        role: 'user',
        body: {
          rideId: activeRide._id,
          reason: 'Passenger cancelled request',
        },
      });
      setActiveRide(null);
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleSimulateCaptainAccept = async () => {
    if (!activeRide || bookingBusy) return;
    setBookingBusy(true);
    setBookingError(null);
    try {
      await apiRequest('/admin/simulate-action', {
        method: 'POST',
        body: {
          action: 'accept-ride',
          rideId: activeRide._id,
        },
      });
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleRebookNextCaptain = async () => {
    if (bookingBusy) return;
    setBookingBusy(true);
    setBookingError(null);
    try {
      const p = activeRide?.pickup || pickup;
      const d = activeRide?.destination || destination;
      const pCoords = activeRide?.pickupCoords || pickupCoords;
      const dCoords = activeRide?.destinationCoords || destinationCoords;
      const vType = activeRide?.vehicleType || selectedVehicle;

      const created = await apiRequest<RideRecord>('/rides/create', {
        method: 'POST',
        role: 'user',
        body: {
          pickup: p,
          destination: d,
          pickupCoords: pCoords,
          destinationCoords: dCoords,
          vehicleType: vType,
        },
      });
      setActiveRide(created);
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handlePayAndRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = completedRideToRate || activeRide;
    if (!target || bookingBusy) return;
    setBookingBusy(true);
    try {
      await apiRequest<RideRecord>('/rides/pay', {
        method: 'POST',
        role: 'user',
        body: {
          rideId: target._id,
          paymentMethod,
          rating: ratingValue,
          feedback: ratingFeedback,
        },
      });
      setCompletedRideToRate(null);
      setActiveRide(null);
      setRatingFeedback('');
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const openHistoryDrawer = async () => {
    setDrawer('history');
    try {
      const list = await apiRequest<RideRecord[]>('/rides/history', { role: 'user' });
      setRideHistory(list);
    } catch {
      setRideHistory([]);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSavedMsg(null);
    try {
      const updated = await apiRequest<Omit<UserRecord, 'password'>>('/users/profile', {
        method: 'PUT',
        role: 'user',
        body: { firstname: firstName, lastname: lastName, phone },
      });
      setUser(updated);
      setProfileSavedMsg('Profile saved.');
    } catch (err) {
      setProfileSavedMsg((err as Error).message);
    }
  };

  // ---------------- Unauthenticated Login / Signup View (Royal White & Red Theme) ----------------
  if (!user) {
    return (
      <div className="h-full flex flex-col justify-between p-6 bg-slate-50 text-slate-900 overflow-y-auto">
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight text-slate-900 font-display">
                  CabSafe
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Passenger Executive Mobility · Chennai</p>
            </div>
            <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            {authMode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      First name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Alex"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-red-600 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Last name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Rivera"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-red-600 shadow-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98401 23410"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-red-600 shadow-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Passenger email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.passenger@cabsafe.demo"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-red-600 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-red-600 shadow-sm"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full min-h-[46px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm transition-colors cursor-pointer shadow-md"
            >
              {authBusy
                ? 'Authenticating...'
                : authMode === 'login'
                  ? 'Sign In as Passenger'
                  : 'Create Passenger Account'}
            </button>
          </form>
        </div>

        <div className="pt-4 border-t border-slate-200 space-y-2.5">
          <p className="text-[11px] text-slate-500 text-center">
            Instant Demo Access (Pre-seeded Chennai Passenger Account)
          </p>
          <button
            type="button"
            onClick={handleDemoPassengerLogin}
            disabled={authBusy}
            className="w-full min-h-[44px] rounded-full bg-white hover:bg-slate-100 border border-red-200 text-red-600 font-semibold text-xs transition-colors cursor-pointer shadow-sm"
          >
            One-Click Demo Passenger Login (Alex Rivera)
          </button>
        </div>
      </div>
    );
  }

  // Determine map coordinates
  const mapPickup = activeRide?.pickupCoords || fareEstimate?.originCoords || pickupCoords;
  const mapDest =
    activeRide?.destinationCoords || fareEstimate?.destinationCoords || destinationCoords;
  const mapGeometry = activeRide?.routeGeometry || fareEstimate?.routeGeometry || null;

  const assignedCaptain =
    activeRide &&
    ['accepted', 'ongoing'].includes(activeRide.status) &&
    typeof activeRide.captain === 'object' &&
    activeRide.captain
      ? activeRide.captain
      : null;

  const spotlightCaptain =
    assignedCaptain ||
    fleetCaptains.find((c) => c.vehicle.vehicleType === selectedVehicle) ||
    fleetCaptains[0] ||
    null;

  // Show assigned driver's location only during active rides ('accepted' or 'ongoing')
  const mapCaptainCoords: Coordinates | null = assignedCaptain
    ? captainLiveCoords ||
      (assignedCaptain.location?.coordinates
        ? {
            lon: assignedCaptain.location.coordinates[0],
            lat: assignedCaptain.location.coordinates[1],
          }
        : null)
    : null;

  const lastUpdateTimestamp =
    captainLastUpdatedAt || assignedCaptain?.location?.updatedAt || null;
  const isLocationStale = lastUpdateTimestamp
    ? Date.now() - new Date(lastUpdateTimestamp).getTime() > 120000
    : false;

  const mapHeightClass =
    activeRide || bookingStep === 'route'
      ? 'h-[40%]'
      : bookingStep === 'search'
        ? 'h-[26%]'
        : 'h-[30%]';

  return (
    <div className="relative h-full w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Royal Red & White Top Header Bar */}
      <div className="h-[52px] px-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={openHistoryDrawer}
            aria-label="My Trips"
            title="My Trips & Receipts"
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <History className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-sm text-slate-900 tracking-tight truncate">
                CabSafe
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium truncate">
              {user.fullname.firstname} {user.fullname.lastname || ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout Passenger"
            title="Logout"
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 flex items-center justify-center text-slate-600 hover:text-red-600 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDrawer('profile')}
            aria-label="Passenger Profile"
            title="Passenger Profile"
            className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs flex items-center justify-center shadow-md transition-colors cursor-pointer"
          >
            {user.fullname.firstname.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* Primary Interactive Dark Chennai Map Canvas */}
      <div className={`${mapHeightClass} w-full relative shrink-0 overflow-hidden transition-all duration-200`}>
        <LiveMap
          pickupCoords={mapPickup}
          destinationCoords={mapDest}
          captainCoords={mapCaptainCoords}
          captainLabel={
            assignedCaptain
              ? `${assignedCaptain.fullname.firstname} (${assignedCaptain.vehicle.plate})`
              : undefined
          }
          vehicleType={activeRide?.vehicleType || selectedVehicle}
          routeGeometry={mapGeometry}
          routeDistanceText={
            fareEstimate?.distance?.text ||
            (activeRide?.distance ? `${(activeRide.distance / 1000).toFixed(1)} km` : null)
          }
          routeDurationText={
            fareEstimate?.duration?.text ||
            (activeRide?.duration ? `${Math.ceil(activeRide.duration / 60)} mins` : null)
          }
          showFleetMarkers={false}
          onMapClick={handleMapClickSelect}
          onSelectLandmark={(coords, name) => {
            if (activeField === 'pickup') {
              setPickup(name);
              setPickupCoords(coords);
            } else {
              setDestination(name);
              setDestinationCoords(coords);
            }
          }}
          interactiveHint={
            !activeRide
              ? bookingStep === 'route'
                ? 'Tap map to fine-tune your Chennai pickup pin'
                : !pickupCoords
                  ? 'Tap map or select below to set Pick-up pin'
                  : !destinationCoords
                    ? 'Tap map or select below to set Drop-off pin'
                    : `Tap map to adjust ${activeField === 'pickup' ? 'Pick-up' : 'Drop-off'} in Chennai`
              : undefined
          }
        />


        {/* Floating Current-Location Button on Map */}
        <button
          type="button"
          onClick={handleUseDeviceGps}
          data-testid="use-device-gps-btn"
          title="Use current Chennai GPS location"
          className="absolute bottom-2 right-2.5 z-10 min-h-[32px] px-3 py-1 rounded-full bg-white hover:bg-slate-50 text-red-600 shadow-md border border-slate-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5 text-red-600" />
          <span>GPS</span>
        </button>
      </div>

      {/* Royal Executive Bottom Sheet Area */}
      <div className="flex-1 bg-white border-t border-slate-200 flex flex-col overflow-y-auto no-scrollbar px-3.5 py-2.5">
        {bookingError && (
          <div
            role="alert"
            data-testid="service-area-error-banner"
            className="mb-2 p-2.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2"
          >
            <span>{bookingError}</span>
            <button
              type="button"
              onClick={() => setBookingError(null)}
              aria-label="Dismiss error"
              className="p-1 text-red-500 hover:text-red-800 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {gpsStatusNotice && (
          <div
            role="status"
            data-testid="gps-fallback-notice"
            className="mb-2 p-2 rounded-2xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium flex items-center justify-between gap-2"
          >
            <span>{gpsStatusNotice}</span>
            <button
              type="button"
              onClick={() => setGpsStatusNotice(null)}
              aria-label="Dismiss GPS notice"
              className="p-0.5 text-red-500 hover:text-red-800 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* STAGE 08 · Trip Completed: Confirmed Final Fare, Summary & Rate Driver */}
        {completedRideToRate ? (
          <form onSubmit={handlePayAndRate} className="space-y-3">
            {/* Royal Red Arrival / Completion Header Banner */}
            <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-2xl px-3.5 py-2.5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-100">
                  08 · Trip Completed
                </span>
                <h2 className="text-sm font-extrabold">
                  Final Fare &amp; Rate Your Captain
                </h2>
              </div>
              <span className="font-mono text-base font-extrabold bg-white text-red-700 px-3 py-1 rounded-full tabular-nums shadow-xs">
                ₹{completedRideToRate.fare.toFixed(2)}
              </span>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5 text-xs border border-slate-200">
              <div className="flex justify-between text-slate-500">
                <span>Base Fare (INR)</span>
                <span className="font-mono text-slate-900 font-semibold tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.baseFare.toFixed(2) || '60.00'}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>
                  Distance ({(completedRideToRate.distance / 1000).toFixed(2)} km)
                </span>
                <span className="font-mono text-slate-900 font-semibold tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.distanceFare.toFixed(2) || '95.58'}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>
                  Duration ({Math.max(1, Math.round(completedRideToRate.duration / 60))} mins)
                </span>
                <span className="font-mono text-slate-900 font-semibold tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.timeFare.toFixed(2) || '30.00'}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-red-600">
                <span>Confirmed Final Fare (INR)</span>
                <span className="font-mono tabular-nums text-sm">
                  ₹{completedRideToRate.fare.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Card', 'Cash', 'Wallet'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`min-h-[36px] rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rate Your Captain
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} stars`}
                    onClick={() => setRatingValue(star)}
                    className={`min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                      star <= ratingValue
                        ? 'bg-amber-50 border-amber-300 text-amber-500'
                        : 'bg-white border-slate-200 text-slate-300'
                    }`}
                  >
                    <Star className="w-4 h-4 fill-current" />
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
              placeholder="Optional compliment or trip feedback..."
              className="w-full px-3.5 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-red-600"
            />

            <button
              type="submit"
              disabled={bookingBusy}
              className="w-full min-h-[44px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm transition-colors cursor-pointer shadow-md"
            >
              {bookingBusy ? 'Submitting...' : 'Submit Rating & Return Home'}
            </button>
          </form>
        ) : activeRide && activeRide.status === 'cancelled' && activeRide.cancelledBy === 'captain' ? (
          /* STAGE: Captain Cancelled Notice (Rapido Style with 1-Click Auto Re-Dispatch) */
          <div className="space-y-3 flex-1 flex flex-col justify-between" aria-live="polite">
            <div className="space-y-2.5">
              {/* Alert Header Banner */}
              <div className="bg-gradient-to-r from-amber-600 to-red-600 text-white rounded-[24px] p-4 space-y-1 shadow-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-200 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-100">
                    Trip Cancelled by Captain
                  </span>
                </div>
                <h2 className="text-sm font-extrabold text-white">
                  Captain had to cancel your request
                </h2>
                <p className="text-[11px] text-amber-100/90 leading-tight">
                  {activeRide.cancelReason || 'Captain encountered heavy traffic or an unforeseen delay.'}
                </p>
              </div>

              {/* Assurance & Route Review Card */}
              <div className="bg-white rounded-[24px] p-3.5 border border-slate-200 space-y-3 shadow-lg">
                <div className="bg-emerald-50 rounded-2xl p-2.5 flex items-center gap-2 border border-emerald-200">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-950">
                      ₹0 Cancellation Fee Applied
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      You are never charged when a captain cancels.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-2.5 space-y-1.5 border border-slate-200 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span className="font-semibold truncate">{activeRide.pickup}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Navigation className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span className="font-semibold truncate">{activeRide.destination}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-snug">
                  Would you like us to automatically re-dispatch your trip to the next available top-rated Chennai captain?
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={bookingBusy}
                onClick={handleRebookNextCaptain}
                className="w-full min-h-[46px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>{bookingBusy ? 'Re-dispatching...' : 'Find Another Captain (Auto Re-Dispatch)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveRide(null);
                  setBookingStep('home');
                }}
                className="w-full min-h-[40px] rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Back to Map & Change Trip
              </button>
            </div>
          </div>
        ) : activeRide && activeRide.status === 'pending' ? (
          /* STAGE 05 · Rapido-Style Radar Search & Safe Score Matching (Strictly NO OTP until Captain accepts) */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between" aria-live="polite">
            <div className="space-y-2">
              {/* Compact Dual Location Pill Container */}
              <div className="bg-slate-50 rounded-[20px] p-2 space-y-1.5 border border-slate-200">
                <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2.5 border border-slate-200 shadow-xs">
                  <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <p className="text-[11px] text-slate-800 font-semibold truncate">
                    {activeRide.pickup}
                  </p>
                </div>
                <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2.5 border border-slate-200 shadow-xs">
                  <Navigation className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <p className="text-[11px] text-slate-800 font-semibold truncate">
                    {activeRide.destination}
                  </p>
                </div>
              </div>

              {/* Layered Royal Crimson Search Banner */}
              <div className="pt-0.5">
                <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-t-[24px] px-4 pt-2.5 pb-5 flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-100">
                      05 · Finding Captain
                    </p>
                    <h2 className="text-xs font-extrabold text-white">
                      Connecting with verified Chennai drivers…
                    </h2>
                  </div>
                  <span className="bg-white text-red-700 font-mono text-xs font-extrabold px-3 py-1 rounded-full shrink-0 shadow-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block" />
                    Searching…
                  </span>
                </div>

                {/* Overlapping White Royal Card */}
                <div className="-mt-3 bg-white rounded-[24px] p-3 border border-slate-200 space-y-2.5 shadow-xl">
                  {/* Rapido-Style Radar Sonar Pulse Visual */}
                  <div className="relative py-3 flex flex-col items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <span className="absolute w-20 h-20 rounded-full bg-red-500/15 animate-ping pointer-events-none" />
                      <span className="absolute w-14 h-14 rounded-full bg-red-500/25 animate-pulse pointer-events-none" />
                      <div className="relative w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md">
                        {activeRide.vehicleType === 'car' ? (
                          <Car className="w-5 h-5" />
                        ) : activeRide.vehicleType === 'cng' ? (
                          <Zap className="w-5 h-5" />
                        ) : (
                          <Bike className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-extrabold text-slate-900 tracking-tight text-center">
                      Looking for the best Captain near you…
                    </p>
                    <p className="text-[11px] text-slate-500 text-center max-w-[270px] mt-0.5 leading-snug px-2">
                      {activeRide.matchExplanation?.captainName
                        ? `Request dispatched directly to ${activeRide.matchExplanation.captainName} (${activeRide.matchExplanation.vehicleModel || 'Chennai Captain'}). Waiting for acceptance...`
                        : 'Broadcasting ride request to active verified Chennai captains within 3.5 km.'}
                    </p>
                  </div>

                  {/* Explainable Safe Score Match Card */}
                  <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-900">
                          CabSafe Match Intelligence
                        </span>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                        SafeScore: {activeRide.matchExplanation?.finalScore ? activeRide.matchExplanation.finalScore.toFixed(1) : '96.2'} / 100
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      {activeRide.matchExplanation?.explanation ||
                        'Optimized using 4-factor scoring: Haversine proximity, historical 5-star rating, and 99% trip completion.'}
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
                      <div className="bg-white px-2 py-1 rounded-md border border-slate-200 flex justify-between shadow-2xs">
                        <span className="text-slate-500 font-sans">Proximity (45%):</span>
                        <span className="font-bold text-slate-800">
                          {activeRide.matchExplanation?.distanceKm ? `${activeRide.matchExplanation.distanceKm} km` : '1.2 km'}
                        </span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-md border border-slate-200 flex justify-between shadow-2xs">
                        <span className="text-slate-500 font-sans">Rating (25%):</span>
                        <span className="font-bold text-slate-800">
                          {activeRide.matchExplanation?.rating ? `${activeRide.matchExplanation.rating.toFixed(1)} ★` : '4.9 ★'}
                        </span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-md border border-slate-200 flex justify-between shadow-2xs">
                        <span className="text-slate-500 font-sans">Reliability (20%):</span>
                        <span className="font-bold text-slate-800">99%</span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-md border border-slate-200 flex justify-between shadow-2xs">
                        <span className="text-slate-500 font-sans">Vehicle (10%):</span>
                        <span className="font-bold text-slate-800">100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Tier & Guaranteed Fare Review */}
                  <div className="flex items-center justify-between bg-white rounded-2xl px-3 py-2 border border-slate-200 shadow-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        {activeRide.vehicleType === 'car' ? (
                          <Car className="w-4 h-4" />
                        ) : activeRide.vehicleType === 'cng' ? (
                          <Zap className="w-4 h-4" />
                        ) : (
                          <Bike className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 capitalize">
                          {activeRide.vehicleType === 'car'
                            ? 'CabSafe Go · Sedan (4 Seats)'
                            : activeRide.vehicleType === 'cng'
                              ? 'CabSafe Auto · 3 Seats'
                              : 'CabSafe Moto · 1 Seat'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Fixed Price Guarantee
                        </p>
                      </div>
                    </div>
                    <span className="bg-slate-50 text-slate-900 font-mono text-sm font-extrabold px-3 py-1 rounded-xl tabular-nums border border-slate-200">
                      ₹{activeRide.fare.toFixed(2)}
                    </span>
                  </div>

                  {/* Security Notice: Strictly NO OTP while pending */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5 flex items-start gap-2 text-amber-900">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold">Waiting for Captain Acceptance</p>
                      <p className="text-[10px] text-amber-700 leading-tight">
                        Your Start OTP will be securely generated and revealed once a captain accepts. Never share OTP before meeting your driver.
                      </p>
                    </div>
                  </div>

                  {/* Quick Simulation Bar for convenient testing */}
                  <div className="bg-slate-100 rounded-2xl p-2 flex items-center justify-between gap-2 border border-slate-200">
                    <p className="text-[10px] text-slate-600 truncate">
                      Switch to <strong>Captain App</strong> tab to accept, or:
                    </p>
                    <button
                      type="button"
                      disabled={bookingBusy}
                      onClick={handleSimulateCaptainAccept}
                      className="px-3 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      {bookingBusy ? 'Accepting…' : 'Accept as Captain'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Pill Action Bar */}
            <button
              type="button"
              disabled={bookingBusy}
              onClick={handleCancelRide}
              className="w-full bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-full p-1.5 flex items-center justify-between transition-colors cursor-pointer group shadow-sm"
            >
              <span className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <X className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-slate-700 group-hover:text-red-700">
                {bookingBusy ? 'Cancelling...' : 'Cancel Ride Request'}
              </span>
              <ChevronsRight className="w-4 h-4 text-slate-400 mr-2" />
            </button>
          </div>
        ) : activeRide && ['accepted', 'ongoing'].includes(activeRide.status) ? (
          /* STAGES 06, 07 · Royal White & Red Active Ride Card with Start OTP */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between" aria-live="polite">
            <div className="space-y-2">
              {/* Compact Dual Location Pill Container */}
              <div className="bg-slate-50 rounded-[20px] p-2 space-y-1.5 border border-slate-200">
                <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2.5 border border-slate-200 shadow-xs">
                  <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <p className="text-[11px] text-slate-800 font-semibold truncate">
                    {activeRide.pickup}
                  </p>
                </div>
                <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2.5 border border-slate-200 shadow-xs">
                  <Navigation className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <p className="text-[11px] text-slate-800 font-semibold truncate">
                    {activeRide.destination}
                  </p>
                </div>
              </div>

              {/* Layered Royal Crimson Arrival Banner + Elegant White Driver Card */}
              <div className="pt-0.5">
                <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-t-[24px] px-4 pt-2.5 pb-5 flex items-center justify-between shadow-xs">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-100">
                      {activeRide.status === 'accepted' && '06 · Driver Assigned'}
                      {activeRide.status === 'ongoing' && '07 · Trip in Progress'}
                    </p>
                    <h2 className="text-xs font-extrabold text-white">
                      {activeRide.status === 'accepted' &&
                        `Captain ${assignedCaptain?.fullname.firstname || 'driver'} is arriving`}
                      {activeRide.status === 'ongoing' && 'En route to destination'}
                    </h2>
                  </div>
                  <span className="bg-white text-red-700 font-mono text-xs font-extrabold px-3 py-1 rounded-full shrink-0 shadow-xs">
                    {activeRide.status === 'accepted'
                      ? `${activeRide.matchExplanation?.etaMinutes ?? 2} min away`
                      : isLocationStale
                        ? 'GPS Stale'
                        : 'Live GPS'}
                  </span>
                </div>

                {/* Overlapping White Royal Card */}
                <div className="-mt-3 bg-white rounded-[24px] p-3 border border-slate-200 space-y-2.5 shadow-xl">
                  {/* Driver Pill with White License Plate Badge */}
                  {assignedCaptain ? (
                    <div className="bg-slate-50 rounded-2xl p-2.5 flex items-center justify-between gap-2 border border-slate-200">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
                          {assignedCaptain.fullname.firstname.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-slate-900 truncate">
                            {assignedCaptain.fullname.firstname}{' '}
                            {assignedCaptain.fullname.lastname || ''}
                          </h3>
                          <p className="text-[11px] text-slate-500 truncate">
                            {assignedCaptain.vehicle.color}{' '}
                            {assignedCaptain.vehicle.model || assignedCaptain.vehicle.vehicleType}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block bg-slate-900 text-white font-mono text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow-xs">
                          {assignedCaptain.vehicle.plate}
                        </span>
                        <p className="text-[10px] text-amber-500 font-bold mt-0.5">
                          ★ {assignedCaptain.metrics.rating.toFixed(1)} ·{' '}
                          {assignedCaptain.metrics.completedRides} trips
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Safe Score Verified Pill */}
                  <div className="bg-emerald-50 rounded-xl px-2.5 py-1.5 flex items-center justify-between border border-emerald-200 text-[10px]">
                    <span className="flex items-center gap-1 font-semibold text-emerald-900">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verified SafeScore Match</span>
                    </span>
                    <span className="font-mono font-extrabold text-emerald-700">
                      {activeRide.matchExplanation?.finalScore ? activeRide.matchExplanation.finalScore.toFixed(1) : '96.2'} / 100
                    </span>
                  </div>

                  {/* 6-Digit Pickup Verification OTP: STRICTLY ONLY REVEALED WHEN ACCEPTED */}
                  {activeRide.status === 'accepted' && activeRide.otp && (
                    <div className="bg-red-50 border-2 border-red-500/30 rounded-2xl p-2.5 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-700">
                            Pickup Verification OTP
                          </p>
                          <p className="text-[9px] text-slate-500">
                            Share with Captain upon arrival
                          </p>
                        </div>
                      </div>
                      <span
                        data-testid="passenger-otp-code"
                        className="font-mono text-xl font-extrabold tracking-widest text-red-600 tabular-nums bg-white px-3.5 py-1 rounded-xl border border-red-200 shadow-xs"
                      >
                        {activeRide.otp}
                      </span>
                    </div>
                  )}

                  {/* Price Row + Top-Down Vehicle Graphic */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-3 py-2 border border-slate-200">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Car className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 capitalize">
                              {activeRide.vehicleType === 'car'
                                ? 'CabSafe Go · Sedan'
                                : activeRide.vehicleType === 'cng'
                                  ? 'CabSafe Auto · 3 Seat'
                                  : 'CabSafe Moto · 1 Seat'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              98% safety rating · INR
                            </p>
                          </div>
                        </div>
                        <span className="bg-white text-slate-900 font-mono text-sm font-extrabold px-3 py-1 rounded-xl tabular-nums border border-slate-200 shadow-xs">
                          ₹{activeRide.fare.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 hidden xs:flex items-center justify-center">
                      <TopDownCarSvg
                        vehicleType={activeRide.vehicleType}
                        className="w-12 h-24"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Pill Action Bar */}
            {activeRide.status === 'accepted' ? (
              <button
                type="button"
                disabled={bookingBusy}
                onClick={handleCancelRide}
                className="w-full bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-full p-1.5 flex items-center justify-between transition-colors cursor-pointer group shadow-sm"
              >
                <span className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <X className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-slate-700 group-hover:text-red-700">
                  {bookingBusy ? 'Cancelling...' : 'Cancel Ride Request'}
                </span>
                <ChevronsRight className="w-4 h-4 text-slate-400 mr-2" />
              </button>
            ) : (
              <div className="w-full bg-slate-50 border border-slate-200 rounded-full p-1.5 flex items-center justify-between shadow-sm">
                <span className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-slate-800">
                  Live Trip Telemetry Active
                </span>
                <ChevronsRight className="w-4 h-4 text-red-600 mr-2" />
              </div>
            )}
          </div>
        ) : bookingStep === 'home' ? (
          /* STAGE 01 · Home Map: Royal White & Red ("Where do you want to go?", Dual Location Cards) */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              {/* Editorial Display Heading + "Where to?" Trigger */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight text-slate-900 font-display leading-tight">
                    Where do you
                    <br />
                    want to go?
                  </h1>
                </div>
                <button
                  type="button"
                  data-testid="where-to-trigger"
                  onClick={() => {
                    setActiveField(!pickupCoords ? 'pickup' : 'destination');
                    setBookingStep('search');
                  }}
                  className="px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Where to?</span>
                </button>
              </div>

              {/* Dual Stacked Location Card with Center Swap Button */}
              <div className="relative bg-slate-50 rounded-[22px] p-2 space-y-1.5 border border-slate-200">
                <div
                  onClick={() => {
                    setActiveField('pickup');
                    setBookingStep('search');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveField('pickup');
                      setBookingStep('search');
                    }
                  }}
                  data-testid="home-pickup-pill"
                  className={`w-full bg-white hover:bg-slate-100 rounded-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer border shadow-xs ${
                    !pickupCoords && activeField === 'pickup'
                      ? 'border-red-500'
                      : 'border-slate-200'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      Pick-up Location
                    </p>
                    <p
                      className={`text-xs font-semibold truncate ${
                        pickup ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {pickup || 'Add a pick-up location'}
                    </p>
                  </div>
                </div>

                {/* Center Overlapping Swap Button */}
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  aria-label="Swap pickup and destination"
                  title="Swap pickup and destination"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>

                <div
                  onClick={() => {
                    setActiveField('destination');
                    setBookingStep('search');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveField('destination');
                      setBookingStep('search');
                    }
                  }}
                  data-testid="home-destination-pill"
                  className={`w-full bg-white hover:bg-slate-100 rounded-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer border shadow-xs ${
                    pickupCoords && !destinationCoords
                      ? 'border-red-500'
                      : 'border-slate-200'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <Navigation className="w-3.5 h-3.5 text-red-600" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
                      Destination
                    </p>
                    <p
                      className={`text-xs font-semibold truncate ${
                        destination ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {destination || 'Add your destination'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mode Pill Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveField('pickup');
                    setBookingStep('search');
                  }}
                  className={`min-h-[34px] rounded-full font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors ${
                    !pickupCoords
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-red-600 border border-red-200'
                  }`}
                >
                  {pickupCoords ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  <span>{pickupCoords ? 'Pick-up Set' : '1. Set Pick-up'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveField('destination');
                    setBookingStep('search');
                  }}
                  className={`min-h-[34px] rounded-full font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    pickupCoords && !destinationCoords
                      ? 'bg-red-600 text-white shadow-xs'
                      : destinationCoords
                        ? 'bg-white text-red-600 border border-red-200'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {destinationCoords ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                  <span>{destinationCoords ? 'Drop-off Set' : '2. Set Drop-off'}</span>
                </button>
              </div>

              {/* Quick Chennai Localities */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {!pickupCoords
                      ? 'Select Pick-up Locality in Chennai'
                      : !destinationCoords
                        ? 'Select Drop-off Locality in Chennai'
                        : 'Saved Chennai Localities'}
                  </p>
                  <span className="text-[10px] font-mono text-red-600 font-bold">
                    {!pickupCoords ? 'Step 1 of 2' : !destinationCoords ? 'Step 2 of 2' : 'Ready'}
                  </span>
                </div>
                <div className="space-y-1">
                  {landmarks.slice(0, 2).map((item) => (
                    <button
                      key={item.placeId}
                      type="button"
                      onClick={() => {
                        const coords = { lat: item.lat, lon: item.lon };
                        handleSelectLocationOption(
                          item.display_name,
                          coords,
                          item.inServiceArea === false
                        );
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-red-50/60 border border-slate-200 hover:border-red-200 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {item.display_name}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-red-600 font-bold shrink-0">
                        {!pickupCoords ? 'Set Pick-up' : 'Set Drop-off'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={bookingBusy}
              onClick={() => {
                if (!pickupCoords) {
                  setActiveField('pickup');
                  setBookingStep('search');
                } else if (!destinationCoords) {
                  setActiveField('destination');
                  setBookingStep('search');
                } else {
                  handleFindTrip('route');
                }
              }}
              className="w-full min-h-[42px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs transition-colors cursor-pointer shadow-md"
            >
              {bookingBusy
                ? 'Loading Route...'
                : !pickupCoords
                  ? 'Choose Pick-up Location'
                  : !destinationCoords
                    ? 'Choose Drop-off Location'
                    : 'Preview Current Route & Fares'}
            </button>
          </div>
        ) : bookingStep === 'search' ? (
          /* STAGE 02 · Pick-up vs Drop-off Search (Distinct Steps 1 & 2) */
          <div className="space-y-2 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBookingStep('home')}
                  className="text-xs font-bold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Map</span>
                </button>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  {activeField === 'pickup' ? 'Step 1 of 2 · Set Pick-up' : 'Step 2 of 2 · Set Drop-off'}
                </span>
              </div>

              {/* Step Clarification Heading */}
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">
                  {activeField === 'pickup'
                    ? 'Where should we pick you up?'
                    : 'Where is your drop-off destination?'}
                </h2>
                <p className="text-[10px] text-slate-500">
                  {activeField === 'pickup'
                    ? 'Step 1: Set your pick-up point in Chennai'
                    : `Step 2: Destination from ${pickup ? pickup.split(',')[0] : 'pick-up'}`}
                </p>
              </div>

              {/* Step Switcher Tabs (Pick-up vs Drop-off) */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveField('pickup')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer truncate flex items-center justify-center gap-1.5 ${
                    activeField === 'pickup'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    1. Pick-up: {pickup ? pickup.split(',')[0] : 'Choose'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField('destination')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer truncate flex items-center justify-center gap-1.5 ${
                    activeField === 'destination'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Navigation className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    2. Drop-off: {destination ? destination.split(',')[0] : 'Choose'}
                  </span>
                </button>
              </div>

              {/* Active Search Field Input Box */}
              <div className="relative bg-slate-50 rounded-[20px] p-2 space-y-1.5 border border-slate-200 shadow-xs">
                {activeField === 'pickup' ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold text-red-600 uppercase">
                        Pick-up Address (Step 1)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Chennai Area</span>
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-red-600 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        autoFocus
                        aria-label="Pickup location"
                        value={pickup}
                        onChange={(e) => {
                          setPickup(e.target.value);
                          setPickupCoords(null);
                          setFareEstimate(null);
                        }}
                        placeholder="Search Chennai pick-up locality (e.g. T. Nagar, Central)"
                        className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-red-500 ring-2 ring-red-500/20 text-xs font-medium text-slate-900 focus:outline-none shadow-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold text-red-600 uppercase">
                        Drop-off Destination (Step 2)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Chennai Area</span>
                    </div>
                    <div className="relative">
                      <Navigation className="w-4 h-4 text-red-600 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        autoFocus
                        aria-label="Destination location"
                        value={destination}
                        onChange={(e) => {
                          setDestination(e.target.value);
                          setDestinationCoords(null);
                          setFareEstimate(null);
                        }}
                        placeholder="Search Chennai drop-off (e.g. Anna Nagar, OMR, Airport)"
                        className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-red-500 ring-2 ring-red-500/20 text-xs font-medium text-slate-900 focus:outline-none shadow-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestions List */}
              <div className="pt-0.5">
                <div className="flex items-center justify-between mb-1 px-1">
                  <p className="text-[11px] font-bold text-slate-700">
                    {activeField === 'pickup'
                      ? 'Suggested Chennai Pick-up Hubs'
                      : 'Popular Chennai Drop-off Destinations'}
                  </p>
                  <span className="text-[10px] font-mono text-red-600 font-bold">
                    {searchingSuggestions ? 'Searching…' : 'Chennai Fast-Select'}
                  </span>
                </div>
                <div className="space-y-1 max-h-[145px] overflow-y-auto no-scrollbar">
                  {suggestions.map((item) => {
                    const isOutside = item.inServiceArea === false;
                    return (
                      <button
                        key={item.placeId}
                        type="button"
                        onClick={() => {
                          const coords = { lat: item.lat, lon: item.lon };
                          handleSelectLocationOption(
                            item.display_name,
                            coords,
                            isOutside,
                            activeField
                          );
                          // Seamless transition from Step 1 to Step 2
                          if (activeField === 'pickup' && !destinationCoords) {
                            setActiveField('destination');
                          }
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-red-50/70 border border-slate-100 hover:border-red-200 transition-colors flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {item.display_name}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-mono shrink-0 px-2 py-0.5 rounded-full ${
                            isOutside
                              ? 'text-red-700 bg-red-100 font-bold'
                              : 'text-slate-600 bg-white border border-slate-200'
                          }`}
                        >
                          {activeField === 'pickup' ? 'Select Pick-up' : 'Select Drop-off'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={bookingBusy || (activeField === 'pickup' && !pickup) || (activeField === 'destination' && !destination)}
              onClick={() => {
                if (activeField === 'pickup' && !destinationCoords) {
                  setActiveField('destination');
                } else {
                  handleFindTrip('route');
                }
              }}
              className="w-full min-h-[42px] rounded-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-extrabold text-sm transition-colors cursor-pointer shadow-md"
            >
              {bookingBusy
                ? 'Validating Chennai Route...'
                : activeField === 'pickup' && !destinationCoords
                  ? 'Continue to Step 2: Set Drop-off →'
                  : 'Confirm Route & Choose Ride →'}
            </button>
          </div>
        ) : bookingStep === 'route' && fareEstimate ? (
          /* STAGE 03 · Confirm Pickup & Route Sheet: Royal White & Red */
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    03 · Confirm Pickup &amp; Route
                  </span>
                  <h2 className="text-base font-extrabold text-slate-900 mt-1">
                    Review Route on Chennai Map
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setBookingStep('search')}
                  className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                >
                  Edit Addresses
                </button>
              </div>

              <div className="bg-slate-50 rounded-[22px] p-3 space-y-2 text-xs border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between font-mono text-red-600 font-bold border-b border-slate-200 pb-2">
                  <span>Estimated Distance: {fareEstimate.distance.text}</span>
                  <span>Duration: {fareEstimate.duration.text}</span>
                </div>
                <div className="bg-white rounded-full px-3 py-2 flex items-center gap-2.5 border border-slate-200 shadow-2xs">
                  <MapPin className="w-4 h-4 text-red-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase text-slate-500">
                      Pickup Pin (Tap map to adjust if needed)
                    </p>
                    <p className="font-semibold text-slate-900 truncate">{pickup}</p>
                  </div>
                </div>
                <div className="bg-white rounded-full px-3 py-2 flex items-center gap-2.5 border border-slate-200 shadow-2xs">
                  <Navigation className="w-4 h-4 text-red-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase text-slate-500">
                      Destination
                    </p>
                    <p className="font-semibold text-slate-900 truncate">{destination}</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBookingStep('vehicle')}
              className="w-full min-h-[44px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm transition-colors cursor-pointer shadow-md"
            >
              Choose a Ride Option
            </button>
          </div>
        ) : (
          /* STAGE 04 · Select a Ride: Live Explainable Match Score + Royal Vehicle Tier Cards */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    04 · Select a Ride
                  </span>
                  <h2 className="text-base font-extrabold text-slate-900 mt-1">Choose a ride</h2>
                  {fareEstimate && (
                    <p className="text-[11px] text-slate-500 font-mono">
                      {fareEstimate.distance.text} · {fareEstimate.duration.text}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBookingStep('route')}
                  className="text-xs font-bold text-slate-600 hover:text-red-600 cursor-pointer transition-colors"
                >
                  Back to Route
                </button>
              </div>

              {/* 3 Tall Side-by-Side Vehicle Tier Cards */}
              {fareEstimate && (
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'car' as VehicleType,
                        title: 'CabSafe Go',
                        subtitle: 'Sedan · 2m',
                        seats: '4',
                        icon: Car,
                      },
                      {
                        id: 'cng' as VehicleType,
                        title: 'CabSafe Auto',
                        subtitle: 'Auto · 3m',
                        seats: '3',
                        icon: Zap,
                      },
                      {
                        id: 'motorcycle' as VehicleType,
                        title: 'CabSafe Moto',
                        subtitle: 'Moto · 1m',
                        seats: '1',
                        icon: Bike,
                      },
                    ] as const
                  ).map((tier) => {
                    const Icon = tier.icon;
                    const active = selectedVehicle === tier.id;
                    const price = fareEstimate.fares[tier.id];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => {
                          setSelectedVehicle(tier.id);
                          // Auto-select the top matching driver for this tier
                          const topMatch = fareEstimate?.candidateRankings?.find((c) => c.vehicleType === tier.id);
                          if (topMatch) {
                            setSelectedCaptainId(topMatch.captainId);
                          }
                        }}
                        className={`p-2.5 rounded-[20px] border text-left flex flex-col justify-between min-h-[112px] transition-all cursor-pointer ${
                          active
                            ? 'bg-red-50/70 border-2 border-red-600 shadow-md ring-1 ring-red-600/30'
                            : 'bg-white border-slate-200 hover:border-red-200 shadow-xs'
                        }`}
                      >
                        <div>
                          <p
                            className={`text-xs font-extrabold truncate ${
                              active ? 'text-red-700' : 'text-slate-900'
                            }`}
                          >
                            {tier.title}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {tier.subtitle}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-slate-600 mt-1.5 font-medium">
                            <Users className={`w-3 h-3 ${active ? 'text-red-600' : 'text-slate-400'}`} />
                            <span>{tier.seats} seat{tier.seats === '1' ? '' : 's'}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/80">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <span className={`font-mono text-xs font-extrabold tabular-nums ${active ? 'text-red-700' : 'text-slate-900'}`}>
                            ₹{price.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* AVAILABLE DRIVERS LIST (SELECT ANY AVAILABLE DRIVER) */}
              {(() => {
                const allCandidates = fareEstimate?.candidateRankings || [];
                // Filter matching drivers for currently selected vehicle tier (1, 3, or 4 seats)
                const tierMatchingDrivers = allCandidates.filter((c) => c.vehicleType === selectedVehicle);
                const otherTierDrivers = allCandidates.filter((c) => c.vehicleType !== selectedVehicle);

                // Auto-bind to matching driver for current tier
                const activeCandidate =
                  (selectedCaptainId && allCandidates.find((c) => c.captainId === selectedCaptainId)) ||
                  tierMatchingDrivers[0] ||
                  allCandidates[0] ||
                  null;

                return (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-red-600" />
                        <span>
                          {selectedVehicle === 'car'
                            ? `Go Sedans (4-Seat): ${tierMatchingDrivers.length} Drivers`
                            : selectedVehicle === 'cng'
                              ? `Auto Fleet (3-Seat): ${tierMatchingDrivers.length} Drivers`
                              : `Moto Express (1-Seat): ${tierMatchingDrivers.length} Drivers`}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">Individual driver pricing</span>
                    </div>

                    {/* Tier-Matching Drivers Cards */}
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-0.5">
                      {tierMatchingDrivers.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center text-xs text-slate-500">
                          Scanning active fleet for {selectedVehicle} drivers nearby...
                        </div>
                      ) : (
                        tierMatchingDrivers.map((cand, idx) => {
                          const isSelected = activeCandidate?.captainId === cand.captainId;
                          const driverCost = cand.driverFare || (fareEstimate ? fareEstimate.fares[cand.vehicleType] : 0);
                          return (
                            <div
                              key={cand.captainId}
                              onClick={() => {
                                setSelectedCaptainId(cand.captainId);
                                setSelectedVehicle(cand.vehicleType);
                              }}
                              className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                isSelected
                                  ? 'bg-red-50/80 border-2 border-red-600 shadow-sm ring-1 ring-red-600/30'
                                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                    isSelected
                                      ? 'bg-red-600 text-white shadow-xs'
                                      : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {cand.captainName.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {cand.captainName}
                                    </p>
                                    <span className="font-mono text-[9px] bg-slate-900 text-white px-1.5 py-0.2 rounded font-bold shrink-0">
                                      {cand.plate}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {cand.vehicleModel || cand.vehicleType} · {cand.distanceKm} km · {cand.etaMinutes}m ETA
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex items-center gap-2">
                                <div className="text-right">
                                  <span className="font-mono text-xs font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full tabular-nums">
                                    ₹{driverCost.toFixed(2)}
                                  </span>
                                  <div className="flex items-center justify-end gap-1 text-[9px] text-amber-500 font-bold mt-0.5">
                                    <span>★ {cand.rating?.toFixed(1) ?? '4.9'}</span>
                                    <span className="text-slate-400">· {idx === 0 ? 'Top Pick' : 'Available'}</span>
                                  </div>
                                </div>
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'border-red-600 bg-red-600 text-white'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Other Fleet Categories Expand / Switch */}
                      {otherTierDrivers.length > 0 && (
                        <div className="pt-1 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                            Other Active Chennai Drivers:
                          </p>
                          <div className="space-y-1">
                            {otherTierDrivers.map((cand) => {
                              const isSelected = activeCandidate?.captainId === cand.captainId;
                              const driverCost = cand.driverFare || (fareEstimate ? fareEstimate.fares[cand.vehicleType] : 0);
                              return (
                                <div
                                  key={cand.captainId}
                                  onClick={() => {
                                    setSelectedCaptainId(cand.captainId);
                                    setSelectedVehicle(cand.vehicleType);
                                  }}
                                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${
                                    isSelected
                                      ? 'bg-red-50/80 border-2 border-red-600 shadow-sm'
                                      : 'bg-slate-50/80 border-slate-200 hover:bg-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                      {cand.captainName.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-slate-800 text-[11px] truncate">
                                        {cand.captainName} ({cand.vehicleType.toUpperCase()})
                                      </p>
                                      <p className="text-[10px] text-slate-400 truncate">
                                        {cand.plate} · {cand.distanceKm} km
                                      </p>
                                    </div>
                                  </div>
                                  <span className="font-mono text-xs font-bold text-slate-700">
                                    ₹{driverCost.toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* LIVE EXPLAINABLE MATCH SCORE & DISPATCH INTELLIGENCE CARD FOR SELECTED DRIVER */}
                    {activeCandidate && (
                      <div className="bg-slate-50 border border-slate-200 rounded-[20px] p-2.5 space-y-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">
                              <Scale className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                                  Selected Driver Match Score
                                </span>
                                <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-mono font-bold">
                                  LIVE
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {activeCandidate.captainName} ({activeCandidate.distanceKm} km · {activeCandidate.etaMinutes}m ETA)
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-base font-extrabold text-red-600 tabular-nums">
                              {activeCandidate.finalScore.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold"> / 100</span>
                          </div>
                        </div>

                        {/* 4 Multi-Factor Score Weight Breakdowns */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                          <div className="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex justify-between items-center shadow-2xs">
                            <span className="text-slate-500 font-sans">Distance (45%):</span>
                            <span className="font-bold text-slate-800">
                              +{activeCandidate.scoreBreakdown.distance.weighted.toFixed(1)}
                            </span>
                          </div>
                          <div className="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex justify-between items-center shadow-2xs">
                            <span className="text-slate-500 font-sans">Rating (25%):</span>
                            <span className="font-bold text-slate-800">
                              +{activeCandidate.scoreBreakdown.rating.weighted.toFixed(1)}
                            </span>
                          </div>
                          <div className="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex justify-between items-center shadow-2xs">
                            <span className="text-slate-500 font-sans">Reliability (20%):</span>
                            <span className="font-bold text-slate-800">
                              +{activeCandidate.scoreBreakdown.completion.weighted.toFixed(1)}
                            </span>
                          </div>
                          <div className="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex justify-between items-center shadow-2xs">
                            <span className="text-slate-500 font-sans">Vehicle (10%):</span>
                            <span className="font-bold text-slate-800">
                              +{activeCandidate.scoreBreakdown.vehicle.weighted.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                          <p className="truncate pr-2 font-medium">
                            {activeCandidate.explanation}
                          </p>
                          <TopDownCarSvg
                            vehicleType={selectedVehicle}
                            className="w-8 h-12 shrink-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <button
              type="button"
              disabled={bookingBusy || !fareEstimate}
              onClick={handleCreateRide}
              className="w-full min-h-[44px] rounded-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-extrabold text-sm transition-colors cursor-pointer shadow-md"
            >
              {bookingBusy ? (
                'Requesting Ride...'
              ) : (() => {
                const cand =
                  fareEstimate?.candidateRankings?.find((c) => c.captainId === selectedCaptainId) ||
                  fareEstimate?.candidateRankings?.find((c) => c.vehicleType === selectedVehicle) ||
                  fareEstimate?.candidateRankings?.[0];
                const driverCost = cand?.driverFare || (fareEstimate ? fareEstimate.fares[selectedVehicle] : 0);
                const tierName =
                  selectedVehicle === 'car'
                    ? 'CabSafe Go'
                    : selectedVehicle === 'cng'
                      ? 'CabSafe Auto'
                      : 'CabSafe Moto';
                return `Confirm ${tierName} ${cand ? `with ${cand.captainName}` : ''} · ₹${driverCost.toFixed(2)}`;
              })()}
            </button>
          </div>
        )}
      </div>

      {/* Slide-Over Drawer: Trip History & Receipts */}
      {drawer === 'history' && (
        <div className="absolute inset-0 z-30 bg-white text-slate-900 flex flex-col shadow-2xl">
          <div className="h-[52px] px-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">My Trips &amp; Receipts</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Trip History"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {rideHistory.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-medium text-slate-500">No trips recorded yet.</p>
              </div>
            ) : (
              rideHistory.map((item) => (
                <div
                  key={item._id}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 text-xs shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-600 uppercase">
                      {item.vehicleType} · {item.status}
                    </span>
                    <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                      ₹{item.fare.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-slate-700 truncate">From: {item.pickup}</p>
                  <p className="text-slate-700 truncate">To: {item.destination}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    <span>
                      {(item.distance / 1000).toFixed(2)} km · {item.paymentMethod} (
                      {item.paymentStatus})
                    </span>
                    {item.userRating ? (
                      <span className="text-amber-500 font-bold">
                        Rated {item.userRating}/5 ★
                      </span>
                    ) : (
                      <span>
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: Passenger Profile Management */}
      {drawer === 'profile' && (
        <div className="absolute inset-0 z-30 bg-white text-slate-900 flex flex-col shadow-2xl">
          <div className="h-[52px] px-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Passenger Profile</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Profile"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSaveProfile} className="p-4 space-y-3.5 text-xs">
            {profileSavedMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-red-600" />
                <span>{profileSavedMsg}</span>
              </div>
            )}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                required
                minLength={3}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email (Verified)</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs cursor-pointer shadow-md transition-colors"
            >
              Save Profile Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

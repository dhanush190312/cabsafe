import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  LogOut,
  History,
  KeyRound,
  CheckCircle2,
  X,
  Check,
  AlertCircle,
  Power,
  Scale,
  Users,
  Compass,
  Star,
  ShieldCheck,
} from 'lucide-react';
import type {
  CaptainRecord,
  RideRecord,
  VehicleType,
  Coordinates,
} from '../types';
import { apiRequest, setStoredToken, clearStoredToken } from '../types';
import { LiveMap } from './LiveMap';
import { TopDownCarSvg } from './TopDownCarSvg';

interface CaptainAppProps {
  captain: Omit<CaptainRecord, 'password'> | null;
  setCaptain: (c: Omit<CaptainRecord, 'password'> | null) => void;
  captainActiveRide: RideRecord | null;
  setCaptainActiveRide: (r: RideRecord | null) => void;
  pendingOffers: RideRecord[];
  setPendingOffers: React.Dispatch<React.SetStateAction<RideRecord[]>>;
  passengerRideOtpHint?: string;
  onRefreshState: () => Promise<void>;
  onStepGps: () => Promise<void>;
}

export const CaptainApp: React.FC<CaptainAppProps> = ({
  captain,
  setCaptain,
  captainActiveRide,
  setCaptainActiveRide,
  pendingOffers,
  setPendingOffers,
  passengerRideOtpHint,
  onRefreshState,
  onStepGps,
}) => {
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('marcus.captain@cabsafe.demo');
  const [password, setPassword] = useState('password123');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleColor, setVehicleColor] = useState('Obsidian Black');
  const [vehiclePlate, setVehiclePlate] = useState('TN-09-CB-8921');
  const [vehicleCapacity, setVehicleCapacity] = useState(4);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [vehicleModel, setVehicleModel] = useState('Toyota Camry Hybrid');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Action & Stage 06 Trip Completion Summary state
  const [otpInput, setOtpInput] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completedTripSummary, setCompletedTripSummary] = useState<RideRecord | null>(null);

  // Drawers
  const [drawer, setDrawer] = useState<'none' | 'history' | 'profile'>('none');
  const [captainHistory, setCaptainHistory] = useState<RideRecord[]>([]);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (captain) {
      setFirstName(captain.fullname.firstname);
      setLastName(captain.fullname.lastname || '');
      setPhone(captain.phone || '+91 98407 01441');
      setVehicleColor(captain.vehicle.color);
      setVehiclePlate(captain.vehicle.plate);
      setVehicleCapacity(captain.vehicle.capacity);
      setVehicleType(captain.vehicle.vehicleType);
      setVehicleModel(captain.vehicle.model || 'Toyota Camry Hybrid');
    }
  }, [captain]);

  const handleCaptainAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const res = await apiRequest<{
          captain: Omit<CaptainRecord, 'password'>;
          token: string;
        }>('/captains/login', {
          method: 'POST',
          body: { email, password },
        });
        setStoredToken('captain', res.token);
        setCaptain(res.captain);
      } else {
        const res = await apiRequest<{
          captain: Omit<CaptainRecord, 'password'>;
          token: string;
        }>('/captains/register', {
          method: 'POST',
          body: {
            fullname: { firstname: firstName, lastname: lastName },
            email,
            phone,
            password,
            vehicle: {
              color: vehicleColor,
              plate: vehiclePlate,
              capacity: Number(vehicleCapacity),
              vehicleType,
              model: vehicleModel,
            },
          },
        });
        setStoredToken('captain', res.token);
        setCaptain(res.captain);
      }
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDemoCaptainLogin = async (demoEmail: string) => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await apiRequest<{
        captain: Omit<CaptainRecord, 'password'>;
        token: string;
      }>('/captains/login', {
        method: 'POST',
        body: { email: demoEmail, password: 'password123' },
      });
      setStoredToken('captain', res.token);
      setCaptain(res.captain);
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/captains/logout', { method: 'POST', role: 'captain' });
    } catch {
      // ignore
    }
    clearStoredToken('captain');
    setCaptain(null);
    setCaptainActiveRide(null);
  };

  const handleToggleOnlineStatus = async () => {
    if (!captain) return;
    const nextStatus = captain.status === 'active' ? 'inactive' : 'active';
    try {
      const updated = await apiRequest<Omit<CaptainRecord, 'password'>>(
        '/captains/status',
        {
          method: 'PATCH',
          role: 'captain',
          body: { status: nextStatus },
        }
      );
      setCaptain(updated);
      await onRefreshState();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    setActionError(null);
    setActionBusy(true);
    setCompletedTripSummary(null);
    try {
      const confirmed = await apiRequest<RideRecord>('/rides/confirm', {
        method: 'POST',
        role: 'captain',
        body: { rideId },
      });
      setCaptainActiveRide(confirmed);
      setPendingOffers((prev) => prev.filter((r) => r._id !== rideId));
      await onRefreshState();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDismissOffer = (rideId: string) => {
    setPendingOffers((prev) => prev.filter((r) => r._id !== rideId));
  };

  const handleVerifyOtpAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captainActiveRide) return;
    setActionError(null);
    setActionBusy(true);
    try {
      const started = await apiRequest<RideRecord>('/rides/start-ride', {
        method: 'POST',
        role: 'captain',
        body: {
          rideId: captainActiveRide._id,
          otp: otpInput.trim(),
        },
      });
      setCaptainActiveRide(started);
      setOtpInput('');
      await onRefreshState();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleFinishRide = async () => {
    if (!captainActiveRide) return;
    setActionError(null);
    setActionBusy(true);
    try {
      const finished = await apiRequest<RideRecord>('/rides/end-ride', {
        method: 'POST',
        role: 'captain',
        body: { rideId: captainActiveRide._id },
      });
      setCaptainActiveRide(null);
      setCompletedTripSummary(finished);
      await onRefreshState();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelRideByCaptain = async () => {
    if (!captainActiveRide) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await apiRequest<RideRecord>('/rides/cancel', {
        method: 'POST',
        role: 'captain',
        body: {
          rideId: captainActiveRide._id,
          reason: 'Captain cancelled before pickup',
        },
      });
      setCaptainActiveRide(null);
      await onRefreshState();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const openHistoryDrawer = async () => {
    setDrawer('history');
    try {
      const list = await apiRequest<RideRecord[]>('/rides/history', {
        role: 'captain',
      });
      setCaptainHistory(list);
    } catch {
      setCaptainHistory([]);
    }
  };

  const handleSaveCaptainProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSavedMsg(null);
    try {
      const updated = await apiRequest<Omit<CaptainRecord, 'password'>>(
        '/captains/profile',
        {
          method: 'PUT',
          role: 'captain',
          body: {
            firstname: firstName,
            lastname: lastName,
            phone,
            vehicle: {
              color: vehicleColor,
              plate: vehiclePlate,
              capacity: Number(vehicleCapacity),
              vehicleType,
              model: vehicleModel,
            },
          },
        }
      );
      setCaptain(updated);
      setProfileSavedMsg('Captain profile & vehicle saved.');
    } catch (err) {
      setProfileSavedMsg((err as Error).message);
    }
  };

  // ---------------- Unauthenticated Captain View ----------------
  if (!captain) {
    return (
      <div className="h-full flex flex-col justify-between p-6 bg-[#0B0D12] text-white overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white font-display">
                CabSafe Captain
              </span>
              <p className="text-xs text-slate-400">Driver Dispatch &amp; Telemetry Console</p>
            </div>
            <div className="flex items-center gap-1 bg-[#181B22] p-1 rounded-full border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#E2FF44] text-[#0B0D12]'
                    : 'text-slate-400 hover:text-white'
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
                    ? 'bg-[#E2FF44] text-[#0B0D12]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Onboard
              </button>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleCaptainAuth} className="space-y-3">
            {authMode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      First name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Marcus"
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Last name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Vance"
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Vehicle Plate (TN)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder="TN-09-CB-8921"
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Vehicle Color
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={vehicleColor}
                      onChange={(e) => setVehicleColor(e.target.value)}
                      placeholder="Obsidian Black"
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Vehicle Type
                    </label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs text-white"
                    >
                      <option value="car">Car (4 seats)</option>
                      <option value="cng">CNG Auto (3 seats)</option>
                      <option value="motorcycle">Moto (1 seat)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Seat Capacity
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={vehicleCapacity}
                      onChange={(e) => setVehicleCapacity(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-xs text-white"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Captain Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              {authBusy
                ? 'Connecting...'
                : authMode === 'login'
                  ? 'Sign In to Captain Console'
                  : 'Register Captain & Vehicle'}
            </button>
          </form>
        </div>

        <div className="pt-3 border-t border-white/10 space-y-2">
          <p className="text-[11px] text-slate-400 text-center">
            Instant Demo Captain Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemoCaptainLogin('marcus.captain@cabsafe.demo')}
              className="min-h-[40px] px-2 rounded-full bg-[#1C1F26] hover:bg-[#252932] border border-[#E2FF44]/40 text-xs font-semibold text-[#E2FF44] cursor-pointer"
            >
              Marcus (Car · 4.94★)
            </button>
            <button
              type="button"
              onClick={() => handleDemoCaptainLogin('tariq.captain@cabsafe.demo')}
              className="min-h-[40px] px-2 rounded-full bg-[#1C1F26] hover:bg-[#252932] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              Tariq (CNG · 4.91★)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Only show incoming ride offers when captain is explicitly Online ('active')
  const visibleOffers = captain.status === 'active' ? pendingOffers : [];
  const primaryOffer = !captainActiveRide && visibleOffers.length > 0 ? visibleOffers[0] : null;
  const activeOrOffer = captainActiveRide || primaryOffer;

  const captainCoords: Coordinates | null = captain.location?.coordinates
    ? { lon: captain.location.coordinates[0], lat: captain.location.coordinates[1] }
    : null;

  return (
    <div className="relative h-full w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Royal Red & White Captain Header */}
      <div className="h-[52px] px-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleToggleOnlineStatus}
            className={`min-h-[34px] px-3 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
              captain.status === 'active'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{captain.status === 'active' ? 'Online' : 'Offline'}</span>
          </button>
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-900 truncate block">
              {captain.fullname.firstname}
            </span>
            <span className="text-[10px] text-red-600 font-mono font-bold">
              {captain.vehicle.plate}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openHistoryDrawer}
            aria-label="Captain Ride History"
            title="Completed Rides"
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout Captain"
            title="Logout"
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 flex items-center justify-center text-slate-600 hover:text-red-600 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDrawer('profile')}
            aria-label="Captain Vehicle Profile"
            title="Vehicle & Profile"
            className="w-9 h-9 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs cursor-pointer"
          >
            {captain.fullname.firstname.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* Primary Interactive Chennai Map Canvas */}
      <div className="h-[38%] w-full relative shrink-0 overflow-hidden">
        <LiveMap
          pickupCoords={activeOrOffer?.pickupCoords || null}
          destinationCoords={activeOrOffer?.destinationCoords || null}
          captainCoords={captainCoords}
          captainLabel={`YOU (${captain.vehicle.plate})`}
          routeGeometry={activeOrOffer?.routeGeometry || null}
          showFleetMarkers={false}
        />
      </div>

      {/* Royal Bottom Sheet */}
      <div className="flex-1 bg-white border-t border-slate-200 flex flex-col overflow-y-auto no-scrollbar px-3.5 py-2.5">
        {actionError && (
          <div
            role="alert"
            className="mb-2.5 p-2.5 rounded-2xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-2"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
              className="p-1 text-red-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* STAGE 06 · Trip Completion Summary Card */}
        {completedTripSummary ? (
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="bg-[#E2FF44] text-[#0B0D12] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider">
                    06 · Trip Completion
                  </span>
                  <h2 className="text-sm font-extrabold">
                    Trip Completed Successfully
                  </h2>
                </div>
                <span className="font-mono text-base font-extrabold bg-[#0B0D12] text-[#E2FF44] px-3 py-1 rounded-full tabular-nums">
                  +₹{completedTripSummary.fare.toFixed(2)}
                </span>
              </div>

              <div className="bg-[#181B22] border border-white/10 rounded-2xl p-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Trip Distance</span>
                  <span className="font-mono font-bold text-white">
                    {(completedTripSummary.distance / 1000).toFixed(2)} km
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Updated Total Earnings (INR)</span>
                  <span className="font-mono font-bold text-[#E2FF44]">
                    ₹{captain.metrics.totalEarnings.toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-white/10 pt-2 space-y-1 text-[11px] text-slate-400">
                  <p className="truncate">From: {completedTripSummary.pickup}</p>
                  <p className="truncate">To: {completedTripSummary.destination}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCompletedTripSummary(null)}
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              Return to Driver Home
            </button>
          </div>
        ) : captainActiveRide ? (
          /* STAGES 03, 04 & 05 · Navigate to Pickup, Verify OTP, and Active Trip */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              {/* Layered Chartreuse Status Banner (Reference Screen 2) */}
              <div className="bg-[#E2FF44] text-[#0B0D12] rounded-t-[24px] px-4 pt-2.5 pb-5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                    {captainActiveRide.status === 'accepted'
                      ? '03 & 04 · Navigate to Pickup & Verify OTP'
                      : '05 · Active Trip'}
                  </span>
                  <h2 className="text-xs font-extrabold">
                    {captainActiveRide.status === 'accepted'
                      ? 'Enter Rider’s 6-Digit OTP'
                      : 'Navigating to Destination'}
                  </h2>
                </div>
                <span className="font-mono text-sm font-extrabold bg-[#0B0D12] text-[#E2FF44] px-3 py-1 rounded-full tabular-nums">
                  ₹{captainActiveRide.fare.toFixed(2)}
                </span>
              </div>

              <div className="-mt-3 bg-[#14171F] rounded-[24px] p-3 border border-white/10 space-y-2.5 shadow-xl">
                <div className="bg-[#252932] rounded-2xl p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-white">
                      Passenger:{' '}
                      {typeof captainActiveRide.user === 'object'
                        ? `${captainActiveRide.user.fullname.firstname} ${
                            captainActiveRide.user.fullname.lastname || ''
                          }`
                        : 'Verified Passenger'}
                    </p>
                    <span className="bg-white text-[#0B0D12] font-mono text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                      {captain.vehicle.plate}
                    </span>
                  </div>
                  <p className="text-slate-300 truncate">
                    Pickup: {captainActiveRide.pickup}
                  </p>
                  <p className="text-slate-300 truncate">
                    Dropoff: {captainActiveRide.destination}
                  </p>
                </div>

                {/* STAGE 04 · Verify Rider OTP Gate */}
                {captainActiveRide.status === 'accepted' && (
                  <form onSubmit={handleVerifyOtpAndStart} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-[#E2FF44]" />
                        <span>6-Digit Pickup OTP (From Rider)</span>
                      </label>
                      {passengerRideOtpHint && (
                        <button
                          type="button"
                          onClick={() => setOtpInput(passengerRideOtpHint)}
                          className="text-[11px] font-mono text-[#E2FF44] hover:underline cursor-pointer"
                        >
                          [SIM] Auto-Fill ({passengerRideOtpHint})
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      className="w-full px-3 py-2 rounded-full bg-[#0B0D12] border border-[#E2FF44]/50 font-mono text-sm tracking-widest text-center text-[#E2FF44] focus:outline-none focus:border-[#E2FF44]"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleCancelRideByCaptain}
                        className="min-h-[42px] rounded-full border border-red-500/40 bg-red-950/60 hover:bg-red-900/70 text-red-200 font-bold text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionBusy || otpInput.trim().length !== 6}
                        className="col-span-2 min-h-[42px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] disabled:bg-slate-700 text-[#0B0D12] font-extrabold text-xs transition-colors cursor-pointer"
                      >
                        {actionBusy ? 'Verifying...' : 'Verify OTP & Start Trip'}
                      </button>
                    </div>
                  </form>
                )}

                {/* STAGE 05 · Active Trip Controls */}
                {captainActiveRide.status === 'ongoing' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onStepGps}
                        className="min-h-[42px] rounded-full bg-[#252932] hover:bg-[#323642] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5 text-[#E2FF44]" />
                        <span>[SIM] Step GPS</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleFinishRide}
                        className="min-h-[42px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{actionBusy ? 'Ending...' : 'Complete Trip'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : primaryOffer ? (
          /* STAGE 02 · Incoming Ride Request Card (Reference Screen 2 Layered Chartreuse Banner) */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="bg-[#E2FF44] text-[#0B0D12] rounded-t-[24px] px-4 pt-2.5 pb-5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                    02 · Incoming Ride Request
                  </span>
                  <h2 className="text-sm font-extrabold">
                    {typeof primaryOffer.user === 'object'
                      ? `${primaryOffer.user.fullname.firstname} ${
                          primaryOffer.user.fullname.lastname || ''
                        }`
                      : 'Chennai Passenger'}
                  </h2>
                </div>
                <div className="text-right font-mono">
                  <span className="text-base font-extrabold bg-[#0B0D12] text-[#E2FF44] px-3 py-1 rounded-full tabular-nums">
                    ₹{primaryOffer.fare.toFixed(2)}
                  </span>
                  <p className="text-[10px] font-bold mt-0.5">
                    {(primaryOffer.distance / 1000).toFixed(2)} km
                  </p>
                </div>
              </div>

              <div className="-mt-3 bg-[#14171F] rounded-[24px] p-3 border border-white/10 space-y-2.5 shadow-xl">
                {primaryOffer.matchExplanation && (
                  <div className="bg-[#252932] rounded-2xl p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-white">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#E2FF44]" />
                        <span>CabSafe Match Score</span>
                      </span>
                      <span className="font-mono text-[#E2FF44] font-bold">
                        {primaryOffer.matchExplanation.finalScore} / 100
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {primaryOffer.matchExplanation.explanation}
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-mono pt-0.5">
                      <div className="bg-[#1C1F26] px-2 py-0.5 rounded border border-white/5 flex justify-between">
                        <span className="text-slate-400">Proximity (45%):</span>
                        <span className="text-[#E2FF44] font-bold">
                          {primaryOffer.matchExplanation.distanceKm} km
                        </span>
                      </div>
                      <div className="bg-[#1C1F26] px-2 py-0.5 rounded border border-white/5 flex justify-between">
                        <span className="text-slate-400">Rating (25%):</span>
                        <span className="text-[#E2FF44] font-bold">
                          {primaryOffer.matchExplanation.rating?.toFixed(1) ?? '4.9'} ★
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-[#0D0F14] rounded-2xl p-2.5 space-y-1 text-xs border border-white/5">
                  <p className="text-slate-200 truncate">
                    <strong className="text-[#E2FF44]">Pickup:</strong> {primaryOffer.pickup}
                  </p>
                  <p className="text-slate-200 truncate">
                    <strong className="text-[#E2FF44]">Dropoff:</strong> {primaryOffer.destination}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleDismissOffer(primaryOffer._id)}
                className="min-h-[44px] rounded-full border border-white/15 bg-[#1C1F26] hover:bg-[#252932] text-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleAcceptRide(primaryOffer._id)}
                className="col-span-2 min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
              >
                {actionBusy ? 'Accepting...' : 'Accept Ride'}
              </button>
            </div>
          </div>
        ) : (
          /* STAGE 01 · Driver Home: Reference Screen 3 Vehicle Spec Bento + Top-Down Car Graphic */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5">
              {/* Driver Header Card with White License Plate Pill */}
              <div className="bg-[#1C1F26] border border-white/10 rounded-2xl p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#E2FF44] text-[#0B0D12] font-extrabold text-xs flex items-center justify-center shrink-0">
                    {captain.fullname.firstname.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-white truncate">
                      {captain.fullname.firstname} {captain.fullname.lastname || ''}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {captain.vehicle.color}{' '}
                      {captain.vehicle.model || captain.vehicle.vehicleType}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block bg-white text-[#0B0D12] font-mono text-[11px] font-extrabold px-2.5 py-1 rounded-full">
                    {captain.vehicle.plate}
                  </span>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-[#E2FF44] font-bold mt-0.5">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{captain.metrics.rating.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Reference Screen 3: 2x2 Bento Telemetry + Top-Down Vehicle Graphic */}
              <div className="bg-[#14171F] border border-white/10 rounded-[22px] p-3 flex items-center justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#1C1F26] rounded-xl p-2">
                      <p className="text-[10px] text-slate-400">Earnings (INR)</p>
                      <p className="font-mono text-xs font-extrabold text-[#E2FF44] tabular-nums mt-0.5">
                        ₹{captain.metrics.totalEarnings.toFixed(0)}
                      </p>
                    </div>
                    <div className="bg-[#1C1F26] rounded-xl p-2">
                      <p className="text-[10px] text-slate-400">Completed</p>
                      <p className="font-mono text-xs font-extrabold text-white tabular-nums mt-0.5">
                        {captain.metrics.completedRides} Trips
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#1C1F26] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#E2FF44]" />
                      <span className="text-[11px] font-bold text-white">
                        {captain.vehicle.capacity} Seat
                      </span>
                    </div>
                    <div className="bg-[#1C1F26] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-[#E2FF44]" />
                      <span className="text-[11px] font-bold text-white uppercase">
                        {captain.vehicle.vehicleType}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#1C1F26] rounded-xl p-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300 font-semibold">
                        98% safety &amp; reliability
                      </span>
                      <span className="font-mono text-[#E2FF44] font-bold">
                        {captain.status === 'active' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#0B0D12] overflow-hidden">
                      <div className="w-[98%] h-full rounded-full bg-[#E2FF44]" />
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  <TopDownCarSvg
                    vehicleType={captain.vehicle.vehicleType}
                    className="w-14 h-28"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#181B22] border border-white/10 rounded-full px-4 py-2.5 text-center">
              <p className="text-xs font-bold text-white">
                {captain.status === 'active'
                  ? '01 · Online in Chennai — Awaiting Ride Requests'
                  : '01 · You are Offline — Toggle Online to Receive Rides'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over Drawer: Captain Ride History */}
      {drawer === 'history' && (
        <div className="absolute inset-0 z-30 bg-[#0B0D12] text-white flex flex-col">
          <div className="h-[52px] px-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Captain Trip Log</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Captain History"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1C1F26] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {captainHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-12">
                No completed trips found.
              </p>
            ) : (
              captainHistory.map((item) => (
                <div
                  key={item._id}
                  className="bg-[#181B22] border border-white/10 rounded-2xl p-3 space-y-1.5 text-xs"
                >
                  <div className="flex justify-between font-bold text-white">
                    <span className="uppercase text-[#E2FF44]">{item.status}</span>
                    <span className="font-mono tabular-nums">₹{item.fare.toFixed(2)}</span>
                  </div>
                  <p className="text-slate-300 truncate">Pickup: {item.pickup}</p>
                  <p className="text-slate-300 truncate">Dropoff: {item.destination}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: Captain Vehicle & Profile */}
      {drawer === 'profile' && (
        <div className="absolute inset-0 z-30 bg-[#0B0D12] text-white flex flex-col">
          <div className="h-[52px] px-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Captain &amp; Vehicle Profile</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Captain Profile"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1C1F26] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form
            onSubmit={handleSaveCaptainProfile}
            className="p-4 space-y-3 text-xs overflow-y-auto"
          >
            {profileSavedMsg && (
              <div className="p-2.5 rounded-xl bg-[#1C1F26] border border-[#E2FF44]/40 text-[#E2FF44] flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{profileSavedMsg}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-400 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-400 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-400 mb-1">Vehicle Model</label>
              <input
                type="text"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-400 mb-1">License Plate</label>
                <input
                  type="text"
                  required
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 font-mono text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-400 mb-1">Color</label>
                <input
                  type="text"
                  required
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-[#181B22] border border-white/10 text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] text-[#0B0D12] font-extrabold text-xs cursor-pointer"
            >
              Save Captain &amp; Vehicle Details
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

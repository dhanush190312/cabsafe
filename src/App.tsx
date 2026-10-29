import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  UserRecord,
  CaptainRecord,
  RideRecord,
  WorkspaceTab,
  FareEstimateResponse,
  Coordinates,
  MatchExplanation,
} from './types';
import {
  apiRequest,
  getStoredToken,
  setStoredToken,
} from './types';
import { MobileFrame } from './components/MobileFrame';
import { PassengerApp } from './components/PassengerApp';
import { CaptainApp } from './components/CaptainApp';
import { SimulationCard } from './components/SimulationCard';
import { AdminAndAuditView } from './components/AdminAndAuditView';

interface AdminOverviewData {
  captains: Array<Omit<CaptainRecord, 'password'>>;
  rides: RideRecord[];
  stats: {
    totalCaptains: number;
    activeCaptains: number;
    totalRides: number;
    activeRides: number;
    completedRides: number;
    totalVolumeInr?: number;
    totalVolumeUsd: number;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('passenger');
  const [showSimPanel, setShowSimPanel] = useState<boolean>(true);

  // Authenticated Passenger & Captain states
  const [user, setUser] = useState<Omit<UserRecord, 'password'> | null>(null);
  const [captain, setCaptain] = useState<Omit<CaptainRecord, 'password'> | null>(null);

  // Active rides & fleet state
  const [passengerRide, setPassengerRide] = useState<RideRecord | null>(null);
  const [captainRide, setCaptainRide] = useState<RideRecord | null>(null);
  const [pendingOffers, setPendingOffers] = useState<RideRecord[]>([]);
  const [farePreview, setFarePreview] = useState<FareEstimateResponse | null>(null);
  const [selectedCandidatePreview, setSelectedCandidatePreview] = useState<MatchExplanation | null>(null);
  const [captainLiveCoords, setCaptainLiveCoords] = useState<Coordinates | null>(null);
  const [captainLastUpdatedAt, setCaptainLastUpdatedAt] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);

  // Simulation feedback
  const [simBusy, setSimBusy] = useState(false);
  const [simStatusMessage, setSimStatusMessage] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const captainRef = useRef(captain);
  captainRef.current = captain;

  const refreshAllState = useCallback(async () => {
    try {
      const adminData = await apiRequest<AdminOverviewData>('/admin/overview');
      setOverview(adminData);
    } catch {
      // ignore
    }

    const userToken = getStoredToken('user');
    if (userToken) {
      try {
        const [uProfile, uActive, uHistory] = await Promise.all([
          apiRequest<Omit<UserRecord, 'password'>>('/users/profile', { role: 'user' }),
          apiRequest<{ ride: RideRecord | null }>('/rides/active', { role: 'user' }),
          apiRequest<RideRecord[]>('/rides/history', { role: 'user' }).catch(() => []),
        ]);
        setUser(uProfile);
        setPassengerRide((prev) => {
          if (uActive.ride) return uActive.ride;
          if (prev && prev.status === 'completed' && !prev.userRating) {
            const latestMatch = uHistory.find((r) => r._id === prev._id);
            if (latestMatch && latestMatch.userRating) return null;
            return latestMatch || prev;
          }
          if (prev && ['accepted', 'ongoing'].includes(prev.status)) {
            const completedMatch = uHistory.find(
              (r) => r._id === prev._id && r.status === 'completed' && !r.userRating
            );
            if (completedMatch) return completedMatch;
          }
          return null;
        });
        if (!uActive.ride || !['accepted', 'ongoing'].includes(uActive.ride.status)) {
          setCaptainLiveCoords(null);
          setCaptainLastUpdatedAt(null);
        }
      } catch {
        setUser(null);
      }
    }

    const captainToken = getStoredToken('captain');
    if (captainToken) {
      try {
        const [cProfile, cActive] = await Promise.all([
          apiRequest<Omit<CaptainRecord, 'password'>>('/captains/profile', {
            role: 'captain',
          }),
          apiRequest<{ ride: RideRecord | null; pendingOffers: RideRecord[] }>(
            '/rides/active',
            { role: 'captain' }
          ),
        ]);
        setCaptain(cProfile);
        setCaptainRide(cActive.ride);
        setPendingOffers(cActive.pendingOffers || []);
      } catch {
        setCaptain(null);
      }
    }
  }, []);

  // Bootstrap default demo sessions on first visit so both Passenger and Captain tabs work out-of-the-box
  useEffect(() => {
    async function bootstrapDemoAccounts() {
      if (!getStoredToken('user')) {
        try {
          const res = await apiRequest<{
            user: Omit<UserRecord, 'password'>;
            token: string;
          }>('/users/login', {
            method: 'POST',
            body: { email: 'alex.passenger@cabsafe.demo', password: 'password123' },
          });
          setStoredToken('user', res.token);
          setUser(res.user);
        } catch {
          // ignore
        }
      }
      if (!getStoredToken('captain')) {
        try {
          const res = await apiRequest<{
            captain: Omit<CaptainRecord, 'password'>;
            token: string;
          }>('/captains/login', {
            method: 'POST',
            body: { email: 'marcus.captain@cabsafe.demo', password: 'password123' },
          });
          setStoredToken('captain', res.token);
          setCaptain(res.captain);
        } catch {
          // ignore
        }
      }
      await refreshAllState();
    }
    bootstrapDemoAccounts();
  }, [refreshAllState]);

  // Initialize Socket.IO connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      const uToken = getStoredToken('user');
      const cToken = getStoredToken('captain');
      if (userRef.current?._id && uToken) {
        socket.emit('join', { userId: userRef.current._id, userType: 'user', token: uToken });
      }
      if (captainRef.current?._id && cToken) {
        socket.emit('join', {
          userId: captainRef.current._id,
          userType: 'captain',
          token: cToken,
        });
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('new-ride', (rideOffer: RideRecord) => {
      setPendingOffers((prev) => {
        if (prev.some((r) => r._id === rideOffer._id)) return prev;
        return [rideOffer, ...prev];
      });
      refreshAllState();
    });

    socket.on('ride-confirmed', (updatedRide: RideRecord) => {
      setPassengerRide(updatedRide);
      refreshAllState();
    });

    socket.on('ride-started', (updatedRide: RideRecord) => {
      setPassengerRide(updatedRide);
      refreshAllState();
    });

    socket.on('ride-ended', (updatedRide: RideRecord) => {
      setPassengerRide(updatedRide);
      setCaptainRide(null);
      setCaptainLiveCoords(null);
      setCaptainLastUpdatedAt(null);
      refreshAllState();
    });

    socket.on('ride-cancelled', (cancelledRide?: RideRecord) => {
      if (cancelledRide && cancelledRide.cancelledBy === 'captain') {
        setPassengerRide(cancelledRide);
      } else {
        setPassengerRide(null);
      }
      setCaptainRide(null);
      setCaptainLiveCoords(null);
      setCaptainLastUpdatedAt(null);
      refreshAllState();
    });

    socket.on(
      'captain-location-updated',
      (payload: { location: Coordinates; rideId: string; updatedAt?: string }) => {
        if (payload?.location) {
          setCaptainLiveCoords(payload.location);
          setCaptainLastUpdatedAt(payload.updatedAt || new Date().toISOString());
        }
        refreshAllState();
      }
    );

    socket.on('ride-updated', () => {
      refreshAllState();
    });

    socket.on('demo-reset', () => {
      setPassengerRide(null);
      setCaptainRide(null);
      setPendingOffers([]);
      setCaptainLiveCoords(null);
      setCaptainLastUpdatedAt(null);
      refreshAllState();
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [refreshAllState]);

  // Re-emit socket join whenever user or captain changes
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    if (user?._id) {
      s.emit('join', {
        userId: user._id,
        userType: 'user',
        token: getStoredToken('user'),
      });
    }
    if (captain?._id) {
      s.emit('join', {
        userId: captain._id,
        userType: 'captain',
        token: getStoredToken('captain'),
      });
    }
  }, [user?._id, captain?._id]);

  const handleTriggerSimAction = async (action: string, rideId?: string) => {
    setSimBusy(true);
    setSimStatusMessage(null);
    try {
      const res = await apiRequest<{ message: string; ride?: RideRecord }>(
        '/admin/simulate-action',
        {
          method: 'POST',
          body: {
            action,
            rideId: rideId || passengerRide?._id || captainRide?._id,
          },
        }
      );
      setSimStatusMessage(res.message);
      await refreshAllState();
    } catch (err) {
      setSimStatusMessage((err as Error).message);
    } finally {
      setSimBusy(false);
    }
  };

  const currentSharedRide = passengerRide || captainRide || pendingOffers[0] || null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Royal 3-Zone Top Bar */}
      <header className="h-14 flex items-center justify-between gap-8 px-4 md:px-6 border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        {/* Zone 1: Royal Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('passenger');
          }}
          className="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <span>CabSafe</span>
        </a>

        {/* Zone 2: Concise navigation links */}
        <nav
          aria-label="Workspace View Switcher"
          className="flex items-center gap-3 md:gap-6 text-xs md:text-sm font-medium text-slate-600 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveTab('passenger')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'passenger'
                ? 'text-red-600 border-b-2 border-red-600 font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            Passenger App
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('captain')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'captain'
                ? 'text-red-600 border-b-2 border-red-600 font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            Captain App
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'admin'
                ? 'text-red-600 border-b-2 border-red-600 font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            Admin Dispatch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'audit'
                ? 'text-red-600 border-b-2 border-red-600 font-bold'
                : 'hover:text-slate-900'
            }`}
          >
            Audit Report
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setShowSimPanel((prev) => !prev)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {showSimPanel ? 'Hide Sim Tools' : 'Show Sim Tools'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'passenger' && (
          <MobileFrame
            sidePanel={
              showSimPanel ? (
                <SimulationCard
                  activeRide={currentSharedRide}
                  candidateRankings={farePreview?.candidateRankings}
                  selectedCandidate={selectedCandidatePreview}
                  onTriggerSimAction={handleTriggerSimAction}
                  simBusy={simBusy}
                  simStatusMessage={simStatusMessage}
                />
              ) : undefined
            }
          >
            <PassengerApp
              user={user}
              setUser={setUser}
              activeRide={passengerRide}
              setActiveRide={setPassengerRide}
              fleetCaptains={overview?.captains || []}
              captainLiveCoords={captainLiveCoords}
              captainLastUpdatedAt={captainLastUpdatedAt}
              onFarePreviewChange={setFarePreview}
              onSelectedCandidateChange={setSelectedCandidatePreview}
              onRefreshState={refreshAllState}
            />
          </MobileFrame>
        )}

        {activeTab === 'captain' && (
          <MobileFrame
            sidePanel={
              showSimPanel ? (
                <SimulationCard
                  activeRide={currentSharedRide}
                  candidateRankings={farePreview?.candidateRankings}
                  selectedCandidate={selectedCandidatePreview}
                  onTriggerSimAction={handleTriggerSimAction}
                  simBusy={simBusy}
                  simStatusMessage={simStatusMessage}
                />
              ) : undefined
            }
          >
            <CaptainApp
              captain={captain}
              setCaptain={setCaptain}
              captainActiveRide={captainRide}
              setCaptainActiveRide={setCaptainRide}
              pendingOffers={pendingOffers}
              setPendingOffers={setPendingOffers}
              passengerRideOtpHint={passengerRide?.otp}
              onRefreshState={refreshAllState}
              onStepGps={() => handleTriggerSimAction('step-gps', captainRide?._id)}
            />
          </MobileFrame>
        )}

        {(activeTab === 'admin' || activeTab === 'audit') && (
          <AdminAndAuditView
            mode={activeTab}
            overview={overview}
            onRefresh={refreshAllState}
            onTriggerSimAction={handleTriggerSimAction}
          />
        )}
      </main>
    </div>
  );
}

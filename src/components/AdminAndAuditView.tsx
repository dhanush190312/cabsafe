import React, { useState } from 'react';
import {
  ShieldAlert,
  Server,
  Radio,
  Smartphone,
  Scale,
  RefreshCw,
  ShieldCheck,
  Check,
  Cloud,
  Cpu,
  Database,
  Network,
  Lock,
  Layers,
} from 'lucide-react';
import type { CaptainRecord, RideRecord } from '../types';
import { LiveMap } from './LiveMap';

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

interface AdminAndAuditViewProps {
  mode: 'admin' | 'audit';
  overview: AdminOverviewData | null;
  onRefresh: () => Promise<void>;
  onTriggerSimAction: (action: string, rideId?: string) => Promise<void>;
}

export const AdminAndAuditView: React.FC<AdminAndAuditViewProps> = ({
  mode,
  overview,
  onRefresh,
  onTriggerSimAction,
}) => {
  const [auditTab, setAuditTab] = useState<
    'security' | 'aws' | 'endpoints' | 'sockets' | 'android'
  >('security');
  const [adminTableTab, setAdminTableTab] = useState<'drivers' | 'rides'>('drivers');

  if (mode === 'admin') {
    const captains = overview?.captains || [];
    const rides = overview?.rides || [];
    const stats = overview?.stats || {
      totalCaptains: 0,
      activeCaptains: 0,
      totalRides: 0,
      activeRides: 0,
      completedRides: 0,
      totalVolumeUsd: 0,
    };

    const focusedRide =
      rides.find((r) => ['pending', 'accepted', 'ongoing'].includes(r.status)) ||
      rides[0] ||
      null;

    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6 text-slate-800">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 font-display">
                Chennai Dispatch Operations &amp; Explainable Matching Console
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Provisional Chennai Operating Boundary (13.0827°N, 80.2707°E) · Live Fleet Telemetry &amp; Ranking Audits
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onTriggerSimAction('spawn-demo-ride')}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            >
              [SIMULATION] Dispatch Chennai Test Ride
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 4-Column KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Active Chennai Captains</p>
            <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
              {stats.activeCaptains} / {stats.totalCaptains}
            </p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">
              Provisional Chennai polygon enforced
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">In-Progress Rides</p>
            <p className="text-2xl font-black text-red-600 font-mono tabular-nums mt-1">
              {stats.activeRides}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Atomic lock &amp; duplicate ride protection
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Completed Trips</p>
            <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
              {stats.completedRides}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              OTP-verified handshakes
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Settled Gross Volume (INR)</p>
            <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
              ₹{(stats.totalVolumeInr ?? stats.totalVolumeUsd).toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Transparent INR base + distance + time
            </p>
          </div>
        </div>

        {/* 2-Column Split: Live Chennai Fleet Map + Explainable Match Audit */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden min-h-[380px] flex flex-col shadow-xs">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900">
                Tamil Nadu Statewide &amp; Chennai Metro Fleet Telemetry (38 Districts)
              </h2>
              <span className="font-mono text-xs font-bold text-red-600">
                {captains.length} Captains Tracked
              </span>
            </div>
            <div className="flex-1 min-h-[330px]">
              <LiveMap
                pickupCoords={focusedRide?.pickupCoords || null}
                destinationCoords={focusedRide?.destinationCoords || null}
                routeGeometry={focusedRide?.routeGeometry || null}
                fleetCaptains={captains}
                showFleetMarkers={true}
              />
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-xs">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-red-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Explainable Multi-Factor Audit Log
                  </h2>
                </div>
                <span className="font-mono text-[11px] font-bold text-slate-500">
                  Deterministic Ranking
                </span>
              </div>

              {focusedRide?.candidateRankings &&
              focusedRide.candidateRankings.length > 0 ? (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {focusedRide.candidateRankings.map((cand, idx) => (
                    <div
                      key={cand.captainId}
                      className={`p-3 rounded-2xl border text-xs space-y-2 shadow-2xs ${
                        idx === 0
                          ? 'bg-red-50/50 border-red-300 ring-1 ring-red-500/20'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            idx === 0 ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {cand.captainName} · {cand.vehicleModel || cand.plate}
                          </span>
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded font-mono">
                            {cand.plate}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {cand.matchTier || (idx === 0 ? 'Top Pick' : 'Alternative')}
                          </span>
                          <span className="font-mono font-black text-red-600 tabular-nums">
                            {cand.finalScore.toFixed(1)} / 100
                          </span>
                        </div>
                      </div>

                      {/* Score Matrix Pills */}
                      <div className="grid grid-cols-4 gap-1 text-[9px] font-mono">
                        <div className="bg-white p-1 rounded-lg border border-slate-200 text-center">
                          <span className="text-slate-400 block text-[8px]">Dist (45%)</span>
                          <span className="font-bold text-slate-800">+{cand.scoreBreakdown.distance.weighted.toFixed(1)}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-slate-200 text-center">
                          <span className="text-slate-400 block text-[8px]">Rate (25%)</span>
                          <span className="font-bold text-slate-800">+{cand.scoreBreakdown.rating.weighted.toFixed(1)}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-slate-200 text-center">
                          <span className="text-slate-400 block text-[8px]">Rel (20%)</span>
                          <span className="font-bold text-slate-800">+{cand.scoreBreakdown.completion.weighted.toFixed(1)}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-slate-200 text-center">
                          <span className="text-slate-400 block text-[8px]">Veh (10%)</span>
                          <span className="font-bold text-slate-800">+{cand.scoreBreakdown.vehicle.weighted.toFixed(1)}</span>
                        </div>
                      </div>

                      <p className="text-slate-600 text-[11px] leading-relaxed font-medium">
                        {cand.explanation}
                      </p>

                      {/* Highlights */}
                      <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-200/60">
                        {(cand.highlights || [
                          `★ ${cand.rating?.toFixed(1) ?? '4.9'} Rating`,
                          `${cand.distanceKm} km away`,
                          'Verified Corridor Driver',
                        ]).map((hl, i) => (
                          <span
                            key={i}
                            className="text-[9px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-0.5"
                          >
                            <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
                            {hl}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No candidate rankings recorded yet.
                </p>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 font-mono">
              Formula: Score = 0.45·S_dist + 0.25·S_rating + 0.20·S_completion + 0.10·S_vehicle
            </div>
          </div>
        </div>

        {/* Fleet Drivers & Ride Ledger Tables */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdminTableTab('drivers')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  adminTableTab === 'drivers'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                Chennai Fleet Drivers ({captains.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTableTab('rides')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  adminTableTab === 'rides'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                Recent Ride Ledger ({rides.length})
              </button>
            </div>
            <span className="font-mono text-xs font-bold text-slate-500">
              {adminTableTab === 'drivers'
                ? `${captains.length} Active Fleet Captains Tracked`
                : `${rides.length} Total Trip Records Logged`}
            </span>
          </div>

          {adminTableTab === 'drivers' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-4 font-semibold">Driver &amp; Contact</th>
                    <th className="py-2.5 px-4 font-semibold">Tier &amp; Vehicle Model</th>
                    <th className="py-2.5 px-4 font-semibold">License Plate</th>
                    <th className="py-2.5 px-4 font-semibold">Chennai Locality</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Rating &amp; Trips</th>
                    <th className="py-2.5 px-4 font-semibold">Rate Multiplier</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {captains.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No captains loaded in Chennai fleet.
                      </td>
                    </tr>
                  ) : (
                    captains.map((cap) => {
                      const locality =
                        cap.location?.coordinates?.[1] > 13.07
                          ? 'Anna Nagar (North-Central)'
                          : cap.location?.coordinates?.[0] < 80.22
                            ? 'Guindy (South-West)'
                            : cap.location?.coordinates?.[1] > 13.03
                              ? 'T. Nagar (Central)'
                              : 'Adyar (South-East)';

                      const pricingNote =
                        cap.fullname.firstname === 'Marcus'
                          ? '1.08x (Premium Hybrid)'
                          : cap.fullname.firstname === 'Elena'
                            ? '0.94x (Value Sedan)'
                            : cap.fullname.firstname === 'Tariq'
                              ? '1.02x (City Auto)'
                              : '0.95x (Express Moto)';

                      return (
                        <tr key={cap._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                {cap.fullname.firstname.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">
                                  {cap.fullname.firstname} {cap.fullname.lastname || ''}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  {cap.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-800 uppercase block text-[11px]">
                              {cap.vehicle.vehicleType === 'car' ? 'CabSafe Go (Sedan)' : cap.vehicle.vehicleType === 'cng' ? 'CabSafe Auto' : 'CabSafe Moto'}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
                              {cap.vehicle.color} · {cap.vehicle.model || cap.vehicle.vehicleType}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono bg-slate-900 text-white px-2 py-0.5 rounded text-[11px] font-bold">
                              {cap.vehicle.plate}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                              <span>{locality}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                cap.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  cap.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              {cap.status === 'active' ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-amber-500 font-bold text-xs">
                              ★ {cap.metrics.rating.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {cap.metrics.completedRides} trips completed
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            {pricingNote}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                            ₹{cap.metrics.totalEarnings.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-4 font-semibold">Ride ID</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Passenger</th>
                    <th className="py-2.5 px-4 font-semibold">Assigned Captain</th>
                    <th className="py-2.5 px-4 font-semibold">Chennai Route</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Fare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rides.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No recent rides recorded in ledger.
                      </td>
                    </tr>
                  ) : (
                    rides.map((r) => (
                      <tr key={r._id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {r._id.slice(-8)}
                        </td>
                        <td className="py-2.5 px-4 font-mono uppercase font-bold text-red-600">
                          {r.status}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 font-medium">
                          {typeof r.user === 'object' && r.user
                            ? `${r.user.fullname.firstname} ${r.user.fullname.lastname || ''}`
                            : String(r.user)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {typeof r.captain === 'object' && r.captain
                            ? `${r.captain.fullname.firstname} (${r.captain.vehicle.plate})`
                            : 'Unassigned'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                          {r.pickup} → {r.destination}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          ₹{r.fare.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Repository Audit, Security & Native Android Release Reference View ----------------
  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6 text-slate-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 font-display">
              CabSafe Chennai Audit, Security &amp; Android Release Blueprint
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Stages 5–7: Chennai Service Boundary, Socket.IO Protocol, Security Remediations, and Native Android Export
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-xs overflow-x-auto">
          {(
            [
              { id: 'security', label: 'Security & Boundary', icon: ShieldAlert },
              { id: 'aws', label: 'AWS Cloud Blueprint', icon: Cloud },
              { id: 'endpoints', label: 'HTTP Matrix', icon: Server },
              { id: 'sockets', label: 'Socket.IO Matrix', icon: Radio },
              { id: 'android', label: 'Android & Release', icon: Smartphone },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAuditTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  auditTab === tab.id
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {auditTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              1. Authoritative Chennai &amp; Tamil Nadu Statewide Service-Area Boundaries (`422 OUTSIDE_SERVICE_AREA`)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Configuration (`/src/config/chennaiServiceArea.ts`):</strong>{' '}
              Provisional development polygon centered at <code>13.0827°N, 80.2707°E</code> covering Chennai city, expanded to comprehensive statewide coverage across all 38 Tamil Nadu districts, including major highway corridors (NH44, NH45 GST, NH48/544, ECR, OMR) and premier regional hubs (Coimbatore, Madurai, Trichy, Salem, Tirunelveli, Kanyakumari).
            </p>
            <p className="text-xs text-emerald-700 font-medium">
              <strong>Enforcement:</strong> Validated on both the client and backend (<code>GET /rides/get-fare</code>, <code>POST /rides/create</code>, <code>POST /captains/location</code>, and Socket <code>update-location-captain</code>). Out-of-area points are never silently moved into Chennai.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              2. Atomic Ride Acceptance &amp; Duplicate Submission Prevention (`409 Conflict`)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Race Condition Remediation:</strong>{' '}
              <code>confirmRideAtomically</code> requires <code>status === &apos;pending&apos; &amp;&amp; captain === null</code>, returning HTTP <code>409 Conflict</code> if a second captain attempts to accept the same ride.
            </p>
            <p className="text-xs text-emerald-700 font-medium">
              <strong>Duplicate Booking Prevention:</strong> <code>createRide</code> checks <code>getActiveRideForActor(&apos;user&apos;, userId)</code> and rejects concurrent duplicate ride submissions with HTTP <code>409 Conflict</code> (<code>DUPLICATE_ACTIVE_RIDE</code>).
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              3. Captain Ownership &amp; OTP Secrecy (`403 Forbidden` / Role Sanitization)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Identity Enforcement:</strong> <code>POST /rides/confirm</code>, <code>POST /rides/start-ride</code>, and <code>POST /rides/end-ride</code> bind strictly to the JWT-authenticated <code>req.captain._id</code>.
            </p>
            <p className="text-xs text-emerald-700 font-medium">
              <strong>OTP Protection:</strong> <code>sanitizeRideForRole(ride, &apos;captain&apos;)</code> strips the 6-digit <code>otp</code> from all captain HTTP and Socket payloads; the trip can only transition to <code>ongoing</code> when the captain submits the rider’s OTP.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              4. Authenticated Socket.IO Session &amp; Live GPS Relay
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Session Verification:</strong> Distinguishes raw socket connections from token-authenticated sessions on <code>join</code> and <code>update-location-captain</code>.
            </p>
            <p className="text-xs text-emerald-700 font-medium">
              <strong>Scoped Tracking:</strong> Live driver locations are relayed via <code>captain-location-updated</code> only during active rides (<code>accepted</code> or <code>ongoing</code>) and cleared immediately when a trip ends or is cancelled.
            </p>
          </div>
        </div>
      )}

      {auditTab === 'aws' && (
        <div className="space-y-4">
          {/* Top Cloud Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Region</span>
              <p className="text-base font-black text-slate-900 font-mono mt-0.5">ap-south-1</p>
              <p className="text-[11px] text-emerald-600 font-medium">AWS Mumbai (Dual-AZ)</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Deployment Stack</span>
              <p className="text-base font-black text-red-600 font-mono mt-0.5">CloudFormation</p>
              <p className="text-[11px] text-slate-500 font-medium">Single 1-Click Template (~4–6m)</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Database Tier</span>
              <p className="text-base font-black text-slate-900 font-mono mt-0.5">DynamoDB</p>
              <p className="text-[11px] text-emerald-600 font-medium">4 Tables + GSIs + TTL Auto-Expiry</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fleet Scaling</span>
              <p className="text-base font-black text-slate-900 font-mono mt-0.5">ALB + ASG</p>
              <p className="text-[11px] text-slate-500 font-medium">2 to 4 Instances (Auto-Healing)</p>
            </div>
          </div>

          {/* Visual Architecture Flow */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#E2FF44]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  AWS End-to-End Production Traffic Flow
                </h3>
              </div>
              <span className="text-[10px] bg-white/10 text-slate-300 font-mono px-2 py-0.5 rounded-full">
                Zero-Hardcoded Secrets
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs font-mono text-center">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block">Clients</span>
                <p className="font-bold text-white">Passenger &amp; Captain</p>
                <span className="text-[10px] text-slate-400">Mobile &amp; Web</span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block">Edge &amp; ELB</span>
                <p className="font-bold text-[#E2FF44]">Application Load Balancer</p>
                <span className="text-[10px] text-slate-400">Port 80/443 + Stickiness</span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block">Compute ASG</span>
                <p className="font-bold text-white">2–4 EC2 Instances</p>
                <span className="text-[10px] text-slate-400">Amazon Linux 2023</span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block">Private Route</span>
                <p className="font-bold text-[#E2FF44]">VPC Gateway Endpoint</p>
                <span className="text-[10px] text-slate-400">Zero Internet Traversal</span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase block">Persistence</span>
                <p className="font-bold text-white">Amazon DynamoDB</p>
                <span className="text-[10px] text-slate-400">Users, Captains, Rides, Tokens</span>
              </div>
            </div>
          </div>

          {/* 6 Core AWS Services Detailed Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* 1. IAM */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Lock className="w-4 h-4 text-red-600" />
                <span>1. IAM Least-Privilege Role</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Role <code>CabSafeInstanceRole</code> attached to EC2 instances. Grants scoped permissions (<code>dynamodb:GetItem</code>, <code>PutItem</code>, <code>UpdateItem</code>, <code>Query</code>) on <code>CabSafe*</code> tables plus CloudWatch logging. Zero AWS Access Keys stored on disk.
              </p>
            </div>

            {/* 2. VPC */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Network className="w-4 h-4 text-blue-600" />
                <span>2. Multi-AZ VPC Network</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                <code>10.20.0.0/16</code> VPC across 2 Availability Zones (<code>ap-south-1a</code>, <code>ap-south-1b</code>). 2 Public subnets for ALB + 2 Private subnets for EC2 with a VPC Gateway Endpoint routing to DynamoDB without internet exposure.
              </p>
            </div>

            {/* 3. EC2 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Cpu className="w-4 h-4 text-purple-600" />
                <span>3. EC2 Auto-Bootstrapping</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Automated EC2 UserData installs Node 20, git-clones <code>dhanush190312/cabsafe.git</code>, runs <code>npm run build</code>, and starts a systemd service with 15s graceful connection draining on Auto Scaling scale-in.
              </p>
            </div>

            {/* 4. DynamoDB */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>4. Amazon DynamoDB Tables</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Four On-Demand tables: <code>CabSafeUsers</code> (GSI: <code>EmailIndex</code>), <code>CabSafeCaptains</code> (GSIs: <code>EmailIndex</code>, <code>StatusIndex</code>), <code>CabSafeRides</code>, and <code>CabSafeTokens</code> with native TTL auto-blacklisting.
              </p>
            </div>

            {/* 5. ELB */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Server className="w-4 h-4 text-amber-600" />
                <span>5. Application Load Balancer</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Dual-AZ public ALB with WebSocket sticky sessions (duration: 86,400s) to keep Socket.IO connections pinned. Health check probe targets <code>GET /api/health</code> (200 OK) every 30 seconds.
              </p>
            </div>

            {/* 6. Auto Scaling */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <span>6. Auto Scaling Group</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Maintains a minimum of 2 healthy instances up to 4 during Chennai peak transit hours. Automatically replaces unhealthy instances and rebalances fleet across Availability Zones.
              </p>
            </div>
          </div>
        </div>
      )}

      {auditTab === 'endpoints' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 bg-slate-50">
                <th className="py-2.5 px-4 font-semibold">Method &amp; Path</th>
                <th className="py-2.5 px-4 font-semibold">Role / Auth</th>
                <th className="py-2.5 px-4 font-semibold">Request Parameters / Body</th>
                <th className="py-2.5 px-4 font-semibold">Response &amp; Audited Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">GET /maps/service-area</td>
                <td className="py-2.5 px-4">Public</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">None</td>
                <td className="py-2.5 px-4 text-slate-700">200 &#123; mapConfig (13.0827, 80.2707), metadata, polygon &#125;</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">GET /maps/reverse-geocode</td>
                <td className="py-2.5 px-4">authAny</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">?lat=&amp;lon=</td>
                <td className="py-2.5 px-4 text-slate-700">200 &#123; coords, display_name, locality, inServiceArea &#125;</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">GET /rides/get-fare</td>
                <td className="py-2.5 px-4">authAny</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">?pickup=&amp;destination=</td>
                <td className="py-2.5 px-4 text-slate-700">200 Fare + Route · 422 if outside Chennai boundary</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">POST /rides/create</td>
                <td className="py-2.5 px-4">authUser</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">pickup, destination, vehicleType</td>
                <td className="py-2.5 px-4 text-slate-700">201 Ride · 422 outside Chennai · 409 duplicate active ride</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">POST /rides/confirm</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">rideId (uses req.captain._id)</td>
                <td className="py-2.5 px-4 text-slate-700">200 Ride (OTP stripped) · 409 Conflict if already accepted</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">POST /rides/start-ride</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">rideId, otp (6 digits)</td>
                <td className="py-2.5 px-4 text-slate-700">200 Ride (status: ongoing) · 400 wrong OTP · 403 wrong captain</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">POST /captains/location</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">lat, lon</td>
                <td className="py-2.5 px-4 text-slate-700">200 Captain · 422 if outside Chennai operating boundary</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {auditTab === 'sockets' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 bg-slate-50">
                <th className="py-2.5 px-4 font-semibold">Event Name</th>
                <th className="py-2.5 px-4 font-semibold">Direction</th>
                <th className="py-2.5 px-4 font-semibold">Payload</th>
                <th className="py-2.5 px-4 font-semibold">Recipient &amp; Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">join</td>
                <td className="py-2.5 px-4">Client → Server</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">&#123; userId, userType, token &#125;</td>
                <td className="py-2.5 px-4 text-slate-700">Verifies JWT token, binds socketId, joins userType:userId room</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-red-600">update-location-captain</td>
                <td className="py-2.5 px-4">Captain → Server</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">&#123; userId, location: &#123; lat, lon &#125;, token &#125;</td>
                <td className="py-2.5 px-4 text-slate-700">Validates captain JWT &amp; Chennai polygon; relays captain-location-updated</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-emerald-600">new-ride</td>
                <td className="py-2.5 px-4">Server → Captains</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">Sanitized Ride + matchExplanation</td>
                <td className="py-2.5 px-4 text-slate-700">Sent to ranked active Chennai captains (OTP excluded)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-emerald-600">ride-confirmed</td>
                <td className="py-2.5 px-4">Server → Passenger</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">Ride with Captain + 6-digit OTP</td>
                <td className="py-2.5 px-4 text-slate-700">Transitions rider UI to WaitingForDriver with OTP</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold text-emerald-600">captain-location-updated</td>
                <td className="py-2.5 px-4">Server → Passenger</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">&#123; rideId, captainId, location, updatedAt &#125;</td>
                <td className="py-2.5 px-4 text-slate-700">Emitted only while ride is accepted or ongoing</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {auditTab === 'android' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-xs shadow-xs">
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-900">
              Stage 5 &amp; 7: Native Android Map SDK Selection &amp; Release Preparation
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Compatible with existing backend OpenStreetMap / OSRM / Photon APIs without requiring a paid Google Maps key:
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="font-bold text-red-600">
                1. Map Rendering Library: osmdroid / MapLibre Native
              </p>
              <p className="text-slate-600 leading-relaxed">
                Uses <code>org.osmdroid:osmdroid-android:6.1.18</code> (or <code>org.maplibre.gl:android-sdk:11.5.1</code>) centered at <code>GeoPoint(13.0827, 80.2707)</code> (zoom <code>12.0</code>). Configures a descriptive <code>User-Agent</code> header (<code>CabSafe-Android/1.0</code>) per OSM Tile Usage Policy. For high-volume commercial production, swap the tile source URL via <code>BuildConfig.MAP_TILE_URL</code> without changing UI code.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="font-bold text-slate-900">
                2. BuildConfig &amp; Credential Hygiene
              </p>
              <p className="text-slate-600 leading-relaxed">
                Configure <code>CABSAFE_API_BASE_URL</code> in <code>local.properties</code> / Gradle <code>buildConfigField</code> (<code>http://10.0.2.2:3000</code> for emulator, <code>https://...</code> with <code>cleartextTrafficPermitted=&quot;false&quot;</code> for release). Never embed private signing keys, database URIs, or JWT secrets in the APK.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

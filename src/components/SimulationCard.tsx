import React from 'react';
import {
  Play,
  Navigation,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  PlusCircle,
  Scale,
  X,
  ShieldCheck,
  Sparkles,
  Check,
} from 'lucide-react';
import type { RideRecord, MatchExplanation } from '../types';

interface SimulationCardProps {
  activeRide: RideRecord | null;
  candidateRankings?: MatchExplanation[];
  selectedCandidate?: MatchExplanation | null;
  onTriggerSimAction: (action: string, rideId?: string) => Promise<void>;
  simBusy: boolean;
  simStatusMessage: string | null;
}

export const SimulationCard: React.FC<SimulationCardProps> = ({
  activeRide,
  candidateRankings = [],
  selectedCandidate = null,
  onTriggerSimAction,
  simBusy,
  simStatusMessage,
}) => {
  const explanation =
    activeRide?.matchExplanation ||
    activeRide?.candidateRankings?.[0] ||
    selectedCandidate ||
    candidateRankings[0] ||
    null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-slate-900 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 truncate">
            Royal Dispatch &amp; GPS Controls
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Test simulation helpers for active ride lifecycle
          </p>
        </div>
        <span className="font-mono text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
          DEV HARNESS
        </span>
      </div>

      {simStatusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-mono"
        >
          {simStatusMessage}
        </div>
      )}

      {/* Active Trip OTP Secret Helper for Dev/Testing */}
      {activeRide?.status === 'accepted' && activeRide.otp && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                Passenger OTP Secret
              </p>
              <p className="font-mono text-base font-black text-emerald-950 tracking-widest leading-none mt-0.5">
                {activeRide.otp}
              </p>
            </div>
          </div>
          <span className="text-[9px] bg-emerald-200/80 text-emerald-900 font-extrabold px-2 py-0.5 rounded-full border border-emerald-300">
            Awaiting Verification
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'pending'}
          onClick={() => onTriggerSimAction('accept-ride', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
        >
          <Play className="w-3.5 h-3.5 shrink-0" />
          <span>Sim Captain Accept</span>
        </button>

        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'accepted'}
          onClick={() => onTriggerSimAction('start-ride-otp', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          <span>Sim Verify OTP</span>
        </button>

        <button
          type="button"
          disabled={
            simBusy ||
            !activeRide ||
            !['accepted', 'ongoing'].includes(activeRide.status)
          }
          onClick={() => onTriggerSimAction('step-gps', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Navigation className="w-3.5 h-3.5 shrink-0 text-red-600" />
          <span>Step Captain GPS</span>
        </button>

        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'ongoing'}
          onClick={() => onTriggerSimAction('complete-ride', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span>Sim Finish Ride</span>
        </button>

        <button
          type="button"
          disabled={simBusy || !activeRide || !['pending', 'accepted'].includes(activeRide.status)}
          onClick={() => onTriggerSimAction('captain-cancel-ride', activeRide?._id)}
          className="col-span-2 min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 disabled:opacity-40 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <X className="w-3.5 h-3.5 shrink-0 text-amber-700" />
          <span>Sim Captain Cancel (Test Re-dispatch)</span>
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={simBusy}
          onClick={() => onTriggerSimAction('spawn-demo-ride')}
          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
          <span>Spawn Demo Ride Offer</span>
        </button>
        <button
          type="button"
          disabled={simBusy}
          onClick={() => onTriggerSimAction('reset-demo')}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          title="Reset Demo Database"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Reset Seed</span>
        </button>
      </div>

      {/* Explainable Multi-Factor Driver Matching Breakdown */}
      <div className="border-t border-slate-200 pt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 whitespace-nowrap">
            <Scale className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>Explainable Matching</span>
          </div>
          <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap shrink-0">
            0.45·D + 0.25·R + 0.20·C + 0.10·V
          </span>
        </div>

        {explanation ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
            {/* Captain Hero & Match Score Header */}
            <div className="flex items-start justify-between gap-2.5 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-xs">
                    {explanation.captainName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" title="Online & Active" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {explanation.captainName}
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full border border-emerald-200">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Verified Captain
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-semibold truncate flex items-center gap-1">
                    <span>{explanation.vehicleModel || explanation.vehicleType.toUpperCase()}</span>
                    <span className="font-mono text-[9px] bg-slate-200 text-slate-800 px-1 rounded">
                      {explanation.plate}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {explanation.distanceKm} km away · ETA {explanation.etaMinutes} mins
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="inline-flex flex-col items-end">
                  <div className="flex items-baseline gap-0.5 font-mono">
                    <span className="text-base font-black text-red-600 tabular-nums">
                      {explanation.finalScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">/100</span>
                  </div>
                  <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full">
                    {explanation.matchTier || 'Top Pick'}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Multi-Factor Score Weight Breakdowns with Visual Progress Bars */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {/* Proximity */}
              <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Proximity (45%)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    +{explanation.scoreBreakdown.distance.weighted.toFixed(1)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (explanation.scoreBreakdown.distance.weighted / 45) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 truncate">
                  {explanation.distanceKm} km away ({explanation.etaMinutes}m ETA)
                </div>
              </div>

              {/* Rating */}
              <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Rider Rating (25%)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    +{explanation.scoreBreakdown.rating.weighted.toFixed(1)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (explanation.scoreBreakdown.rating.weighted / 25) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 truncate">
                  ★ {explanation.rating?.toFixed(1) ?? '4.9'} (98% Satisfaction)
                </div>
              </div>

              {/* Reliability */}
              <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Reliability (20%)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    +{explanation.scoreBreakdown.completion.weighted.toFixed(1)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (explanation.scoreBreakdown.completion.weighted / 20) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 truncate">
                  {explanation.scoreBreakdown.completion.raw} trip completion
                </div>
              </div>

              {/* Vehicle Fit */}
              <div className="bg-white p-2 rounded-xl border border-slate-200 space-y-1 shadow-2xs">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Vehicle Fit (10%)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    +{explanation.scoreBreakdown.vehicle.weighted.toFixed(1)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (explanation.scoreBreakdown.vehicle.weighted / 10) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 truncate">
                  {explanation.vehicleType.toUpperCase()} exact tier match
                </div>
              </div>
            </div>

            {/* AI Dispatch Explanation & Feature Tags */}
            <div className="bg-white rounded-xl p-2.5 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-red-600" />
                  <span>Explainable Dispatch Rationale</span>
                </span>
                {explanation.driverFare && (
                  <span className="font-mono font-black text-red-600">
                    ₹{explanation.driverFare.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                {explanation.explanation}
              </p>

              {/* Pro Feature Tags */}
              <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-100">
                {(explanation.highlights || [
                  `★ ${explanation.rating?.toFixed(1) ?? '4.9'} Star Rating`,
                  `${explanation.vehicleModel || explanation.vehicleType}`,
                  `${explanation.distanceKm} km Proximity`,
                  '₹0 Cancellation Guarantee',
                ]).map((hl, i) => (
                  <span
                    key={i}
                    className="text-[9px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1"
                  >
                    <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
                    {hl}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Select a pickup &amp; destination to preview deterministic multi-factor driver rankings.
          </p>
        )}
      </div>
    </div>
  );
};

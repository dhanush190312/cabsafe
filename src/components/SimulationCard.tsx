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
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {explanation.captainName} · {explanation.plate}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {explanation.distanceKm} km away · ETA {explanation.etaMinutes} mins
                </p>
              </div>
              <div className="text-right font-mono">
                <span className="text-sm font-extrabold text-red-600 tabular-nums">
                  {explanation.finalScore.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400 font-bold"> / 100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex justify-between shadow-2xs">
                <span className="text-slate-500">Dist (45%):</span>
                <span className="text-slate-800 font-bold tabular-nums">
                  +{explanation.scoreBreakdown.distance.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex justify-between shadow-2xs">
                <span className="text-slate-500">Rating (25%):</span>
                <span className="text-slate-800 font-bold tabular-nums">
                  +{explanation.scoreBreakdown.rating.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex justify-between shadow-2xs">
                <span className="text-slate-500">Reliab (20%):</span>
                <span className="text-slate-800 font-bold tabular-nums">
                  +{explanation.scoreBreakdown.completion.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex justify-between shadow-2xs">
                <span className="text-slate-500">Vehicle (10%):</span>
                <span className="text-slate-800 font-bold tabular-nums">
                  +{explanation.scoreBreakdown.vehicle.weighted.toFixed(1)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
              {explanation.explanation}
            </p>
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

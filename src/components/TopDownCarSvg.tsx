import React from 'react';
import type { VehicleType } from '../types';

interface TopDownCarSvgProps {
  vehicleType?: VehicleType;
  className?: string;
}

/**
 * High-contrast top-down vehicle vector illustration inspired by the right panel
 * of the reference UI mockup (pearl white / silver bodywork, panoramic dark glass roof,
 * side mirrors, and subtle chartreuse headlamp accents).
 */
export const TopDownCarSvg: React.FC<TopDownCarSvgProps> = ({
  vehicleType = 'car',
  className = 'w-20 h-36',
}) => {
  const isMoto = vehicleType === 'motorcycle';
  const isAuto = vehicleType === 'cng';

  if (isMoto) {
    return (
      <svg
        viewBox="0 0 100 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Drop shadow */}
        <ellipse cx="50" cy="100" rx="26" ry="86" fill="#000000" fillOpacity="0.45" />
        {/* Front tire */}
        <rect x="42" y="14" width="16" height="34" rx="8" fill="#1E222B" stroke="#DC2626" strokeWidth="1.5" />
        {/* Rear tire */}
        <rect x="40" y="148" width="20" height="36" rx="9" fill="#1E222B" />
        {/* Handlebars */}
        <path d="M20 52 L80 52" stroke="#D8DEE9" strokeWidth="5" strokeLinecap="round" />
        <circle cx="18" cy="52" r="4" fill="#DC2626" />
        <circle cx="82" cy="52" r="4" fill="#DC2626" />
        {/* Body fairing & tank */}
        <rect x="33" y="42" width="34" height="114" rx="17" fill="#F1F5F9" stroke="#DC2626" strokeWidth="2" />
        {/* Rider seat */}
        <rect x="36" y="82" width="28" height="58" rx="12" fill="#0F131A" />
        {/* Headlamp glow */}
        <path d="M40 38 Q50 32 60 38" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 230"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="carBodyGrad" x1="0" y1="0" x2="120" y2="230" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id="glassGrad" x1="60" y1="55" x2="60" y2="185" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E2430" />
          <stop offset="50%" stopColor="#0B0D12" />
          <stop offset="100%" stopColor="#1A1F29" />
        </linearGradient>
      </defs>

      {/* Ambient ground shadow */}
      <rect x="14" y="12" width="92" height="208" rx="42" fill="#000000" fillOpacity="0.55" />

      {/* 4 Wheels */}
      <rect x="11" y="38" width="10" height="32" rx="4" fill="#181B22" />
      <rect x="99" y="38" width="10" height="32" rx="4" fill="#181B22" />
      <rect x="11" y="156" width="10" height="32" rx="4" fill="#181B22" />
      <rect x="99" y="156" width="10" height="32" rx="4" fill="#181B22" />

      {/* Outer sculpted chassis */}
      <rect
        x="16"
        y="10"
        width="88"
        height="206"
        rx={isAuto ? '34' : '40'}
        fill="url(#carBodyGrad)"
        stroke="#CBD5E1"
        strokeWidth="2"
      />

      {/* Side Mirrors */}
      <path d="M16 74 L6 80 L8 87 L16 84 Z" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />
      <path d="M104 74 L114 80 L112 87 L104 84 Z" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />

      {/* Hood crease lines */}
      <path d="M34 22 C32 42, 32 54, 28 66" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M86 22 C88 42, 88 54, 92 66" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />

      {/* Front LED Headlamps - Royal Red */}
      <path d="M26 18 Q36 13 46 16" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M74 16 Q84 13 94 18" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" />

      {/* Panoramic Windshield + Glass Roof + Rear Window */}
      <path
        d="M26 68 Q60 56 94 68 L90 184 Q60 192 30 184 Z"
        fill="url(#glassGrad)"
        stroke="#475569"
        strokeWidth="1.5"
      />

      {/* Roof crossbar divider */}
      <path d="M27 104 Q60 98 93 104" stroke="#94A3B8" strokeWidth="2.5" />
      <path d="M29 156 Q60 160 91 156" stroke="#64748B" strokeWidth="2" />

      {/* Subtle glass reflection */}
      <path d="M36 74 L54 70 L42 148 L32 148 Z" fill="#FFFFFF" fillOpacity="0.07" />

      {/* Rear Taillights */}
      <path d="M28 208 Q40 212 48 210" stroke="#F87171" strokeWidth="3" strokeLinecap="round" />
      <path d="M72 210 Q80 212 92 208" stroke="#F87171" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

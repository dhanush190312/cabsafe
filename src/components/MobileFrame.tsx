import React from 'react';

interface MobileFrameProps {
  children: React.ReactNode;
  roleLabel?: string;
  statusLabel?: string;
  sidePanel?: React.ReactNode;
}

/**
 * Preserves the centered MobileFrame on desktop viewports
 * while expanding full-screen on mobile phones (<768px).
 */
export const MobileFrame: React.FC<MobileFrameProps> = ({
  children,
  sidePanel,
}) => {
  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 px-0 md:px-6 py-0 md:py-5">
      {/* Centered Mobile Phone Shell */}
      <div className="flex flex-col items-center shrink-0 w-full md:w-auto">
        <div
          className="
            relative
            w-full h-[calc(100dvh-56px)]
            md:w-[396px] md:max-w-[396px]
            md:h-[760px]
            md:rounded-[34px] md:border-[7px] md:border-slate-800
            bg-white md:shadow-2xl overflow-hidden flex flex-col
          "
        >
          {children}
        </div>
      </div>

      {/* Optional Desktop Companion Simulation & Match Inspector Drawer */}
      {sidePanel && (
        <div className="w-full max-w-[396px] lg:max-w-[440px] px-4 md:px-0 pb-8 lg:pb-0 lg:mt-6 shrink-0">
          {sidePanel}
        </div>
      )}
    </div>
  );
};

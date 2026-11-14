import React from 'react';

export type BrandAccent = 'blue' | 'red' | 'gold' | 'emerald' | 'mono';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  accent?: BrandAccent;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

const ACCENT_PALETTES: Record<
  BrandAccent,
  {
    lightText: string;
    darkText: string;
    bg: string;
    border: string;
    grid: string;
    bar1: string;
    bar2: string;
    bar3: string;
    dot: string;
  }
> = {
  gold: {
    lightText: 'text-amber-400',
    darkText: 'text-amber-600',
    bg: '#09090B',
    border: '#78350F',
    grid: '#292524',
    bar1: '#A8A29E',
    bar2: '#FDE68A',
    bar3: '#F59E0B',
    dot: '#FBBF24',
  },
  blue: {
    lightText: 'text-blue-400',
    darkText: 'text-blue-600',
    bg: '#0F172A',
    border: '#1E293B',
    grid: '#334155',
    bar1: '#38BDF8',
    bar2: '#2563EB',
    bar3: '#10B981',
    dot: '#10B981',
  },
  red: {
    lightText: 'text-red-500',
    darkText: 'text-red-600',
    bg: '#09090B',
    border: '#27272A',
    grid: '#27272A',
    bar1: '#71717A',
    bar2: '#FFFFFF',
    bar3: '#DC2626',
    dot: '#EF4444',
  },
  emerald: {
    lightText: 'text-emerald-400',
    darkText: 'text-emerald-600',
    bg: '#060D0A',
    border: '#1E2923',
    grid: '#1E2923',
    bar1: '#64748B',
    bar2: '#FFFFFF',
    bar3: '#059669',
    dot: '#10B981',
  },
  mono: {
    lightText: 'text-neutral-300',
    darkText: 'text-neutral-700',
    bg: '#000000',
    border: '#262626',
    grid: '#262626',
    bar1: '#737373',
    bar2: '#D4D4D4',
    bar3: '#FFFFFF',
    dot: '#FFFFFF',
  },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  accent = 'gold',
  size = 'md',
  showTagline = false,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-9 h-9' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const primaryText = variant === 'light' ? 'text-white' : 'text-slate-950';
  const pal = ACCENT_PALETTES[accent];
  const accentText = variant === 'light' ? pal.lightText : pal.darkText;

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill={pal.bg} />
        <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="8.25" stroke={pal.border} strokeWidth="1.5" />
        {/* Precision Liquidity Grid */}
        <path
          d="M12 7V29M24 7V29M7 12H29M7 24H29"
          stroke={pal.grid}
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Institutional Candlestick Pillars + Ascending Pip Trajectory */}
        <rect x="9.5" y="19" width="4" height="7" rx="1" fill={pal.bar1} />
        <rect x="16" y="14" width="4" height="9" rx="1" fill={pal.bar2} />
        <rect x="22.5" y="9.5" width="4" height="11" rx="1" fill={pal.bar3} />
        <path
          d="M9.5 16.5L16.5 12L21.5 14L27.5 8"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27.5" cy="8" r="2" fill={pal.dot} />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`${textSize} font-bold tracking-tight ${primaryText}`}>
          Grid <span className={accentText}>Pips</span>
        </span>
        {showTagline && (
          <span className="text-[9px] tracking-[0.18em] text-neutral-400 font-medium mt-0.5 uppercase">
            Trade · Automate · Grow
          </span>
        )}
      </span>
    </span>
  );
};

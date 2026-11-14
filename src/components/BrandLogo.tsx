import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  accent?: 'blue' | 'red';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  accent = 'blue',
  size = 'md',
  className = '',
}) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-9 h-9' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const primaryText = variant === 'light' ? 'text-white' : 'text-slate-950';
  const accentText =
    accent === 'red'
      ? variant === 'light'
        ? 'text-red-500'
        : 'text-red-600'
      : variant === 'light'
      ? 'text-blue-400'
      : 'text-blue-600';

  const bgFill = accent === 'red' ? '#09090B' : '#0F172A';
  const borderStroke = accent === 'red' ? '#27272A' : '#1E293B';
  const gridStroke = accent === 'red' ? '#27272A' : '#334155';
  const bar1Fill = accent === 'red' ? '#71717A' : '#38BDF8';
  const bar2Fill = accent === 'red' ? '#FFFFFF' : '#2563EB';
  const bar3Fill = accent === 'red' ? '#DC2626' : '#10B981';
  const dotFill = accent === 'red' ? '#EF4444' : '#10B981';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill={bgFill} />
        <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="8.25" stroke={borderStroke} strokeWidth="1.5" />
        {/* Precision Liquidity Grid */}
        <path
          d="M12 7V29M24 7V29M7 12H29M7 24H29"
          stroke={gridStroke}
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Institutional Candlestick Pillars + Ascending Pip Trajectory */}
        <rect x="9.5" y="19" width="4" height="7" rx="1" fill={bar1Fill} />
        <rect x="16" y="14" width="4" height="9" rx="1" fill={bar2Fill} />
        <rect x="22.5" y="9.5" width="4" height="11" rx="1" fill={bar3Fill} />
        <path
          d="M9.5 16.5L16.5 12L21.5 14L27.5 8"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27.5" cy="8" r="2" fill={dotFill} />
      </svg>
      <span className={`${textSize} font-bold tracking-tight ${primaryText}`}>
        GRID<span className={accentText}>PIPs</span>
      </span>
    </span>
  );
};

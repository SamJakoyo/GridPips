import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  size = 'md',
  showTagline = false,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-9 h-9' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const primaryText = variant === 'light' ? 'text-white' : 'text-slate-950';
  const accentText = variant === 'light' ? 'text-amber-400' : 'text-amber-600';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill="#09090B" />
        <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="8.25" stroke="#78350F" strokeWidth="1.5" />
        {/* Precision Liquidity Grid */}
        <path
          d="M12 7V29M24 7V29M7 12H29M7 24H29"
          stroke="#292524"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Institutional Candlestick Pillars + Ascending Gold Trajectory */}
        <rect x="9.5" y="19" width="4" height="7" rx="1" fill="#A8A29E" />
        <rect x="16" y="14" width="4" height="9" rx="1" fill="#FDE68A" />
        <rect x="22.5" y="9.5" width="4" height="11" rx="1" fill="#F59E0B" />
        <path
          d="M9.5 16.5L16.5 12L21.5 14L27.5 8"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27.5" cy="8" r="2" fill="#FBBF24" />
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

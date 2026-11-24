import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'light',
  size = 'md',
  showTagline = false,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const primaryText = variant === 'light' ? 'text-white' : 'text-slate-950';
  const accentText = variant === 'light' ? 'text-[#16E563]' : 'text-emerald-600';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill="#07120C" />
        <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="8.25" stroke="#16E563" strokeOpacity="0.45" strokeWidth="1.3" />
        {/* Ascending Emerald Signal Bars matching the exact Grippips brand mark */}
        <path d="M7.5 26.5L11.5 22.5V26.5H7.5Z" fill="#16E563" fillOpacity="0.85" />
        <rect x="13" y="18.5" width="4.4" height="8" rx="1" fill="#16E563" />
        <rect x="19" y="13.5" width="4.4" height="13" rx="1" fill="#16E563" />
        <rect x="25" y="9" width="4.4" height="17.5" rx="1" fill="#2BF074" />
        {/* Rising Green Trajectory Arrow */}
        <path
          d="M8.5 21.5L16.5 14.5L21 15.8L27.8 8.5"
          stroke="#FFFFFF"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.2 8.2H28.2V12.2"
          stroke="#2BF074"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`${textSize} font-bold tracking-tight ${primaryText}`}>
          Grid<span className={accentText}>pips</span>
        </span>
        {showTagline && (
          <span className="text-[9px] tracking-[0.18em] text-emerald-300/70 font-medium mt-0.5 uppercase">
            Trade · Invest · Prosper
          </span>
        )}
      </span>
    </span>
  );
};

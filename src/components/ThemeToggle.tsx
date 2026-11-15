import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'
      } ${
        isDark
          ? 'bg-[#12100C] border-[#2B251A] hover:border-[#E5A93C]/70 text-[#F5F2EB]'
          : 'bg-white border-slate-300 hover:border-amber-500 text-slate-800 shadow-xs'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-[#E5A93C]" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-amber-600" />
      )}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
};

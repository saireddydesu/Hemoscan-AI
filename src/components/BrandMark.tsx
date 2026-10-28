import React from 'react';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'md' }) => {
  const iconSize = size === 'sm' ? 26 : size === 'lg' ? 36 : 30;
  const textClass =
    size === 'sm'
      ? 'text-base font-semibold tracking-tight'
      : size === 'lg'
        ? 'text-xl font-semibold tracking-tight'
        : 'text-lg font-semibold tracking-tight';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <radialGradient id="rbcOuter" cx="36%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#F87171" />
            <stop offset="38%" stopColor="#DC2626" />
            <stop offset="78%" stopColor="#881327" />
            <stop offset="100%" stopColor="#450A14" />
          </radialGradient>
          <radialGradient id="rbcConcave" cx="52%" cy="54%" r="50%">
            <stop offset="0%" stopColor="#3B0610" stopOpacity="0.92" />
            <stop offset="65%" stopColor="#7F1D1D" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rbcRim" x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FCA5A5" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#DC2626" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        {/* Tilted 3D Biconcave Erythrocyte Disc */}
        <g transform="rotate(-22 20 20)">
          <ellipse cx="20" cy="20" rx="15.5" ry="11.5" fill="url(#rbcOuter)" />
          <ellipse cx="20" cy="20" rx="9" ry="6.2" fill="url(#rbcConcave)" />
          <ellipse
            cx="20"
            cy="20"
            rx="15"
            ry="11"
            stroke="url(#rbcRim)"
            strokeWidth="1"
          />
          <path
            d="M9.5 16.5C12.2 12.8 17.5 11.2 23.2 12.2"
            stroke="#FECACA"
            strokeOpacity="0.45"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <span className={`${textClass} font-display text-[#F8FAFC]`}>HemoScan AI</span>
    </div>
  );
};

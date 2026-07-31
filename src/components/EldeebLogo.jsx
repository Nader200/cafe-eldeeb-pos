import React from 'react';
import { ELDEEB_ROYAL_LOGO_DATA_URL } from '../assets/images/logoDataUrl';

// Primary high-resolution master brand logo
export const MASTER_LOGO_SRC = ELDEEB_ROYAL_LOGO_DATA_URL;

export const EldeebLogo = ({ className = 'w-10 h-10', style = {} }) => (
  <div className="flex items-center gap-2">
    <img
      src={MASTER_LOGO_SRC}
      alt="كافيه الديب POS"
      className={`object-contain rounded-full shadow-md ${className}`}
      style={style}
    />
    <span className="font-bold text-lg text-[#d4af37]">كافيه الديب</span>
  </div>
);

export const EldeebAppIcon = ({ className = 'w-8 h-8', style = {} }) => (
  <img
    src={MASTER_LOGO_SRC}
    alt="App Icon"
    className={`object-contain rounded-full shadow-sm ${className}`}
    style={style}
  />
);

export const EldeebLogoFull = ({
  className = 'w-48',
  variant = 'gold',
  showSubtext = false,
  style = {}
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 ${className}`} style={style}>
      <img
        src={MASTER_LOGO_SRC}
        alt="كافيه الديب - Cafe Eldeeb POS Enterprise"
        className="w-full h-auto max-h-[220px] object-contain drop-shadow-[0_4px_20px_rgba(212,175,55,0.35)] transition-transform duration-300 hover:scale-105"
      />
    </div>
  );
};

export const EldeebLogoHeader = ({ className = 'h-10', variant = 'gold', style = {} }) => {
  const isWhite = variant === 'white';
  const textColorClass = isWhite ? 'text-white' : 'text-[#d4af37]';

  return (
    <div className={`flex items-center gap-3 ${className}`} style={style}>
      <img
        src={MASTER_LOGO_SRC}
        alt="Header Logo"
        className="h-full w-auto aspect-square object-contain drop-shadow-[0_2px_10px_rgba(212,175,55,0.4)] shrink-0 transition-transform hover:scale-105"
      />
      <div className="flex flex-col text-right justify-center">
        <span className={`font-black text-base leading-tight ${textColorClass}`}>
          كافيه الديب
        </span>
        <span className="text-[9px] font-mono font-bold text-[#d4af37]/80 tracking-wider">
          POS ENTERPRISE
        </span>
      </div>
    </div>
  );
};

export default EldeebLogoFull;

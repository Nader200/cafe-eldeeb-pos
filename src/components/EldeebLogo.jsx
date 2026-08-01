import React from 'react';
import { ELDEEB_ROYAL_LOGO_DATA_URL, ELDEEB_ROYAL_LOGO_FULL_DATA_URL } from '../assets/images/logoDataUrl';

// Primary high-resolution master brand logo
export const MASTER_LOGO_SRC = ELDEEB_ROYAL_LOGO_DATA_URL;

export const EldeebLogo = ({ className = 'w-14 h-auto', style = {} }) => (
  <div className="flex items-center gap-2">
    <img
      src={MASTER_LOGO_SRC}
      alt="كافيه الديب POS"
      className={`object-contain max-h-14 ${className}`}
      style={{ filter: 'contrast(112%) brightness(102%)', imageRendering: '-webkit-optimize-contrast', ...style }}
    />
  </div>
);

export const EldeebAppIcon = ({ className = 'w-12 h-12', style = {} }) => (
  <img
    src={MASTER_LOGO_SRC}
    alt="App Icon"
    className={`object-contain ${className}`}
    style={{ filter: 'contrast(112%) brightness(102%)', imageRendering: '-webkit-optimize-contrast', ...style }}
  />
);

export const EldeebLogoFull = ({
  className = 'w-64 sm:w-80',
  variant = 'gold',
  showSubtext = false,
  style = {}
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-2 p-1 ${className}`} style={{ filter: 'contrast(112%) brightness(102%)', imageRendering: '-webkit-optimize-contrast', ...style }}>
      <img
        src={MASTER_LOGO_SRC}
        alt="كافيه الديب - Cafe Eldeeb POS Enterprise"
        className="w-full h-auto max-h-[260px] object-contain drop-shadow-[0_4px_25px_rgba(212,175,55,0.4)] transition-transform duration-300 hover:scale-105 shrink-0"
      />
    </div>
  );
};

export const EldeebLogoHeader = ({ className = 'h-12', variant = 'gold', style = {} }) => {
  return (
    <div className={`flex items-center justify-center p-0.5 ${className}`} style={{ filter: 'contrast(112%) brightness(102%)', imageRendering: '-webkit-optimize-contrast', ...style }}>
      <img
        src={MASTER_LOGO_SRC}
        alt="Header Logo"
        className="h-full w-auto object-contain drop-shadow-[0_2px_12px_rgba(212,175,55,0.45)] transition-transform hover:scale-105 shrink-0"
      />
    </div>
  );
};

export default EldeebLogoFull;


import React from 'react';
import { normalizeThemeKey } from '../lib/themeEngine';

interface ThemeLogoDecorationProps {
  theme?: string;
  enabled?: boolean;
}

export default function ThemeLogoDecoration({
  theme,
  enabled = true,
}: ThemeLogoDecorationProps) {
  const normalizedKey = normalizeThemeKey(theme);

  if (!enabled) return null;

  switch (normalizedKey) {
    case 'RAMADAN':
      return (
        <div className="absolute -top-1 -right-2 pointer-events-none flex items-center gap-0.5 z-10">
          <span className="text-sm animate-pulse">🌙</span>
          <span className="text-xs animate-bounce" style={{ animationDuration: '4s' }}> Lantern 🏮</span>
        </div>
      );

    case 'EID':
      return (
        <div className="absolute -top-2 -right-1 pointer-events-none flex items-center gap-0.5 z-10">
          <span className="text-xs animate-bounce" style={{ animationDuration: '3s' }}>🎈</span>
          <span className="text-[10px] animate-pulse">✨</span>
        </div>
      );

    case 'WINTER':
      return (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-1 z-10">
          <span className="text-[11px] animate-pulse">❄️</span>
          <span className="text-[9px] text-sky-200">☕</span>
        </div>
      );

    case 'SUMMER':
      return (
        <div className="absolute -top-1.5 -right-1.5 pointer-events-none z-10">
          <span className="text-xs animate-spin" style={{ animationDuration: '15s' }}>☀️</span>
        </div>
      );

    case 'VALENTINE':
      return (
        <div className="absolute -top-1.5 -right-1.5 pointer-events-none z-10">
          <span className="text-xs animate-ping" style={{ animationDuration: '3s' }}>❤️</span>
        </div>
      );

    case 'NEW_YEAR':
      return (
        <div className="absolute -top-2 -right-1 pointer-events-none z-10 flex gap-0.5">
          <span className="text-xs animate-pulse">🎆</span>
          <span className="text-[10px] animate-bounce">✨</span>
        </div>
      );

    case 'LUXURY_COFFEE':
    default:
      return (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex items-center justify-center">
          <span className="text-[10px] animate-pulse text-amber-400">♨️</span>
        </div>
      );
  }
}

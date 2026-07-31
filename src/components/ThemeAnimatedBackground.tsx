import React, { useEffect, useRef } from 'react';
import { normalizeThemeKey } from '../lib/themeEngine';

interface ThemeAnimatedBackgroundProps {
  theme?: string;
  enabled?: boolean;
}

export default function ThemeAnimatedBackground({
  theme,
  enabled = true,
}: ThemeAnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const normalizedKey = normalizeThemeKey(theme);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particles Data Structure
    const particleCount = normalizedKey === 'NEW_YEAR' ? 45 : 30;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      color: string;
      phase: number;
      speed: number;
      extra?: any;
    }> = [];

    // Initialize particles based on theme
    for (let i = 0; i < particleCount; i++) {
      if (normalizedKey === 'WINTER') {
        // Snowflakes
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: Math.random() * 0.8 + 0.3,
          size: Math.random() * 3 + 1,
          alpha: Math.random() * 0.7 + 0.3,
          color: '#ffffff',
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.01,
        });
      } else if (normalizedKey === 'RAMADAN') {
        // Twinkling Stars & Dust
        particles.push({
          x: Math.random() * width,
          y: Math.random() * (height * 0.7),
          vx: (Math.random() - 0.5) * 0.2,
          vy: -Math.random() * 0.3 - 0.1,
          size: Math.random() * 2.5 + 0.8,
          alpha: Math.random() * 0.8 + 0.2,
          color: Math.random() > 0.4 ? '#22c55e' : '#f59e0b',
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.03 + 0.01,
        });
      } else if (normalizedKey === 'EID') {
        // Confetti & Balloons
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: Math.random() * 1.2 + 0.4,
          size: Math.random() * 5 + 2,
          alpha: Math.random() * 0.8 + 0.2,
          color: ['#a855f7', '#ec4899', '#f59e0b', '#3b82f6', '#10b981'][Math.floor(Math.random() * 5)],
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.05 + 0.02,
        });
      } else if (normalizedKey === 'SUMMER') {
        // Rising Bubbles
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -Math.random() * 0.8 - 0.2,
          size: Math.random() * 6 + 2,
          alpha: Math.random() * 0.4 + 0.15,
          color: '#14b8a6',
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.01,
        });
      } else if (normalizedKey === 'VALENTINE') {
        // Hearts Drift
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.sin(Math.random() * Math.PI) * 0.3,
          vy: -Math.random() * 0.7 - 0.2,
          size: Math.random() * 6 + 3,
          alpha: Math.random() * 0.6 + 0.2,
          color: Math.random() > 0.5 ? '#f43f5e' : '#fb7185',
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.01,
        });
      } else if (normalizedKey === 'NEW_YEAR') {
        // Fireworks Particles
        particles.push({
          x: Math.random() * width,
          y: Math.random() * (height * 0.5),
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          size: Math.random() * 3 + 1,
          alpha: Math.random() * 0.9 + 0.1,
          color: ['#38bdf8', '#f59e0b', '#e0e7ff', '#38bdf8', '#c084fc'][Math.floor(Math.random() * 5)],
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.04 + 0.02,
          extra: { life: Math.random() * 100 },
        });
      } else {
        // LUXURY COFFEE - Rising Coffee Steam & Golden Ember Dust
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -Math.random() * 0.6 - 0.15,
          size: Math.random() * 4 + 1.5,
          alpha: Math.random() * 0.5 + 0.1,
          color: Math.random() > 0.6 ? '#d4af37' : '#f59e0b',
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.01,
        });
      }
    }

    // Animation Loop
    let time = 0;
    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase) * 0.3;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * (0.7 + 0.3 * Math.sin(p.phase))));

        if (normalizedKey === 'VALENTINE') {
          // Draw Heart Shape
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const topCurveHeight = p.size * 0.3;
          ctx.moveTo(p.x, p.y + topCurveHeight);
          ctx.bezierCurveTo(
            p.x, p.y,
            p.x - p.size / 2, p.y,
            p.x - p.size / 2, p.y + topCurveHeight
          );
          ctx.bezierCurveTo(
            p.x - p.size / 2, p.y + (p.size + topCurveHeight) / 2,
            p.x, p.y + p.size,
            p.x, p.y + p.size
          );
          ctx.bezierCurveTo(
            p.x, p.y + p.size,
            p.x + p.size / 2, p.y + (p.size + topCurveHeight) / 2,
            p.x + p.size / 2, p.y + topCurveHeight
          );
          ctx.bezierCurveTo(
            p.x + p.size / 2, p.y,
            p.x, p.y,
            p.x, p.y + topCurveHeight
          );
          ctx.fill();
        } else if (normalizedKey === 'SUMMER') {
          // Draw translucent Bubble
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.fill();
        } else if (normalizedKey === 'EID') {
          // Confetti Rectangle
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.phase);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          // Soft Glowing Circle
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [normalizedKey, enabled]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Background Animated Canvas Layer */}
      {enabled && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen"
        />
      )}

      {/* Theme-Specific SVG Decorative Accents */}
      {normalizedKey === 'RAMADAN' && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Crescent Moon & Stars Top Corner */}
          <div className={`absolute top-6 left-12 text-emerald-400/20 text-6xl ${enabled ? 'animate-pulse' : ''}`}>
            🌙
          </div>
          {/* Swinging Lanterns */}
          <div className="absolute top-0 right-10 flex gap-6 opacity-30">
            <div className={`text-4xl text-amber-400 transform origin-top ${enabled ? 'animate-bounce' : ''}`} style={{ animationDuration: '6s' }}>
              🏮
            </div>
            <div className={`text-3xl text-emerald-400 transform origin-top ${enabled ? 'animate-bounce' : ''}`} style={{ animationDuration: '8s', animationDelay: '2s' }}>
              🏮
            </div>
          </div>
          <div className="absolute top-1/2 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>
      )}

      {normalizedKey === 'EID' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-10 left-16 text-5xl opacity-30 ${enabled ? 'animate-bounce' : ''}`} style={{ animationDuration: '5s' }}>
            🎈
          </div>
          <div className={`absolute top-20 right-20 text-6xl opacity-30 ${enabled ? 'animate-bounce' : ''}`} style={{ animationDuration: '7s', animationDelay: '1s' }}>
            🎉
          </div>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]" />
        </div>
      )}

      {normalizedKey === 'WINTER' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-8 left-10 text-4xl text-sky-300/30 ${enabled ? 'animate-spin' : ''}`} style={{ animationDuration: '20s' }}>
            ❄️
          </div>
          <div className={`absolute top-16 right-16 text-3xl text-sky-200/30 ${enabled ? 'animate-pulse' : ''}`}>
            ❄️
          </div>
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500/0 via-sky-400/40 to-sky-500/0" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl" />
        </div>
      )}

      {normalizedKey === 'SUMMER' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute -top-20 -left-20 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl ${enabled ? 'animate-pulse' : ''}`} />
          <div className={`absolute top-10 right-10 text-5xl opacity-25 ${enabled ? 'animate-spin' : ''}`} style={{ animationDuration: '30s' }}>
            ☀️
          </div>
          <div className="absolute bottom-10 left-20 text-4xl opacity-25">
            🍹
          </div>
        </div>
      )}

      {normalizedKey === 'VALENTINE' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-12 left-12 text-4xl opacity-30 ${enabled ? 'animate-ping' : ''}`} style={{ animationDuration: '4s' }}>
            ❤️
          </div>
          <div className={`absolute top-24 right-16 text-3xl opacity-25 ${enabled ? 'animate-pulse' : ''}`}>
            💖
          </div>
          <div className="absolute top-1/3 right-10 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl" />
        </div>
      )}

      {normalizedKey === 'NEW_YEAR' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-6 right-12 text-5xl opacity-30 ${enabled ? 'animate-pulse' : ''}`}>
            🎆
          </div>
          <div className={`absolute top-16 left-12 text-4xl opacity-30 ${enabled ? 'animate-bounce' : ''}`} style={{ animationDuration: '6s' }}>
            ✨
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px]" />
        </div>
      )}

      {normalizedKey === 'LUXURY_COFFEE' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 right-10 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-80 h-80 bg-amber-700/10 rounded-full blur-3xl" />
        </div>
      )}
    </div>
  );
}

import { dbService } from '../dbService';
import { PSDevice, PSSession } from '../types';

export function playPlayStationExpiredSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const beep = (delay: number, pitch = 880) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    };

    // 3 distinct clear beeps
    beep(0.0, 880);
    beep(0.3, 880);
    beep(0.6, 1046.5);
  } catch (err) {
    console.error('Audio play error:', err);
  }
}

export interface ExpiredSessionNotification {
  device: PSDevice;
  session: PSSession | null;
  totalCost: number;
  playerName: string;
  startTimeFormatted: string;
  endTimeFormatted: string;
}

export function checkAndExpirePSSessions(
  currentTime: Date,
  onNotify?: (notif: ExpiredSessionNotification) => void
): boolean {
  const devices = dbService.getPSDevices();
  const sessions = dbService.getPSSessions();
  let changed = false;

  devices.forEach(dev => {
    const isPlaying = dev.status === 'PLAYING_SINGLE' || dev.status === 'PLAYING_MULTI';
    if (!isPlaying) return;

    // Determine if session is limited
    let isLimited = !!dev.is_limited;
    let limitMin = dev.limit_minutes || 0;

    // Fallback parsing from notes if legacy data
    if (!isLimited && (dev.session_notes.includes('محدد') || dev.session_notes.includes('دقيقة'))) {
      isLimited = true;
      const match = dev.session_notes.match(/(?:محدد|محددة|وقت محدد):\s*(\d+)/) || dev.session_notes.match(/(\d+)\s*د/);
      if (match) limitMin = parseInt(match[1]);
    }

    if (!isLimited || limitMin <= 0) return;

    // Calculate played seconds
    let playedSecs = dev.session_accumulated_seconds || 0;
    if (dev.session_start_time) {
      const startMs = new Date(dev.session_start_time).getTime();
      playedSecs += Math.max(0, Math.floor((currentTime.getTime() - startMs) / 1000));
    }

    const limitSecs = limitMin * 60;

    if (playedSecs >= limitSecs) {
      // EXPIRED!
      const sess = sessions.find(s => s.id === dev.current_session_id);
      const isMulti = sess ? sess.session_type === 'MULTI' : dev.status === 'PLAYING_MULTI';
      
      dev.status = 'TIME_EXPIRED';
      dev.is_limited = true;
      dev.limit_minutes = limitMin;

      const hourlyPrice = sess 
        ? sess.hourly_price 
        : (isMulti ? dev.hourly_price_multi : dev.hourly_price_single);
      const totalCost = Math.round((limitSecs / 3600) * hourlyPrice * 10) / 10;

      if (sess) {
        sess.status = 'EXPIRED';
        sess.accumulated_seconds = limitSecs;
        sess.end_time = new Date().toISOString();
        sess.total_price = totalCost;
        dbService.savePSSession(sess);
      }

      const startTimeFormatted = dev.session_start_time 
        ? new Date(dev.session_start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '---';
      const endTimeFormatted = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

      if (!dev.expired_notified) {
        dev.expired_notified = true;
        
        // Trigger beep sound
        playPlayStationExpiredSound();

        if (onNotify) {
          onNotify({
            device: { ...dev },
            session: sess ? { ...sess } : null,
            totalCost,
            playerName: dev.session_notes || 'بدون ملاحظات',
            startTimeFormatted,
            endTimeFormatted
          });
        }
      }

      dbService.savePSDevice(dev);
      dbService.logAuditAction(
        'PS_SESSION_EXPIRED',
        `انتهى وقت جلسة جهاز البلايستيشن (${dev.name}) تلقائياً. المجموع المستحق: ${totalCost} ج.م`,
        'نظام التنبيه التلقائي'
      );
      changed = true;
    }
  });

  return changed;
}

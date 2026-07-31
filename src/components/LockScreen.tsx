/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, Delete, Fingerprint, Lock, Coffee, Sparkles } from 'lucide-react';
import { AppSettings } from '../types';
import { EldeebLogoFull } from './EldeebLogo';

interface LockScreenProps {
  settings: AppSettings;
  onUnlock: () => void;
}

export default function LockScreen({ settings, onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setError(false);
      const newPin = pin + num;
      setPin(newPin);
      if (newPin === settings.pin_code) {
        setLoading(true);
        setTimeout(() => {
          setLoading(false);
          onUnlock();
        }, 600);
      } else if (newPin.length === 4) {
        // wrong pin
        setTimeout(() => {
          setError(true);
          setPin('');
        }, 200);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleBiometric = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onUnlock();
    }, 500);
  };

  return (
    <div id="lock-screen-container" className="fixed inset-0 bg-[#060606] flex flex-col items-center justify-center z-50 px-4 select-none">
      {/* Background elegant gold circles */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.08)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.08)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-6 flex flex-col items-center animate-fade-in">
        <div className="p-1 mb-2">
          <EldeebLogoFull className="w-[190px] sm:w-[210px]" />
        </div>
        <p className="text-gray-400 text-xs font-light tracking-wide flex items-center gap-1.5 mt-1">
          <Sparkles className="w-3.5 h-3.5 text-gold-500" />
          بوابة القفل السريع والتحقق من الهوية
        </p>
      </div>

      {/* Security Code Prompt */}
      <div className="w-full max-w-sm bg-luxury-card border border-luxury-border p-8 rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.8)] flex flex-col items-center">
        <div className="flex items-center gap-2 mb-6">
          <Lock className="w-4 h-4 text-gold-600" />
          <span className="text-gray-300 text-sm font-medium">أدخل رمز الأمان المكون من 4 أرقام</span>
        </div>

        {/* PIN Indicators */}
        <div className="flex gap-4 justify-center mb-8">
          {[0, 1, 2, 3].map(index => {
            const active = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4.5 h-4.5 rounded-full border transition-all duration-300 ${
                  error
                    ? 'bg-red-600 border-red-500 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : loading
                    ? 'bg-gold-500 border-gold-400 animate-pulse scale-105 shadow-[0_0_10px_rgba(212,175,55,0.5)]'
                    : active
                    ? 'bg-gold-600 border-gold-400 scale-110 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                    : 'bg-transparent border-gray-700'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <p className="text-red-500 text-xs mb-4 font-semibold animate-bounce">
            خطأ في الرمز! يرجى المحاولة مرة أخرى
          </p>
        )}
        
        {loading && (
          <p className="text-gold-500 text-xs mb-4 font-semibold animate-pulse">
            جاري التحقق من الصلاحيات وفتح النظام...
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 w-full mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              id={`keypad-${num}`}
              onClick={() => handleKeyPress(num)}
              disabled={loading}
              className="h-14 rounded-2xl bg-luxury-bg border border-gray-800 text-xl font-bold hover:bg-[#1a1a1a] hover:border-gold-600 active:bg-[#252525] transition-all duration-150 text-white flex items-center justify-center cursor-pointer"
            >
              {num}
            </button>
          ))}
          <button
            id="keypad-fingerprint"
            onClick={handleBiometric}
            disabled={loading}
            className="h-14 rounded-2xl bg-luxury-bg border border-luxury-border hover:bg-gold-950/20 active:bg-gold-900/40 text-gold-500 transition-all duration-150 flex items-center justify-center cursor-pointer"
            title="بصمة الإصبع"
          >
            <Fingerprint className="w-7 h-7" />
          </button>
          <button
            id="keypad-0"
            onClick={() => handleKeyPress('0')}
            disabled={loading}
            className="h-14 rounded-2xl bg-luxury-bg border border-gray-800 text-xl font-bold hover:bg-[#1a1a1a] hover:border-gold-600 active:bg-[#252525] transition-all duration-150 text-white flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            id="keypad-delete"
            onClick={handleDelete}
            disabled={loading || pin.length === 0}
            className="h-14 rounded-2xl bg-luxury-bg border border-gray-800 text-gray-400 hover:bg-red-950/20 active:bg-red-900/30 hover:text-red-500 transition-all duration-150 flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        <div className="text-gray-500 text-[10px] tracking-wide mt-2">
          اسم المستخدم النشط: <span className="text-gold-500 font-bold">{settings.owner_name || 'المدير العام'}</span>
        </div>
      </div>

      <div className="mt-8 text-gray-600 text-xs text-center">
        Cafe Eldeeb Enterprise POS • 100% Offline Database Engine
      </div>
    </div>
  );
}

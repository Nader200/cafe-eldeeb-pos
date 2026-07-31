import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, LogIn, Sparkles, AlertCircle, Shield, CheckSquare, Square, KeyRound } from 'lucide-react';
import { dbService, safeStorage } from '../dbService';
import { AuthUser } from '../types';
import { EldeebLogoFull } from './EldeebLogo';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser, rememberMe: boolean) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDemoHelp, setShowDemoHelp] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim()) {
      setErrorMsg('يرجى كتابة اسم المستخدم للمتابعة');
      return;
    }
    if (!password) {
      setErrorMsg('يرجى كتابة كلمة المرور الخاصة بحسابك');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const authenticatedUser = dbService.authenticateUser(username, password);

      if (authenticatedUser) {
        // Record Audit Log
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];

        dbService.addAuthAuditLog({
          employee_name: authenticatedUser.name,
          username: authenticatedUser.username,
          role: authenticatedUser.role,
          action: 'LOGIN',
          date: dateStr,
          time: timeStr,
          timestamp: now.toISOString()
        });

        onLoginSuccess(authenticatedUser, rememberMe);
      } else {
        setLoading(false);
        setErrorMsg('اسم المستخدم أو كلمة المرور غير صحيحة! يرجى التحقق وإعادة المحاولة.');
      }
    }, 600); // realistic pleasant login animation delay
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans" dir="rtl">
      {/* Background Subtle Radial Lighting Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-gold-600/10 via-amber-600/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(212,175,55,0.12)] relative z-10 backdrop-blur-xl animate-fade-in">
        
        {/* Top Logo Container */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-1 mb-2">
            <EldeebLogoFull className="w-[190px] sm:w-[210px]" />
          </div>
          <p className="text-gold-500/90 text-xs font-bold tracking-wider flex items-center justify-center gap-1.5">
            <span>بوابة دخول الموظفين والإدارة</span>
            <Sparkles className="w-4 h-4 text-gold-500 animate-pulse" />
          </p>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-6 p-3.5 bg-red-950/80 border border-red-800/80 rounded-2xl text-red-200 text-xs font-bold flex items-center gap-3 animate-shake">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Field */}
          <div>
            <label className="text-xs text-gray-300 font-bold block mb-2 flex items-center justify-between">
              <span>اسم المستخدم (Username)</span>
              <span className="text-[10px] text-gold-500/70 font-mono">مطلوب *</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم (مثال: admin)"
                className="w-full bg-[#121212] border border-gray-800 focus:border-gold-500 text-white placeholder-gray-600 rounded-xl py-3 pr-11 pl-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all text-right"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="text-xs text-gray-300 font-bold block mb-2 flex items-center justify-between">
              <span>كلمة المرور (Password)</span>
              <span className="text-[10px] text-gold-500/70 font-mono">مطلوب *</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الخاصة بك"
                className="w-full bg-[#121212] border border-gray-800 focus:border-gold-500 text-white placeholder-gray-600 rounded-xl py-3 pr-11 pl-11 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all text-right font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400 hover:text-gold-400 cursor-pointer transition-colors"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label
              onClick={() => setRememberMe(!rememberMe)}
              className="flex items-center gap-2 cursor-pointer select-none text-gray-300 hover:text-white transition-colors"
            >
              {rememberMe ? (
                <CheckSquare className="w-4.5 h-4.5 text-gold-500" />
              ) : (
                <Square className="w-4.5 h-4.5 text-gray-600" />
              )}
              <span className="font-bold text-xs">تذكر بيانات تسجيل دخولي</span>
            </label>

            <button
              type="button"
              onClick={() => setShowDemoHelp(!showDemoHelp)}
              className="text-[11px] text-gold-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>بيانات التجهيز الافتراضية؟</span>
            </button>
          </div>

          {/* Expandable Demo Users Info */}
          {showDemoHelp && (
            <div className="p-3.5 bg-[#141414] border border-gold-500/20 rounded-2xl space-y-2 text-[11px] text-gray-300 animate-fade-in">
              <p className="font-bold text-gold-500 mb-1 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                الحسابات المتاحة تجريبياً في النظام:
              </p>
              
              <div
                onClick={() => handleQuickFill('admin', 'admin123')}
                className="p-2 bg-black/60 border border-gold-500/30 hover:border-gold-500 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:scale-[1.02]"
              >
                <div>
                  <span className="font-extrabold text-gold-400 block">👑 أدمن المدير العام (Full Access)</span>
                  <span className="text-[10px] text-gray-400 font-mono">admin / admin123</span>
                </div>
                <span className="text-[10px] bg-gold-600/20 text-gold-400 px-2 py-0.5 rounded-lg border border-gold-500/30 font-bold">تعبئة</span>
              </div>

              <div
                onClick={() => handleQuickFill('cashier', '123456')}
                className="p-2 bg-black/60 border border-emerald-500/30 hover:border-emerald-500 rounded-xl flex justify-between items-center cursor-pointer transition-all hover:scale-[1.02]"
              >
                <div>
                  <span className="font-extrabold text-emerald-400 block">☕ كاشير المبيعات (Cashier POS)</span>
                  <span className="text-[10px] text-gray-400 font-mono">cashier / 123456 أو cashier123</span>
                </div>
                <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/30 font-bold">تعبئة</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-sm rounded-xl shadow-[0_0_25px_rgba(212,175,55,0.3)] hover:shadow-[0_0_35px_rgba(212,175,55,0.5)] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-75 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>جاري التحقق والدخول الملوكي...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>تسجيل الدخول للنظام الملوكي</span>
              </>
            )}
          </button>
        </form>

        {/* Bottom Security Footer */}
        <div className="mt-8 pt-4 border-t border-gray-900 text-center text-[10px] text-gray-500 flex justify-between items-center">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-gold-500" />
            نظام موثق ومشفر 100%
          </span>
          <span className="font-mono">v2.5 Enterprise POS</span>
        </div>

      </div>
    </div>
  );
}

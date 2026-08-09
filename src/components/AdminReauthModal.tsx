import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, Eye, EyeOff, ShieldAlert, ShieldCheck, X, Key } from 'lucide-react';
import {
  isAdminSecurityPasswordSet,
  verifyAdminSecurityPassword,
  setAdminSecurityPassword
} from '../lib/securityService';

interface AdminReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetTabName?: string;
}

export default function AdminReauthModal({
  isOpen,
  onClose,
  onSuccess,
  targetTabName
}: AdminReauthModalProps) {
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  
  // Verification states
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Initial Setup states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsConfigured(isAdminSecurityPasswordSet());
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Verification submit
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!password.trim()) {
      setErrorMsg('يرجى إدخال كلمة مرور حماية الشاشات الحساسة');
      return;
    }

    setLoading(true);
    try {
      const isValid = await verifyAdminSecurityPassword(password);
      setLoading(false);

      if (isValid) {
        setPassword('');
        setErrorMsg(null);
        onSuccess();
      } else {
        setErrorMsg('كلمة مرور حماية الشاشات الحساسة غير صحيحة! (ملاحظة: كلمة مرور تسجيل الدخول العادية لا تُقبل هنا).');
      }
    } catch (err) {
      setLoading(false);
      setErrorMsg('حدث خطأ أثناء التحقق من كلمة المرور!');
    }
  };

  // Initial setup submit
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!newPassword.trim()) {
      setErrorMsg('يرجى إدخال كلمة مرور حماية جديدة');
      return;
    }

    if (newPassword.trim().length < 4) {
      setErrorMsg('كلمة مرور الحماية يجب أن تتكون من 4 خانات على الأقل');
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMsg('كلمتا المرور غير متطابقتين! يرجى إعادة التأكد.');
      return;
    }

    setLoading(true);
    try {
      await setAdminSecurityPassword(newPassword.trim());
      setLoading(false);
      setIsConfigured(true);
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setErrorMsg('حدث خطأ أثناء حفظ كلمة مرور الحماية الجديدة!');
    }
  };

  const handleCancel = () => {
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" dir="rtl">
      <div className="w-full max-w-md bg-[#0d0d0d] border border-gold-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(212,175,55,0.2)] relative">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 left-4 p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800/60 transition-colors cursor-pointer"
          title="إلغاء وإغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {isConfigured ? (
          /* Verification Mode */
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mb-3 shadow-inner">
                <ShieldAlert className="w-8 h-8 text-gold-400 animate-pulse" />
              </div>
              <h3 className="text-lg font-black text-white mb-1">
                كلمة مرور حماية الشاشات الحساسة 🔐
              </h3>
              <p className="text-xs text-gray-400 font-bold max-w-xs">
                {targetTabName
                  ? `يتطلب فتح شاشة "${targetTabName}" إدخال كلمة مرور الحماية الملوكية المستقلة.`
                  : 'أدخل كلمة مرور حماية الشاشات الحساسة للمتابعة.'}
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-950/80 border border-red-800/80 rounded-xl text-red-200 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gold-400 mb-2">
                  كلمة مرور الحماية الملوكية (مستقلة عن تسجيل الدخول):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة مرور الحماية..."
                    className="w-full bg-[#141414] border border-gray-800 focus:border-gold-500 text-white placeholder-gray-600 rounded-xl py-3 pr-11 pl-11 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all text-right font-mono"
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

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-5 py-2.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>جاري التوثيق...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>تأكيد وفتح الشاشة</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Initial Setup Mode */
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
                <ShieldCheck className="w-8 h-8 text-amber-400 animate-bounce" />
              </div>
              <h3 className="text-lg font-black text-white mb-1">
                إعداد كلمة مرور حماية الشاشات الحساسة 🔐
              </h3>
              <p className="text-xs text-gray-400 font-bold max-w-xs leading-relaxed">
                لم يتم تعيين كلمة مرور حماية مستقلة بعد. يرجى إنشاء كلمة مرور ملوكية جديدة لحماية الشاشات والعمليات الحساسة.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-950/80 border border-red-800/80 rounded-xl text-red-200 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  أنشئ كلمة مرور الحماية الجديدة:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                    <Key className="w-5 h-5" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    autoFocus
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="كلمة مرور الحماية..."
                    className="w-full bg-[#141414] border border-gray-800 focus:border-gold-500 text-white placeholder-gray-600 rounded-xl py-3 pr-11 pl-11 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all text-right font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400 hover:text-gold-400 cursor-pointer transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  تأكيد كلمة مرور الحماية:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور..."
                    className="w-full bg-[#141414] border border-gray-800 focus:border-gold-500 text-white placeholder-gray-600 rounded-xl py-3 pr-11 pl-11 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all text-right font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-5 py-2.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>حفظ كلمة المرور والدخول</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}

        <div className="mt-5 pt-3 border-t border-gray-900 text-center text-[10px] text-gray-500 font-mono">
          حماية مشفرة بحفظ آمن في قاعدة البيانات • حالة الدخول مؤقتة في الذاكرة فقط
        </div>
      </div>
    </div>
  );
}

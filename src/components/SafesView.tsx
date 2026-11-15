import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Wallet,
  Lock,
  Plus,
  Minus,
  ArrowLeftRight,
  Moon,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Coins,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { dbService } from '../dbService';
import { AppSettings, SafeTransaction, SafeType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isAdminSecurityPasswordSet } from '../lib/securityService';
import ResetCashDrawerModal from './ResetCashDrawerModal';

interface SafesViewProps {
  settings: AppSettings;
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  onSettingsChanged?: () => void;
  embedded?: boolean;
}

export default function SafesView({
  settings,
  onShowSuccessAlert,
  onShowWarningAlert,
  onSettingsChanged,
  embedded = false
}: SafesViewProps) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';
  const hasSecPass = isAdminSecurityPasswordSet();

  const [tick, setTick] = useState(0);
  const [transactions, setTransactions] = useState<SafeTransaction[]>(() => dbService.getSafeTransactions());
  const [mainSafeBalance, setMainSafeBalance] = useState<number>(() => dbService.getSafeBalance('MAIN_SAFE'));
  const [privateSafeBalance, setPrivateSafeBalance] = useState<number>(() => dbService.getSafeBalance('PRIVATE_SAFE'));
  const [drawerBalance, setDrawerBalance] = useState<number>(() => {
    const d = dbService.getActiveDrawer();
    return Math.round((d.opening_balance + d.cash_in - d.cash_out) * 100) / 100;
  });

  // Auto-transfer config from settings
  const [autoTransferEnabled, setAutoTransferEnabled] = useState<boolean>(
    settings.safe_auto_transfer_enabled !== false
  );
  const [autoTransferSource, setAutoTransferSource] = useState<'BOTH' | 'DRAWER_ONLY' | 'MAIN_SAFE_ONLY'>(
    settings.safe_auto_transfer_source || 'BOTH'
  );

  // Main Safe Daily Deposit form
  const [dailyDepositAmount, setDailyDepositAmount] = useState<string>('');
  const [dailyDepositNotes, setDailyDepositNotes] = useState<string>('');

  // Main Safe Transfer / Withdrawal form
  const [mainOpType, setMainOpType] = useState<'TO_DRAWER' | 'FROM_DRAWER' | 'TO_PRIVATE' | 'WITHDRAW'>('TO_DRAWER');
  const [mainOpAmount, setMainOpAmount] = useState<string>('');
  const [mainOpNotes, setMainOpNotes] = useState<string>('');

  // Private Safe Withdrawal form
  const [privWithdrawAmount, setPrivWithdrawAmount] = useState<string>('');
  const [privWithdrawNotes, setPrivWithdrawNotes] = useState<string>('');
  const [privWithdrawCred, setPrivWithdrawCred] = useState<string>('');
  const [showPrivCred, setShowPrivCred] = useState(false);

  // EOD Manual Sweep Modal
  const [showSweepModal, setShowSweepModal] = useState(false);
  const [sweepNotes, setSweepNotes] = useState('');
  const [sweepCred, setSweepCred] = useState('');
  const [showSweepCred, setShowSweepCred] = useState(false);
  const [sweepLoading, setSweepLoading] = useState(false);

  // Reset Drawer Modal
  const [showResetDrawerModal, setShowResetDrawerModal] = useState(false);

  // Ledger Filter
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'MAIN_SAFE' | 'PRIVATE_SAFE' | 'AUTO_DAILY'>('ALL');

  const refreshAll = () => {
    setTransactions(dbService.getSafeTransactions());
    setMainSafeBalance(dbService.getSafeBalance('MAIN_SAFE'));
    setPrivateSafeBalance(dbService.getSafeBalance('PRIVATE_SAFE'));
    const d = dbService.getActiveDrawer();
    setDrawerBalance(Math.round((d.opening_balance + d.cash_in - d.cash_out) * 100) / 100);
    const freshSettings = dbService.getSettings();
    setAutoTransferEnabled(freshSettings.safe_auto_transfer_enabled !== false);
    setAutoTransferSource(freshSettings.safe_auto_transfer_source || 'BOTH');
    setTick(t => t + 1);
  };

  useEffect(() => {
    refreshAll();
    const onSync = () => refreshAll();
    window.addEventListener('safe_updated', onSync);
    window.addEventListener('shift_updated', onSync);
    window.addEventListener('cafe_db_synced_remote', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('safe_updated', onSync);
      window.removeEventListener('shift_updated', onSync);
      window.removeEventListener('cafe_db_synced_remote', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [tick]);

  const todayMainDeposits = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.safe_type === 'MAIN_SAFE' &&
          t.date === todayStr &&
          (t.transaction_type === 'DAILY_DEPOSIT' || t.transaction_type === 'DEPOSIT')
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions, todayStr]);

  const totalAutoTransferredToPrivate = useMemo(() => {
    return transactions
      .filter(t => t.safe_type === 'PRIVATE_SAFE' && t.transaction_type === 'AUTO_DAILY_TRANSFER')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions]);

  const pendingSweepPreview = useMemo(() => {
    const fromDrawer =
      autoTransferSource === 'BOTH' || autoTransferSource === 'DRAWER_ONLY' ? Math.max(0, drawerBalance) : 0;
    const fromMain =
      autoTransferSource === 'BOTH' || autoTransferSource === 'MAIN_SAFE_ONLY' ? Math.max(0, mainSafeBalance) : 0;
    return {
      fromDrawer,
      fromMain,
      total: Math.round((fromDrawer + fromMain) * 100) / 100
    };
  }, [drawerBalance, mainSafeBalance, autoTransferSource]);

  const filteredTransactions = useMemo(() => {
    const reversed = [...transactions].reverse();
    if (ledgerFilter === 'MAIN_SAFE') return reversed.filter(t => t.safe_type === 'MAIN_SAFE');
    if (ledgerFilter === 'PRIVATE_SAFE') return reversed.filter(t => t.safe_type === 'PRIVATE_SAFE');
    if (ledgerFilter === 'AUTO_DAILY') return reversed.filter(t => t.transaction_type === 'AUTO_DAILY_TRANSFER');
    return reversed;
  }, [transactions, ledgerFilter]);

  if (!isAdmin) {
    return (
      <div className="bg-luxury-card border border-red-900/50 p-8 rounded-3xl text-center space-y-4 my-8 max-w-lg mx-auto" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-white">صلاحية مقصورة على الأدمن فقط</h3>
        <p className="text-xs text-gray-400">إدارة الخزنة الرئيسية والخزنة الخاصة متاحة فقط لحساب الأدمن.</p>
      </div>
    );
  }

  // Handlers
  const handleDailyDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(dailyDepositAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ يومي صحيح أكبر من صفر');
      return;
    }
    try {
      dbService.addMainSafeDeposit(amt, currentUser?.name || 'أدمن النظام', dailyDepositNotes, true);
      onShowSuccessAlert(`تمت إضافة ${amt.toLocaleString('ar-EG')} ج.م إلى الخزنة الرئيسية بنجاح 💰`);
      setDailyDepositAmount('');
      setDailyDepositNotes('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'حدث خطأ أثناء الإضافة للخزنة الرئيسية');
    }
  };

  const handleMainOperationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(mainOpAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    const opName = currentUser?.name || 'أدمن النظام';
    try {
      if (mainOpType === 'TO_DRAWER') {
        dbService.transferMainSafeToDrawer(amt, opName, mainOpNotes);
        onShowSuccessAlert(`تم تحويل ${amt.toLocaleString('ar-EG')} ج.م من الخزنة الرئيسية لتغذية الدرج ✅`);
      } else if (mainOpType === 'FROM_DRAWER') {
        dbService.transferDrawerToMainSafe(amt, opName, mainOpNotes);
        onShowSuccessAlert(`تم توريد ${amt.toLocaleString('ar-EG')} ج.م من الدرج إلى الخزنة الرئيسية ✅`);
      } else if (mainOpType === 'TO_PRIVATE') {
        dbService.transferMainSafeToPrivateSafe(amt, opName, mainOpNotes);
        onShowSuccessAlert(`تم ترحيل ${amt.toLocaleString('ar-EG')} ج.م من الخزنة الرئيسية إلى الخزنة الخاصة 🔐`);
      } else {
        dbService.withdrawFromSafe('MAIN_SAFE', amt, opName, mainOpNotes);
        onShowSuccessAlert(`تم سحب ${amt.toLocaleString('ar-EG')} ج.م من الخزنة الرئيسية بنجاح.`);
      }
      setMainOpAmount('');
      setMainOpNotes('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر تنفيذ العملية');
    }
  };

  const handlePrivateWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(privWithdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (!privWithdrawCred.trim()) {
      onShowWarningAlert(hasSecPass ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة' : 'يرجى إدخال رمز الأمان PIN');
      return;
    }
    const valid = await dbService.verifyAdminActionCredential(privWithdrawCred);
    if (!valid) {
      onShowWarningAlert(hasSecPass ? 'كلمة مرور حماية الشاشات الحساسة غير صحيحة!' : 'رمز الأمان PIN غير صحيح!');
      return;
    }
    try {
      dbService.withdrawFromSafe(
        'PRIVATE_SAFE',
        amt,
        currentUser?.name || 'أدمن النظام',
        privWithdrawNotes || 'سحب إداري من الخزنة الخاصة'
      );
      onShowSuccessAlert(`تم سحب ${amt.toLocaleString('ar-EG')} ج.م من الخزنة الخاصة بنجاح ✅`);
      setPrivWithdrawAmount('');
      setPrivWithdrawNotes('');
      setPrivWithdrawCred('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر السحب من الخزنة الخاصة');
    }
  };

  const handleSaveAutoTransferConfig = (
    nextEnabled: boolean,
    nextSource: 'BOTH' | 'DRAWER_ONLY' | 'MAIN_SAFE_ONLY'
  ) => {
    setAutoTransferEnabled(nextEnabled);
    setAutoTransferSource(nextSource);
    dbService.saveSettings({
      safe_auto_transfer_enabled: nextEnabled,
      safe_auto_transfer_source: nextSource
    });
    onSettingsChanged?.();
    onShowSuccessAlert(
      nextEnabled
        ? 'تم تفعيل الترحيل التلقائي للباقي إلى الخزنة الخاصة في نهاية اليوم ✅'
        : 'تم إيقاف الترحيل التلقائي للخزنة الخاصة'
    );
  };

  const handleManualSweepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sweepCred.trim()) {
      onShowWarningAlert(hasSecPass ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة' : 'يرجى إدخال رمز الأمان PIN');
      return;
    }
    setSweepLoading(true);
    try {
      const res = await dbService.performEndOfDaySafeSweep(
        sweepCred.trim(),
        currentUser?.name || 'أدمن النظام',
        sweepNotes
      );
      setSweepLoading(false);
      setShowSweepModal(false);
      setSweepCred('');
      setSweepNotes('');
      if (res.totalTransferred > 0) {
        onShowSuccessAlert(
          `تم ترحيل المتبقي (${res.totalTransferred.toLocaleString('ar-EG')} ج.م) تلقائياً إلى الخزنة الخاصة وتصفير الدرج لليوم الجديد 🔐`
        );
      } else {
        onShowWarningAlert('لا يوجد رصيد متبقٍ حالياً للترحيل إلى الخزنة الخاصة.');
      }
      refreshAll();
    } catch (err: any) {
      setSweepLoading(false);
      onShowWarningAlert(err?.message || 'فشل تنفيذ الترحيل للخزنة الخاصة');
    }
  };

  const getTxBadge = (tx: SafeTransaction) => {
    switch (tx.transaction_type) {
      case 'DAILY_DEPOSIT':
        return { label: 'مبلغ يومي للخزنة', cls: 'bg-emerald-950/50 text-emerald-400 border-emerald-700/40', sign: '+' };
      case 'DEPOSIT':
        return { label: 'إيداع يدوي', cls: 'bg-green-950/50 text-green-400 border-green-700/40', sign: '+' };
      case 'TRANSFER_FROM_DRAWER':
        return { label: 'توريد من الدرج', cls: 'bg-cyan-950/50 text-cyan-400 border-cyan-700/40', sign: '+' };
      case 'TRANSFER_TO_DRAWER':
        return { label: 'تغذية الدرج', cls: 'bg-amber-950/50 text-amber-400 border-amber-700/40', sign: '-' };
      case 'WITHDRAWAL':
        return { label: 'سحب من الخزنة', cls: 'bg-red-950/50 text-red-400 border-red-700/40', sign: '-' };
      case 'TRANSFER_TO_PRIVATE':
        return {
          label: tx.safe_type === 'PRIVATE_SAFE' ? 'استلام من الرئيسية' : 'ترحيل للخاصة',
          cls: 'bg-purple-950/50 text-purple-300 border-purple-700/40',
          sign: tx.safe_type === 'PRIVATE_SAFE' ? '+' : '-'
        };
      case 'AUTO_DAILY_TRANSFER':
        return {
          label: 'ترحيل نهاية اليوم التلقائي',
          cls: 'bg-gold-500/15 text-gold-400 border-gold-500/40',
          sign: tx.safe_type === 'PRIVATE_SAFE' ? '+' : '-'
        };
      default:
        return { label: 'حركة خزنة', cls: 'bg-gray-900 text-gray-300 border-gray-700', sign: '' };
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header (hidden when embedded in CashDrawerView tab) */}
      {!embedded && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-luxury-card border border-gold-500/30 p-6 rounded-3xl shadow-lg">
          <div>
            <h2 className="text-xl font-black text-white mb-1 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-gold-500" />
              <span>نظام الخزنة الرئيسية والخزنة الخاصة (للأدمن فقط)</span>
            </h2>
            <p className="text-gray-400 text-xs">
              إضافة المبلغ اليومي بالخزنة الرئيسية، تغذية الدرج، والترحيل التلقائي للباقي في نهاية اليوم إلى الخزنة الخاصة
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowResetDrawerModal(true)}
            className="px-4 py-2.5 bg-red-950/60 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-md active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تصفير حساب الدرج (أدمن)</span>
          </button>
        </div>
      )}

      {/* Top 3 Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Cash Drawer */}
        <div className="bg-luxury-card border border-gray-800 rounded-3xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400">رصيد درج النقدية المفتوح</span>
            <Wallet className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-white">
              {drawerBalance.toLocaleString('ar-EG')} <span className="text-xs text-gray-400 font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">السيولة التشغيلية المتاحة في درج الكاشير حالياً</p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetDrawerModal(true)}
            className="w-full py-2 px-3 bg-red-950/40 hover:bg-red-600/90 border border-red-500/30 text-red-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>تصفير حساب الدرج (أدمن فقط)</span>
          </button>
        </div>

        {/* Card 2: Main Safe (الخزنة الرئيسية) */}
        <div className="bg-gradient-to-br from-[#0f130d] to-black border-2 border-emerald-500/40 rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-[0_0_25px_rgba(16,185,129,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-400" />
              الخزنة الرئيسية (اليومية)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              تغذية يومية
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {mainSafeBalance.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              مضاف اليوم: <strong className="text-emerald-300 font-mono">{todayMainDeposits.toLocaleString('ar-EG')} ج.م</strong>
            </p>
          </div>
        </div>

        {/* Card 3: Private Safe (الخزنة الخاصة) */}
        <div className="bg-gradient-to-br from-[#171206] to-black border-2 border-gold-500/50 rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-[0_0_25px_rgba(212,175,55,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gold-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-gold-400" />
              الخزنة الخاصة (للأدمن)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gold-500/15 text-gold-300 border border-gold-500/30">
              {autoTransferEnabled ? 'ترحيل تلقائي مفعّل ✅' : 'ترحيل يدوي'}
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-gold-400">
              {privateSafeBalance.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              إجمالي المرحّل تلقائياً نهاية اليوم:{' '}
              <strong className="text-gold-300 font-mono">{totalAutoTransferredToPrivate.toLocaleString('ar-EG')} ج.م</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Main Safe Operations & Private Safe / Auto-Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: MAIN SAFE (الخزنة الرئيسية) */}
        <div className="space-y-6">
          {/* 1A: Daily Deposit Form */}
          <div className="bg-luxury-card border border-emerald-500/30 rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              إضافة المبلغ اليومي في الخزنة الرئيسية
            </h3>
            <p className="text-[11px] text-gray-400 mb-4 pb-3 border-b border-gray-900">
              يقوم الأدمن بإضافة السيولة اليومية في الخزنة الرئيسية لتغطية المصروفات أو تغذية الدرج
            </p>

            <form onSubmit={handleDailyDepositSubmit} className="space-y-4">
              {/* Quick Preset Chips */}
              <div className="flex flex-wrap gap-2">
                {[500, 1000, 1500, 2000, 3000, 5000].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDailyDepositAmount(String(preset))}
                    className="px-3 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold cursor-pointer transition-all"
                  >
                    +{preset.toLocaleString('ar-EG')} ج
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">المبلغ اليومي المضاف (ج.م) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={dailyDepositAmount}
                    onChange={(e) => setDailyDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-emerald-500 text-emerald-400 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">ملاحظات / البيان (اختياري)</label>
                  <input
                    type="text"
                    value={dailyDepositNotes}
                    onChange={(e) => setDailyDepositNotes(e.target.value)}
                    placeholder="مثال: رصيد تشغيل يومي صباحي..."
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-emerald-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-black font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Coins className="w-4 h-4" />
                <span>إضافة المبلغ اليومي للخزنة الرئيسية</span>
              </button>
            </form>
          </div>

          {/* 1B: Main Safe Transfers & Withdrawals */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-gold-400" />
              تحويلات وحركات الخزنة الرئيسية
            </h3>
            <p className="text-[11px] text-gray-400 mb-4 pb-3 border-b border-gray-900">
              تغذية الدرج من الخزنة الرئيسية، أو توريد نقدية من الدرج، أو الترحيل/السحب
            </p>

            <form onSubmit={handleMainOperationSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMainOpType('TO_DRAWER')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mainOpType === 'TO_DRAWER'
                      ? 'bg-gold-600 text-black border-gold-500 shadow'
                      : 'bg-luxury-bg border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>تغذية الدرج من الخزنة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainOpType('FROM_DRAWER')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mainOpType === 'FROM_DRAWER'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow'
                      : 'bg-luxury-bg border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>توريد من الدرج للخزنة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainOpType('TO_PRIVATE')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mainOpType === 'TO_PRIVATE'
                      ? 'bg-purple-600 text-white border-purple-500 shadow'
                      : 'bg-luxury-bg border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>ترحيل للخزنة الخاصة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainOpType('WITHDRAW')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mainOpType === 'WITHDRAW'
                      ? 'bg-red-600 text-white border-red-500 shadow'
                      : 'bg-luxury-bg border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" />
                  <span>سحب من الخزنة الرئيسية</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={mainOpAmount}
                    onChange={(e) => setMainOpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-gold-500 text-gold-400 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">السبب / الملاحظات</label>
                  <input
                    type="text"
                    value={mainOpNotes}
                    onChange={(e) => setMainOpNotes(e.target.value)}
                    placeholder="اكتب بيان الحركة..."
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-gold-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-zinc-900 hover:bg-gold-600 text-gold-400 hover:text-black border border-gold-500/40 font-black text-xs rounded-xl transition-all cursor-pointer"
              >
                تنفيذ الحركة المالية الآن
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: PRIVATE SAFE & AUTO END-OF-DAY TRANSFER (الخزنة الخاصة) */}
        <div className="space-y-6">
          {/* 2A: Automatic End-of-Day Transfer Rules & Sweep */}
          <div className="bg-luxury-card border-2 border-gold-500/40 rounded-3xl p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-gray-900 pb-3">
              <div>
                <h3 className="text-sm font-black text-gold-400 flex items-center gap-2">
                  <Moon className="w-5 h-5 text-gold-400" />
                  الخزنة الخاصة والترحيل التلقائي بنهاية اليوم
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  يتم ترحيل الرصيد المتبقي تلقائياً عند إغلاق اليوم أو تنفيذ التصفية المسائية
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSaveAutoTransferConfig(!autoTransferEnabled, autoTransferSource)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer ${
                  autoTransferEnabled
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                {autoTransferEnabled ? 'مفعّل ✅' : 'متوقف ⏸️'}
              </button>
            </div>

            {/* Source Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-300">
                ما الذي يتم ترحيله تلقائياً للخزنة الخاصة في نهاية اليوم؟
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'BOTH' as const, label: 'الدرج + الرئيسية معاً' },
                  { id: 'DRAWER_ONLY' as const, label: 'باقي الدرج فقط' },
                  { id: 'MAIN_SAFE_ONLY' as const, label: 'باقي الرئيسية فقط' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSaveAutoTransferConfig(autoTransferEnabled, opt.id)}
                    className={`py-2 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                      autoTransferSource === opt.id
                        ? 'bg-gold-500/20 border-gold-500 text-gold-300'
                        : 'bg-luxury-bg border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Preview of Remaining Cash to Transfer */}
            <div className="bg-black/60 border border-gold-500/25 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-gray-400">
                <span>باقي الدرج الحالي:</span>
                <span className="font-mono font-bold text-white">
                  {pendingSweepPreview.fromDrawer.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>باقي الخزنة الرئيسية الحالي:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {pendingSweepPreview.fromMain.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-900 font-black">
                <span className="text-gold-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  إجمالي الباقي للترحيل إلى الخزنة الخاصة:
                </span>
                <span className="font-mono text-base text-gold-400">
                  {pendingSweepPreview.total.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={pendingSweepPreview.total <= 0}
              onClick={() => {
                setSweepCred('');
                setSweepNotes('');
                setShowSweepModal(true);
              }}
              className="w-full py-3.5 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-2xl shadow-[0_0_20px_rgba(212,175,55,0.25)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <Moon className="w-4 h-4" />
              <span>ترحيل الباقي الآن إلى الخزنة الخاصة (تصفية نهاية اليوم)</span>
            </button>
          </div>

          {/* 2B: Withdraw from Private Safe (Admin Only) */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-black text-white mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" />
              سحب من الخزنة الخاصة (للأدمن فقط)
            </h3>
            <p className="text-[11px] text-gray-400 mb-4 pb-3 border-b border-gray-900">
              يُشترط التوثيق بكلمة مرور الأدمن لتسجيل أي سحب نقدي من الخزنة الخاصة
            </p>

            <form onSubmit={handlePrivateWithdrawSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">المبلغ المسحوب (ج.م) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={privWithdrawAmount}
                    onChange={(e) => setPrivWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-red-500 text-red-400 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">سبب السحب *</label>
                  <input
                    type="text"
                    required
                    value={privWithdrawNotes}
                    onChange={(e) => setPrivWithdrawNotes(e.target.value)}
                    placeholder="مثال: تسليم أرباح / إيداع بنكي..."
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-red-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1.5">
                  {hasSecPass ? 'كلمة مرور الشاشات الحساسة (Admin Security Password) *' : 'رمز الأمان PIN *'}
                </label>
                <div className="relative">
                  <input
                    type={showPrivCred ? 'text' : 'password'}
                    required
                    value={privWithdrawCred}
                    onChange={(e) => setPrivWithdrawCred(e.target.value)}
                    placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-gold-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivCred(!showPrivCred)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-gold-400 cursor-pointer"
                  >
                    {showPrivCred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-red-950/70 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/40 font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Minus className="w-4 h-4" />
                <span>تأكيد السحب من الخزنة الخاصة</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Safes Transaction Ledger */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-900">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <History className="w-5 h-5 text-gold-500" />
            سجل حركات الخزنة الرئيسية والخاصة
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL' as const, label: 'الكل' },
              { id: 'MAIN_SAFE' as const, label: 'الخزنة الرئيسية' },
              { id: 'PRIVATE_SAFE' as const, label: 'الخزنة الخاصة' },
              { id: 'AUTO_DAILY' as const, label: 'الترحيلات التلقائية' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLedgerFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  ledgerFilter === f.id
                    ? 'bg-gold-600 text-black font-black'
                    : 'bg-luxury-bg text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-900 text-gray-400 font-bold">
                <th className="py-2.5 px-2">الخزنة</th>
                <th className="py-2.5 px-2">نوع الحركة</th>
                <th className="py-2.5 px-2">السابق</th>
                <th className="py-2.5 px-2">المبلغ</th>
                <th className="py-2.5 px-2">الرصيد الجديد</th>
                <th className="py-2.5 px-2">التاريخ والوقت</th>
                <th className="py-2.5 px-2">المسؤول</th>
                <th className="py-2.5 px-2">البيان والملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500 font-bold">
                    لا توجد حركات مسجلة في الخزنتين حتى الآن
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const badge = getTxBadge(tx);
                  const isPos = badge.sign === '+';
                  return (
                    <tr key={tx.id} className="hover:bg-luxury-bg/40 transition-colors">
                      <td className="py-3 px-2 font-black whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] border ${
                            tx.safe_type === 'MAIN_SAFE'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40'
                              : 'bg-gold-500/15 text-gold-300 border-gold-500/30'
                          }`}
                        >
                          {tx.safe_type === 'MAIN_SAFE' ? 'الخزنة الرئيسية' : 'الخزنة الخاصة'}
                        </span>
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono text-gray-400">
                        {tx.previous_balance.toLocaleString('ar-EG')} ج
                      </td>
                      <td className={`py-3 px-2 font-mono font-black ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                        {badge.sign}
                        {tx.amount.toLocaleString('ar-EG')} ج
                      </td>
                      <td className="py-3 px-2 font-mono font-black text-white">
                        {tx.new_balance.toLocaleString('ar-EG')} ج
                      </td>
                      <td className="py-3 px-2 font-mono text-gray-400 whitespace-nowrap">
                        {tx.date} <span className="text-[10px] text-gray-600">{tx.time}</span>
                      </td>
                      <td className="py-3 px-2 text-gray-300 font-bold">{tx.operator}</td>
                      <td className="py-3 px-2 text-gray-400 max-w-xs truncate" title={tx.notes}>
                        {tx.notes || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* End-of-Day Sweep Confirmation Modal */}
      {showSweepModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4" dir="rtl">
          <form
            onSubmit={handleManualSweepSubmit}
            className="w-full max-w-md bg-[#0c0c0e] border-2 border-gold-500/40 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div className="w-11 h-11 rounded-2xl bg-gold-500/15 border border-gold-500/40 flex items-center justify-center text-gold-400">
                <Moon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">تأكيد ترحيل الباقي للخزنة الخاصة</h4>
                <p className="text-[11px] text-gray-400">تصفية نهاية اليوم وتصفير الدرج لليوم الجديد</p>
              </div>
            </div>

            <div className="bg-black/60 border border-gray-800 rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">من الدرج:</span>
                <span className="font-mono font-bold text-white">{pendingSweepPreview.fromDrawer.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">من الخزنة الرئيسية:</span>
                <span className="font-mono font-bold text-emerald-400">{pendingSweepPreview.fromMain.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-gray-800 font-black text-gold-400">
                <span>الإجمالي المرحّل للخزنة الخاصة:</span>
                <span className="font-mono">{pendingSweepPreview.total.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">ملاحظات الإغلاق (اختياري)</label>
              <input
                type="text"
                value={sweepNotes}
                onChange={(e) => setSweepNotes(e.target.value)}
                placeholder="مثال: تصفية نهاية اليوم..."
                className="w-full bg-[#141416] border border-gray-800 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-gold-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-300 mb-1">
                {hasSecPass ? 'كلمة مرور الشاشات الحساسة (Admin Security Password) *' : 'رمز الأمان PIN *'}
              </label>
              <div className="relative">
                <input
                  type={showSweepCred ? 'text' : 'password'}
                  required
                  autoFocus
                  value={sweepCred}
                  onChange={(e) => setSweepCred(e.target.value)}
                  placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                  className="w-full bg-[#141416] border border-gray-800 rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono text-white focus:outline-none focus:border-gold-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSweepCred(!showSweepCred)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-gold-400 cursor-pointer"
                >
                  {showSweepCred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="submit"
                disabled={sweepLoading}
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-black text-xs rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
              >
                {sweepLoading ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد الترحيل الآن</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowSweepModal(false)}
                className="py-3 bg-zinc-900 border border-zinc-800 text-gray-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin-only Reset Cash Drawer Modal */}
      <ResetCashDrawerModal
        isOpen={showResetDrawerModal}
        onClose={() => setShowResetDrawerModal(false)}
        onSuccess={() => refreshAll()}
        onShowSuccessAlert={onShowSuccessAlert}
        onShowWarningAlert={onShowWarningAlert}
      />
    </div>
  );
}

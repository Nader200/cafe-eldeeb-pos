import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Wallet,
  Lock,
  Plus,
  Minus,
  Moon,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  Pencil,
  Home,
  Users
} from 'lucide-react';
import { dbService } from '../dbService';
import { AppSettings, DailyShortage, SafeTransaction, SafeType, ShortageTargetAccount } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isAdminSecurityPasswordSet } from '../lib/securityService';
import ResetCashDrawerModal from './ResetCashDrawerModal';
import AdjustSafeBalanceModal from './AdjustSafeBalanceModal';

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
  const [privateSafeBalance, setPrivateSafeBalance] = useState<number>(() => dbService.getSafeBalance('PRIVATE_SAFE'));
  const [rentBoxBalance, setRentBoxBalance] = useState<number>(() => dbService.getSafeBalance('RENT_BOX'));
  const [gamiaBoxBalance, setGamiaBoxBalance] = useState<number>(() => dbService.getSafeBalance('GAMIA_BOX'));
  const [drawerBalance, setDrawerBalance] = useState<number>(() => {
    const d = dbService.getActiveDrawer();
    return Math.round((d.opening_balance + d.cash_in - d.cash_out) * 100) / 100;
  });

  // Auto-transfer config from settings
  const [autoTransferEnabled, setAutoTransferEnabled] = useState<boolean>(
    settings.safe_auto_transfer_enabled !== false
  );

  // Rent Box (قسم الإيجار) state
  const [rentMode, setRentMode] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [rentAmount, setRentAmount] = useState<string>('');
  const [rentNotes, setRentNotes] = useState<string>('');
  const [rentDeductDrawer, setRentDeductDrawer] = useState<boolean>(false);
  const [rentWithdrawCred, setRentWithdrawCred] = useState<string>('');
  const [showRentCred, setShowRentCred] = useState<boolean>(false);

  // Gamia Box (قسم الجمعية) state
  const [gamiaMode, setGamiaMode] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [gamiaAmount, setGamiaAmount] = useState<string>('');
  const [gamiaNotes, setGamiaNotes] = useState<string>('');
  const [gamiaDeductDrawer, setGamiaDeductDrawer] = useState<boolean>(false);
  const [gamiaWithdrawCred, setGamiaWithdrawCred] = useState<string>('');
  const [showGamiaCred, setShowGamiaCred] = useState<boolean>(false);

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

  // Adjust / Reset Safe Balance Modal
  const [showAdjustSafeModal, setShowAdjustSafeModal] = useState(false);
  const [adjustTargetSafe, setAdjustTargetSafe] = useState<SafeType>('PRIVATE_SAFE');
  const [adjustModalMode, setAdjustModalMode] = useState<'ADJUST' | 'RESET'>('ADJUST');

  // Ledger Filter
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'PRIVATE_SAFE' | 'RENT_BOX' | 'GAMIA_BOX' | 'AUTO_DAILY'>('ALL');

  // End-of-Day Cash Shortage Ledger (خانة العجز وتسويتها التلقائية)
  const [shortages, setShortages] = useState<DailyShortage[]>(() => dbService.getDailyShortages());
  const [totalPendingShortage, setTotalPendingShortage] = useState<number>(() => dbService.getTotalPendingShortage());
  const [shortagePayAmount, setShortagePayAmount] = useState<string>('');
  const [shortagePayTarget, setShortagePayTarget] = useState<ShortageTargetAccount>('PRIVATE_SAFE');
  const [shortagePayNotes, setShortagePayNotes] = useState<string>('');

  // Manual Shortage Record Toggle
  const [showManualShortageForm, setShowManualShortageForm] = useState<boolean>(false);
  const [manualShortageAmount, setManualShortageAmount] = useState<string>('');
  const [manualShortageTarget, setManualShortageTarget] = useState<ShortageTargetAccount>('PRIVATE_SAFE');
  const [manualShortageNotes, setManualShortageNotes] = useState<string>('');

  // Sweep Modal Shortage Tracking
  const [sweepActualCash, setSweepActualCash] = useState<string>('');
  const [sweepShortageAmount, setSweepShortageAmount] = useState<string>('0');
  const [sweepShortageTarget, setSweepShortageTarget] = useState<ShortageTargetAccount>('PRIVATE_SAFE');

  const refreshAll = () => {
    setTransactions(dbService.getSafeTransactions());
    setPrivateSafeBalance(dbService.getSafeBalance('PRIVATE_SAFE'));
    setRentBoxBalance(dbService.getSafeBalance('RENT_BOX'));
    setGamiaBoxBalance(dbService.getSafeBalance('GAMIA_BOX'));
    const d = dbService.getActiveDrawer();
    setDrawerBalance(Math.round((d.opening_balance + d.cash_in - d.cash_out) * 100) / 100);
    setShortages(dbService.getDailyShortages());
    setTotalPendingShortage(dbService.getTotalPendingShortage());
    const freshSettings = dbService.getSettings();
    setAutoTransferEnabled(freshSettings.safe_auto_transfer_enabled !== false);
    setTick(t => t + 1);
  };

  useEffect(() => {
    refreshAll();
    const onSync = () => refreshAll();
    window.addEventListener('safe_updated', onSync);
    window.addEventListener('shortage_updated', onSync);
    window.addEventListener('shift_updated', onSync);
    window.addEventListener('cafe_db_synced_remote', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('safe_updated', onSync);
      window.removeEventListener('shortage_updated', onSync);
      window.removeEventListener('shift_updated', onSync);
      window.removeEventListener('cafe_db_synced_remote', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [tick]);

  const todayRentDeposits = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.safe_type === 'RENT_BOX' &&
          t.date === todayStr &&
          (t.transaction_type === 'DAILY_DEPOSIT' || t.transaction_type === 'DEPOSIT')
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions, todayStr]);

  const todayGamiaDeposits = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.safe_type === 'GAMIA_BOX' &&
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

  const drawerSweepAmount = useMemo(() => Math.max(0, drawerBalance), [drawerBalance]);

  const filteredTransactions = useMemo(() => {
    const reversed = [...transactions].reverse();
    if (ledgerFilter === 'PRIVATE_SAFE') return reversed.filter(t => t.safe_type === 'PRIVATE_SAFE');
    if (ledgerFilter === 'RENT_BOX') return reversed.filter(t => t.safe_type === 'RENT_BOX');
    if (ledgerFilter === 'GAMIA_BOX') return reversed.filter(t => t.safe_type === 'GAMIA_BOX');
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
        <p className="text-xs text-gray-400">إدارة الخزنة الخاصة وقسمي الإيجار والجمعية والعجز متاحة فقط لحساب الأدمن.</p>
      </div>
    );
  }

  // Rent Box Submit
  const handleRentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(rentAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من صفر لقسم الإيجار');
      return;
    }
    const opName = currentUser?.name || 'أدمن النظام';
    if (rentMode === 'DEPOSIT') {
      try {
        dbService.addBoxDailyDeposit('RENT_BOX', amt, opName, rentNotes, rentDeductDrawer);
        onShowSuccessAlert(`تمت إضافة المبلغ اليومي (${amt.toLocaleString('ar-EG')} ج.م) إلى قسم الإيجار بنجاح 🏠`);
        setRentAmount('');
        setRentNotes('');
        refreshAll();
      } catch (err: any) {
        onShowWarningAlert(err?.message || 'حدث خطأ أثناء الإضافة لقسم الإيجار');
      }
      return;
    }

    if (!rentWithdrawCred.trim()) {
      onShowWarningAlert(hasSecPass ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة' : 'يرجى إدخال رمز الأمان PIN');
      return;
    }
    const valid = await dbService.verifyAdminActionCredential(rentWithdrawCred);
    if (!valid) {
      onShowWarningAlert(hasSecPass ? 'كلمة مرور حماية الشاشات الحساسة غير صحيحة!' : 'رمز الأمان PIN غير صحيح!');
      return;
    }
    try {
      dbService.withdrawFromSafe('RENT_BOX', amt, opName, rentNotes || 'صرف / سحب من قسم الإيجار');
      onShowSuccessAlert(`تم صرف ${amt.toLocaleString('ar-EG')} ج.م من قسم الإيجار بنجاح ✅`);
      setRentAmount('');
      setRentNotes('');
      setRentWithdrawCred('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر السحب من قسم الإيجار');
    }
  };

  // Gamia Box Submit
  const handleGamiaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(gamiaAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من صفر لقسم الجمعية');
      return;
    }
    const opName = currentUser?.name || 'أدمن النظام';
    if (gamiaMode === 'DEPOSIT') {
      try {
        dbService.addBoxDailyDeposit('GAMIA_BOX', amt, opName, gamiaNotes, gamiaDeductDrawer);
        onShowSuccessAlert(`تمت إضافة المبلغ اليومي (${amt.toLocaleString('ar-EG')} ج.م) إلى قسم الجمعية بنجاح 🤝`);
        setGamiaAmount('');
        setGamiaNotes('');
        refreshAll();
      } catch (err: any) {
        onShowWarningAlert(err?.message || 'حدث خطأ أثناء الإضافة لقسم الجمعية');
      }
      return;
    }

    if (!gamiaWithdrawCred.trim()) {
      onShowWarningAlert(hasSecPass ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة' : 'يرجى إدخال رمز الأمان PIN');
      return;
    }
    const valid = await dbService.verifyAdminActionCredential(gamiaWithdrawCred);
    if (!valid) {
      onShowWarningAlert(hasSecPass ? 'كلمة مرور حماية الشاشات الحساسة غير صحيحة!' : 'رمز الأمان PIN غير صحيح!');
      return;
    }
    try {
      dbService.withdrawFromSafe('GAMIA_BOX', amt, opName, gamiaNotes || 'صرف / تسليم من قسم الجمعية');
      onShowSuccessAlert(`تم صرف ${amt.toLocaleString('ar-EG')} ج.م من قسم الجمعية بنجاح ✅`);
      setGamiaAmount('');
      setGamiaNotes('');
      setGamiaWithdrawCred('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر السحب من قسم الجمعية');
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

  const handleSaveAutoTransferConfig = (nextEnabled: boolean) => {
    setAutoTransferEnabled(nextEnabled);
    dbService.saveSettings({
      safe_auto_transfer_enabled: nextEnabled,
      safe_auto_transfer_source: 'DRAWER_ONLY'
    });
    onSettingsChanged?.();
    onShowSuccessAlert(
      nextEnabled
        ? 'تم تفعيل الترحيل التلقائي لباقي الدرج إلى الخزنة الخاصة في نهاية اليوم ✅'
        : 'تم إيقاف الترحيل التلقائي للخزنة الخاصة'
    );
  };

  const handleManualSweepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sweepCred.trim()) {
      onShowWarningAlert(hasSecPass ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة' : 'يرجى إدخال رمز الأمان PIN');
      return;
    }
    const parsedActual = sweepActualCash.trim() !== '' ? parseFloat(sweepActualCash) : undefined;
    if (parsedActual !== undefined && (isNaN(parsedActual) || parsedActual < 0)) {
      onShowWarningAlert('يرجى إدخال قيمة نقدية فعلية صحيحة');
      return;
    }
    const parsedShortage = parseFloat(sweepShortageAmount) || 0;
    setSweepLoading(true);
    try {
      const res = await dbService.performEndOfDaySafeSweep(
        sweepCred.trim(),
        currentUser?.name || 'أدمن النظام',
        sweepNotes,
        {
          actualCashCounted: parsedActual,
          shortageAmount: parsedShortage > 0 ? parsedShortage : undefined,
          shortageTargetAccount: sweepShortageTarget
        }
      );
      setSweepLoading(false);
      setShowSweepModal(false);
      setSweepCred('');
      setSweepNotes('');
      setSweepActualCash('');
      setSweepShortageAmount('0');
      const shortageMsg = res.recordedShortage
        ? ` | وتم تسجيل عجز بقيمة ${res.recordedShortage.shortage_amount.toLocaleString('ar-EG')} ج.م في خانة العجز ⚠️`
        : '';
      if (res.totalTransferred > 0 || res.recordedShortage) {
        onShowSuccessAlert(
          `تم ترحيل المتبقي (${res.totalTransferred.toLocaleString('ar-EG')} ج.م) تلقائياً إلى الخزنة الخاصة وتصفير الدرج لليوم الجديد 🔐${shortageMsg}`
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

  const getAccountArabicName = (acc: ShortageTargetAccount) =>
    dbService.getShortageAccountArabicLabel(acc);

  const handleAddShortageDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(shortagePayAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ العجز المراد إضافته إلى الحساب');
      return;
    }
    try {
      const res = dbService.addShortageDepositFIFO(
        amt,
        shortagePayTarget,
        currentUser?.name || 'أدمن النظام',
        shortagePayNotes
      );
      onShowSuccessAlert(
        `تمت إضافة ${res.totalAdded.toLocaleString('ar-EG')} ج.م تلقائياً إلى حساب (${getAccountArabicName(shortagePayTarget)}) ✅`
      );
      setShortagePayAmount('');
      setShortagePayNotes('');
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر إضافة مبلغ العجز إلى الحساب');
    }
  };

  const handleSettleSingleShortage = (shortage: DailyShortage) => {
    try {
      dbService.settleShortageAdmin(
        shortage.id,
        shortage.remaining_amount,
        shortagePayTarget,
        currentUser?.name || 'أدمن النظام',
        `سداد كامل عجز يوم ${shortage.business_date} وإضافته تلقائياً`
      );
      onShowSuccessAlert(
        `تمت إضافة مبلغ العجز (${shortage.remaining_amount.toLocaleString('ar-EG')} ج.م) تلقائياً إلى ${getAccountArabicName(shortagePayTarget)} ✅`
      );
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر تسوية العجز');
    }
  };

  const handleRecordManualShortage = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(manualShortageAmount);
    if (isNaN(amt) || amt <= 0) {
      onShowWarningAlert('يرجى إدخال قيمة عجز صحيحة أكبر من صفر');
      return;
    }
    try {
      dbService.recordDailyShortage({
        expectedAmount: drawerBalance + amt,
        actualAmount: drawerBalance,
        shortageAmount: amt,
        targetAccount: manualShortageTarget,
        cashierName: currentUser?.name || 'أدمن النظام',
        notes: manualShortageNotes || 'تسجيل عجز نهاية اليوم يدوياً'
      });
      onShowSuccessAlert(`تم تسجيل العجز (${amt.toLocaleString('ar-EG')} ج.م) في خانة العجز بنجاح ⚠️`);
      setManualShortageAmount('');
      setManualShortageNotes('');
      setShowManualShortageForm(false);
      refreshAll();
    } catch (err: any) {
      onShowWarningAlert(err?.message || 'تعذر تسجيل العجز');
    }
  };

  const getSafeBadgeClasses = (safeType: SafeType) => {
    switch (safeType) {
      case 'PRIVATE_SAFE':
        return 'bg-gold-500/15 text-gold-300 border-gold-500/30';
      case 'RENT_BOX':
        return 'bg-sky-950/50 text-sky-300 border-sky-700/40';
      case 'GAMIA_BOX':
        return 'bg-purple-950/50 text-purple-300 border-purple-700/40';
      case 'MAIN_SAFE':
      default:
        return 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40';
    }
  };

  const getTxBadge = (tx: SafeTransaction) => {
    switch (tx.transaction_type) {
      case 'DAILY_DEPOSIT':
        return { label: 'مبلغ يومي', cls: 'bg-emerald-950/50 text-emerald-400 border-emerald-700/40', sign: '+' };
      case 'DEPOSIT':
        return { label: 'إيداع يدوي', cls: 'bg-green-950/50 text-green-400 border-green-700/40', sign: '+' };
      case 'TRANSFER_FROM_DRAWER':
        return { label: 'توريد من الدرج', cls: 'bg-cyan-950/50 text-cyan-400 border-cyan-700/40', sign: '+' };
      case 'TRANSFER_TO_DRAWER':
        return { label: 'تغذية الدرج', cls: 'bg-amber-950/50 text-amber-400 border-amber-700/40', sign: '-' };
      case 'WITHDRAWAL':
        return { label: 'صرف / سحب', cls: 'bg-red-950/50 text-red-400 border-red-700/40', sign: '-' };
      case 'TRANSFER_TO_PRIVATE':
        return {
          label: tx.safe_type === 'PRIVATE_SAFE' ? 'استلام بالخاصة' : 'ترحيل للخاصة',
          cls: 'bg-purple-950/50 text-purple-300 border-purple-700/40',
          sign: tx.safe_type === 'PRIVATE_SAFE' ? '+' : '-'
        };
      case 'AUTO_DAILY_TRANSFER':
        return {
          label: 'ترحيل نهاية اليوم التلقائي',
          cls: 'bg-gold-500/15 text-gold-400 border-gold-500/40',
          sign: tx.safe_type === 'PRIVATE_SAFE' ? '+' : '-'
        };
      case 'SHORTAGE_SETTLEMENT':
        return {
          label: 'إضافة وسداد عجز',
          cls: 'bg-teal-950/60 text-teal-300 border-teal-500/40',
          sign: '+'
        };
      case 'BALANCE_ADJUSTMENT': {
        const delta =
          typeof tx.adjustment_delta === 'number'
            ? tx.adjustment_delta
            : (Number(tx.new_balance) || 0) - (Number(tx.previous_balance) || 0);
        return {
          label: 'تعديل الرصيد',
          cls: 'bg-sky-950/60 text-sky-300 border-sky-500/40',
          sign: delta >= 0 ? '+' : '-'
        };
      }
      case 'SAFE_RESET': {
        const delta =
          typeof tx.adjustment_delta === 'number'
            ? tx.adjustment_delta
            : (Number(tx.new_balance) || 0) - (Number(tx.previous_balance) || 0);
        return {
          label: 'تصفير الرصيد',
          cls: 'bg-red-950/60 text-red-300 border-red-500/40',
          sign: delta > 0 ? '+' : '-'
        };
      }
      default:
        return { label: 'حركة مالية', cls: 'bg-gray-900 text-gray-300 border-gray-700', sign: '' };
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      {!embedded && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-luxury-card border border-gold-500/30 p-6 rounded-3xl shadow-lg">
          <div>
            <h2 className="text-xl font-black text-white mb-1 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-gold-500" />
              <span>نظام الخزنة الخاصة وقسمي الإيجار والجمعية والعجز (للأدمن فقط)</span>
            </h2>
            <p className="text-gray-400 text-xs">
              الترحيل التلقائي لباقي الدرج إلى الخزنة الخاصة، وضع المبالغ اليومية لقسم الإيجار وقسم الجمعية، ومتابعة خانة العجز
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3.5 py-2 bg-black/60 border border-gray-800 rounded-xl flex items-center gap-2 text-xs">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="text-gray-400 font-bold">الدرج الحالي:</span>
              <span className="font-mono font-black text-white">{drawerBalance.toLocaleString('ar-EG')} ج.م</span>
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
        </div>
      )}

      {/* Drawer Summary Strip when embedded inside CashDrawerView */}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-luxury-card border border-gray-800 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-400 font-bold">رصيد درج النقدية المفتوح حالياً:</span>
            <span className="font-mono font-black text-white text-sm">{drawerBalance.toLocaleString('ar-EG')} ج.م</span>
          </div>
          <button
            type="button"
            onClick={() => setShowResetDrawerModal(true)}
            className="px-3 py-1.5 bg-red-950/50 hover:bg-red-600/90 border border-red-500/30 text-red-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>تصفير حساب الدرج (أدمن)</span>
          </button>
        </div>
      )}

      {/* Top 4 Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Private Safe (الخزنة الخاصة) */}
        <div className="bg-gradient-to-br from-[#171206] to-black border-2 border-gold-500/50 rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-[0_0_25px_rgba(212,175,55,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-gold-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-gold-400" />
              الخزنة الخاصة (للأدمن)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gold-500/15 text-gold-300 border border-gold-500/30">
              {autoTransferEnabled ? 'ترحيل تلقائي ✅' : 'ترحيل يدوي'}
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
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('PRIVATE_SAFE');
                setAdjustModalMode('ADJUST');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-gold-500/15 hover:bg-gold-500/30 border border-gold-500/40 text-gold-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل الرصيد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('PRIVATE_SAFE');
                setAdjustModalMode('RESET');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-red-950/40 hover:bg-red-600/90 border border-red-500/30 text-red-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تصفير (0)</span>
            </button>
          </div>
        </div>

        {/* Card 2: Rent Box (قسم الإيجار) */}
        <div className="bg-gradient-to-br from-[#08121a] to-black border-2 border-sky-500/45 rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-[0_0_25px_rgba(14,165,233,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Home className="w-4 h-4 text-sky-400" />
              قسم الإيجار (يومي)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/15 text-sky-300 border border-sky-500/30">
              مبلغ يومي للإيجار
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-sky-400">
              {rentBoxBalance.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              مضاف اليوم: <strong className="text-sky-300 font-mono">{todayRentDeposits.toLocaleString('ar-EG')} ج.م</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('RENT_BOX');
                setAdjustModalMode('ADJUST');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-sky-950/50 hover:bg-sky-600/30 border border-sky-500/35 text-sky-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل الرصيد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('RENT_BOX');
                setAdjustModalMode('RESET');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-red-950/40 hover:bg-red-600/90 border border-red-500/30 text-red-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تصفير (0)</span>
            </button>
          </div>
        </div>

        {/* Card 3: Gamia Box (قسم الجمعية) */}
        <div className="bg-gradient-to-br from-[#140b1d] to-black border-2 border-purple-500/45 rounded-3xl p-5 flex flex-col justify-between gap-3 shadow-[0_0_25px_rgba(168,85,247,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-purple-400" />
              قسم الجمعية (يومي)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-300 border border-purple-500/30">
              مبلغ يومي للجمعية
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-purple-400">
              {gamiaBoxBalance.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              مضاف اليوم: <strong className="text-purple-300 font-mono">{todayGamiaDeposits.toLocaleString('ar-EG')} ج.م</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('GAMIA_BOX');
                setAdjustModalMode('ADJUST');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-purple-950/50 hover:bg-purple-600/30 border border-purple-500/35 text-purple-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل الرصيد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustTargetSafe('GAMIA_BOX');
                setAdjustModalMode('RESET');
                setShowAdjustSafeModal(true);
              }}
              className="py-2 px-2.5 bg-red-950/40 hover:bg-red-600/90 border border-red-500/30 text-red-300 hover:text-white rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تصفير (0)</span>
            </button>
          </div>
        </div>

        {/* Card 4: Daily Cash Shortage (خانة العجز المعلق) */}
        <div className={`bg-gradient-to-br rounded-3xl p-5 flex flex-col justify-between gap-3 border-2 ${
          totalPendingShortage > 0
            ? 'from-[#1f0a0a] to-black border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.14)]'
            : 'from-[#0d1110] to-black border-gray-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black flex items-center gap-1.5 ${
              totalPendingShortage > 0 ? 'text-red-400' : 'text-gray-300'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${totalPendingShortage > 0 ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
              خانة العجز (نهاية اليوم)
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
              totalPendingShortage > 0
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}>
              {totalPendingShortage > 0 ? 'معلق للسداد' : 'لا يوجد عجز ✅'}
            </span>
          </div>
          <div>
            <div className={`text-2xl font-black font-mono ${totalPendingShortage > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {totalPendingShortage.toLocaleString('ar-EG')} <span className="text-xs font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              عند إضافة الأدمن لمبلغ العجز يتم إضافته تلقائياً إلى الحساب المختار
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Rent & Gamia Sections (Left) & Private Safe / Auto-Transfer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: RENT BOX & GAMIA BOX (قسم الإيجار وقسم الجمعية) */}
        <div className="space-y-6">
          {/* 1A: Rent Box (قسم الإيجار) */}
          <div className="bg-luxury-card border-2 border-sky-500/35 rounded-3xl p-6 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-3">
              <div>
                <h3 className="text-sm font-black text-sky-300 flex items-center gap-2">
                  <Home className="w-5 h-5 text-sky-400" />
                  قسم الإيجار (للأدمن فقط)
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  تخصيص مبلغ يومي للإيجار أو تسجيل صرف/سداد الإيجار
                </p>
              </div>
              <div className="flex gap-1.5 bg-black/50 p-1 rounded-xl border border-gray-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setRentMode('DEPOSIT')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                    rentMode === 'DEPOSIT' ? 'bg-sky-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  إضافة يومي
                </button>
                <button
                  type="button"
                  onClick={() => setRentMode('WITHDRAW')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                    rentMode === 'WITHDRAW' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  صرف إيجار
                </button>
              </div>
            </div>

            <form onSubmit={handleRentSubmit} className="space-y-4">
              {rentMode === 'DEPOSIT' && (
                <div className="flex flex-wrap gap-2">
                  {[50, 100, 150, 200, 300, 500].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRentAmount(String(preset))}
                      className="px-3 py-1.5 rounded-xl bg-sky-950/40 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-mono font-bold cursor-pointer transition-all"
                    >
                      +{preset.toLocaleString('ar-EG')} ج
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    {rentMode === 'DEPOSIT' ? 'المبلغ اليومي للإيجار (ج.م) *' : 'مبلغ الصرف من الإيجار (ج.م) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={rentAmount}
                    onChange={(e) => setRentAmount(e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-luxury-bg border border-gray-800 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none ${
                      rentMode === 'DEPOSIT' ? 'focus:border-sky-500 text-sky-400' : 'focus:border-red-500 text-red-400'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    {rentMode === 'DEPOSIT' ? 'ملاحظات (اختياري)' : 'بيان الصرف *'}
                  </label>
                  <input
                    type="text"
                    required={rentMode === 'WITHDRAW'}
                    value={rentNotes}
                    onChange={(e) => setRentNotes(e.target.value)}
                    placeholder={rentMode === 'DEPOSIT' ? 'مثال: إيجار اليوم...' : 'مثال: دفع إيجار الشهر للمالك...'}
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-sky-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
                  />
                </div>
              </div>

              {rentMode === 'DEPOSIT' ? (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/50 border border-gray-800 cursor-pointer hover:border-sky-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={rentDeductDrawer}
                    onChange={(e) => setRentDeductDrawer(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-300">
                    خصم المبلغ من درج النقدية المفتوح حالياً ({drawerBalance.toLocaleString('ar-EG')} ج.م)
                  </span>
                </label>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-1.5">
                    {hasSecPass ? 'كلمة مرور الشاشات الحساسة (Admin Security Password) *' : 'رمز الأمان PIN *'}
                  </label>
                  <div className="relative">
                    <input
                      type={showRentCred ? 'text' : 'password'}
                      required
                      value={rentWithdrawCred}
                      onChange={(e) => setRentWithdrawCred(e.target.value)}
                      placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                      className="w-full bg-luxury-bg border border-gray-800 focus:border-sky-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRentCred(!showRentCred)}
                      className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-sky-400 cursor-pointer"
                    >
                      {showRentCred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className={`w-full py-3 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                  rentMode === 'DEPOSIT'
                    ? 'bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-black'
                    : 'bg-red-950/70 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/40'
                }`}
              >
                {rentMode === 'DEPOSIT' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                <span>{rentMode === 'DEPOSIT' ? 'إضافة المبلغ اليومي لقسم الإيجار' : 'تأكيد صرف مبلغ من قسم الإيجار'}</span>
              </button>
            </form>
          </div>

          {/* 1B: Gamia Box (قسم الجمعية) */}
          <div className="bg-luxury-card border-2 border-purple-500/35 rounded-3xl p-6 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-3">
              <div>
                <h3 className="text-sm font-black text-purple-300 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  قسم الجمعية (للأدمن فقط)
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  تخصيص مبلغ يومي للجمعية أو تسجيل صرف/تسليم قسط الجمعية
                </p>
              </div>
              <div className="flex gap-1.5 bg-black/50 p-1 rounded-xl border border-gray-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setGamiaMode('DEPOSIT')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                    gamiaMode === 'DEPOSIT' ? 'bg-purple-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  إضافة يومي
                </button>
                <button
                  type="button"
                  onClick={() => setGamiaMode('WITHDRAW')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                    gamiaMode === 'WITHDRAW' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  صرف الجمعية
                </button>
              </div>
            </div>

            <form onSubmit={handleGamiaSubmit} className="space-y-4">
              {gamiaMode === 'DEPOSIT' && (
                <div className="flex flex-wrap gap-2">
                  {[50, 100, 150, 200, 300, 500].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGamiaAmount(String(preset))}
                      className="px-3 py-1.5 rounded-xl bg-purple-950/40 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-mono font-bold cursor-pointer transition-all"
                    >
                      +{preset.toLocaleString('ar-EG')} ج
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    {gamiaMode === 'DEPOSIT' ? 'المبلغ اليومي للجمعية (ج.م) *' : 'مبلغ الصرف من الجمعية (ج.م) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    required
                    value={gamiaAmount}
                    onChange={(e) => setGamiaAmount(e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-luxury-bg border border-gray-800 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none ${
                      gamiaMode === 'DEPOSIT' ? 'focus:border-purple-500 text-purple-400' : 'focus:border-red-500 text-red-400'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    {gamiaMode === 'DEPOSIT' ? 'ملاحظات (اختياري)' : 'بيان التسليم *'}
                  </label>
                  <input
                    type="text"
                    required={gamiaMode === 'WITHDRAW'}
                    value={gamiaNotes}
                    onChange={(e) => setGamiaNotes(e.target.value)}
                    placeholder={gamiaMode === 'DEPOSIT' ? 'مثال: حصة الجمعية اليومية...' : 'مثال: تسليم قسط الجمعية الشهري...'}
                    className="w-full bg-luxury-bg border border-gray-800 focus:border-purple-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
                  />
                </div>
              </div>

              {gamiaMode === 'DEPOSIT' ? (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-black/50 border border-gray-800 cursor-pointer hover:border-purple-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={gamiaDeductDrawer}
                    onChange={(e) => setGamiaDeductDrawer(e.target.checked)}
                    className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-300">
                    خصم المبلغ من درج النقدية المفتوح حالياً ({drawerBalance.toLocaleString('ar-EG')} ج.م)
                  </span>
                </label>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-1.5">
                    {hasSecPass ? 'كلمة مرور الشاشات الحساسة (Admin Security Password) *' : 'رمز الأمان PIN *'}
                  </label>
                  <div className="relative">
                    <input
                      type={showGamiaCred ? 'text' : 'password'}
                      required
                      value={gamiaWithdrawCred}
                      onChange={(e) => setGamiaWithdrawCred(e.target.value)}
                      placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                      className="w-full bg-luxury-bg border border-gray-800 focus:border-purple-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGamiaCred(!showGamiaCred)}
                      className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-purple-400 cursor-pointer"
                    >
                      {showGamiaCred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className={`w-full py-3 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                  gamiaMode === 'DEPOSIT'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:from-purple-500 hover:to-fuchsia-400 text-white'
                    : 'bg-red-950/70 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/40'
                }`}
              >
                {gamiaMode === 'DEPOSIT' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                <span>{gamiaMode === 'DEPOSIT' ? 'إضافة المبلغ اليومي لقسم الجمعية' : 'تأكيد صرف مبلغ من قسم الجمعية'}</span>
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
                  يتم ترحيل باقي درج النقدية تلقائياً إلى الخزنة الخاصة عند إغلاق اليوم أو تنفيذ التصفية المسائية
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSaveAutoTransferConfig(!autoTransferEnabled)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer shrink-0 ${
                  autoTransferEnabled
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                {autoTransferEnabled ? 'مفعّل ✅' : 'متوقف ⏸️'}
              </button>
            </div>

            {/* Live Preview of Remaining Cash to Transfer */}
            <div className="bg-black/60 border border-gold-500/25 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-gray-400">
                <span>باقي درج النقدية المفتوح الحالي:</span>
                <span className="font-mono font-bold text-white">
                  {drawerSweepAmount.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-900 font-black">
                <span className="text-gold-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  الرصيد المتاح للترحيل إلى الخزنة الخاصة:
                </span>
                <span className="font-mono text-base text-gold-400">
                  {drawerSweepAmount.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={drawerSweepAmount <= 0}
              onClick={() => {
                setSweepCred('');
                setSweepNotes('');
                setSweepActualCash(String(drawerBalance));
                setSweepShortageAmount('0');
                setSweepShortageTarget('PRIVATE_SAFE');
                setShowSweepModal(true);
              }}
              className="w-full py-3.5 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-2xl shadow-[0_0_20px_rgba(212,175,55,0.25)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <Moon className="w-4 h-4" />
              <span>ترحيل باقي الدرج الآن إلى الخزنة الخاصة (تصفية نهاية اليوم)</span>
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

      {/* End-of-Day Cash Shortage Ledger & Auto-Credit Panel (خانة العجز وتسويته تلقائياً) */}
      <div className="bg-luxury-card border-2 border-red-500/35 rounded-3xl p-6 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-900 pb-4">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span>خانة العجز وسداد الفروقات تلقائياً (للأدمن)</span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              يُحفظ هنا أي عجز يظهر في نهاية اليوم، وعند قيام الأدمن بإضافة مبلغ العجز لاحقاً تتم إضافته تلقائياً إلى الحساب المختار
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManualShortageForm(!showManualShortageForm)}
            className="px-3.5 py-2 bg-red-950/50 hover:bg-red-600/80 border border-red-500/40 text-red-200 hover:text-white rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{showManualShortageForm ? 'إخفاء التسجيل اليدوي' : 'تسجيل عجز نهاية اليوم يدوياً'}</span>
          </button>
        </div>

        {/* Optional Manual Shortage Entry Form */}
        {showManualShortageForm && (
          <form onSubmit={handleRecordManualShortage} className="bg-red-950/15 border border-red-500/30 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-black text-red-300">تسجيل عجز نهاية اليوم في خانة العجز:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">قيمة العجز (ج.م) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  required
                  value={manualShortageAmount}
                  onChange={(e) => setManualShortageAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-luxury-bg border border-gray-800 focus:border-red-500 text-red-400 rounded-xl py-2 px-3 text-sm font-black font-mono text-center focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">الحساب المستفيد عند السداد</label>
                <select
                  value={manualShortageTarget}
                  onChange={(e) => setManualShortageTarget(e.target.value as ShortageTargetAccount)}
                  className="w-full bg-luxury-bg border border-gray-800 focus:border-red-500 text-white rounded-xl py-2 px-3 text-xs font-bold focus:outline-none"
                >
                  <option value="PRIVATE_SAFE">الخزنة الخاصة</option>
                  <option value="RENT_BOX">قسم الإيجار</option>
                  <option value="GAMIA_BOX">قسم الجمعية</option>
                  <option value="DRAWER">درج النقدية</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">البيان / السبب</label>
                <input
                  type="text"
                  value={manualShortageNotes}
                  onChange={(e) => setManualShortageNotes(e.target.value)}
                  placeholder="مثال: فرق جرد نهاية اليوم..."
                  className="w-full bg-luxury-bg border border-gray-800 focus:border-red-500 text-white rounded-xl py-2 px-3 text-xs font-bold focus:outline-none text-right"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black cursor-pointer transition-all"
              >
                حفظ في خانة العجز
              </button>
            </div>
          </form>
        )}

        {/* Quick Auto-Credit Form when Admin adds shortage later */}
        <form onSubmit={handleAddShortageDepositSubmit} className="bg-black/50 border border-teal-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-teal-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              إضافة مبلغ العجز إلى الحساب تلقائياً:
            </span>
            {totalPendingShortage > 0 && (
              <button
                type="button"
                onClick={() => setShortagePayAmount(String(totalPendingShortage))}
                className="px-3 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-black cursor-pointer transition-all"
              >
                ملء إجمالي العجز المعلق ({totalPendingShortage.toLocaleString('ar-EG')} ج.م)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">المبلغ المضاف للعجز (ج.م) *</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={shortagePayAmount}
                onChange={(e) => setShortagePayAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-luxury-bg border border-gray-800 focus:border-teal-500 text-teal-300 rounded-xl py-2.5 px-3 text-base font-black text-center font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">الحساب الذي يُضاف إليه تلقائياً *</label>
              <select
                value={shortagePayTarget}
                onChange={(e) => setShortagePayTarget(e.target.value as ShortageTargetAccount)}
                className="w-full bg-luxury-bg border border-gray-800 focus:border-teal-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none"
              >
                <option value="PRIVATE_SAFE">الخزنة الخاصة (الافتراضي)</option>
                <option value="RENT_BOX">قسم الإيجار</option>
                <option value="GAMIA_BOX">قسم الجمعية</option>
                <option value="DRAWER">درج النقدية المفتوح</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">ملاحظات التسوية (اختياري)</label>
              <input
                type="text"
                value={shortagePayNotes}
                onChange={(e) => setShortagePayNotes(e.target.value)}
                placeholder="مثال: توريد قيمة عجز يوم..."
                className="w-full bg-luxury-bg border border-gray-800 focus:border-teal-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-500 hover:to-emerald-400 text-black font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مبلغ العجز تلقائياً إلى {getAccountArabicName(shortagePayTarget)}</span>
          </button>
        </form>

        {/* Shortage Records List */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-900 text-gray-400 font-bold">
                <th className="py-2.5 px-2">التاريخ</th>
                <th className="py-2.5 px-2">المسؤول</th>
                <th className="py-2.5 px-2">المتوقع / الفعلي</th>
                <th className="py-2.5 px-2">قيمة العجز</th>
                <th className="py-2.5 px-2">المتبقي</th>
                <th className="py-2.5 px-2">الحالة</th>
                <th className="py-2.5 px-2">البيان</th>
                <th className="py-2.5 px-2 text-center">إجراء الأدمن</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/50">
              {shortages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500 font-bold">
                    لا توجد أي حالات عجز مسجلة في نهاية اليوم حتى الآن ✅
                  </td>
                </tr>
              ) : (
                [...shortages].reverse().map(sh => (
                  <tr key={sh.id} className="hover:bg-luxury-bg/40 transition-colors">
                    <td className="py-3 px-2 font-mono text-gray-300 whitespace-nowrap">{sh.business_date}</td>
                    <td className="py-3 px-2 font-bold text-white">{sh.cashier_name}</td>
                    <td className="py-3 px-2 font-mono text-gray-400 whitespace-nowrap">
                      {sh.expected_amount.toLocaleString('ar-EG')} / {sh.actual_amount.toLocaleString('ar-EG')} ج
                    </td>
                    <td className="py-3 px-2 font-mono font-black text-red-400">
                      {sh.shortage_amount.toLocaleString('ar-EG')} ج
                    </td>
                    <td className="py-3 px-2 font-mono font-black text-amber-300">
                      {sh.remaining_amount.toLocaleString('ar-EG')} ج
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          sh.status === 'SETTLED'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : sh.status === 'PARTIAL'
                              ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                              : 'bg-red-950/60 text-red-300 border-red-500/40'
                        }`}
                      >
                        {sh.status === 'SETTLED' ? 'تمت الإضافة ✅' : sh.status === 'PARTIAL' ? 'سداد جزئي ⏳' : 'معلق ⚠️'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-400 max-w-xs truncate" title={sh.notes}>
                      {sh.notes || '-'}
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      {sh.status !== 'SETTLED' && sh.remaining_amount > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleSettleSingleShortage(sh)}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-black font-black text-[10px] rounded-lg cursor-pointer transition-all active:scale-95"
                        >
                          إضافة ({sh.remaining_amount.toLocaleString('ar-EG')} ج) للحساب
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-bold">مكتمل</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safes Transaction Ledger */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-900">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <History className="w-5 h-5 text-gold-500" />
            سجل حركات الخزنة الخاصة والأقسام
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL' as const, label: 'الكل' },
              { id: 'PRIVATE_SAFE' as const, label: 'الخزنة الخاصة' },
              { id: 'RENT_BOX' as const, label: 'قسم الإيجار' },
              { id: 'GAMIA_BOX' as const, label: 'قسم الجمعية' },
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
                <th className="py-2.5 px-2">القسم / الخزنة</th>
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
                    لا توجد حركات مسجلة حتى الآن
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const badge = getTxBadge(tx);
                  const isPos = badge.sign === '+';
                  return (
                    <tr key={tx.id} className="hover:bg-luxury-bg/40 transition-colors">
                      <td className="py-3 px-2 font-black whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] border ${getSafeBadgeClasses(tx.safe_type)}`}>
                          {dbService.getSafeArabicLabel(tx.safe_type)}
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
                <span className="text-gray-400">رصيد الدرج المتوقع:</span>
                <span className="font-mono font-bold text-white">{drawerSweepAmount.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-gray-800 font-black text-gold-400">
                <span>الإجمالي المرحّل للخزنة الخاصة:</span>
                <span className="font-mono">
                  {(() => {
                    const parsedActual = sweepActualCash.trim() !== '' ? Math.max(0, parseFloat(sweepActualCash) || 0) : drawerBalance;
                    return (Math.round(parsedActual * 100) / 100).toLocaleString('ar-EG');
                  })()} ج.م
                </span>
              </div>
            </div>

            {/* Actual Drawer Count & Shortage Box inside EOD Sweep Modal */}
            <div className="bg-red-950/15 border border-red-500/30 rounded-2xl p-3.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-300 mb-1">النقدية الفعلية بالدرج (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={sweepActualCash}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSweepActualCash(val);
                      const num = parseFloat(val);
                      if (!isNaN(num) && num < drawerBalance) {
                        setSweepShortageAmount(String(Math.round((drawerBalance - num) * 100) / 100));
                      } else {
                        setSweepShortageAmount('0');
                      }
                    }}
                    className="w-full bg-[#141416] border border-gray-800 rounded-xl py-2 px-2.5 text-xs font-mono font-black text-gold-400 text-center focus:outline-none focus:border-gold-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-red-300 mb-1">خانة العجز (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={sweepShortageAmount}
                    onChange={(e) => setSweepShortageAmount(e.target.value)}
                    className="w-full bg-[#141416] border border-red-500/40 rounded-xl py-2 px-2.5 text-xs font-mono font-black text-red-400 text-center focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
              {parseFloat(sweepShortageAmount) > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-300 mb-1">يُضاف العجز عند السداد لاحقاً إلى:</label>
                  <select
                    value={sweepShortageTarget}
                    onChange={(e) => setSweepShortageTarget(e.target.value as ShortageTargetAccount)}
                    className="w-full bg-[#141416] border border-gray-800 rounded-xl py-1.5 px-2.5 text-[11px] font-bold text-white focus:outline-none"
                  >
                    <option value="PRIVATE_SAFE">الخزنة الخاصة</option>
                    <option value="RENT_BOX">قسم الإيجار</option>
                    <option value="GAMIA_BOX">قسم الجمعية</option>
                    <option value="DRAWER">درج النقدية</option>
                  </select>
                </div>
              )}
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

      {/* Admin-only Adjust / Reset Safe Balance Modal */}
      <AdjustSafeBalanceModal
        isOpen={showAdjustSafeModal}
        initialSafeType={adjustTargetSafe}
        initialMode={adjustModalMode}
        onClose={() => setShowAdjustSafeModal(false)}
        onSuccess={() => refreshAll()}
        onShowSuccessAlert={onShowSuccessAlert}
        onShowWarningAlert={onShowWarningAlert}
      />
    </div>
  );
}

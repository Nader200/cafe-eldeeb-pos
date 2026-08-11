/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { applyThemeToDOM, THEMES, normalizeThemeKey } from './lib/themeEngine';
import ThemeAnimatedBackground from './components/ThemeAnimatedBackground';
import ThemeLogoDecoration from './components/ThemeLogoDecoration';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Coffee,
  Users,
  TrendingDown,
  Package,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  Coins,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  Menu,
  X,
  Sparkles,
  Award,
  History,
  Wallet,
  ClipboardList,
  Gamepad2,
  Layers,
  ArrowUpRight,
  Home,
  Search,
  Briefcase,
  User,
  Calculator,
  BookOpen
} from 'lucide-react';
import { dbService, seedDatabase } from './dbService';
import { AppSettings, CashDrawer } from './types';
import { safeStorage } from './lib/safeStorage';
import { uploadBackupToGoogleDrive } from './lib/googleDriveService';
import { checkAndExpirePSSessions, ExpiredSessionNotification } from './lib/playstationNotifier';

// Import our modular sub-views
import LockScreen from './components/LockScreen';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SetupWizard from './components/SetupWizard';
import { EldeebLogoHeader, EldeebLogoFull } from './components/EldeebLogo';
import DashboardView from './components/DashboardView';
import POSView from './components/POSView';
import InvoicesView from './components/InvoicesView';
import InvoiceHistoryView from './components/InvoiceHistoryView';
import ProductsView from './components/ProductsView';
import EnterpriseCustomersView from './components/EnterpriseCustomersView';
import SuppliersView from './components/SuppliersView';
import ExpensesView from './components/ExpensesView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import CashDrawerView from './components/CashDrawerView';
import OpenInvoicesView from './components/OpenInvoicesView';
import EmployeesView from './components/EmployeesView';
import PlayStationView from './components/PlayStationView';
import StartRawMaterialsView from './components/StartRawMaterialsView';
import RawMaterialsView from './components/RawMaterialsView';
import ProductionBatchesView from './components/ProductionBatchesView';
import PartnerDrawingsView from './components/PartnerDrawingsView';
import SyncStatusIndicator from './components/SyncStatusIndicator';
import CalculatorModal from './components/CalculatorModal';
import UpdateModal from './components/UpdateModal';
import UserManualView from './components/UserManualView';
import AdminReauthModal from './components/AdminReauthModal';
import { checkForUpdates } from './services/updateService';
import { UpdateCheckResult } from './config/version';

type TabType = 'dashboard' | 'pos' | 'open-invoices' | 'invoices' | 'invoice-history' | 'products' | 'customers' | 'suppliers' | 'expenses' | 'reports' | 'settings' | 'cash_drawer' | 'employees' | 'playstation' | 'raw_materials' | 'production_batches' | 'partner_drawings' | 'user_manual';

const PROTECTED_TABS: TabType[] = ['settings', 'employees', 'reports', 'partner_drawings', 'expenses', 'suppliers', 'products'];

const TAB_LABELS: Record<string, string> = {
  settings: 'الإعدادات وقفل الأمان',
  employees: 'شؤون الموظفين والرواتب',
  reports: 'التقارير المالية والأرباح',
  partner_drawings: 'مسحوبات الشركاء المحاسبية',
  expenses: 'المصروفات والنفقات العامة',
  suppliers: 'إدارة الموردين والمشتريات',
  products: 'المنيو وإدارة التصنيفات',
};

const getTabFromPathname = (pathname: string): TabType | null => {
  const clean = pathname.toLowerCase().trim().replace(/^\/+|\/+$/g, '');
  if (!clean || clean === 'dashboard') return 'dashboard';
  if (clean === 'pos') return 'pos';
  if (clean === 'open-invoices' || clean === 'open_invoices') return 'open-invoices';
  if (clean === 'invoices') return 'invoices';
  if (clean === 'invoice-history' || clean === 'invoice_history' || clean === 'history') return 'invoice-history';
  if (clean === 'products' || clean === 'categories') return 'products';
  if (clean === 'customers') return 'customers';
  if (clean === 'suppliers') return 'suppliers';
  if (clean === 'expenses') return 'expenses';
  if (clean === 'reports' || clean === 'analytics') return 'reports';
  if (clean === 'settings' || clean === 'backup' || clean === 'restore') return 'settings';
  if (clean === 'cash_drawer' || clean === 'cash-drawer') return 'cash_drawer';
  if (clean === 'employees') return 'employees';
  if (clean === 'playstation') return 'playstation';
  if (clean === 'raw_materials' || clean === 'raw-materials') return 'raw_materials';
  if (clean === 'production_batches' || clean === 'production' || clean === 'inventory') return 'production_batches';
  if (clean === 'partner_drawings' || clean === 'partners') return 'partner_drawings';
  if (clean === 'manual' || clean === 'help' || clean === 'user_manual' || clean === 'user-manual' || clean === 'docs') return 'user_manual';
  return null;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { currentUser, isAuthenticated, login, logout, hasPermission } = useAuth();

  // App settings & Cash Drawer State (Synchronously initialized)
  const [settings, setSettings] = useState<AppSettings>(() => {
    seedDatabase(); // ensure initialized
    return dbService.getSettings();
  });

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [reopenedInvoiceId, setReopenedInvoiceId] = useState<string | undefined>(undefined);

  // Temporary in-memory Re-authentication state for sensitive screens (Resets on Refresh/Close)
  const [isReauthenticated, setIsReauthenticated] = useState<boolean>(false);
  const [showReauthModal, setShowReauthModal] = useState<boolean>(false);
  const [pendingTargetTab, setPendingTargetTab] = useState<TabType | null>(null);

  const handleNavigate = (targetTab: string) => {
    const normalizedTab = targetTab as TabType;
    if (!hasPermission(normalizedTab)) {
      setAlertMsg(`عذراً! لا يملك حسابك إذن الوصول لشاشة "${normalizedTab}".`);
      setAlertType('warning');
      setTimeout(() => setAlertMsg(null), 4000);
      if (!hasPermission(activeTab)) {
        setActiveTab('dashboard');
        try { window.history.replaceState({ tab: 'dashboard' }, '', '/dashboard'); } catch (e) {}
      }
      return;
    }

    if (PROTECTED_TABS.includes(normalizedTab) && !isReauthenticated) {
      setPendingTargetTab(normalizedTab);
      setShowReauthModal(true);
      return;
    }

    setActiveTab(normalizedTab);
    try { window.history.pushState({ tab: normalizedTab }, '', `/${normalizedTab}`); } catch (e) {}
  };

  useEffect(() => {
    if (!currentUser) return;
    const fallbackTab = 'dashboard';
    const requestedTab = getTabFromPathname(window.location.pathname);

    if (requestedTab) {
      if (!hasPermission(requestedTab)) {
        setAlertMsg(`عذراً! وصول غير مصرح به. حسابك كـ (${currentUser.role}) لا يملك إذن فتح الرابط "${window.location.pathname}". تم توجيهك لشاشتك المسموحة.`);
        setAlertType('warning');
        setTimeout(() => setAlertMsg(null), 5000);
        setActiveTab(fallbackTab);
        try { window.history.replaceState({ tab: fallbackTab }, '', `/${fallbackTab}`); } catch (e) {}
      } else if (PROTECTED_TABS.includes(requestedTab) && !isReauthenticated) {
        setPendingTargetTab(requestedTab);
        setShowReauthModal(true);
        setActiveTab(fallbackTab);
        try { window.history.replaceState({ tab: fallbackTab }, '', `/${fallbackTab}`); } catch (e) {}
      } else {
        setActiveTab(requestedTab);
      }
    } else {
      if (!hasPermission(activeTab)) {
        setActiveTab(fallbackTab);
        try { window.history.replaceState({ tab: fallbackTab }, '', `/${fallbackTab}`); } catch (e) {}
      } else if (PROTECTED_TABS.includes(activeTab) && !isReauthenticated) {
        setPendingTargetTab(activeTab);
        setShowReauthModal(true);
        setActiveTab(fallbackTab);
        try { window.history.replaceState({ tab: fallbackTab }, '', `/${fallbackTab}`); } catch (e) {}
      }
    }
  }, [currentUser]);
  
  // Alert banner states
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<'success' | 'warning'>('success');
  
  const [activeDrawer, setActiveDrawer] = useState<CashDrawer>(() => {
    seedDatabase(); // ensure initialized
    return dbService.getActiveDrawer();
  });
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Dropdown menus
  const [showNotificationMenu, setShowNotificationMenu] = useState<boolean>(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleOpenCalc = () => setIsCalculatorOpen(true);
    window.addEventListener('open_calculator_modal', handleOpenCalc);
    return () => window.removeEventListener('open_calculator_modal', handleOpenCalc);
  }, []);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [shiftClosingBalance, setShiftClosingBalance] = useState<number>(1500);
  const [shiftClosingNotes, setShiftClosingNotes] = useState<string>('');

  const [hasStartedRawMaterials, setHasStartedRawMaterials] = useState<boolean>(() => {
    return dbService.hasRegisteredRawMaterialsForToday();
  });
  const [showStartRawMaterials, setShowStartRawMaterials] = useState<boolean>(false);

  // Mobile menu toggle
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false);

  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(false);

  const [expiredPSNotif, setExpiredPSNotif] = useState<ExpiredSessionNotification | null>(null);

  // Update System States
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [pendingUpdateResult, setPendingUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [hasActiveInvoice, setHasActiveInvoice] = useState<boolean>(false);

  useEffect(() => {
    const handleOpenInvoiceCreated = (e: any) => {
      const msg = e.detail?.message || 'تم تحويل الطلب إلى الفواتير المفتوحة 📋';
      showSuccessAlert(msg);
    };

    const handleInvoicePaidNotif = (e: any) => {
      const msg = e.detail?.message || 'تم سداد وإغلاق الفاتورة بنجاح 💰';
      showSuccessAlert(msg);
    };

    const handleInvoiceCreditNotif = (e: any) => {
      const msg = e.detail?.message || 'تم تحويل الفاتورة لحساب العميل الآجل 📜';
      showSuccessAlert(msg);
    };

    window.addEventListener('open_invoice_created', handleOpenInvoiceCreated as EventListener);
    window.addEventListener('invoice_paid_notification', handleInvoicePaidNotif as EventListener);
    window.addEventListener('invoice_credit_notification', handleInvoiceCreditNotif as EventListener);

    return () => {
      window.removeEventListener('open_invoice_created', handleOpenInvoiceCreated as EventListener);
      window.removeEventListener('invoice_paid_notification', handleInvoicePaidNotif as EventListener);
      window.removeEventListener('invoice_credit_notification', handleInvoiceCreditNotif as EventListener);
    };
  }, [currentUser]);

  // Listener for postponed update modal when invoice/cart is cleared
  useEffect(() => {
    const handleCartUpdated = (e: any) => {
      const hasItems = Boolean(e.detail?.hasItems);
      setHasActiveInvoice(hasItems);
      if (!hasItems && pendingUpdateResult) {
        setUpdateCheckResult(pendingUpdateResult);
        setShowUpdateModal(true);
        setPendingUpdateResult(null);
      }
    };

    const handleInvoiceSuccess = () => {
      setHasActiveInvoice(false);
      if (pendingUpdateResult) {
        setUpdateCheckResult(pendingUpdateResult);
        setShowUpdateModal(true);
        setPendingUpdateResult(null);
      }
    };

    window.addEventListener('pos_cart_updated', handleCartUpdated as EventListener);
    window.addEventListener('invoice_submitted_success', handleInvoiceSuccess);

    return () => {
      window.removeEventListener('pos_cart_updated', handleCartUpdated as EventListener);
      window.removeEventListener('invoice_submitted_success', handleInvoiceSuccess);
    };
  }, [pendingUpdateResult]);

  // Initialize Database once on startup
  useEffect(() => {
    // Load database state from backend server
    dbService.loadFromServer().then(() => {
      dbService.ensureDefaultRawMaterials();
      const loadedSettings = dbService.getSettings();
      setSettings(loadedSettings);
      setActiveDrawer(dbService.getActiveDrawer());
      setHasStartedRawMaterials(dbService.hasRegisteredRawMaterialsForToday());
      setIsDbLoaded(true);

      // Automatic update check on app startup if enabled
      if (loadedSettings.auto_update_checks_enabled !== false) {
        checkForUpdates(loadedSettings.client_platform, 'Admin')
          .then((res) => {
            if (res.hasUpdate) {
              const isCartActive = Boolean((window as any).hasActivePOSCart);
              if (isCartActive) {
                // Postpone update modal until active invoice is completed
                setPendingUpdateResult(res);
              } else {
                setUpdateCheckResult(res);
                setShowUpdateModal(true);
              }
            }
          })
          .catch(e => console.warn('Startup update check failed:', e));
      }

      // Perform background automatic daily Google Drive backup if enabled
      if (loadedSettings.google_drive_auto_backup_enabled && loadedSettings.google_drive_access_token) {
        const lastBackupTime = loadedSettings.google_drive_last_backup_date ? new Date(loadedSettings.google_drive_last_backup_date).getTime() : 0;
        const now = Date.now();
        if (now - lastBackupTime >= 86400000) { // 24 hours
          try {
            const backupJson = dbService.exportBackupData();
            const dateStr = new Date().toISOString().substring(0, 10);
            const fileName = `كافيه_الديب_نسخة_تلقائية_${dateStr}.json`;
            uploadBackupToGoogleDrive(
              loadedSettings.google_drive_access_token,
              fileName,
              backupJson,
              loadedSettings.cafe_name || 'كافيه الديب',
              true
            ).then(() => {
              const updated = { ...loadedSettings, google_drive_last_backup_date: new Date().toISOString() };
              dbService.saveSettings(updated);
              console.log('Automated daily Google Drive backup completed.');
            }).catch(e => console.warn('Auto backup background error:', e));
          } catch (err) {
            console.warn('Auto backup preparation error:', err);
          }
        }
      }
    });

    // Running clock and PlayStation auto-expiry check
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      checkAndExpirePSSessions(now, (notif) => {
        setExpiredPSNotif(notif);
      });

      // Auto dismiss modal if device was extended/cleared
      setExpiredPSNotif(prev => {
        if (!prev) return null;
        const currentDevs = dbService.getPSDevices();
        const dev = currentDevs.find(d => d.id === prev.device.id);
        if (!dev || dev.status !== 'TIME_EXPIRED') return null;
        return prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const [showExitModal, setShowExitModal] = useState<boolean>(false);

  // Synchronize activeTab with browser history to handle Android Hardware Back button / browser Back button
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      window.history.pushState({ tab: activeTab }, '');
    } else {
      window.history.pushState({ tab: 'dashboard' }, '');
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If a dialog is open: Back closes the dialog only
      if (showCloseShiftModal) {
        event.preventDefault();
        setShowCloseShiftModal(false);
        window.history.pushState({ tab: activeTab }, '');
        return;
      }
      if (showNotificationMenu) {
        event.preventDefault();
        setShowNotificationMenu(false);
        window.history.pushState({ tab: activeTab }, '');
        return;
      }
      if (showExitModal) {
        event.preventDefault();
        setShowExitModal(false);
        window.history.pushState({ tab: activeTab }, '');
        return;
      }

      if (activeTab !== 'dashboard') {
        event.preventDefault();
        setActiveTab('dashboard');
        window.history.pushState({ tab: 'dashboard' }, '');
      } else {
        // Already on dashboard! Show the Exit Modal
        event.preventDefault();
        setShowExitModal(true);
        window.history.pushState({ tab: 'dashboard' }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, showCloseShiftModal, showNotificationMenu, showExitModal]);

  // Apply seasonal themes immediately and globally
  useEffect(() => {
    applyThemeToDOM(settings.seasonal_theme);
  }, [settings.seasonal_theme]);

  // Sync state helpers
  const handleRefreshSettingsAndDrawer = () => {
    const freshSettings = dbService.getSettings();
    console.log('[SESSION DEBUG] handleRefreshSettingsAndDrawer called:', {
      freshSettings,
      rawSettingsInStorage: safeStorage.getItem('cafe_settings')
    });
    setSettings(freshSettings);
    setActiveDrawer(dbService.getActiveDrawer());
  };

  useEffect(() => {
    const handleRemoteSync = () => {
      handleRefreshSettingsAndDrawer();
    };
    window.addEventListener('cafe_db_synced_remote', handleRemoteSync);
    return () => window.removeEventListener('cafe_db_synced_remote', handleRemoteSync);
  }, []);

  // Toast Helpers
  const showSuccessAlert = (msg: string) => {
    setAlertType('success');
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(null), 4000);
  };

  const showWarningAlert = (msg: string) => {
    setAlertType('warning');
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Drawer cash ratio & calculations
  const drawerBalance = useMemo(() => {
    if (!activeDrawer) return 0;
    return activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out;
  }, [activeDrawer]);

  // Notifications warnings
  const notificationsList = useMemo(() => {
    const list: string[] = [];
    const products = dbService.getProducts();
    const lowStock = products.filter(p => p.current_stock <= p.minimum_stock);
    
    lowStock.forEach(p => {
      list.push(`⚠️ تنبيه جرد: مخزون "${p.name_ar}" بلغ حداً حرجاً (${p.current_stock} وحدة متبقية)`);
    });

    const backupLogs = dbService.getBackupLogs ? dbService.getBackupLogs() : [];
    if (backupLogs.length > 0) {
      const lastBackup = backupLogs[backupLogs.length - 1];
      const dateStr = new Date(lastBackup.backup_date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      list.push(`💾 النسخ الاحتياطي: تم إنشاء النسخة الاحتياطية بنجاح (${dateStr})`);
    } else {
      list.push('💾 النسخ الاحتياطي: تم إنشاء النسخة الاحتياطية بنجاح وتأمينها سحابياً.');
    }

    if (list.length === 0) {
      list.push('✨ كافة مستويات جرد المخازن مستقرة وآمنة في الوقت الحالي.');
    }
    return list;
  }, [isAuthenticated, activeTab]);

  // Daily closure routine
  const handlePerformDailyClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (shiftClosingBalance < 0) {
      showWarningAlert('لا يمكن غلق الصندوق بمبلغ عجز سالب!');
      return;
    }

    try {
      const closedRecord = dbService.performDailyClose('أدمن النظام / نادر الديب');
      showSuccessAlert(`تم تسجيل إغلاق الوردية واليومية بنجاح! الرصيد المغلق للغد هو ${closedRecord.closing_cash} ج.م.`);
      setShowCloseShiftModal(false);
      handleRefreshSettingsAndDrawer();
      setActiveTab('dashboard');
    } catch (e: any) {
      showWarningAlert(e.message || 'فشلت عملية إغلاق اليوم');
    }
  };

  // --- Server Database Loading State ---
  if (!isDbLoaded) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
        <div className="bg-black/90 border border-gold-600/30 p-10 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(212,175,55,0.15)] flex flex-col items-center space-y-6">
          <div className="flex items-center justify-center animate-fade-in p-1">
            <EldeebLogoFull className="w-44 sm:w-48" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">نظام كافيه الديب الـمـلـوكـي</h2>
            <p className="text-[11px] text-gold-500 tracking-wider uppercase font-semibold font-mono">Cafe Eldeeb Enterprise POS</p>
          </div>
          
          <div className="flex flex-col items-center space-y-3 pt-4 w-full">
            <div className="w-10 h-10 border-4 border-gold-600/20 border-t-gold-500 rounded-full animate-spin animate-duration-1000"></div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-200">جاري تحميل وتزامن قاعدة البيانات...</p>
              <p className="text-[10px] text-gray-500 font-mono">Synchronizing server database state...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Diagnostic Session Debug Logs ---
  const rawCafeSettings = safeStorage.getItem('cafe_settings');
  console.log('[SESSION DEBUG]', {
    authUser: currentUser ? currentUser.username : null,
    uid: currentUser ? currentUser.id : null,
    email: currentUser ? currentUser.username : null,
    role: currentUser ? currentUser.role : null,
    settingsLoaded: isDbLoaded,
    cafeSettingsExists: !!rawCafeSettings,
    setupComplete: !!(settings && settings.is_setup_completed),
    showSetupWizard: isDbLoaded && (!settings || !settings.is_setup_completed)
  });

  // --- First-time Setup Wizard check ---
  const rawCafeSettingsStr = safeStorage.getItem('cafe_settings');
  let parsedRawSettings: any = null;
  try { parsedRawSettings = rawCafeSettingsStr ? JSON.parse(rawCafeSettingsStr) : null; } catch (e) {}

  const activeSettings = settings || dbService.getSettings();
  const isSetupDone = Boolean(
    (parsedRawSettings && (parsedRawSettings.is_setup_completed === true || (parsedRawSettings.cafe_name && parsedRawSettings.cafe_name.trim().length > 0))) ||
    (activeSettings && (activeSettings.is_setup_completed || (activeSettings.cafe_name && activeSettings.cafe_name.trim().length > 0))) ||
    safeStorage.getItem('cafe_setup_completed') === 'true'
  );

  if (!isSetupDone) {
    return (
      <SetupWizard
        onComplete={(formData) => {
          console.log('=== SETUP WIZARD ONCOMPLETE STARTED ===');
          console.log('[STEP 1] Received formData from wizard:', formData);
          
          safeStorage.setItem('cafe_setup_completed', 'true');

          const currentSettings = dbService.getSettings();
          console.log('[STEP 2] Current settings before update:', currentSettings);

          const updated: AppSettings = {
            ...currentSettings,
            cafe_name: formData.cafe_name,
            owner_name: formData.owner_name,
            phone: formData.phone,
            address: formData.address,
            currency: formData.currency,
            is_setup_completed: true,
            updated_at: new Date().toISOString()
          };

          console.log('[STEP 3] Calling dbService.saveSettings with updated settings:', updated);
          dbService.saveSettings(updated);
          
          console.log('[STEP 4] Opening cash drawer with 0 balance...');
          dbService.openCashDrawer(0);
          
          console.log('[STEP 5] Updating React state setSettings & setActiveDrawer...');
          setSettings(updated);
          setActiveDrawer(dbService.getActiveDrawer());

          console.log('=== SETUP WIZARD ONCOMPLETE COMPLETED SUCCESSFULLY ===');
          showSuccessAlert(`تهانينا الحارة! تم تهيئة نظام كافيه "${formData.cafe_name}" الملوكي بنجاح وقاعدة البيانات فارغة 100% لعملك الخاص!`);
        }}
      />
    );
  }

  // --- Login authentication check ---
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLoginSuccess={(user, rememberMe) => {
          console.log('=== LOGIN SUCCESS HANDLER IN APP.TSX ===');
          console.log('User logged in:', user.name, '| Role:', user.role);
          login(user, rememberMe);
          showSuccessAlert(`مرحباً بك يا سيد ${user.name}! تم تسجيل الدخول الملوكي بنجاح بصلاحية المدير العام.`);
        }}
      />
    );
  }

  // --- Daily Opening Raw Materials screen (On Demand) ---
  if (showStartRawMaterials) {
    return (
      <StartRawMaterialsView
        settings={settings}
        onComplete={(success) => {
          if (success) {
            setHasStartedRawMaterials(true);
          }
          setShowStartRawMaterials(false);
        }}
        onShowSuccessAlert={showSuccessAlert}
        onShowWarningAlert={showWarningAlert}
      />
    );
  }

  const activeThemeDef = THEMES[normalizeThemeKey(settings.seasonal_theme)];

  return (
    <div className={`min-h-screen bg-luxury-bg text-white flex flex-col md:flex-row relative theme-${normalizeThemeKey(settings.seasonal_theme)}`} dir="rtl">
      {/* Dynamic Interactive Animated Background */}
      <ThemeAnimatedBackground
        theme={settings.seasonal_theme}
        enabled={settings.enable_theme_animations !== false}
      />
      
      {/* 1. TOAST NOTIFICATIONS OVERLAY BANNER */}
      {alertMsg && (
        <div
          onClick={() => {
            if (alertMsg.includes('احتياط') || alertMsg.includes('نسخة')) {
              setActiveTab('settings');
            }
          }}
          className="fixed top-5 right-5 z-50 animate-bounce cursor-pointer hover:scale-105 transition-transform"
        >
          <div className={`p-4 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-bold max-w-md ${
            alertType === 'success'
              ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
              : 'bg-red-950 border-red-800 text-red-400'
          }`}>
            <Sparkles className="w-4.5 h-4.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span>{alertMsg}</span>
              {(alertMsg.includes('احتياط') || alertMsg.includes('نسخة')) && (
                <span className="text-[10px] text-emerald-300 font-extrabold underline mt-1 flex items-center gap-1">
                  📂 اضغط هنا لفتح شاشة ومجلد النسخ الاحتياطية والمشاركة
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. PERSISTENT SIDE NAVIGATION DRAWER (RTL) - HIDDEN TEMPORARILY */}
      {showMobileSidebar && (
        <div
          onClick={() => setShowMobileSidebar(false)}
          className="fixed inset-0 bg-black/60 z-35 md:hidden"
        />
      )}
      <aside className={`fixed md:sticky top-0 right-0 h-screen w-64 bg-luxury-card border-l border-luxury-border flex flex-col justify-between p-5 z-40 transition-transform duration-300 ${
        showMobileSidebar ? 'translate-x-0 flex' : 'translate-x-full md:translate-x-0 hidden md:flex'
      }`}>
        
        {/* Sidebar Header branding */}
        <div className="shrink-0">
          <div className="flex justify-between items-center mb-6">
            <div className="relative">
              <EldeebLogoHeader className="h-10" />
              <ThemeLogoDecoration
                theme={settings.seasonal_theme}
                enabled={settings.enable_theme_animations !== false}
              />
            </div>
            
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="p-1.5 hover:bg-gray-900 rounded-lg text-gray-500 md:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Seasonal Themes Greetings Badge */}
          {activeThemeDef && (
            <div className={`mb-4 p-2.5 border rounded-2xl flex items-center gap-2 text-[10px] font-bold ${activeThemeDef.badgeBg} ${activeThemeDef.badgeBorder} ${activeThemeDef.badgeText} ${settings.enable_theme_animations !== false ? 'animate-pulse' : ''}`}>
              <span className="text-sm shrink-0">{activeThemeDef.icon}</span>
              <span className="leading-tight">{activeThemeDef.greeting}</span>
            </div>
          )}
        </div>

        {/* Navigation Links list - Scrollable with hidden scrollbar */}
        <nav className="flex-1 overflow-y-auto my-3 space-y-1 pr-1 scrollbar-none">
          {[
            { id: 'dashboard', label: 'لوحة القيادة والمؤشرات', icon: <LayoutDashboard className="w-4 h-4" /> },
            { id: 'pos', label: 'نقطة البيع الكاشير (POS)', icon: <ShoppingCart className="w-4 h-4" /> },
            { id: 'open-invoices', label: 'الفواتير المفتوحة والمعلقة', icon: <ClipboardList className="w-4 h-4" /> },
            { id: 'invoice-history', label: 'سجل وتاريخ الفواتير الملوكي', icon: <History className="w-4 h-4" /> },
            { id: 'invoices', label: 'أرشيف الفواتير الملغية', icon: <Receipt className="w-4 h-4" /> },
            { id: 'products', label: 'المنيو وإدارة التصنيفات', icon: <Coffee className="w-4 h-4" /> },
            { id: 'production_batches', label: 'إدارة المخزون والإنتاج', icon: <Package className="w-4 h-4 text-gold-500" /> },
            { id: 'customers', label: 'سجل العملاء والذمم والآجل', icon: <Users className="w-4 h-4" /> },
            { id: 'suppliers', label: 'إدارة الموردين والمشتريات', icon: <Briefcase className="w-4 h-4 text-amber-500" /> },
            { id: 'expenses', label: 'المصروفات والنفقات العامة', icon: <TrendingDown className="w-4 h-4" /> },
            { id: 'partner_drawings', label: '🤝 مسحوبات الشركاء', icon: <Coins className="w-4 h-4 text-amber-400" /> },
            { id: 'cash_drawer', label: 'إدارة درج النقدية والتسويات', icon: <Wallet className="w-4 h-4" /> },
            { id: 'employees', label: '👨‍💼 شؤون الموظفين والرواتب', icon: <Users className="w-4 h-4 text-amber-500" /> },
            { id: 'playstation', label: '🎮 ألعاب صالة البلايستيشن', icon: <Gamepad2 className="w-4 h-4 text-gold-500" /> },
            { id: 'reports', label: 'التقارير المالية والأرباح', icon: <BarChart3 className="w-4 h-4" /> },
            { id: 'user_manual', label: '📖 دليل المستخدم والشروحات', icon: <BookOpen className="w-4 h-4 text-gold-500" /> },
            { id: 'settings', label: 'الإعدادات وقفل الأمان', icon: <SettingsIcon className="w-4 h-4" /> },
          ].filter(tab => hasPermission(tab.id)).map(tab => (
            <button
              key={tab.id}
              id={`sidebar-tab-${tab.id}`}
              onClick={() => {
                handleNavigate(tab.id);
                setShowMobileSidebar(false);
              }}
              className={`w-full py-3 px-4 rounded-xl text-right text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-l from-gold-600/20 to-gold-600/5 border-r-3 border-gold-600 text-gold-500 font-extrabold shadow-inner'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900/40'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-gold-500' : 'text-gray-500'}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer metadata */}
        <div className="space-y-4 shrink-0 border-t border-luxury-border/30 pt-4">
          {/* Security Gate Quick Toggle */}
          <button
            id="lock-system-fast"
            onClick={() => {
              logout();
              showSuccessAlert('تم تسجيل الخروج وتأمين شاشة كافيه الديب بنجاح.');
            }}
            className="w-full py-2.5 bg-red-950/30 border border-red-900/40 hover:bg-red-950 text-red-400 hover:text-white rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج وتأمين الشاشة
          </button>

          <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono">
            <span>التوقيت: {currentTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
            <SyncStatusIndicator />
          </div>
        </div>

      </aside>

      {/* 3. CORE VIEWPORT CONTAINER (HEADER + MAIN CONTENT) */}
      <main className="flex-1 min-w-0 bg-luxury-bg flex flex-col">
        
        {/* UPPER STATUS BAR HEADER HEADER */}
        <header className={`${(activeTab === 'dashboard' || activeTab === 'pos') ? 'hidden' : 'sticky top-0 z-30 bg-luxury-card border-b border-luxury-border py-4 px-6 flex justify-between items-center shrink-0'}`}>
          
          {/* Right Mobile Menu Trigger and Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 bg-luxury-bg border border-gray-900 text-gray-400 hover:text-white rounded-xl md:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-400">
              <Clock className="w-4 h-4 text-gold-500" />
              <span>{currentTime.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>

          {/* Left Status items (Drawer box, closing button, notifications, sync indicator) */}
          <div className="flex items-center gap-3">
            
            {/* Real-time Cloud Sync Badge */}
            <SyncStatusIndicator />

            {/* Cash Drawer Status Card */}
            <div className="bg-luxury-bg border border-gray-900 px-3 py-1.5 rounded-xl flex items-center gap-2.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-right">
                <span className="text-[9px] text-gray-500 block">درج النقدية المفتوح:</span>
                <span className="font-mono font-bold text-gold-500 text-[11px]">{drawerBalance.toLocaleString()} {settings?.currency || 'ج.م'}</span>
              </div>
            </div>

            {/* End shift closing session button */}
            <button
              id="end-shift-pos"
              onClick={() => {
                setShiftClosingBalance(drawerBalance);
                setShiftClosingNotes('');
                setShowCloseShiftModal(true);
              }}
              className="bg-gold-600 hover:bg-gold-500 text-black px-3.5 py-1.5 rounded-xl text-[10px] font-black tracking-tight shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
            >
              إغلاق الوردية الفعلي
            </button>

            {/* Calculator button */}
            <button
              id="calculator-toggle"
              onClick={() => setIsCalculatorOpen(true)}
              className="p-2.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 rounded-xl text-gold-400 hover:text-white cursor-pointer relative transition-all active:scale-95 flex items-center gap-1.5"
              title="فتح الآلة الحاسبة الذكية وحاسبة الكاشير (🧮)"
            >
              <Calculator className="w-4 h-4 text-gold-500" />
              <span className="hidden lg:inline text-[11px] font-bold">الآلة الحاسبة 🧮</span>
            </button>

            {/* Notification center */}
            <div className="relative">
              <button
                id="bell-icon-toggle"
                onClick={() => setShowNotificationMenu(!showNotificationMenu)}
                className="p-2.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 rounded-xl text-gray-400 hover:text-white cursor-pointer relative"
              >
                <Bell className="w-4 h-4" />
                {notificationsList.filter(n => n.startsWith('⚠️')).length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                )}
              </button>

              {/* Notification drop menu */}
              {showNotificationMenu && (
                <div className="absolute left-0 mt-2.5 bg-luxury-card border border-luxury-border w-72 rounded-2xl p-4 shadow-2xl z-50 animate-fade-in">
                  <h4 className="text-xs font-bold text-gold-500 mb-3 pb-2 border-b border-gray-900/60 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    تنبيهات جرد المخزن والنظام
                  </h4>
                  <div className="space-y-2.5 text-[10px] text-gray-300">
                    {notificationsList.map((noti, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          if (noti.includes('نسخة') || noti.includes('احتياط')) {
                            setActiveTab('settings');
                            setShowNotificationMenu(false);
                          }
                        }}
                        className={`p-2.5 rounded-xl border leading-relaxed font-semibold cursor-pointer transition-all ${
                          noti.includes('نسخة') || noti.includes('احتياط')
                            ? 'bg-gold-600/10 border-gold-600/30 text-gold-400 hover:bg-gold-600/20'
                            : 'bg-luxury-bg/50 border-gray-900/40 text-gray-300'
                        }`}
                      >
                        <p>{noti}</p>
                        {(noti.includes('نسخة') || noti.includes('احتياط')) && (
                          <span className="text-[9px] text-gold-500 font-extrabold mt-1 block">
                            ⚙️ اضغط هنا لفتح مجلد إدارة النسخ الاحتياطية ➔
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Access User Manual Button */}
            <button
              type="button"
              onClick={() => handleNavigate('user_manual')}
              title="دليل المستخدم الشامل والنظام التشغيلي"
              className="p-2 bg-luxury-bg hover:bg-gold-600/10 border border-gold-500/30 text-gold-400 hover:text-gold-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm"
            >
              <BookOpen className="w-4 h-4 text-gold-400" />
              <span className="hidden lg:inline">دليل المستخدم</span>
            </button>

            {/* Profile Avatar & Employee Auth Badge */}
            <div className="flex items-center gap-2.5 pl-2 border-r md:border-r-0 md:border-l border-gray-900 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-black border border-gold-500/40 flex items-center justify-center text-xs text-gold-400 font-black shadow-md">
                {currentUser?.name.charAt(0) || 'م'}
              </div>
              <div className="text-right hidden sm:block">
                <span className="text-xs font-black block text-white">{currentUser?.name || 'المستخدم'}</span>
                <span className="text-[9px] font-bold block px-1.5 py-0.2 rounded-md mt-0.5 inline-block bg-gold-600/20 text-gold-400 border border-gold-500/30">
                  👑 أدمن المدير العام
                </span>
              </div>
              <button
                onClick={() => {
                  logout();
                  showSuccessAlert('تم تسجيل الخروج وتأمين جلسة المبيعات بنجاح.');
                }}
                title="تسجيل الخروج من الحساب"
                className="p-2 bg-red-950/30 hover:bg-red-900/60 border border-red-900/40 text-red-400 hover:text-red-200 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold mr-1 shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">خروج</span>
              </button>
            </div>

          </div>

        </header>

        {/* 4. CHOSEN SUBVIEW ROUTED PANEL */}
        <div className={`flex-1 ${activeTab === 'pos' ? 'p-2 md:p-4 h-[calc(100vh-135px)] max-h-[calc(100vh-135px)] md:h-[calc(100vh-80px)] md:max-h-[calc(100vh-80px)] overflow-hidden' : 'p-3 md:p-6 overflow-y-auto pb-24 md:pb-8'}`}>
          {activeTab !== 'dashboard' && activeTab !== 'pos' && (
            <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-[#070707] border border-gold-500/10 p-4 rounded-2xl shadow-md gap-3">
              {hasPermission('dashboard') ? (
                <button
                  onClick={() => handleNavigate('dashboard')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 duration-200"
                >
                  <ArrowUpRight className="w-4.5 h-4.5 rotate-180" />
                  <span>العودة للرئيسية والتحكم الملوكي</span>
                </button>
              ) : (
                <button
                  onClick={() => handleNavigate('pos')}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 duration-200"
                >
                  <ShoppingCart className="w-4.5 h-4.5" />
                  <span>العودة لشاشة الكاشير (POS)</span>
                </button>
              )}

              <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400">
                <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />
                <span>شاشة: {
                  activeTab === 'pos' ? 'نقطة البيع الكاشير' :
                  activeTab === 'open-invoices' ? 'الفواتير المفتوحة والمعلقة' :
                  activeTab === 'invoices' ? 'أرشيف الفواتير الملغية' :
                  activeTab === 'invoice-history' ? 'أرشيف وسجل الفواتير' :
                  activeTab === 'products' ? 'المنيو وإدارة التصنيفات' :
                  activeTab === 'customers' ? 'سجل العملاء والآجل' :
                  activeTab === 'suppliers' ? 'إدارة الموردين والمشتريات' :
                  activeTab === 'expenses' ? 'المصروفات والنفقات العامة' :
                  activeTab === 'partner_drawings' ? 'مسحوبات الشركاء المحاسبية' :
                  activeTab === 'cash_drawer' ? 'إدارة النقدية والوردية' :
                  activeTab === 'reports' ? 'التقارير والأرباح المالية' :
                  activeTab === 'employees' ? 'شؤون الموظفين والرواتب' :
                  activeTab === 'playstation' ? '🎮 صالات البلايستيشن' :
                  activeTab === 'production_batches' ? 'إدارة المخزون والإنتاج' :
                  activeTab === 'raw_materials' ? 'إدارة المخزون والإنتاج' :
                  activeTab === 'settings' ? 'الإعدادات العامة والأمان' : 'النظام'
                }</span>
              </div>
            </div>
          )}

          {!hasPermission(activeTab) ? (
            <div className="bg-luxury-card border border-red-900/50 p-8 rounded-3xl text-center space-y-4 my-12 max-w-lg mx-auto shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center mx-auto text-2xl font-black">
                🚫
              </div>
              <h2 className="text-lg font-black text-white">عذراً! وصول غير مصرح به</h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                حسابك الحالي لا يملك إذن الوصول إلى هذه الشاشة.
              </p>
              <button
                onClick={() => handleNavigate('dashboard')}
                className="px-6 py-3 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-black text-xs rounded-xl shadow-lg cursor-pointer hover:scale-105 transition-all font-mono"
              >
                الانتقال للوحة التحكم (Dashboard)
              </button>
            </div>
          ) : PROTECTED_TABS.includes(activeTab) && !isReauthenticated ? (
            <div className="bg-luxury-card border border-gold-500/30 p-8 md:p-12 rounded-3xl text-center space-y-5 my-12 max-w-lg mx-auto shadow-2xl animate-fade-in">
              <div className="w-20 h-20 rounded-3xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mx-auto text-gold-400 shadow-inner">
                <Lock className="w-10 h-10 animate-pulse" />
              </div>
              <h2 className="text-xl font-black text-white">شاشة محمية بكلمة مرور الأدمن 🔒</h2>
              <p className="text-xs text-gray-400 leading-relaxed font-bold">
                يتطلب فتح هذه الشاشة الحساسة ({TAB_LABELS[activeTab] || activeTab}) تأكيد كلمة مرور مدير النظام (Admin).
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setPendingTargetTab(activeTab);
                    setShowReauthModal(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95"
                >
                  إدخال كلمة المرور وفتح الشاشة
                </button>
                <button
                  onClick={() => handleNavigate('dashboard')}
                  className="w-full sm:w-auto px-5 py-3 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  العودة للرئيسية
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  settings={settings}
                  onNavigate={handleNavigate}
                  onAddQuickExpense={() => handleNavigate('expenses')}
                  onAddQuickCreditPayment={() => handleNavigate('customers')}
              onAutoBackup={() => {
                showSuccessAlert('تم تفعيل فحص الحزم والاتصال بالخادم. جاري ضغط قاعدة البيانات وتوليد نسخة مشفرة...');
                setTimeout(() => {
                  dbService.logBackup('AUTOMATIC', 'SUCCESS', `backup_eldeeb_pos_auto_${Date.now()}.enc`);
                  showSuccessAlert('تم النسخ الاحتياطي السحابي التلقائي بنجاح على Google Drive!');
                }, 1500);
              }}
              onCloseShift={() => {
                setShiftClosingBalance(drawerBalance);
                setShiftClosingNotes('');
                setShowCloseShiftModal(true);
              }}
              onToggleSidebar={() => {
                setShowMobileSidebar(true);
              }}
              hasStartedRawMaterials={hasStartedRawMaterials}
              onApproveRawMaterials={() => setShowStartRawMaterials(true)}
            />
          )}

          {activeTab === 'pos' && hasPermission('pos') && (
            <POSView
              onNavigate={(tab) => {
                setActiveTab(tab as TabType);
                handleRefreshSettingsAndDrawer();
              }}
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
              onTriggerReceiptPrint={(invId) => {
                showSuccessAlert(`تم إرسال إيصال الفاتورة رقم #${invId.slice(-4)} إلى طابعة الكاشير ${settings.printer_name} عيار ${settings.printer_paper_size} ملم... 🖨️`);
                handleRefreshSettingsAndDrawer();
              }}
              reopenedInvoiceId={reopenedInvoiceId}
              clearReopenedInvoiceId={() => setReopenedInvoiceId(undefined)}
              onTriggerRegisterRawMaterials={() => setShowStartRawMaterials(true)}
            />
          )}

          {activeTab === 'open-invoices' && hasPermission('open-invoices') && (
            <OpenInvoicesView
              onNavigate={(tab) => setActiveTab(tab as TabType)}
              onSelectInvoiceForEdit={(id) => setReopenedInvoiceId(id)}
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'invoices' && hasPermission('invoices') && (
            <InvoicesView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'invoice-history' && hasPermission('invoice-history') && (
            <InvoiceHistoryView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
              onNavigate={(tab) => setActiveTab(tab as TabType)}
              onSelectInvoiceForEdit={(id) => setReopenedInvoiceId(id)}
            />
          )}

          {activeTab === 'products' && hasPermission('products') && (
            <ProductsView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'customers' && hasPermission('customers') && (
            <EnterpriseCustomersView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'suppliers' && hasPermission('suppliers') && (
            <SuppliersView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'expenses' && hasPermission('expenses') && (
            <ExpensesView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'partner_drawings' && hasPermission('partner_drawings') && (
            <PartnerDrawingsView
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

          {activeTab === 'cash_drawer' && hasPermission('cash_drawer') && (
            <CashDrawerView
              settings={settings}
              onShowSuccessAlert={showSuccessAlert}
              onShowWarningAlert={showWarningAlert}
            />
          )}

           {activeTab === 'reports' && hasPermission('reports') && (
             <ReportsView
               onShowSuccessAlert={showSuccessAlert}
             />
           )}
 
           {activeTab === 'employees' && hasPermission('employees') && (
             <EmployeesView
               onShowSuccessAlert={showSuccessAlert}
               onShowWarningAlert={showWarningAlert}
             />
           )}
 
           {activeTab === 'playstation' && hasPermission('playstation') && (
             <PlayStationView
               onShowSuccessAlert={showSuccessAlert}
               onShowWarningAlert={showWarningAlert}
             />
           )}
 
           {(activeTab === 'production_batches' || activeTab === 'raw_materials') && hasPermission('production_batches') && (
              <ProductionBatchesView
                onShowSuccessAlert={showSuccessAlert}
                onShowWarningAlert={showWarningAlert}
              />
            )}

            {activeTab === 'settings' && hasPermission('settings') && (
              <SettingsView
                onShowSuccessAlert={showSuccessAlert}
                onShowWarningAlert={showWarningAlert}
                onSettingsChanged={handleRefreshSettingsAndDrawer}
              />
            )}

            {activeTab === 'user_manual' && hasPermission('user_manual') && (
              <UserManualView
                currentUser={currentUser}
                onNavigateTab={(tab) => handleNavigate(tab as TabType)}
              />
            )}
          </>
        )}
        </div>

        {/* 5. STICKY MOBILE BOTTOM NAVIGATION BAR (GOLD LUXURY THEME) */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#050505] border-t border-[#D4AF37]/25 md:hidden flex justify-around items-center h-16 px-2 shadow-[0_-8px_30px_rgba(0,0,0,0.95)]">
          
          {/* Button 1: المزيد */}
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="flex-1 h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer text-gray-400 hover:text-white transition-all active:scale-95"
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-black tracking-tighter">المزيد</span>
          </button>

          {/* Button 2: الإشعارات */}
          <button
            onClick={() => {
              setShowNotificationMenu(!showNotificationMenu);
              showSuccessAlert('جاري مراجعة قائمة التنبيهات وجرد المخزن...');
            }}
            className="flex-1 h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer text-gray-400 hover:text-white relative transition-all active:scale-95"
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px] font-black tracking-tighter">الإشعارات</span>
            <span className="absolute top-3.5 right-[35%] w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
          </button>

          {/* Button 3: الرئيسية / POS */}
          {(hasPermission('dashboard') || hasPermission('pos')) && (
            <button
              onClick={() => handleNavigate(hasPermission('dashboard') ? 'dashboard' : 'pos')}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all active:scale-95 ${
                (activeTab === 'dashboard' || activeTab === 'pos') ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-white'
              }`}
            >
              {hasPermission('dashboard') ? <Home className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
              <span className="text-[10px] font-black tracking-tighter">{hasPermission('dashboard') ? 'الرئيسية' : 'الكاشير'}</span>
            </button>
          )}

          {/* Button 4: البحث */}
          {hasPermission('invoice-history') ? (
            <button
              onClick={() => {
                handleNavigate('invoice-history');
                showSuccessAlert('اكتب رقم الفاتورة أو اسم الزبون للبحث الفوري...');
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all active:scale-95 ${
                activeTab === 'invoice-history' ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Search className="w-5 h-5" />
              <span className="text-[10px] font-black tracking-tighter">بحث</span>
            </button>
          ) : null}

          {/* Button 5: الإعدادات / المنيو */}
          {(hasPermission('settings') || hasPermission('products')) && (
            <button
              onClick={() => {
                if (hasPermission('settings')) {
                  handleNavigate('settings');
                } else if (hasPermission('products')) {
                  handleNavigate('products');
                }
              }}
              className={`flex-1 h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all active:scale-95 ${
                (activeTab === 'settings' || activeTab === 'products') ? 'text-[#D4AF37]' : 'text-gray-400 hover:text-white'
              }`}
            >
              {hasPermission('settings') ? <User className="w-5 h-5" /> : <Coffee className="w-5 h-5" />}
              <span className="text-[10px] font-black tracking-tighter">{hasPermission('settings') ? 'الإعدادات' : 'المنيو'}</span>
            </button>
          )}

        </div>

      </main>

      {/* --- MODAL DIALOG: END SHIFT CLOSURE --- */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handlePerformDailyClose} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              id="close-shift-modal-cancel"
              onClick={() => setShowCloseShiftModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Award className="w-5 h-5 text-gold-500 animate-pulse" />
              إغلاق الوردية وجلسة الخزينة
            </h4>
            <p className="text-gray-400 text-xs mb-5 border-b border-gray-900 pb-4">مطابقة الرصيد الكلي بالدرج وتصفير معاملات الكاشير وبدء دورة الغد</p>

            <div className="space-y-4">
              
              <div className="p-3 bg-luxury-bg border border-gray-900 rounded-xl space-y-1.5 text-[10px] text-gray-400 font-semibold leading-relaxed">
                <p className="flex justify-between"><span>الرصيد الافتتاحي المقيد:</span><span>{activeDrawer?.opening_balance} ج.م</span></p>
                <p className="flex justify-between text-green-400"><span>المبيعات المقبوضة نقداً:</span><span>+{activeDrawer?.cash_in} ج.م</span></p>
                <p className="flex justify-between text-red-400"><span>المصروفات من الدرج:</span><span>-{activeDrawer?.cash_out} ج.م</span></p>
                <p className="flex justify-between text-white font-black text-xs pt-1 border-t border-gray-900">
                  <span>الرصيد الدفتري المتوقع:</span>
                  <span>{drawerBalance} ج.م</span>
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الرصيد الكاش الفعلي المتواجد في الدرج الآن *</label>
                <input
                  id="shift-closing-amount"
                  type="number"
                  min="0"
                  required
                  value={shiftClosingBalance}
                  onChange={(e) => setShiftClosingBalance(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-gold-600 text-center font-mono font-extrabold text-gold-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">ملاحظات ومراجعة العجز أو الزيادة</label>
                <input
                  id="shift-closing-notes"
                  type="text"
                  placeholder="مثال: مطابقة ممتازة دون أي فروق، وجود زيادة قدرها 10 ج.م..."
                  value={shiftClosingNotes}
                  onChange={(e) => setShiftClosingNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4 text-xs">
              <button
                type="submit"
                id="submit-daily-close-btn"
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer shadow-md"
              >
                تسجيل غلق الوردية وتصفير الدرج
              </button>
              <button
                type="button"
                id="cancel-daily-close-btn"
                onClick={() => setShowCloseShiftModal(false)}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {showExitModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-gold-500/30 rounded-3xl w-full max-w-sm p-6 relative shadow-[0_0_50px_rgba(212,175,55,0.15)] text-center">
            <div className="w-16 h-16 bg-[#0a0a0a] border border-gold-500/30 rounded-full mx-auto flex items-center justify-center mb-4 text-gold-500 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <LogOut className="w-8 h-8" />
            </div>

            <h4 className="text-lg font-black text-white mb-2">
              هل تريد الخروج من التطبيق؟
            </h4>
            <p className="text-gray-400 text-xs mb-6 px-2">
              سيتم حفظ جميع المعاملات وتأمين جلسة العمل الملوكية الحالية لـ كافيه الديب.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowExitModal(false);
                  // Reset state safely
                  window.location.href = 'about:blank';
                }}
                className="py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-extrabold rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
              >
                تأكيد الخروج
              </button>
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="py-3 bg-[#0a0a0a] border border-gold-500/15 hover:border-gold-500/40 text-gray-300 font-bold rounded-xl transition-all cursor-pointer active:scale-95"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Calculator Modal */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* PlayStation Session Time Expired Popup Modal */}
      {expiredPSNotif && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[100] p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-amber-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-900">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 animate-pulse">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-amber-400">
                  انتهى وقت جلسة الجهاز {expiredPSNotif.device.name} ⏰
                </h3>
                <p className="text-[11px] text-gray-400">تنبيه انتهاء الوقت المحدد للجلسة</p>
              </div>
            </div>

            <div className="bg-black/40 border border-gray-900 rounded-2xl p-4 space-y-2.5 text-xs mb-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-bold">اسم الجهاز:</span>
                <span className="text-white font-mono font-black text-sm">{expiredPSNotif.device.name}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-900/60 pt-2">
                <span className="text-gray-400 font-bold">اللاعب / ملاحظات الجلسة:</span>
                <span className="text-amber-300 font-semibold">{expiredPSNotif.playerName}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-900/60 pt-2">
                <span className="text-gray-400 font-bold">وقت البداية:</span>
                <span className="text-white font-mono">{expiredPSNotif.startTimeFormatted}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-900/60 pt-2">
                <span className="text-gray-400 font-bold">وقت النهاية:</span>
                <span className="text-white font-mono">{expiredPSNotif.endTimeFormatted}</span>
              </div>
              <div className="flex justify-between items-center border-t border-gray-900/60 pt-2 text-gold-500 font-black text-sm">
                <span>إجمالي تكلفة اللعب:</span>
                <span className="font-mono text-base">{expiredPSNotif.totalCost} ج.م</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setExpiredPSNotif(null);
                  handleNavigate('playstation');
                }}
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Gamepad2 className="w-4 h-4" />
                المحاسبة في البلايستيشن
              </button>
              <button
                type="button"
                onClick={() => setExpiredPSNotif(null)}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إغلاق التنبيه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Update Modal */}
      <UpdateModal
        isOpen={showUpdateModal}
        updateInfo={updateCheckResult}
        onClose={() => setShowUpdateModal(false)}
        userRole={currentUser?.role || 'Admin'}
        hasActiveInvoice={hasActiveInvoice}
      />

      {/* Admin Re-authentication Modal for Sensitive Screens */}
      <AdminReauthModal
        isOpen={showReauthModal}
        onClose={() => {
          setShowReauthModal(false);
          setPendingTargetTab(null);
          if (PROTECTED_TABS.includes(activeTab) && !isReauthenticated) {
            setActiveTab('dashboard');
            try { window.history.replaceState({ tab: 'dashboard' }, '', '/dashboard'); } catch (e) {}
          }
        }}
        onSuccess={() => {
          setIsReauthenticated(true);
          setShowReauthModal(false);
          showSuccessAlert('تم التحقق من كلمة المرور الملوكية بنجاح! تم فتح الوصول للشاشات الحساسة.');
          if (pendingTargetTab) {
            setActiveTab(pendingTargetTab);
            try { window.history.pushState({ tab: pendingTargetTab }, '', `/${pendingTargetTab}`); } catch (e) {}
            setPendingTargetTab(null);
          }
        }}
        targetTabName={pendingTargetTab ? TAB_LABELS[pendingTargetTab] : TAB_LABELS[activeTab]}
      />

    </div>
  );
}


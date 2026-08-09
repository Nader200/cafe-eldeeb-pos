/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Coffee,
  Users,
  Clock,
  Smartphone,
  CreditCard,
  Bell,
  Sparkles,
  Settings as SettingsIcon,
  DollarSign,
  Activity,
  ArrowUpRight,
  ClipboardList,
  AlertTriangle,
  LogOut,
  X,
  Calendar,
  Grid,
  CheckCircle,
  BarChart2,
  PieChart as PieIcon,
  ChevronLeft,
  ShoppingCart,
  History,
  Layers,
  Award,
  Wallet,
  Gamepad2,
  BarChart3,
  Menu,
  Receipt,
  Package,
  MoreVertical,
  Calculator,
  Sun,
  Moon,
  ArrowLeftRight
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { dbService, isPurchaseExpense } from '../dbService';
import { AppSettings, Customer, Invoice, Expense, AuditLog, Shift } from '../types';
import SyncStatusIndicator from './SyncStatusIndicator';
import { EldeebLogoFull } from './EldeebLogo';
import ShiftHandoverModal from './ShiftHandoverModal';

interface DashboardViewProps {
  settings: AppSettings;
  onNavigate: (tab: string) => void;
  onAddQuickExpense: () => void;
  onAddQuickCreditPayment: () => void;
  onAutoBackup: () => void;
  onCloseShift?: () => void;
  onToggleSidebar?: () => void;
  hasStartedRawMaterials: boolean;
  onApproveRawMaterials: () => void;
}

export default function DashboardView({
  settings,
  onNavigate,
  onAddQuickExpense,
  onAddQuickCreditPayment,
  onAutoBackup,
  onCloseShift,
  onToggleSidebar,
  hasStartedRawMaterials,
  onApproveRawMaterials
}: DashboardViewProps) {
  // 1. Reactive Datasets
  const [tick, setTick] = useState(0);
  const [activeShift, setActiveShift] = useState<Shift | null>(() => dbService.getActiveShift());
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  const refreshShiftState = () => {
    setActiveShift(dbService.getActiveShift());
  };

  useEffect(() => {
    const handleSync = () => {
      setTick(t => t + 1);
      refreshShiftState();
    };
    refreshShiftState();
    window.addEventListener('cafe_db_synced_remote', handleSync);
    window.addEventListener('shift_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('cafe_db_synced_remote', handleSync);
      window.removeEventListener('shift_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const invoices = useMemo(() => dbService.getInvoices(), [tick]);
  const expenses = useMemo(() => dbService.getExpenses(), [tick]);
  const customers = useMemo(() => dbService.getCustomers(), [tick]);
  const cashDrawer = useMemo(() => dbService.getActiveDrawer(), [tick]);
  const auditLogs = useMemo(() => {
    const logs = dbService.getAuditLogs ? dbService.getAuditLogs() : [];
    return [...logs].reverse().slice(0, 5);
  }, [tick]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // 2. Clock running state
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Weather Widget State & fetching logic
  const [weather, setWeather] = useState<{ temp: number; text: string; icon: string } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current_weather=true');
        const data = await res.json();
        if (data && data.current_weather && active) {
          const code = data.current_weather.weathercode;
          const temp = Math.round(data.current_weather.temperature);
          
          let text = 'معتدل';
          let icon = '☀️';
          
          if (code === 0) {
            text = 'صافي';
            icon = '☀️';
          } else if (code >= 1 && code <= 3) {
            text = 'غائم جزئياً';
            icon = '⛅';
          } else if (code >= 45 && code <= 48) {
            text = 'ضبابي';
            icon = '🌫️';
          } else if (code >= 51 && code <= 65) {
            text = 'ممطر';
            icon = '🌧️';
          } else if (code >= 80 && code <= 82) {
            text = 'زخات مطر';
            icon = '🌦️';
          } else if (code >= 95) {
            text = 'عاصف رعدي';
            icon = '⛈️';
          }
          
          setWeather({ temp, text, icon });
          setWeatherLoading(false);
        }
      } catch (e) {
        // Safe offline fallback
        if (active) {
          setWeather({ temp: 32, text: 'مشمس', icon: '☀️' });
          setWeatherLoading(false);
        }
      }
    };

    fetchWeather();
    return () => {
      active = false;
    };
  }, []);

  // Cash Drawer Control states
  const [showDrawerModal, setShowDrawerModal] = useState(false);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [drawerPulseActive, setDrawerPulseActive] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);

  // News Ticker Hover & Touch Pause States
  const [isTickerPaused, setIsTickerPaused] = useState(false);
  const [isMarqueePaused, setIsMarqueePaused] = useState(false);
  const [tickerTimeoutId, setTickerTimeoutId] = useState<any>(null);

  const handleTickerInteraction = () => {
    setIsTickerPaused(true);
    if (tickerTimeoutId) clearTimeout(tickerTimeoutId);
    
    // Resume scrolling after 4 seconds of inactivity
    const timeout = setTimeout(() => {
      setIsTickerPaused(false);
    }, 4000);
    setTickerTimeoutId(timeout);
  };

  useEffect(() => {
    return () => {
      if (tickerTimeoutId) clearTimeout(tickerTimeoutId);
    };
  }, [tickerTimeoutId]);

  const handleTriggerOpenDrawer = () => {
    dbService.logBackup ? dbService.logBackup('MANUAL', 'SUCCESS', 'OPEN_DRAWER') : null;
    setDrawerPulseActive(true);
    setShowDrawerModal(true);
    setTimeout(() => {
      setDrawerPulseActive(false);
    }, 1500);
  };

  const handleSendEscPosPulse = () => {
    try {
      const escPosSequence = "\x1B\x70\x30\x19\xFA";
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<pre style="font-family: monospace; font-size: 8px;">${escPosSequence}</pre>`);
        doc.close();
        
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          document.body.removeChild(iframe);
        }, 300);
      }
    } catch (err) {
      console.error("ESC/POS drawer pulse error:", err);
    }
  };

  // Active shift cash drawer calculation (Single Source of Truth)
  const shiftCashMetrics = useMemo(() => {
    const shift = activeShift || dbService.getActiveShift();
    if (shift) {
      return {
        opening_balance: shift.opening_balance,
        cash_in: shift.cash_in,
        cash_out: shift.cash_out,
        expected_cash: shift.expected_cash
      };
    }
    const drawer = cashDrawer;
    return {
      opening_balance: drawer?.opening_balance || 0,
      cash_in: drawer?.cash_in || 0,
      cash_out: drawer?.cash_out || 0,
      expected_cash: drawer ? (drawer.opening_balance + drawer.cash_in - drawer.cash_out) : 0
    };
  }, [activeShift, cashDrawer, tick]);

  const activeShiftCash = shiftCashMetrics.expected_cash;

  // 3. Core Calculations for Stats Grid
  const metrics = useMemo(() => {
    // Filter active invoices for today
    const todayInvoices = invoices.filter(
      inv => inv.invoice_date.startsWith(todayStr) && inv.invoice_status !== 'CANCELLED'
    );
    const todayExpenses = expenses.filter(exp => exp.expense_date === todayStr && !isPurchaseExpense(exp));

    let revenue = todayInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const ordersCount = todayInvoices.length;
    const avgTicketValue = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;
    
    // Outstanding credit of all customer accounts in the system
    const totalCreditBalance = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    
    // Active tables right now (with open invoices)
    const activeTables = dbService.getOpenInvoices().filter(i => i.table_number).length;

    return {
      revenue,
      ordersCount,
      avgTicketValue,
      creditBalance: totalCreditBalance,
      activeTables,
      todayInvoices,
      todayExpenses
    };
  }, [invoices, expenses, customers, todayStr]);

  // 4. Smart Announcement Bar & Stats Ticker sliding state
  const [slideIndex, setSlideIndex] = useState(0);
  const tickerSlides = useMemo(() => {
    const list = [
      {
        id: 'welcome',
        label: 'ترحيب الكافيه',
        value: 'مرحباً بك في Cafe Eldeeb POS Enterprise',
        icon: <Sparkles className="w-4 h-4 text-[#D4AF37]" />,
        textColor: 'text-[#D4AF37]',
        bgColor: 'bg-amber-950/20',
        borderColor: 'border-amber-500/20'
      },
      {
        id: 'debt',
        label: 'العملاء المدينون',
        value: `${customers.filter(c => c.current_balance > 0).length} عملاء (${(customers.reduce((sum, c) => sum + (c.current_balance || 0), 0)).toLocaleString()} ج.م)`,
        icon: <Users className="w-4 h-4 text-red-500" />,
        textColor: 'text-red-500',
        bgColor: 'bg-red-950/25',
        borderColor: 'border-red-500/20'
      },
      {
        id: 'revenue',
        label: 'إجمالي المبيعات',
        value: `${(metrics.revenue || 0).toLocaleString()} ج.م اليوم`,
        icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
        textColor: 'text-emerald-400',
        bgColor: 'bg-emerald-950/25',
        borderColor: 'border-emerald-500/20'
      },
      {
        id: 'orders',
        label: 'طلبات اليوم',
        value: `${metrics.ordersCount || 0} طلب`,
        icon: <ClipboardList className="w-4 h-4 text-cyan-400" />,
        textColor: 'text-cyan-400',
        bgColor: 'bg-cyan-950/25',
        borderColor: 'border-cyan-500/20'
      },
      {
        id: 'cash',
        label: 'رصيد الصندوق',
        value: `${(activeShiftCash || 0).toLocaleString()} ج.م`,
        icon: <Wallet className="w-4 h-4 text-purple-400" />,
        textColor: 'text-purple-400',
        bgColor: 'bg-purple-950/25',
        borderColor: 'border-purple-500/20'
      },
      {
        id: 'stock',
        label: 'نقص في المخزون',
        value: `${dbService.getProducts().filter(p => p.current_stock <= (p.minimum_stock || 0)).length} أصناف`,
        icon: <Package className="w-4 h-4 text-amber-500" />,
        textColor: 'text-amber-500',
        bgColor: 'bg-amber-950/25',
        borderColor: 'border-amber-500/20'
      }
    ];

    // 🔴 Also dynamically inject critical stock alert if needed
    const lowStockCount = dbService.getProducts().filter(p => p.current_stock <= p.minimum_stock).length;
    if (lowStockCount > 0) {
      list.push({
        id: 'critical_stock',
        label: 'تنبيه مخزون حرج',
        value: `عدد ${lowStockCount} من المواد الخام قارب مخزونها على النفاذ!`,
        icon: <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />,
        textColor: 'text-red-400',
        bgColor: 'bg-red-950/30',
        borderColor: 'border-red-500/30'
      });
    }

    return list;
  }, [customers, metrics, activeShiftCash]);

  useEffect(() => {
    if (tickerSlides.length === 0 || isMarqueePaused) return;
    const timer = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % tickerSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [tickerSlides, isMarqueePaused]);

  // 5. Weekly Sales Trend for AreaChart
  const weeklyTrendData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split('T')[0];
      const name = d.toLocaleDateString('ar-EG', { weekday: 'short' });
      
      const dayInvoices = invoices.filter(
        inv => inv.invoice_date.startsWith(dateString) && inv.invoice_status !== 'CANCELLED'
      );
      const sales = dayInvoices.reduce((sum, inv) => sum + inv.total, 0);
      data.push({ name, الإيرادات: sales });
    }
    return data;
  }, [invoices]);

  // 6. Payment Method Distribution for PieChart
  const paymentBreakdownData = useMemo(() => {
    let cash = 0;
    let vodafone = 0;
    let instapay = 0;

    // Aggregate today's active invoices
    metrics.todayInvoices.forEach(inv => {
      const method = inv.payment_method || (inv.payment_type === 'CREDIT' ? 'CREDIT' : 'CASH');
      const amount = inv.paid_amount || 0;
      if (amount > 0) {
        if (method === 'CASH') {
          cash += amount;
        } else if (method === 'VODAFONE_CASH') {
          vodafone += amount;
        } else if (method === 'BANK_TRANSFER') {
          instapay += amount;
        }
      }
    });

    // Fallback static premium values if fresh database is clean
    if (cash === 0 && vodafone === 0 && instapay === 0) {
      return [];
    }

    return [
      { name: 'كاش ونقدي', value: cash, color: '#D4AF37' },
      { name: 'فودافون كاش', value: vodafone, color: '#EF4444' },
      { name: 'إنستا باي (IP)', value: instapay, color: '#10B981' }
    ].filter(item => item.value > 0);
  }, [metrics.todayInvoices]);

  // 7. Last 5 Invoices stream
  const latestInvoicesList = useMemo(() => {
    const list = invoices.filter(inv => inv.invoice_date.startsWith(todayStr));
    return [...list].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date)).slice(0, 5);
  }, [invoices, todayStr]);

  const openInvoicesCount = useMemo(() => dbService.getOpenInvoices().length, [invoices]);
  


  // Helper for relative time (e.g., "منذ دقيقتين", "قبل ساعة")
  const getRelativeTime = (dateStr: string) => {
    try {
      const now = new Date();
      const date = new Date(dateStr);
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'الآن';
      if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      const diffDays = Math.floor(diffHours / 24);
      return `منذ ${diffDays} يوم`;
    } catch (e) {
      return 'قريباً';
    }
  };

  const tickerItems = useMemo(() => [
    {
      label: 'العملاء المدينون',
      value: `${customers.filter(c => c.current_balance > 0).length} عملاء (${(customers.reduce((sum, c) => sum + (c.current_balance || 0), 0)).toLocaleString()} ج.م)`,
      icon: <Users className="w-3.5 h-3.5 text-red-500" />,
    },
    {
      label: 'إجمالي المبيعات',
      value: `${(metrics.revenue || 0).toLocaleString()} ج.م اليوم`,
      icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      label: 'طلبات اليوم',
      value: `${metrics.ordersCount || 0} طلب`,
      icon: <Coffee className="w-3.5 h-3.5 text-cyan-400" />,
    },
    {
      label: 'رصيد الصندوق',
      value: `${(activeShiftCash || 0).toLocaleString()} ج.م`,
      icon: <Wallet className="w-3.5 h-3.5 text-purple-400" />,
    },
    {
      label: 'نقص في المخزون',
      value: `${dbService.getProducts().filter(p => p.current_stock <= (p.minimum_stock || 0)).length} أصناف`,
      icon: <Package className="w-3.5 h-3.5 text-amber-500" />,
    }
  ], [customers, metrics, activeShiftCash]);

  const statsData = useMemo(() => {
    const lowStockCount = dbService.getProducts().filter(p => p.current_stock <= (p.minimum_stock || 0)).length;
    const indebtedCustomersCount = customers.filter(c => c.current_balance > 0).length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    const totalPartnerDrawings = dbService.getPartnerDrawings().reduce((sum, d) => sum + (d.amount || 0), 0);
    
    return [
      {
        label: 'المبيعات',
        value: `${(metrics.revenue || 0).toLocaleString()}`,
        subValue: 'ج.م اليوم',
        icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
        action: () => onNavigate('invoice-history')
      },
      {
        label: 'الطلبات',
        value: `${metrics.ordersCount || 0}`,
        subValue: 'طلب اليوم',
        icon: <ClipboardList className="w-4 h-4 text-cyan-400" />,
        action: () => onNavigate('open-invoices')
      },
      {
        label: 'الدرج المالي',
        value: `${(activeShiftCash || 0).toLocaleString()}`,
        subValue: 'رصيد الصندوق',
        icon: <Wallet className="w-4 h-4 text-purple-400" />,
        action: () => onNavigate('pos')
      },
      {
        label: 'مسحوبات الشركاء',
        value: `${totalPartnerDrawings.toLocaleString()}`,
        subValue: 'ج.م مسحوبات',
        icon: <Coins className="w-4 h-4 text-amber-400" />,
        action: () => onNavigate('partner_drawings')
      },
      {
        label: 'النواقص',
        value: `${lowStockCount}`,
        subValue: 'أصناف حرجة',
        icon: <Package className="w-4 h-4 text-amber-500" />,
        action: () => onNavigate('production_batches')
      },
      {
        label: 'الديون',
        value: `${indebtedCustomersCount}`,
        subValue: `${totalDebt.toLocaleString()} ج.م`,
        icon: <Users className="w-4 h-4 text-red-500" />,
        action: () => onNavigate('customers')
      }
    ];
  }, [metrics, activeShiftCash, customers, onNavigate]);

  const shortcutData = useMemo(() => {
    const employeesCount = dbService.getEmployees().length;
    const expensesTotal = metrics.todayExpenses.reduce((sum, exp) => sum + exp.expense_amount, 0);

    return [
      {
        id: 'expenses',
        label: 'المصروفات',
        value: `${expensesTotal.toLocaleString()} ج`,
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <circle cx="12" cy="14" r="1.5" />
          </svg>
        ),
        action: () => onNavigate('expenses')
      },
      {
        id: 'employees',
        label: 'الموظفين',
        value: `${employeesCount}`,
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
        action: () => onNavigate('employees')
      },
      {
        id: 'reports',
        label: 'التقارير',
        value: 'تحليل',
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
        action: () => onNavigate('reports')
      },
      {
        id: 'print',
        label: 'الطباعة',
        value: 'الدرج',
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        ),
        action: () => {
          handleTriggerOpenDrawer();
        }
      },
      {
        id: 'backup',
        label: 'النسخ الاحتياطي',
        value: 'حفظ',
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
          </svg>
        ),
        action: () => {
          onAutoBackup();
        }
      },
      {
        id: 'more',
        label: 'المزيد',
        value: '...',
        icon: (
          <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="6" cy="12" r="1.5"/>
            <circle cx="18" cy="12" r="1.5"/>
          </svg>
        ),
        action: () => {
          alert('المزيد من الخيارات السريعة قيد التطوير!');
        }
      }
    ];
  }, [metrics, onNavigate]);

  const activeAlertsList = useMemo(() => {
    const list: string[] = [];
    
    const lowStockProducts = dbService.getProducts().filter(p => p.current_stock <= (p.minimum_stock || 0));
    if (lowStockProducts.length > 0) {
      list.push(`نقص مخزون في ${lowStockProducts.length} أصناف بالمنيو`);
    }
    
    const openCount = dbService.getOpenInvoices().length;
    if (openCount > 0) {
      list.push(`يوجد ${openCount} طاولات وفواتير معلقة بالصالة`);
    }

    const indebtedCount = customers.filter(c => c.current_balance > 0).length;
    if (indebtedCount > 0) {
      list.push(`يوجد مديونيات معلقة على ${indebtedCount} عملاء`);
    }

    return list;
  }, [customers, invoices]);

  const currentDayName = useMemo(() => clock.toLocaleDateString('ar-EG', { weekday: 'long' }), [clock]);
  const currentDateString = useMemo(() => clock.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }), [clock]);

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in text-right max-w-7xl mx-auto p-3 sm:p-6 pb-32 text-white bg-black select-none relative" dir="rtl">
      {/* Premium Luxury Black & Gold Keyframe Styles */}
      <style>{`
        @keyframes gold-glow {
          0%, 100% {
            box-shadow: 0 0 15px rgba(212, 175, 55, 0.25), inset 0 0 6px rgba(212, 175, 55, 0.15);
            border-color: rgba(212, 175, 55, 0.25);
          }
          50% {
            box-shadow: 0 0 30px rgba(212, 175, 55, 0.6), inset 0 0 12px rgba(212, 175, 55, 0.35);
            border-color: rgba(212, 175, 55, 0.6);
          }
        }
        .animate-gold-glow {
          animation: gold-glow 3s infinite ease-in-out;
        }

        @keyframes steam-rise {
          0% { transform: translateY(4px) scaleX(1); opacity: 0; }
          20% { opacity: 0.55; }
          60% { transform: translateY(-12px) scaleX(1.25); opacity: 0.2; }
          100% { transform: translateY(-25px) scaleX(1.45); opacity: 0; }
        }
        .steam-line {
          animation: steam-rise 2.5s infinite ease-out;
          transform-origin: bottom center;
        }

        @keyframes light-sweep {
          0% { transform: translateX(-150%) skewX(-25deg); }
          50%, 100% { transform: translateX(150%) skewX(-25deg); }
        }
        .light-sweep-overlay {
          animation: light-sweep 6s infinite ease-in-out;
        }

        @keyframes pulse-soft {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-pulse-soft {
          animation: pulse-soft 4s infinite ease-in-out;
        }

        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 16s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Embedded Gold Gradient Defs */}
      <svg className="hidden">
        <defs>
          <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFECA1" />
            <stop offset="35%" stopColor="#D4AF37" />
            <stop offset="70%" stopColor="#96721A" />
            <stop offset="100%" stopColor="#FFF4D0" />
          </linearGradient>
        </defs>
      </svg>

      {/* ==================================================
          1. BRANDING & ORIGINAL LOGO (CENTERED & COMPACT)
          ================================================== */}
      <div className="w-full flex flex-col items-center justify-center py-4 bg-black relative select-none">
        {/* Glowing backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mb-3 group cursor-pointer animate-fade-in flex flex-col items-center justify-center" onClick={() => onNavigate('dashboard')}>
          {/* Rising Steam Effect */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none z-20">
            <span className="w-0.5 h-4 bg-gradient-to-t from-[#D4AF37]/50 via-[#D4AF37]/15 to-transparent rounded-full steam-line" style={{ animationDelay: '0.2s' }}></span>
            <span className="w-1 h-6 bg-gradient-to-t from-[#D4AF37]/65 via-[#D4AF37]/20 to-transparent rounded-full steam-line" style={{ animationDelay: '0.6s' }}></span>
            <span className="w-0.5 h-4 bg-gradient-to-t from-[#D4AF37]/50 via-[#D4AF37]/15 to-transparent rounded-full steam-line" style={{ animationDelay: '1s' }}></span>
          </div>

          {/* Full High-Resolution Master Logo */}
          <div className="p-2 flex items-center justify-center">
            <EldeebLogoFull className="w-[200px] sm:w-[220px]" />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <SyncStatusIndicator />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open_calculator_modal'))}
            className="px-2.5 py-1 bg-[#121216] border border-[#D4AF37]/30 hover:border-gold-500 rounded-xl text-gold-400 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            title="فتح الآلة الحاسبة الذكية وحاسبة الكاشير (🧮)"
          >
            <Calculator className="w-3.5 h-3.5 text-gold-500" />
            <span>الآلة الحاسبة 🧮</span>
          </button>
        </div>
      </div>

      {/* ==================================================
          2. MINIMAL UNIFIED TIME/DATE/WEATHER CARD (MAX HEIGHT 120PX)
          ================================================== */}
      <div className="w-full max-w-lg mx-auto bg-[#050505] border border-[#D4AF37]/35 rounded-2xl p-3 h-[90px] flex items-center justify-around shadow-[0_6px_20px_rgba(0,0,0,0.9),inset_0_1px_8px_rgba(255,255,255,0.03)] select-none">
        {/* Time Column */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-base sm:text-lg font-mono font-black text-[#D4AF37] leading-none">
            {clock.toLocaleTimeString('ar-EG', { hour12: true, hour: 'numeric', minute: '2-digit' })}
          </span>
          <span className="text-[9px] font-black text-gray-400 mt-1.5">الوقت الحالي</span>
        </div>

        {/* Divider */}
        <div className="h-8 w-[1px] bg-[#D4AF37]/15" />

        {/* Day Column */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-xs sm:text-sm font-black text-white leading-none">
            {currentDayName}
          </span>
          <span className="text-[9px] font-black text-gray-400 mt-1.5">اليوم</span>
        </div>

        {/* Divider */}
        <div className="h-8 w-[1px] bg-[#D4AF37]/15" />

        {/* Date Column */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-[10px] sm:text-xs font-black text-gray-300 leading-none">
            {clock.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
          </span>
          <span className="text-[9px] font-black text-gray-400 mt-1.5">التاريخ</span>
        </div>

        {/* Divider */}
        <div className="h-8 w-[1px] bg-[#D4AF37]/15" />

        {/* Weather Column */}
        <div className="flex flex-col items-center flex-1">
          <div className="flex items-center gap-1 leading-none">
            <span className="text-sm sm:text-base">{weatherLoading ? '☀️' : weather?.icon}</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-[#D4AF37]">
              {weatherLoading ? '28°C' : `${weather?.temp}°C`}
            </span>
          </div>
          <span className="text-[9px] font-black text-gray-400 mt-1.5">الطقس اليوم</span>
        </div>
      </div>

      {/* ==================================================
          3. UNIFIED SINGLE SYSTEM ALERTS TICKER (AUTO SCROLLING MARQUEE)
          ================================================== */}
      <div className="w-full max-w-lg mx-auto bg-[#0a0a0a] border border-[#D4AF37]/20 rounded-xl p-2 flex items-center gap-2 overflow-hidden shadow-md">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-black border border-[#D4AF37]/35 rounded-lg text-[#D4AF37] text-[10px] font-black z-10 shrink-0 select-none">
          <Bell className="w-3 h-3 text-red-500 animate-pulse" />
          <span>تنبيهات النظام</span>
        </div>
        <div className="relative flex-1 overflow-hidden h-5 flex items-center">
          <div className="absolute whitespace-nowrap animate-marquee flex items-center gap-4 text-[11px] font-black text-gray-300">
            {activeAlertsList.length === 0 ? (
              <span className="text-emerald-400">✨ لا توجد تنبيهات اليوم. جميع الأنظمة والدرج المالي والمخازن في حالة مستقرة تماماً.</span>
            ) : (
              <span className="text-red-400 flex items-center gap-3">
                {activeAlertsList.map((alert, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span>⚠️ {alert}</span>
                    {i < activeAlertsList.length - 1 && <span className="text-[#D4AF37] mx-2">•</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PENDING SHIFT HANDOVER ADMIN NOTIFICATION BANNER */}
      {activeShift && activeShift.status === 'PENDING_HANDOVER' && (
        <div className="w-full max-w-lg mx-auto bg-gradient-to-r from-amber-950/90 via-[#181206] to-amber-950/90 border-2 border-amber-500/60 rounded-2xl p-3.5 shadow-[0_0_20px_rgba(245,158,11,0.25)] flex flex-col sm:flex-row items-center justify-between gap-3 text-right select-none animate-pulse-soft">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black shrink-0 mt-0.5">
              <Clock className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-300">🔔 يوجد تسليم وردية معلّق</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black text-[10px]">
                  {activeShift.shift_type === 'DAY' ? 'وردية النهار ☀️' : 'وردية المساء 🌙'}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-1 font-medium">
                المسؤول: <strong className="text-white">{activeShift.cashier_name}</strong> | المتوقع: <strong className="text-amber-400">{activeShift.expected_cash} ج.م</strong> | عد الكاشير: <strong className="text-emerald-400">{activeShift.declared_cash ?? '—'} ج.م</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsShiftModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-gold-400 hover:from-amber-400 hover:to-gold-300 text-black font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
          >
            <span>مراجعة واستلام الوردية 📥</span>
          </button>
        </div>
      )}

      {/* ==================================================
          3.5. SMALL WIDGET: CURRENT CASH DRAWER BOOK BALANCE (شاشة الرصيد الدفتري للدرج)
          ================================================== */}
      <div className="w-full max-w-lg mx-auto bg-gradient-to-r from-zinc-950 via-[#0d0d0d] to-zinc-950 border-2 border-[#D4AF37]/40 rounded-2xl p-3.5 shadow-[0_8px_25px_rgba(0,0,0,0.9),0_0_15px_rgba(212,175,55,0.1)] relative overflow-hidden transition-all hover:border-[#D4AF37] select-none">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#D4AF37]/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#D4AF37]/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center font-black shrink-0">
              <Wallet className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                <span>الرصيد الدفتري الحالي بالدرج 💵</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </h3>
              <p className="text-[10px] text-gray-400">إجمالي السيولة النقدية المحسوبة بالدرج المالي</p>
            </div>
          </div>

          <button
            onClick={handleTriggerOpenDrawer}
            className="px-2.5 py-1.5 bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 rounded-xl text-[10px] font-black cursor-pointer transition-all flex items-center gap-1 active:scale-95 shrink-0"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>التحكم بالدرج</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          {/* Big Total Book Balance */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400">الرصيد الدفتري المتوقع:</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-[#FFECA1] via-[#D4AF37] to-[#AA7C11] drop-shadow-[0_2px_8px_rgba(212,175,55,0.3)]">
              {activeShiftCash.toLocaleString('ar-EG')} <span className="text-xs text-[#D4AF37] font-sans">ج.م</span>
            </span>
          </div>

          {/* Breakdown pill badges */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold font-mono">
            <div className="bg-black/60 border border-gray-800 rounded-lg px-2 py-1 text-gray-300" title="الرصيد الافتتاحي للوردية الحالية">
              <span className="text-gray-500 text-[9px] block">الافتتاحي:</span>
              <span className="text-gold-300">{shiftCashMetrics.opening_balance.toLocaleString('ar-EG')} ج</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-lg px-2 py-1 text-emerald-400" title="إجمالي المقبوضات النقدية للوردية الحالية">
              <span className="text-emerald-500/80 text-[9px] block">وارد (+):</span>
              <span>+{shiftCashMetrics.cash_in.toLocaleString('ar-EG')} ج</span>
            </div>
            <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-2 py-1 text-red-400" title="إجمالي المصروفات النقدية للوردية الحالية">
              <span className="text-red-500/80 text-[9px] block">منصرف (-):</span>
              <span>-{shiftCashMetrics.cash_out.toLocaleString('ar-EG')} ج</span>
            </div>
          </div>
        </div>

        {/* Current Shift Info Row inside Cash Drawer Card */}
        <div className="mt-2.5 pt-2 border-t border-[#D4AF37]/15 flex items-center justify-between text-[11px] gap-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-gray-400 font-bold shrink-0">الوردية الحالية:</span>
            {activeShift ? (
              <span className="font-black text-white flex items-center gap-1 shrink-0">
                {activeShift.shift_type === 'DAY' ? 'وردية النهار ☀️' : 'وردية المساء 🌙'}
                <span className="text-gray-400 text-[10px] font-normal">({activeShift.cashier_name})</span>
              </span>
            ) : (
              <span className="text-gray-500 font-bold shrink-0">لا توجد وردية نشطة</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeShift && (
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                activeShift.status === 'OPEN'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300 animate-pulse'
              }`}>
                {activeShift.status === 'OPEN' ? 'مفتوحة 🟢' : 'معلقة ⏳'}
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsShiftModalOpen(true)}
              className="px-2.5 py-1 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 border border-gold-500/30 rounded-lg font-black text-[10px] transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <ArrowLeftRight className="w-3 h-3 text-gold-500" />
              <span>{activeShift?.status === 'PENDING_HANDOVER' ? 'استلام الوردية' : 'إدارة الوردية'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================
          4. CORE 3D GLASS CIRCLES CONTROL BOARD (SYMMETRICAL, BALANCED)
          ================================================== */}
      <div className="w-full max-w-md mx-auto flex flex-col gap-[20px] select-none py-2 pb-6">
        
        {/* Row 1 */}
        <div className="grid grid-cols-3 gap-[20px] justify-items-center w-full">
          {/* Button 1: نقطة البيع */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('pos')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <ShoppingCart className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              نقطة البيع
            </span>
          </motion.button>

          {/* Button 2: الفواتير */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('open-invoices')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0 relative">
              <Receipt className="w-5.5 h-5.5" />
              {openInvoicesCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-black animate-pulse shadow-lg">
                  {openInvoicesCount}
                </span>
              )}
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              الفواتير
            </span>
          </motion.button>

          {/* Button 3: العملاء */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('customers')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Users className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              العملاء
            </span>
          </motion.button>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-3 gap-[20px] justify-items-center w-full">
          {/* Button 4: المخزون */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('production_batches')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Package className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              المخزون
            </span>
          </motion.button>

          {/* Button 5: الموردون */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('suppliers')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <ClipboardList className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              الموردون
            </span>
          </motion.button>

          {/* Button 6: الموظفين */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('employees')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Users className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              الموظفين
            </span>
          </motion.button>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-3 gap-[20px] justify-items-center w-full">
          {/* Button 7: البلايستيشن */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('playstation')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Gamepad2 className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              البلايستيشن
            </span>
          </motion.button>

          {/* Button 8: تعديل المنيو */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('products')}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Coffee className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              تعديل المنيو
            </span>
          </motion.button>

          {/* Button 9: المزيد */}
          <motion.button
            whileHover={{ scale: 1.08, boxShadow: '0 0 18px rgba(212, 175, 55, 0.45)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowMoreModal(true)}
            className="w-[100px] h-[100px] rounded-full bg-gradient-to-b from-zinc-950 to-black border-2 border-[#D4AF37] flex flex-col items-center justify-center p-2 relative shadow-[0_8px_20px_rgba(0,0,0,0.9),inset_0_2px_10px_rgba(255,255,255,0.05)] hover:border-[#FFECA1] group transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
            <div className="text-[#D4AF37] group-hover:text-[#FFECA1] transition-colors filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)] mb-1 shrink-0">
              <Grid className="w-5.5 h-5.5" />
            </div>
            <span className="text-[11px] font-black text-white group-hover:text-[#D4AF37] transition-colors leading-tight text-center">
              المزيد
            </span>
          </motion.button>
        </div>
      </div>

      {/* ==================================================
          More Options Modal / Drawer
          ================================================== */}
      <AnimatePresence>
        {showMoreModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#050505] border-2 border-[#D4AF37]/35 max-w-sm w-full rounded-3xl p-6 shadow-2xl relative overflow-hidden"
            >
              {/* Light glow effects */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3.5 mb-5 relative z-10">
                <button
                  onClick={() => setShowMoreModal(false)}
                  className="p-1.5 bg-[#0a0a0a] border border-[#D4AF37]/15 hover:border-[#D4AF37] rounded-lg text-gray-400 hover:text-white cursor-pointer active:scale-95 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-black text-white flex items-center gap-2 justify-end">
                  <span>خيارات وأدوات إضافية ✨</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3.5 text-right relative z-10 pb-2">
                {/* 1. التقارير */}
                <button
                  onClick={() => {
                    setShowMoreModal(false);
                    onNavigate('reports');
                  }}
                  className="flex flex-col items-center justify-center p-3 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-[#D4AF37]/50 transition-all text-center cursor-pointer"
                >
                  <BarChart3 className="w-6 h-6 text-[#D4AF37] mb-1.5" />
                  <span className="text-xs font-black text-white">التقارير المالية</span>
                </button>

                {/* 2. المصروفات */}
                <button
                  onClick={() => {
                    setShowMoreModal(false);
                    onNavigate('expenses');
                  }}
                  className="flex flex-col items-center justify-center p-3 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-[#D4AF37]/50 transition-all text-center cursor-pointer"
                >
                  <TrendingDown className="w-6 h-6 text-red-400 mb-1.5" />
                  <span className="text-xs font-black text-white">المصروفات</span>
                </button>

                {/* 3. التحكم بالدرج */}
                <button
                  onClick={() => {
                    setShowMoreModal(false);
                    setShowDrawerModal(true);
                  }}
                  className="col-span-2 flex items-center justify-center gap-2 p-3 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-[#D4AF37]/50 transition-all text-center cursor-pointer"
                >
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-black text-white">التحكم بالدرج المالي</span>
                </button>

                {/* 4. النسخ الاحتياطي */}
                <button
                  onClick={() => {
                    setShowMoreModal(false);
                    onAutoBackup();
                  }}
                  className="col-span-2 flex items-center justify-center gap-2 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl hover:bg-[#D4AF37]/20 transition-all text-center cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                  <span className="text-xs font-black text-white">حفظ نسخة احتياطية سحابية ☁️</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================
          5. FIXED GLASSY BOTTOM NAVIGATION BAR (HIDDEN ON MOBILE, ONLY ON DESKTOP)
          ================================================== */}
      <div className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-4xl z-40 bg-black/90 backdrop-blur-md border border-[#D4AF37]/35 px-4 sm:px-6 py-2.5 rounded-2xl items-center justify-between shadow-[0_10px_35px_rgba(0,0,0,0.95)]">
        
        {/* Tab 1: حسابي (Profile) */}
        <button
          onClick={() => {
            alert('ملف الكاشير الملوكي متاح في قسم الموظفين والإعدادات.');
          }}
          className="flex flex-col items-center justify-center gap-1 cursor-pointer select-none active:scale-95 transition-all w-14 sm:w-16 shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-[#D4AF37] transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="text-[9px] font-black text-gray-400">حسابي</span>
        </button>

        {/* Tab 2: البحث السريع (Search) */}
        <button
          onClick={() => onNavigate('pos')}
          className="flex flex-col items-center justify-center gap-1 cursor-pointer select-none active:scale-95 transition-all w-14 sm:w-16 shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-[#D4AF37] transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-[9px] font-black text-gray-400">البحث السريع</span>
        </button>

        {/* Tab 3: الرئيسية (Home - Central Raised Anchor Style) */}
        <div className="relative -mt-6 shrink-0">
          <div className="absolute inset-0 bg-[#D4AF37]/20 rounded-xl blur-md pointer-events-none" />
          <button
            onClick={() => onNavigate('dashboard')}
            className="relative px-5 py-2.5 bg-black border-2 border-[#D4AF37] rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg cursor-pointer active:scale-95 transition-all"
          >
            <svg className="w-6 h-6 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="text-[10px] font-black text-[#D4AF37] tracking-wider">الرئيسية</span>
          </button>
        </div>

        {/* Tab 4: الإشعارات (Notifications) */}
        <button
          onClick={() => {
            alert('🔔 لا توجد إشعارات جديدة غير مقروءة.');
          }}
          className="flex flex-col items-center justify-center gap-1 cursor-pointer select-none active:scale-95 transition-all w-14 sm:w-16 shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-[#D4AF37] transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="text-[9px] font-black text-gray-400">الإشعارات</span>
        </button>

        {/* Tab 5: المزيد (More - Sidebar Trigger) */}
        <button
          onClick={() => {
            if (onToggleSidebar) {
              onToggleSidebar();
            } else {
              alert('المزيد من إعدادات كافيه الديب متاحة في القائمة الجانبية.');
            }
          }}
          className="flex flex-col items-center justify-center gap-1 cursor-pointer select-none active:scale-95 transition-all w-14 sm:w-16 shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-[#D4AF37] transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span className="text-[9px] font-black text-gray-400">القائمة</span>
        </button>

      </div>

      {/* ==================================================
          6. INTERACTIVE CASH DRAWER CONTROL MODAL (PRESERVED)
          ================================================== */}
      <AnimatePresence>
        {showDrawerModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#050505] border-2 border-[#D4AF37]/35 max-w-md w-full rounded-3xl p-6 shadow-2xl relative overflow-hidden"
            >
              {/* Light glow effects */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3.5 mb-5 relative z-10">
                <button
                  onClick={() => setShowDrawerModal(false)}
                  className="p-1.5 bg-[#0a0a0a] border border-[#D4AF37]/15 hover:border-[#D4AF37] rounded-lg text-gray-400 hover:text-white cursor-pointer active:scale-95 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-black text-white flex items-center gap-2 justify-end">
                  <span>التحكم في درج النقدية المالي 💾</span>
                </h3>
              </div>

              <div className="space-y-5 text-right relative z-10">
                <div className="flex flex-col items-center justify-center py-6 bg-black/40 border border-zinc-900 rounded-2xl relative overflow-hidden">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${drawerPulseActive ? 'bg-[#D4AF37] text-black scale-110 shadow-[0_0_25px_rgba(212,175,55,0.4)]' : 'bg-[#0a0a0a] border border-[#D4AF37]/15 text-[#D4AF37]'}`}>
                    <Wallet className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold text-white mt-3">رصيد الدرج المالي الحالي</span>
                  <span className="text-lg font-black text-[#D4AF37] mt-1 font-mono">{activeShiftCash.toLocaleString()} ج.م</span>
                  {drawerPulseActive && (
                    <span className="text-[10px] text-emerald-400 font-bold mt-2 animate-bounce">⚡ تم إرسال نبضة الفتح للدرج!</span>
                  )}
                </div>

                <div className="bg-[#0a0a0a] border border-zinc-900 p-3.5 rounded-xl space-y-2.5">
                  <span className="text-[10px] text-gray-400 font-bold block mb-1">حالة اتصال الطابعة الحرارية والدرج *</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPrinterConnected(true)}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition-all ${printerConnected ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400' : 'bg-[#050505] border-gray-900 text-gray-500 hover:text-gray-300'}`}
                    >
                      🟢 طابعة حرارية موصلة
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrinterConnected(false)}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition-all ${!printerConnected ? 'bg-amber-950/20 border-amber-500 text-amber-400' : 'bg-[#050505] border-gray-900 text-gray-500 hover:text-gray-300'}`}
                    >
                      🔴 وضع متصفح الويب العادي
                    </button>
                  </div>
                </div>

                {printerConnected ? (
                  <div className="bg-emerald-950/10 border border-emerald-500/20 p-3.5 rounded-xl space-y-2.5">
                    <p className="text-[10px] text-gray-300 leading-relaxed">
                      💡 تم رصد طابعة الإيصالات الحرارية بنجاح. سيقوم النظام الآن بإرسال كود النبضة الكهربائية <code className="bg-black/50 px-1 py-0.5 rounded font-mono text-emerald-300">ESC p m t1 t2</code> مباشرة إلى الطابعة لفتح الدرج المتصل بها تلقائياً عبر منفذ RJ11.
                    </p>
                    <button
                      onClick={handleSendEscPosPulse}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 text-center block"
                    >
                      ⚡ إرسال كود ESC/POS لفتح الدرج فوراً
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-950/10 border border-amber-500/20 p-3.5 rounded-xl space-y-2">
                    <p className="text-[10px] text-gray-300 leading-relaxed">
                      ⚠️ تنبيه: بما أنك تتصفح النظام من متصفح ويب عادي (Web Sandbox)، فإن فتح الدرج التلقائي يتطلب وجود طابعة إيصالات حرارية متوافقة مع بروتوكول ESC/POS موصولة بالجهاز ومحددة كطابعة افتراضية.
                    </p>
                    <p className="text-[9px] text-[#D4AF37] font-bold">
                      يرجى توصيل الطابعة وتوصيل كابل درج النقدية بها لتتمكن من تشغيل نبضة الفتح الكهربائية بنجاح.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setShowDrawerModal(false)}
                  className="w-full py-2.5 bg-gradient-to-r from-zinc-850 to-zinc-950 hover:from-zinc-800 hover:to-zinc-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer text-center block border border-zinc-800"
                >
                  إغلاق نافذة التحكم ❌
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shift Handover Modal */}
      <ShiftHandoverModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        activeShift={activeShift}
        onShiftUpdated={() => {
          refreshShiftState();
          setTick(t => t + 1);
        }}
        cashierName="الأدمن"
      />

    </div>
  );
}

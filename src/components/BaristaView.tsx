import React, { useState, useEffect, useMemo } from 'react';
import {
  Coffee,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  BellRing,
  CheckCheck,
  Search,
  Filter,
  Volume2,
  RefreshCw,
  User,
  Shield,
  Layers,
  Sparkles,
  UtensilsCrossed,
  Flame
} from 'lucide-react';
import { dbService, getItemCategoryIcon } from '../dbService';
import { BaristaOrder, BaristaOrderStatus, BaristaOrderItem } from '../types';
import { playBaristaNewOrderSound, playOrderReadySound } from '../lib/audioService';

interface BaristaViewProps {
  onShowSuccessAlert?: (msg: string) => void;
  onShowWarningAlert?: (msg: string) => void;
}

export default function BaristaView({ onShowSuccessAlert, onShowWarningAlert }: BaristaViewProps) {
  const [orders, setOrders] = useState<BaristaOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Load Barista Orders
  const loadOrders = () => {
    const list = dbService.getBaristaOrders();
    setOrders(list);
  };

  useEffect(() => {
    loadOrders();

    const handleUpdate = () => loadOrders();
    const handleNewOrder = (e: any) => {
      loadOrders();
      if (soundEnabled) {
        playBaristaNewOrderSound();
      }
    };

    window.addEventListener('barista_orders_updated', handleUpdate);
    window.addEventListener('barista_new_order', handleNewOrder as EventListener);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('barista_orders_updated', handleUpdate);
      window.removeEventListener('barista_new_order', handleNewOrder as EventListener);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [soundEnabled]);

  // Handle status update
  const handleUpdateStatus = (orderId: string, newStatus: BaristaOrderStatus) => {
    const updated = dbService.updateBaristaOrderStatus(orderId, newStatus);
    if (updated) {
      loadOrders();
      if (newStatus === 'PREPARING') {
        if (onShowSuccessAlert) onShowSuccessAlert(`تم تغيير حالة الطلب رقم #${updated.order_number} إلى (قيد التحضير ⏳)`);
      } else if (newStatus === 'READY') {
        if (onShowSuccessAlert) onShowSuccessAlert(`الطلب رقم #${updated.order_number} جاهز للتسليم الآن! 🔔`);
      } else if (newStatus === 'DELIVERED') {
        if (onShowSuccessAlert) onShowSuccessAlert(`تم تسجيل تسليم الطلب رقم #${updated.order_number} بنجاح.`);
      }
    }
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Tab filter
      if (activeTab === 'ALL' && order.status === 'DELIVERED') return false; // Default active tab hides delivered
      if (activeTab === 'NEW' && order.status !== 'NEW') return false;
      if (activeTab === 'PREPARING' && order.status !== 'PREPARING') return false;
      if (activeTab === 'READY' && order.status !== 'READY') return false;
      if (activeTab === 'DELIVERED' && order.status !== 'DELIVERED') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesNum = order.order_number.toLowerCase().includes(q);
        const matchesTable = (order.table_number || '').toLowerCase().includes(q);
        const matchesCustomer = (order.customer_name || '').toLowerCase().includes(q);
        const matchesCashier = (order.cashier_name || '').toLowerCase().includes(q);
        const matchesItem = order.items.some(it =>
          it.product_name_ar.toLowerCase().includes(q) ||
          (it.notes || '').toLowerCase().includes(q)
        );

        if (!matchesNum && !matchesTable && !matchesCustomer && !matchesCashier && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  // Counts for badge counters
  const counts = useMemo(() => {
    return {
      newCount: orders.filter(o => o.status === 'NEW').length,
      preparingCount: orders.filter(o => o.status === 'PREPARING').length,
      readyCount: orders.filter(o => o.status === 'READY').length,
      deliveredCount: orders.filter(o => o.status === 'DELIVERED').length,
      activeCount: orders.filter(o => o.status !== 'DELIVERED').length
    };
  }, [orders]);

  // Status visual badge config
  const getStatusBadge = (status: BaristaOrderStatus) => {
    switch (status) {
      case 'NEW':
        return {
          label: '🆕 جديد',
          badgeClass: 'bg-blue-900/60 text-blue-300 border-blue-500/50 animate-pulse',
          cardClass: 'border-blue-500/40 bg-gradient-to-b from-blue-950/20 via-black to-black shadow-[0_0_20px_rgba(59,130,246,0.12)]',
          colorName: 'blue'
        };
      case 'PREPARING':
        return {
          label: '🍳 جاري التحضير',
          badgeClass: 'bg-amber-900/60 text-amber-300 border-amber-500/50',
          cardClass: 'border-amber-500/40 bg-gradient-to-b from-amber-950/20 via-black to-black shadow-[0_0_20px_rgba(245,158,11,0.12)]',
          colorName: 'amber'
        };
      case 'READY':
        return {
          label: '✅ جاهز للاستلام',
          badgeClass: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/50 animate-bounce',
          cardClass: 'border-emerald-500/50 bg-gradient-to-b from-emerald-950/30 via-black to-black shadow-[0_0_25px_rgba(16,185,129,0.2)]',
          colorName: 'emerald'
        };
      case 'DELIVERED':
        return {
          label: '🚶 تم التسليم للعميل',
          badgeClass: 'bg-gray-800 text-gray-400 border-gray-700',
          cardClass: 'border-gray-850 bg-black/60 opacity-75',
          colorName: 'gray'
        };
    }
  };

  return (
    <div className="space-y-6 font-sans select-none animate-fade-in" dir="rtl">
      
      {/* 1. TOP HEADER & METRICS BAR */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 via-gold-500 to-amber-400 text-black flex items-center justify-center font-black shadow-lg shrink-0">
            <Coffee className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-white flex items-center gap-2">
              <span>شاشة البارستا وإدارة الطلبات والتحضير</span>
              <Sparkles className="w-4 h-4 text-gold-500 animate-pulse" />
            </h2>
            <p className="text-gray-400 text-xs font-semibold mt-0.5">
              استقبال المشروبات والشيشة فورياً مع متابعة وتحديث حالات التحضير
            </p>
          </div>
        </div>

        {/* Quick Actions & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              playBaristaNewOrderSound();
              if (onShowSuccessAlert) onShowSuccessAlert('تم اختبار صوت التنبيهات بنجاح! 🔔');
            }}
            className="px-3 py-2 bg-luxury-bg border border-gold-500/30 hover:border-gold-500 text-gold-400 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="اختبار جرس التنبيهات"
          >
            <Volume2 className="w-4 h-4 text-gold-500" />
            <span className="hidden sm:inline">اختبار الصوت</span>
          </button>

          <button
            onClick={loadOrders}
            className="p-2 bg-luxury-bg border border-gray-800 hover:border-gold-500 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="تحديث القائمة"
          >
            <RefreshCw className="w-4 h-4 text-gold-500" />
          </button>

          <div className="bg-black/60 border border-gray-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-gray-300">الطلبات النشطة:</span>
            <span className="text-gold-500 font-mono font-black text-sm">{counts.activeCount}</span>
          </div>
        </div>
      </div>

      {/* 2. FILTER TABS & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-black/40 p-2 border border-luxury-border rounded-2xl">
        
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'bg-gold-600 text-black shadow-lg'
                : 'bg-luxury-card text-gray-400 hover:text-white border border-gray-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>الطلبات النشطة</span>
            <span className="px-1.5 py-0.2 rounded-md bg-black/30 font-mono text-[10px] font-black">{counts.activeCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('NEW')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'NEW'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-luxury-card text-blue-400 hover:text-blue-200 border border-blue-900/40'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>🆕 جديد</span>
            {counts.newCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-blue-950 text-blue-200 font-mono text-[10px] font-black border border-blue-500/40 animate-pulse">
                {counts.newCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('PREPARING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'PREPARING'
                ? 'bg-amber-600 text-white shadow-lg'
                : 'bg-luxury-card text-amber-400 hover:text-amber-200 border border-amber-900/40'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>🍳 جاري التحضير</span>
            {counts.preparingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-amber-950 text-amber-200 font-mono text-[10px] font-black border border-amber-500/40">
                {counts.preparingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('READY')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'READY'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'bg-luxury-card text-emerald-400 hover:text-emerald-200 border border-emerald-900/40'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>✅ جاهز للاستلام</span>
            {counts.readyCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-950 text-emerald-200 font-mono text-[10px] font-black border border-emerald-500/40 animate-bounce">
                {counts.readyCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('DELIVERED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'DELIVERED'
                ? 'bg-gray-700 text-white shadow-lg'
                : 'bg-luxury-card text-gray-400 hover:text-gray-200 border border-gray-800'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>🚶 تم التسليم للعميل</span>
            <span className="px-1.5 py-0.2 rounded-md bg-black/40 text-gray-400 font-mono text-[10px] font-black">
              {counts.deliveredCount}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="w-4 h-4 text-gold-500 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الطلب، الطاولة، المشروب..."
            className="w-full bg-luxury-bg border border-gray-800 focus:border-gold-500 text-white text-xs rounded-xl py-2 pr-9 pl-3 focus:outline-none font-bold"
          />
        </div>

      </div>

      {/* 3. ORDERS GRID BOARD */}
      {filteredOrders.length === 0 ? (
        <div className="bg-luxury-card border border-luxury-border/50 rounded-3xl p-12 text-center space-y-4 max-w-md mx-auto shadow-xl my-8">
          <div className="w-20 h-20 rounded-full bg-black/60 border border-gold-500/30 text-gold-500 flex items-center justify-center mx-auto text-3xl font-black shadow-inner">
            ☕
          </div>
          <h3 className="text-base font-black text-white">لا توجد طلبات في هذه القائمة حالياً</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            عند إرسال أي طلب جديد من شاشة الكاشير، سيظهر هنا فورياً مع تنبيه صوتي للبارستا.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map(order => {
            const badge = getStatusBadge(order.status);
            return (
              <div
                key={order.id}
                className={`border rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${badge.cardClass}`}
              >
                
                {/* Top Ticket Header */}
                <div>
                  <div className="flex justify-between items-start gap-2 pb-3 border-b border-gray-800/80 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white font-mono tracking-tight">
                          #{order.order_number}
                        </span>
                        {order.table_number && (
                          <span className="px-2 py-0.5 bg-gold-600/20 text-gold-400 border border-gold-500/40 rounded-lg text-xs font-black">
                            {order.table_number.includes('طاولة') ? order.table_number : `طاولة ${order.table_number}`}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 font-bold mt-1">
                        <span className="flex items-center gap-1 text-gray-300">
                          <User className="w-3 h-3 text-gold-500" />
                          {order.customer_name || 'عميل مباشر'}
                        </span>
                        <span>•</span>
                        <span className="text-gray-400">
                          الكاشير: {order.cashier_name}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border uppercase tracking-wider ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Send Time & Notes if any */}
                  <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold mb-3 bg-black/40 px-3 py-1.5 rounded-xl border border-gray-900">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-gold-500" />
                      إرسال: {order.sent_time}
                    </span>
                    {order.notes && (
                      <span className="text-amber-400 font-bold truncate max-w-[150px]">
                        📝 {order.notes}
                      </span>
                    )}
                  </div>

                  {/* Items List (Strictly NO Prices!) */}
                  <div className="space-y-2 mb-4">
                    <span className="text-[10px] font-extrabold text-gold-500/80 block uppercase tracking-wider">
                      عناصر المشروبات والطلبات:
                    </span>
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {order.items.map((item, idx) => {
                        const icon = item.category_icon || getItemCategoryIcon(item.category_name, item.product_name_ar);
                        return (
                          <div
                            key={item.id || idx}
                            className="bg-black/80 border border-gray-850 p-2.5 rounded-xl flex items-start justify-between gap-2 transition-all hover:border-gray-700"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-base shrink-0 leading-none pt-0.5">{icon}</span>
                              <div>
                                <strong className="text-xs font-bold text-white block leading-tight">
                                  {item.product_name_ar}
                                </strong>
                                {item.notes && (
                                  <span className="text-[10px] text-amber-300 font-semibold block mt-0.5">
                                    ملاحظات: {item.notes}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quantity pill */}
                            <span className="px-2 py-0.5 bg-gold-600/20 text-gold-400 border border-gold-500/30 rounded-lg text-xs font-black font-mono shrink-0">
                              x{item.quantity}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-3 border-t border-gray-800/80 space-y-2">
                  {order.status === 'NEW' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-600 via-gold-600 to-amber-500 hover:from-amber-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      <span>بدء التحضير 🍳</span>
                    </button>
                  )}

                  {(order.status === 'NEW' || order.status === 'PREPARING') && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'READY')}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <BellRing className="w-4 h-4" />
                      <span>جاهز للاستلام ✅</span>
                    </button>
                  )}

                  {order.status === 'READY' && (
                    <div className="space-y-1.5">
                      <div className="p-2 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-center text-xs text-emerald-300 font-bold animate-pulse">
                        الطلب جاهز للاستلام! تم إخطار الكاشير 🔔
                      </div>
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'DELIVERED')}
                        className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <CheckCheck className="w-4 h-4 text-emerald-400" />
                        <span>تم التسليم للعميل 🚶</span>
                      </button>
                    </div>
                  )}

                  {order.status === 'DELIVERED' && (
                    <div className="p-2 bg-gray-900 border border-gray-800 rounded-xl text-center text-[11px] text-gray-500 font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
                      <span>طلب مسلم ومكتمل</span>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

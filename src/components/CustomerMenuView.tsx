import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../dbService';
import { Product, Category, AppSettings } from '../types';
import { Search, ShoppingBag, Plus, Minus, Trash2, Send, CheckCircle2, Coffee, ArrowRight } from 'lucide-react';

interface CustomerMenuViewProps {
  onBackToPOS?: () => void;
}

export default function CustomerMenuView({ onBackToPOS }: CustomerMenuViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings>(dbService.getSettings());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number; notes?: string }>>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [showCartModal, setShowCartModal] = useState<boolean>(false);
  const [orderSentSuccess, setOrderSentSuccess] = useState<boolean>(false);

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    const urlTable = params.get('table');
    if (urlTable) {
      setTableNumber(urlTable);
    }
  }, []);

  const loadData = () => {
    setProducts(dbService.getProducts());
    setCategories(dbService.getCategories());
    setSettings(dbService.getSettings());
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
      const matchSearch = (p.name_ar || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.name_en || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const addToCart = (product: Product) => {
    if (product.is_available === false) return;
    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.product.id === product.id);
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      } else {
        return [...prev, { product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as Array<{ product: Product; quantity: number; notes?: string }>;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const cartTotals = useMemo(() => {
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.product.selling_price * item.quantity), 0);
    return { itemCount, subtotal };
  }, [cart]);

  const handleSendOrderWhatsApp = () => {
    if (cart.length === 0) return;

    // Automatically save as an open invoice in the POS system ("الفواتير المفتوحة والمعلقة")
    try {
      const custName = customerName.trim() ? `العميل: ${customerName.trim()}` : 'عميل المنيو الإلكتروني';
      const tblNum = tableNumber.trim() ? tableNumber.trim() : 'منيو ذاتي';
      const notesCombined = [
        custName,
        orderNotes.trim() ? `ملاحظات: ${orderNotes.trim()}` : ''
      ].filter(Boolean).join(' | ');

      dbService.saveOpenInvoice(
        undefined,
        cart.map(item => ({
          product: item.product,
          quantity: item.quantity,
          notes: item.notes || ''
        })),
        'CASH',
        'c_general',
        0,
        0,
        0,
        'المنيو الإلكتروني الذاتي',
        notesCombined,
        tblNum,
        'CASH',
        '',
        '',
        'OPEN'
      );
    } catch (err) {
      console.error('Error auto-saving open invoice from menu:', err);
    }

    const currency = settings.currency || 'ج.م';
    const cafeName = settings.cafe_name || 'كافيه الديب';

    let message = `🛒 *طلب جديد عبر المنيو الإلكتروني - ${cafeName}* ☕\n`;
    message += `----------------------------\n`;
    if (customerName.trim()) {
      message += `👤 *اسم العميل:* ${customerName.trim()}\n`;
    }
    if (tableNumber.trim()) {
      message += `🪑 *رقم الطاولة / المكان:* ${tableNumber.trim()}\n`;
    }
    if (orderNotes.trim()) {
      message += `📝 *ملاحظات عامة:* ${orderNotes.trim()}\n`;
    }
    message += `----------------------------\n`;
    message += `*الأصناف المطلوبة:*\n`;

    cart.forEach((item, idx) => {
      const itemTotal = item.product.selling_price * item.quantity;
      message += `${idx + 1}. ${item.product.name_ar} × ${item.quantity} = *${itemTotal.toLocaleString()} ${currency}*\n`;
      if (item.notes) {
        message += `   ↳ ملاحظة: ${item.notes}\n`;
      }
    });

    message += `----------------------------\n`;
    message += `💰 *الإجمالي الكلي:* *${cartTotals.subtotal.toLocaleString()} ${currency}*\n`;
    message += `----------------------------\n`;
    message += `شكراً لاختياركم ${cafeName} 🌹`;

    const phone = (settings.phone || '').replace(/\D/g, '');
    let formattedPhone = phone;
    if (formattedPhone.startsWith('01')) {
      formattedPhone = '2' + formattedPhone;
    } else if (formattedPhone && !formattedPhone.startsWith('20') && formattedPhone.length === 10) {
      formattedPhone = '20' + formattedPhone;
    }

    const encoded = encodeURIComponent(message);
    const whatsappUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(whatsappUrl, '_blank');
    setOrderSentSuccess(true);
    setShowCartModal(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col selection:bg-amber-500 selection:text-black dir-rtl">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur border-b border-amber-500/30 px-4 py-3 shadow-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coffee className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-black text-amber-400 tracking-wide">{settings.cafe_name || 'كافيه الديب'}</h1>
              <p className="text-[10px] text-gray-400 font-bold">المنيو الإلكتروني الذاتي للطلبات 📱</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBackToPOS && (
              <button
                onClick={onBackToPOS}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-lg text-xs font-bold border border-neutral-700 flex items-center gap-1.5 transition"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة للنظام</span>
              </button>
            )}
            <button
              onClick={() => setShowCartModal(true)}
              className="relative px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-neutral-950 font-black rounded-xl text-xs shadow-lg flex items-center gap-2 transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>السلة</span>
              {cartTotals.itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
                  {cartTotals.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4 pb-28">
        {orderSentSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-4 text-center space-y-2 shadow-xl">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-base font-black text-emerald-300">تم إرسال طلبك بنجاح عبر الواتساب!</h2>
            <p className="text-xs text-gray-300">تم فتح تطبيق واتساب بإرسال تفاصيل طلبك للإدارة. في انتظار تحضير طلبك ووصوله لطاولتك قريباً 🌹</p>
            <button
              onClick={() => { setOrderSentSuccess(false); setCart([]); }}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
            >
              طلب جديد 🔄
            </button>
          </div>
        )}

        {/* Search & Categories */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن مشروب، صنف، أو وجبة مفضلة..."
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-amber-500/60 rounded-xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-gray-500 outline-none transition"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-neutral-950 shadow-lg font-black'
                  : 'bg-neutral-900 text-gray-300 hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              ☕ كل الأصناف
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500 text-neutral-950 shadow-lg font-black'
                    : 'bg-neutral-900 text-gray-300 hover:bg-neutral-800 border border-neutral-800'
                }`}
              >
                {cat.name_ar}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredProducts.map(product => {
            const inCart = cart.find(i => i.product.id === product.id);
            const isAvailable = product.is_available !== false;
            return (
              <div
                key={product.id}
                className={`bg-neutral-900 border rounded-2xl p-3 flex flex-col justify-between transition-all duration-300 group shadow-lg ${
                  isAvailable ? 'border-neutral-800/80 hover:border-amber-500/40' : 'border-red-950/60 opacity-75'
                }`}
              >
                <div>
                  <div className="w-full h-24 rounded-xl bg-neutral-950 border border-neutral-800 mb-2.5 overflow-hidden flex items-center justify-center relative">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name_ar} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                    ) : (
                      <Coffee className="w-8 h-8 text-amber-500/40 group-hover:scale-110 transition duration-500" />
                    )}
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-neutral-950/80 backdrop-blur border border-amber-500/30 text-amber-400 font-mono text-[10px] font-black rounded-lg">
                      {product.selling_price.toLocaleString()} {settings.currency || 'ج.م'}
                    </span>
                    {!isAvailable && (
                      <span className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-red-950/90 border border-red-500/60 text-red-400 font-black text-[9px] rounded-lg shadow animate-pulse">
                        غير متاح 🚫
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-white group-hover:text-amber-400 transition line-clamp-1">{product.name_ar}</h3>
                  {product.description && (
                    <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{product.description}</p>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-neutral-800/60 flex items-center justify-between">
                  {!isAvailable ? (
                    <button
                      disabled
                      className="w-full py-1.5 bg-neutral-950 text-red-400 border border-red-900/40 rounded-xl text-xs font-bold cursor-not-allowed text-center"
                    >
                      غير متاح حالياً 🚫
                    </button>
                  ) : inCart ? (
                    <div className="flex items-center gap-1.5 bg-neutral-950 px-2 py-1 rounded-xl border border-amber-500/30 w-full justify-between">
                      <button
                        onClick={() => updateQuantity(product.id, -1)}
                        className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center justify-center text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-black text-amber-400">{inCart.quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, 1)}
                        className="w-5 h-5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg flex items-center justify-center text-xs font-black"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(product)}
                      className="w-full py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-amber-400 border border-neutral-700 hover:border-amber-500 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating Cart Footer Bar */}
      {cartTotals.itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-900/95 backdrop-blur border-t border-amber-500/30 p-3 shadow-2xl">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] text-gray-400 font-bold">إجمالي السلة ({cartTotals.itemCount} صنف)</p>
              <p className="text-sm font-mono font-black text-amber-400">{cartTotals.subtotal.toLocaleString()} {settings.currency || 'ج.م'}</p>
            </div>
            <button
              onClick={() => setShowCartModal(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black rounded-xl text-xs shadow-xl flex items-center gap-2 transition"
            >
              <span>مراجعة الطلب وإرساله</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cart & Checkout Modal */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-neutral-900 border border-amber-500/30 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-black text-amber-400 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                <span>سلة الطلبات الخاصة بك</span>
              </h2>
              <button
                onClick={() => setShowCartModal(false)}
                className="w-7 h-7 bg-neutral-800 text-gray-400 hover:text-white rounded-full flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-3 bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <h3 className="text-xs font-bold text-amber-400">بيانات التوصيل / الطاولة:</h3>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">الاسم الكريم *</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="أدخل اسمك هنا..."
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">رقم الطاولة أو مكان الجلوس *</label>
                  <input
                    type="text"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="مثال: طاولة رقم 5 أو البلكونة..."
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات إضافية للطلب</label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="مثال: زيادة سكر، بدون ثلج..."
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-300">الأصناف المضافة ({cart.length}):</h3>
                {cart.map(item => (
                  <div key={item.product.id} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-white">{item.product.name_ar}</h4>
                      <p className="text-[10px] font-mono text-amber-400">{item.product.selling_price} {settings.currency || 'ج.م'} للوحدة</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-neutral-900 px-2 py-1 rounded-lg border border-neutral-800">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-5 h-5 text-gray-300 hover:text-white flex items-center justify-center font-bold text-xs"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-black text-white w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-5 h-5 text-amber-400 hover:text-amber-300 flex items-center justify-center font-bold text-xs"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-7 h-7 bg-red-950/60 text-red-400 hover:bg-red-900/60 rounded-lg flex items-center justify-center transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                <span>المجموع الكلي:</span>
                <span className="font-mono text-base font-black text-amber-400">{cartTotals.subtotal.toLocaleString()} {settings.currency || 'ج.م'}</span>
              </div>
              <button
                onClick={handleSendOrderWhatsApp}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black rounded-xl text-xs shadow-xl flex items-center justify-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                <span>إرسال الطلب عبر الواتساب للإدارة 📱</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

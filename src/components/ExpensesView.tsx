/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingDown,
  DollarSign,
  Coffee,
  PlusCircle,
  FileText,
  Calendar,
  XCircle,
  PiggyBank,
  Zap,
  Flame,
  Droplet,
  Wifi,
  Users,
  Home,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  CreditCard,
  Tag,
  Eye,
  AlertCircle
} from 'lucide-react';
import { dbService, safeStorage, isPurchaseExpense } from '../dbService';
const localStorage = safeStorage;
import { Expense, Supplier } from '../types';

interface ExpensesViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function ExpensesView({ onShowSuccessAlert, onShowWarningAlert }: ExpensesViewProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState(() => dbService.getSettings());
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('all');

  // New Expense form state
  const [category, setCategory] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'VODAFONE_CASH' | 'CREDIT'>('CASH');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState(false);

  // New custom category form state
  const [newCatName, setNewCatName] = useState('');
  const [showAddCatInline, setShowAddCatInline] = useState(false);

  // Lightbox modal state
  const [activeReceiptImage, setActiveReceiptImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = () => {
    setExpenses(dbService.getExpenses().reverse()); // Newest first
    setSuppliers(dbService.getSuppliers());
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  // Combined user-defined categories list only
  const allCategories = useMemo(() => {
    const customCats = settings.custom_expense_categories || [];
    return customCats.map(cat => ({
      id: cat,
      name: cat,
      icon: <Tag className="w-4 h-4 text-gold-400" />
    }));
  }, [settings.custom_expense_categories]);

  // Keep active category selection valid or set to default
  useEffect(() => {
    const customCats = settings.custom_expense_categories || [];
    if (customCats.length > 0 && (!category || !customCats.includes(category))) {
      setCategory(customCats[0]);
    } else if (customCats.length === 0) {
      setCategory('');
    }
  }, [settings.custom_expense_categories, category]);

  const getCategoryIcon = (catId: string) => {
    return <Tag className="w-4 h-4 text-gold-400" />;
  };

  const getCategoryNameAr = (catId: string): string => {
    return catId;
  };

  // Image upload helpers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onShowWarningAlert('يرجى اختيار ملف صورة صالح فقط (JPEG, PNG, WEBP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setReceiptImage(e.target?.result as string);
      onShowSuccessAlert('تم تحميل صورة الإيصال بنجاح! 📸');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Create custom category
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    const currentCats = settings.custom_expense_categories || [];
    if (currentCats.includes(trimmed)) {
      onShowWarningAlert('هذا التصنيف موجود بالفعل!');
      return;
    }

    const updatedCats = [...currentCats, trimmed];
    const updatedSettings = {
      ...settings,
      custom_expense_categories: updatedCats
    };
    
    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setCategory(trimmed);
    setNewCatName('');
    setShowAddCatInline(false);
    onShowSuccessAlert(`تم إضافة تصنيف المصروفات الجديد: "${trimmed}" بنجاح! 🎉`);
  };

  // Update existing category name (Edit)
  const handleEditCategoryName = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) return;

    const currentCats = settings.custom_expense_categories || [];
    if (currentCats.includes(trimmed)) {
      onShowWarningAlert('هذا التصنيف موجود بالفعل!');
      return;
    }

    const updatedCats = currentCats.map(c => c === oldName ? trimmed : c);
    const updatedSettings = {
      ...settings,
      custom_expense_categories: updatedCats
    };
    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);

    // Update existing expenses using this category
    const allExpenses = dbService.getExpenses();
    let updatedAny = false;
    const updatedExpenses = allExpenses.map(exp => {
      if (exp.expense_category === oldName) {
        updatedAny = true;
        return { ...exp, expense_category: trimmed };
      }
      return exp;
    });

    if (updatedAny) {
      localStorage.setItem('cafe_expenses', JSON.stringify(updatedExpenses));
      dbService.syncToServer();
      loadExpenses();
    }

    if (category === oldName) {
      setCategory(trimmed);
    }

    onShowSuccessAlert(`تم تعديل اسم التصنيف من "${oldName}" إلى "${trimmed}" وتحديث المصروفات بنجاح. 🎉`);
  };

  // Delete category
  const handleDeleteCategoryName = (catName: string) => {
    if (!confirm(`⚠️ هل أنت متأكد من حذف تصنيف المصروفات "${catName}"؟ هذا الإجراء لن يحذف المصروفات المسجلة تحت هذا التصنيف، بل سيبقيها مصنفة باسمها.`)) {
      return;
    }

    const currentCats = settings.custom_expense_categories || [];
    const updatedCats = currentCats.filter(c => c !== catName);
    const updatedSettings = {
      ...settings,
      custom_expense_categories: updatedCats
    };
    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);

    if (category === catName) {
      setCategory(updatedCats[0] || '');
    }

    onShowSuccessAlert(`تم حذف تصنيف المصروفات "${catName}" بنجاح.`);
  };

  // Submit main Expense
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      onShowWarningAlert('يرجى إنشاء تصنيف مصروفات واحد على الأقل أولاً!');
      return;
    }
    if (amount <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    if (paymentMethod === 'CASH') {
      const drawer = dbService.getActiveDrawer();
      const currentDrawerBalance = drawer.opening_balance + drawer.cash_in - drawer.cash_out;
      if (amount > currentDrawerBalance) {
        onShowWarningAlert(`لا يمكن تسجيل مصروفات كاش بقيمة (${amount} ج.م) لعدم كفاية الرصيد في الدرج (${currentDrawerBalance} ج.م).`);
        return;
      }
    }

    if (paymentMethod === 'CREDIT' && !selectedSupplierId) {
      onShowWarningAlert('يرجى اختيار المورد لتسجيل المصروف بالآجل عليه!');
      return;
    }

    dbService.saveExpense(
      category,
      description,
      amount,
      notes,
      paymentMethod,
      receiptImage,
      paymentMethod === 'CREDIT' ? selectedSupplierId : undefined
    );
    onShowSuccessAlert(`تم تسجيل المصروف بقيمة ${amount} ج.م بنجاح.`);
    
    // Reset Form
    setDescription('');
    setNotes('');
    setAmount(0);
    setReceiptImage('');
    setSelectedSupplierId('');
    loadExpenses();
  };

  const handleDeleteExpense = (id: string, expAmount: number) => {
    if (confirm(`⚠️ هل تريد إلغاء وحذف هذا المصروف بقيمة (${expAmount} ج.م)؟ سيتم ترحيل واسترجاع المبلغ للدرج إذا كان كاش.`)) {
      dbService.deleteExpense(id);
      onShowSuccessAlert('تم حذف المصروف بنجاح.');
      loadExpenses();
    }
  };

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchSearch = e.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = filterCategory === 'all' || e.expense_category === filterCategory;
      const matchPay = filterPaymentMethod === 'all' || e.payment_method === filterPaymentMethod;
      return matchSearch && matchCat && matchPay;
    });
  }, [expenses, searchTerm, filterCategory, filterPaymentMethod]);

  // Financial statistics calculated dynamically
  const stats = useMemo(() => {
    let totalCash = 0;
    let totalBank = 0;
    let totalVF = 0;
    let totalCredit = 0;
    let operatingExpensesTotal = 0;
    let purchasesTotal = 0;
    
    filteredExpenses.forEach(e => {
      const payMethod = e.payment_method || 'CASH';
      if (payMethod === 'CASH') totalCash += e.amount;
      else if (payMethod === 'BANK') totalBank += e.amount;
      else if (payMethod === 'VODAFONE_CASH') totalVF += e.amount;
      else if (payMethod === 'CREDIT') totalCredit += e.amount;

      if (isPurchaseExpense(e)) {
        purchasesTotal += e.amount;
      } else {
        operatingExpensesTotal += e.amount;
      }
    });

    return {
      totalCash,
      totalBank,
      totalVF,
      totalCredit,
      operatingExpensesTotal,
      purchasesTotal,
      totalAll: totalCash + totalBank + totalVF + totalCredit
    };
  }, [filteredExpenses]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full animate-fade-in" dir="rtl">
      
      {/* 1. Left Form: Add New Expense Panel */}
      <div className="w-full lg:w-[400px] bg-[#050505] border border-gold-500/10 rounded-3xl p-6 shadow-xl shrink-0 space-y-5">
        <div>
          <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            تسجيل مصروفات ونفقات جديدة
          </h3>
          <p className="text-gray-400 text-[10px]">يقوم النظام بتسجيل النفقة فوراً وتحديث الرصيد/الدرج وفقاً لطريقة الدفع</p>
        </div>

        {/* Quick inline category adder toggler */}
        <div className="flex justify-between items-center bg-gold-600/5 border border-gold-600/10 p-2 rounded-xl text-xs">
          <span className="text-gray-400">لم تجد التصنيف المناسب؟</span>
          <button
            onClick={() => setShowAddCatInline(!showAddCatInline)}
            className="px-2.5 py-1.5 bg-gold-600/20 hover:bg-gold-600 text-gold-300 hover:text-black rounded-lg cursor-pointer font-black text-[10px] transition-all"
          >
            {showAddCatInline ? 'إلغاء ❌' : 'إنشاء تصنيف جديد ➕'}
          </button>
        </div>

        {/* Inline custom category form */}
        {showAddCatInline && (
          <form onSubmit={handleCreateCategory} className="bg-[#0b0b0b] border border-gold-600/20 p-3.5 rounded-xl space-y-3 animate-fade-in">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1 font-bold">اسم تصنيف المصروفات الجديد *</label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full bg-[#050505] border border-gray-900 text-white rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                placeholder="مثال: صيانة معدات، أدوات نظافة، إلخ"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-gold-600 text-black font-black text-[10px] rounded-lg cursor-pointer"
            >
              حفظ التصنيف الجديد 💾
            </button>
          </form>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-right">
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">تصنيف المصروف *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer font-medium"
              disabled={allCategories.length === 0}
            >
              {allCategories.length === 0 ? (
                <option value="">⚠️ لا توجد تصنيفات حالياً (يرجى الإنشاء أولاً)</option>
              ) : (
                allCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">المبلغ المدفوع (EGP) *</label>
              <input
                type="number"
                required
                min="0.1"
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 px-3 text-sm font-mono font-bold focus:outline-none focus:border-gold-600 text-center text-red-400"
                placeholder="قيمة القيد"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1">طريقة الدفع المسدد بها *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer font-medium text-amber-500"
              >
                <option value="CASH">💵 كاش (من الدرج)</option>
                <option value="BANK">🏛️ تحويل بنكي / Instapay</option>
                <option value="VODAFONE_CASH">📱 فودافون كاش</option>
                <option value="CREDIT">⏳ أجل / مديونية مورد</option>
              </select>
            </div>
          </div>

          {paymentMethod === 'CREDIT' && (
            <div className="bg-[#0b0b0b] border border-amber-600/20 p-3.5 rounded-xl space-y-2 animate-fade-in">
              <label className="text-[10px] text-amber-500 font-bold block">المورد المرتبط بالدين *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
                className="w-full bg-[#050505] border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-amber-600 text-right cursor-pointer"
              >
                <option value="">-- اختر المورد المسجل --</option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>
                    {sup.supplier_name} {sup.phone ? `(${sup.phone})` : ''}
                  </option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <p className="text-[9px] text-rose-400">⚠️ لم يتم تسجيل أي موردين في النظام بعد. يرجى الانتقال لشاشة الموردين وإضافتهم أولاً لتتمكن من التسجيل بالآجل.</p>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">بيان المشتريات / تفاصيل المصروف *</label>
            <textarea
              required
              rows={2}
              placeholder="مثال: شراء كرتونة حليب جهينة طازج 12 علبة للبار"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium leading-relaxed"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات إضافية (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: فاتورة رقم 589 أو اسم المستلم"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
            />
          </div>

          {/* Receipt image upload dropzone */}
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">إرفاق صورة الفاتورة أو الإيصال (اختياري)</label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                isDragActive 
                  ? 'border-gold-500 bg-gold-600/5' 
                  : receiptImage 
                    ? 'border-green-600/40 bg-green-500/5' 
                    : 'border-gray-900 hover:border-gray-800 bg-[#0a0a0a]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {receiptImage ? (
                <div className="space-y-1.5">
                  <img
                    src={receiptImage}
                    alt="Receipt preview"
                    className="max-h-24 mx-auto rounded-lg object-cover border border-gray-900"
                  />
                  <span className="text-[9px] text-green-400 font-bold block">✓ تم إرفاق صورة الإيصال (اضغط للتغيير)</span>
                </div>
              ) : (
                <div className="py-2 space-y-1">
                  <ImageIcon className="w-6 h-6 text-gray-600 mx-auto" />
                  <span className="text-[10px] text-gray-400 block font-bold">اسحب صورة الفاتورة أو اضغط هنا لرفعها 📸</span>
                  <span className="text-[8px] text-gray-600 block">صيغ: PNG, JPEG, WEBP</span>
                </div>
              )}
            </div>
            {receiptImage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReceiptImage('');
                }}
                className="mt-1 text-[9px] text-red-500 hover:underline block mr-auto font-bold"
              >
                إلغاء وإزالة الصورة ✕
              </button>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-red-600 to-amber-700 hover:from-red-500 hover:to-amber-600 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            تسجيل المصروف وتحديث الحسابات 💾
          </button>
        </form>

        {/* Category Management Sub-Panel */}
        <div className="mt-6 border-t border-gray-900 pt-5 space-y-3.5">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5 justify-start">
            <Tag className="w-3.5 h-3.5 text-gold-500" />
            إدارة وتعديل تصنيفات المصروفات
          </h4>
          {allCategories.length === 0 ? (
            <div className="text-center p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-[10px] text-yellow-400 font-bold leading-relaxed">
              ⚠️ لا توجد أي تصنيفات مصروفات حالياً. يرجى كتابة اسم تصنيف جديد في الأعلى لتسجيل النفقات.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {allCategories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between bg-gold-600/5 hover:bg-gold-600/10 border border-gold-600/10 px-2.5 py-1.5 rounded-xl transition-all">
                  <span className="text-[11px] font-medium text-gray-300">{cat.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const newName = prompt(`تعديل اسم تصنيف المصروفات "${cat.name}" إلى:`, cat.name);
                        if (newName && newName.trim()) {
                          handleEditCategoryName(cat.name, newName);
                        }
                      }}
                      className="text-[9px] text-cyan-400 hover:underline cursor-pointer font-bold"
                    >
                      تعديل ✏️
                    </button>
                    <span className="text-gray-800 text-[9px]">|</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategoryName(cat.name)}
                      className="text-[9px] text-red-500 hover:underline cursor-pointer font-bold"
                    >
                      حذف 🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Right List: Expenses Ledger and Filters */}
      <div className="flex-1 space-y-4">
        
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-[#050505] border border-red-500/10 p-4 rounded-2xl text-right">
            <span className="text-[9px] text-gray-400 font-bold block mb-1">💵 كاش (درج اليومية)</span>
            <span className="text-sm font-black text-red-400 font-mono">{stats.totalCash.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-[#050505] border border-cyan-500/10 p-4 rounded-2xl text-right">
            <span className="text-[9px] text-gray-400 font-bold block mb-1">🏛️ تحويل بنكي / Instapay</span>
            <span className="text-sm font-black text-cyan-400 font-mono">{stats.totalBank.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-[#050505] border border-purple-500/10 p-4 rounded-2xl text-right">
            <span className="text-[9px] text-gray-400 font-bold block mb-1">📱 فودافون كاش</span>
            <span className="text-sm font-black text-purple-400 font-mono">{stats.totalVF.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-[#050505] border border-amber-500/10 p-4 rounded-2xl text-right">
            <span className="text-[9px] text-gray-400 font-bold block mb-1">⏳ أجل (ديون الموردين)</span>
            <span className="text-sm font-black text-amber-400 font-mono">{stats.totalCredit.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-[#050505] border border-gold-500/15 p-4 rounded-2xl text-right bg-gradient-to-l from-gold-600/5 to-transparent">
            <span className="text-[9px] text-gold-400 font-bold block mb-1">📊 إجمالي المصروفات المفطرة</span>
            <span className="text-base font-black text-white font-mono">{stats.totalAll.toLocaleString()} ج.م</span>
          </div>
        </div>

        {/* Accounting Separation (Operating vs Purchases) Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="bg-[#050505] border border-green-500/10 p-4 rounded-2xl text-right flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-l from-green-500/5 to-transparent">
            <div>
              <span className="text-[10px] text-gray-400 font-bold block mb-1">🛠️ المصروفات التشغيلية (تؤثر على صافي الأرباح)</span>
              <span className="text-base font-black text-green-400 font-mono">{stats.operatingExpensesTotal.toLocaleString()} ج.م</span>
            </div>
            <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed font-medium">تشمل المصروفات التشغيلية اليومية والخدمية مثل الإيجارات والمرتبات والمرافق والصيانة العامة.</p>
          </div>
          <div className="bg-[#050505] border border-blue-500/10 p-4 rounded-2xl text-right flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-l from-blue-500/5 to-transparent">
            <div>
              <span className="text-[10px] text-gray-400 font-bold block mb-1">📦 مشتريات بضاعة ومواد خام (أصول ومخزون)</span>
              <span className="text-base font-black text-blue-400 font-mono">{stats.purchasesTotal.toLocaleString()} ج.م</span>
            </div>
            <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed font-medium">المشتريات لا تحتسب كمصروف مباشر ولا تخصم فوراً من صافي أرباح اليوم، بل تدخل كبضاعة بالمخزون.</p>
          </div>
        </div>

        {/* Filters and search block */}
        <div className="bg-[#050505] border border-gold-500/10 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center">
          <div className="relative w-full md:flex-1">
            <input
              type="text"
              placeholder="ابحث في تفاصيل المصروف أو الملاحظات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
            />
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 px-3 text-[11px] focus:outline-none focus:border-gold-600 text-right cursor-pointer"
            >
              <option value="all">كل التصنيفات 📊</option>
              {allCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              className="bg-[#0a0a0a] border border-gray-900 text-white rounded-xl py-2 px-3 text-[11px] focus:outline-none focus:border-gold-600 text-right cursor-pointer"
            >
              <option value="all">كل طرق الدفع 💳</option>
              <option value="CASH">💵 كاش (الدرج)</option>
              <option value="BANK">🏛️ تحويل بنكي</option>
              <option value="VODAFONE_CASH">📱 فودافون كاش</option>
              <option value="CREDIT">⏳ أجل (مورد)</option>
            </select>
          </div>
        </div>

        {/* Expenses List Ledger */}
        <div className="bg-[#050505] border border-gold-500/10 rounded-3xl p-5 shadow-xl">
          <h3 className="text-xs font-black text-white mb-4 flex items-center gap-2 justify-end">
            <span>سجل حركة المصروفات المفصل</span>
            <FileSpreadsheet className="w-4 h-4 text-gold-500" />
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 font-bold">
                  <th className="pb-3 pt-1 px-2">التصنيف</th>
                  <th className="pb-3 pt-1 px-2">وصف المصروف وبيان المشتريات</th>
                  <th className="pb-3 pt-1 px-2">طريقة الدفع</th>
                  <th className="pb-3 pt-1 px-2">ملاحظات وإيصال</th>
                  <th className="pb-3 pt-1 px-2">التاريخ</th>
                  <th className="pb-3 pt-1 px-2 text-left">قيمة المصروف</th>
                  <th className="pb-3 pt-1 px-2 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/30">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500 font-bold">
                      لا توجد مصروفات مطابقة للبحث أو الفلترة حالياً.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map(e => {
                    const payMethod = e.payment_method || 'CASH';
                    return (
                      <tr key={e.id} className="hover:bg-gray-950/40 transition-colors">
                        <td className="py-3.5 px-2 font-bold text-white">
                          <span className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-[#0a0a0a] border border-gray-900 flex items-center justify-center text-xs">
                              {getCategoryIcon(e.expense_category)}
                            </span>
                            <span className="truncate max-w-[80px]" title={getCategoryNameAr(e.expense_category)}>
                              {getCategoryNameAr(e.expense_category)}
                            </span>
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-gray-300 font-medium max-w-xs truncate" title={e.description}>
                          {e.description}
                        </td>
                        <td className="py-3.5 px-2">
                          {payMethod === 'CASH' && (
                            <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold">💵 كاش الدرج</span>
                          )}
                          {payMethod === 'BANK' && (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[9px] font-bold">🏛️ بنكي/Instapay</span>
                          )}
                          {payMethod === 'VODAFONE_CASH' && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[9px] font-bold">📱 فودافون كاش</span>
                          )}
                          {payMethod === 'CREDIT' && (() => {
                            const sup = suppliers.find(s => s.id === e.supplier_id);
                            return (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold flex flex-col items-center gap-0.5">
                                <span>⏳ أجل (ديون الموردين)</span>
                                {sup && <span className="text-[8px] text-gray-400 font-normal">المورد: {sup.supplier_name}</span>}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-2">
                          <div className="flex items-center gap-2">
                            {e.receipt_image ? (
                              <button
                                onClick={() => setActiveReceiptImage(e.receipt_image || null)}
                                className="px-2 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 text-[9px] font-bold cursor-pointer flex items-center gap-1"
                                title="عرض صورة الإيصال المرفق"
                              >
                                <Eye className="w-3 h-3" />
                                <span>إيصال 📸</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-600 font-bold">-</span>
                            )}
                            {e.notes && (
                              <span className="text-[9px] text-gray-400 max-w-[100px] truncate block bg-gray-900/50 px-1.5 py-0.5 rounded border border-gray-950" title={e.notes}>
                                {e.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-2 text-gray-500 font-mono text-[10px]">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-600" />
                            {e.expense_date}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-left font-mono font-black text-sm text-red-400">
                          -{e.amount.toLocaleString()} <span className="text-[10px] text-gray-500">{settings.currency}</span>
                        </td>
                        <td className="py-3.5 px-2 text-center">
                          <button
                            onClick={() => handleDeleteExpense(e.id, e.amount)}
                            className="p-1 text-gray-600 hover:text-red-500 transition-colors cursor-pointer"
                            title="إلغاء وحذف القيد"
                          >
                            <XCircle className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ==================================================
          MODAL: Receipt Lightbox Viewer
          ================================================== */}
      {activeReceiptImage && (
        <div 
          onClick={() => setActiveReceiptImage(null)}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out overflow-y-auto"
        >
          <div className="relative max-w-3xl w-full max-h-[85vh] flex items-center justify-center my-auto">
            <button
              onClick={() => setActiveReceiptImage(null)}
              className="absolute -top-12 left-0 p-2 bg-[#0c0c0c] border border-gray-800 hover:border-red-500 text-gray-400 hover:text-white rounded-xl cursor-pointer font-bold text-xs"
            >
              إغلاق العرض ✕
            </button>
            <img
              src={activeReceiptImage}
              alt="Receipt Attachment Lightbox"
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[80vh] rounded-2xl object-contain border border-gold-500/20 shadow-2xl animate-fade-in"
            />
          </div>
        </div>
      )}

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ContactPickerButton } from './ContactPickerButton';
import { EldeebLogoHeader } from './EldeebLogo';
import {
  Briefcase,
  Search,
  PlusCircle,
  Coins,
  History,
  TrendingDown,
  UserCheck,
  CreditCard,
  MapPin,
  Phone,
  Layers,
  AlertTriangle,
  X,
  Printer,
  Calendar,
  Check,
  FileText,
  AlertCircle,
  Trash2,
  FileSpreadsheet,
  Share2
} from 'lucide-react';
import { dbService } from '../dbService';
import { Supplier, SupplierPurchase, SupplierPayment, RawMaterial } from '../types';
import { safeHtml2Canvas } from '../utils/html2canvasHelper';
import { shareElementAsImageToWhatsApp } from '../utils/whatsappHelper';

interface SuppliersViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function SuppliersView({
  onShowSuccessAlert,
  onShowWarningAlert
}: SuppliersViewProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [rawMaterialsList, setRawMaterialsList] = useState<RawMaterial[]>([]);

  const [activeModuleTab, setActiveModuleTab] = useState<'directory' | 'reports'>('directory');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Modals / Forms States
  const [showAddSupplier, setShowAddSupplier] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // New Supplier form state
  const [supName, setSupName] = useState<string>('');
  const [supPhone, setSupPhone] = useState<string>('');
  const [supAddress, setSupAddress] = useState<string>('');
  const [supNotes, setSupNotes] = useState<string>('');

  // Record Purchase form state
  const [showAddPurchase, setShowAddPurchase] = useState<boolean>(false);
  const [customItemName, setCustomItemName] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('كيلو');
  const [purDetails, setPurDetails] = useState<string>('');
  const [purAmount, setPurAmount] = useState<number>(0);
  const [purNotes, setPurNotes] = useState<string>('');
  const [purDate, setPurDate] = useState<string>(() => new Date().toISOString().substring(0, 16));
  const [selectedRawId, setSelectedRawId] = useState<string>('');
  const [purQty, setPurQty] = useState<number>(0);
  const [purPaymentMethod, setPurPaymentMethod] = useState<'CASH' | 'CREDIT'>('CREDIT');

  // Record Payment form state
  const [showAddPayment, setShowAddPayment] = useState<boolean>(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'VODAFONE_CASH' | 'INSTAPAY' | 'BANK'>('CASH');
  const [payNotes, setPayNotes] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().substring(0, 16));

  // Statement PDF view states
  const [showStatement, setShowStatement] = useState<boolean>(false);

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('cafe_db_synced_remote', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('cafe_db_synced_remote', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const loadData = () => {
    const sups = dbService.getSuppliers();
    setSuppliers(sups);
    setPurchases(dbService.getSupplierPurchases());
    setPayments(dbService.getSupplierPayments());
    setRawMaterialsList(dbService.getRawMaterials());

    // Keep selected supplier reference fresh if it exists
    if (selectedSupplier) {
      const fresh = sups.find(s => s.id === selectedSupplier.id);
      if (fresh) setSelectedSupplier(fresh);
    }
  };

  // Helper to calculate a supplier's total purchases, payments, and running balance
  const getSupplierStats = (supplierId: string) => {
    const supPurchases = purchases.filter(p => p.supplier_id === supplierId);
    const supPayments = payments.filter(p => p.supplier_id === supplierId);

    const totalPurchases = supPurchases.reduce((sum, p) => sum + p.total_amount, 0);
    const totalCreditPurchases = supPurchases
      .filter(p => p.payment_method !== 'CASH')
      .reduce((sum, p) => sum + p.total_amount, 0);
    const totalPayments = supPayments.reduce((sum, p) => sum + p.amount_paid, 0);
    const currentBalance = totalCreditPurchases - totalPayments; // only credit purchases increase what we owe, payments decrease it

    return {
      totalPurchases,
      totalCreditPurchases,
      totalPayments,
      currentBalance,
      purchasesCount: supPurchases.length,
      paymentsCount: supPayments.length
    };
  };

  // Filtered suppliers list
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchSearch =
        s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone.includes(searchQuery) ||
        s.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [suppliers, searchQuery]);

  // Submit new/edited Supplier
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) {
      onShowWarningAlert('الرجاء إدخال اسم المورد!');
      return;
    }

    const targetId = editingSupplier ? editingSupplier.id : `sup_${Date.now()}`;
    const newSup: Supplier = {
      id: targetId,
      supplier_name: supName,
      phone: supPhone,
      address: supAddress,
      notes: supNotes,
      created_at: editingSupplier ? editingSupplier.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbService.saveSupplier(newSup);
    onShowSuccessAlert(editingSupplier ? 'تم تعديل بيانات المورد بنجاح! 👑' : 'تم إضافة المورد الجديد بنجاح! 🎉');
    
    // reset form
    setSupName('');
    setSupPhone('');
    setSupAddress('');
    setSupNotes('');
    setShowAddSupplier(false);
    setEditingSupplier(null);
    loadData();
  };

  // Handle Recording a Purchase
  const handleRecordPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    if (purAmount <= 0) {
      onShowWarningAlert('الرجاء إدخال مبلغ صحيح للمشتريات!');
      return;
    }
    if (!purDetails.trim() && !customItemName.trim() && !selectedRawId) {
      onShowWarningAlert('الرجاء إدخال اسم الصنف المورد أو تفاصيل المشتريات!');
      return;
    }

    if (purPaymentMethod === 'CASH') {
      const drawer = dbService.getActiveDrawer();
      const currentDrawerBalance = drawer.opening_balance + drawer.cash_in - drawer.cash_out;
      if (purAmount > currentDrawerBalance) {
        onShowWarningAlert(`لا يمكن تسجيل المشتريات نقداً بقيمة (${purAmount} ج.م) لعدم كفاية الرصيد في الدرج (${currentDrawerBalance} ج.م).`);
        return;
      }
    }

    let finalDetails = purDetails.trim() || customItemName.trim();
    let finalRawId: string | undefined = undefined;
    let finalQty: number | undefined = undefined;
    let finalUnitCost: number | undefined = undefined;

    const trimmedName = customItemName.trim();
    if (trimmedName) {
      const purchaseQty = parseFloat(purQty as any) || 0;
      const calculatedUnitCost = purchaseQty > 0 ? purAmount / purchaseQty : 0;

      // Check if existing raw material matches typed name
      const existingRaw = rawMaterialsList.find(
        r => r.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingRaw) {
        finalRawId = existingRaw.id;
        finalQty = purchaseQty;
        finalUnitCost = calculatedUnitCost;

        const updatedRaw: RawMaterial = {
          ...existingRaw,
          current_quantity: existingRaw.current_quantity + purchaseQty,
          unit_cost: calculatedUnitCost > 0 ? calculatedUnitCost : existingRaw.unit_cost,
          total_cost: (existingRaw.current_quantity + purchaseQty) * (calculatedUnitCost > 0 ? calculatedUnitCost : existingRaw.unit_cost),
          updated_at: new Date().toISOString()
        };
        dbService.saveRawMaterial(updatedRaw);

        const rawDetailsStr = `[مخزون: ${existingRaw.name} + ${purchaseQty} ${itemUnit || existingRaw.unit}]`;
        if (!finalDetails.includes(existingRaw.name)) {
          finalDetails = `${rawDetailsStr} - ${finalDetails}`;
        }
      } else {
        // Create new raw material in inventory!
        const newRawId = `raw_${Date.now()}`;
        finalRawId = newRawId;
        finalQty = purchaseQty;
        finalUnitCost = calculatedUnitCost;

        const newRaw: RawMaterial = {
          id: newRawId,
          name: trimmedName,
          unit: itemUnit.trim() || 'كيلو',
          current_quantity: purchaseQty,
          add_quantity: 0,
          unit_cost: calculatedUnitCost,
          total_cost: purAmount,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        dbService.saveRawMaterial(newRaw);

        const rawDetailsStr = `[مادة جديدة: ${trimmedName} + ${purchaseQty} ${newRaw.unit}]`;
        if (!finalDetails.includes(trimmedName)) {
          finalDetails = `${rawDetailsStr} - ${finalDetails}`;
        }
      }
    } else if (selectedRawId) {
      const targetRaw = rawMaterialsList.find(r => r.id === selectedRawId);
      if (targetRaw) {
        const purchaseQty = parseFloat(purQty as any) || 0;
        const calculatedUnitCost = purchaseQty > 0 ? purAmount / purchaseQty : 0;
        finalRawId = selectedRawId;
        finalQty = purchaseQty;
        finalUnitCost = calculatedUnitCost;

        const updatedRaw: RawMaterial = {
          ...targetRaw,
          current_quantity: targetRaw.current_quantity + purchaseQty,
          unit_cost: calculatedUnitCost > 0 ? calculatedUnitCost : targetRaw.unit_cost,
          total_cost: (targetRaw.current_quantity + purchaseQty) * (calculatedUnitCost > 0 ? calculatedUnitCost : targetRaw.unit_cost),
          updated_at: new Date().toISOString()
        };
        dbService.saveRawMaterial(updatedRaw);

        const rawDetailsStr = `[ربط مخزون: ${targetRaw.name} + ${purchaseQty} ${targetRaw.unit}]`;
        finalDetails = finalDetails ? `${rawDetailsStr} - ${finalDetails}` : rawDetailsStr;
      }
    }

    const newPurchase: SupplierPurchase = {
      id: `pur_${Date.now()}`,
      supplier_id: selectedSupplier.id,
      date: new Date(purDate).toISOString(),
      item_details: finalDetails,
      total_amount: purAmount,
      notes: purNotes,
      created_at: new Date().toISOString(),
      raw_material_id: finalRawId,
      purchased_quantity: finalQty,
      unit_cost: finalUnitCost,
      payment_method: purPaymentMethod
    };

    dbService.saveSupplierPurchase(newPurchase);

    // If CASH purchase, deduct from the drawer immediately
    if (purPaymentMethod === 'CASH') {
      dbService.logCashMovement(0, purAmount, `مشتريات نقداً للمورد: ${selectedSupplier.supplier_name} - ${finalDetails}`);
    }

    onShowSuccessAlert(
      purPaymentMethod === 'CASH'
        ? 'تم تسجيل فاتورة التوريد نقداً وخصم قيمتها من درج النقدية وتحديث المخزون بنجاح! 💵'
        : 'تم تسجيل فاتورة التوريد بالآجل وإضافتها لحساب المورد وتحديث المخزون بنجاح! ⏳'
    );

    // Reset Form
    setCustomItemName('');
    setPurDetails('');
    setPurAmount(0);
    setPurNotes('');
    setPurDate(new Date().toISOString().substring(0, 16));
    setSelectedRawId('');
    setPurQty(0);
    setItemUnit('كيلو');
    setPurPaymentMethod('CREDIT');
    setShowAddPurchase(false);
    loadData();
  };

  // Handle Recording a Payment to Supplier
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    if (payAmount <= 0) {
      onShowWarningAlert('الرجاء إدخال قيمة الدفعة المسددة بشكل صحيح!');
      return;
    }

    const newPayment: SupplierPayment = {
      id: `pay_${Date.now()}`,
      supplier_id: selectedSupplier.id,
      date: new Date(payDate).toISOString(),
      amount_paid: payAmount,
      payment_method: payMethod,
      notes: payNotes,
      created_at: new Date().toISOString()
    };

    dbService.saveSupplierPayment(newPayment);
    onShowSuccessAlert('تم تسجيل الدفعة المسددة للمورد بنجاح وتحديث كشف الحساب! 💸');

    // Reset Form
    setPayAmount(0);
    setPayNotes('');
    setPayDate(new Date().toISOString().substring(0, 16));
    setPayMethod('CASH');
    setShowAddPayment(false);
    loadData();
  };

  // Handle Delete Supplier
  const handleDeleteSupplier = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المورد نهائياً؟ سيتم إزالة ملفه فقط ولكن قد تظل المعاملات مسجلة.')) {
      dbService.deleteSupplier(id);
      onShowSuccessAlert('تم حذف المورد بنجاح.');
      if (selectedSupplier && selectedSupplier.id === id) {
        setSelectedSupplier(null);
      }
      loadData();
    }
  };

  const handleSendWhatsAppStatement = async () => {
    if (!selectedSupplier) return;
    const stats = getSupplierStats(selectedSupplier.id);

    let message = `📋 *كشف حساب المورد: ${selectedSupplier.supplier_name}* 📋\n`;
    message += `📅 التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n`;
    message += `------------------------------------\n`;
    message += `🛒 إجمالي المسحوبات (المشتريات): *${stats.totalPurchases.toLocaleString()} ج.م*\n`;
    message += `💸 إجمالي الدفعات المسددة: *${stats.totalPayments.toLocaleString()} ج.م*\n`;
    message += `⚠️ الرصيد الحالي المستحق للمورد: *${stats.currentBalance.toLocaleString()} ج.م*\n`;
    message += `------------------------------------\n`;
    message += `نقدر شراكتنا معكم ونتمنى لكم دوام التوفيق! 🌹`;

    await shareElementAsImageToWhatsApp({
      elementId: 'supplier-ledger-container',
      fileName: `statement_${selectedSupplier.supplier_name.replace(/\s+/g, '_')}.png`,
      phone: selectedSupplier.phone,
      message,
      onStart: (msg) => onShowSuccessAlert(msg),
      onSuccess: (msg) => onShowSuccessAlert(msg),
      onError: (msg) => onShowWarningAlert(msg),
    });
  };

  // Supplier Statement Ledger Generation
  const supplierStatementLedger = useMemo(() => {
    if (!selectedSupplier) return [];
    
    const supPurchases = purchases.filter(p => p.supplier_id === selectedSupplier.id);
    const supPayments = payments.filter(p => p.supplier_id === selectedSupplier.id);

    // Combine transactions
    interface LedgerItem {
      id: string;
      type: 'PURCHASE' | 'PAYMENT';
      date: string;
      details: string;
      amount: number;
      notes?: string;
      isCash?: boolean;
    }

    const combined: LedgerItem[] = [
      ...supPurchases.map(p => ({
        id: p.id,
        type: 'PURCHASE' as const,
        date: p.date,
        details: p.payment_method === 'CASH' ? `[نقدي] ${p.item_details}` : p.item_details,
        amount: p.total_amount,
        notes: p.notes,
        isCash: p.payment_method === 'CASH'
      })),
      ...supPayments.map(pay => ({
        id: pay.id,
        type: 'PAYMENT' as const,
        date: pay.date,
        details: `دفعة مسددة للمورد (${pay.payment_method === 'CASH' ? 'نقدي' : pay.payment_method === 'VODAFONE_CASH' ? 'فودافون كاش' : pay.payment_method === 'INSTAPAY' ? 'إنستا باي' : 'تحويل بنكي'})`,
        amount: pay.amount_paid,
        notes: pay.notes
      }))
    ];

    // Sort by date ascending to calculate running balance
    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBal = 0;
    return combined.map(item => {
      if (item.type === 'PURCHASE') {
        if (!item.isCash) {
          runningBal += item.amount; // We owe more (only on Credit purchase)
        }
      } else {
        runningBal -= item.amount; // We owe less
      }
      return {
        ...item,
        runningBalance: runningBal
      };
    });
  }, [selectedSupplier, purchases, payments]);

  const overallStats = useMemo(() => {
    let totalPurchases = 0;
    let totalPayments = 0;
    let totalOwed = 0;
    const individualBalances = suppliers.map(s => {
      const stats = getSupplierStats(s.id);
      totalPurchases += stats.totalPurchases;
      totalPayments += stats.totalPayments;
      totalOwed += stats.currentBalance;
      return {
        supplier: s,
        ...stats
      };
    });

    return {
      totalPurchases,
      totalPayments,
      totalOwed,
      individualBalances
    };
  }, [suppliers, purchases, payments]);

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Module Title / Actions Banner */}
      <div className="bg-[#050505] border border-gold-500/10 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3.5 text-right w-full md:w-auto">
          <div className="w-12 h-12 bg-gold-600/10 border border-gold-600/20 rounded-2xl flex items-center justify-center text-gold-500">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">إدارة الموردين والمشتريات (Suppliers)</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">متابعة حسابات الموردين، كشوف الحسابات، فواتير التوريد، والمدفوعات الآجلة</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={() => {
              setEditingSupplier(null);
              setSupName('');
              setSupPhone('');
              setSupAddress('');
              setSupNotes('');
              setShowAddSupplier(true);
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-gold-600 to-amber-600 hover:from-gold-500 hover:to-amber-500 text-black text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-95 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            إضافة مورد جديد 🎉
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-gray-900 pb-px" dir="rtl">
        <button
          onClick={() => setActiveModuleTab('directory')}
          className={`px-5 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeModuleTab === 'directory'
              ? 'border-gold-500 text-gold-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>دليل ومعاملات الموردين 👥</span>
        </button>
        <button
          onClick={() => setActiveModuleTab('reports')}
          className={`px-5 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeModuleTab === 'reports'
              ? 'border-gold-500 text-gold-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>تقارير وإحصائيات الموردين 📊</span>
        </button>
      </div>

      {activeModuleTab === 'reports' ? (
        <div className="space-y-6 animate-fade-in" dir="rtl">
          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#050505] border border-gold-500/10 p-5 rounded-3xl text-right">
              <p className="text-[10px] text-gray-400 font-bold mb-1">إجمالي فواتير توريد ومشتريات الموردين</p>
              <h4 className="text-xl font-black text-white font-mono">{overallStats.totalPurchases.toLocaleString()} ج.م</h4>
            </div>
            <div className="bg-[#050505] border border-green-500/10 p-5 rounded-3xl text-right">
              <p className="text-[10px] text-green-400 font-bold mb-1">إجمالي المدفوعات والمسدد للموردين</p>
              <h4 className="text-xl font-black text-green-400 font-mono">{overallStats.totalPayments.toLocaleString()} ج.م</h4>
            </div>
            <div className="bg-[#050505] border border-red-500/10 p-5 rounded-3xl text-right">
              <p className="text-[10px] text-red-400 font-bold mb-1">إجمالي المديونية المتبقية للموردين (آجل)</p>
              <h4 className="text-xl font-black text-red-400 font-mono">{overallStats.totalOwed.toLocaleString()} ج.م</h4>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-[#050505] border border-gold-500/10 rounded-3xl p-5 shadow-xl text-right">
            <div className="flex justify-between items-center mb-4 border-b border-gray-900 pb-2">
              <span className="text-[10px] text-gray-400 font-bold">إجمالي الموردين المسجلين: {suppliers.length}</span>
              <h3 className="text-xs font-black text-white">تقرير أرصدة الموردين التفصيلي</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-gray-900 text-gray-400">
                    <th className="pb-3 pt-1">المورد</th>
                    <th className="pb-3 pt-1 font-bold">إجمالي فواتير التوريد</th>
                    <th className="pb-3 pt-1 font-bold">إجمالي المدفوعات</th>
                    <th className="pb-3 pt-1 font-bold">الرصيد المستحق (مديونية)</th>
                    <th className="pb-3 pt-1 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {overallStats.individualBalances.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 font-bold">
                        لا يوجد موردين مسجلين بعد لعرض التقرير.
                      </td>
                    </tr>
                  ) : (
                    overallStats.individualBalances.map(({ supplier, totalPurchases, totalPayments, currentBalance }) => (
                      <tr key={supplier.id} className="border-b border-gray-950 hover:bg-gray-950/40">
                        <td className="py-3">
                          <div className="font-bold text-white">{supplier.supplier_name}</div>
                          <div className="text-[10px] text-gray-500">{supplier.phone || 'بدون هاتف'}</div>
                        </td>
                        <td className="py-3 font-mono">{totalPurchases.toLocaleString()} ج.م</td>
                        <td className="py-3 font-mono text-green-400">{totalPayments.toLocaleString()} ج.م</td>
                        <td className="py-3 font-mono text-red-400 font-bold">{currentBalance.toLocaleString()} ج.م</td>
                        <td className="py-3">
                          {currentBalance > 0 ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-bold">مستحق دفع آجل ⚠️</span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-bold">خالص الحساب ✅</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Main Grid View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Suppliers List (4 Columns) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#050505] border border-gold-500/10 rounded-3xl p-4 shadow-lg space-y-4">
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث باسم المورد، الهاتف أو العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0c0c0c] border border-gray-900 text-white rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
              />
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
            </div>

            {/* List items container */}
            <div className="space-y-2.5 max-h-[450px] lg:max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center text-gray-500 border border-dashed border-gray-900 rounded-2xl">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  <p className="text-xs font-bold">لا يوجد موردين متطابقين حالياً</p>
                </div>
              ) : (
                filteredSuppliers.map(s => {
                  const stats = getSupplierStats(s.id);
                  const isSelected = selectedSupplier?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowStatement(false);
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-right flex justify-between items-center ${
                        isSelected
                          ? 'bg-[#1c150c]/50 border-gold-600 shadow-lg'
                          : 'bg-[#0a0a0a] border-gray-900 hover:border-gray-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-gold-600/10 border border-gold-500/20 text-gold-400 font-mono font-bold">
                            #{s.id.slice(-4)}
                          </span>
                          <h4 className="text-xs font-black text-white">{s.supplier_name}</h4>
                        </div>
                        <div className="flex items-center gap-3 justify-end text-[10px] text-gray-400">
                          {s.phone && (
                            <span className="flex items-center gap-1">
                              {s.phone} <Phone className="w-3 h-3 text-gold-600/50" />
                            </span>
                          )}
                          {s.address && (
                            <span className="flex items-center gap-1">
                              {s.address} <MapPin className="w-3 h-3 text-gold-600/50" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left space-y-1 shrink-0">
                        <p className="text-[10px] text-gray-400">المستحق له</p>
                        <p className={`text-xs font-black font-mono ${stats.currentBalance > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                          {stats.currentBalance.toLocaleString()} ج.م
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Right Side: Selected Supplier Profile & Statement Details (7 Columns) */}
        <div className="lg:col-span-7">
          {selectedSupplier ? (
            <div className="space-y-4">
              
              {/* Profile Card & Balance Quick Stats */}
              <div className="bg-[#050505] border border-gold-500/10 rounded-3xl p-5 shadow-lg space-y-5">
                
                {/* Header Profile */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-900 pb-4">
                  <div className="text-right space-y-1">
                    <h3 className="text-base font-black text-white flex items-center gap-2 justify-end">
                      <span>{selectedSupplier.supplier_name}</span>
                      <UserCheck className="w-5 h-5 text-gold-500 shrink-0" />
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-md">{selectedSupplier.notes || 'لا يوجد ملاحظات مسجلة للمورد'}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1 bg-[#0a0a0a] px-2.5 py-1 rounded-lg border border-gray-900">
                        <b>الهاتف:</b> {selectedSupplier.phone || '—'}
                      </span>
                      <span className="flex items-center gap-1 bg-[#0a0a0a] px-2.5 py-1 rounded-lg border border-gray-900">
                        <b>العنوان:</b> {selectedSupplier.address || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setEditingSupplier(selectedSupplier);
                        setSupName(selectedSupplier.supplier_name);
                        setSupPhone(selectedSupplier.phone);
                        setSupAddress(selectedSupplier.address);
                        setSupNotes(selectedSupplier.notes);
                        setShowAddSupplier(true);
                      }}
                      className="px-3 py-1.5 bg-[#0c0c0c] border border-gray-800 text-gray-300 hover:text-white hover:border-gold-500/50 text-[10px] font-bold rounded-lg cursor-pointer transition-all shrink-0"
                    >
                      تعديل الحساب ⚙️
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(selectedSupplier.id)}
                      className="px-3 py-1.5 bg-[#1c150c] border border-red-950 text-red-400 hover:bg-red-950/20 text-[10px] font-bold rounded-lg cursor-pointer transition-all shrink-0"
                    >
                      حذف نهائي 🗑️
                    </button>
                  </div>
                </div>

                {/* Balance Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Total Purchases */}
                  <div className="bg-[#0a0a0a] border border-gray-900 rounded-2xl p-4 text-center relative overflow-hidden">
                    <span className="text-[10px] text-gray-400 block mb-1">إجمالي فواتير التوريد (+)</span>
                    <span className="text-lg font-black font-mono text-white">
                      {getSupplierStats(selectedSupplier.id).totalPurchases.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-1 font-semibold">
                      {getSupplierStats(selectedSupplier.id).purchasesCount} فواتير توريد
                    </span>
                  </div>

                  {/* Total Paid */}
                  <div className="bg-[#0a0a0a] border border-gray-900 rounded-2xl p-4 text-center relative overflow-hidden">
                    <span className="text-[10px] text-gray-400 block mb-1">إجمالي المدفوعات للمورد (-)</span>
                    <span className="text-lg font-black font-mono text-green-500">
                      {getSupplierStats(selectedSupplier.id).totalPayments.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-1 font-semibold">
                      {getSupplierStats(selectedSupplier.id).paymentsCount} دفعات مسددة
                    </span>
                  </div>

                  {/* Balance */}
                  <div className="bg-[#1c150c]/30 border border-amber-600/20 rounded-2xl p-4 text-center relative overflow-hidden">
                    <span className="text-[10px] text-amber-400 block mb-1">الرصيد التراكمي المتبقي</span>
                    <span className={`text-xl font-black font-mono ${getSupplierStats(selectedSupplier.id).currentBalance > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                      {getSupplierStats(selectedSupplier.id).currentBalance.toLocaleString()} ج.م
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-1 font-semibold">
                      {getSupplierStats(selectedSupplier.id).currentBalance > 0 ? 'مستحق الدفع للمورد' : 'حساب متوازن'}
                    </span>
                  </div>
                </div>

                {/* Operations bar */}
                <div className="flex flex-wrap gap-2.5 justify-end">
                  <button
                    onClick={() => {
                      setPurAmount(0);
                      setPurDetails('');
                      setPurNotes('');
                      setPurDate(new Date().toISOString().substring(0, 16));
                      setShowAddPurchase(true);
                    }}
                    className="px-4 py-2 bg-[#0c0c0c] border border-gray-800 hover:border-gold-600 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-gold-500" />
                    تسجيل فاتورة توريد (+)
                  </button>

                  <button
                    onClick={() => {
                      setPayAmount(0);
                      setPayNotes('');
                      setPayDate(new Date().toISOString().substring(0, 16));
                      setPayMethod('CASH');
                      setShowAddPayment(true);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-green-700 to-emerald-700 hover:from-green-600 hover:to-emerald-600 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow"
                  >
                    <Coins className="w-3.5 h-3.5 text-white" />
                    تسجيل دفعة مسددة للمورد (-)
                  </button>

                  <button
                    onClick={() => setShowStatement(!showStatement)}
                    className="px-4 py-2 bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-750 hover:to-zinc-850 rounded-xl text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer shadow"
                  >
                    <FileText className="w-3.5 h-3.5 text-gold-500" />
                    {showStatement ? 'إخفاء كشف الحساب ❌' : 'عرض كشف حساب المورد 📋'}
                  </button>
                </div>

              </div>

              {/* Transactions Ledger Panel (Supplier Statement) */}
              {showStatement && (
                <div id="supplier-ledger-container" className="bg-[#050505] border border-gold-500/10 rounded-3xl p-5 shadow-lg space-y-4">
                  {/* Print Statement Header with Official Logo */}
                  <div className="flex flex-col items-center justify-center text-center pb-3 border-b border-gray-800">
                    <EldeebLogoHeader className="h-16 mb-2" />
                    <span className="text-xs text-gray-400 font-semibold">كشف حساب المورد المسجل: {selectedSupplier.name}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                    <div className="flex gap-2" data-html2canvas-ignore="true">
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1.5 bg-[#0a0a0a] border border-gray-800 hover:border-gold-600 rounded-lg text-[10px] font-bold text-gray-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3 h-3 text-gold-500" />
                        طباعة كشف الحساب 🖨️
                      </button>
                      <button
                        onClick={handleSendWhatsAppStatement}
                        className="px-3 py-1.5 bg-emerald-950/20 border border-emerald-900/30 hover:border-emerald-500 rounded-lg text-[10px] font-bold text-emerald-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3 h-3 text-emerald-500" />
                        إرسال عبر واتساب 📱
                      </button>
                    </div>
                    
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5 justify-end">
                      <span>كشف حساب المورد والمسحوبات</span>
                      <History className="w-4.5 h-4.5 text-gold-500" />
                    </h4>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-gray-900">
                    <table className="w-full text-right text-xs leading-normal">
                      <thead>
                        <tr className="bg-[#0a0a0a] text-gray-400 text-[10px] font-bold border-b border-gray-900">
                          <th className="p-3">التاريخ والوقت</th>
                          <th className="p-3">نوع الحركة</th>
                          <th className="p-3">تفاصيل المعاملة</th>
                          <th className="p-3 text-center">القيمة</th>
                          <th className="p-3 text-left">الرصيد التراكمي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-900/60 font-medium">
                        {supplierStatementLedger.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-gray-600">
                              لا يوجد معاملات مسجلة في كشف حساب المورد بعد.
                            </td>
                          </tr>
                        ) : (
                          supplierStatementLedger.map((item, index) => (
                            <tr key={index} className="hover:bg-[#070707]">
                              <td className="p-3 text-gray-400 font-mono text-[10px]">
                                {new Date(item.date).toLocaleString('ar-EG')}
                              </td>
                              <td className="p-3">
                                {item.type === 'PURCHASE' ? (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-bold">
                                    فاتورة توريد (+)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-500 text-[9px] font-bold">
                                    دفعة مسددة (-)
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-white max-w-xs truncate" title={item.details}>
                                {item.details}
                                {item.notes && <span className="block text-[9px] text-gray-500 mt-0.5">ملاحظة: {item.notes}</span>}
                              </td>
                              <td className={`p-3 text-center font-bold font-mono ${item.type === 'PURCHASE' ? 'text-amber-500' : 'text-green-500'}`}>
                                {item.type === 'PURCHASE' ? '+' : '-'}{item.amount.toLocaleString()} ج.م
                              </td>
                              <td className="p-3 text-left font-black font-mono text-white">
                                {item.runningBalance.toLocaleString()} ج.م
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 bg-[#0a0a0a] border border-gray-950 rounded-2xl flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">صافي المديونية المتبقية للمورد حالياً:</span>
                    <span className={`font-mono font-black text-sm ${getSupplierStats(selectedSupplier.id).currentBalance > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                      {getSupplierStats(selectedSupplier.id).currentBalance.toLocaleString()} ج.م
                    </span>
                  </div>

                </div>
              )}

            </div>
          ) : (
            <div className="h-96 bg-[#050505] border border-gold-500/10 rounded-3xl p-12 flex flex-col justify-center items-center text-center shadow-lg">
              <div className="w-16 h-16 rounded-full bg-gold-600/5 border border-gold-600/15 flex items-center justify-center text-gold-500/40 mb-4 animate-bounce">
                <Briefcase className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-gray-400">الرجاء اختيار مورد من القائمة الجانبية لعرض بياناته وكشف حسابه بالتفصيل.</p>
              <p className="text-[11px] text-gray-600 mt-1 max-w-xs">يمكنك أيضاً إضافة مورد جديد أو تسجيل فواتير سحب/شراء وتدقيق الحسابات المتبادلة.</p>
            </div>
          )}
        </div>

      </div>
      )}

      {/* ==================================================
          MODAL: Add / Edit Supplier
          ================================================== */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-luxury-card border border-gold-600/30 rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl relative animate-fade-in text-right max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            <button
              onClick={() => setShowAddSupplier(false)}
              className="absolute left-4 top-4 p-1 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-gray-400 hover:text-white rounded-lg cursor-pointer z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-white mb-4 border-b border-gray-900 pb-2 flex items-center gap-2 justify-end">
              <span>{editingSupplier ? 'تعديل بيانات المورد ⚙️' : 'إضافة مورد جديد للنظام 🎉'}</span>
              <Briefcase className="w-4 h-4 text-gold-500" />
            </h3>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">اسم المورد أو الشركة الموردة *</label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-semibold"
                  placeholder="مثال: شركة النجم للمواد الغذائية"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-gray-400 font-bold block">رقم الهاتف</label>
                    <ContactPickerButton
                      currentName={supName}
                      onSelect={({ phone, name }) => {
                        setSupPhone(phone);
                        if (name && !supName.trim()) {
                          setSupName(name);
                        }
                      }}
                      buttonText="سجل الأسماء"
                    />
                  </div>
                  <input
                    type="text"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono"
                    placeholder="01xxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">العنوان أو المقر</label>
                  <input
                    type="text"
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                    placeholder="مثال: القاهرة، مدينة نصر"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات وحسابات خاصة</label>
                <textarea
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right min-h-16"
                  placeholder="مواعيد التوريد، شروط الدفع، خصومات خاصة..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 sticky bottom-0 bg-luxury-card border-t border-gray-900/80 mt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowAddSupplier(false)}
                  className="py-2.5 bg-luxury-bg border border-gray-900 hover:bg-gray-950 text-gray-400 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-gold-600 to-amber-600 text-black font-black text-xs rounded-xl cursor-pointer shadow-lg hover:from-gold-500 hover:to-amber-500"
                >
                  حفظ الحساب 💾
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          MODAL: Record Purchase
          ================================================== */}
      {showAddPurchase && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-luxury-card border border-gold-600/30 rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl relative animate-fade-in text-right max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            <button
              onClick={() => setShowAddPurchase(false)}
              className="absolute left-4 top-4 p-1 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-gray-400 hover:text-white rounded-lg cursor-pointer z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-white mb-4 border-b border-gray-900 pb-2 flex items-center gap-2 justify-end">
              <span>تسجيل فاتورة توريد / مشتريات (+)</span>
              <PlusCircle className="w-4 h-4 text-gold-500" />
            </h3>

            <p className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl mb-4 leading-relaxed font-semibold">
              * تقوم فاتورة التوريد بزيادة رصيد مديونية المورد، أي أنك أخذت منه بضاعة ولم تدفع كلياً أو مسجل كمديونية على الكافيه.
            </p>

            <form onSubmit={handleRecordPurchase} className="space-y-4 font-medium">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">اسم الصنف أو المادة الخام الموردة (كتابة حرة يدوياً) *</label>
                <input
                  type="text"
                  list="raw-materials-options"
                  value={customItemName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomItemName(val);
                    if (!purDetails || purDetails.startsWith('توريد:')) {
                      setPurDetails(val ? `توريد: ${val}` : '');
                    }
                  }}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-bold"
                  placeholder="اكتب اسم المادة أو الصنف (مثال: شاي، بن برازيلي، سكر، لبن مراعي...)"
                />
                <datalist id="raw-materials-options">
                  {rawMaterialsList.map(raw => (
                    <option key={raw.id} value={raw.name}>
                      {raw.name} (رصيد حالي: {raw.current_quantity} {raw.unit})
                    </option>
                  ))}
                </datalist>
              </div>

              {customItemName.trim() && (
                <div className="bg-gold-500/5 border border-gold-500/10 p-3 rounded-xl space-y-2">
                  <span className="text-[10px] text-gold-500 font-bold block">بيانات كمية المخزون ووحدة القياس:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-1">الكمية الموردة *</label>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={purQty || ''}
                        onChange={(e) => setPurQty(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono font-bold"
                        placeholder="الكمية"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-1">وحدة القياس</label>
                      <input
                        type="text"
                        list="unit-options"
                        value={itemUnit}
                        onChange={(e) => setItemUnit(e.target.value)}
                        className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                        placeholder="كيلو / جرام / علبة"
                      />
                      <datalist id="unit-options">
                        <option value="كيلو" />
                        <option value="جرام" />
                        <option value="علبة" />
                        <option value="كرتونة" />
                        <option value="لتر" />
                        <option value="قطعة" />
                        <option value="زجاجة" />
                        <option value="كيس" />
                      </datalist>
                    </div>
                  </div>

                  {purQty > 0 && purAmount > 0 && (
                    <div className="text-[10px] text-gray-400 flex justify-between font-bold pt-1">
                      <span>سعر تكلفة الوحدة المقدر:</span>
                      <span className="text-gold-500 font-mono">{(purAmount / purQty).toFixed(2)} EGP / {itemUnit || 'وحدة'}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">بيان البضاعة والمكونات الموردة *</label>
                <textarea
                  required
                  value={purDetails}
                  onChange={(e) => setPurDetails(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right min-h-16"
                  placeholder="مثال: توريد 20 كيلو قهوة اسبريسو + 5 كراتين لبن مراعي"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">إجمالي الفاتورة (EGP) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={purAmount || ''}
                    onChange={(e) => setPurAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono font-bold"
                    placeholder="قيمة المشتريات"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">تاريخ ووقت الحركة</label>
                  <input
                    type="datetime-local"
                    required
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-[10px] focus:outline-none focus:border-gold-600 text-center font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">طريقة السداد / الدفع *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPurPaymentMethod('CREDIT')}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      purPaymentMethod === 'CREDIT'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-400 font-extrabold'
                        : 'bg-[#070707] border-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    ⏳ آجل (على الحساب)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurPaymentMethod('CASH')}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      purPaymentMethod === 'CASH'
                        ? 'bg-green-600/20 border-green-500 text-green-400 font-extrabold'
                        : 'bg-[#070707] border-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    💵 نقدي (من درج الكاش)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={purNotes}
                  onChange={(e) => setPurNotes(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                  placeholder="مثال: الدفع آجل نهاية الشهر أو رقم سند خارجي"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 sticky bottom-0 bg-luxury-card border-t border-gray-900/80 mt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowAddPurchase(false)}
                  className="py-2.5 bg-luxury-bg border border-gray-900 hover:bg-gray-950 text-gray-400 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-gold-600 to-amber-600 text-black font-black text-xs rounded-xl cursor-pointer shadow-lg hover:from-gold-500 hover:to-amber-500"
                >
                  حفظ الفاتورة 💾
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          MODAL: Record Payment
          ================================================== */}
      {showAddPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-luxury-card border border-gold-600/30 rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl relative animate-fade-in text-right max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            <button
              onClick={() => setShowAddPayment(false)}
              className="absolute left-4 top-4 p-1 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-gray-400 hover:text-white rounded-lg cursor-pointer z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-white mb-4 border-b border-gray-900 pb-2 flex items-center gap-2 justify-end">
              <span>تسجيل دفعة مسددة للمورد (-)</span>
              <Coins className="w-4 h-4 text-green-500" />
            </h3>

            <p className="text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 p-2.5 rounded-xl mb-4 leading-relaxed font-semibold">
              * الدفعة المسددة هي مبلغ مالي دفعته للمورد من الخزينة لإنقاص قيمة المديونية المستحقة له.
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-4 font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">المبلغ المسدد (EGP) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={payAmount || ''}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono font-bold text-green-500"
                    placeholder="القيمة المدفوعة"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">وسيلة الدفع والسداد</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer font-bold"
                  >
                    <option value="CASH">💵 نقد من الخزينة</option>
                    <option value="VODAFONE_CASH">📱 فودافون كاش</option>
                    <option value="INSTAPAY">⚡ إنستا باي InstaPay</option>
                    <option value="BANK">🏛️ تحويل بنكي مباشر</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">تاريخ الحركة والسداد</label>
                <input
                  type="datetime-local"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-[10px] focus:outline-none focus:border-gold-600 text-center font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات السداد</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-[#070707] border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                  placeholder="اسم الشخص المستلم، رقم الحوالة، أو أي تفاصيل..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 sticky bottom-0 bg-luxury-card border-t border-gray-900/80 mt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowAddPayment(false)}
                  className="py-2.5 bg-luxury-bg border border-gray-900 hover:bg-gray-950 text-gray-400 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-green-700 to-emerald-700 hover:from-green-600 hover:to-emerald-600 text-white font-black text-xs rounded-xl cursor-pointer shadow-lg"
                >
                  حفظ وتأكيد الدفع 💾
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

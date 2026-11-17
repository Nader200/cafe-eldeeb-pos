/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ContactPickerButton } from './ContactPickerButton';
import {
  Users,
  DollarSign,
  PlusCircle,
  FileText,
  Calendar,
  XCircle,
  TrendingDown,
  Sparkles,
  Trash2,
  UserPlus,
  Edit,
  Phone,
  Briefcase,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  History,
  Key,
  ShieldCheck
} from 'lucide-react';
import { dbService } from '../dbService';
import { Employee, EmployeeTransaction, Product, Category, AuthUser, AuthAuditLog, UserRole } from '../types';

interface EmployeesViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

const getLocalDateStr = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRelativeLocalDateStr = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return getLocalDateStr(d);
};

export default function EmployeesView({ onShowSuccessAlert, onShowWarningAlert }: EmployeesViewProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<EmployeeTransaction[]>([]);
  
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [authAuditLogs, setAuthAuditLogs] = useState<AuthAuditLog[]>([]);
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Modals and tabs
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'transactions' | 'auth_users' | 'auth_audit'>('employees');
  const [showEmpModal, setShowEmpModal] = useState<boolean>(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  
  // Employee form state
  const [empName, setEmpName] = useState<string>('');
  const [empPhone, setEmpPhone] = useState<string>('');
  const [empRole, setEmpRole] = useState<string>('صانع قهوة / باريستا');
  const [empWage, setEmpWage] = useState<number>(150);
  const [empPhoto, setEmpPhoto] = useState<string>('');

  // Transaction form state
  const [showTxModal, setShowTxModal] = useState<boolean>(false);
  const [txEmployeeId, setTxEmployeeId] = useState<string>('');
  const [txType, setTxType] = useState<EmployeeTransaction['type']>('ENTITLEMENT');
  const [txAmount, setTxAmount] = useState<number>(100);
  const [txNotes, setTxNotes] = useState<string>('');
  const [txDate, setTxDate] = useState<string>(() => getLocalDateStr());
  const [deductFromDrawer, setDeductFromDrawer] = useState<boolean>(true);

  // Daily Settlement Modal State
  const [showSettlementModal, setShowSettlementModal] = useState<boolean>(false);
  const [settleEmployee, setSettleEmployee] = useState<Employee | null>(null);
  const [settleDate, setSettleDate] = useState<string>(() => getLocalDateStr());
  const [includeDailyWage, setIncludeDailyWage] = useState<boolean>(true);
  const [settlePayAmount, setSettlePayAmount] = useState<number>(0);
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [settleDeductDrawer, setSettleDeductDrawer] = useState<boolean>(true);
  const [carryOverRemaining, setCarryOverRemaining] = useState<boolean>(true);

  // Employee Statement & Safe Delete Modal State
  const [statementEmployee, setStatementEmployee] = useState<Employee | null>(null);
  const [txToDelete, setTxToDelete] = useState<EmployeeTransaction | null>(null);
  const [reverseExpenseOnDelete, setReverseExpenseOnDelete] = useState<boolean>(true);

  // Archive Filters
  const [archiveEmployeeFilter, setArchiveEmployeeFilter] = useState<string>('ALL');
  const [archiveTypeFilter, setArchiveTypeFilter] = useState<string>('ALL');

  // Employee consumption modal states
  const [showConsumptionModal, setShowConsumptionModal] = useState<boolean>(false);
  const [selectedEmpForCons, setSelectedEmpForCons] = useState<Employee | null>(null);
  const [consDate, setConsDate] = useState<string>(() => getLocalDateStr());
  const [consumptionCart, setConsumptionCart] = useState<{ product: Product; quantity: number; unitPrice: number }[]>([]);
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Auth User management modal & state
  const [showAuthUserModal, setShowAuthUserModal] = useState<boolean>(false);
  const [editingAuthUser, setEditingAuthUser] = useState<AuthUser | null>(null);
  const [authUserName, setAuthUserName] = useState<string>('');
  const [authUserUsername, setAuthUserUsername] = useState<string>('');
  const [authUserPassword, setAuthUserPassword] = useState<string>('');
  const [authUserRole, setAuthUserRole] = useState<UserRole>('Admin');
  const [auditActionFilter, setAuditActionFilter] = useState<'ALL' | 'LOGIN' | 'LOGOUT'>('ALL');

  const handleOpenAddAuthUser = () => {
    setEditingAuthUser(null);
    setAuthUserName('');
    setAuthUserUsername('');
    setAuthUserPassword('');
    setAuthUserRole('Admin');
    setShowAuthUserModal(true);
  };

  const handleOpenEditAuthUser = (user: AuthUser) => {
    setEditingAuthUser(user);
    setAuthUserName(user.name);
    setAuthUserUsername(user.username);
    setAuthUserPassword(user.passwordHash);
    setAuthUserRole(user.role);
    setShowAuthUserModal(true);
  };

  const handleSaveAuthUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUserName.trim() || !authUserUsername.trim() || !authUserPassword.trim()) {
      onShowWarningAlert('يرجى كتابة الاسم، اسم المستخدم، وكلمة المرور بكل دقة.');
      return;
    }

    const cleanUsername = authUserUsername.trim().toLowerCase();
    
    // Check for duplicate username if creating new user
    if (!editingAuthUser) {
      const existing = authUsers.find(u => u.username.toLowerCase() === cleanUsername);
      if (existing) {
        onShowWarningAlert(`اسم المستخدم (${cleanUsername}) مسجل بالفعل لموظف آخر! اختر اسم مستخدم جديد.`);
        return;
      }
    }

    const userToSave: AuthUser = {
      id: editingAuthUser ? editingAuthUser.id : `auth_usr_${Date.now()}`,
      name: authUserName.trim(),
      username: cleanUsername,
      role: authUserRole,
      passwordHash: authUserPassword.trim(),
      phone: editingAuthUser?.phone || '',
      is_active: editingAuthUser ? editingAuthUser.is_active : true,
      created_at: editingAuthUser?.created_at || new Date().toISOString(),
      last_login_at: editingAuthUser?.last_login_at
    };

    dbService.saveAuthUser(userToSave);
    setShowAuthUserModal(false);
    onShowSuccessAlert(`تم حفظ حساب الموظف (${userToSave.name}) بصلاحية (مدير النظام 👑) بنجاح!`);
    loadData();
  };

  const handleToggleUserRole = (user: AuthUser) => {
    const updatedUser: AuthUser = { ...user, role: 'Admin' };
    dbService.saveAuthUser(updatedUser);
    onShowSuccessAlert(`حساب الموظف (${user.name}) بصلاحية 👑 مدير النظام (Admin).`);
    loadData();
  };

  const handleToggleUserActive = (user: AuthUser) => {
    const updatedUser: AuthUser = { ...user, is_active: !user.is_active };
    dbService.saveAuthUser(updatedUser);
    onShowSuccessAlert(`تم ${updatedUser.is_active ? 'تفعيل' : 'إيقاف'} حساب دخول الموظف (${user.name}) بنجاح.`);
    loadData();
  };

  const handleDeleteAuthUser = (user: AuthUser) => {
    if (user.username === 'admin') {
      onShowWarningAlert('عذراً، لا يمكن حذف حساب المدير الرئيسي للنظام (Admin).');
      return;
    }
    if (confirm(`هل أنت أصلًا متأكد من إزالة حساب دخول الموظف (${user.name})؟`)) {
      dbService.deleteAuthUser(user.id);
      onShowSuccessAlert(`تم حذف حساب الدخول للموظف (${user.name}) بنجاح.`);
      loadData();
    }
  };

  const handleClearAuditLogs = () => {
    if (confirm('هل أنت أصلًا متأكد من تفريغ سجلات مراقبة وتسجيلات الدخول والخروج؟')) {
      dbService.clearAuthAuditLogs();
      onShowSuccessAlert('تم مسح جميع سجلات المراقبة الإلكترونية بنجاح.');
      loadData();
    }
  };

  const allProducts = useMemo(() => {
    return dbService.getProducts().filter(p => !p.is_raw_material);
  }, [showConsumptionModal]);

  const allCategories = useMemo(() => {
    return dbService.getCategories();
  }, [showConsumptionModal]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter(p => {
      const matchSearch = p.name_ar.toLowerCase().includes(productSearch.toLowerCase()) || (p.name_en && p.name_en.toLowerCase().includes(productSearch.toLowerCase()));
      const matchCategory = selectedCategory === 'ALL' || p.category_id === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [allProducts, productSearch, selectedCategory]);

  const handleOpenEmployeeConsumption = (emp: Employee) => {
    setSelectedEmpForCons(emp);
    setConsDate(getLocalDateStr());
    setConsumptionCart([]);
    setProductSearch('');
    setSelectedCategory('ALL');
    setShowConsumptionModal(true);
  };

  const handleAddToConsumptionCart = (product: Product) => {
    setConsumptionCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1, unitPrice: Number(product.selling_price) || 0 }];
    });
  };

  const handleUpdateConsumptionQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setConsumptionCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    setConsumptionCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity } : item));
  };

  const handleUpdateConsumptionPrice = (productId: string, newPrice: number) => {
    const safePrice = isNaN(newPrice) || newPrice < 0 ? 0 : newPrice;
    setConsumptionCart(prev =>
      prev.map(item => item.product.id === productId ? { ...item, unitPrice: safePrice } : item)
    );
  };

  const handleRemoveFromConsumptionCart = (productId: string) => {
    setConsumptionCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleSaveEmployeeConsumption = () => {
    if (!selectedEmpForCons) return;
    if (consumptionCart.length === 0) {
      onShowWarningAlert('يرجى اختيار منتج واحد على الأقل!');
      return;
    }

    const settings = dbService.getSettings();
    const policy = settings.employee_consumption_policy || 'DEDUCT';

    for (const item of consumptionCart) {
      if (item.unitPrice < 0 || isNaN(item.unitPrice)) {
        onShowWarningAlert(`يرجى إدخال سعر صحيح للمنتج "${item.product.name_ar}"!`);
        return;
      }
      if (item.product.current_stock < item.quantity) {
        onShowWarningAlert(`الكمية المطلوبة من "${item.product.name_ar}" (${item.quantity}) غير متوفرة بالكامل بالمخزن (المتاح: ${item.product.current_stock})!`);
        return;
      }
    }

    try {
      dbService.recordEmployeeConsumption(
        selectedEmpForCons.id,
        selectedEmpForCons.name,
        consumptionCart,
        policy,
        settings.owner_name || 'مدير النظام',
        consDate || getLocalDateStr()
      );

      onShowSuccessAlert(`تم تسجيل استهلاك المنتجات للموظف "${selectedEmpForCons.name}" بتاريخ ${consDate || getLocalDateStr()} بنجاح وتحديث المخزن!`);
      setShowConsumptionModal(false);
      loadData();
    } catch (error: any) {
      onShowWarningAlert(error.message || 'حدث خطأ أثناء تسجيل الاستهلاك.');
    }
  };

  const loadData = () => {
    setEmployees(dbService.getEmployees());
    setTransactions(dbService.getEmployeeTransactions().reverse()); // Newest first
    setAuthUsers(dbService.getAuthUsers());
    setAuthAuditLogs(dbService.getAuthAuditLogs().reverse()); // Newest logs first
  };

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

  const handleOpenAddModal = () => {
    setEditingEmp(null);
    setEmpName('');
    setEmpPhone('');
    setEmpRole('صانع قهوة / باريستا');
    setEmpWage(150);
    setEmpPhoto('');
    setShowEmpModal(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpName(emp.name);
    setEmpPhone(emp.phone);
    setEmpRole(emp.role);
    setEmpWage(emp.daily_wage);
    setEmpPhoto(emp.photo || '');
    setShowEmpModal(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      onShowWarningAlert('يرجى إدخال اسم الموظف!');
      return;
    }

    const empData: Employee = {
      id: editingEmp ? editingEmp.id : `emp_${Date.now()}`,
      name: empName.trim(),
      phone: empPhone.trim(),
      role: empRole.trim(),
      daily_wage: empWage,
      created_at: editingEmp ? editingEmp.created_at : new Date().toISOString(),
      photo: empPhoto
    };

    dbService.saveEmployee(empData);
    onShowSuccessAlert(editingEmp ? `تم تعديل بيانات الموظف "${empName}" بنجاح!` : `تم إضافة الموظف الجديد "${empName}" بنجاح!`);
    setShowEmpModal(false);
    loadData();
  };

  const handleDeleteEmployee = (id: string, name: string) => {
    if (confirm(`⚠️ هل أنت متأكد من حذف الموظف "${name}" نهائياً من النظام؟ لا يمكن التراجع!`)) {
      dbService.deleteEmployee(id);
      onShowSuccessAlert(`تم حذف الموظف "${name}" نهائياً.`);
      loadData();
    }
  };

  const handleOpenTxModal = (empId = '', type: EmployeeTransaction['type'] = 'ENTITLEMENT') => {
    const selectedEmp = dbService.getEmployees().find(e => e.id === empId);
    setTxEmployeeId(empId);
    setTxType(type);
    setTxAmount(type === 'ENTITLEMENT' && selectedEmp ? selectedEmp.daily_wage : 100);
    setTxNotes('');
    setTxDate(getLocalDateStr());
    setDeductFromDrawer(type === 'WAGE_PAYMENT' || type === 'LOAN');
    setShowTxModal(true);
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txEmployeeId) {
      onShowWarningAlert('يرجى اختيار الموظف!');
      return;
    }
    if (txAmount <= 0) {
      onShowWarningAlert('يرجى إدخال قيمة صحيحة أكبر من الصفر!');
      return;
    }

    const selectedEmp = employees.find(e => e.id === txEmployeeId);
    if (!selectedEmp) return;

    // Check cash in drawer if deducting
    if (deductFromDrawer && (txType === 'WAGE_PAYMENT' || txType === 'LOAN')) {
      const drawer = dbService.getActiveDrawer();
      const currentDrawerBalance = drawer.opening_balance + drawer.cash_in - drawer.cash_out;
      if (txAmount > currentDrawerBalance) {
        onShowWarningAlert(`لا يمكن صرف المبلغ كاش لعدم كفاية الرصيد في الدرج حالياً (${currentDrawerBalance} ج.م)`);
        return;
      }
    }

    let linkedExpenseId: string | undefined;
    // If it's a paid wage or loan, and we requested deducting from cash drawer
    if (deductFromDrawer && (txType === 'WAGE_PAYMENT' || txType === 'LOAN')) {
      const expCategory = txType === 'WAGE_PAYMENT' ? 'Salaries' : 'Miscellaneous';
      const desc = `${txType === 'WAGE_PAYMENT' ? 'يومية منصرفة للموظف' : 'سلفة نقدية للموظف'}: ${selectedEmp.name} (${txNotes || 'دون ملاحظات'})`;
      const savedExp = dbService.saveExpense(expCategory, desc, txAmount);
      linkedExpenseId = savedExp.id;
    }

    const effectiveDate = txDate || getLocalDateStr();
    const txData: EmployeeTransaction = {
      id: `emp_tx_${Date.now()}`,
      employee_id: txEmployeeId,
      employee_name: selectedEmp.name,
      type: txType,
      amount: txAmount,
      notes: txNotes.trim() || getDefaultNotes(txType, selectedEmp.daily_wage),
      date: effectiveDate,
      created_at: new Date().toISOString(),
      ...(linkedExpenseId ? { expense_id: linkedExpenseId } : {})
    };

    dbService.addEmployeeTransaction(txData);

    onShowSuccessAlert('تم تسجيل المعاملة المالية وحساب رصيد الموظف بنجاح!');
    setShowTxModal(false);
    loadData();
  };

  const requestDeleteTransaction = (tx: EmployeeTransaction) => {
    const linkedExp = dbService.findLinkedExpenseForEmployeeTx(tx);
    setReverseExpenseOnDelete(Boolean(linkedExp));
    setTxToDelete(tx);
  };

  const confirmDeleteTransaction = () => {
    if (!txToDelete) return;
    const { reversedExpense } = dbService.deleteEmployeeTransaction(txToDelete.id, reverseExpenseOnDelete);
    if (reversedExpense) {
      onShowSuccessAlert(`تم التراجع عن الحركة (${txToDelete.amount} ج.م) وتعديل رصيد "${txToDelete.employee_name}" وإرجاع المبلغ لدرج النقدية بنجاح.`);
    } else {
      onShowSuccessAlert(`تم حذف المعاملة المالية (${txToDelete.amount} ج.م) وتعديل رصيد "${txToDelete.employee_name}" بنجاح.`);
    }
    setTxToDelete(null);
    loadData();
  };

  const handleOpenSettlementModal = (emp: Employee) => {
    const todayStr = getLocalDateStr();
    const hasEntitlementToday = transactions.some(
      t => t.employee_id === emp.id && t.date === todayStr && t.type === 'ENTITLEMENT'
    );
    setSettleEmployee(emp);
    setSettleDate(todayStr);
    setIncludeDailyWage(!hasEntitlementToday);
    setCarryOverRemaining(true);
    setSettleNotes('');
    setSettleDeductDrawer(true);
    setShowSettlementModal(true);
  };

  const handleChangeSettleDate = (nextDate: string) => {
    setSettleDate(nextDate);
    if (settleEmployee) {
      const hasEntitlementForDate = transactions.some(
        t => t.employee_id === settleEmployee.id && t.date === nextDate && t.type === 'ENTITLEMENT'
      );
      setIncludeDailyWage(!hasEntitlementForDate);
    }
  };

  const handleSaveSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleEmployee) return;

    const effectiveDate = settleDate || getLocalDateStr();

    if (!includeDailyWage && settlePayAmount <= 0 && carryOverRemaining) {
      onShowWarningAlert('لم يتم تحديد إضافة يومية جديدة ولا صرف مبلغ كاش. اختر إضافة اليومية أو أدخل مبلغ الصرف للحفظ.');
      return;
    }

    if (settleDeductDrawer && settlePayAmount > 0) {
      const drawer = dbService.getActiveDrawer();
      const currentDrawerBalance = drawer.opening_balance + drawer.cash_in - drawer.cash_out;
      if (settlePayAmount > currentDrawerBalance) {
        onShowWarningAlert(`لا يمكن صرف مبلغ التسوية كاش لعدم كفاية الرصيد في الدرج حالياً (${currentDrawerBalance} ج.م)`);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const remainingDifference = Number((settlementBreakdown.rawNet - settlePayAmount).toFixed(2));

    // 1. If checked, add daily wage entitlement for the selected work date
    if (includeDailyWage) {
      const entitlementTx: EmployeeTransaction = {
        id: `emp_tx_ent_${Date.now()}`,
        employee_id: settleEmployee.id,
        employee_name: settleEmployee.name,
        type: 'ENTITLEMENT',
        amount: settleEmployee.daily_wage,
        notes: `استحقاق يومية عمل بتاريخ ${effectiveDate} (${settleEmployee.daily_wage} ج.م) - تسوية يومية`,
        date: effectiveDate,
        created_at: nowIso
      };
      dbService.addEmployeeTransaction(entitlementTx);
    }

    // 2. Add wage payment ONLY if cash was actually paid (> 0)
    if (settlePayAmount > 0) {
      const defaultPayNote =
        remainingDifference > 0 && carryOverRemaining
          ? `صرف جزء من اليومية عن يوم ${effectiveDate} (${settlePayAmount} ج.م) وترحيل المتبقي (${remainingDifference} ج.م)`
          : `صرف صافي مستحقات اليومية عن يوم ${effectiveDate} (${settlePayAmount} ج.م)`;

      let linkedExpenseId: string | undefined;
      if (settleDeductDrawer) {
        const desc =
          remainingDifference > 0 && carryOverRemaining
            ? `صرف يومية الموظف: ${settleEmployee.name} (${settlePayAmount} ج.م - وترحيل ${remainingDifference} ج.م)`
            : `صرف صافي يومية الموظف: ${settleEmployee.name} (تسوية يوم ${effectiveDate})`;
        const savedExp = dbService.saveExpense('Salaries', desc, settlePayAmount);
        linkedExpenseId = savedExp.id;
      }

      const paymentTx: EmployeeTransaction = {
        id: `emp_tx_pay_${Date.now() + 1}`,
        employee_id: settleEmployee.id,
        employee_name: settleEmployee.name,
        type: 'WAGE_PAYMENT',
        amount: settlePayAmount,
        notes: settleNotes.trim() || defaultPayNote,
        date: effectiveDate,
        created_at: nowIso,
        ...(linkedExpenseId ? { expense_id: linkedExpenseId } : {})
      };
      dbService.addEmployeeTransaction(paymentTx);
    }

    // 3. If user explicitly disabled carry-over and there's a positive remaining amount, close the difference
    if (!carryOverRemaining && remainingDifference > 0) {
      const waiveTx: EmployeeTransaction = {
        id: `emp_tx_waive_${Date.now() + 2}`,
        employee_id: settleEmployee.id,
        employee_name: settleEmployee.name,
        type: 'CUSTOM_DEDUCTION',
        amount: remainingDifference,
        notes: `إغلاق وتسوية نهائية لفرق اليومية بتاريخ ${effectiveDate} بدون ترحيل (${remainingDifference} ج.م)`,
        date: effectiveDate,
        created_at: nowIso
      };
      dbService.addEmployeeTransaction(waiveTx);
    }

    if (settlePayAmount === 0 && carryOverRemaining) {
      onShowSuccessAlert(
        `تم حفظ تسوية يوم ${effectiveDate} للموظف "${settleEmployee.name}" بدون صرف كاش، والرصيد المرحل الآن: ${remainingDifference >= 0 ? `+${remainingDifference}` : remainingDifference} ج.م.`
      );
    } else if (remainingDifference > 0 && carryOverRemaining) {
      onShowSuccessAlert(
        `تم إجراء التسوية للموظف "${settleEmployee.name}": تم صرف ${settlePayAmount} ج.م وترحيل المتبقي (+${remainingDifference} ج.م) بنجاح!`
      );
    } else if (remainingDifference < 0 && carryOverRemaining) {
      onShowSuccessAlert(
        `تم إجراء التسوية للموظف "${settleEmployee.name}": تم صرف ${settlePayAmount} ج.م والرصيد المتبقي (${remainingDifference} ج.م).`
      );
    } else {
      onShowSuccessAlert(`تم إجراء تسوية يوم ${effectiveDate} للموظف "${settleEmployee.name}" وصرف صافي المستحقات بقيمة ${settlePayAmount} ج.م بنجاح!`);
    }
    setShowSettlementModal(false);
    loadData();
  };

  const getDefaultNotes = (type: EmployeeTransaction['type'], wage: number): string => {
    switch (type) {
      case 'ENTITLEMENT': return `استحقاق يومية العمل المعتادة (${wage} ج.م)`;
      case 'LOAN': return 'سلفة نقدية مستردة';
      case 'DRINK_DEDUCTION': return 'خصم قيمة مشروبات شخصية من الكافيه';
      case 'CUSTOM_DEDUCTION': return 'خصم تأخير / عقوبة إدارية';
      case 'WAGE_PAYMENT': return 'صرف راتب يومية نقدية';
      case 'CONSUMPTION': return 'استهلاك منتجات من الكافيه';
      default: return '';
    }
  };

  // Helper calculation per employee
  const employeeStats = useMemo(() => {
    const map: Record<string, { entitlements: number; loans: number; drinks: number; custom: number; paid: number; balance: number }> = {};
    
    employees.forEach(emp => {
      map[emp.id] = { entitlements: 0, loans: 0, drinks: 0, custom: 0, paid: 0, balance: 0 };
    });

    transactions.forEach(t => {
      if (!map[t.employee_id]) return;
      if (t.type === 'ENTITLEMENT') {
        map[t.employee_id].entitlements += t.amount;
      } else if (t.type === 'LOAN') {
        map[t.employee_id].loans += t.amount;
      } else if (t.type === 'DRINK_DEDUCTION') {
        map[t.employee_id].drinks += t.amount;
      } else if (t.type === 'CUSTOM_DEDUCTION') {
        map[t.employee_id].custom += t.amount;
      } else if (t.type === 'WAGE_PAYMENT') {
        map[t.employee_id].paid += t.amount;
      } else if (t.type === 'CONSUMPTION') {
        map[t.employee_id].drinks += t.amount;
      }
    });

    employees.forEach(emp => {
      const stats = map[emp.id];
      if (stats) {
        // Balance = Earned - Loans - Drinks - Custom - Paid
        stats.balance = stats.entitlements - stats.loans - stats.drinks - stats.custom - stats.paid;
      }
    });

    return map;
  }, [employees, transactions]);

  // Total summary of all employees
  const totals = useMemo(() => {
    let entitlements = 0;
    let loans = 0;
    let drinks = 0;
    let custom = 0;
    let paid = 0;
    let balance = 0;

    const statsArray = Object.values(employeeStats) as { entitlements: number; loans: number; drinks: number; custom: number; paid: number; balance: number }[];
    statsArray.forEach(s => {
      entitlements += s.entitlements;
      loans += s.loans;
      drinks += s.drinks;
      custom += s.custom;
      paid += s.paid;
      balance += s.balance;
    });

    return { entitlements, loans, drinks, custom, paid, balance };
  }, [employeeStats]);

  const filteredArchiveTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchEmp = archiveEmployeeFilter === 'ALL' || t.employee_id === archiveEmployeeFilter;
      const matchType = archiveTypeFilter === 'ALL' || t.type === archiveTypeFilter;
      return matchEmp && matchType;
    });
  }, [transactions, archiveEmployeeFilter, archiveTypeFilter]);

  const settlementBreakdown = useMemo(() => {
    if (!settleEmployee) {
      return {
        wage: 0,
        selectedDateEntitlements: 0,
        totalEntitlements: 0,
        entitlementCount: 0,
        totalLoans: 0,
        totalConsumption: 0,
        totalDrinks: 0,
        totalCustom: 0,
        totalPaid: 0,
        selectedDayDeductions: 0,
        otherDaysDeductions: 0,
        currentBalanceBeforeAdd: 0,
        rawNet: 0,
        net: 0
      };
    }

    const effectiveDate = settleDate || getLocalDateStr();
    const empTxs = transactions.filter(t => t.employee_id === settleEmployee.id);
    const wage = settleEmployee.daily_wage;

    const entitlementTxs = empTxs.filter(t => t.type === 'ENTITLEMENT');
    const totalEntitlements = entitlementTxs.reduce((sum, t) => sum + t.amount, 0);
    const selectedDateEntitlements = entitlementTxs
      .filter(t => t.date === effectiveDate)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalLoans = empTxs.filter(t => t.type === 'LOAN').reduce((sum, t) => sum + t.amount, 0);
    const totalConsumption = empTxs.filter(t => t.type === 'CONSUMPTION').reduce((sum, t) => sum + t.amount, 0);
    const totalDrinks = empTxs.filter(t => t.type === 'DRINK_DEDUCTION').reduce((sum, t) => sum + t.amount, 0);
    const totalCustom = empTxs.filter(t => t.type === 'CUSTOM_DEDUCTION').reduce((sum, t) => sum + t.amount, 0);
    const totalPaid = empTxs.filter(t => t.type === 'WAGE_PAYMENT').reduce((sum, t) => sum + t.amount, 0);

    const isDeduction = (t: EmployeeTransaction) =>
      t.type === 'LOAN' || t.type === 'CONSUMPTION' || t.type === 'DRINK_DEDUCTION' || t.type === 'CUSTOM_DEDUCTION';

    const selectedDayDeductions = empTxs
      .filter(t => t.date === effectiveDate && isDeduction(t))
      .reduce((sum, t) => sum + t.amount, 0);
    const otherDaysDeductions = empTxs
      .filter(t => t.date !== effectiveDate && isDeduction(t))
      .reduce((sum, t) => sum + t.amount, 0);

    const currentBalanceBeforeAdd =
      totalEntitlements - totalLoans - totalConsumption - totalDrinks - totalCustom - totalPaid;

    const rawNet = Number((currentBalanceBeforeAdd + (includeDailyWage ? wage : 0)).toFixed(2));
    const net = Math.max(0, rawNet);

    return {
      wage,
      selectedDateEntitlements,
      totalEntitlements,
      entitlementCount: entitlementTxs.length,
      totalLoans,
      totalConsumption,
      totalDrinks,
      totalCustom,
      totalPaid,
      selectedDayDeductions,
      otherDaysDeductions,
      currentBalanceBeforeAdd,
      rawNet,
      net
    };
  }, [settleEmployee, transactions, includeDailyWage, settleDate]);

  useEffect(() => {
    if (settleEmployee) {
      setSettlePayAmount(settlementBreakdown.net);
    }
  }, [settleEmployee, settlementBreakdown.net]);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-900 pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Users className="w-6 h-6 text-gold-500 animate-pulse" />
            <h2 className="text-xl font-bold text-white tracking-tight">إدارة شؤون ومرتبات العاملين</h2>
          </div>
          <p className="text-xs text-gray-400">تابع حضور الموظفين، سجل السلفيات والخصومات، واصرف الرواتب واليوميات مع تسجيلها بالدرج المالي</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-gradient-to-l from-gold-600 to-amber-600 hover:from-gold-500 hover:to-amber-500 text-black px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            إضافة موظف جديد
          </button>
          
          <button
            onClick={() => handleOpenTxModal('', 'ENTITLEMENT')}
            className="flex items-center gap-2 bg-luxury-bg hover:bg-gray-900 text-gold-500 border border-gray-900 hover:border-gold-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Coins className="w-4 h-4" />
            تسجيل معاملة مالية / حضور
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">إجمالي مستحقات الحضور</span>
          <span className="text-sm font-mono font-bold text-white">+{totals.entitlements.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">إجمالي السلفيات (الكريدت)</span>
          <span className="text-sm font-mono font-bold text-red-400">-{totals.loans.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">خصومات المشروبات والأخرى</span>
          <span className="text-sm font-mono font-bold text-amber-500">-{(totals.drinks + totals.custom).toLocaleString()} ج.م</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">إجمالي ما تم صرفه كاش</span>
          <span className="text-sm font-mono font-bold text-green-400">-{totals.paid.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl bg-gradient-to-l from-gold-600/5 to-transparent">
          <span className="text-[10px] text-gold-500 font-extrabold block mb-1">صافي المرتبات المستحقة للعمال</span>
          <span className="text-sm font-mono font-bold text-gold-500">{totals.balance.toLocaleString()} ج.م</span>
        </div>
      </div>

      {/* Sub-tabs Selection */}
      <div className="flex flex-wrap gap-2 border-b border-gray-900 pb-px">
        <button
          onClick={() => setActiveSubTab('employees')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'employees' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          👨‍💼 الموظفون والرواتب ({employees.length})
          {activeSubTab === 'employees' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'transactions' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          📜 الأرشيف المالي وجدول الحسابات ({transactions.length})
          {activeSubTab === 'transactions' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
        <button
          onClick={() => setActiveSubTab('auth_users')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'auth_users' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          🔑 حسابات وصلاحيات الدخول ({authUsers.length})
          {activeSubTab === 'auth_users' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
        <button
          onClick={() => setActiveSubTab('auth_audit')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'auth_audit' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          🔒 سجل المراقبة والدخول والخروج ({authAuditLogs.length})
          {activeSubTab === 'auth_audit' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
      </div>

      {/* 1. Sub-tab: Employees catalog */}
      {activeSubTab === 'employees' && (
        <div className="space-y-4">
          {employees.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border text-center py-12 rounded-3xl">
              <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-white mb-1">لم يتم إضافة أي موظفين بعد</h3>
              <p className="text-xs text-gray-500 mb-4">قم بإضافة العاملين بالكاشير، الباريستا، والعمال للبدء بمراقبة مستحقاتهم</p>
              <button
                onClick={handleOpenAddModal}
                className="bg-gold-600 hover:bg-gold-500 text-black px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                + إضافة موظف أول
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {employees.map(emp => {
                const stats = employeeStats[emp.id] || { entitlements: 0, loans: 0, drinks: 0, custom: 0, paid: 0, balance: 0 };
                return (
                  <div key={emp.id} className="bg-luxury-card border border-luxury-border rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between">
                    <div>
                      {/* Name and role */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-black border border-gold-600/20 flex items-center justify-center text-gold-500 font-bold overflow-hidden shrink-0">
                            {emp.photo ? (
                              <img src={emp.photo} className="w-full h-full object-cover" />
                            ) : (
                              emp.name.slice(0, 2)
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-white">{emp.name}</h4>
                            <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                              <Briefcase className="w-3 h-3 text-gold-500" />
                              {emp.role}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(emp)}
                            className="p-1.5 hover:bg-gray-900 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                            title="تعديل الموظف"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            className="p-1.5 hover:bg-red-950/30 rounded-lg text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="حذف الموظف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Phone and Basic wage info */}
                      <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400 font-semibold border-b border-gray-900/60 pb-3 mb-3">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-gold-500" />
                          <span>هاتف: {emp.phone || 'غير مسجل'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3 text-gold-500" />
                          <span>يومية العمل الأساسية: <strong className="text-white font-mono">{emp.daily_wage} ج.م</strong></span>
                        </div>
                      </div>

                      {/* Ledger Summary inside employee card (click to view full statement) */}
                      <button
                        type="button"
                        onClick={() => setStatementEmployee(emp)}
                        className="w-full grid grid-cols-4 gap-2 text-center text-[10px] bg-black/30 hover:bg-black/50 p-2.5 rounded-xl border border-gray-900/40 hover:border-gold-600/40 transition-all cursor-pointer"
                        title="اضغط لعرض كشف حساب وحركات الموظف بالتفصيل"
                      >
                        <div>
                          <span className="text-gray-500 block mb-0.5">مكتسب</span>
                          <span className="font-mono text-green-400 font-bold">+{stats.entitlements}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-0.5">سلفيات</span>
                          <span className="font-mono text-red-400 font-bold">-{stats.loans}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-0.5">خصومات</span>
                          <span className="font-mono text-amber-500 font-bold">-{(stats.drinks + stats.custom)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-0.5">منصرف</span>
                          <span className="font-mono text-white font-bold">-{stats.paid}</span>
                        </div>
                      </button>
                    </div>

                    {/* Bottom Action buttons */}
                    <div className="flex flex-wrap justify-between items-center gap-2 mt-4 pt-3 border-t border-gray-900/40">
                      <div className="text-right">
                        <span className="text-[9px] text-gray-500 block">
                          {stats.balance > 0 ? 'رصيد متبقي (مرحل لليوم التالي):' : 'صافي رصيد الموظف:'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-black font-mono ${stats.balance >= 0 ? 'text-gold-500' : 'text-red-500'}`}>
                            {stats.balance >= 0 ? `+${stats.balance}` : stats.balance} ج.م
                          </span>
                          {stats.balance > 0 && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                              🔄 مرحل
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setStatementEmployee(emp)}
                          className="px-2 py-1 bg-blue-950/30 border border-blue-900/50 text-blue-300 hover:text-white hover:bg-blue-900/60 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                          title="عرض وتعديل وحذف حركات الموظف بالتفصيل"
                        >
                          📋 كشف الحساب
                        </button>
                        <button
                          onClick={() => handleOpenTxModal(emp.id, 'ENTITLEMENT')}
                          className="px-2 py-1 bg-green-950/30 border border-green-900/40 text-green-400 hover:text-white hover:bg-green-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                        >
                          + حضور يوم
                        </button>
                        <button
                          onClick={() => handleOpenTxModal(emp.id, 'LOAN')}
                          className="px-2 py-1 bg-red-950/30 border border-red-900/40 text-red-400 hover:text-white hover:bg-red-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                        >
                          + سلفة
                        </button>
                        <button
                          onClick={() => handleOpenTxModal(emp.id, 'DRINK_DEDUCTION')}
                          className="px-2 py-1 bg-amber-950/30 border border-amber-900/40 text-amber-400 hover:text-white hover:bg-amber-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                        >
                          + خصم مشروب
                        </button>
                        <button
                          onClick={() => handleOpenEmployeeConsumption(emp)}
                          className="px-2 py-1 bg-purple-950/30 border border-purple-900/40 text-purple-400 hover:text-white hover:bg-purple-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                          title="استهلاك منتجات من الكافيه"
                        >
                          🥤 استهلاك
                        </button>
                        <button
                          onClick={() => handleOpenTxModal(emp.id, 'WAGE_PAYMENT')}
                          className="px-2.5 py-1 bg-gold-600 hover:bg-gold-500 text-black rounded-lg text-[9px] font-black cursor-pointer transition-all"
                        >
                          💸 صرف دفعة
                        </button>
                        <button
                          onClick={() => handleOpenSettlementModal(emp)}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[9px] font-black cursor-pointer transition-all"
                          title="تسوية اليومية وصرف صافي المستحقات أو ترحيلها لليوم التالي"
                        >
                          ⚖️ تسوية اليوم
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Sub-tab: Complete Ledger history */}
      {activeSubTab === 'transactions' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-gray-900 bg-black/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <History className="w-4 h-4 text-gold-500" />
                أرشيف كافة المعاملات المالية للعمال والرواتب ({filteredArchiveTransactions.length})
              </h4>
              <span className="text-[10px] text-gray-500 font-semibold">يمكنك الفلترة حسب الموظف أو نوع الحركة والتراجع عن أي حركة مسجلة بالخطأ</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={archiveEmployeeFilter}
                onChange={(e) => setArchiveEmployeeFilter(e.target.value)}
                className="bg-luxury-bg border border-gray-800 text-white rounded-xl py-1.5 px-3 text-[11px] font-bold focus:outline-none focus:border-gold-600 cursor-pointer"
              >
                <option value="ALL">👥 كل الموظفين ({employees.length})</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>

              <select
                value={archiveTypeFilter}
                onChange={(e) => setArchiveTypeFilter(e.target.value)}
                className="bg-luxury-bg border border-gray-800 text-white rounded-xl py-1.5 px-3 text-[11px] font-bold focus:outline-none focus:border-gold-600 cursor-pointer"
              >
                <option value="ALL">كل أنواع الحركات</option>
                <option value="ENTITLEMENT">استحقاق يومية (+)</option>
                <option value="WAGE_PAYMENT">صرف نقدي كاش (-)</option>
                <option value="LOAN">سلفة نقدية (-)</option>
                <option value="DRINK_DEDUCTION">خصم مشروب (-)</option>
                <option value="CONSUMPTION">استهلاك منتجات (-)</option>
                <option value="CUSTOM_DEDUCTION">جزاء / خصم آخر (-)</option>
              </select>
            </div>
          </div>

          {filteredArchiveTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">لا توجد معاملات مالية مطابقة للفلاتر المختارة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black/45 border-b border-gray-900 text-gray-400 text-[10px] font-bold uppercase">
                  <tr>
                    <th className="py-3 px-4">تاريخ المعاملة</th>
                    <th className="py-3 px-4">اسم الموظف</th>
                    <th className="py-3 px-4">نوع المعاملة</th>
                    <th className="py-3 px-4">تفاصيل وبيان الحركة</th>
                    <th className="py-3 px-4 text-center">القيمة المالية</th>
                    <th className="py-3 px-4 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900/50">
                  {filteredArchiveTransactions.map(t => (
                    <tr key={t.id} className="hover:bg-gray-900/20 transition-colors">
                      <td className="py-3.5 px-4 text-[10px] font-mono text-gray-500">{t.date}</td>
                      <td className="py-3.5 px-4 font-bold text-white">{t.employee_name}</td>
                      <td className="py-3.5 px-4">
                        {t.type === 'ENTITLEMENT' && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-900 text-emerald-400 text-[9px] font-bold">
                            استحقاق يومية
                          </span>
                        )}
                        {t.type === 'LOAN' && (
                          <span className="px-2 py-0.5 rounded-md bg-red-950 border border-red-900/60 text-red-400 text-[9px] font-bold">
                            سلفة نقدية
                          </span>
                        )}
                        {t.type === 'DRINK_DEDUCTION' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-950 border border-amber-900/60 text-amber-400 text-[9px] font-bold">
                            خصم مشروب
                          </span>
                        )}
                        {t.type === 'CUSTOM_DEDUCTION' && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-900/60 text-rose-400 text-[9px] font-bold">
                            جزاء / خصم آخر
                          </span>
                        )}
                        {t.type === 'WAGE_PAYMENT' && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-950 border border-blue-900/60 text-blue-400 text-[9px] font-bold">
                            صرف نقدي كاش
                          </span>
                        )}
                        {t.type === 'CONSUMPTION' && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-950 border border-purple-900/60 text-purple-400 text-[9px] font-bold">
                            استهلاك منتجات
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400 text-[11px] max-w-xs truncate" title={t.notes}>{t.notes}</td>
                      <td className={`py-3.5 px-4 font-mono font-bold text-center ${
                        t.type === 'ENTITLEMENT' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {t.type === 'ENTITLEMENT' ? `+${t.amount}` : `-${t.amount}`} ج.م
                      </td>
                      <td className="py-3.5 px-4 text-left">
                        <button
                          onClick={() => requestDeleteTransaction(t)}
                          className="text-red-500 hover:text-red-400 font-bold p-1 hover:bg-red-950/20 rounded-lg transition-all cursor-pointer"
                        >
                          ❌ تراجع
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Sub-tab: Employee Auth System Users */}
      {activeSubTab === 'auth_users' && (
        <div className="space-y-4">
          <div className="bg-luxury-card border border-luxury-border p-5 rounded-3xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔑 إدارة حسابات وصلاحيات الدخول الملوكية</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">تحكم كامل بحسابات الموظفين، تبديل الأدوار (مدير / كاشير)، وتغيير كلمات المرور</p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddAuthUser}
                className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-lg cursor-pointer flex items-center gap-2 transition-transform active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة حساب كاشير / مدير جديد</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {authUsers.map(user => (
                <div key={user.id} className="bg-black/60 border border-gray-900 rounded-2xl p-4 flex flex-col justify-between gap-3 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                        user.role === 'Admin' 
                          ? 'bg-gold-600/20 border border-gold-500/40 text-gold-400' 
                          : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                      }`}>
                        {user.role === 'Admin' ? '👑' : '☕'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">{user.name}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            user.role === 'Admin' ? 'bg-gold-950 text-gold-400 border border-gold-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}>
                            {user.role === 'Admin' ? '👑 مدير النظام (Admin)' : '☕ كاشير مبيعات (Cashier)'}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            user.is_active ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-red-950/80 text-red-400 border border-red-800'
                          }`}>
                            {user.is_active ? 'نشط' : 'موقوف'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-gray-400 mt-1">
                          <span>اسم المستخدم: <strong className="text-gold-300">{user.username}</strong></span>
                          <span>كلمة المرور: <strong className="text-gray-300">••••••</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-[10px] text-gray-500 block">آخر دخول:</span>
                      <span className="text-[10px] font-mono text-gray-300 block">{user.last_login_at ? new Date(user.last_login_at).toLocaleString('ar-EG') : 'لم يدخل بعد'}</span>
                    </div>
                  </div>

                  {/* Interactive Action Controls Bar */}
                  <div className="pt-3 border-t border-gray-900/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {/* Toggle Role Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleUserRole(user)}
                        title="تغيير الدور والصلاحية بين مدير وكاشير"
                        className="px-2.5 py-1 bg-gray-900 hover:bg-gold-600/20 text-gold-400 border border-gold-500/30 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>تحويل إلى ({user.role === 'Admin' ? '☕ كاشير' : '👑 مدير'})</span>
                      </button>

                      {/* Toggle Active Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleUserActive(user)}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                          user.is_active
                            ? 'bg-red-950/40 text-red-400 border-red-900 hover:bg-red-950'
                            : 'bg-emerald-950/40 text-emerald-400 border-emerald-900 hover:bg-emerald-950'
                        }`}
                      >
                        {user.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditAuthUser(user)}
                        className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-xs cursor-pointer border border-gray-800"
                        title="تعديل الحساب وكلمة المرور"
                      >
                        ✏️ تعديل
                      </button>

                      {/* Delete Button */}
                      {user.username !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAuthUser(user)}
                          className="p-1.5 bg-red-950/30 hover:bg-red-900 text-red-400 rounded-xl text-xs cursor-pointer border border-red-900/40"
                          title="حذف حساب الدخول"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Sub-tab: Employee Auth Audit Logs */}
      {activeSubTab === 'auth_audit' && (
        <div className="space-y-4">
          <div className="bg-luxury-card border border-luxury-border p-5 rounded-3xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔒 سجل مراقبة وتتبع تسجيلات الدخول والخروج</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">سجل إلكتروني محمي بالدقيقة والثانية لكافة حركات دخول وخروج الموظفين والكاشيرية</p>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    loadData();
                    onShowSuccessAlert('تم تحديث سجل المراقبة والدخول فورا!');
                  }}
                  className="px-3 py-2 bg-gray-900 hover:bg-gray-800 text-gold-400 border border-gold-500/30 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>تحديث السجل</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAuditLogs}
                  className="px-3 py-2 bg-red-950/30 hover:bg-red-950 text-red-400 border border-red-900/40 rounded-xl text-xs font-bold cursor-pointer shrink-0"
                >
                  مسح السجلات
                </button>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 pt-3 border-t border-gray-900">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAuditActionFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    auditActionFilter === 'ALL' ? 'bg-gold-600 text-black' : 'bg-black/60 text-gray-400 hover:text-white border border-gray-900'
                  }`}
                >
                  جميع الحركات ({authAuditLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter('LOGIN')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    auditActionFilter === 'LOGIN' ? 'bg-emerald-600 text-white' : 'bg-black/60 text-gray-400 hover:text-white border border-gray-900'
                  }`}
                >
                  🔐 دخول ناجح ({authAuditLogs.filter(l => l.action === 'LOGIN').length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditActionFilter('LOGOUT')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    auditActionFilter === 'LOGOUT' ? 'bg-red-600 text-white' : 'bg-black/60 text-gray-400 hover:text-white border border-gray-900'
                  }`}
                >
                  🔓 تسجيل خروج ({authAuditLogs.filter(l => l.action === 'LOGOUT').length})
                </button>
              </div>

              <input
                type="text"
                placeholder="🔍 بحث باسم الموظف أو اسم المستخدم..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="bg-black/60 border border-gray-900 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 w-full sm:w-64 focus:border-gold-500 outline-none"
              />
            </div>

            {authAuditLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs">
                لا يوجد أي سجلات دخول أو خروج مسجلة بالنظام بعد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-black/40 text-gray-400 text-[10px] uppercase font-bold border-b border-gray-900">
                    <tr>
                      <th className="py-3 px-4">اسم الموظف</th>
                      <th className="py-3 px-4">اسم المستخدم</th>
                      <th className="py-3 px-4">الصلاحية</th>
                      <th className="py-3 px-4">نوع الحدث</th>
                      <th className="py-3 px-4">التاريخ والتوقيت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900/50">
                    {authAuditLogs
                      .filter(log => {
                        if (auditActionFilter !== 'ALL' && log.action !== auditActionFilter) return false;
                        const empNameMatch = log.user_name ? log.user_name.toLowerCase().includes(auditSearch.toLowerCase()) : false;
                        const userMatch = log.username ? log.username.toLowerCase().includes(auditSearch.toLowerCase()) : false;
                        return empNameMatch || userMatch || !auditSearch.trim();
                      })
                      .map(log => (
                        <tr key={log.id} className="hover:bg-gray-900/20 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-white">{log.user_name}</td>
                          <td className="py-3.5 px-4 font-mono text-gold-400">{log.username}</td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                              log.role === 'Admin' ? 'bg-gold-950 border border-gold-800 text-gold-400' : 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                            }`}>
                              {log.role === 'Admin' ? '👑 أدمن' : '☕ كاشير'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {log.action === 'LOGIN' ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-extrabold text-[10px]">
                                🔐 دخول ناجح
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-red-950/80 border border-red-800 text-red-300 font-extrabold text-[10px]">
                                🔓 تسجيل خروج
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-gray-300 text-[11px]">
                            {log.date} - <span className="text-gold-400">{log.time}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL DIALOG: ADD / EDIT EMPLOYEE --- */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveEmployee} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setShowEmpModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-gold-500" />
              {editingEmp ? 'تعديل ملف الموظف' : 'تسجيل موظف جديد بالمنظومة'}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">أدخل البيانات الشخصية وقيمة الراتب لحساب الرواتب والذمم تلقائياً</p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم الموظف بالكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد محمد علي"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-gray-400 font-bold block">رقم الهاتف الجوال</label>
                  <ContactPickerButton
                    currentName={empName}
                    onSelect={({ phone, name }) => {
                      setEmpPhone(phone);
                      if (name && !empName.trim()) {
                        setEmpName(name);
                      }
                    }}
                    buttonText="سجل الأسماء"
                  />
                </div>
                <input
                  type="text"
                  placeholder="مثال: 01094793701"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">الدور الوظيفي / القسم</label>
                <input
                  type="text"
                  placeholder="مثال: صانع قهوة / باريستا"
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-right"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">يومية العمل والراتب الأساسي اليومي (ج.م) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={empWage}
                  onChange={(e) => setEmpWage(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-gold-500"
                />
                <span className="text-[9px] text-gray-500 block mt-1">يتم استخدامه كقيمة افتراضية عند تسجيل حضور الموظف اليومي</span>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">صورة الشخصية للموظف</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setEmpPhoto(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full bg-luxury-bg border border-gray-800 text-gray-400 rounded-xl py-1.5 px-3 text-[10px] focus:outline-none cursor-pointer text-right"
                />
                {empPhoto && (
                  <div className="flex items-center gap-2 mt-2">
                    <img src={empPhoto} className="w-8 h-8 rounded-full object-cover border border-gold-500/30" />
                    <button
                      type="button"
                      onClick={() => setEmpPhoto('')}
                      className="text-[10px] text-red-400 hover:underline cursor-pointer"
                    >
                      حذف الصورة المرفوعة
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-3 sticky bottom-0 bg-luxury-card z-10">
              <button
                type="submit"
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
              >
                {editingEmp ? 'تعديل وحفظ' : 'تسجيل وإضافة الموظف'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmpModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: RECORD TRANSACTION --- */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveTransaction} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              onClick={() => setShowTxModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <Coins className="w-5 h-5 text-gold-500 animate-spin" />
              تأكيد حركة مالية للعاملين
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">حدد الموظف وقيمة المعاملة ليتم ترحيلها وحساب التوازن تلقائياً بالمنظومة</p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اختر الموظف المعني *</label>
                <select
                  required
                  value={txEmployeeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTxEmployeeId(id);
                    // Autofill daily wage if Entitlement is selected
                    if (txType === 'ENTITLEMENT') {
                      const empObj = employees.find(emp => emp.id === id);
                      if (empObj) setTxAmount(empObj.daily_wage);
                    }
                  }}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                >
                  <option value="">-- اختر موظف من القائمة --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">نوع الحركة المالية *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: 'ENTITLEMENT', label: 'استحقاق يومية (+)' },
                    { id: 'WAGE_PAYMENT', label: 'صرف كاش (-)' },
                    { id: 'LOAN', label: 'سلفة نقدية (-)' },
                    { id: 'DRINK_DEDUCTION', label: 'خصم مشروب (-)' },
                    { id: 'CUSTOM_DEDUCTION', label: 'جزاء وعقوبة (-)' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const nextType = item.id as EmployeeTransaction['type'];
                        setTxType(nextType);
                        if (nextType === 'ENTITLEMENT' && txEmployeeId) {
                          const empObj = employees.find(emp => emp.id === txEmployeeId);
                          if (empObj) setTxAmount(empObj.daily_wage);
                        }
                        // Default drawer setting based on transaction type
                        setDeductFromDrawer(nextType === 'WAGE_PAYMENT' || nextType === 'LOAN');
                      }}
                      className={`py-2 px-1 rounded-xl font-bold text-[9px] text-center border cursor-pointer transition-all ${
                        txType === item.id
                          ? 'bg-gold-600/10 border-gold-500 text-gold-500 font-black'
                          : 'bg-black/40 border-gray-900 text-gray-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">القيمة المالية بالجنيه المصري (ج.م) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-black text-gold-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">تاريخ يوم العمل / الحركة</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTxDate(getLocalDateStr())}
                    className={`px-2.5 py-2 rounded-xl text-[10px] font-bold border cursor-pointer transition-all ${
                      txDate === getLocalDateStr()
                        ? 'bg-gold-600 text-black border-gold-500'
                        : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    اليوم
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxDate(getRelativeLocalDateStr(-1))}
                    className={`px-2.5 py-2 rounded-xl text-[10px] font-bold border cursor-pointer transition-all ${
                      txDate === getRelativeLocalDateStr(-1)
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    أمس
                  </button>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="flex-1 bg-luxury-bg border border-gray-800 text-white rounded-xl py-1.5 px-2.5 text-[11px] font-mono text-center focus:outline-none focus:border-gold-600"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">ملاحظات ومراجعة البيان</label>
                <input
                  type="text"
                  placeholder="مثال: استحقاق حضور شفت مسائي، سداد دفعة نقدية بالكامل..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-right"
                />
              </div>

              {/* Drawer option toggle if it's cash payment or loan */}
              {(txType === 'WAGE_PAYMENT' || txType === 'LOAN') && (
                <div className="bg-[#090909] p-3 rounded-xl border border-gray-900/60 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px] text-white">
                    <input
                      type="checkbox"
                      checked={deductFromDrawer}
                      onChange={(e) => setDeductFromDrawer(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-800 text-gold-500 focus:ring-gold-500 bg-black cursor-pointer"
                    />
                    <span>خصم هذا الصرف كاش من درج النقدية بالمنظومة فوراً</span>
                  </label>
                  <p className="text-[9px] text-gray-500 mt-1 mr-5">سيقوم النظام بتسجيل مصروف تلقائي بالدرج لضمان بقاء العجز والزيادة والدرج دقيقاً 100%.</p>
                </div>
              )}

            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-3 sticky bottom-0 bg-luxury-card z-10">
              <button
                type="submit"
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
              >
                تسجيل وحفظ الحركة
              </button>
              <button
                type="button"
                onClick={() => setShowTxModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: EMPLOYEE PRODUCT CONSUMPTION (CENTRALIZED SELECTION) --- */}
      {showConsumptionModal && selectedEmpForCons && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh] max-h-[750px]">
            
            {/* Modal Header */}
            <div className="bg-black/40 border-b border-gray-900 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse" />
                  تسجيل استهلاك منتجات للموظف: <span className="text-gold-500 font-extrabold">{selectedEmpForCons.name}</span>
                </h3>
                <span className="text-[10px] text-gray-500 mt-1 block">
                  السياسة الحالية بالمنظومة: {dbService.getSettings().employee_consumption_policy === 'FREE' ? (
                    <strong className="text-purple-400 font-extrabold">🎁 ضيافة مجانية على حساب الكافيه (بسعر التكلفة)</strong>
                  ) : (
                    <strong className="text-amber-500 font-extrabold">💸 خصم مباشر من رصيد يومية العمل (بسعر البيع)</strong>
                  )}
                </span>
              </div>
              <button
                onClick={() => setShowConsumptionModal(false)}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-950 rounded-lg cursor-pointer transition-all"
              >
                ✕
              </button>
            </div>

            {/* Split Content: Products Selection + Cart */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
              
              {/* Right Side: Product Database Grid */}
              <div className="flex-1 p-5 overflow-y-auto border-l border-gray-900 flex flex-col gap-4">
                
                {/* Search and Category Tabs */}
                <div className="flex flex-col gap-3 shrink-0">
                  <input
                    type="text"
                    placeholder="🔍 ابحث عن مشروب، طعام، أو أي منتج..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-4 text-xs text-right focus:outline-none focus:border-gold-600"
                  />

                  {/* Categories List */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                    <button
                      onClick={() => setSelectedCategory('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer whitespace-nowrap transition-all ${
                        selectedCategory === 'ALL'
                          ? 'bg-gold-600 text-black font-extrabold'
                          : 'bg-black/40 text-gray-400 hover:text-white border border-gray-900'
                      }`}
                    >
                      الكل ({allProducts.length})
                    </button>
                    {allCategories.map(cat => {
                      const count = allProducts.filter(p => p.category_id === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer whitespace-nowrap transition-all ${
                            selectedCategory === cat.id
                              ? 'bg-gold-600 text-black font-extrabold'
                              : 'bg-black/40 text-gray-400 hover:text-white border border-gray-900'
                          }`}
                        >
                          {cat.name_ar} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid */}
                <div className="flex-1 min-h-0">
                  {filteredProducts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 border border-dashed border-gray-900 rounded-2xl p-6">
                      <span className="text-2xl mb-1">🔍</span>
                      <p className="text-[11px]">لا توجد منتجات مطابقة للبحث أو الفئة المختارة</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filteredProducts.map(prod => {
                        const isOutOfStock = prod.current_stock <= 0;
                        const cartQty = consumptionCart.find(item => item.product.id === prod.id)?.quantity || 0;
                        
                        return (
                          <div
                            key={prod.id}
                            onClick={() => !isOutOfStock && handleAddToConsumptionCart(prod)}
                            className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between h-24 ${
                              isOutOfStock
                                ? 'bg-black/10 border-gray-900/40 opacity-40 cursor-not-allowed'
                                : 'bg-black/40 border-gray-900 hover:border-gold-600/30 cursor-pointer hover:bg-black/60 relative'
                            }`}
                          >
                            {cartQty > 0 && (
                              <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-purple-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                                {cartQty}
                              </span>
                            )}
                            <div>
                              <h4 className="text-[11px] font-bold text-white truncate">{prod.name_ar}</h4>
                              <span className="text-[9px] text-gray-500 block mt-0.5">{prod.name_en || 'Product'}</span>
                            </div>

                            <div className="flex justify-between items-center mt-2 border-t border-gray-950 pt-1.5">
                              <span className="text-[10px] font-bold font-mono text-gold-500">
                                {prod.selling_price} ج.م
                              </span>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                                prod.current_stock <= 5 ? 'bg-red-950/40 text-red-400' : 'bg-gray-900 text-gray-500'
                              }`}>
                                متاح: {prod.current_stock}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Left Side: Consumption Cart & Order Details */}
              <div className="w-full md:w-80 bg-black/20 p-5 flex flex-col justify-between border-t md:border-t-0 md:border-r border-gray-900 shrink-0">
                <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                  <h4 className="text-xs font-extrabold text-white mb-3 flex items-center gap-1.5">
                    <span>🥤 المنتجات المختارة للاستهلاك</span>
                  </h4>

                  {consumptionCart.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-6 border border-dashed border-gray-900 rounded-2xl">
                      <span className="text-2xl mb-2">🛒</span>
                      <p className="text-[10px] text-center leading-relaxed">السلة فارغة حالياً.<br />اضغط على المنتجات من القائمة المجاورة لإضافتها.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 pr-1">
                      {consumptionCart.map(item => {
                        const isPriceEdited = item.unitPrice !== item.product.selling_price;
                        const lineTotal = Math.round(item.unitPrice * item.quantity * 100) / 100;
                        return (
                          <div key={item.product.id} className="bg-black/50 border border-gray-900/60 p-2.5 rounded-xl flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-white truncate">{item.product.name_ar}</span>
                                  {isPriceEdited && (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold">
                                      سعر معدّل
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateConsumptionQty(item.product.id, item.quantity - 1)}
                                  className="w-6 h-6 rounded bg-gray-900 hover:bg-gray-800 text-white font-bold text-[11px] flex items-center justify-center cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center text-[11px] font-bold font-mono text-white">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateConsumptionQty(item.product.id, item.quantity + 1)}
                                  className="w-6 h-6 rounded bg-gray-900 hover:bg-gray-800 text-white font-bold text-[11px] flex items-center justify-center cursor-pointer"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromConsumptionCart(item.product.id)}
                                  className="w-6 h-6 rounded hover:bg-red-950/20 text-red-500 font-bold text-[11px] flex items-center justify-center cursor-pointer mr-1"
                                  title="حذف"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Editable unit price + line total */}
                            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-900/60">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[9px] text-gray-400 font-bold">السعر:</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.unitPrice}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => handleUpdateConsumptionPrice(item.product.id, parseFloat(e.target.value))}
                                  className="w-16 bg-luxury-bg border border-gray-800 focus:border-gold-500 text-gold-400 rounded-lg py-1 px-1.5 text-[11px] font-mono font-bold text-center outline-none"
                                  dir="ltr"
                                />
                                <span className="text-[9px] text-gray-500">ج.م</span>
                              </div>
                              <span className="text-[10px] text-gold-500 font-mono font-bold">
                                = {lineTotal} ج.م
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bill Summary & Actions */}
                <div className="mt-4 pt-4 border-t border-gray-900 shrink-0">
                  <div className="mb-3">
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">تاريخ الاستهلاك:</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setConsDate(getLocalDateStr())}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          consDate === getLocalDateStr()
                            ? 'bg-gold-600 text-black border-gold-500'
                            : 'bg-black/40 border-gray-800 text-gray-400'
                        }`}
                      >
                        اليوم
                      </button>
                      <button
                        type="button"
                        onClick={() => setConsDate(getRelativeLocalDateStr(-1))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                          consDate === getRelativeLocalDateStr(-1)
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-black/40 border-gray-800 text-gray-400'
                        }`}
                      >
                        أمس
                      </button>
                      <input
                        type="date"
                        value={consDate}
                        onChange={(e) => setConsDate(e.target.value)}
                        className="flex-1 bg-luxury-bg border border-gray-800 text-white rounded-lg py-1 px-2 text-[10px] font-mono text-center"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 text-[11px] mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-400">إجمالي قطع الاستهلاك:</span>
                      <strong className="text-white font-mono font-bold">
                        {consumptionCart.reduce((acc, curr) => acc + curr.quantity, 0)} قطعة
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-gray-900/50 pb-2">
                      <span className="text-gray-400">القيمة الإجمالية للاستهلاك:</span>
                      <strong className="text-gold-500 font-mono font-bold">
                        {Math.round(consumptionCart.reduce((acc, curr) => acc + curr.unitPrice * curr.quantity, 0) * 100) / 100} ج.م
                      </strong>
                    </div>
                    
                    <div className="p-2.5 rounded-xl bg-black/60 border border-gray-900">
                      {dbService.getSettings().employee_consumption_policy === 'FREE' ? (
                        <div className="text-[9px] leading-relaxed text-purple-400">
                          📌 <b>الاحتساب المالي: مجاني (FREE)</b><br />
                          لن يخصم أي مبلغ مالي من الموظف. سيتم قيد تكلفة المنتجات الإجمالية (
                          {consumptionCart.reduce((acc, curr) => acc + curr.product.cost_price * curr.quantity, 0)} ج.م
                          ) كمصروف عام للكافيه.
                        </div>
                      ) : (
                        <div className="text-[9px] leading-relaxed text-amber-400">
                          📌 <b>الاحتساب المالي: خصم من اليومية (DEDUCT)</b><br />
                          سيخصم مبلغ <span className="font-extrabold font-mono">{Math.round(consumptionCart.reduce((acc, curr) => acc + curr.unitPrice * curr.quantity, 0) * 100) / 100} ج.م</span> من راتب الموظف فور تأكيد الحفظ تلقائياً.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleSaveEmployeeConsumption}
                      className="py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-extrabold rounded-xl transition-all cursor-pointer text-[11px]"
                    >
                      💾 تأكيد وحفظ
                    </button>
                    <button
                      onClick={() => setShowConsumptionModal(false)}
                      className="py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-[11px]"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* --- MODAL DIALOG: DAILY WAGE SETTLEMENT --- */}
      {showSettlementModal && settleEmployee && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-lg p-4 sm:p-5 flex flex-col relative max-h-[90vh] overflow-y-auto my-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-900 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <span className="text-amber-500">⚖️</span>
                  تسوية اليومية وصرف المستحقات: {settleEmployee.name}
                </h3>
                <span className="text-[10px] text-gray-500 font-semibold">{settleEmployee.role} • اليومية الأساسية: {settleEmployee.daily_wage} ج.م</span>
              </div>
              <button
                onClick={() => setShowSettlementModal(false)}
                className="text-gray-500 hover:text-white transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Calculations & Breakdown Form */}
            <form onSubmit={handleSaveSettlement} className="space-y-3.5">

              {/* Work Date Selection (Next-Morning Settlement Support) */}
              <div className="bg-black/40 p-3 rounded-xl border border-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold text-white flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gold-500" />
                    تاريخ يوم العمل / التسوية
                  </span>
                  <span className="text-[9px] text-gray-400">
                    للتسوية في صباح اليوم التالي اختر «أمس»
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleChangeSettleDate(getLocalDateStr())}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black border cursor-pointer transition-all ${
                      settleDate === getLocalDateStr()
                        ? 'bg-gold-600 text-black border-gold-500'
                        : 'bg-black/50 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    اليوم ({getLocalDateStr().slice(5)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeSettleDate(getRelativeLocalDateStr(-1))}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black border cursor-pointer transition-all ${
                      settleDate === getRelativeLocalDateStr(-1)
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-black/50 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    أمس ({getRelativeLocalDateStr(-1).slice(5)})
                  </button>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={(e) => handleChangeSettleDate(e.target.value)}
                    className="flex-1 bg-luxury-bg border border-gray-800 text-white rounded-xl py-1.5 px-2.5 text-[11px] font-mono text-center focus:outline-none focus:border-gold-600"
                    dir="ltr"
                  />
                </div>
              </div>
              
              {/* Daily Wage Option */}
              <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                settlementBreakdown.selectedDateEntitlements > 0
                  ? 'bg-emerald-950/15 border-emerald-800/40'
                  : 'bg-black/30 border-gray-900'
              }`}>
                <div>
                  <span className="text-xs font-bold text-white block">
                    إضافة يومية عمل لتاريخ ({settleDate})
                  </span>
                  <span className={`text-[10px] ${settlementBreakdown.selectedDateEntitlements > 0 ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>
                    {settlementBreakdown.selectedDateEntitlements > 0
                      ? `✅ يومية يوم ${settleDate} مسجلة مسبقاً (+${settlementBreakdown.selectedDateEntitlements} ج.م) — لا تفعّلها إلا لإضافة يوم إضافي`
                      : 'سيتم إضافة أجر اليومية إلى رصيد الموظف عند الحفظ'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-mono font-black text-green-400">+{settleEmployee.daily_wage} ج.م</span>
                  <input
                    type="checkbox"
                    checked={includeDailyWage}
                    onChange={(e) => setIncludeDailyWage(e.target.checked)}
                    className="w-4 h-4 text-amber-500 bg-black border-gray-800 rounded focus:ring-amber-500 focus:ring-2 cursor-pointer"
                  />
                </div>
              </label>

              {/* Complete Transparent Account Breakdown (All Days Included) */}
              <div className="space-y-2 bg-[#060606] p-3.5 rounded-2xl border border-gray-950">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">
                    ملخص حساب الموظف الكامل (يشمل الأيام السابقة واليوم):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const emp = settleEmployee;
                      setShowSettlementModal(false);
                      setStatementEmployee(emp);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                  >
                    📋 مراجعة / حذف الحركات
                  </button>
                </div>

                <div className="flex justify-between text-xs border-b border-gray-900/60 pb-1.5">
                  <span className="text-gray-300">
                    ✅ إجمالي اليوميات المسجلة ({settlementBreakdown.entitlementCount} يوم{includeDailyWage ? ' + يوم جديد' : ''}):
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    +{settlementBreakdown.totalEntitlements + (includeDailyWage ? settleEmployee.daily_wage : 0)} ج.م
                  </span>
                </div>
                
                <div className="flex justify-between text-xs border-b border-gray-900/60 pb-1.5">
                  <span className="text-gray-400">💵 إجمالي السلفيات:</span>
                  <span className="font-mono text-red-400 font-bold">-{settlementBreakdown.totalLoans} ج.م</span>
                </div>
                
                <div className="flex justify-between text-xs border-b border-gray-900/60 pb-1.5">
                  <span className="text-gray-400">
                    🥤 المشروبات والاستهلاك والخصومات:
                    {settlementBreakdown.otherDaysDeductions > 0 && (
                      <span className="text-[9px] text-amber-400/90 mr-1">
                        (يوم {settleDate.slice(5)}: {settlementBreakdown.selectedDayDeductions} | أيام أخرى: {settlementBreakdown.otherDaysDeductions})
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    -{(settlementBreakdown.totalConsumption + settlementBreakdown.totalDrinks + settlementBreakdown.totalCustom)} ج.م
                  </span>
                </div>

                <div className="flex justify-between text-xs border-b border-gray-900/60 pb-1.5">
                  <span className="text-gray-400">💸 إجمالي المنصرف كاش مسبقاً:</span>
                  <span className="font-mono text-blue-400 font-bold">-{settlementBreakdown.totalPaid} ج.م</span>
                </div>

                {/* Final Net Row */}
                <div className="border-t border-dashed border-gray-800 pt-2 flex justify-between items-center text-xs">
                  <span className="text-white font-extrabold">
                    صافي المستحق الفعلي للموظف الآن:
                  </span>
                  <span className={`font-mono font-black text-sm ${settlementBreakdown.rawNet >= 0 ? 'text-gold-500' : 'text-red-400'}`}>
                    {settlementBreakdown.rawNet >= 0 ? `+${settlementBreakdown.rawNet}` : settlementBreakdown.rawNet} ج.م
                  </span>
                </div>

                {settlementBreakdown.rawNet < 0 && settlementBreakdown.totalPaid > 0 && (
                  <div className="p-2 rounded-xl bg-red-950/30 border border-red-900/60 text-[10px] text-red-300 leading-relaxed">
                    ⚠️ الصافي سالب لوجود مبلغ <b>منصرف كاش (-{settlementBreakdown.totalPaid} ج.م)</b> مسجّل مسبقاً. إذا لم يستلم العامل هذا المبلغ فعلياً اضغط <b>«مراجعة / حذف الحركات»</b> أعلاه للتراجع عنه.
                  </div>
                )}
              </div>

              {/* Quick Payout Choice Buttons (Prevent Accidental Cash Payout!) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSettlePayAmount(settlementBreakdown.net);
                    setCarryOverRemaining(true);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-[10px] font-black border cursor-pointer transition-all ${
                    settlePayAmount === settlementBreakdown.net && settlementBreakdown.net > 0
                      ? 'bg-gold-600/20 border-gold-500 text-gold-400'
                      : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  💸 صرف الصافي كاش ({settlementBreakdown.net} ج.م)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettlePayAmount(0);
                    setCarryOverRemaining(true);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-[10px] font-black border cursor-pointer transition-all ${
                    settlePayAmount === 0
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  🔄 ترحيل بدون صرف كاش (0 ج.م)
                </button>
              </div>

              {/* Cash Payment Form Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold block mb-1">المبلغ المصروف كاش الآن (ج.م) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={settlePayAmount}
                    onChange={(e) => setSettlePayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-black/45 border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-gold-500 focus:outline-none focus:border-gold-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold block mb-1">بيان وصرف الحركة</label>
                  <input
                    type="text"
                    placeholder="مثال: تسوية يومية 16/11..."
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    className="w-full bg-black/45 border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-right focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Carry-over Remaining Preview & Toggle */}
              {(() => {
                const remainingDiff = Number((settlementBreakdown.rawNet - settlePayAmount).toFixed(2));
                return (
                  <div className="space-y-2">
                    <label className="bg-black/30 p-2.5 rounded-xl border border-gray-900 flex items-center justify-between cursor-pointer">
                      <span className="text-[11px] text-gold-400 font-extrabold">
                        🔄 ترحيل المتبقي من اليومية إلى اليوم التالي تلقائياً
                      </span>
                      <input
                        type="checkbox"
                        checked={carryOverRemaining}
                        onChange={(e) => setCarryOverRemaining(e.target.checked)}
                        className="w-4 h-4 text-gold-500 bg-black border-gray-800 rounded focus:ring-gold-500 focus:ring-2 cursor-pointer"
                      />
                    </label>

                    {remainingDiff > 0 && (
                      <div className={`p-3 rounded-xl border text-xs flex justify-between items-center ${
                        carryOverRemaining
                          ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-950/25 border-amber-500/40 text-amber-300'
                      }`}>
                        <div>
                          <span className="font-extrabold block">
                            {carryOverRemaining
                              ? (settlePayAmount === 0 ? '🔄 سيتم ترحيل كامل الرصيد (بدون تسجيل منصرف):' : '🔄 المتبقي المرحل إلى اليوم التالي:')
                              : '⚠️ فرق غير مرحل (سيتم تسويته كإغلاق نهائي):'}
                          </span>
                          <span className="text-[10px] opacity-80">
                            {carryOverRemaining
                              ? 'سيُضاف تلقائياً لرصيد الموظف دون خصم كاش منه'
                              : 'لن يُرحّل هذا المبلغ لليوم التالي'}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm">
                          {carryOverRemaining ? `+${remainingDiff}` : remainingDiff} ج.م
                        </span>
                      </div>
                    )}

                    {remainingDiff < 0 && (
                      <div className="p-3 rounded-xl border bg-red-950/25 border-red-500/40 text-red-300 text-xs flex justify-between items-center">
                        <div>
                          <span className="font-extrabold block">💳 رصيد مدين متبقي بعد الحفظ:</span>
                          <span className="text-[10px] opacity-80">سيظهر كرصيد سالب يُخصم من اليوميات التالية</span>
                        </div>
                        <span className="font-mono font-black text-sm">{remainingDiff} ج.م</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Deduct from Drawer Checkbox (only relevant when paying cash > 0) */}
              {settlePayAmount > 0 && (
                <div className="bg-black/30 p-2.5 rounded-xl border border-gray-900 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-bold">خصم المبلغ المصروف ({settlePayAmount} ج.م) تلقائياً من درج كاشير الكافيه اليومي</span>
                  <input
                    type="checkbox"
                    checked={settleDeductDrawer}
                    onChange={(e) => setSettleDeductDrawer(e.target.checked)}
                    className="w-4 h-4 text-gold-500 bg-black border-gray-800 rounded focus:ring-gold-500 focus:ring-2 cursor-pointer"
                  />
                </div>
              )}

              {/* Actions Footer */}
              <div className="grid grid-cols-2 gap-3 mt-4 border-t border-gray-900 pt-3 sticky bottom-0 bg-luxury-card z-10">
                <button
                  type="submit"
                  className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
                >
                  {settlePayAmount > 0
                    ? `💸 تأكيد وصرف (${settlePayAmount} ج.م)`
                    : '🔄 حفظ وترحيل بدون صرف كاش'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
                >
                  إلغاء التراجع
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MODAL DIALOG: ADD / EDIT AUTH USER --- */}
      {showAuthUserModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveAuthUser} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAuthUserModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <Key className="w-5 h-5 text-gold-500" />
              {editingAuthUser ? 'تعديل حساب الدخول والمستحدم' : 'إضافة حساب دخول لكاشير / مدير جديد'}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">أدخل اسم المستخدم وكلمة المرور وحدد الصلاحية المطلوبة بدقة</p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم الموظف / الكاشير *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد الديب"
                  value={authUserName}
                  onChange={(e) => setAuthUserName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم المستخدم للدخول (Username) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: cashier2"
                  value={authUserUsername}
                  onChange={(e) => setAuthUserUsername(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-left font-mono focus:outline-none focus:border-gold-600"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">كلمة المرور (Password) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 123456"
                  value={authUserPassword}
                  onChange={(e) => setAuthUserPassword(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-left font-mono focus:outline-none focus:border-gold-600 text-gold-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">الصلاحية بالنظام (Role) *</label>
                <select
                  value={authUserRole}
                  onChange={(e) => setAuthUserRole(e.target.value as UserRole)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                >
                  <option value="Cashier">☕ كاشير مبيعات (POS Only - مبيعات وفواتير دون تقارير)</option>
                  <option value="Admin">👑 مدير النظام (Admin - وصول كامل لكافة التقارير والإعدادات)</option>
                </select>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black rounded-xl text-xs shadow-lg cursor-pointer transition-all"
                >
                  حفظ بيانات الحساب 🔑
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthUserModal(false)}
                  className="py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-gray-400 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: EMPLOYEE DETAILED STATEMENT --- */}
      {statementEmployee && (() => {
        const empStats = employeeStats[statementEmployee.id] || { entitlements: 0, loans: 0, drinks: 0, custom: 0, paid: 0, balance: 0 };
        const empTxs = transactions.filter(t => t.employee_id === statementEmployee.id);
        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
            <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-2xl p-4 sm:p-5 flex flex-col max-h-[90vh] overflow-hidden my-auto shadow-2xl">
              <div className="flex justify-between items-start border-b border-gray-900 pb-3 mb-3 shrink-0">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>📋 كشف حساب الموظف:</span>
                    <span className="text-gold-500">{statementEmployee.name}</span>
                  </h3>
                  <span className="text-[10px] text-gray-500">
                    {statementEmployee.role} • اليومية الأساسية: {statementEmployee.daily_wage} ج.م • عدد الحركات: {empTxs.length}
                  </span>
                </div>
                <button
                  onClick={() => setStatementEmployee(null)}
                  className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Exact Math Formula Bar */}
              <div className="grid grid-cols-5 gap-2 text-center text-[10px] bg-black/40 p-3 rounded-2xl border border-gray-900 mb-3 shrink-0">
                <div>
                  <span className="text-gray-500 block mb-0.5">مكتسب</span>
                  <span className="font-mono text-emerald-400 font-black text-xs">+{empStats.entitlements}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">سلفيات</span>
                  <span className="font-mono text-red-400 font-black text-xs">-{empStats.loans}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">خصومات</span>
                  <span className="font-mono text-amber-400 font-black text-xs">-{(empStats.drinks + empStats.custom)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5">منصرف كاش</span>
                  <span className="font-mono text-blue-400 font-black text-xs">-{empStats.paid}</span>
                </div>
                <div className="border-r border-gray-800 pr-1">
                  <span className="text-gray-400 block mb-0.5 font-bold">الصافي</span>
                  <span className={`font-mono font-black text-xs ${empStats.balance >= 0 ? 'text-gold-500' : 'text-red-500'}`}>
                    {empStats.balance >= 0 ? `+${empStats.balance}` : empStats.balance} ج.م
                  </span>
                </div>
              </div>

              {/* Helpful Diagnostic Notice when negative due to recorded cash payout */}
              {empStats.paid > 0 && empStats.balance < 0 && (
                <div className="mb-3 p-3 rounded-2xl bg-amber-950/25 border border-amber-500/40 text-[11px] text-amber-200 leading-relaxed shrink-0">
                  💡 <b>ملاحظة محاسبية:</b> المعادلة الحالية هي:
                  <span className="font-mono mx-1 text-white">
                    (+{empStats.entitlements}) − ({empStats.loans + empStats.drinks + empStats.custom}) − ({empStats.paid} منصرف) = {empStats.balance} ج.م
                  </span>
                  — إذا كان مبلغ <b>المنصرف (-{empStats.paid} ج.م)</b> مسجّلاً بالخطأ ولم يستلمه الموظف فعلياً، اضغط <b>«❌ تراجع»</b> بجانب حركة الصرف بالأسفل ليعود الصافي تلقائياً إلى <b className="text-emerald-400 font-mono">+{empStats.balance + empStats.paid} ج.م</b>.
                </div>
              )}

              {/* Transactions Table */}
              <div className="flex-1 overflow-y-auto min-h-0 border border-gray-900 rounded-2xl bg-black/25">
                {empTxs.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs">لا توجد حركات مسجلة لهذا الموظف بعد.</div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-black/60 border-b border-gray-900 text-gray-400 text-[10px] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">النوع</th>
                        <th className="py-2.5 px-3">البيان</th>
                        <th className="py-2.5 px-3 text-center">المبلغ</th>
                        <th className="py-2.5 px-3 text-left">تعديل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-900/60">
                      {empTxs.map(t => (
                        <tr key={t.id} className="hover:bg-gray-900/30">
                          <td className="py-2.5 px-3 text-[10px] font-mono text-gray-400 whitespace-nowrap">{t.date}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {t.type === 'ENTITLEMENT' && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900 text-[9px] font-bold">يومية (+)</span>}
                            {t.type === 'WAGE_PAYMENT' && <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900 text-[9px] font-bold">منصرف كاش (-)</span>}
                            {t.type === 'LOAN' && <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-900 text-[9px] font-bold">سلفة (-)</span>}
                            {t.type === 'DRINK_DEDUCTION' && <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-900 text-[9px] font-bold">خصم مشروب (-)</span>}
                            {t.type === 'CONSUMPTION' && <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-900 text-[9px] font-bold">استهلاك (-)</span>}
                            {t.type === 'CUSTOM_DEDUCTION' && <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-900 text-[9px] font-bold">خصم آخر (-)</span>}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-gray-300">{t.notes}</td>
                          <td className={`py-2.5 px-3 font-mono font-bold text-center whitespace-nowrap ${t.type === 'ENTITLEMENT' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.type === 'ENTITLEMENT' ? `+${t.amount}` : `-${t.amount}`} ج.م
                          </td>
                          <td className="py-2.5 px-3 text-left whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => requestDeleteTransaction(t)}
                              className="px-2 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-white text-[10px] font-bold cursor-pointer transition-all"
                            >
                              ❌ تراجع
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-between items-center gap-2 mt-3 pt-3 border-t border-gray-900 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const emp = statementEmployee;
                    setStatementEmployee(null);
                    handleOpenSettlementModal(emp);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-xs cursor-pointer transition-all"
                >
                  ⚖️ الذهاب لتسوية اليومية
                </button>
                <button
                  type="button"
                  onClick={() => setStatementEmployee(null)}
                  className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold rounded-xl text-xs cursor-pointer transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL DIALOG: CONFIRM DELETE / REVERSAL OF EMPLOYEE TRANSACTION --- */}
      {txToDelete && (() => {
        const linkedExpense = dbService.findLinkedExpenseForEmployeeTx(txToDelete);
        return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in" dir="rtl">
            <div className="bg-luxury-card border border-red-900/60 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-900 pb-3 mb-3">
                <h4 className="text-sm font-extrabold text-red-400 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  تأكيد التراجع وحذف المعاملة
                </h4>
                <button
                  type="button"
                  onClick={() => setTxToDelete(null)}
                  className="text-gray-500 hover:text-white cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs bg-black/40 p-3.5 rounded-2xl border border-gray-900 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">الموظف:</span>
                  <strong className="text-white">{txToDelete.employee_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">التاريخ:</span>
                  <strong className="text-gray-300 font-mono">{txToDelete.date}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">القيمة:</span>
                  <strong className={`font-mono ${txToDelete.type === 'ENTITLEMENT' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {txToDelete.type === 'ENTITLEMENT' ? `+${txToDelete.amount}` : `-${txToDelete.amount}`} ج.م
                  </strong>
                </div>
                <div className="pt-1.5 border-t border-gray-900 text-[11px] text-gray-400">
                  البيان: <span className="text-gray-200">{txToDelete.notes}</span>
                </div>
              </div>

              {(txToDelete.type === 'WAGE_PAYMENT' || txToDelete.type === 'LOAN') && linkedExpense && (
                <label className="mb-4 p-3 rounded-2xl bg-emerald-950/20 border border-emerald-700/40 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reverseExpenseOnDelete}
                    onChange={(e) => setReverseExpenseOnDelete(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-500 bg-black border-gray-700 rounded cursor-pointer"
                  />
                  <div className="text-[11px] leading-relaxed">
                    <span className="text-emerald-300 font-extrabold block">
                      💰 إرجاع مبلغ {linkedExpense.amount} ج.م إلى درج النقدية وحذف المصروف المرتبط
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      تم العثور على مصروف مطابق بتاريخ {linkedExpense.expense_date}: «{linkedExpense.description}»
                    </span>
                  </div>
                </label>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={confirmDeleteTransaction}
                  className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-xs cursor-pointer transition-all"
                >
                  ✅ تأكيد الحذف والتعديل
                </button>
                <button
                  type="button"
                  onClick={() => setTxToDelete(null)}
                  className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold rounded-xl text-xs cursor-pointer transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

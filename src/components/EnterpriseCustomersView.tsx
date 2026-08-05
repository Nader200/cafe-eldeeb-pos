import React, { useState, useEffect, useMemo, useRef } from 'react';
import { dbService, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { Customer, WalletTransaction, CustomerNote, CustomerVisit, Invoice, CreditPayment, CustomerCreditTransaction } from '../types';
import { ContactPickerButton } from './ContactPickerButton';
import { getEldeebLogoSvgString, getEldeebLogoDataUrl } from '../lib/logoSvg';
import { 
  Users, UserCheck, Search, Star, Wallet, CreditCard, Calendar, TrendingUp, History, 
  QrCode, Plus, Edit, Archive, RotateCcw, FileText, CheckCircle, Clock, ArrowUpRight, 
  ArrowDownLeft, X, ChevronLeft, Trash, PlusCircle, DollarSign, Camera, User, MapPin, Phone, MessageSquare,
  Printer, Download, AlertTriangle
} from 'lucide-react';

interface EnterpriseCustomersViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  initialTab?: 'active' | 'archived';
}

// Quick pre-set elegant avatars for customers
const PRESET_AVATARS = ['👤', '☕', '🍵', '🥤', '🍰', '🧁', '👑', '⭐', '💼', '✨', '🔥', '🦉'];

export default function EnterpriseCustomersView({
  onShowSuccessAlert,
  onShowWarningAlert,
  initialTab = 'active'
}: EnterpriseCustomersViewProps) {
  // --- States ---
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CustomerCreditTransaction[]>([]);
  const [customersTab, setCustomersTab] = useState<'profiles' | 'wallet_ledger' | 'credit_ledger'>('profiles');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Wallet Ledger Filter States
  const [walletLedgerSearch, setWalletLedgerSearch] = useState('');
  const [walletLedgerTypeFilter, setWalletLedgerTypeFilter] = useState<string>('ALL');
  const [walletLedgerCustomerFilter, setWalletLedgerCustomerFilter] = useState<string>('ALL');

  // Credit Ledger Filter States
  const [creditLedgerSearch, setCreditLedgerSearch] = useState('');
  const [creditLedgerTypeFilter, setCreditLedgerTypeFilter] = useState<string>('ALL');
  const [creditLedgerCustomerFilter, setCreditLedgerCustomerFilter] = useState<string>('ALL');
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'vip' | 'wallet' | 'credit' | 'inactive' | 'archived'>(
    initialTab === 'archived' ? 'archived' : 'all'
  );

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletOpType, setWalletOpType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'MANUAL_ADJUSTMENT'>('DEPOSIT');
  const [walletAmount, setWalletAmount] = useState<number>(0);
  const [walletNotes, setWalletNotes] = useState('');

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditPayAmount, setCreditPayAmount] = useState<number>(0);
  const [creditNotes, setCreditNotes] = useState('');

  // Manual Credit Adjustment Modal States
  const [showCreditAdjustModal, setShowCreditAdjustModal] = useState(false);
  const [creditAdjustType, setCreditAdjustType] = useState<'MANUAL_ADJUSTMENT' | 'CORRECTION' | 'REFUND'>('MANUAL_ADJUSTMENT');
  const [creditAdjustAmount, setCreditAdjustAmount] = useState<number>(0);
  const [creditAdjustNotes, setCreditAdjustNotes] = useState('');

  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Custom Confirmation Modal State (Safe for iframe and web previews)
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    confirmBg?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'تأكيد',
    onConfirm: () => {}
  });

  // New Note State
  const [newNoteText, setNewNoteText] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('مسؤول النظام');

  // New Visit State
  const [showAddVisitModal, setShowAddVisitModal] = useState(false);
  const [visitNotes, setVisitNotes] = useState('');

  // Form Fields for Add/Edit Customer
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    whatsapp: '',
    address: '',
    notes: '',
    credit_limit: 1000,
    is_vip: false,
    photo: '👤',
    birthday: ''
  });

  // Load active cashier name from settings or default
  const [cashierName, setCashierName] = useState('الكاشير');

  useEffect(() => {
    try {
      const settings = dbService.getSettings();
      if (settings && settings.owner_name) {
        setCashierName(settings.owner_name);
        setNoteAuthor(settings.owner_name);
      }
    } catch (e) {
      console.error(e);
    }
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
    const allCustomers = dbService.getCustomers();
    setCustomers(allCustomers);
    
    // Load invoices to calculate stats
    const allInvoices = dbService.getInvoices(true); // include open
    setInvoices(allInvoices);

    // Load credit payments
    const allPayments = dbService.getCreditPayments();
    setCreditPayments(allPayments);

    // Load wallet transactions
    const allWalletTxs = dbService.getWalletTransactions();
    setWalletTransactions(allWalletTxs);

    // Load credit transactions
    const allCreditTxs = dbService.getCreditTransactions();
    setCreditTransactions(allCreditTxs);

    // Select first customer as default if none selected
    if (allCustomers.length > 0 && !selectedCustomerId) {
      const activeCusts = allCustomers.filter(c => !c.is_archived);
      if (activeCusts.length > 0) {
        setSelectedCustomerId(activeCusts[0].id);
      } else {
        setSelectedCustomerId(allCustomers[0].id);
      }
    }
  };

  // Get currently selected customer
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Calculate Customer Stats
  const selectedCustomerStats = useMemo(() => {
    if (!selectedCustomer) return null;
    
    // Filter invoices completed for this customer
    const custInvoices = invoices.filter(inv => inv.customer_id === selectedCustomer.id && inv.invoice_status !== 'VOID');
    const visitsCount = custInvoices.length;
    
    // Filter credit transactions for this customer
    const custCreditTxs = creditTransactions.filter(tx => tx.customer_id === selectedCustomer.id);
    
    // Total credit purchases (INVOICE transaction type)
    const totalPurchases = custCreditTxs
      .filter(tx => tx.transaction_type === 'INVOICE')
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Find last invoice
    const lastInvoice = custInvoices.length > 0 
      ? [...custInvoices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
      : null;

    const avgInvoice = visitsCount > 0 ? Math.round(totalPurchases / visitsCount) : 0;

    // Total Paid calculations (Actual payments only)
    const totalPaid = custCreditTxs
      .filter(tx => tx.transaction_type === 'PAYMENT')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalPurchases,
      visitsCount,
      avgInvoice,
      lastInvoice,
      totalPaid
    };
  }, [selectedCustomer, invoices, creditTransactions]);

  // Unified activity timeline for selected customer
  const customerTimeline = useMemo(() => {
    if (!selectedCustomer) return [];

    const timeline: Array<{
      id: string;
      type: 'INVOICE' | 'WALLET_TX' | 'CREDIT_PAYMENT' | 'VISIT' | 'UPDATE';
      title: string;
      description: string;
      amount?: number;
      date: string;
      rawDate: string;
    }> = [];

    // 1. Invoices
    const custInvoices = invoices.filter(inv => inv.customer_id === selectedCustomer.id);
    custInvoices.forEach(inv => {
      timeline.push({
        id: `timeline_inv_${inv.id}`,
        type: 'INVOICE',
        title: `إنشاء فاتورة #${inv.invoice_number}`,
        description: `بقيمة ${inv.total} ج.م • حالة الدفع: ${inv.payment_status === 'PAID' ? 'مدفوعة كاملة' : inv.payment_status === 'PARTIALLY_PAID' ? 'مدفوعة جزئياً' : 'دين آجل'} • الكاشير: ${inv.cashier_name || 'السيستم'}`,
        amount: inv.total,
        date: inv.created_at.replace('T', ' ').substring(0, 16),
        rawDate: inv.created_at
      });
    });

    // 2. Wallet Transactions
    const custWalletTxs = walletTransactions.filter(tx => tx.customer_id === selectedCustomer.id);
    custWalletTxs.forEach(tx => {
      let title = '';
      if (tx.transaction_type === 'DEPOSIT') title = 'إيداع في المحفظة 💰';
      else if (tx.transaction_type === 'WITHDRAWAL') title = 'سحب من المحفظة 💸';
      else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') title = 'تعديل رصيد يدوي ⚙️';
      else if (tx.transaction_type === 'INVOICE_DEDUCTION') title = 'خصم تلقائي لفاتورة 🧾';
      else if (tx.transaction_type === 'INVOICE_REFUND') title = 'استرجاع رصيد محفظة 🔄';

      timeline.push({
        id: `timeline_wtx_${tx.id}`,
        type: 'WALLET_TX',
        title,
        description: `${tx.notes || 'تسوية رصيد المحفظة الآلي'} • الرصيد السابق: ${tx.previous_balance} ج.م • الرصيد الجديد: ${tx.new_balance} ج.م`,
        amount: tx.amount,
        date: tx.created_at.replace('T', ' ').substring(0, 16),
        rawDate: tx.created_at
      });
    });

    // 3. Credit Payments
    const custPayments = creditPayments.filter(p => p.customer_id === selectedCustomer.id);
    custPayments.forEach(p => {
      timeline.push({
        id: `timeline_pay_${p.id}`,
        type: 'CREDIT_PAYMENT',
        title: `سداد دين نقدي ✅`,
        description: `تم سداد مبلغ ${p.amount} ج.م من الديون المستحقة • طريقة الدفع: ${p.payment_method_id === 'vodafone' ? 'فودافون كاش' : 'نقدي'} • ملاحظات: ${p.notes || 'سداد مديونيات'}`,
        amount: p.amount,
        date: p.created_at.replace('T', ' ').substring(0, 16),
        rawDate: p.created_at
      });
    });

    // 4. Custom manual visits
    const custVisits = dbService.getCustomerVisits(selectedCustomer.id);
    custVisits.forEach(v => {
      // Avoid duplicate listing with automatic invoice visits by filtering invoice_id
      if (v.invoice_id) return;
      timeline.push({
        id: `timeline_visit_${v.id}`,
        type: 'VISIT',
        title: `تسجيل زيارة مباشرة 🏪`,
        description: v.notes || 'زيارة عمل أو لقاء للزبون بالكافيه بدون معاملات شراء مباشرة',
        date: v.created_at.replace('T', ' ').substring(0, 16),
        rawDate: v.created_at
      });
    });

    // 5. Customer Profile Creation / Updates
    timeline.push({
      id: `timeline_create_${selectedCustomer.id}`,
      type: 'UPDATE',
      title: 'تسجيل العميل بالمنظومة 🆕',
      description: `تم تسجيل العميل باسم: ${selectedCustomer.full_name} وبحد ائتماني ${selectedCustomer.credit_limit} ج.م`,
      date: selectedCustomer.created_at.replace('T', ' ').substring(0, 16),
      rawDate: selectedCustomer.created_at
    });

    // Sort descending by date
    return timeline.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [selectedCustomer, invoices, walletTransactions, creditPayments]);

  // Load custom notes for selected customer
  const customerNotes = useMemo(() => {
    if (!selectedCustomer) return [];
    return dbService.getCustomerNotes(selectedCustomer.id);
  }, [selectedCustomer]);

  // Wallet Dashboard metrics
  const walletDashboardMetrics = useMemo(() => {
    const totalBalances = customers.reduce((sum, c) => sum + (c.wallet_balance || 0), 0);
    const activeWalletsCount = customers.filter(c => (c.wallet_balance || 0) > 0).length;
    
    // Filter out transactions based on type
    const deposits = walletTransactions.filter(tx => tx.transaction_type === 'DEPOSIT');
    const withdrawals = walletTransactions.filter(tx => tx.transaction_type === 'WITHDRAWAL');
    const deductions = walletTransactions.filter(tx => tx.transaction_type === 'INVOICE_DEDUCTION' || tx.transaction_type === 'INVOICE_PAYMENT');
    
    const totalDeposits = deposits.reduce((sum, tx) => sum + tx.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, tx) => sum + tx.amount, 0);
    const totalDeductions = deductions.reduce((sum, tx) => sum + tx.amount, 0);
    
    const lastDeposit = deposits.length > 0 ? deposits[deposits.length - 1] : null;
    const lastWithdraw = withdrawals.length > 0 ? withdrawals[withdrawals.length - 1] : null;
    
    return {
      totalBalances,
      activeWalletsCount,
      totalDeposits,
      totalWithdrawals,
      totalDeductions,
      lastDepositAmount: lastDeposit ? lastDeposit.amount : 0,
      lastDepositDate: lastDeposit ? lastDeposit.date : null,
      lastWithdrawAmount: lastWithdraw ? lastWithdraw.amount : 0,
      lastWithdrawDate: lastWithdraw ? lastWithdraw.date : null,
    };
  }, [customers, walletTransactions]);

  // Filtered Wallet Transactions for Statement/Ledger
  const filteredWalletTransactions = useMemo(() => {
    return walletTransactions.filter(tx => {
      // 1. Filter by Search Query (customer name or notes)
      const q = walletLedgerSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        tx.customer_name.toLowerCase().includes(q) || 
        (tx.notes && tx.notes.toLowerCase().includes(q)) ||
        tx.id.toLowerCase().includes(q);
        
      // 2. Filter by Transaction Type
      const matchesType = walletLedgerTypeFilter === 'ALL' || tx.transaction_type === walletLedgerTypeFilter;
      
      // 3. Filter by Customer ID
      const matchesCustomer = walletLedgerCustomerFilter === 'ALL' || tx.customer_id === walletLedgerCustomerFilter;
      
      return matchesSearch && matchesType && matchesCustomer;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // sort newest first
  }, [walletTransactions, walletLedgerSearch, walletLedgerTypeFilter, walletLedgerCustomerFilter]);

  // Credit Dashboard metrics
  const creditDashboardMetrics = useMemo(() => {
    const totalBalances = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    const activeDebtorsCount = customers.filter(c => (c.current_balance || 0) > 0).length;
    const totalCreditLimit = customers.reduce((sum, c) => sum + (c.credit_limit || 0), 0);
    
    // Filter credit transactions based on type
    const invoicesList = creditTransactions.filter(tx => tx.transaction_type === 'INVOICE');
    const paymentsList = creditTransactions.filter(tx => tx.transaction_type === 'PAYMENT');
    
    const totalInvoiced = invoicesList.reduce((sum, tx) => sum + tx.amount, 0);
    const totalPayments = paymentsList.reduce((sum, tx) => sum + tx.amount, 0);
    
    const lastInvoice = invoicesList.length > 0 ? invoicesList[invoicesList.length - 1] : null;
    const lastPayment = paymentsList.length > 0 ? paymentsList[paymentsList.length - 1] : null;
    
    return {
      totalBalances,
      activeDebtorsCount,
      totalCreditLimit,
      totalInvoiced,
      totalPayments,
      lastInvoiceAmount: lastInvoice ? lastInvoice.amount : 0,
      lastInvoiceDate: lastInvoice ? lastInvoice.date : null,
      lastPaymentAmount: lastPayment ? lastPayment.amount : 0,
      lastPaymentDate: lastPayment ? lastPayment.date : null,
    };
  }, [customers, creditTransactions]);

  // Filtered Credit Transactions for Statement/Ledger
  const filteredCreditTransactions = useMemo(() => {
    return creditTransactions.filter(tx => {
      // 1. Filter by Search Query
      const q = creditLedgerSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        tx.customer_name.toLowerCase().includes(q) || 
        (tx.notes && tx.notes.toLowerCase().includes(q)) ||
        tx.id.toLowerCase().includes(q);
        
      // 2. Filter by Transaction Type
      const matchesType = creditLedgerTypeFilter === 'ALL' || tx.transaction_type === creditLedgerTypeFilter;
      
      // 3. Filter by Customer ID
      const matchesCustomer = creditLedgerCustomerFilter === 'ALL' || tx.customer_id === creditLedgerCustomerFilter;
      
      return matchesSearch && matchesType && matchesCustomer;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // newest first
  }, [creditTransactions, creditLedgerSearch, creditLedgerTypeFilter, creditLedgerCustomerFilter]);

  const handleExportCreditLedgerToCSV = () => {
    try {
      let csvContent = "\uFEFF"; // UTF-8 BOM
      csvContent += "رقم الحركة,اسم العميل,التاريخ,الوقت,نوع الحركة,المبلغ,الرصيد السابق,الرصيد الجديد,بواسطة,ملاحظات\n";
      
      filteredCreditTransactions.forEach(tx => {
        let typeStr = tx.transaction_type;
        if (tx.transaction_type === 'INVOICE') typeStr = 'فاتورة آجل';
        else if (tx.transaction_type === 'PAYMENT') typeStr = 'سداد نقدي';
        else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeStr = 'تسوية مديونية';
        else if (tx.transaction_type === 'CORRECTION') typeStr = 'تصحيح رصيد';
        else if (tx.transaction_type === 'REFUND') typeStr = 'استرداد مديونية';
        
        csvContent += `"${tx.id}","${tx.customer_name}","${tx.date}","${tx.time}","${typeStr}",${tx.amount},${tx.previous_balance},${tx.new_balance},"${tx.created_by || ''}","${tx.notes || ''}"\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `credit_ledger_statement_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowSuccessAlert('تم تصدير كشف حركة الحساب الآجل بصيغة Excel/CSV بنجاح!');
    } catch (e) {
      console.error(e);
      onShowWarningAlert('حدث خطأ أثناء تصدير كشف حركة المديونيات.');
    }
  };

  const handlePrintCreditLedgerReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const todayStr = new Date().toLocaleDateString('ar-EG');
    
    let reportRows = '';
    filteredCreditTransactions.forEach((tx, idx) => {
      let typeStr = tx.transaction_type;
      if (tx.transaction_type === 'INVOICE') typeStr = 'فاتورة آجل 🧾';
      else if (tx.transaction_type === 'PAYMENT') typeStr = 'سداد نقدي 💵';
      else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeStr = 'تسوية مديونية ⚙️';
      else if (tx.transaction_type === 'CORRECTION') typeStr = 'تصحيح رصيد 🔧';
      else if (tx.transaction_type === 'REFUND') typeStr = 'استرداد مديونية 🔄';
      
      reportRows += `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${tx.customer_name}</b></td>
          <td>${tx.date} - ${tx.time}</td>
          <td>${typeStr}</td>
          <td style="color: ${tx.transaction_type === 'INVOICE' || tx.transaction_type === 'MANUAL_ADJUSTMENT' || tx.transaction_type === 'CORRECTION' ? '#dc2626' : '#059669'}; font-weight: bold;">${tx.amount} ج.م</td>
          <td>${tx.previous_balance} ج.م</td>
          <td style="font-weight: bold;">${tx.new_balance} ج.م</td>
          <td>${tx.notes || ''}</td>
          <td>${tx.created_by || ''}</td>
        </tr>
      `;
    });
    
    const docContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>تقرير كشف مديونيات الحساب الآجل الشامل</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; background: #fff; }
          .header { text-align: center; border-bottom: 3px double #d4af37; padding-bottom: 20px; margin-bottom: 25px; }
          .header h1 { color: #111; margin: 0; font-size: 26px; font-weight: 800; }
          .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
          .ledger-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          .ledger-table th { background: #111; color: #fff; text-align: right; padding: 8px; font-weight: bold; border: 1px solid #111; }
          .ledger-table td { padding: 8px; border: 1px solid #ddd; }
          .ledger-table tr:nth-child(even) { background: #fcfcfc; }
          .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${getEldeebLogoDataUrl(400, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 240px; width: auto; margin: 0 auto 15px; display: block; filter: contrast(150%) brightness(92%) saturate(130%) drop-shadow(0 4px 12px rgba(0,0,0,0.3)); -webkit-filter: contrast(150%) brightness(92%) saturate(130%) drop-shadow(0 4px 12px rgba(0,0,0,0.3)); image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" />
          <h1>كافيه الديب POS • Cafe Eldeeb</h1>
          <p>تقرير كشف مديونيات الحساب الآجل وحركات الذمة المالية للعملاء</p>
          <p>تاريخ استخراج التقرير: ${todayStr} | إجمالي عدد العمليات المشمولة: ${filteredCreditTransactions.length}</p>
        </div>
        
        <table class="ledger-table">
          <thead>
            <tr>
              <th>#</th>
              <th>اسم العميل</th>
              <th>التاريخ والوقت</th>
              <th>نوع الحركة</th>
              <th>المبلغ</th>
              <th>الرصيد السابق</th>
              <th>الرصيد الجديد</th>
              <th>بيان وملاحظات الحركة</th>
              <th>بواسطة</th>
            </tr>
          </thead>
          <tbody>
            ${reportRows}
          </tbody>
        </table>
        
        <div class="footer">
          <p>كشف الحساب صادر آلياً من كافيه الديب - الدفتر التجاري الإلكتروني للذمم المالية الآجلة.</p>
          <p>شكراً لتعاملكم الراقي معنا 🌹</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(docContent);
    printWindow.document.close();
  };

  const handleExportWalletLedgerToCSV = () => {
    try {
      let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Arabic support
      csvContent += "رقم الحركة,اسم العميل,التاريخ,الوقت,نوع الحركة,المبلغ,الرصيد السابق,الرصيد الجديد,بواسطة,ملاحظات\n";
      
      filteredWalletTransactions.forEach(tx => {
        let typeStr = tx.transaction_type;
        if (tx.transaction_type === 'DEPOSIT') typeStr = 'إيداع';
        else if (tx.transaction_type === 'WITHDRAWAL') typeStr = 'سحب';
        else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeStr = 'تعديل يدوي';
        else if (tx.transaction_type === 'INVOICE_DEDUCTION') typeStr = 'خصم تلقائي';
        else if (tx.transaction_type === 'INVOICE_REFUND') typeStr = 'استرجاع رصيد';
        else if (tx.transaction_type === 'INVOICE_PAYMENT') typeStr = 'سداد من المحفظة';
        else if (tx.transaction_type === 'REFUND') typeStr = 'استرجاع';
        else if (tx.transaction_type === 'BONUS') typeStr = 'رصيد إضافي/بونص';
        else if (tx.transaction_type === 'CORRECTION') typeStr = 'تصحيح رصيد';
        
        csvContent += `"${tx.id}","${tx.customer_name}","${tx.date}","${tx.time}","${typeStr}",${tx.amount},${tx.previous_balance},${tx.new_balance},"${tx.user || ''}","${tx.notes || ''}"\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `wallet_ledger_statement_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowSuccessAlert('تم تصدير كشف حركة المحفظة بصيغة Excel/CSV بنجاح!');
    } catch (e) {
      console.error(e);
      onShowWarningAlert('حدث خطأ أثناء تصدير كشف الحركات.');
    }
  };

  const handlePrintWalletLedgerReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const todayStr = new Date().toLocaleDateString('ar-EG');
    
    let reportRows = '';
    filteredWalletTransactions.forEach((tx, idx) => {
      let typeStr = tx.transaction_type;
      if (tx.transaction_type === 'DEPOSIT') typeStr = 'إيداع 💰';
      else if (tx.transaction_type === 'WITHDRAWAL') typeStr = 'سحب 💸';
      else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeStr = 'تعديل يدوي ⚙️';
      else if (tx.transaction_type === 'INVOICE_DEDUCTION') typeStr = 'خصم تلقائي 🧾';
      else if (tx.transaction_type === 'INVOICE_REFUND') typeStr = 'استرجاع رصيد 🔄';
      else if (tx.transaction_type === 'INVOICE_PAYMENT') typeStr = 'سداد من المحفظة 🧾';
      else if (tx.transaction_type === 'REFUND') typeStr = 'استرجاع 🔄';
      else if (tx.transaction_type === 'BONUS') typeStr = 'بونص/هدية 🎁';
      else if (tx.transaction_type === 'CORRECTION') typeStr = 'تصحيح رصيد 🔧';
      
      reportRows += `
        <tr>
          <td>${idx + 1}</td>
          <td><b>${tx.customer_name}</b></td>
          <td>${tx.date} - ${tx.time}</td>
          <td>${typeStr}</td>
          <td style="color: ${tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'BONUS' ? '#059669' : '#dc2626'}; font-weight: bold;">${tx.amount} ج.م</td>
          <td>${tx.previous_balance} ج.م</td>
          <td style="font-weight: bold;">${tx.new_balance} ج.م</td>
          <td>${tx.notes || ''}</td>
          <td>${tx.user || ''}</td>
        </tr>
      `;
    });
    
    const docContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>تقرير كشف حركات المحفظة الملوكية الشامل</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; background: #fff; }
          .header { text-align: center; border-bottom: 3px double #d4af37; padding-bottom: 20px; margin-bottom: 25px; }
          .header h1 { color: #111; margin: 0; font-size: 26px; font-weight: 800; }
          .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
          .ledger-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          .ledger-table th { background: #111; color: #fff; text-align: right; padding: 8px; font-weight: bold; border: 1px solid #111; }
          .ledger-table td { padding: 8px; border: 1px solid #ddd; }
          .ledger-table tr:nth-child(even) { background: #fcfcfc; }
          .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${getEldeebLogoDataUrl(400, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 240px; width: auto; margin: 0 auto 15px; display: block; filter: contrast(150%) brightness(92%) saturate(130%) drop-shadow(0 4px 12px rgba(0,0,0,0.3)); -webkit-filter: contrast(150%) brightness(92%) saturate(130%) drop-shadow(0 4px 12px rgba(0,0,0,0.3)); image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" />
          <h1>كافيه الديب POS • Cafe Eldeeb</h1>
          <p>تقرير كشف حركات المحفظة الإلكترونية الشامل للزبائن</p>
          <p>تاريخ استخراج التقرير: ${todayStr} | إجمالي عدد العمليات المشمولة: ${filteredWalletTransactions.length}</p>
        </div>
        
        <table class="ledger-table">
          <thead>
            <tr>
              <th>#</th>
              <th>العميل</th>
              <th>التاريخ والوقت</th>
              <th>نوع العملية</th>
              <th>مبلغ الحركة</th>
              <th>الرصيد السابق</th>
              <th>الرصيد بعد الحركة</th>
              <th>تفاصيل وملاحظات الحركة</th>
              <th>بواسطة</th>
            </tr>
          </thead>
          <tbody>
            ${reportRows || '<tr><td colspan="9" style="text-align: center;">لا توجد حركات محفظة مطابقة لخيارات الفلترة المحددة</td></tr>'}
          </tbody>
        </table>
        
        <div class="footer">
          <p>تم استخراج التقرير آلياً من كافيه الديب - الدفتر التجاري الإلكتروني.</p>
          <p>شاكرين تعاونكم الراقي معنا 🌹</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(docContent);
    printWindow.document.close();
  };

  // Filter and Search Customers
  const filteredCustomers = useMemo(() => {
    // 1. Filter by Query
    let result = customers.filter(c => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        c.full_name.toLowerCase().includes(query) ||
        c.phone.includes(query) ||
        (c.whatsapp && c.whatsapp.includes(query)) ||
        c.id.toLowerCase().includes(query)
      );
    });

    // 2. Filter by Tab
    result = result.filter(c => {
      if (activeFilter === 'archived') return !!c.is_archived;
      
      // If not looking at archived tab, exclude archived customers
      if (c.is_archived) return false;

      switch (activeFilter) {
        case 'vip':
          return !!c.is_vip;
        case 'wallet':
          return (c.wallet_balance || 0) > 0;
        case 'credit':
          return c.current_balance > 0;
        case 'inactive':
          // Visited more than 30 days ago or last_visit empty
          if (!c.last_visit) return true;
          const daysDiff = (Date.now() - new Date(c.last_visit).getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff > 30;
        case 'all':
        default:
          return true;
      }
    });

    // 3. Priority Sorting: VIPs always appear first, then sorted alphabetically/chronologically
    return result.sort((a, b) => {
      if (a.is_vip && !b.is_vip) return -1;
      if (!a.is_vip && b.is_vip) return 1;
      return a.full_name.localeCompare(b.full_name, 'ar');
    });
  }, [customers, searchQuery, activeFilter]);

  // Handle Add/Edit Open Modal
  const openAddEditModal = (cust: Customer | null = null) => {
    if (cust) {
      setEditingCustomer(cust);
      setFormData({
        full_name: cust.full_name,
        phone: cust.phone,
        whatsapp: cust.whatsapp || '',
        address: cust.address,
        notes: cust.notes,
        credit_limit: cust.credit_limit,
        is_vip: !!cust.is_vip,
        photo: cust.photo || '👤',
        birthday: cust.birthday || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        full_name: '',
        phone: '',
        whatsapp: '',
        address: '',
        notes: '',
        credit_limit: 1000,
        is_vip: false,
        photo: '👤',
        birthday: ''
      });
    }
    setShowAddEditModal(true);
  };

  // Save Add/Edit Customer form
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      onShowWarningAlert('يرجى إدخال اسم العميل الكامل');
      return;
    }
    if (!formData.phone.trim()) {
      onShowWarningAlert('يرجى إدخال رقم الهاتف');
      return;
    }

    const customerPayload: Customer = editingCustomer
      ? {
          ...editingCustomer,
          ...formData,
          updated_at: new Date().toISOString()
        }
      : {
          id: `cust_${Date.now()}`,
          ...formData,
          current_balance: 0,
          wallet_balance: 0,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

    const updated = dbService.saveCustomer(customerPayload);
    setCustomers(updated);
    onShowSuccessAlert(editingCustomer ? 'تم تحديث ملف العميل بنجاح!' : 'تم تسجيل العميل الجديد بنجاح ملوكي!');
    setShowAddEditModal(false);
    
    if (!editingCustomer) {
      // Auto select the newly created customer
      setSelectedCustomerId(customerPayload.id);
    }
  };

  // Archive Customer Toggle
  const handleArchiveCustomer = (cust: Customer) => {
    const isArchiving = !cust.is_archived;
    const title = isArchiving ? 'أرشفة العميل' : 'استعادة العميل من الأرشيف';
    const confirmMsg = isArchiving 
      ? `هل أنت متأكد من أرشفة العميل "${cust.full_name}"؟ لن تضيع أي حسابات مالية أو تفاصيل مديونيات خاصة به ويمكن استعادته لاحقاً.`
      : `هل أنت متأكد من استعادة العميل الملوكي "${cust.full_name}" من الأرشيف؟`;
      
    setConfirmModalState({
      isOpen: true,
      title,
      message: confirmMsg,
      confirmText: isArchiving ? 'نعم، أرشفة العميل' : 'نعم، استعادة العميل',
      confirmBg: isArchiving ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => {
        const updatedCust: Customer = {
          ...cust,
          is_archived: isArchiving,
          updated_at: new Date().toISOString()
        };
        const list = dbService.saveCustomer(updatedCust);
        setCustomers(list);
        
        // Update selected customer ID so the detail panel updates immediately
        if (isArchiving && activeFilter !== 'archived') {
          const remainingActive = list.filter(c => !c.is_archived && c.id !== cust.id);
          setSelectedCustomerId(remainingActive[0]?.id || null);
        } else if (!isArchiving && activeFilter === 'archived') {
          const remainingArchived = list.filter(c => !!c.is_archived && c.id !== cust.id);
          setSelectedCustomerId(remainingArchived[0]?.id || null);
        }

        onShowSuccessAlert(isArchiving ? 'تم أرشفة العميل بنجاح ملوكي لحين الطلب.' : 'تم استعادة ملف العميل بنجاح!');
        loadData();
      }
    });
  };

  // Delete Customer Handler with strict validation rules
  const handleDeleteCustomer = (cust: Customer) => {
    const custInvoices = invoices.filter(inv => inv.customer_id === cust.id);
    const custCreditTxs = creditTransactions.filter(tx => tx.customer_id === cust.id);
    const custWalletTxs = walletTransactions.filter(tx => tx.customer_id === cust.id);
    const custPayments = creditPayments.filter(p => p.customer_id === cust.id);

    const hasInvoices = custInvoices.length > 0;
    const hasDebt = (cust.current_balance || 0) > 0 || custCreditTxs.length > 0;
    const hasPayments = custPayments.length > 0;
    const hasWallet = (cust.wallet_balance || 0) > 0 || custWalletTxs.length > 0;

    const hasFinancialData = hasInvoices || hasDebt || hasPayments || hasWallet;

    if (hasFinancialData) {
      onShowWarningAlert('لا يمكن حذف العميل لأنه يحتوي على بيانات مالية أو فواتير أو كشف حساب. يمكنك أرشفة العميل بدلاً من ذلك للحفاظ على السجلات المالية.');
      return;
    }

    setConfirmModalState({
      isOpen: true,
      title: 'حذف العميل نهائياً',
      message: `هل أنت متأكد من حذف حساب العميل "${cust.full_name}" نهائياً؟ سيتم إزالة ملفه تماماً من النظام.`,
      confirmText: 'نعم، حذف العميل',
      confirmBg: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        dbService.deleteCustomer(cust.id);
        onShowSuccessAlert(`تم حذف العميل "${cust.full_name}" بنجاح.`);

        const remainingCustomers = dbService.getCustomers();
        setCustomers(remainingCustomers);

        if (activeFilter === 'archived') {
          const remainingArchived = remainingCustomers.filter(c => !!c.is_archived && c.id !== cust.id);
          setSelectedCustomerId(remainingArchived[0]?.id || null);
        } else {
          const remainingActive = remainingCustomers.filter(c => !c.is_archived && c.id !== cust.id);
          setSelectedCustomerId(remainingActive[0]?.id || null);
        }

        loadData();
      }
    });
  };

  // Toggle VIP Status
  const handleToggleVip = (cust: Customer) => {
    const updatedCust: Customer = {
      ...cust,
      is_vip: !cust.is_vip,
      updated_at: new Date().toISOString()
    };
    const list = dbService.saveCustomer(updatedCust);
    setCustomers(list);
    onShowSuccessAlert(cust.is_vip ? 'تم إزالة التقييم الذهبي للعميل' : 'تم منح العميل النجمة الذهبية لكبار الشخصيات VIP ⭐');
  };

  // Credit Manual Adjustment Handler
  const handleCreditAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (creditAdjustAmount <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ مالي صالح أكبر من الصفر لإجراء التسوية');
      return;
    }

    const tx = dbService.addManualCreditAdjustment(
      selectedCustomer.id,
      creditAdjustType,
      creditAdjustAmount,
      creditAdjustNotes.trim() || 'تسوية وتعديل يدوي إداري على حساب المديونية الآجل',
      cashierName
    );

    if (tx) {
      onShowSuccessAlert('تم تسجيل حركة التسوية اليدوية للمديونية بنجاح وتحديث الحساب الجاري ملوكي!');
      setShowCreditAdjustModal(false);
      setCreditAdjustAmount(0);
      setCreditAdjustNotes('');
      loadData();
    } else {
      onShowWarningAlert('حدث خطأ أثناء إجراء التسوية اليدوية للعميل.');
    }
  };

  // Wallet Operations: Deposit / Withdrawal / Manual
  const handleWalletOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (walletAmount <= 0) {
      onShowWarningAlert('يرجى إدخال قيمة مالية صالحة أكبر من الصفر');
      return;
    }

    const currentBal = selectedCustomer.wallet_balance || 0;
    const currentDebt = selectedCustomer.current_balance || 0;

    if (walletOpType === 'DEPOSIT') {
      if (currentDebt > 0) {
        // Auto offset debt first
        const debtPaid = Math.min(walletAmount, currentDebt);
        const remainingDeposit = walletAmount - debtPaid;
        const newWalletBal = currentBal + remainingDeposit;

        // 1. Record Wallet Deposit transaction first (full amount deposited or remaining)
        dbService.saveWalletTransaction({
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.full_name,
          transaction_type: 'DEPOSIT',
          amount: walletAmount,
          previous_balance: currentBal,
          new_balance: newWalletBal,
          notes: walletNotes.trim() || `شحن محفظة بقيمة ${walletAmount} ج.م (تم خصم ${debtPaid} ج.م لسداد الدين)`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          user: cashierName
        });

        // 2. Record Credit Payment for debt clearance
        dbService.addCreditPayment(
          selectedCustomer.id,
          debtPaid,
          `تسوية دين تلقائية من مبلغ شحن المحفظة بقيمة ${debtPaid} ج.م`,
          cashierName
        );

        onShowSuccessAlert(`تم شحن المحفظة بنجاح! تم تسوية دين بقيمة ${debtPaid} ج.م وإضافة ${remainingDeposit} ج.م للمحفظة.`);
      } else {
        const newBal = currentBal + walletAmount;
        dbService.saveWalletTransaction({
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.full_name,
          transaction_type: 'DEPOSIT',
          amount: walletAmount,
          previous_balance: currentBal,
          new_balance: newBal,
          notes: walletNotes.trim() || 'شحن رصيد نقدي للمحفظة',
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          user: cashierName
        });
        onShowSuccessAlert('تم تحديث المحفظة الملوكية للعميل وتسجيل الحركة المالية بالخزينة!');
      }
    } else if (walletOpType === 'WITHDRAWAL') {
      if (currentBal < walletAmount) {
        onShowWarningAlert('عذراً، الرصيد المتوفر بالمحفظة غير كافٍ لإجراء عملية السحب!');
        return;
      }
      const newBal = currentBal - walletAmount;
      const desc = walletNotes.trim() || 'خصم / سحب من رصيد المحفظة';

      dbService.saveWalletTransaction({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.full_name,
        transaction_type: 'WITHDRAWAL',
        amount: walletAmount,
        previous_balance: currentBal,
        new_balance: newBal,
        notes: desc,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: cashierName
      });
      onShowSuccessAlert('تم خصم المبلغ من المحفظة الملوكية للعميل وتحديث الرصيد مباشرة!');
    } else {
      // Manual adjustment
      const newBal = walletAmount; // sets balance directly
      const desc = walletNotes.trim() || `تعديل يدوي لرصيد المحفظة من ${currentBal} ج.م إلى ${walletAmount} ج.م`;

      dbService.saveWalletTransaction({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.full_name,
        transaction_type: 'MANUAL_ADJUSTMENT',
        amount: Math.abs(newBal - currentBal),
        previous_balance: currentBal,
        new_balance: newBal,
        notes: desc,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: cashierName
      });
      onShowSuccessAlert('تم تحديث المحفظة الملوكية للعميل وتسجيل الحركة المالية بالخزينة!');
    }

    setShowWalletModal(false);
    setWalletAmount(0);
    setWalletNotes('');
    loadData();
  };

  // Pay Dues / Credit Payments
  const executeCreditPaymentProcess = (amountToPay: number) => {
    if (!selectedCustomer) return;
    const currentOwed = selectedCustomer.current_balance;
    const paidAmount = Math.min(amountToPay, currentOwed);
    const excessAmount = amountToPay - paidAmount;

    // 1. Process credit payment for the owed amount
    if (paidAmount > 0) {
      dbService.addCreditPayment(
        selectedCustomer.id,
        paidAmount,
        creditNotes.trim() || 'سداد جزء من الحساب الآجل للعميل',
        cashierName
      );
    }

    // 2. Excess amount goes to Wallet
    if (excessAmount > 0) {
      const currentWallet = selectedCustomer.wallet_balance || 0;
      const newWalletBal = currentWallet + excessAmount;

      dbService.saveWalletTransaction({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.full_name,
        transaction_type: 'DEPOSIT',
        amount: excessAmount,
        previous_balance: currentWallet,
        new_balance: newWalletBal,
        notes: `رصيد زائد متبقي من دفعة سداد آجل بقيمة ${amountToPay} ج.م`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: cashierName
      });
    }

    onShowSuccessAlert('تمت عملية سداد المديونية بنجاح وتحديث الحساب الجاري ملوكي!');
    setShowCreditModal(false);
    setCreditPayAmount(0);
    setCreditNotes('');
    loadData();
  };

  const handleCreditPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (creditPayAmount <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ دفع صالح أكبر من الصفر');
      return;
    }
    if (creditPayAmount > selectedCustomer.current_balance) {
      setConfirmModalState({
        isOpen: true,
        title: 'سداد مبلغ زائد للمحفظة',
        message: `المبلغ المدخل (${creditPayAmount} ج.م) يتجاوز مديونية العميل الحالية (${selectedCustomer.current_balance} ج.م). هل تريد سداد المديونية بالكامل وحفظ المبلغ المتبقي كدفعة مقدمة بالمحفظة؟`,
        confirmText: 'تأكيد السداد والتحويل للمحفظة',
        onConfirm: () => executeCreditPaymentProcess(creditPayAmount)
      });
      return;
    }

    executeCreditPaymentProcess(creditPayAmount);
  };

  // Pay Credit Dues using Wallet Balance
  const handlePayCreditFromWallet = () => {
    if (!selectedCustomer) return;
    const walletBal = selectedCustomer.wallet_balance || 0;
    const owedBal = selectedCustomer.current_balance;

    if (walletBal <= 0) {
      onShowWarningAlert('لا يوجد رصيد كافٍ بمحفظة العميل للقيام بالسداد المباشر.');
      return;
    }
    if (owedBal <= 0) {
      onShowWarningAlert('لا توجد مديونيات مستحقة على العميل حالياً لسدادها.');
      return;
    }

    const payAmount = Math.min(walletBal, owedBal);
    setConfirmModalState({
      isOpen: true,
      title: 'تأكيد سداد الدين من المحفظة',
      message: `هل أنت متأكد من سداد مبلغ ${payAmount} ج.م من مديونية العميل باستخدام رصيد محفظته المتوفر؟`,
      confirmText: 'نعم، سداد المديونية',
      onConfirm: () => {
        // 1. Deduct from Wallet
        const newWalletBal = walletBal - payAmount;
        dbService.saveWalletTransaction({
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.full_name,
          transaction_type: 'WITHDRAWAL',
          amount: payAmount,
          previous_balance: walletBal,
          new_balance: newWalletBal,
          notes: `سداد مديونية آجل داخلي بقيمة ${payAmount} ج.م من رصيد المحفظة`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          user: cashierName
        });

        // 2. Reduce credit balance in customer model & save
        selectedCustomer.current_balance = Math.max(0, owedBal - payAmount);
        selectedCustomer.updated_at = new Date().toISOString();
        dbService.saveCustomer(selectedCustomer);

        // 3. Log a ledger credit transaction
        dbService.addCreditPayment(
          selectedCustomer.id,
          payAmount,
          'سداد مديونية آجل من رصيد المحفظة',
          cashierName
        );

        onShowSuccessAlert(`تم سداد ${payAmount} ج.م من مديونية العميل بنجاح من المحفظة!`);
        loadData();
      }
    });
  };

  // Add Custom Note
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !newNoteText.trim()) return;

    dbService.saveCustomerNote({
      customer_id: selectedCustomer.id,
      author: noteAuthor.trim() || 'السيستم',
      note_text: newNoteText.trim()
    });

    setNewNoteText('');
    onShowSuccessAlert('تم إضافة الملاحظة لملف العميل التاريخي!');
    loadData();
  };

  // Delete Custom Note
  const handleDeleteNote = (id: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'حذف الملاحظة',
      message: 'هل أنت متأكد من حذف هذه الملاحظة؟',
      confirmText: 'نعم، حذف الملاحظة',
      confirmBg: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        dbService.deleteCustomerNote(id);
        onShowSuccessAlert('تم حذف الملاحظة بنجاح');
        loadData();
      }
    });
  };

  // Add direct Manual Visit
  const handleAddManualVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const now = new Date();
    dbService.saveCustomerVisit({
      customer_id: selectedCustomer.id,
      visit_date: now.toISOString().split('T')[0],
      visit_time: now.toTimeString().split(' ')[0],
      notes: visitNotes.trim() || 'زيارة مباشرة للكافيه بدون عمليات شراء صفقات POS'
    });

    setVisitNotes('');
    setShowAddVisitModal(false);
    onShowSuccessAlert('تم تسجيل زيارة الزبون التاريخية في دفتر كافيه الديب الملوكي!');
    loadData();
  };

  // Print Customer Statement Layout
  const handlePrintStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !selectedCustomer || !selectedCustomerStats) return;

    const todayStr = new Date().toLocaleDateString('ar-EG');
    const custInvoices = invoices.filter(inv => inv.customer_id === selectedCustomer.id && inv.invoice_status !== 'VOID');
    const custPayments = creditPayments.filter(p => p.customer_id === selectedCustomer.id);

    let statementRows = '';
    
    // Combine invoices & payments chronologically
    const currentRecords = [
      ...custInvoices.map(inv => ({
        date: inv.created_at.substring(0, 10),
        desc: `فاتورة مبيعات #${inv.invoice_number}`,
        debit: inv.total, // customer owes
        credit: 0, // do not use inv.paid_amount to prevent double-counting with payments
      })),
      ...custPayments.map(p => ({
        date: p.created_at.substring(0, 10),
        desc: `دفعة سداد نقدية - ${p.notes || ''}`,
        debit: 0,
        credit: p.amount,
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate total debits and credits of listed transactions
    const totalDebits = currentRecords.reduce((sum, r) => sum + r.debit, 0);
    const totalCredits = currentRecords.reduce((sum, r) => sum + r.credit, 0);

    // Calculate starting balance based on actual current balance of customer
    const endingBalance = selectedCustomer.current_balance;
    const startingBalance = endingBalance - totalDebits + totalCredits;

    let runningBal = startingBalance;

    // Prepend the starting balance row
    statementRows += `
      <tr style="background-color: #fcf8e3; font-weight: bold;">
        <td>-</td>
        <td style="color: #666;">الرصيد السابق المستحق (رصيد مرحل)</td>
        <td>${startingBalance > 0 ? startingBalance + ' ج.م' : '-'}</td>
        <td>${startingBalance < 0 ? Math.abs(startingBalance) + ' ج.م' : '-'}</td>
        <td style="color: #111; font-weight: 800;">${startingBalance} ج.م</td>
      </tr>
    `;

    currentRecords.forEach(rec => {
      runningBal += (rec.debit - rec.credit);
      statementRows += `
        <tr>
          <td>${rec.date}</td>
          <td>${rec.desc}</td>
          <td>${rec.debit > 0 ? rec.debit + ' ج.م' : '-'}</td>
          <td>${rec.credit > 0 ? rec.credit + ' ج.م' : '-'}</td>
          <td style="font-weight: bold;">${runningBal} ج.م</td>
        </tr>
      `;
    });

    const docContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>كشف الحساب الملوكي - ${selectedCustomer.full_name}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; background: #fff; }
          .header { text-align: center; border-bottom: 3px double #d4af37; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #111; margin: 0; font-size: 26px; font-weight: 800; }
          .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px; }
          .info-table td { padding: 8px; border: 1px solid #ddd; }
          .info-table td.label { font-weight: bold; background: #f8f9fa; width: 15%; }
          .ledger-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
          .ledger-table th { background: #111; color: #fff; text-align: right; padding: 10px; font-weight: bold; border: 1px solid #111; }
          .ledger-table td { padding: 10px; border: 1px solid #ddd; }
          .ledger-table tr:nth-child(even) { background: #fdfdfd; }
          .totals-summary { float: left; width: 300px; margin-top: 25px; border-top: 2px solid #d4af37; padding-top: 10px; font-size: 14px; }
          .totals-summary div { display: flex; justify-content: space-between; padding: 5px 0; }
          .totals-summary .grand { font-size: 16px; font-weight: bold; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 5px; color: #d4af37; }
          .footer { margin-top: 100px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${getEldeebLogoDataUrl(400, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 250px; width: auto; margin: 0 auto 15px; display: block; filter: contrast(155%) brightness(92%) saturate(135%) drop-shadow(0 4px 15px rgba(0,0,0,0.35)); -webkit-filter: contrast(155%) brightness(92%) saturate(135%) drop-shadow(0 4px 15px rgba(0,0,0,0.35)); image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" />
          <h1>كافيه الديب POS • Cafe Eldeeb</h1>
          <p>كشف مديونيات وحسابات العملاء الآجل والذمم المالية</p>
          <p>تاريخ الاستخراج: ${todayStr}</p>
        </div>

        <table class="info-table">
          <tr>
            <td class="label">اسم العميل</td>
            <td>${selectedCustomer.full_name} ${selectedCustomer.is_vip ? '⭐ (عميل VIP)' : ''}</td>
            <td class="label">رقم الهاتف</td>
            <td>${selectedCustomer.phone}</td>
          </tr>
          <tr>
            <td class="label">العنوان السكني</td>
            <td>${selectedCustomer.address || 'غير مدخل'}</td>
            <td class="label">حد الائتمان</td>
            <td>${selectedCustomer.credit_limit} ج.م</td>
          </tr>
          <tr>
            <td class="label">تاريخ التسجيل</td>
            <td>${selectedCustomer.created_at.substring(0, 10)}</td>
            <td class="label">رصيد المحفظة</td>
            <td>${selectedCustomer.wallet_balance || 0} ج.م</td>
          </tr>
        </table>

        <h3 style="margin-top: 30px; border-right: 4px solid #d4af37; padding-right: 10px;">كشف العمليات التفصيلي (الدفتر الملوكي)</h3>
        <table class="ledger-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البيان / تفاصيل العملية</th>
              <th>مدين (مستحق عليه)</th>
              <th>دائن (مسدد منه)</th>
              <th>الرصيد المتبقي المستحق</th>
            </tr>
          </thead>
          <tbody>
            ${statementRows}
          </tbody>
        </table>

        <div class="totals-summary">
          <div>
            <span>الرصيد السابق:</span>
            <span>${startingBalance} ج.م</span>
          </div>
          <div>
            <span>إجمالي المشتريات الآجل:</span>
            <span>${totalDebits} ج.م</span>
          </div>
          <div>
            <span>إجمالي المسدد نقداً:</span>
            <span>${totalCredits} ج.م</span>
          </div>
          <div class="grand">
            <span>المديونية النهائية المستحقة:</span>
            <span>${endingBalance} ج.م</span>
          </div>
        </div>

        <div style="clear: both;"></div>

        <div class="footer">
          <p>كشف الحساب صادر آلياً من كافيه الديب - الدفتر التجاري الإلكتروني.</p>
          <p>شكراً لتعاملكم الراقي معنا 🌹</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(docContent);
    printWindow.document.close();
  };

  // Generate deep URL link or descriptive QR payload for the customer profile
  const customerQrPayload = useMemo(() => {
    if (!selectedCustomer) return '';
    // Format: Cafe Eldeeb QR protocol with customer credentials
    return `ID: ${selectedCustomer.id} | Name: ${selectedCustomer.full_name} | Phone: ${selectedCustomer.phone} | Balance: ${selectedCustomer.current_balance} EGP`;
  }, [selectedCustomer]);

  return (
    <div className="w-full flex flex-col gap-6 text-right animate-fade-in" dir="rtl">
      
      {/* Main Tab Navigation Swapper */}
      <div className="flex border-b border-luxury-border/80 pb-1 gap-2 overflow-x-auto">
        <button
          onClick={() => setCustomersTab('profiles')}
          className={`px-6 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            customersTab === 'profiles'
              ? 'border-gold-500 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          } rounded-t-xl`}
        >
          <User className="w-4 h-4" />
          إدارة ملفات العملاء وتاريخ الزيارات
        </button>
        <button
          onClick={() => setCustomersTab('wallet_ledger')}
          className={`px-6 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            customersTab === 'wallet_ledger'
              ? 'border-gold-500 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          } rounded-t-xl`}
        >
          <Wallet className="w-4 h-4" />
          لوحة تحكم المحافظ الإلكترونية وكشف الحركات الشامل
        </button>
        <button
          onClick={() => setCustomersTab('credit_ledger')}
          className={`px-6 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            customersTab === 'credit_ledger'
              ? 'border-gold-500 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
          } rounded-t-xl`}
        >
          <CreditCard className="w-4 h-4" />
          لوحة الحسابات الآجلة والمديونيات (الدفتر الملوكي)
        </button>
      </div>

      {customersTab === 'profiles' && (
        <>
          {/* --- Top Search & Sub Filters Section --- */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-luxury-card border border-luxury-border p-5 rounded-3xl shadow-md shrink-0">
        
        {/* Search Input bar */}
        <div className="relative w-full lg:w-96">
          <input
            type="text"
            placeholder="ابحث بالاسم الكامل للعميل، الهاتف، واتساب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-luxury-bg border border-luxury-border text-white placeholder-gray-500 rounded-xl py-2.5 pr-10 pl-4 text-xs focus:outline-none focus:border-gold-500 font-medium transition-all"
          />
          <Search className="w-4 h-4 text-gray-500 absolute right-3.5 top-3" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-3 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => { setActiveFilter('all'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            👥 الكل ({customers.filter(c => !c.is_archived).length})
          </button>
          <button
            onClick={() => { setActiveFilter('vip'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'vip' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            ⭐ VIP الذهبي ({customers.filter(c => !c.is_archived && c.is_vip).length})
          </button>
          <button
            onClick={() => { setActiveFilter('wallet'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'wallet' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            🪙 رصيد محفظة ({customers.filter(c => !c.is_archived && (c.wallet_balance || 0) > 0).length})
          </button>
          <button
            onClick={() => { setActiveFilter('credit'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'credit' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            💳 مديونيات آجل ({customers.filter(c => !c.is_archived && c.current_balance > 0).length})
          </button>
          <button
            onClick={() => { setActiveFilter('inactive'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'inactive' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            💤 خاملون {'>'} 30 يوم
          </button>
          <button
            onClick={() => { setActiveFilter('archived'); setSelectedCustomerId(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'archived' 
                ? 'bg-gradient-to-r from-gold-600 to-gold-700 text-black shadow-md' 
                : 'bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/40'
            }`}
          >
            📁 الأرشيف ({customers.filter(c => !!c.is_archived).length})
          </button>
        </div>

        {/* Add Customer Trigger button */}
        <button
          onClick={() => openAddEditModal()}
          className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black hover:opacity-90 active:scale-95 text-xs font-extrabold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          + تسجيل عميل جديد
        </button>

      </div>

      {/* --- Main Grid System --- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* RIGHT PANEL (Col 5): Customers List & Search Grid */}
        <div className="xl:col-span-5 bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg flex flex-col gap-4 max-h-[750px]">
          
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Users className="w-4.5 h-4.5 text-gold-500" />
              قائمة العملاء كافيه الديب الملوكية ({filteredCustomers.length})
            </h3>
            <span className="text-[10px] text-gray-500 font-bold bg-luxury-bg border border-luxury-border px-2 py-0.5 rounded-md">
              الترتيب: الـ VIP أولاً
            </span>
          </div>

          {/* Customer Cards Listing Container */}
          <div className="flex flex-col gap-2.5 overflow-y-auto pr-1">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-10 text-gray-500 flex flex-col items-center gap-2">
                <Users className="w-10 h-10 text-gray-600" />
                <span className="text-xs">لا يوجد عملاء يطابقون خيارات البحث الحالية</span>
              </div>
            ) : (
              filteredCustomers.map(cust => {
                const isSelected = cust.id === selectedCustomerId;
                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-l from-gold-600/10 to-transparent border-gold-500/50 shadow-md scale-[1.01]' 
                        : 'bg-luxury-bg border-luxury-border hover:border-gold-500/20 hover:bg-luxury-card'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar Image / preset */}
                      <div className="w-10 h-10 rounded-full bg-luxury-card border border-luxury-border flex items-center justify-center text-lg shadow-sm overflow-hidden shrink-0">
                        {cust.photo && cust.photo.startsWith('data:') ? (
                          <img src={cust.photo} className="w-full h-full object-cover" />
                        ) : (
                          cust.photo || '👤'
                        )}
                      </div>

                      {/* Name & phone & tag */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold transition-all ${isSelected ? 'text-gold-400' : 'text-white'}`}>
                            {cust.full_name}
                          </span>
                          {cust.is_vip && (
                            <Star className="w-3.5 h-3.5 fill-gold-500 text-gold-500 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono" dir="ltr">
                          {cust.phone}
                        </span>
                      </div>
                    </div>

                    {/* Dues & Wallet summary indicators */}
                    <div className="flex flex-col items-end gap-1 font-mono text-right shrink-0">
                      {cust.current_balance > 0 && (
                        <span className="text-[10px] text-red-400 font-bold bg-red-900/20 border border-red-900/40 px-1.5 py-0.5 rounded-md">
                          دين: {cust.current_balance} ج.م
                        </span>
                      )}
                      {(cust.wallet_balance || 0) > 0 && (
                        <span className="text-[10px] text-gold-400 font-bold bg-gold-900/20 border border-gold-950/40 px-1.5 py-0.5 rounded-md">
                          محفظة: {cust.wallet_balance} ج.م
                        </span>
                      )}
                      {cust.current_balance === 0 && (cust.wallet_balance || 0) === 0 && (
                        <span className="text-[10px] text-gray-500 bg-luxury-bg border border-luxury-border px-1.5 py-0.5 rounded-md">
                          حساب سليم
                        </span>
                      )}
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* LEFT PANEL (Col 7): Profile Details & Multi-tab Workspace (Wallet, Credit, Notes, Timeline) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {selectedCustomer ? (
            <>
              {/* Profile Card Header */}
              <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg relative overflow-hidden">
                
                {/* Visual Accent glow */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-gold-600/5 rounded-full blur-2xl pointer-events-none"></div>

                {/* Main Identity segment */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-luxury-border pb-5 mb-5 relative">
                  
                  <div className="flex items-center gap-4">
                    {/* Large Photo */}
                    <div className="w-16 h-16 rounded-full bg-luxury-bg border-2 border-gold-500/30 flex items-center justify-center text-3xl shadow-md overflow-hidden shrink-0">
                      {selectedCustomer.photo && selectedCustomer.photo.startsWith('data:') ? (
                        <img src={selectedCustomer.photo} className="w-full h-full object-cover" />
                      ) : (
                        selectedCustomer.photo || '👤'
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-white">{selectedCustomer.full_name}</h2>
                        <button 
                          onClick={() => handleToggleVip(selectedCustomer)}
                          className="p-1 rounded-md hover:bg-luxury-bg transition-all text-gold-500 cursor-pointer"
                          title={selectedCustomer.is_vip ? 'إزالة تصنيف VIP' : 'تمييز كعميل VIP مهم'}
                        >
                          <Star className={`w-5 h-5 ${selectedCustomer.is_vip ? 'fill-gold-500' : 'text-gray-500 hover:text-gold-500'}`} />
                        </button>
                      </div>

                      {/* Phone & Address & Tags */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-gold-500" />
                          <span className="font-mono">{selectedCustomer.phone}</span>
                        </span>
                        {selectedCustomer.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-gold-500" />
                            <span>{selectedCustomer.address}</span>
                          </span>
                        )}
                        {selectedCustomer.birthday && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gold-500" />
                            <span>عيد ميلاد: {selectedCustomer.birthday}</span>
                          </span>
                        )}
                      </div>

                      {/* Custom calculated system tags */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {selectedCustomer.is_vip && (
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-gold-600/20 text-gold-400 border border-gold-500/20 rounded-md">كبار الزوار VIP</span>
                        )}
                        {selectedCustomerStats && selectedCustomerStats.visitsCount > 5 && (
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded-md">زبون دائم</span>
                        )}
                        {selectedCustomer.current_balance > 0 && (
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-red-950 text-red-400 border border-red-900 rounded-md">دين مستحق</span>
                        )}
                        {(selectedCustomer.wallet_balance || 0) > 0 && (
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-indigo-950 text-indigo-400 border border-indigo-900 rounded-md font-mono">رصيد محفظة: {selectedCustomer.wallet_balance} ج.م</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="flex gap-2 text-xs shrink-0 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => openAddEditModal(selectedCustomer)}
                      className="p-2 bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/50 rounded-xl cursor-pointer transition-all"
                      title="تعديل بيانات العميل"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleArchiveCustomer(selectedCustomer)}
                      className={`p-2 border rounded-xl cursor-pointer transition-all ${
                        selectedCustomer.is_archived
                          ? 'bg-emerald-950/20 border-emerald-800 text-emerald-400 hover:bg-emerald-950/40'
                          : 'bg-amber-950/20 border-amber-900/50 text-amber-400 hover:bg-amber-950/40'
                      }`}
                      title={selectedCustomer.is_archived ? 'استعادة من الأرشيف' : 'نقل العميل للأرشيف'}
                    >
                      {selectedCustomer.is_archived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(selectedCustomer)}
                      className="p-2 bg-red-950/30 border border-red-900/60 text-red-400 hover:bg-red-900/50 hover:text-red-200 rounded-xl cursor-pointer transition-all"
                      title="حذف العميل نهائياً"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowQrModal(true)}
                      className="p-2 bg-luxury-bg border border-luxury-border text-gold-500 hover:text-white hover:border-gold-500 rounded-xl cursor-pointer transition-all"
                      title="عرض وطباعة كارت الـ QR Code الخاص بالعميل"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </div>

                </div>

                {/* Financial Summary Ribbon */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  
                  {/* Current Balance (Owed) */}
                  <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl flex flex-col gap-1 text-right">
                    <span className="text-[10px] text-gray-500 font-bold flex items-center gap-1 justify-end">
                      <CreditCard className="w-3.5 h-3.5 text-red-400" />
                      المديونية المستحقة
                    </span>
                    <span className="text-sm font-bold text-red-400 font-mono">
                      {selectedCustomer.current_balance} ج.م
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
                      <button
                        onClick={() => { setCreditPayAmount(selectedCustomer.current_balance); setShowCreditModal(true); }}
                        disabled={selectedCustomer.current_balance === 0}
                        className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-[9px] font-bold disabled:opacity-40 transition-all cursor-pointer"
                      >
                        💵 سداد دين
                      </button>
                      <button
                        onClick={handlePayCreditFromWallet}
                        disabled={selectedCustomer.current_balance === 0 || (selectedCustomer.wallet_balance || 0) === 0}
                        className="px-2 py-1 bg-gold-950/40 hover:bg-gold-900/40 text-gold-400 rounded-lg text-[9px] font-bold disabled:opacity-40 transition-all cursor-pointer"
                        title="سداد مديونية العميل مباشرة بخصم الرصيد من محفظته الإلكترونية"
                      >
                        خصم من المحفظة
                      </button>
                      <button
                        onClick={() => { setCreditAdjustAmount(0); setShowCreditAdjustModal(true); }}
                        className="px-2 py-1 bg-purple-950/40 hover:bg-purple-900/40 text-purple-400 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                        title="إجراء تسوية يدوية إدارية، تصحيح رصيد، أو استرداد مديونية"
                      >
                        ⚙️ تسوية يدوية
                      </button>
                    </div>
                  </div>

                  {/* Wallet Balance */}
                  <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl flex flex-col gap-1 text-right">
                    <span className="text-[10px] text-gray-500 font-bold flex items-center gap-1 justify-end">
                      <Wallet className="w-3.5 h-3.5 text-gold-500" />
                      رصيد المحفظة الملوكية
                    </span>
                    <span className="text-sm font-bold text-gold-500 font-mono">
                      {selectedCustomer.wallet_balance || 0} ج.م
                    </span>
                    <div className="flex gap-1.5 mt-2 justify-end">
                      <button
                        onClick={() => { setWalletOpType('DEPOSIT'); setWalletAmount(0); setShowWalletModal(true); }}
                        className="px-2 py-1 bg-gold-950/40 hover:bg-gold-900/40 text-gold-400 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                      >
                        إيداع رصيد
                      </button>
                      <button
                        onClick={() => { setWalletOpType('WITHDRAWAL'); setWalletAmount(0); setShowWalletModal(true); }}
                        disabled={!selectedCustomer.wallet_balance}
                        className="px-2 py-1 bg-luxury-card hover:bg-luxury-bg border border-luxury-border text-gray-300 rounded-lg text-[9px] font-bold disabled:opacity-40 transition-all cursor-pointer"
                      >
                        سحب نقدي
                      </button>
                    </div>
                  </div>

                  {/* Total Purchases */}
                  <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl flex flex-col gap-1 text-right">
                    <span className="text-[10px] text-gray-500 font-bold flex items-center gap-1 justify-end">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      إجمالي المبيعات الآجل
                    </span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {selectedCustomerStats?.totalPurchases || 0} ج.م
                    </span>
                    <div className="mt-2 text-left">
                      <button
                        onClick={handlePrintStatement}
                        className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                      >
                        🖨️ كشف حساب ملوكي
                      </button>
                    </div>
                  </div>

                  {/* Visits / Activity count */}
                  <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl flex flex-col gap-1 text-right">
                    <span className="text-[10px] text-gray-500 font-bold flex items-center gap-1 justify-end">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      إجمالي عدد الزيارات
                    </span>
                    <span className="text-sm font-bold text-blue-400 font-mono">
                      {selectedCustomerStats?.visitsCount || 0} زيارة
                    </span>
                    <div className="flex gap-1.5 mt-2 justify-end">
                      <button
                        onClick={() => setShowAddVisitModal(true)}
                        className="px-2.5 py-1 bg-blue-950/40 hover:bg-blue-900/40 text-blue-400 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                      >
                        + تسجيل زيارة مباشرة
                      </button>
                    </div>
                  </div>

                </div>

              </div>

              {/* Enterprise Bento Sections: Notes and Timeline side by side */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* 1. Custom Notes Module (Col 5) */}
                <div className="md:col-span-5 bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg flex flex-col gap-4">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-luxury-border">
                    <MessageSquare className="w-4 h-4 text-gold-500" />
                    الملاحظات الإدارية الخاصة للزبون ({customerNotes.length})
                  </h4>

                  {/* Notes Add Form */}
                  <form onSubmit={handleAddNote} className="flex flex-col gap-2">
                    <textarea
                      placeholder="اكتب ملاحظة جديدة عن تفضيلات الزبون، الاتفاقات التجارية..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="w-full h-16 bg-luxury-bg border border-luxury-border rounded-xl text-xs p-2.5 text-white focus:outline-none focus:border-gold-500 text-right resize-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="اسم الكاتب..."
                        value={noteAuthor}
                        onChange={(e) => setNoteAuthor(e.target.value)}
                        className="w-1/2 bg-luxury-bg border border-luxury-border rounded-xl text-[10px] py-1 px-2 text-white focus:outline-none focus:border-gold-500 text-right"
                      />
                      <button
                        type="submit"
                        disabled={!newNoteText.trim()}
                        className="w-1/2 py-1 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-[10px] font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                      >
                        حفظ الملاحظة
                      </button>
                    </div>
                  </form>

                  {/* Notes scrolling cards */}
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[220px]">
                    {customerNotes.length === 0 ? (
                      <span className="text-[10px] text-gray-500 text-center py-5">لا يوجد ملاحظات إدارية مدونة في ملف هذا العميل</span>
                    ) : (
                      customerNotes.map(note => (
                        <div key={note.id} className="bg-luxury-bg border border-luxury-border p-2.5 rounded-xl flex flex-col gap-1.5 relative group">
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="absolute left-2 top-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            title="حذف الملاحظة"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-[11px] text-gray-200 font-medium leading-relaxed">
                            {note.note_text}
                          </p>
                          <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold border-t border-luxury-border/30 pt-1.5 mt-1">
                            <span>الكاتب: {note.author}</span>
                            <span>{note.created_at.replace('T', ' ').substring(0, 16)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </div>

                {/* 2. Beautiful Activity Timeline Module (Col 7) */}
                <div className="md:col-span-7 bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg flex flex-col gap-4">
                  
                  <div className="flex justify-between items-center pb-2 border-b border-luxury-border">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <History className="w-4 h-4 text-gold-500" />
                      الجدول الزمني للنشاط المالي والزيارات
                    </h4>
                    <span className="text-[9px] text-gray-400 font-bold">كل الحركات التاريخية للزبون</span>
                  </div>

                  {/* Timeline Scroller */}
                  <div className="flex flex-col gap-4 overflow-y-auto max-h-[330px] pr-1">
                    {customerTimeline.length === 0 ? (
                      <span className="text-[10px] text-gray-500 text-center py-10">لا توجد سجلات نشاط مسجلة للعميل بعد</span>
                    ) : (
                      <div className="relative border-r border-luxury-border mr-2.5 flex flex-col gap-4">
                        {customerTimeline.map(evt => {
                          let icon = <Clock className="w-3 h-3 text-gold-500" />;
                          let badgeBg = 'bg-gold-500/10 border-gold-500/20 text-gold-400';

                          if (evt.type === 'INVOICE') {
                            icon = <FileText className="w-3 h-3 text-blue-400" />;
                            badgeBg = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
                          } else if (evt.type === 'WALLET_TX') {
                            icon = <Wallet className="w-3 h-3 text-gold-500" />;
                            badgeBg = 'bg-gold-600/10 border-gold-500/20 text-gold-400';
                          } else if (evt.type === 'CREDIT_PAYMENT') {
                            icon = <CheckCircle className="w-3 h-3 text-emerald-400" />;
                            badgeBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                          } else if (evt.type === 'VISIT') {
                            icon = <Calendar className="w-3 h-3 text-purple-400" />;
                            badgeBg = 'bg-purple-500/10 border-purple-500/20 text-purple-400';
                          } else if (evt.type === 'UPDATE') {
                            icon = <UserCheck className="w-3 h-3 text-indigo-400" />;
                            badgeBg = 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
                          }

                          return (
                            <div key={evt.id} className="relative pr-5 flex flex-col gap-1">
                              
                              {/* Connector dot */}
                              <div className="absolute right-[-6.5px] top-1 w-3.5 h-3.5 rounded-full bg-luxury-bg border border-luxury-border flex items-center justify-center shadow-sm">
                                {icon}
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-white">
                                  {evt.title}
                                </span>
                                <span className="text-[9px] text-gray-500 font-bold font-mono">
                                  {evt.date}
                                </span>
                              </div>

                              <p className="text-[10px] text-gray-400 leading-relaxed">
                                {evt.description}
                              </p>

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>

              </div>

            </>
          ) : (
            <div className="bg-luxury-card border border-luxury-border rounded-3xl p-10 shadow-lg text-center py-20 text-gray-500 flex flex-col items-center gap-3">
              <Users className="w-14 h-14 text-gold-600/40 animate-pulse" />
              <h3 className="text-sm font-bold text-white">لم يتم تحديد زبون لعرض تفاصيله</h3>
              <p className="text-xs text-gray-400 max-w-sm leading-relaxed">يرجى الضغط على أحد زبائن المنظومة من القائمة الجانبية المجاورة لاستكشاف وإدارة رصيد محفظتهم، المديونيات، وسجل الملاحظات والجدول الزمني بنجاح.</p>
            </div>
          )}
        </div>

      </div>
      </>
      )}

      {customersTab === 'wallet_ledger' && (
        <div className="flex flex-col gap-6 animate-fade-in text-right" dir="rtl">
          
          {/* --- WALLET METRICS DASHBOARD SEGMENT --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            
            {/* Metric 1: Total Wallets Balance */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-gold-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي أرصدة المحافظ النشطة</span>
                <Wallet className="w-4.5 h-4.5 text-gold-500" />
              </div>
              <span className="text-lg font-bold text-gold-500 font-mono mt-1">
                {walletDashboardMetrics.totalBalances} ج.م
              </span>
              <span className="text-[9px] text-gray-500">عدد المحافظ التي بها رصيد: {walletDashboardMetrics.activeWalletsCount}</span>
            </div>

            {/* Metric 2: Total Deposits */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-emerald-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي عمليات الإيداع</span>
                <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <span className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {walletDashboardMetrics.totalDeposits} ج.م
              </span>
              <span className="text-[9px] text-gray-500">
                {walletDashboardMetrics.lastDepositDate 
                  ? `آخر إيداع: ${walletDashboardMetrics.lastDepositAmount} ج.م (${walletDashboardMetrics.lastDepositDate})` 
                  : 'لا يوجد عمليات إيداع مسجلة'}
              </span>
            </div>

            {/* Metric 3: Total Withdrawals */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-red-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي السحوبات النقدية</span>
                <ArrowDownLeft className="w-4.5 h-4.5 text-red-400" />
              </div>
              <span className="text-lg font-bold text-red-400 font-mono mt-1">
                {walletDashboardMetrics.totalWithdrawals} ج.م
              </span>
              <span className="text-[9px] text-gray-500">
                {walletDashboardMetrics.lastWithdrawDate 
                  ? `آخر سحب: ${walletDashboardMetrics.lastWithdrawAmount} ج.م (${walletDashboardMetrics.lastWithdrawDate})` 
                  : 'لا يوجد عمليات سحب مسجلة'}
              </span>
            </div>

            {/* Metric 4: Total Payments / Deductions */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-indigo-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">خصومات الفواتير والمدفوعات آلياً</span>
                <FileText className="w-4.5 h-4.5 text-indigo-400" />
              </div>
              <span className="text-lg font-bold text-indigo-400 font-mono mt-1">
                {walletDashboardMetrics.totalDeductions} ج.م
              </span>
              <span className="text-[9px] text-gray-500">تمت تصفية فواتير الكافيه خصماً مباشرة من المحافظ</span>
            </div>

            {/* Metric 5: Combined Capital Flow */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-purple-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">صافي التدفق المالي للمحافظ</span>
                <DollarSign className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <span className="text-lg font-bold text-purple-400 font-mono mt-1">
                {walletDashboardMetrics.totalDeposits - walletDashboardMetrics.totalWithdrawals} ج.م
              </span>
              <span className="text-[9px] text-gray-500">حركة السيولة النقدية الفعلية داخل الدرج</span>
            </div>

          </div>

          {/* --- WALLET LEDGER STATEMENT SCREEN BLOCK --- */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl flex flex-col gap-6">
            
            {/* Header and Action Buttons */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-luxury-border/60">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  كشف حركة المحفظة الملوكية العام - Ledger Statement
                </h3>
                <p className="text-xs text-gray-400">إدارة ومراجعة وتصدير كافة حركات الإيداع والسحب والخصم التلقائي والضبط الإداري لمحفظة العملاء</p>
              </div>

              {/* Export & Print actions */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-end font-sans">
                <button
                  onClick={handleExportWalletLedgerToCSV}
                  className="px-4 py-2 bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <Download className="w-4 h-4 text-gold-500" />
                  تصدير CSV (Excel)
                </button>
                <button
                  onClick={handlePrintWalletLedgerReport}
                  className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:opacity-95 transition-all cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  طباعة التقرير الشامل
                </button>
              </div>
            </div>

            {/* Filters segment: Search, Type Filter, Customer Filter */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-luxury-bg/40 border border-luxury-border p-4 rounded-2xl">
              
              {/* Filter 1: Search transactions */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">بحث سريع في العمليات</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ابحث بالعميل، البيان، رقم العملية..."
                    value={walletLedgerSearch}
                    onChange={(e) => setWalletLedgerSearch(e.target.value)}
                    className="w-full bg-luxury-bg border border-luxury-border text-white placeholder-gray-500 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium transition-all text-right"
                  />
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Filter 2: Transaction Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">تصفية بحسب نوع العملية</label>
                <select
                  value={walletLedgerTypeFilter}
                  onChange={(e) => setWalletLedgerTypeFilter(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium cursor-pointer text-right"
                >
                  <option value="ALL">كل أنواع العمليات (الكل)</option>
                  <option value="DEPOSIT">إيداع رصيد نقدي 💰</option>
                  <option value="WITHDRAWAL">سحب نقدي من الرصيد 💸</option>
                  <option value="INVOICE_PAYMENT">سداد فواتير المبيعات آلياً 🧾</option>
                  <option value="MANUAL_ADJUSTMENT">تسوية وتعديل إداري ⚙️</option>
                  <option value="BONUS">رصيد بونص / هدايا 🎁</option>
                  <option value="INVOICE_REFUND">مرتجع مبيعات للمحفظة 🔄</option>
                  <option value="REFUND">عمليات استرداد نقدي 🔄</option>
                  <option value="CORRECTION">تصحيح وتعديل رصيد 🔧</option>
                </select>
              </div>

              {/* Filter 3: Customer Filter */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">تصفية لعميل محدد</label>
                <select
                  value={walletLedgerCustomerFilter}
                  onChange={(e) => setWalletLedgerCustomerFilter(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium cursor-pointer text-right"
                >
                  <option value="ALL">كل عملاء الكافيه (الكل)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} ({c.phone})</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Ledger Transactions Table */}
            <div className="border border-luxury-border rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-luxury-bg/80 border-b border-luxury-border text-gray-400 font-bold uppercase">
                    <tr>
                      <th className="p-3 text-center">#</th>
                      <th className="p-3">اسم العميل الملوكي</th>
                      <th className="p-3">تاريخ الحركة</th>
                      <th className="p-3">نوع العملية</th>
                      <th className="p-3 text-center">المبلغ</th>
                      <th className="p-3 text-center">الرصيد السابق</th>
                      <th className="p-3 text-center">الرصيد الجديد</th>
                      <th className="p-3">ملاحظات وبيان الحركة</th>
                      <th className="p-3">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-luxury-border/50">
                    {filteredWalletTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-gray-500 font-medium bg-luxury-bg/10">
                          <Wallet className="w-10 h-10 text-gray-600/60 mx-auto mb-2" />
                          لا توجد عمليات محفظة مطابقة لخيارات الفلترة والبحث المحددة
                        </td>
                      </tr>
                    ) : (
                      filteredWalletTransactions.map((tx, idx) => {
                        let typeBadge = '';
                        let textClass = 'text-white';
                        
                        if (tx.transaction_type === 'DEPOSIT') {
                          typeBadge = 'bg-emerald-950 text-emerald-400 border-emerald-900';
                          textClass = 'text-emerald-400 font-extrabold';
                        } else if (tx.transaction_type === 'WITHDRAWAL') {
                          typeBadge = 'bg-red-950 text-red-400 border-red-900';
                          textClass = 'text-red-400 font-extrabold';
                        } else if (tx.transaction_type === 'INVOICE_PAYMENT' || tx.transaction_type === 'INVOICE_DEDUCTION') {
                          typeBadge = 'bg-blue-950 text-blue-400 border-blue-900';
                          textClass = 'text-blue-400 font-bold';
                        } else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') {
                          typeBadge = 'bg-amber-950 text-amber-400 border-amber-900';
                          textClass = 'text-amber-400 font-bold';
                        } else if (tx.transaction_type === 'BONUS') {
                          typeBadge = 'bg-gold-950 text-gold-400 border-gold-900';
                          textClass = 'text-gold-400 font-extrabold';
                        } else {
                          typeBadge = 'bg-gray-950 text-gray-400 border-gray-900';
                        }

                        // Human friendly Arabic type label
                        let typeLabel = tx.transaction_type;
                        if (tx.transaction_type === 'DEPOSIT') typeLabel = 'إيداع نقدي';
                        else if (tx.transaction_type === 'WITHDRAWAL') typeLabel = 'سحب نقدي';
                        else if (tx.transaction_type === 'INVOICE_PAYMENT') typeLabel = 'سداد فاتورة مبيعات';
                        else if (tx.transaction_type === 'INVOICE_DEDUCTION') typeLabel = 'خصم تلقائي';
                        else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeLabel = 'تسوية وتعديل';
                        else if (tx.transaction_type === 'BONUS') typeLabel = 'رصيد بونص/هدية';
                        else if (tx.transaction_type === 'INVOICE_REFUND') typeLabel = 'مرتجع مبيعات';
                        else if (tx.transaction_type === 'REFUND') typeLabel = 'استرداد نقدي';
                        else if (tx.transaction_type === 'CORRECTION') typeLabel = 'تصحيح رصيد';

                        return (
                          <tr key={tx.id} className="hover:bg-luxury-bg/20 transition-all font-mono">
                            <td className="p-3.5 text-center text-gray-500 font-bold">{idx + 1}</td>
                            <td className="p-3.5 text-right font-sans font-bold text-white">{tx.customer_name}</td>
                            <td className="p-3.5 text-right text-gray-400">
                              <span className="block text-xs">{tx.date}</span>
                              <span className="block text-[10px] text-gray-500">{tx.time}</span>
                            </td>
                            <td className="p-3.5 text-right">
                              <span className={`px-2 py-0.5 border rounded-md text-[10px] font-bold ${typeBadge}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className={`p-3.5 text-center text-sm ${textClass}`}>{tx.amount} ج.م</td>
                            <td className="p-3.5 text-center text-gray-400">{tx.previous_balance} ج.م</td>
                            <td className="p-3.5 text-center text-white font-bold">{tx.new_balance} ج.م</td>
                            <td className="p-3.5 text-right font-sans text-gray-300 text-[11px] max-w-xs truncate" title={tx.notes}>{tx.notes || '-'}</td>
                            <td className="p-3.5 text-right font-sans text-gray-400 text-[10px]">{tx.user || 'النظام'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {customersTab === 'credit_ledger' && (
        <div className="flex flex-col gap-6 animate-fade-in text-right" dir="rtl">
          
          {/* --- CREDIT METRICS DASHBOARD SEGMENT --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            
            {/* Metric 1: Total Receivables */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-red-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي المديونيات المستحقة</span>
                <TrendingUp className="w-4.5 h-4.5 text-red-400" />
              </div>
              <span className="text-lg font-bold text-red-400 font-mono mt-1">
                {creditDashboardMetrics.totalBalances} ج.م
              </span>
              <span className="text-[9px] text-gray-500">عدد العملاء المدينين: {creditDashboardMetrics.activeDebtorsCount} عميل</span>
            </div>

            {/* Metric 2: Total Credit Limit */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-gold-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">الحد الائتماني الإجمالي الممنوح</span>
                <ArrowUpRight className="w-4.5 h-4.5 text-gold-500" />
              </div>
              <span className="text-lg font-bold text-gold-500 font-mono mt-1">
                {creditDashboardMetrics.totalCreditLimit} ج.م
              </span>
              <span className="text-[9px] text-gray-500">إجمالي سقف الدين لعملاء الكافيه</span>
            </div>

            {/* Metric 3: Total Sales Invoiced */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-blue-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي المبيعات الآجلة</span>
                <FileText className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <span className="text-lg font-bold text-blue-400 font-mono mt-1">
                {creditDashboardMetrics.totalInvoiced} ج.م
              </span>
              <span className="text-[9px] text-gray-500">
                {creditDashboardMetrics.lastInvoiceDate 
                  ? `آخر فاتورة: ${creditDashboardMetrics.lastInvoiceAmount} ج.م (${creditDashboardMetrics.lastInvoiceDate})` 
                  : 'لا يوجد عمليات مبيعات آجلة'}
              </span>
            </div>

            {/* Metric 4: Total Credit Payments */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-emerald-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">إجمالي السدادات الآجلة المستلمة</span>
                <ArrowDownLeft className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <span className="text-lg font-bold text-emerald-400 font-mono mt-1">
                {creditDashboardMetrics.totalPayments} ج.م
              </span>
              <span className="text-[9px] text-gray-500">
                {creditDashboardMetrics.lastPaymentDate 
                  ? `آخر سداد: ${creditDashboardMetrics.lastPaymentAmount} ج.م (${creditDashboardMetrics.lastPaymentDate})` 
                  : 'لا يوجد سدادات آجلة مسجلة'}
              </span>
            </div>

            {/* Metric 5: Net Outstandings Tracker */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-md relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-16 h-16 bg-purple-600/5 rounded-full blur-xl"></div>
              <div className="flex justify-between items-center pb-2 border-b border-luxury-border/30">
                <span className="text-[10px] text-gray-400 font-bold">صافي التدفق المالي الآجل</span>
                <Clock className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <span className="text-lg font-bold text-purple-400 font-mono mt-1">
                {Math.max(0, creditDashboardMetrics.totalInvoiced - creditDashboardMetrics.totalPayments)} ج.م
              </span>
              <span className="text-[9px] text-gray-500">مجموع الديون المعلقة غير المحصلة</span>
            </div>

          </div>

          {/* --- CREDIT LEDGER STATEMENT SCREEN BLOCK --- */}
          <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-xl flex flex-col gap-6">
            
            {/* Action Bar Header */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-luxury-border/60 pb-5">
              <div>
                <h2 className="text-sm font-extrabold text-gold-500 font-sans">دفتر الحساب الجاري الملوكي العام للديون الآجلة</h2>
                <p className="text-[11px] text-gray-400 mt-1 font-sans">عرض ومراقبة الذمم المالية لجميع العملاء، تصدير الكشوفات، وتسجيل التسويات الإدارية الفورية.</p>
              </div>

              {/* Export & Print actions */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-end font-sans">
                <button
                  onClick={handleExportCreditLedgerToCSV}
                  className="px-4 py-2 bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white hover:border-gold-500/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <Download className="w-4 h-4 text-gold-500" />
                  تصدير CSV (Excel)
                </button>
                <button
                  onClick={handlePrintCreditLedgerReport}
                  className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:opacity-95 transition-all cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  طباعة التقرير الشامل
                </button>
              </div>
            </div>

            {/* Filters segment: Search, Type Filter, Customer Filter */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-luxury-bg/40 border border-luxury-border p-4 rounded-2xl">
              
              {/* Filter 1: Search transactions */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 font-sans">بحث سريع في العمليات</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ابحث بالعميل، البيان، رقم العملية..."
                    value={creditLedgerSearch}
                    onChange={(e) => setCreditLedgerSearch(e.target.value)}
                    className="w-full bg-luxury-bg border border-luxury-border text-white placeholder-gray-500 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium transition-all text-right"
                  />
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Filter 2: Transaction Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 font-sans">تصفية بحسب نوع العملية</label>
                <select
                  value={creditLedgerTypeFilter}
                  onChange={(e) => setCreditLedgerTypeFilter(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium cursor-pointer text-right"
                >
                  <option value="ALL">كل أنواع العمليات (الكل)</option>
                  <option value="INVOICE">مبيعات آجلة (فاتورة) 🧾</option>
                  <option value="PAYMENT">سداد نقدي من العميل 💵</option>
                  <option value="MANUAL_ADJUSTMENT">تسوية مديونية إدارية ⚙️</option>
                  <option value="CORRECTION">تصحيح وتعديل رصيد 🔧</option>
                  <option value="REFUND">استرداد مديونية (مرتجع) 🔄</option>
                </select>
              </div>

              {/* Filter 3: Customer Filter */}
              <div className="flex flex-col gap-1.5 font-sans">
                <label className="text-[10px] font-bold text-gray-400">تصفية لعميل محدد</label>
                <select
                  value={creditLedgerCustomerFilter}
                  onChange={(e) => setCreditLedgerCustomerFilter(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium cursor-pointer text-right"
                >
                  <option value="ALL">كل عملاء الكافيه (الكل)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} ({c.phone})</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Ledger Transactions Table */}
            <div className="border border-luxury-border rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-luxury-bg/80 border-b border-luxury-border text-gray-400 font-bold uppercase font-sans">
                    <tr>
                      <th className="p-3 text-center">#</th>
                      <th className="p-3">اسم العميل الملوكي</th>
                      <th className="p-3">تاريخ الحركة</th>
                      <th className="p-3">نوع العملية</th>
                      <th className="p-3 text-center">المبلغ</th>
                      <th className="p-3 text-center">الرصيد الجاري السابق</th>
                      <th className="p-3 text-center">الرصيد الجاري الجديد</th>
                      <th className="p-3">ملاحظات وبيان الحركة</th>
                      <th className="p-3">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-luxury-border/50 font-mono">
                    {filteredCreditTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-gray-500 font-medium bg-luxury-bg/10 font-sans">
                          <CreditCard className="w-10 h-10 text-gray-600/60 mx-auto mb-2" />
                          لا توجد عمليات مديونيات آجلة مطابقة لخيارات الفلترة والبحث المحددة
                        </td>
                      </tr>
                    ) : (
                      filteredCreditTransactions.map((tx, idx) => {
                        let typeBadge = '';
                        let textClass = 'text-white';
                        
                        if (tx.transaction_type === 'INVOICE') {
                          typeBadge = 'bg-red-950 text-red-400 border-red-900';
                          textClass = 'text-red-400 font-extrabold';
                        } else if (tx.transaction_type === 'PAYMENT') {
                          typeBadge = 'bg-emerald-950 text-emerald-400 border-emerald-900';
                          textClass = 'text-emerald-400 font-extrabold';
                        } else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') {
                          typeBadge = 'bg-amber-950 text-amber-400 border-amber-900';
                          textClass = 'text-amber-400 font-bold';
                        } else if (tx.transaction_type === 'CORRECTION') {
                          typeBadge = 'bg-purple-950 text-purple-400 border-purple-900';
                          textClass = 'text-purple-400 font-bold';
                        } else if (tx.transaction_type === 'REFUND') {
                          typeBadge = 'bg-blue-950 text-blue-400 border-blue-900';
                          textClass = 'text-blue-400 font-bold';
                        } else {
                          typeBadge = 'bg-gray-950 text-gray-400 border-gray-900';
                        }

                        // Human friendly Arabic type label
                        let typeLabel = tx.transaction_type;
                        if (tx.transaction_type === 'INVOICE') typeLabel = 'فاتورة آجل';
                        else if (tx.transaction_type === 'PAYMENT') typeLabel = 'سداد نقدي';
                        else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') typeLabel = 'تسوية مديونية';
                        else if (tx.transaction_type === 'CORRECTION') typeLabel = 'تصحيح رصيد';
                        else if (tx.transaction_type === 'REFUND') typeLabel = 'استرداد مديونية';

                        return (
                          <tr key={tx.id} className="hover:bg-luxury-bg/20 transition-all font-mono">
                            <td className="p-3.5 text-center text-gray-500 font-bold">{idx + 1}</td>
                            <td className="p-3.5 text-right font-sans font-bold text-white">{tx.customer_name}</td>
                            <td className="p-3.5 text-right text-gray-400 font-sans">
                              <span className="block text-xs">{tx.date}</span>
                              <span className="block text-[10px] text-gray-500">{tx.time}</span>
                            </td>
                            <td className="p-3.5 text-right">
                              <span className={`px-2 py-0.5 border rounded-md text-[10px] font-bold ${typeBadge}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className={`p-3.5 text-center text-sm ${textClass}`}>{tx.amount} ج.م</td>
                            <td className="p-3.5 text-center text-gray-400">{tx.previous_balance} ج.م</td>
                            <td className="p-3.5 text-center text-white font-bold">{tx.new_balance} ج.م</td>
                            <td className="p-3.5 text-right font-sans text-gray-300 text-[11px] max-w-xs truncate" title={tx.notes}>{tx.notes || '-'}</td>
                            <td className="p-3.5 text-right font-sans text-gray-400 text-[10px]">{tx.created_by || 'النظام'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ============================================== */}
      {/* --- ADD/EDIT CUSTOMER DIALOG MODAL --- */}
      {showAddEditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowAddEditModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2 mb-5 border-b border-luxury-border pb-3">
              <Users className="w-5 h-5" />
              {editingCustomer ? `تعديل ملف العميل: ${editingCustomer.full_name}` : 'تسجيل عميل ملكي جديد في الدفاتر التجارية'}
            </h3>

            <form onSubmit={handleSaveCustomer} className="flex flex-col gap-4">
              
              {/* Full name input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">الاسم الكامل للعميل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أستاذ صبري الديب"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right"
                />
              </div>

              {/* Grid 2x2 for Phone & WhatsApp */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400">رقم الهاتف الأساسي *</label>
                    <ContactPickerButton
                      currentName={formData.full_name}
                      onSelect={({ phone, name }) => {
                        setFormData(prev => ({
                          ...prev,
                          phone: phone,
                          full_name: name || prev.full_name,
                        }));
                      }}
                      buttonText="جهات الاتصال"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="01xxxxxxxxx"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400">رقم الواتساب (اختياري)</label>
                    <ContactPickerButton
                      currentName={formData.full_name}
                      onSelect={({ phone, name }) => {
                        setFormData(prev => ({
                          ...prev,
                          whatsapp: phone,
                          full_name: name || prev.full_name,
                        }));
                      }}
                      buttonText="سجل الأسماء"
                      iconOnly
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="01xxxxxxxxx"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                  />
                </div>
              </div>

              {/* Grid for Address & Birthday */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400">العنوان السكني / التوصيل</label>
                  <input
                    type="text"
                    placeholder="مثال: وسط البلد، طنطا"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400">تاريخ الميلاد (للتهنئة 🎂)</label>
                  <input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                  />
                </div>
              </div>

              {/* Credit Limit & VIP Checkbox */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400">الحد الائتماني للمديونية (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                    className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                  />
                </div>
                
                {/* VIP and Photo Emoji Selector */}
                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="is_vip_check"
                    checked={formData.is_vip}
                    onChange={(e) => setFormData({ ...formData, is_vip: e.target.checked })}
                    className="accent-gold-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="is_vip_check" className="text-xs font-bold text-gold-400 cursor-pointer flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-gold-500 text-gold-500" />
                    عميل ذهبي VIP
                  </label>
                </div>
              </div>

              {/* Preset Avatars list selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-gray-400">اختر أيقونة العميل الكرتونية</label>
                <div className="flex flex-wrap gap-2 justify-between bg-luxury-bg border border-luxury-border p-2.5 rounded-xl">
                  {PRESET_AVATARS.map(av => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setFormData({ ...formData, photo: av })}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
                        formData.photo === av ? 'bg-gold-500/20 border border-gold-500 scale-110' : 'hover:bg-luxury-card border border-transparent'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Photo Upload */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">أو قم برفع صورة حقيقية للعميل</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setFormData({ ...formData, photo: reader.result as string });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full bg-luxury-bg border border-luxury-border text-gray-400 rounded-xl py-1.5 px-3 text-[10px] focus:outline-none cursor-pointer text-right"
                />
                {formData.photo && formData.photo.startsWith('data:') && (
                  <div className="flex items-center gap-2 mt-1">
                    <img src={formData.photo} className="w-8 h-8 rounded-full object-cover border border-gold-500/30" />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, photo: '👤' })}
                      className="text-[10px] text-red-400 hover:underline cursor-pointer"
                    >
                      حذف الصورة المرفوعة
                    </button>
                  </div>
                )}
              </div>

              {/* General Admin Notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">نبذة وملاحظات عامة عن ملف العميل</label>
                <textarea
                  placeholder="مثال: يفضل قهوة فرنسية سكر قليل، دفع أسبوعي..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full h-14 bg-luxury-bg border border-luxury-border rounded-xl text-xs p-2.5 text-white focus:outline-none focus:border-gold-500 text-right resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-3 text-xs font-bold sticky bottom-0 bg-luxury-card border-t border-luxury-border/80 pt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="w-1/2 py-2.5 bg-luxury-bg border border-luxury-border hover:bg-luxury-card text-gray-300 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  حفظ في الدفاتر التجارية
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* --- WALLET OPERATIONS MODAL (Deposit / Withdrawal / Manual) --- */}
      {showWalletModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowWalletModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2 mb-4 border-b border-luxury-border pb-3">
              <Wallet className="w-5 h-5" />
              {walletOpType === 'DEPOSIT' ? 'شحن رصيد المحفظة 💰' : walletOpType === 'WITHDRAWAL' ? 'سحب نقدي من رصيد المحفظة 💸' : 'تعديل الرصيد يدوياً ⚙️'}
            </h3>

            <div className="bg-luxury-bg border border-luxury-border p-3 rounded-2xl mb-4 text-right">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">اسم العميل ورصيده الحالي:</span>
              <span className="text-xs font-bold text-white block">{selectedCustomer.full_name}</span>
              <span className="text-sm font-bold text-gold-400 block mt-1 font-mono">{selectedCustomer.wallet_balance || 0} ج.م</span>
            </div>

            <form onSubmit={handleWalletOperation} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">
                  {walletOpType === 'MANUAL_ADJUSTMENT' ? 'قيمة الرصيد الجديد المباشر (ج.م)' : 'القيمة المالية للعملية (ج.م) *'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="0.00"
                  value={walletAmount || ''}
                  onChange={(e) => setWalletAmount(Number(e.target.value))}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">ملاحظات وسبب العملية</label>
                <input
                  type="text"
                  placeholder="اكتب ملاحظة مختصرة للدفتر اليومي..."
                  value={walletNotes}
                  onChange={(e) => setWalletNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right"
                />
              </div>

              {/* Warning/Explanation Text */}
              <p className="text-[9px] text-gray-500 leading-relaxed bg-luxury-bg/50 p-2.5 rounded-lg border border-luxury-border">
                {walletOpType === 'DEPOSIT' 
                  ? '⚠️ ملاحظة: شحن المحفظة يسجل كعملية "قبض أموال" ويزيد من إجمالي النقدية الفعلي في درج الكاشير الحالي.'
                  : walletOpType === 'WITHDRAWAL'
                    ? '⚠️ ملاحظة: سحب النقدية من المحفظة يسجل كعملية "صرف أموال" ويخصم من النقدية المتوفرة في درج الكاشير الحالي.'
                    : '⚠️ تعديل الرصيد لتصحيح الأخطاء الحسابية ولا يترتب عليه تسجيل حركات نقدية في درج الكاشير لضمان مطابقة الإغلاق.'}
              </p>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-1 text-xs font-bold sticky bottom-0 bg-luxury-card border-t border-luxury-border/80 pt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowWalletModal(false)}
                  className="w-1/2 py-2 bg-luxury-bg border border-luxury-border hover:bg-luxury-card text-gray-300 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  حفظ وتأكيد العملية
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* --- CREDIT PAYMENTS MODAL --- */}
      {showCreditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowCreditModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2 mb-4 border-b border-luxury-border pb-3">
              <DollarSign className="w-5 h-5" />
              تحصيل مديونية وسداد آجل عميل
            </h3>

            <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl mb-4 text-right">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">اسم العميل والمديونية المستحقة:</span>
              <span className="text-xs font-bold text-white block">{selectedCustomer.full_name}</span>
              <span className="text-sm font-extrabold text-red-400 block mt-1 font-mono">{selectedCustomer.current_balance} ج.م</span>
            </div>

            <form onSubmit={handleCreditPayment} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">مبلغ التحصيل (ج.م) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="0.00"
                  value={creditPayAmount || ''}
                  onChange={(e) => setCreditPayAmount(Number(e.target.value))}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">ملاحظات ومرجع الاستلام</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة تحصيل نقدية يدوي..."
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right"
                />
              </div>

              <p className="text-[9px] text-gray-500 leading-relaxed bg-luxury-bg/50 p-2.5 rounded-lg border border-luxury-border">
                💡 معلومة: سيتم إضافة المبلغ المسدد مباشرة إلى إيرادات درج الكاشير الحالي لدعم مطابقة حسابات النقدية عند نهاية الوردية اليومية.
              </p>

              {/* Action buttons */}
              <div className="flex gap-3 mt-1 text-xs font-bold sticky bottom-0 bg-luxury-card border-t border-luxury-border/80 pt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowCreditModal(false)}
                  className="w-1/2 py-2 bg-luxury-bg border border-luxury-border hover:bg-luxury-card text-gray-300 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  تأكيد سداد المبلغ
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* --- CREDIT ADJUSTMENTS MODAL --- */}
      {showCreditAdjustModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowCreditAdjustModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2 mb-4 border-b border-luxury-border pb-3">
              <DollarSign className="w-5 h-5" />
              تسوية وتصحيح رصيد الحساب الجاري
            </h3>

            <div className="bg-luxury-bg border border-luxury-border p-3.5 rounded-2xl mb-4 text-right">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">اسم العميل والمديونية الحالية:</span>
              <span className="text-xs font-bold text-white block">{selectedCustomer.full_name}</span>
              <span className="text-sm font-extrabold text-red-400 block mt-1 font-mono">{selectedCustomer.current_balance} ج.م</span>
            </div>

            <form onSubmit={handleCreditAdjust} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">نوع التسوية اليدوية</label>
                <select
                  value={creditAdjustType}
                  onChange={(e) => setCreditAdjustType(e.target.value as any)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 font-medium cursor-pointer text-right"
                >
                  <option value="MANUAL_ADJUSTMENT">تسوية مديونية يدوية إدارية ⚙️</option>
                  <option value="CORRECTION">تصحيح وتعديل رصيد 🔧</option>
                  <option value="REFUND">استرداد مديونية (مرتجع) 🔄</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">القيمة المالية للتسوية (ج.م) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={creditAdjustAmount || ''}
                  onChange={(e) => setCreditAdjustAmount(Number(e.target.value))}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500 text-right font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">ملاحظات وسبب التسوية الإدارية</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تسوية وتصفير مديونيات بناءً على مراجعة الفواتير..."
                  value={creditAdjustNotes}
                  onChange={(e) => setCreditAdjustNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-luxury-border text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500 text-right"
                />
              </div>

              <p className="text-[9px] text-gray-500 leading-relaxed bg-luxury-bg/50 p-2.5 rounded-lg border border-luxury-border">
                ⚠️ تنبيه مالي: هذه العملية ستُسجل بصفة دائمة كحركة تسوية رسمية في الدفتر الملوكي كأثر رجعي، وستعدل رصيد مديونية الزبون مباشرة دون التأثير على صندوق الكاش اليومي بشكل مباشر.
              </p>

              {/* Action buttons */}
              <div className="flex gap-3 mt-1 text-xs font-bold sticky bottom-0 bg-luxury-card border-t border-luxury-border/80 pt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowCreditAdjustModal(false)}
                  className="w-1/2 py-2 bg-luxury-bg border border-luxury-border hover:bg-luxury-card text-gray-300 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  تأكيد وحفظ التسوية
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* --- QR CODE CARD DISPLAY DIALOG MODAL --- */}
      {showQrModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-sm shadow-2xl relative text-center max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowQrModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xs font-extrabold text-gold-500 mb-5 pb-3 border-b border-luxury-border text-right flex items-center gap-1.5">
              <QrCode className="w-5 h-5" />
              كارت التعارف الملوكي ومسح الـ QR
            </h3>

            {/* QR Card container */}
            <div className="bg-white p-5 rounded-2xl inline-block shadow-md border-4 border-[#D4AF37]/40 mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(customerQrPayload)}`}
                alt={`QR code for ${selectedCustomer.full_name}`}
                className="w-44 h-44 mx-auto"
                referrerPolicy="no-referrer"
              />
              <span className="text-[10px] text-gray-600 font-extrabold font-mono mt-2 block" dir="ltr">
                {selectedCustomer.id}
              </span>
            </div>

            {/* Card Info Details */}
            <div className="text-right flex flex-col gap-2.5 p-3.5 bg-luxury-bg border border-luxury-border rounded-2xl mb-4">
              <div className="flex justify-between items-center text-xs font-bold border-b border-luxury-border pb-1.5">
                <span className="text-gray-400">الاسم واللقب:</span>
                <span className="text-white">{selectedCustomer.full_name}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold border-b border-luxury-border pb-1.5">
                <span className="text-gray-400">رقم الموبايل:</span>
                <span className="text-gold-400 font-mono" dir="ltr">{selectedCustomer.phone}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold font-mono">
                <span className="text-gray-400">إجمالي المديونية:</span>
                <span className="text-red-400 font-bold">{selectedCustomer.current_balance} ج.م</span>
              </div>
            </div>

            {/* Print trigger button */}
            <button
              onClick={() => {
                const pWin = window.open('', '_blank');
                if (!pWin) return;
                pWin.document.write(`
                  <html dir="rtl" lang="ar">
                  <head>
                    <title>كارت العميل الملوكي QR - ${selectedCustomer.full_name}</title>
                    <style>
                      body { text-align: center; font-family: sans-serif; padding: 40px; background: #fff; }
                      .card { border: 4px solid #d4af37; border-radius: 15px; padding: 30px; display: inline-block; width: 300px; }
                      .logo { font-size: 20px; font-weight: bold; margin-bottom: 20px; }
                      .qr { margin: 20px 0; }
                      .name { font-size: 18px; font-weight: bold; }
                      .phone { font-size: 14px; color: #555; font-family: monospace; }
                    </style>
                  </head>
                  <body>
                    <div class="card">
                      <img src="${getEldeebLogoDataUrl(300, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 160px; width: auto; margin: 0 auto 10px; display: block; filter: contrast(145%) brightness(92%) saturate(125%) drop-shadow(0 3px 10px rgba(0,0,0,0.25)); -webkit-filter: contrast(145%) brightness(92%) saturate(125%) drop-shadow(0 3px 10px rgba(0,0,0,0.25)); image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" />
                      <div class="logo" style="margin-top: 6px;">كافيه الديب • Cafe Eldeeb</div>
                      <div class="name">${selectedCustomer.full_name}</div>
                      <div class="phone">${selectedCustomer.phone}</div>
                      <div class="qr">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(customerQrPayload)}" width="180"/>
                      </div>
                      <div style="font-size:11px;color:#777;margin-top:10px;">امسح الكود لعرض الحساب في الكاشير</div>
                    </div>
                    <script>window.onload=function(){window.print();}</script>
                  </body>
                  </html>
                `);
                pWin.document.close();
              }}
              className="w-full py-2.5 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl shadow-md hover:opacity-90 active:scale-95 transition-all text-xs cursor-pointer"
            >
              🖨️ طباعة كارت التعارف الـ QR Code
            </button>

          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* --- ADD DIRECT VISIT LOG MODAL --- */}
      {showAddVisitModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto">
            
            <button 
              onClick={() => setShowAddVisitModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-white transition-all cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 flex items-center gap-2 mb-4 border-b border-luxury-border pb-3">
              <Calendar className="w-5 h-5" />
              تسجيل زيارة مباشرة للعميل للكافيه
            </h3>

            <div className="bg-luxury-bg border border-luxury-border p-3 rounded-2xl mb-4 text-right">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">اسم العميل والزيارة:</span>
              <span className="text-xs font-bold text-white block">{selectedCustomer.full_name}</span>
            </div>

            <form onSubmit={handleAddManualVisit} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400">ملاحظات الزيارة أو سبب اللقاء</label>
                <textarea
                  placeholder="مثال: زيارة لتسوية مديونيات، لقاء عمل، استضافة خاصة..."
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  className="w-full h-20 bg-luxury-bg border border-luxury-border rounded-xl text-xs p-2.5 text-white focus:outline-none focus:border-gold-500 text-right resize-none"
                  required
                />
              </div>

              <div className="flex gap-3 text-xs font-bold sticky bottom-0 bg-luxury-card border-t border-luxury-border/80 pt-3 z-10">
                <button
                  type="button"
                  onClick={() => setShowAddVisitModal(false)}
                  className="w-1/2 py-2 bg-luxury-bg border border-luxury-border hover:bg-luxury-card text-gray-300 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-gradient-to-r from-gold-600 to-gold-700 text-black font-extrabold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  حفظ وتسجيل الزيارة
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* --- Custom Confirmation Modal (Safe for iframe and web previews) --- */}
      {confirmModalState.isOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-5 text-right relative">
            <div className="flex justify-between items-center border-b border-luxury-border pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {confirmModalState.title}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-medium">
              {confirmModalState.message}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-luxury-bg border border-luxury-border text-gray-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = confirmModalState.onConfirm;
                  setConfirmModalState(prev => ({ ...prev, isOpen: false }));
                  if (cb) cb();
                }}
                className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md active:scale-95 ${
                  confirmModalState.confirmBg || 'bg-gradient-to-r from-gold-600 to-gold-700 text-black font-black'
                }`}
              >
                {confirmModalState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

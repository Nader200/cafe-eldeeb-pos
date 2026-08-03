/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  ShoppingCart, 
  Trash2, 
  Calendar, 
  Coffee, 
  User, 
  Layers, 
  Search, 
  RefreshCw, 
  Eye, 
  Clock, 
  Lock, 
  ShieldCheck, 
  Check,
  ChevronDown,
  ArrowRightLeft,
  Scissors,
  Bookmark,
  Users,
  Grid,
  Info,
  ChevronLeft,
  Settings,
  X,
  Gamepad2
} from 'lucide-react';
import { dbService, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { Invoice, Customer, TableSystem, InvoiceItem } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface OpenInvoicesViewProps {
  onNavigate: (tab: string) => void;
  onSelectInvoiceForEdit: (id: string) => void;
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

type MainTabType = 'invoices' | 'tables';
type SortType = 'NEWEST' | 'OLDEST' | 'CUSTOMER' | 'TABLE';
type DetailTabType = 'items' | 'operations';

export default function OpenInvoicesView({
  onNavigate,
  onSelectInvoiceForEdit,
  onShowSuccessAlert,
  onShowWarningAlert
}: OpenInvoicesViewProps) {
  const { currentUser } = useAuth();
  // Main Navigation tabs
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('invoices');
  
  // Data State
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tables, setTables] = useState<TableSystem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [operationalFilter, setOperationalFilter] = useState<'ALL' | 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  
  // Selected Invoice Detail Left-Tab
  const [detailTab, setDetailTab] = useState<DetailTabType>('items');

  // Sorting
  const [sortBy, setSortBy] = useState<SortType>('NEWEST');

  // Live Timer Redraw Force
  const [ticks, setTicks] = useState<number>(0);

  // Deletion Protection
  const [showDeletePinModal, setShowDeletePinModal] = useState<boolean>(false);
  const [invoiceToDeleteId, setInvoiceToDeleteId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');

  // Table Management Dialogs
  const [selectedTable, setSelectedTable] = useState<TableSystem | null>(null);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  
  // Reservation Dialog
  const [showReserveModal, setShowReserveModal] = useState<boolean>(false);
  const [reserveCustName, setReserveCustName] = useState<string>('');
  const [reserveTime, setReserveTime] = useState<string>('');
  const [reserveNotes, setReserveNotes] = useState<string>('');

  // Move Table Order Dialog
  const [showMoveTableModal, setShowMoveTableModal] = useState<boolean>(false);
  const [targetTableId, setTargetTableId] = useState<string>('');

  // Merge Tables Dialog
  const [showMergeTableModal, setShowMergeTableModal] = useState<boolean>(false);
  const [mergeSourceTableIds, setMergeSourceTableIds] = useState<string[]>([]);
  const [mergeTargetTableId, setMergeTargetTableId] = useState<string>('');

  // Move Invoice dialog (Under Advanced Ops)
  const [showMoveInvoiceModal, setShowMoveInvoiceModal] = useState<boolean>(false);
  const [invoiceMoveCustId, setInvoiceMoveCustId] = useState<string>('');
  const [invoiceMoveTableId, setInvoiceMoveTableId] = useState<string>('');

  // Move Invoice to PlayStation Session state
  const [showMoveToPSModal, setShowMoveToPSModal] = useState<boolean>(false);
  const [selectedPSDeviceId, setSelectedPSDeviceId] = useState<string>('');

  // Split Invoice Dialog (Under Advanced Ops)
  const [showSplitInvoiceModal, setShowSplitInvoiceModal] = useState<boolean>(false);
  const [splitPartsCount, setSplitPartsCount] = useState<number>(2);

  // Split Items state (Under Advanced Ops)
  const [showSplitItemsModal, setShowSplitItemsModal] = useState<boolean>(false);
  const [selectedSplitItems, setSelectedSplitItems] = useState<Record<string, number>>({}); // itemId -> qty to move

  // Merge Invoices state (Under Advanced Ops)
  const [showMergeInvoicesModal, setShowMergeInvoicesModal] = useState<boolean>(false);
  const [selectedMergeInvoiceIds, setSelectedMergeInvoiceIds] = useState<string[]>([]);

  // Move Item Between Invoices state
  const [showMoveItemModal, setShowMoveItemModal] = useState<boolean>(false);
  const [movingItem, setMovingItem] = useState<InvoiceItem | null>(null);
  const [moveItemQty, setMoveItemQty] = useState<number>(1);
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');

  const settings = useMemo(() => dbService.getSettings(), []);

  // Sync data on load and dynamic updates
  const loadData = () => {
    const list = dbService.getOpenInvoices();
    setOpenInvoices(list);
    setCustomers(dbService.getCustomers());
    setTables(dbService.getTables());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('cafe_db_synced_remote', loadData);
    // Refresh live timers every 10 seconds
    const interval = setInterval(() => {
      setTicks(prev => prev + 1);
    }, 10000);
    return () => {
      window.removeEventListener('cafe_db_synced_remote', loadData);
      clearInterval(interval);
    };
  }, []);

  // Update tables occupied status dynamically based on open invoices
  const tablesWithLiveStatus = useMemo(() => {
    const updatedTables = [...tables];
    updatedTables.forEach((table, idx) => {
      // Find any open invoice assigned to this table
      const activeInvs = openInvoices.filter(
        inv => inv.table_number === table.id && (inv.invoice_status === 'OPEN' || inv.invoice_status === 'DRAFT')
      );
      
      if (activeInvs.length > 0) {
        // Find earliest creation date
        activeInvs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        updatedTables[idx] = {
          ...table,
          status: 'OCCUPIED',
          occupied_since: activeInvs[0].created_at
        };
      } else if (table.status === 'OCCUPIED') {
        // If occupied in status but no active open invoice, reset to FREE
        updatedTables[idx] = {
          ...table,
          status: 'FREE',
          occupied_since: undefined
        };
      }
    });
    return updatedTables;
  }, [tables, openInvoices, ticks]);

  const getCustomerName = (customerId: string | null) => {
    if (!customerId || customerId === 'c_general') return 'عميل عام كاونتر';
    const c = customers.find(cust => cust.id === customerId);
    return c ? c.full_name : 'عميل مجهول';
  };

  const handleEditOpenInvoice = (invoiceId: string) => {
    onSelectInvoiceForEdit(invoiceId);
    onNavigate('pos');
  };

  const handleDeleteConfirm = () => {
    if (!invoiceToDeleteId) return;

    if (deletePin !== settings.pin_code) {
      setDeleteError('رمز الأمان PIN للمسؤول غير صحيح!');
      return;
    }

    try {
      const invoices = dbService.getInvoices(true);
      const filtered = invoices.filter(inv => inv.id !== invoiceToDeleteId);
      
      localStorage.setItem('cafe_invoices', JSON.stringify(filtered));
      
      const allItems = JSON.parse(localStorage.getItem('cafe_invoice_items') || '[]');
      const filteredItems = allItems.filter((it: any) => it.invoice_id !== invoiceToDeleteId);
      localStorage.setItem('cafe_invoice_items', JSON.stringify(filteredItems));
      dbService.syncToServer();
      
      dbService.logAuditAction(
        'CANCEL_OPEN_INVOICE', 
        `تم إلغاء وحذف الفاتورة المفتوحة رقم ${invoiceToDeleteId} بالكامل من نظام التعليق بواسطة المسؤول`, 
        'أدمن النظام / نادر الديب'
      );
      
      onShowSuccessAlert('تم حذف وإلغاء الفاتورة المفتوحة بنجاح وصفرت تعليقاتها.');
      
      setShowDeletePinModal(false);
      setInvoiceToDeleteId(null);
      setDeletePin('');
      setDeleteError('');
      loadData();

      if (selectedInvoice?.id === invoiceToDeleteId) {
        setSelectedInvoice(null);
      }
    } catch (e: any) {
      onShowWarningAlert('حدث خطأ أثناء إلغاء الفاتورة.');
    }
  };

  const handleViewDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const items = dbService.getInvoiceItems(invoice.id);
    setInvoiceItems(items);
    setDetailTab('items');
  };

  const formatDateTime = (isoString: string) => {
    if (!isoString) return 'غير محدد';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'غير محدد';
    return date.toLocaleDateString('ar-EG', { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const getInvoiceItemsCount = (invoiceId: string) => {
    try {
      const items = dbService.getInvoiceItems(invoiceId);
      return items.reduce((sum, item) => sum + item.quantity, 0);
    } catch {
      return 0;
    }
  };

  // Occupied timer calculator
  const getOccupiedDuration = (occupiedSince?: string) => {
    if (!occupiedSince) return '';
    const start = new Date(occupiedSince).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const minsRem = mins % 60;
    if (hrs > 0) {
      return `${hrs} ساعة و ${minsRem} د`;
    }
    return `${mins} دقيقة`;
  };

  // Searching & sorting open invoices
  const sortedAndFilteredInvoices = useMemo(() => {
    let result = [...openInvoices].filter(inv => {
      const numMatch = inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase());
      const custMatch = getCustomerName(inv.customer_id).toLowerCase().includes(searchQuery.toLowerCase());
      const tableMatch = (inv.table_number || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchSearch = numMatch || custMatch || tableMatch;

      const opStatus = inv.operational_status || 'NEW';
      const matchOp = operationalFilter === 'ALL' || opStatus === operationalFilter;

      return matchSearch && matchOp;
    });

    if (sortBy === 'NEWEST') {
      result.sort((a, b) => new Date(b.created_at || b.invoice_date).getTime() - new Date(a.created_at || a.invoice_date).getTime());
    } else if (sortBy === 'OLDEST') {
      result.sort((a, b) => new Date(a.created_at || a.invoice_date).getTime() - new Date(b.created_at || b.invoice_date).getTime());
    } else if (sortBy === 'CUSTOMER') {
      result.sort((a, b) => getCustomerName(a.customer_id).localeCompare(getCustomerName(b.customer_id), 'ar'));
    } else if (sortBy === 'TABLE') {
      result.sort((a, b) => {
        const tableA = parseInt(a.table_number?.replace(/\D/g, '') || '999');
        const tableB = parseInt(b.table_number?.replace(/\D/g, '') || '999');
        return tableA - tableB;
      });
    }

    return result;
  }, [openInvoices, searchQuery, customers, sortBy, operationalFilter]);

  // --- Table Reservation Actions ---
  const handleReserveSubmit = () => {
    if (!selectedTable || !reserveCustName || !reserveTime) {
      onShowWarningAlert('يرجى ملء كافة تفاصيل الحجز الأساسية!');
      return;
    }
    dbService.reserveTable(selectedTable.id, reserveCustName, reserveTime, reserveNotes);
    onShowSuccessAlert(`تم حجز الطاولة (${selectedTable.name}) للعميل (${reserveCustName}) في تمام الساعة ${reserveTime}.`);
    setShowReserveModal(false);
    setShowTableModal(false);
    setReserveCustName('');
    setReserveTime('');
    setReserveNotes('');
    loadData();
  };

  const handleClearTableReservation = (tableId: string) => {
    dbService.clearTable(tableId);
    onShowSuccessAlert(`تم إلغاء الحجز وتفريغ الطاولة بنجاح.`);
    setShowTableModal(false);
    loadData();
  };

  // --- Move Table Actions ---
  const handleMoveTableSubmit = () => {
    if (!selectedTable || !targetTableId) {
      onShowWarningAlert('يرجى تحديد الطاولة المستهدفة لنقل الطلبات إليها!');
      return;
    }
    if (selectedTable.id === targetTableId) {
      onShowWarningAlert('لا يمكن نقل الطاولة لنفسها!');
      return;
    }
    try {
      dbService.moveTable(selectedTable.id, targetTableId, 'نادر الديب (أدمن)');
      onShowSuccessAlert(`تم نقل جميع الطلبات من الطاولة ${selectedTable.id} إلى الطاولة ${targetTableId} وتحديث الحسابات.`);
      setShowMoveTableModal(false);
      setShowTableModal(false);
      setTargetTableId('');
      loadData();
      if (selectedInvoice?.table_number === selectedTable.id) {
        setSelectedInvoice(null);
      }
    } catch (err: any) {
      onShowWarningAlert(err.message || 'فشل نقل الطاولة');
    }
  };

  // --- Merge Tables Action ---
  const handleMergeTablesSubmit = () => {
    if (mergeSourceTableIds.length === 0 || !mergeTargetTableId) {
      onShowWarningAlert('يرجى اختيار الطاولات المصدر وطاولة الدمج المستهدفة!');
      return;
    }
    try {
      // For each source table, find its open invoices and merge them into the target table's first open invoice (or target table id)
      const sourceInvoices = openInvoices.filter(i => mergeSourceTableIds.includes(i.table_number || ''));
      if (sourceInvoices.length === 0) {
        onShowWarningAlert('لا توجد فواتير نشطة على الطاولات المحددة للدمج!');
        return;
      }

      // Find or create target invoice
      const targetInvs = openInvoices.filter(i => i.table_number === mergeTargetTableId);
      let targetInvId = '';
      if (targetInvs.length > 0) {
        targetInvId = targetInvs[0].id;
      } else {
        // Create a blank target invoice registered with target table
        const year = new Date().getFullYear();
        const seq = String(openInvoices.length + 1).padStart(5, '0');
        const num = `INV-${year}-${seq}`;
        const newInv: Invoice = {
          id: `inv_${Date.now()}`,
          invoice_number: num,
          customer_id: 'c_general',
          payment_type: 'CASH',
          subtotal: 0,
          discount: 0,
          tax: 0,
          total: 0,
          paid_amount: 0,
          remaining_amount: 0,
          invoice_status: 'OPEN',
          cashier_name: 'نادر الديب (أدمن)',
          invoice_date: new Date().toISOString(),
          table_number: mergeTargetTableId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          timeline: [{
            status: 'OPEN',
            timestamp: new Date().toISOString(),
            operator: 'نادر الديب (أدمن)',
            notes: `فاتورة جديدة تم إنشاؤها لاستقبال دمج الطاولات: ${mergeSourceTableIds.join(', ')}`
          }]
        };
        const allInvoices = JSON.parse(localStorage.getItem('cafe_invoices') || '[]');
        allInvoices.push(newInv);
        localStorage.setItem('cafe_invoices', JSON.stringify(allInvoices));
        dbService.syncToServer();
        targetInvId = newInv.id;
      }

      const allIdsToMerge = [...sourceInvoices.map(s => s.id), targetInvId].filter((v, i, a) => a.indexOf(v) === i);
      if (allIdsToMerge.length < 2) {
        onShowWarningAlert('العملية تتطلب دمج فاتورتين مفتوحتين على الأقل!');
        return;
      }

      dbService.mergeOpenInvoices(allIdsToMerge, 'نادر الديب (أدمن)', mergeTargetTableId);
      
      // Update tables system
      mergeSourceTableIds.forEach(srcId => {
        dbService.clearTable(srcId);
      });
      // Start occupant timer on target table
      const listT = dbService.getTables();
      const tgIdx = listT.findIndex(t => t.id === mergeTargetTableId);
      if (tgIdx > -1) {
        listT[tgIdx].status = 'OCCUPIED';
        listT[tgIdx].occupied_since = new Date().toISOString();
        dbService.updateTable(listT[tgIdx]);
      }

      onShowSuccessAlert(`تم دمج الطاولات [${mergeSourceTableIds.join(', ')}] في الطاولة المستهدفة ${mergeTargetTableId} بالكامل.`);
      setShowMergeTableModal(false);
      setMergeSourceTableIds([]);
      setMergeTargetTableId('');
      loadData();
      setSelectedInvoice(null);
    } catch (e: any) {
      onShowWarningAlert(e.message || 'فشل دمج الطاولات');
    }
  };

  // --- Move Invoice Transfer ---
  const handleMoveInvoiceSubmit = () => {
    if (!selectedInvoice) return;
    try {
      dbService.transferInvoice(selectedInvoice.id, invoiceMoveCustId || null, invoiceMoveTableId || null, 'نادر الديب (أدمن)');
      onShowSuccessAlert(`تم تعديل بيانات الفاتورة ونقلها بنجاح.`);
      setShowMoveInvoiceModal(false);
      loadData();
      
      // Refresh details
      const updated = dbService.getInvoiceById(selectedInvoice.id);
      if (updated) {
        setSelectedInvoice(updated.invoice);
      }
    } catch (e: any) {
      onShowWarningAlert(e.message || 'فشل النقل');
    }
  };

  // --- Split Invoice (Equal amount) ---
  const handleSplitInvoiceSubmit = () => {
    if (!selectedInvoice) return;
    try {
      const parts = splitPartsCount;
      if (parts < 2) {
        onShowWarningAlert('يرجى تحديد جزئين على الأقل للتقسيم!');
        return;
      }
      const splitInvs = dbService.splitInvoiceByAmount(selectedInvoice.id, parts, 'نادر الديب (أدمن)');
      onShowSuccessAlert(`تم تقسيم الفاتورة رقم ${selectedInvoice.invoice_number} بالتساوي إلى ${parts} فواتير فرعية مفتوحة.`);
      setShowSplitInvoiceModal(false);
      setSelectedInvoice(null);
      loadData();
    } catch (e: any) {
      onShowWarningAlert(e.message || 'فشل تقسيم الفاتورة');
    }
  };

  // --- Split Invoice (By Selected Items) ---
  const handleSplitItemsSubmit = () => {
    if (!selectedInvoice) return;
    const splitsList = Object.entries(selectedSplitItems)
      .map(([prodId, qty]) => ({ product_id: prodId, quantity: Number(qty) }))
      .filter(s => s.quantity > 0);

    if (splitsList.length === 0) {
      onShowWarningAlert('يرجى تحديد صنف واحد على الأقل بكمية أكبر من صفر لفصله!');
      return;
    }

    try {
      const res = dbService.splitInvoiceByItems(selectedInvoice.id, splitsList, 'نادر الديب (أدمن)');
      onShowSuccessAlert(`تم تقسيم الأصناف المحددة بنجاح وتوليد فاتورة فرعية جديدة رقم ${res.newInvoice.invoice_number}.`);
      setShowSplitItemsModal(false);
      setSelectedSplitItems({});
      setSelectedInvoice(null);
      loadData();
    } catch (e: any) {
      onShowWarningAlert(e.message || 'فشل فصل الأصناف');
    }
  };

  // --- Merge Invoices (Invoice list) ---
  const handleMergeInvoicesSubmit = () => {
    if (!selectedInvoice) return;
    if (selectedMergeInvoiceIds.length === 0) {
      onShowWarningAlert('يرجى اختيار فاتورة واحدة على الأقل لدمجها!');
      return;
    }
    try {
      const allToMerge = [selectedInvoice.id, ...selectedMergeInvoiceIds];
      dbService.mergeOpenInvoices(allToMerge, 'نادر الديب (أدمن)', selectedInvoice.table_number || undefined);
      onShowSuccessAlert(`تم دمج الفواتير بنجاح وتوحيد الكميات والمبالغ المتبقية.`);
      setShowMergeInvoicesModal(false);
      setSelectedMergeInvoiceIds([]);
      setSelectedInvoice(null);
      loadData();
    } catch (e: any) {
      onShowWarningAlert(e.message || 'فشل دمج الفواتير');
    }
  };

  // --- Pay Specific Item ---
  const handlePayItemClick = (item: InvoiceItem) => {
    if (!selectedInvoice) return;
    try {
      dbService.paySelectedItem(selectedInvoice.id, item.product_id, item.quantity, 'CASH', undefined, 'نادر الديب (أدمن)');
      onShowSuccessAlert(`تم سداد حساب الصنف "${item.product_name_ar}" بالكامل بنجاح وتنزيله من حساب الفاتورة.`);
      
      // Reload current selected invoice details
      const updated = dbService.getInvoiceById(selectedInvoice.id);
      if (updated) {
        setSelectedInvoice(updated.invoice);
        setInvoiceItems(updated.items);
      } else {
        setSelectedInvoice(null);
        setInvoiceItems([]);
      }
      loadData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'فشل سداد الصنف المحدد');
    }
  };

  // --- Move Item Between Invoices Submit ---
  const handleMoveItemSubmit = () => {
    if (!selectedInvoice || !movingItem || !targetInvoiceId) {
      onShowWarningAlert('يرجى اختيار الفاتورة المستهدفة لنقل الصنف إليها!');
      return;
    }
    if (moveItemQty <= 0 || moveItemQty > movingItem.quantity) {
      onShowWarningAlert(`يرجى تحديد كمية صحيحة بين 1 و ${movingItem.quantity}!`);
      return;
    }

    try {
      dbService.moveItemBetweenInvoices(
        selectedInvoice.id,
        targetInvoiceId,
        movingItem.product_id,
        moveItemQty,
        'نادر الديب (أدمن)'
      );

      onShowSuccessAlert(`تم نقل عدد ${moveItemQty} من "${movingItem.product_name_ar}" بنجاح إلى الفاتورة المستهدفة.`);
      
      setShowMoveItemModal(false);
      setMovingItem(null);
      setTargetInvoiceId('');

      // Reload current selected invoice details
      const updated = dbService.getInvoiceById(selectedInvoice.id);
      if (updated) {
        setSelectedInvoice(updated.invoice);
        setInvoiceItems(updated.items);
      } else {
        setSelectedInvoice(null);
        setInvoiceItems([]);
      }
      loadData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'فشل نقل الصنف');
    }
  };

  // --- Move Entire Invoice to Active PlayStation Session Submit ---
  const handleMoveToPSSubmit = () => {
    if (!selectedInvoice || !selectedPSDeviceId) {
      onShowWarningAlert('يرجى تحديد جهاز بلايستيشن مستهدف!');
      return;
    }

    try {
      const psDevices = dbService.getPSDevices();
      const targetDev = psDevices.find(d => d.id === selectedPSDeviceId);
      if (!targetDev || !targetDev.current_session_id) {
        onShowWarningAlert('الجهاز المحدد ليس لديه جلسة نشطة حالياً!');
        return;
      }

      const sessionsList = dbService.getPSSessions();
      const activeSess = sessionsList.find(s => s.id === targetDev.current_session_id);
      if (!activeSess) {
        onShowWarningAlert('لم يتم العثور على الجلسة النشطة للجهاز المحدد!');
        return;
      }

      // 1. Get all items of the selected invoice
      const invoiceItemsList = dbService.getInvoiceItems(selectedInvoice.id);
      if (invoiceItemsList.length === 0) {
        onShowWarningAlert('هذه الفاتورة فارغة ولا تحتوي على أصناف لنقلها!');
        return;
      }

      // 2. Merge items into PlayStation session products
      const updatedProductsList = [...(activeSess.products || [])];
      invoiceItemsList.forEach(item => {
        const existingIdx = updatedProductsList.findIndex(p => p.product_id === item.product_id);
        if (existingIdx > -1) {
          updatedProductsList[existingIdx].quantity += item.quantity;
        } else {
          updatedProductsList.push({
            product_id: item.product_id,
            product_name_ar: item.product_name_ar,
            quantity: item.quantity,
            selling_price: item.unit_price
          });
        }
      });

      const updatedSess = {
        ...activeSess,
        products: updatedProductsList
      };

      // 3. Save the updated PlayStation Session
      dbService.savePSSession(updatedSess);

      // 4. Cancel the original open invoice
      dbService.cancelInvoice(selectedInvoice.id, 'نقل إلى بلايستيشن');

      // 5. Success notification
      onShowSuccessAlert(`تم نقل جميع الأصناف (${invoiceItemsList.reduce((sum, i) => sum + i.quantity, 0)} صنف) بنجاح إلى جلسة البلايستيشن النشطة على جهاز "${targetDev.name}"!`);
      
      // 6. Reset states and reload data
      setShowMoveToPSModal(false);
      setSelectedInvoice(null);
      setInvoiceItems([]);
      setSelectedPSDeviceId('');
      loadData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'حدث خطأ أثناء نقل الفاتورة إلى البلايستيشن.');
    }
  };

  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in" dir="rtl">
      
      {/* Visual Tab Bar Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-luxury-card border border-luxury-border p-4 rounded-3xl shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gold-950/20 border border-gold-600/30 rounded-2xl text-gold-500">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">المركز الذكي للطلبات المفتوحة وحجوزات الطاولات</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">لوحة تحكم تفاعلية متكاملة لإدارة الطاولات، الحجوزات، نقل الطلبات، ودمج أو تقسيم الفواتير مع التدقيق الشامل.</p>
          </div>
        </div>

        {/* Tab Controllers */}
        <div className="flex bg-luxury-bg border border-gray-950 p-1 rounded-2xl gap-1 w-full md:w-auto">
          <button
            onClick={() => setActiveMainTab('invoices')}
            className={`flex-1 md:flex-none px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeMainTab === 'invoices'
                ? 'bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>الطلبات والتعليقات ({openInvoices.length})</span>
          </button>
          <button
            onClick={() => setActiveMainTab('tables')}
            className={`flex-1 md:flex-none px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeMainTab === 'tables'
                ? 'bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>خريطة الطاولات والحجوزات ({tablesWithLiveStatus.filter(t=>t.status!=='FREE').length}/16)</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* RIGHT AREA - Dynamic display based on activeMainTab */}
        <div className="flex-1 bg-luxury-card border border-luxury-border rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-xl">
          
          {activeMainTab === 'invoices' ? (
            <>
              {/* Controls Bar: Searching & Filters */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 flex items-center gap-3 bg-luxury-bg border border-gray-900 rounded-2xl px-4 py-3">
                    <Search className="w-4 h-4 text-gray-500 shrink-0" />
                    <input
                      type="text"
                      placeholder="البحث برقم الفاتورة، العميل، أو رقم الطاولة المفتوحة..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none text-white text-xs w-full focus:outline-none text-right placeholder-gray-600 font-medium"
                    />
                  </div>

                  <div className="flex bg-luxury-bg border border-gray-950 p-1 rounded-2xl gap-1 shrink-0 overflow-x-auto">
                    {[
                      { type: 'NEWEST', label: 'أحدث تعليق' },
                      { type: 'OLDEST', label: 'أقدم تعليق' },
                      { type: 'CUSTOMER', label: 'اسم العميل' },
                      { type: 'TABLE', label: 'رقم الطاولة' }
                    ].map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => setSortBy(opt.type as SortType)}
                        className={`px-3 py-1.5 text-[10px] font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                          sortBy === opt.type
                            ? 'bg-gold-600 text-black font-black'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Operational Status Filter Bar */}
                <div className="flex bg-luxury-bg/70 border border-gray-900 p-1 rounded-xl gap-1 overflow-x-auto">
                  <span className="text-[10px] font-bold text-gray-500 self-center px-2 shrink-0">الحالة التشغيلية:</span>
                  {[
                    { id: 'ALL', label: 'الكل' },
                    { id: 'NEW', label: '🆕 جديد' },
                    { id: 'PREPARING', label: '🍳 جاري التحضير' },
                    { id: 'READY', label: '🔔 جاهز للاستلام' },
                    { id: 'DELIVERED', label: '🚶 تم التسليم' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setOperationalFilter(tab.id as any)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        operationalFilter === tab.id
                          ? 'bg-gold-600/20 text-gold-400 border border-gold-500/40 font-extrabold'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invoices List */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {sortedAndFilteredInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-luxury-bg border border-gray-900 flex items-center justify-center text-2xl mb-4">
                      ☕
                    </div>
                    <h4 className="text-sm font-bold text-gray-300">لا توجد طلبات معلقة نشطة حالياً</h4>
                    <p className="text-[10px] text-gray-500 mt-1">ابدأ بإنشاء طلب جديد في الكاشير واحفظه كمسودة أو طلب معلق بدون دفع.</p>
                  </div>
                ) : (
                  sortedAndFilteredInvoices.map(inv => {
                    const totalItems = getInvoiceItemsCount(inv.id);
                    const opStatus = inv.operational_status || 'NEW';
                    return (
                      <div
                        key={inv.id}
                        onClick={() => handleViewDetails(inv)}
                        className={`p-4 rounded-2xl border transition-all hover:bg-gray-950/40 relative cursor-pointer group ${
                          selectedInvoice?.id === inv.id
                            ? 'bg-gold-600/5 border-gold-600 shadow-gold-500/5'
                            : 'bg-luxury-bg/80 border-gray-900/60'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-white font-mono">{inv.invoice_number}</span>
                              {/* Financial Status Badge */}
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md border ${
                                inv.invoice_status === 'DRAFT'
                                  ? 'bg-amber-600/15 text-amber-400 border-amber-500/20'
                                  : 'bg-emerald-600/15 text-emerald-400 border-emerald-500/20'
                              }`}>
                                {inv.invoice_status === 'DRAFT' ? '📝 مسودة' : '📂 فاتورة مفتوحة'}
                              </span>

                              {/* Operational Status Badge */}
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                opStatus === 'NEW'
                                  ? 'bg-blue-600/15 text-blue-400 border-blue-500/30'
                                  : opStatus === 'PREPARING'
                                  ? 'bg-amber-600/15 text-amber-400 border-amber-500/30'
                                  : opStatus === 'READY'
                                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                                  : 'bg-purple-600/15 text-purple-300 border-purple-500/30'
                              }`}>
                                {opStatus === 'NEW' && '🆕 جديد'}
                                {opStatus === 'PREPARING' && '🍳 جاري التحضير'}
                                {opStatus === 'READY' && '🔔 جاهز للاستلام'}
                                {opStatus === 'DELIVERED' && '🚶 تم التسليم للعميل'}
                              </span>
                            </div>
                            
                            <div className="mt-2 space-y-1 text-[10px] text-gray-400">
                              <p className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-gold-500" />
                                <span>العميل: {getCustomerName(inv.customer_id)}</span>
                              </p>
                              <p className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-gold-500" />
                                <span>رقم الطاولة: {inv.table_number || 'الطلب الخارجي / كاونتر'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="text-left flex flex-col items-end">
                            <span className="text-sm font-black text-gold-500 font-mono">
                              {inv.total} <span className="text-[10px] font-bold">{settings.currency}</span>
                            </span>
                            <div className="mt-2 text-left text-[9px] text-gray-500 space-y-0.5">
                              <p className="flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3 text-gold-500" />
                                <span>مفتوح منذ: {formatDateTime(inv.created_at)}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2.5 border-t border-gray-900/40">
                          <span className="text-[10px] text-gray-500 font-bold truncate max-w-[200px]">
                            {inv.notes ? `📝 ${inv.notes}` : 'بلا ملاحظات'}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditOpenInvoice(inv.id);
                              }}
                              className="px-3 py-1 bg-gradient-to-r from-yellow-600 to-amber-500 text-black text-[9px] font-extrabold rounded-md hover:opacity-90 flex items-center gap-1 cursor-pointer shadow"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              تعديل وإغلاق (Resume)
                            </button>
                            {currentUser?.role === 'Admin' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInvoiceToDeleteId(inv.id);
                                  setDeletePin('');
                                  setDeleteError('');
                                  setShowDeletePinModal(true);
                                }}
                                className="p-1 text-gray-500 hover:text-red-500 rounded transition-all cursor-pointer"
                                title="حذف الفاتورة بالكامل"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            // TABLES MAP TAB
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="flex justify-between items-center border-b border-gray-900 pb-3">
                <div>
                  <h4 className="text-xs font-extrabold text-gold-500">خريطة الطاولات التفاعلية</h4>
                  <p className="text-[9px] text-gray-500 mt-0.5">اضغط على أي طاولة لإجراء الحجوزات، تفعيل النقل، دمج الحسابات، أو متابعة الطلب.</p>
                </div>
                
                {/* Tables Actions Bar */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setMergeSourceTableIds([]);
                      setMergeTargetTableId('');
                      setShowMergeTableModal(true);
                    }}
                    className="px-3 py-1.5 bg-luxury-bg border border-gray-950 hover:border-gold-600 text-gold-500 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    دمج طاولات بالكامل
                  </button>
                </div>
              </div>

              {/* Grid 4x4 */}
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
                  {tablesWithLiveStatus.map(table => {
                    const isOccupied = table.status === 'OCCUPIED';
                    const isReserved = table.status === 'RESERVED';
                    
                    return (
                      <div
                        key={table.id}
                        onClick={() => {
                          setSelectedTable(table);
                          setShowTableModal(true);
                        }}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] flex flex-col justify-between h-32 relative overflow-hidden group ${
                          isOccupied
                            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-lg shadow-emerald-950/10'
                            : isReserved
                            ? 'bg-blue-950/20 border-blue-500/40 shadow-lg shadow-blue-950/10'
                            : 'bg-luxury-bg/80 border-gray-900/60'
                        }`}
                      >
                        {/* Status bar */}
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black font-mono text-white tracking-wider">{table.id}</span>
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            isOccupied ? 'bg-emerald-500' : isReserved ? 'bg-blue-400 animate-pulse' : 'bg-gray-800'
                          }`} />
                        </div>

                        {/* Title */}
                        <div className="text-center py-2">
                          <p className="text-xs font-black text-white">{table.name}</p>
                          <p className={`text-[9px] font-bold mt-1 ${
                            isOccupied ? 'text-emerald-400' : isReserved ? 'text-blue-400' : 'text-gray-500'
                          }`}>
                            {isOccupied ? 'مشغولة بالخدمة' : isReserved ? 'محجوزة مسبقاً' : 'شاغرة (جاهزة)'}
                          </p>
                        </div>

                        {/* Footer: Live timer or Reservation details */}
                        <div className="border-t border-white/5 pt-1.5 text-center">
                          {isOccupied ? (
                            <p className="text-[9px] text-emerald-300 font-extrabold flex items-center justify-center gap-1">
                              <Clock className="w-3 h-3 text-emerald-400" />
                              <span>{getOccupiedDuration(table.occupied_since)}</span>
                            </p>
                          ) : isReserved ? (
                            <p className="text-[9px] text-blue-300 font-bold truncate">
                              🕒 {table.reservation_time} لـ {table.reserved_by}
                            </p>
                          ) : (
                            <p className="text-[8px] text-gray-600 font-bold">لا يوجد نشاط</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LEFT PANEL - Invoice Details & Advanced Operations */}
        <div className="w-full lg:w-96 bg-luxury-card border border-luxury-border rounded-3xl p-5 flex flex-col gap-4 overflow-hidden shadow-xl">
          
          <div className="border-b border-gray-900 pb-3">
            <h3 className="text-xs font-black text-gray-400">تتبع الإجراءات المتقدمة للفاتورة</h3>
            
            {/* Left Panel Tab selectors */}
            {selectedInvoice && (
              <div className="flex bg-luxury-bg border border-gray-950 p-1 rounded-xl mt-3 gap-1">
                <button
                  onClick={() => setDetailTab('items')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    detailTab === 'items'
                      ? 'bg-gold-600 text-black font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  تفاصيل وأصناف ({invoiceItems.length})
                </button>
                <button
                  onClick={() => setDetailTab('operations')}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                    detailTab === 'operations'
                      ? 'bg-gold-600 text-black font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  العمليات المتقدمة (Enterprise)
                </button>
              </div>
            )}
          </div>

          {!selectedInvoice ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <ClipboardList className="w-14 h-14 text-gray-800 stroke-[1.2] mb-3" />
              <p className="text-[10px] text-gray-500">حدد فاتورة معلقة من قائمة اليمين لعرض تفاصيلها وتشغيل عمليات الفصل، النقل والدمج الحسابي لها.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              
              {detailTab === 'items' ? (
                // ITEMS VIEW
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  
                  {/* Meta Grid */}
                  <div className="bg-luxury-bg/50 border border-gray-900/60 rounded-2xl p-4 space-y-3 text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">رقم الفاتورة المفتوحة:</span>
                      <span className="text-white font-black font-mono">{selectedInvoice.invoice_number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">الحالة المالية:</span>
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                        {selectedInvoice.invoice_status === 'DRAFT' ? '📝 مسودة (غير محصلة)' : '📂 فاتورة مفتوحة (غير مدفوعة)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">الحالة التشغيلية:</span>
                      <span className="text-gold-400 font-bold bg-gold-500/10 border border-gold-500/30 px-2 py-0.5 rounded-md">
                        {(selectedInvoice.operational_status || 'NEW') === 'NEW' && '🆕 جديد'}
                        {selectedInvoice.operational_status === 'PREPARING' && '🍳 جاري التحضير'}
                        {selectedInvoice.operational_status === 'READY' && '🔔 جاهز للاستلام'}
                        {selectedInvoice.operational_status === 'DELIVERED' && '🚶 تم التسليم للعميل'}
                      </span>
                    </div>

                    {/* Operational Status Quick Change Controls */}
                    <div className="pt-2 border-t border-gray-900/60 space-y-1.5">
                      <p className="text-[10px] text-gray-400 font-bold">تغيير الحالة التشغيلية (البارستا / الصالة):</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            dbService.updateInvoiceOperationalStatus(selectedInvoice.id, 'NEW');
                            loadData();
                            setSelectedInvoice({ ...selectedInvoice, operational_status: 'NEW' });
                            onShowSuccessAlert('تم تغيير الحالة التشغيلية إلى (جديد 🆕)');
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                            (selectedInvoice.operational_status || 'NEW') === 'NEW'
                              ? 'bg-blue-600/30 text-blue-300 border-blue-500'
                              : 'bg-gray-900/40 text-gray-400 border-gray-800 hover:text-white'
                          }`}
                        >
                          🆕 جديد
                        </button>
                        <button
                          onClick={() => {
                            dbService.updateInvoiceOperationalStatus(selectedInvoice.id, 'PREPARING');
                            loadData();
                            setSelectedInvoice({ ...selectedInvoice, operational_status: 'PREPARING' });
                            onShowSuccessAlert('تم تغيير الحالة التشغيلية إلى (جاري التحضير 🍳)');
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                            selectedInvoice.operational_status === 'PREPARING'
                              ? 'bg-amber-600/30 text-amber-300 border-amber-500'
                              : 'bg-gray-900/40 text-gray-400 border-gray-800 hover:text-white'
                          }`}
                        >
                          🍳 جاري التحضير
                        </button>
                        <button
                          onClick={() => {
                            dbService.updateInvoiceOperationalStatus(selectedInvoice.id, 'READY');
                            loadData();
                            setSelectedInvoice({ ...selectedInvoice, operational_status: 'READY' });
                            onShowSuccessAlert('تم تغيير الحالة التشغيلية إلى (جاهز للاستلام 🔔)');
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                            selectedInvoice.operational_status === 'READY'
                              ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                              : 'bg-gray-900/40 text-gray-400 border-gray-800 hover:text-white'
                          }`}
                        >
                          🔔 جاهز للاستلام
                        </button>
                        <button
                          onClick={() => {
                            dbService.updateInvoiceOperationalStatus(selectedInvoice.id, 'DELIVERED');
                            loadData();
                            setSelectedInvoice({ ...selectedInvoice, operational_status: 'DELIVERED' });
                            onShowSuccessAlert('تم التسليم للعميل 🚶 (الفاتورة لا تزال قائمة في الفواتير المفتوحة بانتظار التحصيل)');
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                            selectedInvoice.operational_status === 'DELIVERED'
                              ? 'bg-purple-600/30 text-purple-300 border-purple-500'
                              : 'bg-gray-900/40 text-gray-400 border-gray-800 hover:text-white'
                          }`}
                        >
                          🚶 تم التسليم للعميل
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-900/60">
                      <span className="text-gray-500">العميل الحالي:</span>
                      <span className="text-white font-bold">{getCustomerName(selectedInvoice.customer_id)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">موقع الطاولة:</span>
                      <span className="text-gold-500 font-extrabold">{selectedInvoice.table_number || 'طلب خارجي كاونتر'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">مفتوحة بواسطة:</span>
                      <span className="text-gray-400">{selectedInvoice.cashier_name}</span>
                    </div>
                    {selectedInvoice.notes && (
                      <div className="pt-2 border-t border-gray-900/50 text-gray-400 text-[10px] leading-relaxed">
                        📝 <strong>ملاحظات:</strong> {selectedInvoice.notes}
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-extrabold text-gold-500 tracking-wider">الأصناف المسجلة عليها</h4>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {invoiceItems.map(item => (
                        <div key={item.id} className="bg-luxury-bg/30 p-2.5 rounded-xl border border-gray-900/40 flex flex-col gap-2 text-xs animate-scale-in">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-extrabold text-white flex items-center gap-1.5">
                                {item.product_name_ar}
                                {item.is_paid && (
                                  <span className="text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-bold">✓ مدفوع منفصلاً</span>
                                )}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {item.quantity} × {item.unit_price} {settings.currency}
                              </p>
                            </div>
                            <span className="font-bold text-gray-300 font-mono">
                              {item.total_price} {settings.currency}
                            </span>
                          </div>

                          {!item.is_paid && (
                            <div className="flex gap-2 justify-end border-t border-gray-900/40 pt-2 mt-1">
                              <button
                                type="button"
                                onClick={() => handlePayItemClick(item)}
                                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[9px] rounded-lg cursor-pointer transition-all flex items-center gap-1"
                              >
                                💵 سداد الصنف
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMovingItem(item);
                                  setMoveItemQty(item.quantity);
                                  setTargetInvoiceId('');
                                  setShowMoveItemModal(true);
                                }}
                                className="px-2.5 py-1 bg-gold-600/10 border border-gold-600/30 hover:bg-gold-600/20 text-gold-500 font-extrabold text-[9px] rounded-lg cursor-pointer transition-all flex items-center gap-1"
                              >
                                🔄 نقل الصنف
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Price Calculations Block */}
                  <div className="bg-luxury-bg/40 border border-gray-900/60 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">المجموع الفرعي للأصناف:</span>
                      <span className="text-gray-300 font-mono">{selectedInvoice.subtotal} {settings.currency}</span>
                    </div>
                    {selectedInvoice.discount > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-red-500 font-bold">خصومات الفاتورة:</span>
                        <span className="text-red-500 font-black font-mono">-{selectedInvoice.discount} {settings.currency}</span>
                      </div>
                    )}
                    {selectedInvoice.tax > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500">الضريبة ({Math.round((selectedInvoice.tax / Math.max(1, selectedInvoice.subtotal - selectedInvoice.discount)) * 100) || 14}%):</span>
                        <span className="text-gray-300 font-mono">+{selectedInvoice.tax} {settings.currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-black text-gold-500 pt-2 border-t border-gray-900/40">
                      <span>الحساب الإجمالي الكلي:</span>
                      <span className="font-mono">{selectedInvoice.total} {settings.currency}</span>
                    </div>
                  </div>

                </div>
              ) : (
                // ADVANCED ENTERPRISE OPERATIONS VIEW
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-right">
                  <h4 className="text-[10px] font-extrabold text-gold-500 tracking-wider mb-2">إجراءات الهيكلة المتقدمة للفاتورة</h4>
                  
                  {/* Move/Transfer Button */}
                  <button
                    onClick={() => {
                      setInvoiceMoveCustId(selectedInvoice.customer_id || '');
                      setInvoiceMoveTableId(selectedInvoice.table_number || '');
                      setShowMoveInvoiceModal(true);
                    }}
                    className="w-full p-3.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-white rounded-2xl text-xs font-bold transition-all text-right flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <ArrowRightLeft className="w-4 h-4 text-gold-500" />
                      <span>نقل الفاتورة بالكامل (Move Invoice)</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>

                  {/* Transfer to PlayStation Session */}
                  <button
                    onClick={() => {
                      setSelectedPSDeviceId('');
                      setShowMoveToPSModal(true);
                    }}
                    className="w-full p-3.5 bg-purple-950/20 border border-purple-900/30 hover:border-purple-600 text-purple-400 rounded-2xl text-xs font-bold transition-all text-right flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Gamepad2 className="w-4 h-4 text-purple-500" />
                      <span>نقل الفاتورة إلى جلسة بلايستيشن (Move to PS)</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-purple-500" />
                  </button>

                  {/* Move Selected Items Button */}
                  <button
                    onClick={() => {
                      const initialSplits: Record<string, number> = {};
                      invoiceItems.forEach(item => {
                        initialSplits[item.product_id] = 0;
                      });
                      setSelectedSplitItems(initialSplits);
                      setShowSplitItemsModal(true);
                    }}
                    className="w-full p-3.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-white rounded-2xl text-xs font-bold transition-all text-right flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Scissors className="w-4 h-4 text-gold-500" />
                      <span>نقل وفصل أصناف محددة (Split Items)</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>

                  {/* Merge Invoices Button */}
                  <button
                    onClick={() => {
                      setSelectedMergeInvoiceIds([]);
                      setShowMergeInvoicesModal(true);
                    }}
                    className="w-full p-3.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-white rounded-2xl text-xs font-bold transition-all text-right flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-gold-500" />
                      <span>دمج فواتير مفتوحة أخرى فيها</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>

                  {/* Split Invoice Equally Button */}
                  <button
                    onClick={() => {
                      setSplitPartsCount(2);
                      setShowSplitInvoiceModal(true);
                    }}
                    className="w-full p-3.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-white rounded-2xl text-xs font-bold transition-all text-right flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-gold-500" />
                      <span>تقسيم القيمة بالتساوي (Equal Split)</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>

                  <div className="bg-yellow-600/10 border border-yellow-600/20 rounded-2xl p-3 text-[10px] text-yellow-500 flex gap-2 leading-relaxed mt-4">
                    <Info className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span>يتم تسجيل تفاصيل هذه الحركات وتوليد سجلات التدقيق الآلي والـ Timeline بالكامل لضمان الأمان والرقابة المالية.</span>
                  </div>
                </div>
              )}

              {/* Core Resume Button */}
              <button
                onClick={() => handleEditOpenInvoice(selectedInvoice.id)}
                className="w-full mt-4 py-3 bg-gradient-to-r from-gold-500 to-gold-700 text-black font-extrabold rounded-2xl text-xs transition-all hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
                متابعة وإغلاق الحساب في الكاشير
              </button>
            </div>
          )}
        </div>

      </div>

      {/* --- MODAL 1: TABLE DETAILS & ACTIONS MODAL --- */}
      {showTableModal && selectedTable && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowTableModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-extrabold text-gold-500 mb-2 border-b border-gray-900 pb-2 flex items-center gap-2">
              <Grid className="w-5 h-5 text-gold-500" />
              إدارة الطاولة: {selectedTable.name} ({selectedTable.id})
            </h3>

            {/* Status Information block */}
            <div className="bg-luxury-bg border border-gray-950 p-4 rounded-2xl space-y-2 text-xs text-gray-300 mt-4">
              <p>حالة الطاولة الحالية: <span className={`font-black ${
                selectedTable.status === 'OCCUPIED' ? 'text-emerald-400' : selectedTable.status === 'RESERVED' ? 'text-blue-400' : 'text-gray-500'
              }`}>{selectedTable.status === 'OCCUPIED' ? 'مشغولة بالخدمة' : selectedTable.status === 'RESERVED' ? 'محجوزة مسبقاً' : 'شاغرة'}</span></p>
              
              {selectedTable.status === 'OCCUPIED' && selectedTable.occupied_since && (
                <p>مفتوحة للخدمة منذ: <span className="text-white font-mono">{formatDateTime(selectedTable.occupied_since)} ({getOccupiedDuration(selectedTable.occupied_since)})</span></p>
              )}
              {selectedTable.status === 'RESERVED' && (
                <>
                  <p>محجوزة باسم العميل: <span className="text-white font-bold">{selectedTable.reserved_by}</span></p>
                  <p>الساعة: <span className="text-white font-mono">{selectedTable.reservation_time}</span></p>
                  {selectedTable.reservation_notes && <p>ملاحظات الحجز: <span className="text-gray-400">{selectedTable.reservation_notes}</span></p>}
                </>
              )}
            </div>

            {/* Core Action Menu */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              {/* If FREE or RESERVED -> Reserve table */}
              {(selectedTable.status === 'FREE' || selectedTable.status === 'RESERVED') && (
                <button
                  onClick={() => {
                    setReserveCustName(selectedTable.reserved_by || '');
                    setReserveTime(selectedTable.reservation_time || '');
                    setReserveNotes(selectedTable.reservation_notes || '');
                    setShowReserveModal(true);
                  }}
                  className="p-3 bg-luxury-bg border border-gray-900 hover:border-blue-600 text-blue-400 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer"
                >
                  <Bookmark className="w-5 h-5" />
                  <span>{selectedTable.status === 'RESERVED' ? 'تعديل الحجز' : 'حجز الطاولة'}</span>
                </button>
              )}

              {/* If RESERVED -> Clear reservation */}
              {selectedTable.status === 'RESERVED' && (
                <button
                  onClick={() => handleClearTableReservation(selectedTable.id)}
                  className="p-3 bg-luxury-bg border border-gray-900 hover:border-red-600 text-red-400 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>إلغاء تفريغ الحجز</span>
                </button>
              )}

              {/* If OCCUPIED -> Move table */}
              {selectedTable.status === 'OCCUPIED' && (
                <button
                  onClick={() => {
                    setTargetTableId('');
                    setShowMoveTableModal(true);
                  }}
                  className="p-3 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-gold-500 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer"
                >
                  <ArrowRightLeft className="w-5 h-5" />
                  <span>نقل الطاولة بالكامل</span>
                </button>
              )}

              {/* Open POS table order */}
              <button
                onClick={() => {
                  localStorage.setItem('temp_pos_table_number', selectedTable.id);
                  if (selectedTable.status === 'RESERVED' && selectedTable.reserved_by) {
                    // Pre-fill General or some notes
                  }
                  onNavigate('pos');
                  setShowTableModal(false);
                }}
                className="p-3 bg-gradient-to-r from-yellow-600 to-amber-500 text-black rounded-xl text-xs font-black transition-all text-center flex flex-col items-center gap-1 cursor-pointer col-span-2 shadow"
              >
                <ShoppingCart className="w-5 h-5" />
                <span>فتح / تحميل الطاولة على الكاشير فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB MODAL 2: TABLE RESERVATION FORM --- */}
      {showReserveModal && selectedTable && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-sm bg-[#070707] border border-gold-600/30 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowReserveModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-4 border-b border-gray-900 pb-2">
              حجز الطاولة: {selectedTable.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">اسم العميل لحجز الطاولة *</label>
                <input
                  type="text"
                  placeholder="مثال: المهندس أحمد الشافعي"
                  value={reserveCustName}
                  onChange={(e) => setReserveCustName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">ساعة الحجز المطلوبة *</label>
                <input
                  type="text"
                  placeholder="مثال: 07:30 م أو 20:00"
                  value={reserveTime}
                  onChange={(e) => setReserveTime(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات الحجز الإضافية</label>
                <textarea
                  placeholder="عدد الأفراد، تفضيلات، شروط..."
                  value={reserveNotes}
                  onChange={(e) => setReserveNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowReserveModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleReserveSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  تأكيد وحفظ الحجز
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB MODAL 3: MOVE TABLE ORDER FORM --- */}
      {showMoveTableModal && selectedTable && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-sm bg-[#070707] border border-gold-600/30 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowMoveTableModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-4 border-b border-gray-900 pb-2">
              نقل طلبات الطاولة: {selectedTable.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1.5">اختر الطاولة البديلة لنقل الطلب إليها *</label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                >
                  <option value="">-- اختر الطاولة المستهدفة --</option>
                  {tablesWithLiveStatus.filter(t => t.id !== selectedTable.id).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.status === 'OCCUPIED' ? '(نشطة وممتلئة)' : t.status === 'RESERVED' ? '(محجوزة مسبقاً)' : '(شاغرة)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowMoveTableModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleMoveTableSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  نقل الطلب بالكامل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: MERGE TABLES SELECTION --- */}
      {showMergeTableModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowMergeTableModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-2 border-b border-gray-900 pb-2">
              دمج حسابات مجموعة طاولات
            </h3>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">حدد الطاولات التي تريد تفريغها ونقل فواتيرها كاملة إلى الطاولة المدمجة المستهدفة.</p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">طاولة التوحيد المستهدفة (Target Table) *</label>
                <select
                  value={mergeTargetTableId}
                  onChange={(e) => setMergeTargetTableId(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-bold"
                >
                  <option value="">-- اختر طاولة الدمج والتوطين المستهدفة --</option>
                  {tablesWithLiveStatus.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1.5">اختر الطاولات المصدر المطلوب دمجها (اختر واحدة أو أكثر) *</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-luxury-bg border border-gray-900 p-3 rounded-2xl">
                  {tablesWithLiveStatus.filter(t => t.id !== mergeTargetTableId && t.status === 'OCCUPIED').map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer p-1 rounded hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={mergeSourceTableIds.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMergeSourceTableIds([...mergeSourceTableIds, t.id]);
                          } else {
                            setMergeSourceTableIds(mergeSourceTableIds.filter(id => id !== t.id));
                          }
                        }}
                        className="accent-gold-500"
                      />
                      <span>{t.name} (نشطة)</span>
                    </label>
                  ))}
                  {tablesWithLiveStatus.filter(t => t.status === 'OCCUPIED').length === 0 && (
                    <p className="text-[10px] text-gray-500 col-span-2 text-center py-4">⚠️ لا توجد أي طاولات أخرى مشغولة حالياً لدمجها.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowMergeTableModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleMergeTablesSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  دمج الطاولات المحددة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ENTERPRISE MODAL: MOVE INVOICE --- */}
      {showMoveInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowMoveInvoiceModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-1 border-b border-gray-900 pb-2 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              نقل الفاتورة بالكامل (Move Invoice)
            </h3>
            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              الفاتورة الحالية: <strong className="text-white font-mono">#{selectedInvoice.invoice_number}</strong> 
              {selectedInvoice.table_number ? ` (طاولة ${selectedInvoice.table_number})` : ' (طلب خارجي)'}.
              اختر الوجهة المستهدفة أدناه بنقرة واحدة للنقل الفوري:
            </p>

            <div className="space-y-4">
              {/* Optional alternative customer selector */}
              <div className="bg-luxury-bg border border-gray-900 p-3 rounded-2xl">
                <label className="text-[10px] text-gray-400 font-bold block mb-1">العميل المرتبط بالفاتورة (اختياري)</label>
                <select
                  value={invoiceMoveCustId}
                  onChange={(e) => setInvoiceMoveCustId(e.target.value)}
                  className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Ultra-Fast Direct Table Grid */}
              <div>
                <label className="text-[10px] text-gold-500 font-black block mb-2">اختر الطاولة المستهدفة لنقل الفاتورة إليها فوراً:</label>
                
                {/* External counters choice */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      dbService.transferInvoice(selectedInvoice.id, invoiceMoveCustId || null, null, 'نادر الديب (أدمن)');
                      onShowSuccessAlert(`تم نقل الفاتورة بنجاح إلى كاونتر الطلبات الخارجية!`);
                      setShowMoveInvoiceModal(false);
                      loadData();
                      const updated = dbService.getInvoiceById(selectedInvoice.id);
                      if (updated) {
                        setSelectedInvoice(updated.invoice);
                      }
                    } catch (err: any) {
                      onShowWarningAlert(err.message || 'فشل نقل الفاتورة');
                    }
                  }}
                  className="w-full mb-3 py-3 bg-gradient-to-r from-amber-900/40 to-yellow-900/40 border border-amber-600/30 text-gold-500 hover:text-white rounded-xl text-xs font-black transition-all cursor-pointer text-center"
                >
                  🛸 تحويل لطلب خارجي بلا طاولة (كاونتر / دليفري)
                </button>

                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                  {tablesWithLiveStatus.map(t => {
                    const isCurrentTable = t.id === selectedInvoice.table_number;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isCurrentTable}
                        onClick={() => {
                          try {
                            dbService.transferInvoice(selectedInvoice.id, invoiceMoveCustId || null, t.id, 'نادر الديب (أدمن)');
                            onShowSuccessAlert(`تم نقل الفاتورة بنجاح إلى طاولة ${t.name}!`);
                            setShowMoveInvoiceModal(false);
                            loadData();
                            const updated = dbService.getInvoiceById(selectedInvoice.id);
                            if (updated) {
                              setSelectedInvoice(updated.invoice);
                            }
                          } catch (err: any) {
                            onShowWarningAlert(err.message || 'فشل نقل الفاتورة');
                          }
                        }}
                        className={`py-2.5 rounded-xl text-[11px] font-black transition-all cursor-pointer text-center border ${
                          isCurrentTable
                            ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                            : t.status === 'OCCUPIED'
                            ? 'bg-amber-950/20 border-amber-900/30 text-amber-500 hover:bg-amber-950 hover:border-amber-600'
                            : 'bg-[#121212] border-gray-900 text-gray-300 hover:border-gold-600 hover:bg-black'
                        }`}
                      >
                        <div className="font-mono text-xs">{t.name}</div>
                        <div className="text-[8px] opacity-60">
                          {isCurrentTable ? 'الحالية' : t.status === 'OCCUPIED' ? 'مشغولة' : 'شاغرة'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowMoveInvoiceModal(false)}
                  className="px-5 py-2 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إغلاق (إلغاء)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ENTERPRISE MODAL: SPLIT INVOICE BY AMOUNT --- */}
      {showSplitInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-sm bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowSplitInvoiceModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-2 border-b border-gray-900 pb-2">
              تقسيم الفاتورة بالتساوي (Equal Split)
            </h3>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">سيقوم النظام بتجزئة الفاتورة الحالية بالتساوي إلى عدة أجزاء منفصلة لتسهيل السداد على عدة أفراد.</p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">عدد الأقسام المتساوية *</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={splitPartsCount}
                  onChange={(e) => setSplitPartsCount(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                />
              </div>

              <div className="bg-luxury-bg border border-gray-950 p-3 rounded-2xl text-[10px] text-gray-400 font-medium space-y-1">
                <p>قيمة الفاتورة الأصلية: <span className="text-white font-mono">{selectedInvoice.total} ج.م</span></p>
                <p>قيمة الفاتورة الفرعية الواحدة: <span className="text-gold-500 font-mono font-black">{Math.round(selectedInvoice.total / splitPartsCount)} ج.م</span></p>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowSplitInvoiceModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSplitInvoiceSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  تقسيم الفاتورة بالتساوي
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ENTERPRISE MODAL: SPLIT SELECTED ITEMS --- */}
      {showSplitItemsModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowSplitItemsModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-2 border-b border-gray-900 pb-2">
              تقسيم وفصل أصناف الفاتورة
            </h3>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">اختر الأصناف والكميات التي تود فصلها وتجزئتها لتوليد فاتورة فرعية جديدة مستقلة تلقائياً.</p>

            <div className="space-y-4">
              <div className="max-h-56 overflow-y-auto space-y-2 bg-luxury-bg border border-gray-900 p-3 rounded-2xl">
                {invoiceItems.map(item => {
                  const currentSplitVal = selectedSplitItems[item.product_id] || 0;
                  return (
                    <div key={item.id} className="flex justify-between items-center text-xs p-2 rounded hover:bg-white/5 border-b border-gray-900/40 pb-2 last:border-b-0">
                      <div>
                        <p className="font-bold text-white">{item.product_name_ar}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">الكمية الإجمالية بالفاتورة: {item.quantity}</p>
                      </div>

                      {/* Quantity select slider/controls */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSplitItems({
                              ...selectedSplitItems,
                              [item.product_id]: Math.max(0, currentSplitVal - 1)
                            });
                          }}
                          className="w-7 h-7 bg-luxury-bg border border-gray-800 text-white rounded-lg flex items-center justify-center text-xs font-black"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-gold-500 font-mono font-bold text-xs">{currentSplitVal}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSplitItems({
                              ...selectedSplitItems,
                              [item.product_id]: Math.min(item.quantity, currentSplitVal + 1)
                            });
                          }}
                          className="w-7 h-7 bg-luxury-bg border border-gray-800 text-white rounded-lg flex items-center justify-center text-xs font-black"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowSplitItemsModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSplitItemsSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  تأكيد فصل الأصناف المحددة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ENTERPRISE MODAL: MERGE OPEN INVOICES --- */}
      {showMergeInvoicesModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => setShowMergeInvoicesModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-2 border-b border-gray-900 pb-2">
              دمج فواتير مفتوحة في الفاتورة الحالية
            </h3>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">اختر الفواتير المفتوحة الأخرى للدمج والضم الكامل داخل هذه الفاتورة: {selectedInvoice.invoice_number}</p>

            <div className="space-y-4">
              <div className="max-h-56 overflow-y-auto space-y-2 bg-luxury-bg border border-gray-900 p-3 rounded-2xl">
                {openInvoices.filter(i => i.id !== selectedInvoice.id).map(inv => (
                  <label key={inv.id} className="flex items-center justify-between text-xs p-2.5 border-b border-gray-950 rounded hover:bg-white/5 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedMergeInvoiceIds.includes(inv.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMergeInvoiceIds([...selectedMergeInvoiceIds, inv.id]);
                          } else {
                            setSelectedMergeInvoiceIds(selectedMergeInvoiceIds.filter(id => id !== inv.id));
                          }
                        }}
                        className="accent-gold-500"
                      />
                      <div>
                        <p className="font-bold text-white font-mono">{inv.invoice_number}</p>
                        <p className="text-[9px] text-gray-500">طاولة: {inv.table_number || 'بلا'} - عميل: {getCustomerName(inv.customer_id)}</p>
                      </div>
                    </div>
                    <span className="font-mono text-gold-500 font-bold">{inv.total} ج.م</span>
                  </label>
                ))}
                {openInvoices.filter(i => i.id !== selectedInvoice.id).length === 0 && (
                  <p className="text-[10px] text-gray-500 text-center py-6">⚠️ لا توجد أي فواتير مفتوحة أخرى حالياً قابلة للدمج.</p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60">
                <button
                  type="button"
                  onClick={() => setShowMergeInvoicesModal(false)}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleMergeInvoicesSubmit}
                  className="px-5 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-xl text-xs cursor-pointer shadow"
                >
                  إتمام عملية الدمج الشاملة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PIN CODE VERIFICATION MODAL FOR DELETE --- */}
      {showDeletePinModal && invoiceToDeleteId && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-sm bg-[#0a0a0a] border border-red-600/30 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <h3 className="text-sm font-extrabold text-red-500 mb-4 flex items-center gap-2 border-b border-gray-900 pb-2">
              <Lock className="w-5 h-5 text-red-500" />
              تأكيد إلغاء وحذف الفاتورة المعلقة
            </h3>

            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed font-semibold">
              ⚠️ لا يمكن إلغاء الفاتورة المفتوحة رقم <span className="text-white font-mono font-black">{invoiceToDeleteId}</span> إلا بإذن وتصريح مسبق من مسؤول النظام.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-red-400 font-bold block mb-1">رمز التحقق الأمني (Admin PIN) *</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={deletePin}
                  onChange={(e) => {
                    setDeletePin(e.target.value);
                    setDeleteError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-red-600 font-mono font-bold text-center tracking-widest"
                />
              </div>

              {deleteError && (
                <p className="text-red-500 text-[10px] font-bold text-center mt-1">
                  ⚠️ {deleteError}
                </p>
              )}

              <div className="flex gap-3 justify-end border-t border-gray-900 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeletePinModal(false);
                    setInvoiceToDeleteId(null);
                    setDeletePin('');
                    setDeleteError('');
                  }}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 text-center"
                >
                  إلغاء (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-xl text-xs font-black cursor-pointer transition-all flex-1 text-center hover:opacity-90"
                >
                  حذف وإلغاء الطلب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ENTERPRISE MODAL: MOVE ITEM BETWEEN INVOICES --- */}
      {showMoveItemModal && selectedInvoice && movingItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => {
                setShowMoveItemModal(false);
                setMovingItem(null);
              }}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-gold-500 mb-2 border-b border-gray-900 pb-2">
              🔄 نقل صنف بين الفواتير المعلقة
            </h3>
            <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
              توجيه ونقل الصنف <span className="text-white font-extrabold">"{movingItem.product_name_ar}"</span> من الفاتورة رقم <span className="font-mono text-white font-bold">{selectedInvoice.invoice_number}</span> إلى فاتورة نشطة أخرى.
            </p>

            <div className="space-y-4">
              {/* Select Target Invoice */}
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">الفاتورة المستهدفة *</label>
                <select
                  value={targetInvoiceId}
                  onChange={(e) => setTargetInvoiceId(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-bold"
                >
                  <option value="">-- اختر الفاتورة والعميل/الطاولة المستهدفة --</option>
                  {openInvoices.filter(i => i.id !== selectedInvoice.id).map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} (طاولة: {inv.table_number || 'كاونتر'} - العميل: {getCustomerName(inv.customer_id)} - الإجمالي: {inv.total} ج.م)
                    </option>
                  ))}
                </select>
                {openInvoices.filter(i => i.id !== selectedInvoice.id).length === 0 && (
                  <p className="text-[9px] text-amber-500 mt-1">⚠️ لا توجد أي فواتير مفتوحة أخرى حالياً. يجب أن تفتح فاتورة أخرى أولاً لنقل الصنف إليها.</p>
                )}
              </div>

              {/* Quantity to Move */}
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">الكمية المراد نقلها * (الحد الأقصى المتاح: {movingItem.quantity})</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMoveItemQty(prev => Math.max(1, prev - 1))}
                    className="w-8 h-8 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white font-black"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={movingItem.quantity}
                    value={moveItemQty}
                    onChange={(e) => setMoveItemQty(Math.min(movingItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-20 bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-center font-mono font-bold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMoveItemQty(prev => Math.min(movingItem.quantity, prev + 1))}
                    className="w-8 h-8 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white font-black"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoveItemModal(false);
                    setMovingItem(null);
                  }}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 text-center"
                >
                  إلغاء (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleMoveItemSubmit}
                  disabled={!targetInvoiceId}
                  className="px-4 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 disabled:opacity-40 text-black font-black rounded-xl text-xs cursor-pointer transition-all flex-1 text-center shadow-md hover:opacity-90"
                >
                  تأكيد النقل المباشر
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Entire Invoice to PlayStation Session Modal */}
      {showMoveToPSModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-lg bg-[#0a0a0a] border border-purple-900/30 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <button
              onClick={() => {
                setShowMoveToPSModal(false);
                setSelectedPSDeviceId('');
              }}
              className="absolute top-4 left-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-black text-purple-400 mb-2 border-b border-gray-900 pb-2 flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-purple-500" />
              نقل الفاتورة إلى جلسة بلايستيشن مفتوحة
            </h3>

            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
              سيتم نقل جميع الأصناف والطلبات المسجلة على الفاتورة رقم <span className="font-mono text-white font-extrabold">{selectedInvoice.invoice_number}</span> (طاولة: {selectedInvoice.table_number || 'كاونتر'} - الإجمالي: {selectedInvoice.total} ج.م) ودمجها مباشرة في جلسة البلايستيشن النشطة المختارة بالأسفل، وسيتم إغلاق هذه الفاتورة المعلقة تلقائياً كفاتورة تم نقلها.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1.5">اختر جهاز البلايستيشن المستهدف (الجلسة النشطة) *</label>
                
                {dbService.getPSDevices().filter(d => d.status.startsWith('PLAYING') || d.status === 'PAUSED').length === 0 ? (
                  <div className="p-4 bg-amber-950/15 border border-amber-900/30 rounded-2xl text-center text-amber-500 text-xs">
                    ⚠️ لا توجد أي أجهزة بلايستيشن ذات جلسات نشطة ومفتوحة حالياً داخل الصالة. يرجى فتح جلسة تشغيل أولاً في قسم البلايستيشن.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                    {dbService.getPSDevices().filter(d => d.status.startsWith('PLAYING') || d.status === 'PAUSED').map(dev => {
                      const isSelected = selectedPSDeviceId === dev.id;
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          onClick={() => setSelectedPSDeviceId(dev.id)}
                          className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-950/40 border-purple-500 text-white'
                              : 'bg-black/30 border-gray-900 hover:border-gray-800 text-gray-400'
                          }`}
                        >
                          <span className="block text-xs font-black text-white">{dev.name}</span>
                          <span className="block text-[10px] text-gray-500 mt-1">
                            الحالة: {dev.status === 'PAUSED' ? '⏸️ متوقف مؤقتاً' : '🎮 جاري اللعب'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-900/60 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoveToPSModal(false);
                    setSelectedPSDeviceId('');
                  }}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-850 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 text-center"
                >
                  إلغاء (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleMoveToPSSubmit}
                  disabled={!selectedPSDeviceId}
                  className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-500 disabled:opacity-40 text-white font-black rounded-xl text-xs cursor-pointer transition-all flex-1 text-center shadow-md hover:opacity-90"
                >
                  تأكيد النقل المباشر لـ PS
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

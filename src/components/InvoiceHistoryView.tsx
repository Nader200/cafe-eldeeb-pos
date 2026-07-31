/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ContactPickerButton } from './ContactPickerButton';
import { EldeebLogoFull } from './EldeebLogo';
import { getEldeebLogoSvgString, getEldeebLogoDataUrl } from '../lib/logoSvg';
import {
  Search,
  Filter,
  Calendar,
  Clock,
  Printer,
  FileText,
  User,
  CreditCard,
  Coins,
  Share2,
  MessageSquare,
  Download,
  CheckCircle,
  AlertTriangle,
  X,
  Archive,
  Eye,
  Shield,
  Tag,
  Hash,
  Layers,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { dbService } from '../dbService';
import { Invoice, InvoiceItem, Customer, AppSettings, PaymentType, ReturnTransaction } from '../types';
import { createInvoicePDF, shareInvoicePDFToWhatsApp } from '../utils/pdfInvoiceGenerator';

interface InvoiceHistoryViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  onNavigate?: (tab: string) => void;
  onSelectInvoiceForEdit?: (id: string) => void;
}

type DateFilterType = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';

export default function InvoiceHistoryView({
  onShowSuccessAlert,
  onShowWarningAlert,
  onNavigate,
  onSelectInvoiceForEdit
}: InvoiceHistoryViewProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => dbService.getSettings());

  // Administrative reopen state
  const [showReopenPinModal, setShowReopenPinModal] = useState<boolean>(false);
  const [reopenPin, setReopenPin] = useState<string>('');
  const [reopenError, setReopenError] = useState<string>('');

  // Search & Filter State
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState<string>('');
  const [searchCustomerName, setSearchCustomerName] = useState<string>('');
  const [searchDate, setSearchDate] = useState<string>(''); // YYYY-MM-DD
  const [searchPaymentType, setSearchPaymentType] = useState<string>('ALL'); // ALL, CASH, CREDIT, SPLIT
  const [dateRangeFilter, setDateRangeFilter] = useState<DateFilterType>('ALL');
  
  // Custom Date range states
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Show archived filter
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Detail Modal States
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  // Admin Archive Dialog
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
  const [archivePin, setArchivePin] = useState<string>('');
  const [archiveError, setArchiveError] = useState<string>('');

  // WhatsApp Dialog state
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState<boolean>(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState<string>('');

  // Return Modal States
  const [showReturnModal, setShowReturnModal] = useState<boolean>(false);
  const [returningInvoice, setReturningInvoice] = useState<Invoice | null>(null);
  const [returningInvoiceItems, setReturningInvoiceItems] = useState<InvoiceItem[]>([]);
  const [returningItemsState, setReturningItemsState] = useState<Record<string, { selected: boolean; returnQty: number }>>({});
  const [returnReason, setReturnReason] = useState<string>('Customer cancelled');
  const [otherReturnReason, setOtherReturnReason] = useState<string>('');

  // Load Data
  const loadData = () => {
    setInvoices(dbService.getInvoices().reverse()); // Newest first
    setCustomers(dbService.getCustomers());
    setSettings(dbService.getSettings());
  };

  const handleReopenInvoice = () => {
    if (!selectedInvoice) return;
    try {
      dbService.reopenClosedInvoice(selectedInvoice.id, reopenPin);
      onShowSuccessAlert(`تم إعادة فتح الفاتورة المغلقة رقم ${selectedInvoice.invoice_number} بنجاح وتحويلها كفاتورة مفتوحة للتحرير.`);
      setShowReopenPinModal(false);
      setReopenPin('');
      setReopenError('');
      setShowDetailModal(false);
      // Refresh list
      setInvoices(dbService.getInvoices().reverse());
      
      // Navigate to POS if callbacks exist!
      if (onSelectInvoiceForEdit && onNavigate) {
        onSelectInvoiceForEdit(selectedInvoice.id);
        onNavigate('pos');
      }
    } catch (e: any) {
      setReopenError(e.message || 'رمز الأمان PIN للمسؤول غير صحيح!');
    }
  };

  const handleInitiateReturn = (invoice: Invoice) => {
    const items = dbService.getInvoiceItems(invoice.id);
    const existingReturns = dbService.getReturnTransactions().filter(r => r.original_invoice_id === invoice.id);
    
    // Create initial state mapping
    const initialState: Record<string, { selected: boolean; returnQty: number }> = {};
    items.forEach(item => {
      // Calculate already returned qty
      const alreadyReturned = existingReturns.reduce((sum, r) => {
        const matchingItem = r.returned_items.find(ri => ri.product_id === item.product_id);
        return sum + (matchingItem ? matchingItem.quantity : 0);
      }, 0);
      
      const maxReturnable = item.quantity - alreadyReturned;
      
      initialState[item.product_id] = {
        selected: false,
        returnQty: maxReturnable > 0 ? maxReturnable : 0
      };
    });

    setReturningInvoice(invoice);
    setReturningInvoiceItems(items);
    setReturningItemsState(initialState);
    setReturnReason('Customer cancelled');
    setOtherReturnReason('');
    setShowReturnModal(true);
    // Hide details modal to avoid overlapping
    setShowDetailModal(false);
  };

  const handleToggleItemSelection = (productId: string) => {
    setReturningItemsState(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        selected: !prev[productId].selected
      }
    }));
  };

  const handleReturnQtyChange = (productId: string, val: number, maxReturnable: number) => {
    const sanitizedVal = Math.min(maxReturnable, Math.max(1, val));
    setReturningItemsState(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        returnQty: sanitizedVal
      }
    }));
  };

  const handleConfirmReturn = () => {
    if (!returningInvoice) return;

    // Build list of returned items
    const returnedItemsList = returningInvoiceItems
      .filter(item => returningItemsState[item.product_id]?.selected)
      .map(item => {
        const returnQty = returningItemsState[item.product_id].returnQty;
        const originalUnitPrice = item.total_price / item.quantity;
        return {
          product_id: item.product_id,
          product_name_ar: item.product_name_ar,
          quantity: returnQty,
          unit_price: originalUnitPrice,
          total_price: returnQty * originalUnitPrice
        };
      });

    const anySelected = returningInvoiceItems.some(item => returningItemsState[item.product_id]?.selected);
    if (!anySelected) {
      onShowWarningAlert('الرجاء اختيار صنف واحد على الأقل لإرجاعه بتحديد علامة الصح بجانبه.');
      return;
    }

    const finalReason = returnReason === 'Other' ? (otherReturnReason.trim() || 'Other') : returnReason;

    try {
      dbService.createReturnTransaction(
        returningInvoice.id,
        returnedItemsList,
        'نادر الديب', // operator
        finalReason
      );

      loadData();
      setShowReturnModal(false);
      
      // Open details modal again to show the updated invoice history and returned transactions!
      setSelectedInvoice(returningInvoice);
      setInvoiceItems(dbService.getInvoiceItems(returningInvoice.id));
      setShowDetailModal(true);
      
      onShowSuccessAlert('تم تسجيل مرتجع المبيعات بنجاح وتحديث كميات المخزن وحسابات العميل والتقارير!');
    } catch (err: any) {
      onShowWarningAlert(err.message || 'حدث خطأ أثناء حفظ عملية المرتجع');
    }
  };

  const handlePrintReturnReceipt = (ret: ReturnTransaction) => {
    const returnDate = new Date(ret.return_date);

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>إيصال مرتجع - ${ret.return_number}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                width: 80mm;
                margin: 0;
                padding: 10px;
                direction: rtl;
                text-align: right;
                font-size: 12px;
                color: #000;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider { border-top: 1px dashed #000; margin: 10px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 5px; }
              th, td { text-align: right; padding: 3px 0; font-size: 11px; }
              .text-left { text-align: left; }
              .text-center { text-align: center; }
              .footer { font-size: 10px; text-align: center; margin-top: 20px; }
              .badge {
                border: 1.5px solid #000;
                padding: 4px;
                display: block;
                font-weight: bold;
                text-align: center;
                margin: 10px 0;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="center" style="margin-bottom: 8px;"><img src="${getEldeebLogoDataUrl(200, false, 'gold')}" alt="Logo" style="height: 75px; width: auto; margin: 0 auto 8px; display: block;" /></div>
            <div class="center bold" style="font-size: 16px;">${settings.cafe_name}</div>
            <div class="center">${settings.address || ''}</div>
            <div class="center">هاتف: ${settings.phone || ''}</div>
            <div class="badge">إيصال مرتجع / Return Receipt</div>
            
            <div class="divider"></div>
            <div>رقم المرتجع: <b>${ret.return_number}</b></div>
            <div>رقم الفاتورة الأصلية: <b>${ret.original_invoice_number}</b></div>
            <div>تاريخ المرتجع: ${returnDate.toLocaleDateString('ar-EG')} - ${returnDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>الكاشير المسؤول: ${ret.cashier_name}</div>
            <div>السبب: ${
              ret.reason === 'Customer cancelled' ? 'رغبة العميل في الإلغاء' :
              ret.reason === 'Wrong item' ? 'صنف خاطئ' :
              ret.reason === 'Defective item' ? 'وجود عيب في الصنف' :
              ret.reason === 'Complimentary' ? 'ضيافة / مجاني' :
              ret.reason
            }</div>
            <div class="divider"></div>
            
            <div class="bold">السلع المسترجعة:</div>
            <table>
              <thead>
                <tr style="border-b: 1px solid #000;">
                  <th>الصنف</th>
                  <th class="text-center">الكمية</th>
                  <th class="text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${ret.returned_items.map(item => `
                  <tr>
                    <td>${item.product_name_ar}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-left">${item.total_price.toLocaleString()} ${settings.currency}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="divider"></div>
            <div class="bold" style="font-size: 13px; display: flex; justify-content: space-between;">
              <span>مبلغ الاسترداد الكلي:</span>
              <span class="text-left">${ret.total_return_amount.toLocaleString()} ${settings.currency}</span>
            </div>
            
            <div class="divider"></div>
            <div class="footer">
              <p>نشكر اختياركم لنا</p>
              <p>تم طباعة مرتجع المبيعات بنجاح</p>
            </div>
            
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      onShowSuccessAlert(`تم إرسال إيصال المرتجع رقم ${ret.return_number} لأمر الطباعة بنجاح.`);
    } else {
      onShowWarningAlert('تم حظر فتح نافذة الطباعة المنبثقة من قبل المتصفح. يرجى تفعيل السماح بالنوافذ المنبثقة.');
    }
  };

  const handleOpenWhatsAppReturn = (ret: ReturnTransaction) => {
    let phone = '';
    const originalInvoice = invoices.find(i => i.id === ret.original_invoice_id);
    if (originalInvoice && originalInvoice.customer_id) {
      const cust = customers.find(c => c.id === originalInvoice.customer_id);
      if (cust && cust.phone) {
        phone = cust.phone;
      }
    }
    
    const inputPhone = prompt('أدخل رقم هاتف العميل للواتساب (بما في ذلك رمز الدولة بدون + مثل: 201012345678):', phone || '20');
    if (inputPhone !== null) {
      const itemsText = ret.returned_items.map(item => `- ${item.product_name_ar} (الكمية: ${item.quantity}) - الإجمالي: ${item.total_price} ${settings.currency}`).join('%0A');
      
      const whatsappMsg = `*إيصال مرتجع / Return Receipt*%0A%0A` +
        `*رقم المرتجع:* ${ret.return_number}%0A` +
        `*رقم الفاتورة الأصلية:* ${ret.original_invoice_number}%0A` +
        `*تاريخ المرتجع:* ${new Date(ret.return_date).toLocaleDateString('ar-EG')}%0A` +
        `*الكاشير:* ${ret.cashier_name}%0A` +
        `*السبب:* ${ret.reason}%0A%0A` +
        `*السلع المسترجعة:*%0A${itemsText}%0A%0A` +
        `*مبلغ الاسترداد الكلي:* ${ret.total_return_amount} ${settings.currency}%0A%0A` +
        `نشكر اختياركم لنا ☕`;

      const cleanPhone = inputPhone.trim();
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${whatsappMsg}`;
      window.open(whatsappUrl, '_blank');
      onShowSuccessAlert('تم تحضير تفاصيل إيصال المرتجع وإرسالها لتطبيق واتساب بنجاح!');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const returnTotals = useMemo(() => {
    if (!returningInvoice) return { totalQty: 0, totalAmount: 0 };
    let totalQty = 0;
    let totalAmount = 0;
    returningInvoiceItems.forEach(item => {
      const state = returningItemsState[item.product_id];
      if (state && state.selected) {
        totalQty += state.returnQty;
        const unitPrice = item.total_price / item.quantity;
        totalAmount += state.returnQty * unitPrice;
      }
    });
    return { totalQty, totalAmount };
  }, [returningInvoice, returningInvoiceItems, returningItemsState]);

  // Filter Logic
  const filteredInvoices = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    // Calculate Week range
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate Month range
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return invoices.filter(inv => {
      // 1. Check archived status
      const isArchived = !!inv.is_archived;
      if (isArchived !== showArchived) {
        return false;
      }

      // 2. Search Invoice Number
      if (searchInvoiceNumber.trim()) {
        if (!inv.invoice_number.toLowerCase().includes(searchInvoiceNumber.toLowerCase())) {
          return false;
        }
      }

      // 3. Search Customer Name
      if (searchCustomerName.trim()) {
        const cust = customers.find(c => c.id === inv.customer_id);
        const custName = cust ? cust.full_name : 'عميل عام / نقدي';
        if (!custName.toLowerCase().includes(searchCustomerName.toLowerCase())) {
          return false;
        }
      }

      // 4. Search Exact Date
      if (searchDate) {
        const invDay = inv.invoice_date.split('T')[0];
        if (invDay !== searchDate) {
          return false;
        }
      }

      // 5. Search Payment Type
      if (searchPaymentType !== 'ALL') {
        if (inv.payment_type !== searchPaymentType) {
          return false;
        }
      }

      // 6. Range Filters
      const invDateObj = new Date(inv.invoice_date);
      const invDay = inv.invoice_date.split('T')[0];

      if (dateRangeFilter === 'TODAY') {
        if (invDay !== todayStr) return false;
      } else if (dateRangeFilter === 'THIS_WEEK') {
        if (invDateObj < startOfWeek) return false;
      } else if (dateRangeFilter === 'THIS_MONTH') {
        if (invDateObj < startOfMonth) return false;
      } else if (dateRangeFilter === 'CUSTOM') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          if (invDateObj < start) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (invDateObj > end) return false;
        }
      }

      return true;
    });
  }, [invoices, customers, searchInvoiceNumber, searchCustomerName, searchDate, searchPaymentType, dateRangeFilter, customStartDate, customEndDate, showArchived]);

  // Actions
  const handleOpenInvoiceDetails = (invoice: Invoice) => {
    const items = dbService.getInvoiceItems(invoice.id);
    setInvoiceItems(items);
    setSelectedInvoice(invoice);
    setShowDetailModal(true);
  };

  const handlePrintReceipt = (invoice: Invoice) => {
    // Generate simple thermal layout in printable iframe or window
    const cust = customers.find(c => c.id === invoice.customer_id);
    const custName = cust ? cust.full_name : 'عميل عام / نقدي';
    const originalDate = new Date(invoice.invoice_date);

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>طباعة فاتورة مبيعات - ${invoice.invoice_number}</title>
            <style>
              body {
                font-family: 'Courier New', Courier, monospace, Arial;
                width: 80mm;
                margin: 0;
                padding: 10px;
                direction: rtl;
                text-align: right;
                font-size: 12px;
                color: #000;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider { border-top: 1px dashed #000; margin: 10px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 5px; }
              th, td { text-align: right; padding: 3px 0; font-size: 11px; }
              .text-left { text-align: left; }
              .text-center { text-align: center; }
              .footer { font-size: 10px; text-align: center; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="center" style="margin-bottom: 8px;"><img src="${getEldeebLogoDataUrl(200, false, 'gold')}" alt="Logo" style="height: 75px; width: auto; margin: 0 auto 8px; display: block;" /></div>
            <div class="center bold" style="font-size: 16px;">${settings.cafe_name}</div>
            <div class="center">${settings.address || 'كافيه الديب'}</div>
            <div class="center">هاتف: ${settings.phone || 'غير مسجل'}</div>
            <div class="divider"></div>
            <div>رقم الفاتورة: <b>${invoice.invoice_number}</b></div>
            <div>التاريخ: ${originalDate.toLocaleDateString('ar-EG')} - ${originalDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>الكاشير: ${invoice.cashier_name}</div>
            <div>طريقة الدفع: ${invoice.payment_type === 'CASH' ? 'كاش نقدي' : invoice.payment_type === 'CREDIT' ? 'ذمم بالآجل' : 'مجزأ نقدي + آجل'}</div>
            <div>حالة السداد: <b>${
              invoice.payment_status === 'PAID' ? 'مدفوعة بالكامل' :
              invoice.payment_status === 'PARTIAL' ? 'مدفوعة جزئياً' :
              invoice.payment_status === 'UNPAID' ? 'غير مدفوعة - أجل' :
              'ملغاة'
            }</b></div>
            ${invoice.table_number ? `<div>رقم الطاولة: <b>${invoice.table_number}</b></div>` : ''}
            <div>العميل المرتبط: ${custName}</div>
            <div class="divider"></div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50%;">المادة</th>
                  <th style="width: 20%; text-align: center;">الكمية</th>
                  <th style="width: 30%; text-align: left;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceItems.map(item => `
                  <tr>
                    <td>${item.product_name_ar}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-left">${item.total_price.toLocaleString()} ${settings.currency}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="divider"></div>
            <div style="display: flex; justify-content: space-between;">
              <span>المجموع الفرعي:</span>
              <span>${invoice.subtotal.toLocaleString()} ${settings.currency}</span>
            </div>
            ${invoice.discount > 0 ? `
              <div style="display: flex; justify-content: space-between; color: red;">
                <span>الخصم الكلي:</span>
                <span>-${invoice.discount.toLocaleString()} ${settings.currency}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between;">
              <span>الضريبة (14%):</span>
              <span>${invoice.tax.toLocaleString()} ${settings.currency}</span>
            </div>
            <div class="divider"></div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
              <span>الإجمالي النهائي:</span>
              <span>${invoice.total.toLocaleString()} ${settings.currency}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span>المبلغ المدفوع كاشير:</span>
              <span>${invoice.paid_amount.toLocaleString()} ${settings.currency}</span>
            </div>
            ${invoice.remaining_amount > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold;">
                <span>المتبقي في الذمم:</span>
                <span>${invoice.remaining_amount.toLocaleString()} ${settings.currency}</span>
              </div>
            ` : ''}
            ${invoice.notes ? `<div style="margin-top: 10px; font-size: 10px;">📌 ملاحظات: ${invoice.notes}</div>` : ''}
            <div class="divider"></div>
            <div class="footer">${settings.receipt_footer || 'شرفتنا بزيارتك الملوكية!'}</div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      onShowSuccessAlert(`تم إرسال الفاتورة رقم ${invoice.invoice_number} لأمر الطباعة بنجاح.`);
    } else {
      onShowWarningAlert('تم حظر فتح نافذة الطباعة المنبثقة من قبل المتصفح. يرجى تفعيل السماح بالنوافذ المنبثقة.');
    }
  };

  const handleShareAsPDFAndHTML = (invoice: Invoice) => {
    // We can compile a highly visual HTML receipt and download it as an .html file
    // which is the standard elegant, offline-friendly equivalent of a shareable receipt PDF!
    const cust = customers.find(c => c.id === invoice.customer_id);
    const custName = cust ? cust.full_name : 'عميل عام / نقدي';
    const originalDate = new Date(invoice.invoice_date);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>إيصال فاتورة مبيعات #${invoice.invoice_number}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; padding: 20px; display: flex; justify-content: center; }
          .receipt-card { background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); padding: 30px; width: 380px; box-sizing: border-box; }
          .title { text-align: center; color: #111; font-size: 22px; margin: 0 0 5px 0; font-weight: bold; }
          .subtitle { text-align: center; color: #666; font-size: 12px; margin: 0; }
          .meta-item { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin: 4px 0; }
          .divider { border-bottom: 1px dashed #ccc; margin: 15px 0; }
          table { width: 100%; font-size: 12px; margin-top: 10px; }
          th { border-bottom: 2px solid #333; text-align: right; padding-bottom: 8px; color: #222; }
          td { padding: 8px 0; color: #444; border-bottom: 1px solid #eee; }
          .total-section { font-size: 12px; font-weight: bold; margin-top: 10px; }
          .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
          .grand-total { font-size: 16px; color: #c29d53; border-top: 2px solid #eee; pt: 10px; font-weight: 900; }
          .footer { text-align: center; font-size: 11px; color: #888; margin-top: 25px; }
          .btn-print { display: block; width: 100%; text-align: center; background: #c29d53; color: white; padding: 10px 0; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 20px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="title">☕ ${settings.cafe_name}</div>
          <p class="subtitle">${settings.address || 'كافيه الديب إنتربرايز'}</p>
          <p class="subtitle">هاتف: ${settings.phone || '00000'}</p>
          <div class="divider"></div>
          <div class="meta-item"><span>رقم الفاتورة:</span><b>${invoice.invoice_number}</b></div>
          <div class="meta-item"><span>تاريخ الإصدار:</span><span>${originalDate.toLocaleDateString('ar-EG')} ${originalDate.toLocaleTimeString('ar-EG')}</span></div>
          <div class="meta-item"><span>رقم الطاولة:</span><b>${invoice.table_number || 'غير متوفر'}</b></div>
          <div class="meta-item"><span>الكاشير المسؤول:</span><span>${invoice.cashier_name}</span></div>
          <div class="meta-item"><span>طريقة الدفع:</span><span>${invoice.payment_type === 'CASH' ? 'نقدي كاش' : 'آجل على الحساب'}</span></div>
          <div class="meta-item"><span>حالة السداد:</span><b>${
            invoice.payment_status === 'PAID' ? 'مدفوعة بالكامل' :
            invoice.payment_status === 'PARTIAL' ? 'مدفوعة جزئياً' :
            invoice.payment_status === 'UNPAID' ? 'غير مدفوعة - أجل' :
            'ملغاة'
          }</b></div>
          <div class="meta-item"><span>العميل:</span><span>${custName}</span></div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>المادة والمشروب</th>
                <th style="text-align: center;">الكمية</th>
                <th style="text-align: left;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceItems.map(item => `
                <tr>
                  <td>${item.product_name_ar}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: left;">${item.total_price.toLocaleString()} ${settings.currency}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total-section">
            <div class="total-row"><span>المجموع الفرعي:</span><span>${invoice.subtotal.toLocaleString()} ${settings.currency}</span></div>
            ${invoice.discount > 0 ? `<div class="total-row" style="color: red;"><span>الخصم المباشر:</span><span>-${invoice.discount.toLocaleString()} ${settings.currency}</span></div>` : ''}
            <div class="total-row"><span>الضريبة الكلية:</span><span>${invoice.tax.toLocaleString()} ${settings.currency}</span></div>
            <div class="total-row grand-total"><span>الإجمالي المستحق:</span><span>${invoice.total.toLocaleString()} ${settings.currency}</span></div>
            <div class="total-row"><span>المدفوع نقداً:</span><span>${invoice.paid_amount.toLocaleString()} ${settings.currency}</span></div>
            ${invoice.remaining_amount > 0 ? `<div class="total-row" style="color: #d97706;"><span>المتبقي في الذمة:</span><span>${invoice.remaining_amount.toLocaleString()} ${settings.currency}</span></div>` : ''}
          </div>
          ${invoice.notes ? `<p style="font-size: 11px; color:#555; background:#f9f9f9; padding: 8px; border-radius: 8px; margin-top:15px;">📌 ملاحظة: ${invoice.notes}</p>` : ''}
          <div class="footer">${settings.receipt_footer || 'شكراً لزيارتكم الملوكية!'}</div>
          <a href="#" class="btn-print" onclick="window.print(); return false;">طباعة الإيصال أو الحفظ كـ PDF</a>
        </div>
      </body>
      </html>
    `;

    // Download file logic
    const element = document.createElement('a');
    const file = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Eldeeb_Invoice_${invoice.invoice_number}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    onShowSuccessAlert(`تم إصدار وتنزيل ملف الفاتورة الملون بصيغة HTML التفاعلية! يمكنك فتحه وطباعته كـ PDF مباشرة.`);
  };

  const handleOpenWhatsAppDialog = (invoice: Invoice) => {
    const cust = customers.find(c => c.id === invoice.customer_id);
    if (cust && cust.phone) {
      setWhatsAppPhone(cust.phone);
    } else {
      setWhatsAppPhone('');
    }
    setShowWhatsAppDialog(true);
  };

  const handleSendWhatsAppMessage = async () => {
    if (!selectedInvoice) return;

    try {
      const cust = customers.find(c => c.id === selectedInvoice.customer_id);
      const items = dbService.getInvoiceItems(selectedInvoice.id);

      await shareInvoicePDFToWhatsApp({
        invoice: selectedInvoice,
        items,
        customer: cust,
        settings,
        phone: whatsAppPhone,
        onStart: (msg) => onShowSuccessAlert(msg),
        onSuccess: (msg) => {
          onShowSuccessAlert(msg);
          setShowWhatsAppDialog(false);
        },
        onError: (msg) => onShowWarningAlert(msg),
      });
    } catch (err: any) {
      console.error('Error in handleSendWhatsAppMessage:', err);
      onShowWarningAlert(err?.message || 'تعذر إرسال الفاتورة عبر الواتساب');
    }
  };

  const handleShareHistoryInvoicePDF = async (invoice: Invoice) => {
    if (!invoice) return;

    try {
      const cust = customers.find(c => c.id === invoice.customer_id);
      const custPhone = cust ? (cust.phone || cust.whatsapp || '') : '';
      const items = dbService.getInvoiceItems(invoice.id);

      await shareInvoicePDFToWhatsApp({
        invoice,
        items,
        customer: cust,
        settings,
        phone: custPhone,
        onStart: (msg) => onShowSuccessAlert(msg),
        onSuccess: (msg) => onShowSuccessAlert(msg),
        onError: (msg) => onShowWarningAlert(msg),
      });
    } catch (err: any) {
      console.error('Error in handleShareHistoryInvoicePDF:', err);
      onShowWarningAlert(err?.message || 'تعذر مشاركة الفاتورة عبر الواتساب');
    }
  };

  // Secure Admin Archiving execution
  const handleExecuteArchive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivePin) {
      setArchiveError('يرجى إدخال رمز الأمان PIN أولاً');
      return;
    }

    try {
      dbService.archiveInvoices(archivePin);
      onShowSuccessAlert('تم أرشفة وتجميد كافة الفواتير النشطة بنجاح وتحويلها للأرشيف المحمي للمسؤول!');
      setShowArchiveConfirm(false);
      setArchivePin('');
      setArchiveError('');
      loadData();
    } catch (err: any) {
      setArchiveError(err.message || 'فشلت عملية الأرشفة، يرجى التأكد من رمز الـ PIN');
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in" dir="rtl">
      
      {/* 1. ARCHIVE HEADER CARD */}
      <div className="bg-gradient-to-l from-luxury-card to-luxury-panel border border-luxury-border p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2.5">
            <Archive className="w-5 h-5 text-gold-500" />
            أرشيف تاريخ الفواتير والمبيعات الدائم
          </h2>
          <p className="text-gray-400 text-xs mt-1">تتبع وبحث كافة الفواتير المصدرة من نقطة البيع بدقة متناهية ودون أي فقدان للبيانات.</p>
        </div>
        
        <div className="flex gap-2.5">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all border cursor-pointer flex items-center gap-2 ${
              showArchived
                ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                : 'bg-luxury-bg border-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            {showArchived ? 'عرض الفواتير النشطة الحالية' : 'عرض الفواتير المؤرشفة من المسؤول'}
          </button>

          {!showArchived && (
            <button
              onClick={() => {
                setArchivePin('');
                setArchiveError('');
                setShowArchiveConfirm(true);
              }}
              className="px-4 py-2 bg-red-950/20 border border-red-900/40 hover:bg-red-950 hover:border-red-800 text-red-500 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Archive className="w-4 h-4" />
              تجميد وأرشفة الفواتير الحالية
            </button>
          )}
        </div>
      </div>

      {/* 2. DYNAMIC ENGINE FILTERS */}
      <div className="bg-luxury-card border border-luxury-border p-5 rounded-3xl shadow-lg">
        <h3 className="text-xs font-extrabold text-gold-500 mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-gold-600" />
          تصفية دقيقة وفلاتر مبيعات وتوقيت مخصصة
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          {/* Filter by Invoice Number */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">رقم الفاتورة (Invoice Number)</label>
            <div className="relative">
              <input
                id="search-invoice-num"
                type="text"
                placeholder="مثال: INV-2026-00001"
                value={searchInvoiceNumber}
                onChange={(e) => setSearchInvoiceNumber(e.target.value)}
                className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 pl-3 pr-8 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
              />
              <Hash className="w-3.5 h-3.5 text-gray-600 absolute right-2.5 top-2.5" />
            </div>
          </div>

          {/* Filter by Customer Name */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">اسم العميل المسجل</label>
            <div className="relative">
              <input
                id="search-customer-name"
                type="text"
                placeholder="ابحث باسم العميل..."
                value={searchCustomerName}
                onChange={(e) => setSearchCustomerName(e.target.value)}
                className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 pl-3 pr-8 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
              />
              <User className="w-3.5 h-3.5 text-gray-600 absolute right-2.5 top-2.5" />
            </div>
          </div>

          {/* Filter by Payment Type */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">نوع طريقة الدفع</label>
            <select
              id="search-payment-type"
              value={searchPaymentType}
              onChange={(e) => setSearchPaymentType(e.target.value)}
              className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-bold cursor-pointer"
            >
              <option value="ALL">جميع طرق السداد</option>
              <option value="CASH">دفع نقدي كاش (CASH)</option>
              <option value="CREDIT">آجل على الذمم (CREDIT)</option>
              <option value="SPLIT">دفع مجزأ / مركب</option>
            </select>
          </div>

          {/* Date Ranges Filters Selector */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">تحديد النطاق الزمني</label>
            <select
              id="search-date-range"
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as DateFilterType)}
              className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-bold cursor-pointer"
            >
              <option value="ALL">كل السجلات الزمنية</option>
              <option value="TODAY">اليوم فقط (Today)</option>
              <option value="THIS_WEEK">هذا الأسبوع الحالي (This Week)</option>
              <option value="THIS_MONTH">هذا الشهر الجاري (This Month)</option>
              <option value="CUSTOM">تحديد فترة مخصصة (Custom Date)</option>
            </select>
          </div>

          {/* Filter by Exact Date */}
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">البحث بيوم محدد بالتقويم</label>
            <div className="relative">
              <input
                id="search-exact-date"
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
              />
            </div>
          </div>

        </div>

        {/* Custom Start/End Date Range fields (conditional) */}
        {dateRangeFilter === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-luxury-bg rounded-2xl border border-gray-900/55 animate-slide-in">
            <div>
              <label className="text-[10px] text-gold-500 font-bold block mb-1">تاريخ بداية الفترة</label>
              <input
                id="custom-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-[10px] text-gold-500 font-bold block mb-1">تاريخ نهاية الفترة</label>
              <input
                id="custom-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. CORE HISTORY DATA TABLE */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl overflow-hidden">
        <div className="flex justify-between items-center mb-5">
          <h4 className="text-xs font-black text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-gold-500" />
            بيان قائمة الفواتير ({filteredInvoices.length} مبيعات مسجلة)
          </h4>
          {showArchived && (
            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] rounded-full font-bold animate-pulse">
              أرشيف المسؤول المحمي والمجمد
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-900/80 text-gray-400 font-bold">
                <th className="pb-3.5 px-3">رقم الفاتورة</th>
                <th className="pb-3.5 px-3">التاريخ والوقت</th>
                <th className="pb-3.5 px-3">العميل</th>
                <th className="pb-3.5 px-3">رقم الطاولة</th>
                <th className="pb-3.5 px-3">طريقة السداد</th>
                <th className="pb-3.5 px-3">حالة السداد</th>
                <th className="pb-3.5 px-3">الكاشير</th>
                <th className="pb-3.5 px-3 text-left">مجموع الفاتورة</th>
                <th className="pb-3.5 px-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/60 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-14 text-gray-500 font-medium">
                    لا يوجد أي فواتير مطابقة لمعايير البحث والفرز المحددة حالياً.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.customer_id);
                  const custName = cust ? cust.full_name : 'عميل عام / نقدي';

                  return (
                    <tr key={inv.id} className="hover:bg-luxury-bg/40 transition-all group">
                      <td className="py-4 px-3 font-mono font-bold text-white group-hover:text-gold-500 transition-colors">
                        {inv.invoice_number}
                      </td>
                      <td className="py-4 px-3 text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-gold-500/80" />
                          <span>{new Date(inv.invoice_date).toLocaleDateString('ar-EG')}</span>
                          <span className="text-gray-600">•</span>
                          <Clock className="w-3 h-3 text-gray-600" />
                          <span className="text-gray-500 font-mono text-[10px]">{new Date(inv.invoice_date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="py-4 px-3 text-gray-300">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3.5 text-gray-500" />
                          {custName}
                        </span>
                      </td>
                      <td className="py-4 px-3">
                        {inv.table_number ? (
                          <span className="px-2 py-0.5 bg-gold-600/10 border border-gold-600/30 text-gold-500 text-[10px] rounded font-bold font-sans">
                            {inv.table_number}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-4 px-3">
                        {inv.payment_type === 'CASH' ? (
                          <span className="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <Coins className="w-3 h-3" />
                            كاش نقدي
                          </span>
                        ) : inv.payment_type === 'CREDIT' ? (
                          <span className="px-2 py-0.5 bg-amber-950/40 text-amber-500 border border-amber-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <User className="w-3 h-3" />
                            ذمم آجلة
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-purple-950/40 text-purple-400 border border-purple-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            دفع مركب
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-3">
                        {inv.payment_status === 'PAID' ? (
                          <span className="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            مدفوعة بالكامل
                          </span>
                        ) : inv.payment_status === 'PARTIAL' ? (
                          <span className="px-2 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            مدفوعة جزئياً
                          </span>
                        ) : inv.payment_status === 'CANCELLED' ? (
                          <span className="px-2 py-0.5 bg-gray-900/50 text-gray-400 border border-gray-800 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            ملغاة
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-950/40 text-rose-400 border border-rose-950 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            غير مدفوعة - أجل
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-3 text-gray-400 text-[11px]">
                        {inv.cashier_name}
                      </td>
                      <td className="py-4 px-3 text-left font-mono font-extrabold text-white text-sm">
                        {inv.total.toLocaleString()} <span className="text-[10px] text-gold-500">{settings.currency}</span>
                      </td>
                      <td className="py-4 px-3 text-center">
                        <button
                          id={`history-view-btn-${inv.id}`}
                          onClick={() => handleOpenInvoiceDetails(inv)}
                          className="px-3 py-1.5 bg-luxury-bg border border-gray-800 hover:border-gold-600 text-gray-300 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Eye className="w-3 h-3 text-gold-500" />
                          تفاصيل الإيصال
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

      {/* 4. MODAL DETAILED RECEIPT VISUALIZER WITH ALL CUSTOM DETAILS */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-[#0b0b0b] border border-gray-900 rounded-3xl w-full max-w-sm p-6 relative my-8 shadow-2xl">
            <button
              id="close-history-modal"
              onClick={() => setShowDetailModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-gray-950 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-xs font-black text-white mb-4 flex items-center gap-1 text-center justify-center border-b border-gray-900 pb-3">
              <FileText className="w-4 h-4 text-gold-500" />
              تفاصيل الفاتورة الأصلية المسترجعة
            </h4>

            {/* High Fidelity Receipt styling */}
            <div id="history-receipt-print-area" className="bg-white text-black p-4 rounded-2xl font-mono text-xs max-h-[420px] overflow-y-auto leading-relaxed select-text flex flex-col items-center shadow-inner">
              
              {/* Receipt Header */}
              <div className="text-center w-full border-b border-dashed border-gray-400 pb-2.5 flex flex-col items-center">
                <div className="mb-1 flex justify-center">
                  <EldeebLogoFull className="w-[140px]" showSubtext={true} />
                </div>
                <p className="text-[9px] text-gray-600">{settings.address}</p>
                <p className="text-[9px] text-gray-600">هاتف: {settings.phone}</p>
              </div>

              {/* General Metadata */}
              <div className="w-full text-right border-b border-dashed border-gray-400 py-2.5 space-y-0.5 text-[9px] text-gray-700">
                <p>رقم الفاتورة: <span className="font-extrabold text-black">{selectedInvoice.invoice_number}</span></p>
                <p>تاريخ المعاملة: {new Date(selectedInvoice.invoice_date).toLocaleDateString('ar-EG')} - {new Date(selectedInvoice.invoice_date).toLocaleTimeString('ar-EG')}</p>
                <p>الكاشير المسؤول: <span className="font-bold text-black">{selectedInvoice.cashier_name}</span></p>
                <p>رقم الطاولة: <span className="font-extrabold text-black">{selectedInvoice.table_number || 'غير محدد'}</span></p>
                <p>طريقة الدفع: <span className="font-bold text-black">{selectedInvoice.payment_type === 'CASH' ? 'كاش نقدي' : selectedInvoice.payment_type === 'CREDIT' ? 'ذمم آجلة بالكامل' : 'مركب نقدي/آجل'}</span></p>
                <p>حالة السداد: <span className={`font-bold ${
                  selectedInvoice.payment_status === 'PAID' ? 'text-emerald-600' :
                  selectedInvoice.payment_status === 'PARTIAL' ? 'text-amber-600' :
                  selectedInvoice.payment_status === 'UNPAID' ? 'text-rose-600' :
                  'text-gray-500'
                }`}>{
                  selectedInvoice.payment_status === 'PAID' ? 'مدفوعة بالكامل' :
                  selectedInvoice.payment_status === 'PARTIAL' ? 'مدفوعة جزئياً' :
                  selectedInvoice.payment_status === 'UNPAID' ? 'غير مدفوعة - أجل' :
                  'ملغاة'
                }</span></p>
                {selectedInvoice.customer_id && (
                  <p>العميل: <span className="font-bold text-black">{(customers.find(c => c.id === selectedInvoice.customer_id))?.full_name}</span></p>
                )}
              </div>

              {/* Item-level lists with price, quant, totals */}
              <div className="w-full py-2.5 border-b border-dashed border-gray-400 text-[9px]">
                <div className="flex justify-between font-extrabold pb-1.5 text-gray-800">
                  <span className="w-1/2 text-right">الصنف</span>
                  <span className="w-1/6 text-center">الكمية</span>
                  <span className="w-1/3 text-left">الإجمالي</span>
                </div>
                
                {invoiceItems.map(item => (
                  <div key={item.id} className="flex justify-between py-1 text-gray-700 border-b border-gray-100 last:border-0">
                    <div className="w-1/2 text-right">
                      <span className="block truncate">{item.product_name_ar}</span>
                      <span className="text-[8px] text-gray-500">{(item.total_price / item.quantity).toLocaleString()} {settings.currency}</span>
                    </div>
                    <span className="w-1/6 text-center font-bold self-center">{item.quantity}</span>
                    <span className="w-1/3 text-left font-bold self-center">{item.total_price.toLocaleString()} {settings.currency}</span>
                  </div>
                ))}
              </div>

              {/* Totals Section */}
              <div className="w-full py-2 border-b border-dashed border-gray-400 font-bold text-[9px] space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>المجموع الفرعي:</span>
                  <span>{selectedInvoice.subtotal.toLocaleString()} {settings.currency}</span>
                </div>
                {selectedInvoice.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصم مباشر:</span>
                    <span>-{selectedInvoice.discount.toLocaleString()} {settings.currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>الضريبة (14%):</span>
                  <span>{selectedInvoice.tax.toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-black font-black text-xs pt-1 border-t border-dotted border-gray-300">
                  <span>الإجمالي النهائي:</span>
                  <span>{selectedInvoice.total.toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-gray-600 pt-1">
                  <span>المسدد نقداً:</span>
                  <span>{selectedInvoice.paid_amount.toLocaleString()} {settings.currency}</span>
                </div>
                {selectedInvoice.remaining_amount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>المتبقي بالذمم الآجلة:</span>
                    <span>{selectedInvoice.remaining_amount.toLocaleString()} {settings.currency}</span>
                  </div>
                )}
              </div>

              {/* Return Transactions Section */}
              {(() => {
                const invoiceReturns = dbService.getReturnTransactions().filter(r => r.original_invoice_id === selectedInvoice.id);
                if (invoiceReturns.length === 0) return null;

                const totalReturnedAmount = invoiceReturns.reduce((sum, r) => sum + r.total_return_amount, 0);
                const netInvoiceTotal = Math.max(0, selectedInvoice.total - totalReturnedAmount);

                return (
                  <div className="w-full py-2 border-b border-dashed border-gray-400 text-[9px] space-y-2">
                    <div className="bg-amber-500/5 border border-dashed border-amber-500/20 rounded-lg p-2 text-right">
                      <p className="font-extrabold text-amber-600 flex items-center gap-1">
                        🔄 تفاصيل عمليات المرتجع والRefund:
                      </p>
                      
                      <div className="divide-y divide-dashed divide-gray-300 mt-1.5 space-y-1.5">
                        {invoiceReturns.map(ret => (
                          <div key={ret.id} className="pt-1.5 first:pt-0">
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>إيصال مرتجع: {ret.return_number}</span>
                              <span className="font-mono text-red-600">-{ret.total_return_amount.toLocaleString()} {settings.currency}</span>
                            </div>
                            <p className="text-[8px] text-gray-500">التاريخ: {new Date(ret.return_date).toLocaleDateString('ar-EG')} | الكاشير: {ret.cashier_name}</p>
                            <p className="text-[8px] text-gray-500">السبب: {
                              ret.reason === 'Customer cancelled' ? 'رغبة العميل في الإلغاء' :
                              ret.reason === 'Wrong item' ? 'صنف خاطئ' :
                              ret.reason === 'Defective item' ? 'وجود عيب في الصنف' :
                              ret.reason === 'Complimentary' ? 'ضيافة / مجاني' :
                              ret.reason
                            }</p>

                            <div className="flex justify-start gap-3 mt-1 text-[8px] text-amber-700">
                              <button
                                type="button"
                                onClick={() => handlePrintReturnReceipt(ret)}
                                className="font-bold underline cursor-pointer hover:text-amber-500"
                              >
                                🖨️ طباعة إيصال المرتجع
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppReturn(ret)}
                                className="font-bold underline cursor-pointer hover:text-emerald-600"
                              >
                                💬 إرسال واتساب
                              </button>
                            </div>
                            
                            <div className="mt-1 bg-white/40 p-1 rounded space-y-0.5 text-[8px]">
                              {ret.returned_items.map((ri, i) => (
                                <div key={i} className="flex justify-between text-gray-600">
                                  <span>{ri.product_name_ar} (x{ri.quantity})</span>
                                  <span className="font-mono">{(ri.total_price).toLocaleString()} {settings.currency}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1 font-bold pt-1">
                      <div className="flex justify-between text-amber-600">
                        <span>إجمالي المبالغ المسترجعة:</span>
                        <span>-{totalReturnedAmount.toLocaleString()} {settings.currency}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 text-[10px] font-extrabold border-t border-dotted border-gray-300 pt-1">
                        <span>صافي قيمة الفاتورة بعد الارتجاع:</span>
                        <span>{netInvoiceTotal.toLocaleString()} {settings.currency}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* General Notes if any */}
              {selectedInvoice.notes && (
                <div className="w-full text-right pt-2 border-b border-dashed border-gray-400 pb-2 text-[9px] text-gray-600">
                  <p className="font-bold text-black">📌 ملاحظات الفاتورة:</p>
                  <p className="italic bg-gray-50 p-1 rounded mt-0.5">{selectedInvoice.notes}</p>
                </div>
              )}

              {/* Footer text */}
              <div className="text-center w-full pt-2.5 text-[9px] text-gray-500">
                <p className="font-bold">{settings.receipt_footer}</p>
              </div>

            </div>

            {/* Print, Share & WhatsApp actions */}
            <div className="grid grid-cols-1 gap-2.5 mt-5">
              
              <button
                id="history-action-print"
                onClick={() => handlePrintReceipt(selectedInvoice)}
                className="w-full py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                <Printer className="w-4 h-4" />
                طباعة الفاتورة الفورية (Thermal Print)
              </button>

              <button
                id="history-action-whatsapp-pdf"
                onClick={() => handleShareHistoryInvoicePDF(selectedInvoice)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all active:scale-95 mb-1"
              >
                <Share2 className="w-4 h-4 text-white" />
                إرسال الفاتورة عبر واتساب 📱
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  id="history-action-share-pdf"
                  onClick={async () => {
                    if (!selectedInvoice) return;
                    try {
                      onShowSuccessAlert('جاري إنشاء وتحميل ملف الفاتورة PDF... 📄');
                      const items = dbService.getInvoiceItems(selectedInvoice.id);
                      const { pdfBlob, pdfFileName } = await createInvoicePDF({
                        invoice: selectedInvoice,
                        items,
                        customer: customers.find(c => c.id === selectedInvoice.customer_id),
                        settings,
                      });
                      if (!pdfBlob || pdfBlob.size === 0) {
                        throw new Error('فشل إنشاء ملف الـ PDF الناتج.');
                      }
                      const blobUrl = URL.createObjectURL(pdfBlob);
                      const link = document.createElement('a');
                      link.href = blobUrl;
                      link.download = pdfFileName;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
                      onShowSuccessAlert(`تم تحميل الفاتورة (${pdfFileName}) بنجاح.`);
                    } catch (err: any) {
                      console.error('Error in history-action-share-pdf:', err);
                      onShowWarningAlert(`تعذر تحميل ملف الـ PDF: ${err?.message || 'خطأ غير معروف'}`);
                    }
                  }}
                  className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  تحميل PDF
                </button>
                <button
                  id="history-action-whatsapp"
                  onClick={() => handleOpenWhatsAppDialog(selectedInvoice)}
                  className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                  إرسال לרقم خاص
                </button>
              </div>

              {selectedInvoice.invoice_status !== 'CANCELLED' && (
                <button
                  id="history-action-return"
                  onClick={() => handleInitiateReturn(selectedInvoice)}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all mt-1 shadow-md shadow-amber-950/20 animate-pulse"
                >
                  <RotateCcw className="w-4 h-4" />
                  إرجاع سلع / مرتجع مبيعات
                </button>
              )}

              {selectedInvoice.invoice_status !== 'CANCELLED' && selectedInvoice.invoice_status !== 'OPEN' && (
                <button
                  id="history-action-reopen"
                  onClick={() => {
                    setReopenPin('');
                    setReopenError('');
                    setShowReopenPinModal(true);
                  }}
                  className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all mt-1 shadow-md shadow-yellow-950/20"
                >
                  <Shield className="w-4 h-4 text-black" />
                  إعادة فتح الفاتورة وتعديلها (مسؤول)
                </button>
              )}

              <button
                id="close-history-detail-btn"
                onClick={() => setShowDetailModal(false)}
                className="w-full py-2 bg-luxury-bg border border-gray-900 hover:bg-gray-950 text-gray-400 font-bold text-xs rounded-xl cursor-pointer transition-all mt-1"
              >
                إغلاق النافذة
              </button>

            </div>
          </div>
        </div>
      )}

      {/* --- RETURN / REFUND TRANSACTION MODAL --- */}
      {showReturnModal && returningInvoice && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-2xl p-6 relative shadow-2xl my-8">
            <button
              id="close-return-modal"
              onClick={() => {
                setShowReturnModal(false);
                setSelectedInvoice(returningInvoice);
                setInvoiceItems(dbService.getInvoiceItems(returningInvoice.id));
                setShowDetailModal(true);
              }}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex gap-3 mb-6 border-b border-gray-900 pb-4">
              <span className="text-3xl bg-amber-500/10 p-2.5 rounded-full border border-amber-500/20 text-amber-500">🔄</span>
              <div className="text-right">
                <h3 className="text-base font-bold text-white">تسجيل مرتجع مبيعات / استرجاع سلع</h3>
                <p className="text-[10px] text-gray-400 mt-1">الفاتورة رقم: <span className="text-gold-500 font-extrabold font-mono">{returningInvoice.invoice_number}</span> | الكاشير: {returningInvoice.cashier_name}</p>
              </div>
            </div>

            {/* Step 1: Select items and adjust quantities */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-gray-300 mb-3 block">1. حدد السلع المراد إرجاعها وحدد الكمية المسترجعة:</h4>
              <div className="border border-gray-900 rounded-2xl overflow-hidden bg-[#0a0a0a] max-h-64 overflow-y-auto">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-[#121212] text-gray-400 font-extrabold border-b border-gray-900">
                    <tr>
                      <th className="p-3 text-center w-12">تحديد</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3 text-center">الكمية المباعة</th>
                      <th className="p-3 text-center">المرتجع سابقاً</th>
                      <th className="p-3 text-center">الكمية المسترجعة حالياً</th>
                      <th className="p-3 text-left">قيمة الإرجاع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900 text-gray-300">
                    {returningInvoiceItems.map(item => {
                      const itemState = returningItemsState[item.product_id] || { selected: false, returnQty: 0 };
                      const existingReturns = dbService.getReturnTransactions().filter(r => r.original_invoice_id === returningInvoice.id);
                      const alreadyReturned = existingReturns.reduce((sum, r) => {
                        const matchingItem = r.returned_items.find(ri => ri.product_id === item.product_id);
                        return sum + (matchingItem ? matchingItem.quantity : 0);
                      }, 0);
                      const maxReturnable = item.quantity - alreadyReturned;
                      const unitPrice = item.total_price / item.quantity;

                      return (
                        <tr key={item.id} className={`hover:bg-gray-900/50 ${itemState.selected ? 'bg-amber-500/5' : ''}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={itemState.selected}
                              disabled={maxReturnable <= 0}
                              onChange={() => handleToggleItemSelection(item.product_id)}
                              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-bold text-white">
                            {item.product_name_ar}
                            {maxReturnable <= 0 && <span className="block text-[9px] text-red-500 font-normal">تم استرجاع الكمية بالكامل</span>}
                          </td>
                          <td className="p-3 text-center font-bold font-mono text-gray-400">{item.quantity}</td>
                          <td className="p-3 text-center font-bold font-mono text-red-400">{alreadyReturned}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              max={maxReturnable}
                              disabled={!itemState.selected}
                              value={itemState.returnQty}
                              onChange={(e) => handleReturnQtyChange(item.product_id, parseInt(e.target.value) || 1, maxReturnable)}
                              className="w-16 bg-luxury-bg border border-gray-800 text-center rounded-lg text-white text-xs py-1 px-1 font-extrabold font-mono focus:border-amber-500 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-3 text-left font-bold font-mono text-gold-500">
                            {itemState.selected ? (itemState.returnQty * unitPrice).toLocaleString() : '0'} {settings.currency}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 2: Reason Selection */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-300 font-bold block mb-2">2. سبب الإرجاع الرئيسي:</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-amber-500 text-right font-medium"
                >
                  <option value="Customer cancelled">رغبة العميل في الإلغاء (Customer cancelled)</option>
                  <option value="Wrong item">صنف خاطئ (Wrong item)</option>
                  <option value="Defective item">وجود عيب في الصنف (Defective item)</option>
                  <option value="Complimentary">ضيافة / مجاني (Complimentary)</option>
                  <option value="Other">أسباب أخرى (Other)</option>
                </select>
              </div>

              {returnReason === 'Other' && (
                <div>
                  <label className="text-xs text-gray-300 font-bold block mb-2">وضح السبب الآخر:</label>
                  <input
                    type="text"
                    value={otherReturnReason}
                    onChange={(e) => setOtherReturnReason(e.target.value)}
                    placeholder="مثال: انتهاء الصلاحية، العميل تراجع..."
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-amber-500 text-right font-medium"
                  />
                </div>
              )}
            </div>

            {/* Step 3: Before Confirmation Metrics Display */}
            <div className="bg-luxury-bg border border-gray-900 rounded-2xl p-4 space-y-3 mb-6">
              <h4 className="text-xs font-bold text-gray-400 border-b border-gray-900 pb-2 mb-2">📊 ملخص تفاصيل الحسابات والارتجاع قبل التأكيد:</h4>
              
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <span className="text-gray-400">عدد السلع المسترجعة حالياً:</span>
                <span className="text-left font-bold text-white font-mono">{returnTotals.totalQty} وحدة</span>

                <span className="text-amber-500 font-bold">إجمالي قيمة المرتجع (مبلغ الاسترداد):</span>
                <span className="text-left font-extrabold text-amber-500 font-mono">-{returnTotals.totalAmount.toLocaleString()} {settings.currency}</span>

                <span className="text-gray-400">إجمالي الفاتورة الأصلية:</span>
                <span className="text-left font-bold text-white font-mono">{returningInvoice.total.toLocaleString()} {settings.currency}</span>

                <span className="text-emerald-500 font-bold">إجمالي الفاتورة الجديد المتوقع:</span>
                <span className="text-left font-extrabold text-emerald-500 font-mono">{(returningInvoice.total - returnTotals.totalAmount).toLocaleString()} {settings.currency}</span>

                {(returningInvoice.payment_type === 'CREDIT' || returningInvoice.payment_type === 'SPLIT') && (
                  <>
                    <span className="text-amber-400 font-bold">المتبقي في ذمة العميل بهذه الفاتورة:</span>
                    <span className="text-left font-extrabold text-amber-400 font-mono">
                      {Math.max(0, returningInvoice.remaining_amount - returnTotals.totalAmount).toLocaleString()} {settings.currency}
                    </span>

                    {(() => {
                      const cust = customers.find(c => c.id === returningInvoice.customer_id);
                      if (cust) {
                        return (
                          <>
                            <span className="text-gray-400">رصيد حساب العميل الكلي الحالي:</span>
                            <span className="text-left font-bold text-white font-mono">{cust.current_balance.toLocaleString()} {settings.currency}</span>

                            <span className="text-emerald-400 font-bold">رصيد حساب العميل الكلي الجديد المتوقع:</span>
                            <span className="text-left font-extrabold text-emerald-400 font-mono">
                              {Math.max(0, cust.current_balance - returnTotals.totalAmount).toLocaleString()} {settings.currency}
                            </span>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                id="return-cancel-btn"
                onClick={() => {
                  setShowReturnModal(false);
                  setSelectedInvoice(returningInvoice);
                  setInvoiceItems(dbService.getInvoiceItems(returningInvoice.id));
                  setShowDetailModal(true);
                }}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold text-xs rounded-xl cursor-pointer transition-all text-center"
              >
                تراجع وإلغاء
              </button>
              <button
                id="return-confirm-btn"
                onClick={handleConfirmReturn}
                disabled={returnTotals.totalQty === 0}
                className={`py-3 font-bold text-xs rounded-xl cursor-pointer transition-all text-center shadow-lg ${
                  returnTotals.totalQty === 0
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-amber-600 hover:bg-amber-500 text-black shadow-amber-950/20'
                }`}
              >
                تأكيد وتسجيل المرتجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. WHATSAPP PHONE NUMBER DIALOG INPUT */}
      {showWhatsAppDialog && selectedInvoice && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="bg-[#0b0b0b] border border-gray-900 rounded-3xl w-full max-w-xs p-6 shadow-2xl text-right">
            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5 pb-2 border-b border-gray-900">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              إرسال الفاتورة عبر تطبيق WhatsApp
            </h4>
            
            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              أدخل رقم هاتف العميل ليتم توجيهك مباشرة لدردشة واتساب ومشاركة الفاتورة المنسقة ملوكيّاً.
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] text-gray-500 font-bold block">رقم الهاتف (العميل)</label>
                  <ContactPickerButton
                    onSelect={({ phone }) => {
                      setWhatsAppPhone(phone);
                    }}
                    buttonText="سجل الأسماء"
                  />
                </div>
                <input
                  id="whatsapp-phone-input"
                  type="text"
                  placeholder="مثال: 01012345678"
                  value={whatsAppPhone}
                  onChange={(e) => setWhatsAppPhone(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono font-bold text-center"
                />
              </div>

              <div className="flex gap-2 border-t border-gray-900 pt-4">
                <button
                  id="whatsapp-cancel"
                  type="button"
                  onClick={() => setShowWhatsAppDialog(false)}
                  className="flex-1 py-2 bg-luxury-bg border border-gray-800 text-gray-400 font-bold text-[10px] rounded-xl cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  id="whatsapp-submit"
                  type="button"
                  onClick={handleSendWhatsAppMessage}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] rounded-xl cursor-pointer"
                >
                  بدء الإرسال الآن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. ADMIN PIN CONFIRMATION FOR SECURE ARCHIVING */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <form onSubmit={handleExecuteArchive} className="bg-[#0b0b0b] border border-red-900/40 rounded-3xl w-full max-w-xs p-6 shadow-2xl relative text-right">
            <h4 className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1.5 pb-2 border-b border-gray-900">
              <Shield className="w-4 h-4 text-red-500" />
              أرشفة وحماية سجل المبيعات
            </h4>

            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              سيتم نقل كافة فواتير المبيعات النشطة إلى مجلد الأرشيف المحمي والمجمد للدرج المالي لتخفيف عبء القراءة. تطلب هذه الخطوة تفويض المسؤول (Admin PIN).
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">رمز التحقق الأمني للمسؤول (Admin PIN)</label>
                <input
                  id="archive-admin-pin"
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={archivePin}
                  onChange={(e) => {
                    setArchivePin(e.target.value);
                    setArchiveError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-red-600 font-mono font-bold text-center tracking-widest"
                />
              </div>

              {archiveError && (
                <p className="text-red-500 text-[9px] font-bold text-center">⚠️ {archiveError}</p>
              )}

              <div className="flex gap-2 border-t border-gray-900 pt-4">
                <button
                  id="archive-cancel-btn"
                  type="button"
                  onClick={() => setShowArchiveConfirm(false)}
                  className="flex-1 py-2 bg-luxury-bg border border-gray-800 text-gray-400 font-bold text-[10px] rounded-xl cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  id="archive-confirm-btn"
                  type="submit"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-extrabold text-[10px] rounded-xl cursor-pointer"
                >
                  تنفيذ الأرشفة والأمان
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* --- REOPEN INVOICE ADMIN PIN MODAL --- */}
      {showReopenPinModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative shadow-2xl">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-500" />
              إعادة فتح الفاتورة رقم {selectedInvoice.invoice_number}
            </h3>
            <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
              هذا الإجراء يتطلب التحقق من هوية المسؤول. سيتم إرجاع المخزون، وتعديل درج النقدي، وإلغاء أي تأثيرات مالية أخرى مؤقتاً لتعديل الفاتورة وحفظها مرة أخرى.
            </p>

            <div className="space-y-4 mt-4">
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">رمز التحقق الأمني للمسؤول (Admin PIN)</label>
                <input
                  id="reopen-admin-pin"
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={reopenPin}
                  onChange={(e) => {
                    setReopenPin(e.target.value);
                    setReopenError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-yellow-600 font-mono font-bold text-center tracking-widest"
                />
              </div>

              {reopenError && (
                <p className="text-red-500 text-[9px] font-bold text-center">⚠️ {reopenError}</p>
              )}

              <div className="flex gap-2 border-t border-gray-900 pt-4">
                <button
                  id="reopen-cancel-btn"
                  type="button"
                  onClick={() => setShowReopenPinModal(false)}
                  className="flex-1 py-2 bg-luxury-bg border border-gray-800 text-gray-400 font-bold text-[10px] rounded-xl cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  id="reopen-confirm-btn"
                  type="button"
                  onClick={handleReopenInvoice}
                  className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-extrabold text-[10px] rounded-xl cursor-pointer"
                >
                  تأكيد وإعادة الفتح
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

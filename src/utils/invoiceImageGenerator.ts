import { safeHtml2Canvas } from './html2canvasHelper';
import {
  Invoice,
  InvoiceItem,
  Customer,
  AppSettings,
  ReturnTransaction,
  CreditPayment,
  CustomerCreditTransaction,
} from '../types';
import { getEldeebLogoDataUrl } from '../lib/logoSvg';
import { getPaymentMethodLabel } from './paymentUtils';
import { getCleanInvoiceNumber } from './pdfInvoiceGenerator';

export interface ShareInvoiceImageOptions {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: AppSettings;
  returns?: ReturnTransaction[];
  phone?: string;
  onStart?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the invoice as a high-resolution PNG thermal receipt matching the exact in-app receipt card preview.
 */
export async function createInvoiceReceiptImage({
  invoice,
  items,
  customer,
  settings,
  returns = [],
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: AppSettings;
  returns?: ReturnTransaction[];
}): Promise<{ imageBlob: Blob; imageFile: File; imageFileName: string; dataUrl: string }> {
  if (!invoice) {
    throw new Error('بيانات الفاتورة غير متاحة لإنشاء صورة الفاتورة.');
  }

  const cleanInvNum = getCleanInvoiceNumber(invoice.invoice_number);
  const imageFileName = `Invoice-${cleanInvNum}.png`;
  const safeItems = Array.isArray(items) ? items : [];
  const safeReturns = Array.isArray(returns) ? returns : [];

  const dateObj = new Date(invoice.invoice_date || invoice.created_at || Date.now());
  const formattedDate = dateObj.toLocaleDateString('ar-EG');
  const formattedTime = dateObj.toLocaleTimeString('ar-EG');

  const currency = settings?.currency || 'ج.م';
  const custName = customer?.full_name || (invoice.customer_id ? 'عميل عام / نقدي' : 'عميل عام / نقدي');
  const isOpenOrDraft = invoice.invoice_status === 'OPEN' || invoice.invoice_status === 'DRAFT';
  const subtotal = invoice.subtotal ?? 0;
  const discount = invoice.discount ?? 0;
  const tax = invoice.tax ?? 0;
  const total = invoice.total ?? 0;
  const paidAmount = invoice.paid_amount ?? 0;
  const remainingAmount = invoice.remaining_amount ?? (isOpenOrDraft ? Math.max(0, total - paidAmount) : 0);

  const paymentMethodText =
    isOpenOrDraft && paidAmount <= 0
      ? 'لم يتم السداد بعد (فاتورة مفتوحة)'
      : getPaymentMethodLabel(invoice);

  const paymentStatusLabel = isOpenOrDraft
    ? invoice.invoice_status === 'DRAFT'
      ? 'فاتورة معلقة / مسودة (قبل الدفع)'
      : 'فاتورة مفتوحة (قبل الدفع)'
    : invoice.payment_status === 'PAID'
    ? 'مدفوعة بالكامل'
    : invoice.payment_status === 'PARTIAL'
    ? 'مدفوعة جزئياً'
    : invoice.payment_status === 'UNPAID'
    ? 'غير مدفوعة - أجل'
    : 'ملغاة';

  const paymentStatusColor = isOpenOrDraft
    ? '#d97706'
    : invoice.payment_status === 'PAID'
    ? '#059669'
    : invoice.payment_status === 'PARTIAL'
    ? '#d97706'
    : invoice.payment_status === 'UNPAID'
    ? '#e11d48'
    : '#6b7280';

  const customerOpenDebt =
    isOpenOrDraft && customer && customer.id !== 'c_general'
      ? Math.max(0, customer.current_balance || 0)
      : 0;
  const prevCredit = invoice.previous_credit_balance ?? customerOpenDebt;
  const creditPaidWithInv = invoice.credit_paid_with_invoice ?? 0;
  const remCreditAfter =
    invoice.remaining_credit_after_invoice ??
    Math.max(0, prevCredit - creditPaidWithInv + remainingAmount);
  const grandTotalWithCredit = invoice.grand_total_with_credit ?? total + prevCredit;
  const hasCreditSummary =
    (invoice.previous_credit_balance !== undefined &&
      (prevCredit > 0 || creditPaidWithInv > 0 || remCreditAfter > 0)) ||
    (isOpenOrDraft && customerOpenDebt > 0);

  const itemRowsHtml =
    safeItems.length > 0
      ? safeItems
          .map((item, idx) => {
            const qty = item.quantity || 1;
            const totalPrice = item.total_price ?? 0;
            const unitPrice = item.unit_price ?? (qty > 0 ? totalPrice / qty : totalPrice);
            const origPrice = item.original_price;
            const hasPriceDiff =
              origPrice !== undefined && origPrice !== null && Math.abs(origPrice - unitPrice) > 0.001;
            const isEditedPrice = Boolean(item.is_price_edited || hasPriceDiff);
            const borderStyle = idx < safeItems.length - 1 ? 'border-bottom: 1px solid #f3f4f6;' : '';
            const notesHtml = item.notes
              ? `<div style="font-size: 9.5px; color: #92400e; margin-top: 2px;">${escapeHtml(item.notes)}</div>`
              : '';
            const editedBadgeHtml = isEditedPrice
              ? `<span style="display: inline-block; font-size: 9px; font-weight: 800; color: #b45309; background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 0 4px; margin-right: 4px;">سعر مخصص</span>`
              : '';
            const priceLineHtml =
              isEditedPrice && origPrice !== undefined && origPrice !== null && hasPriceDiff
                ? `<div style="font-size: 10px; margin-top: 2px;">
                     <span style="color: #b45309; font-weight: 800;">${unitPrice.toLocaleString()} ${escapeHtml(currency)}</span>
                     <span style="color: #9ca3af; text-decoration: line-through; margin-right: 4px;">${origPrice.toLocaleString()} ${escapeHtml(currency)}</span>
                   </div>`
                : `<div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${unitPrice.toLocaleString()} ${escapeHtml(currency)}</div>`;
            const origTotalHtml =
              isEditedPrice && origPrice !== undefined && origPrice !== null && hasPriceDiff
                ? `<div style="font-size: 9.5px; color: #9ca3af; text-decoration: line-through; font-weight: 600;">${(origPrice * qty).toLocaleString()} ${escapeHtml(currency)}</div>`
                : '';
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; ${borderStyle} color: #374151;">
                <div style="width: 52%; text-align: right; padding-left: 6px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; word-break: break-word;">${escapeHtml(item.product_name_ar || 'صنف غير مسمى')}${editedBadgeHtml}</div>
                  ${priceLineHtml}
                  ${notesHtml}
                </div>
                <div style="width: 18%; text-align: center; font-weight: 800; font-size: 12.5px; color: #111827;">${qty}</div>
                <div style="width: 30%; text-align: left; font-weight: 800; font-size: 12px; color: #111827;">
                  <div>${totalPrice.toLocaleString()} ${escapeHtml(currency)}</div>
                  ${origTotalHtml}
                </div>
              </div>
            `;
          })
          .join('')
      : `<div style="padding: 12px 0; text-align: center; color: #6b7280; font-size: 11px;">لا توجد أصناف في هذه الفاتورة</div>`;

  const totalReturnedAmount = safeReturns.reduce((sum, r) => sum + (r.total_return_amount || 0), 0);
  const netInvoiceTotal = Math.max(0, total - totalReturnedAmount);

  const returnsHtml =
    safeReturns.length > 0
      ? `
        <div style="width: 100%; padding: 10px 0; border-bottom: 1px dashed #9ca3af; font-size: 10.5px;">
          <div style="background-color: #fffbeb; border: 1px dashed #f59e0b; border-radius: 8px; padding: 8px 10px; text-align: right;">
            <div style="font-weight: 800; color: #b45309; margin-bottom: 4px;">🔄 تفاصيل عمليات المرتجع:</div>
            ${safeReturns
              .map(
                (ret) => `
                  <div style="padding-top: 4px; border-top: 1px dashed #fde68a; margin-top: 4px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 700; color: #1f2937;">
                      <span>إيصال مرتجع: ${escapeHtml(ret.return_number)}</span>
                      <span style="color: #dc2626;">-${(ret.total_return_amount || 0).toLocaleString()} ${escapeHtml(currency)}</span>
                    </div>
                  </div>
                `
              )
              .join('')}
          </div>
          <div style="margin-top: 6px; font-weight: 800;">
            <div style="display: flex; justify-content: space-between; color: #d97706;">
              <span>إجمالي المبالغ المسترجعة:</span>
              <span>-${totalReturnedAmount.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #059669; font-size: 11.5px; border-top: 1px dotted #d1d5db; padding-top: 4px; margin-top: 4px;">
              <span>صافي قيمة الفاتورة بعد الارتجاع:</span>
              <span>${netInvoiceTotal.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
          </div>
        </div>
      `
      : '';

  const renderDiv = document.createElement('div');
  renderDiv.style.position = 'fixed';
  renderDiv.style.top = '-99999px';
  renderDiv.style.left = '-99999px';
  renderDiv.style.width = '420px';
  renderDiv.style.backgroundColor = '#ffffff';
  renderDiv.style.color = '#111827';
  renderDiv.style.padding = '22px 20px';
  renderDiv.style.boxSizing = 'border-box';
  renderDiv.style.direction = 'rtl';
  renderDiv.style.letterSpacing = 'normal';
  renderDiv.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  renderDiv.id = 'invoice-receipt-image-render-container';

  const senderPhone = invoice.sender_phone || invoice.senderPhone;
  const referenceNumber = invoice.reference_number || invoice.referenceNumber;

  renderDiv.innerHTML = `
    <div style="background: #ffffff; color: #111827; width: 100%; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; letter-spacing: normal; line-height: 1.6;">
      
      <!-- Header Branding -->
      <div style="text-align: center; width: 100%; border-bottom: 1px dashed #9ca3af; padding-bottom: 12px;">
        <img
          src="${getEldeebLogoDataUrl(300, false, 'gold')}"
          alt="Cafe Eldeeb"
          style="width: 215px; height: auto; display: block; margin: 0 auto 6px; object-fit: contain;"
        />
        ${settings?.address ? `<p style="margin: 2px 0 0; font-size: 11px; color: #4b5563;">${escapeHtml(settings.address)}</p>` : ''}
        ${settings?.phone ? `<p style="margin: 2px 0 0; font-size: 11px; color: #4b5563;">هاتف: ${escapeHtml(settings.phone)}</p>` : ''}
      </div>

      <!-- Invoice Metadata -->
      <div style="width: 100%; text-align: right; border-bottom: 1px dashed #9ca3af; padding: 10px 0; font-size: 11px; color: #374151;">
        <p style="margin: 2px 0;">رقم الفاتورة: <span style="font-weight: 800; color: #000000; font-family: monospace;">${escapeHtml(invoice.invoice_number)}</span></p>
        <p style="margin: 2px 0;">تاريخ المعاملة: ${escapeHtml(formattedDate)} - ${escapeHtml(formattedTime)}</p>
        <p style="margin: 2px 0;">الكاشير المسؤول: <span style="font-weight: 700; color: #000000;">${escapeHtml(invoice.cashier_name || 'المدير العام')}</span></p>
        <p style="margin: 2px 0;">رقم الطاولة: <span style="font-weight: 800; color: #000000;">${escapeHtml(invoice.table_number || 'غير محدد')}</span></p>
        <p style="margin: 2px 0;">طريقة الدفع: <span style="font-weight: 700; color: #000000;">${escapeHtml(paymentMethodText)}</span></p>
        ${invoice.payment_method === 'VODAFONE_CASH' ? `<p style="margin: 2px 0; font-weight: 700; color: #b91c1c;">الحساب: فودافون كاش (${escapeHtml(invoice.payment_number || settings?.vodafone_cash_number || '')})</p>` : ''}
        ${invoice.payment_method === 'BANK_TRANSFER' ? `<p style="margin: 2px 0; font-weight: 700; color: #047857;">الحساب: إنستا باي (${escapeHtml(invoice.payment_number || settings?.instapay_number || '')})</p>` : ''}
        ${senderPhone ? `<p style="margin: 2px 0; font-weight: 700; color: #000000;">رقم المحول: <span style="font-family: monospace;">${escapeHtml(senderPhone)}</span></p>` : ''}
        ${referenceNumber ? `<p style="margin: 2px 0; font-weight: 700; color: #1f2937;">رقم المرجع: <span style="font-family: monospace;">${escapeHtml(referenceNumber)}</span></p>` : ''}
        <p style="margin: 2px 0;">حالة السداد: <span style="font-weight: 800; color: ${paymentStatusColor};">${paymentStatusLabel}</span></p>
        ${invoice.customer_id ? `<p style="margin: 2px 0;">العميل: <span style="font-weight: 700; color: #000000;">${escapeHtml(custName)}</span></p>` : ''}
      </div>

      <!-- Items List -->
      <div style="width: 100%; padding: 10px 0; border-bottom: 1px dashed #9ca3af;">
        <div style="display: flex; justify-content: space-between; font-weight: 800; padding-bottom: 6px; color: #1f2937; font-size: 11px; border-bottom: 1px solid #e5e7eb;">
          <span style="width: 52%; text-align: right;">الصنف</span>
          <span style="width: 18%; text-align: center;">الكمية</span>
          <span style="width: 30%; text-align: left;">الإجمالي</span>
        </div>
        ${itemRowsHtml}
      </div>

      <!-- Totals Section -->
      <div style="width: 100%; padding: 10px 0; border-bottom: 1px dashed #9ca3af; font-weight: 700; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; color: #4b5563; margin-bottom: 4px;">
          <span>المجموع الفرعي:</span>
          <span>${subtotal.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #dc2626; margin-bottom: 4px;">
            <span>خصم مباشر:</span>
            <span>-${discount.toLocaleString()} ${escapeHtml(currency)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; color: #4b5563; margin-bottom: 4px;">
          <span>الضريبة (14%):</span>
          <span>${tax.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #000000; font-weight: 900; font-size: 13.5px; padding-top: 6px; margin-top: 4px; border-top: 1px dotted #d1d5db;">
          <span>${hasCreditSummary ? 'حساب الفاتورة الجديدة:' : isOpenOrDraft ? 'إجمالي الفاتورة المفتوحة:' : 'الإجمالي النهائي:'}</span>
          <span>${total.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        ${isOpenOrDraft ? `
          ${paidAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #047857; padding-top: 4px;">
              <span>المدفوع مسبقاً:</span>
              <span>${paidAmount.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; color: #b45309; font-weight: 900; padding-top: 4px;">
            <span>المطلوب سداده للفاتورة:</span>
            <span>${Math.max(0, total - paidAmount).toLocaleString()} ${escapeHtml(currency)}</span>
          </div>
        ` : `
          <div style="display: flex; justify-content: space-between; color: #4b5563; padding-top: 4px;">
            <span>المسدد للفاتورة:</span>
            <span>${paidAmount.toLocaleString()} ${escapeHtml(currency)}</span>
          </div>
          ${remainingAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #d97706; margin-top: 3px;">
              <span>المتبقي من الفاتورة الحالية (آجل):</span>
              <span>${remainingAmount.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
          ` : ''}
        `}
        ${hasCreditSummary ? `
          <div style="margin-top: 8px; padding: 8px 10px; border-top: 1px dashed #fbbf24; background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 10.5px;">
            <div style="display: flex; justify-content: space-between; color: #78350f; margin-bottom: 3px;">
              <span>الحساب الآجل السابق:</span>
              <span>${prevCredit.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #000000; font-weight: 900; margin-bottom: 3px;">
              <span>الإجمالي (الجديد + الآجل):</span>
              <span>${grandTotalWithCredit.toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
            ${creditPaidWithInv > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #047857; margin-bottom: 3px;">
                <span>المسدد من الآجل السابق:</span>
                <span>-${creditPaidWithInv.toLocaleString()} ${escapeHtml(currency)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; color: #064e3b; font-weight: 900; margin-bottom: 3px;">
              <span>إجمالي المدفوع الآن:</span>
              <span>${(paidAmount + creditPaidWithInv).toLocaleString()} ${escapeHtml(currency)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 900; padding-top: 4px; border-top: 1px solid #fcd34d; color: ${remCreditAfter > 0 ? '#b91c1c' : '#047857'};">
              <span>الحساب الآجل المتبقي على العميل:</span>
              <span>${remCreditAfter > 0 ? `${remCreditAfter.toLocaleString()} ${escapeHtml(currency)}` : `0 ${escapeHtml(currency)} (خالص)`}</span>
            </div>
          </div>
        ` : ''}
      </div>

      ${returnsHtml}

      ${invoice.notes ? `
        <div style="width: 100%; text-align: right; padding: 8px 0; border-bottom: 1px dashed #9ca3af; font-size: 10.5px; color: #4b5563;">
          <div style="font-weight: 700; color: #000000;">📌 ملاحظات الفاتورة:</div>
          <div style="background: #f9fafb; padding: 6px 8px; border-radius: 6px; margin-top: 3px;">${escapeHtml(invoice.notes)}</div>
        </div>
      ` : ''}

      <!-- Footer -->
      <div style="text-align: center; width: 100%; padding-top: 10px; font-size: 11px; color: #4b5563; font-weight: 700;">
        <p style="margin: 0;">${escapeHtml(settings?.receipt_footer || 'شكراً لتعاملكم مع كافيه الديب ☕')}</p>
      </div>
    </div>
  `;

  document.body.appendChild(renderDiv);

  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const imgs = Array.from(renderDiv.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const canvas = await safeHtml2Canvas(renderDiv, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: 2.5,
    });

    const imageBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
    );

    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('فشل إنشاء صورة الفاتورة (الملف فارغ).');
    }

    const imageFile = new File([imageBlob], imageFileName, { type: 'image/png' });
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    return { imageBlob, imageFile, imageFileName, dataUrl };
  } catch (err: any) {
    console.error('Error in createInvoiceReceiptImage:', err);
    throw new Error(`تعذر إنشاء صورة الفاتورة: ${err?.message || 'خطأ غير معروف'}`);
  } finally {
    if (document.body.contains(renderDiv)) {
      document.body.removeChild(renderDiv);
    }
  }
}

/**
 * Generates an image of the receipt (matching the in-app receipt card) and shares it to WhatsApp
 * using the native share sheet on mobile/Android or PNG download + clipboard + WhatsApp launch on desktop.
 */
export async function shareInvoiceImageToWhatsApp({
  invoice,
  items,
  customer,
  settings,
  returns = [],
  phone,
  onStart,
  onSuccess,
  onError,
}: ShareInvoiceImageOptions): Promise<void> {
  try {
    if (onStart) onStart('جاري تجهيز صورة الفاتورة للإرسال عبر واتساب... 📸');

    const { imageBlob, imageFile, imageFileName, dataUrl } = await createInvoiceReceiptImage({
      invoice,
      items,
      customer,
      settings,
      returns,
    });

    let targetPhone = phone;
    if (!targetPhone && customer) {
      targetPhone = customer.phone || customer.whatsapp || '';
    }

    let cleanPhone = (targetPhone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '2' + cleanPhone;
    } else if (cleanPhone && !cleanPhone.startsWith('20') && cleanPhone.length === 10) {
      cleanPhone = '20' + cleanPhone;
    }

    const isOpenOrDraft = invoice.invoice_status === 'OPEN' || invoice.invoice_status === 'DRAFT';
    const currency = settings?.currency || 'ج.م';
    const message = isOpenOrDraft
      ? `مرفق إليكم صورة الفاتورة المفتوحة رقم ${invoice.invoice_number} (قبل الدفع) بقيمة ${(invoice.total ?? 0).toLocaleString()} ${currency}.\n\nشكراً لتعاملكم مع كافيه الديب ☕`
      : `مرفق إليكم صورة فاتورتكم رقم ${invoice.invoice_number}.\n\nشكراً لتعاملكم مع كافيه الديب ☕`;
    const encodedText = encodeURIComponent(message);
    const whatsappUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    // 1. Native Share API (Android WebView / Mobile browsers attach the PNG image directly to WhatsApp)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
      try {
        await navigator.share({
          title: imageFileName,
          text: message,
          files: [imageFile],
        });
        if (onSuccess) onSuccess('تمت مشاركة الفاتورة كصورة بنجاح عبر الواتساب! 📸');
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return;
        }
        console.log('Native image share unavailable/failed, falling back to download + WhatsApp:', shareErr);
      }
    }

    // 2. Fallback: Download PNG image
    try {
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = imageFileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (dlErr) {
      console.warn('PNG image download failed:', dlErr);
    }

    // 3. Fallback: Copy PNG to clipboard so desktop users can paste directly into WhatsApp Web
    try {
      if (navigator.clipboard && typeof window !== 'undefined' && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': imageBlob }),
        ]);
      }
    } catch (clipErr) {
      console.warn('Clipboard image write failed:', clipErr);
    }

    // 4. Open WhatsApp safely
    let windowOpened = false;
    try {
      const win = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (win) windowOpened = true;
    } catch (winErr) {
      console.warn('window.open failed for WhatsApp link:', winErr);
    }

    if (!windowOpened) {
      try {
        const waLink = document.createElement('a');
        waLink.href = whatsappUrl;
        waLink.target = '_blank';
        waLink.rel = 'noopener noreferrer';
        waLink.style.display = 'none';
        document.body.appendChild(waLink);
        waLink.click();
        document.body.removeChild(waLink);
      } catch (waErr) {
        console.warn('WhatsApp anchor link click failed:', waErr);
      }
    }

    if (onSuccess) {
      onSuccess(`📸 تم حفظ صورة الفاتورة (${imageFileName}) ونسخها للحافظة وجاري فتح الواتساب لإرسالها!`);
    }
  } catch (err: any) {
    console.error('Unhandled error in shareInvoiceImageToWhatsApp:', err);
    if (onError) onError(err?.message || 'حدث خطأ أثناء تحويل الفاتورة إلى صورة لإرسالها عبر الواتساب');
  }
}

export interface StatementLedgerRow {
  date: string;
  desc: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BuiltCustomerStatementData {
  rows: StatementLedgerRow[];
  startingBalance: number;
  totalDebits: number;
  totalCredits: number;
  endingBalance: number;
}

/**
 * Builds chronological customer statement rows using CustomerCreditTransaction ledger when available,
 * falling back to credit invoices & credit payments while staying synchronized with current_balance.
 */
export function buildCustomerStatementData({
  customer,
  invoices,
  creditPayments,
  creditTransactions = [],
}: {
  customer: Customer;
  invoices: Invoice[];
  creditPayments: CreditPayment[];
  creditTransactions?: CustomerCreditTransaction[];
}): BuiltCustomerStatementData {
  const endingBalance = Number(customer.current_balance) || 0;
  const custCreditTxs = (creditTransactions || [])
    .filter((tx) => tx.customer_id === customer.id)
    .sort((a, b) => new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime());

  if (custCreditTxs.length > 0) {
    let totalDebits = 0;
    let totalCredits = 0;
    const rows: StatementLedgerRow[] = custCreditTxs.map((tx) => {
      const dateStr = (tx.date || tx.created_at || '').substring(0, 10) || '-';
      let debit = 0;
      let credit = 0;
      let desc = tx.notes || '';

      if (tx.transaction_type === 'INVOICE') {
        debit = Number(tx.amount) || 0;
        desc = tx.notes || (tx.invoice_id ? `فاتورة مبيعات آجل` : 'مبيعات آجل');
      } else if (tx.transaction_type === 'PAYMENT') {
        credit = Number(tx.amount) || 0;
        desc = tx.notes || 'دفعة سداد نقدية';
      } else if (tx.transaction_type === 'REFUND') {
        credit = Number(tx.amount) || 0;
        desc = tx.notes || 'مرتجع / خصم مديونية';
      } else {
        const delta = (Number(tx.new_balance) || 0) - (Number(tx.previous_balance) || 0);
        if (delta >= 0) {
          debit = delta;
          desc = tx.notes || 'تعديل / إضافة مديونية إداري';
        } else {
          credit = Math.abs(delta);
          desc = tx.notes || 'تسوية / خصم مديونية إداري';
        }
      }

      totalDebits += debit;
      totalCredits += credit;

      return {
        date: dateStr,
        desc,
        debit,
        credit,
        balance: Number(tx.new_balance) || 0,
      };
    });

    const startingBalance = Number(custCreditTxs[0].previous_balance) || 0;
    return {
      rows,
      startingBalance,
      totalDebits,
      totalCredits,
      endingBalance,
    };
  }

  // Fallback for customers without credit_transactions history
  const custInvoices = (invoices || []).filter(
    (inv) =>
      inv.customer_id === customer.id &&
      inv.invoice_status !== 'CANCELLED' &&
      inv.invoice_status !== 'OPEN' &&
      inv.invoice_status !== 'DRAFT' &&
      (inv.payment_type === 'CREDIT' || inv.payment_type === 'SPLIT' || (inv.remaining_amount || 0) > 0)
  );
  const custPayments = (creditPayments || []).filter((p) => p.customer_id === customer.id);

  const combined = [
    ...custInvoices.map((inv) => ({
      rawDate: inv.created_at || inv.invoice_date,
      date: (inv.created_at || inv.invoice_date || '').substring(0, 10),
      desc: `فاتورة مبيعات #${inv.invoice_number}`,
      debit: inv.remaining_amount > 0 ? inv.remaining_amount : inv.total,
      credit: 0,
    })),
    ...custPayments.map((p) => ({
      rawDate: p.created_at || p.payment_date,
      date: (p.created_at || p.payment_date || '').substring(0, 10),
      desc: `دفعة سداد نقدية${p.notes ? ` - ${p.notes}` : ''}`,
      debit: 0,
      credit: p.amount || 0,
    })),
  ].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

  const totalDebits = combined.reduce((sum, r) => sum + r.debit, 0);
  const totalCredits = combined.reduce((sum, r) => sum + r.credit, 0);
  const startingBalance = endingBalance - totalDebits + totalCredits;

  let running = startingBalance;
  const rows: StatementLedgerRow[] = combined.map((rec) => {
    running += rec.debit - rec.credit;
    return {
      date: rec.date || '-',
      desc: rec.desc,
      debit: rec.debit,
      credit: rec.credit,
      balance: running,
    };
  });

  return {
    rows,
    startingBalance,
    totalDebits,
    totalCredits,
    endingBalance,
  };
}

export interface ShareCustomerStatementImageOptions {
  customer: Customer;
  invoices: Invoice[];
  creditPayments: CreditPayment[];
  creditTransactions?: CustomerCreditTransaction[];
  settings: AppSettings;
  phone?: string;
  onStart?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Renders the customer account statement as a high-resolution PNG image card (never PDF).
 */
export async function createCustomerStatementImage({
  customer,
  invoices,
  creditPayments,
  creditTransactions = [],
  settings,
}: {
  customer: Customer;
  invoices: Invoice[];
  creditPayments: CreditPayment[];
  creditTransactions?: CustomerCreditTransaction[];
  settings: AppSettings;
}): Promise<{ imageBlob: Blob; imageFile: File; imageFileName: string; dataUrl: string }> {
  if (!customer) {
    throw new Error('بيانات العميل غير متاحة لإنشاء كشف الحساب.');
  }

  const currency = settings?.currency || 'ج.م';
  const cafeName =
    settings?.cafe_name && settings.cafe_name.trim().length > 0
      ? settings.cafe_name.trim()
      : 'كافيه الديب';
  const dateObj = new Date();
  const todayStr = dateObj.toLocaleDateString('ar-EG');
  const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const safeNameForFile = (customer.full_name || 'customer')
    .replace(/[^\w\u0600-\u06FF-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'customer';
  const imageFileName = `Statement-${safeNameForFile}-${dateObj.toISOString().split('T')[0]}.png`;

  const { rows, startingBalance, totalDebits, totalCredits, endingBalance } =
    buildCustomerStatementData({
      customer,
      invoices,
      creditPayments,
      creditTransactions,
    });

  let rowsHtml = '';
  if (startingBalance !== 0 || rows.length === 0) {
    rowsHtml += `
      <tr style="background-color: #fffbeb; font-weight: 700;">
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 10.5px;">-</td>
        <td style="padding: 8px 8px; border: 1px solid #e5e7eb; text-align: right; color: #92400e; font-size: 11px;">الرصيد السابق / المرحل</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #b91c1c; font-size: 11px;">${startingBalance > 0 ? `${startingBalance.toLocaleString()} ${escapeHtml(currency)}` : '-'}</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #047857; font-size: 11px;">${startingBalance < 0 ? `${Math.abs(startingBalance).toLocaleString()} ${escapeHtml(currency)}` : '-'}</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #111827; font-weight: 800; font-size: 11px;">${startingBalance.toLocaleString()} ${escapeHtml(currency)}</td>
      </tr>
    `;
  }

  rowsHtml += rows
    .map(
      (rec, idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #4b5563; font-size: 10px; font-family: monospace; white-space: nowrap;">${escapeHtml(rec.date)}</td>
        <td style="padding: 8px 8px; border: 1px solid #e5e7eb; text-align: right; color: #111827; font-weight: 600; font-size: 11px; word-break: break-word;">${escapeHtml(rec.desc)}</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #b91c1c; font-weight: 700; font-size: 11px; white-space: nowrap;">${rec.debit > 0 ? `${rec.debit.toLocaleString()} ${escapeHtml(currency)}` : '-'}</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #047857; font-weight: 700; font-size: 11px; white-space: nowrap;">${rec.credit > 0 ? `${rec.credit.toLocaleString()} ${escapeHtml(currency)}` : '-'}</td>
        <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #111827; font-weight: 800; font-size: 11px; white-space: nowrap;">${rec.balance.toLocaleString()} ${escapeHtml(currency)}</td>
      </tr>
    `
    )
    .join('');

  const renderDiv = document.createElement('div');
  renderDiv.style.position = 'fixed';
  renderDiv.style.top = '-99999px';
  renderDiv.style.left = '-99999px';
  renderDiv.style.width = '560px';
  renderDiv.style.backgroundColor = '#ffffff';
  renderDiv.style.color = '#111827';
  renderDiv.style.padding = '24px 22px';
  renderDiv.style.boxSizing = 'border-box';
  renderDiv.style.direction = 'rtl';
  renderDiv.style.letterSpacing = 'normal';
  renderDiv.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  renderDiv.id = 'customer-statement-image-render-container';

  renderDiv.innerHTML = `
    <div style="background: #ffffff; color: #111827; width: 100%; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; letter-spacing: normal; line-height: 1.55;">
      
      <!-- Header -->
      <div style="text-align: center; border-bottom: 2px dashed #d4af37; padding-bottom: 14px; margin-bottom: 14px;">
        <img
          src="${getEldeebLogoDataUrl(300, false, 'gold')}"
          alt="Cafe Eldeeb"
          style="width: 170px; height: auto; display: block; margin: 0 auto 8px; object-fit: contain;"
        />
        <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #111827;">${escapeHtml(cafeName)}</h1>
        <p style="margin: 3px 0 0; font-size: 13px; font-weight: 800; color: #b45309;">كشف حساب عميل تفصيلي (الآجل والذمم المالية)</p>
        ${settings?.address ? `<p style="margin: 3px 0 0; font-size: 11px; color: #4b5563;">${escapeHtml(settings.address)}</p>` : ''}
        ${settings?.phone ? `<p style="margin: 2px 0 0; font-size: 11px; color: #4b5563;">هاتف: ${escapeHtml(settings.phone)}</p>` : ''}
        <p style="margin: 4px 0 0; font-size: 10.5px; color: #6b7280;">تاريخ الاستخراج: ${escapeHtml(todayStr)} - ${escapeHtml(timeStr)}</p>
      </div>

      <!-- Customer Summary Card -->
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #4b5563; font-weight: 700;">اسم العميل:</span>
          <span style="color: #111827; font-weight: 900;">${escapeHtml(customer.full_name)} ${customer.is_vip ? '⭐' : ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #4b5563; font-weight: 700;">رقم الهاتف:</span>
          <span style="color: #111827; font-weight: 700; font-family: monospace;">${escapeHtml(customer.phone || customer.whatsapp || 'غير مدخل')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #4b5563; font-weight: 700;">رصيد المحفظة:</span>
          <span style="color: #b45309; font-weight: 800;">${(customer.wallet_balance || 0).toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-top: 6px; margin-top: 6px; border-top: 1px dashed #d1d5db; font-size: 13.5px;">
          <span style="color: #111827; font-weight: 900;">المديونية الحالية المستحقة:</span>
          <span style="color: ${endingBalance > 0 ? '#dc2626' : '#059669'}; font-weight: 900;">${endingBalance.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
      </div>

      <!-- Ledger Table -->
      <h3 style="margin: 0 0 8px; font-size: 13px; font-weight: 800; color: #111827; border-right: 4px solid #d4af37; padding-right: 8px;">سجل الحركات التفصيلي</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead>
          <tr style="background-color: #111827; color: #ffffff; font-size: 11px;">
            <th style="padding: 8px 6px; border: 1px solid #111827; text-align: center;">التاريخ</th>
            <th style="padding: 8px 8px; border: 1px solid #111827; text-align: right;">البيان / العملية</th>
            <th style="padding: 8px 6px; border: 1px solid #111827; text-align: center;">عليه (+)</th>
            <th style="padding: 8px 6px; border: 1px solid #111827; text-align: center;">له (-)</th>
            <th style="padding: 8px 6px; border: 1px solid #111827; text-align: center;">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Totals Box -->
      <div style="background: #fffbeb; border: 1.5px solid #fcd34d; border-radius: 12px; padding: 12px 14px; font-size: 12px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #78350f; font-weight: 700;">
          <span>الرصيد السابق:</span>
          <span>${startingBalance.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #b91c1c; font-weight: 700;">
          <span>إجمالي المشتريات / الإضافات الآجلة:</span>
          <span>${totalDebits.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #047857; font-weight: 700;">
          <span>إجمالي المبالغ المسددة:</span>
          <span>${totalCredits.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1.5px dashed #f59e0b; font-size: 15px; font-weight: 900; color: ${endingBalance > 0 ? '#b91c1c' : '#047857'};">
          <span>صافي المديونية النهائية المستحقة:</span>
          <span>${endingBalance.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; border-top: 1px dashed #9ca3af; padding-top: 10px; font-size: 10.5px; color: #6b7280; font-weight: 700;">
        <p style="margin: 0 0 3px;">${escapeHtml(settings?.statement_footer || 'هذا الكشف صادر آلياً من نظام كافيه الديب POS الملوكي ولا يحتاج لتوقيع.')}</p>
        <p style="margin: 0; color: #374151;">شكراً لتعاملكم الراقي معنا ☕</p>
      </div>

    </div>
  `;

  document.body.appendChild(renderDiv);

  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const imgs = Array.from(renderDiv.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const canvas = await safeHtml2Canvas(renderDiv, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: 2.2,
    });

    const imageBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
    );

    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('فشل إنشاء صورة كشف الحساب (الملف فارغ).');
    }

    const imageFile = new File([imageBlob], imageFileName, { type: 'image/png' });
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    return { imageBlob, imageFile, imageFileName, dataUrl };
  } catch (err: any) {
    console.error('Error in createCustomerStatementImage:', err);
    throw new Error(`تعذر إنشاء صورة كشف الحساب: ${err?.message || 'خطأ غير معروف'}`);
  } finally {
    if (document.body.contains(renderDiv)) {
      document.body.removeChild(renderDiv);
    }
  }
}

/**
 * Generates the customer's account statement as a PNG image and shares it to WhatsApp (never PDF).
 */
export async function shareCustomerStatementImageToWhatsApp({
  customer,
  invoices,
  creditPayments,
  creditTransactions = [],
  settings,
  phone,
  onStart,
  onSuccess,
  onError,
}: ShareCustomerStatementImageOptions): Promise<void> {
  try {
    if (onStart) onStart('جاري تجهيز كشف الحساب كصورة للإرسال عبر واتساب... 📸');

    const { imageBlob, imageFile, imageFileName, dataUrl } = await createCustomerStatementImage({
      customer,
      invoices,
      creditPayments,
      creditTransactions,
      settings,
    });

    const targetPhone = phone ?? customer.whatsapp ?? customer.phone ?? '';
    let cleanPhone = (targetPhone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '2' + cleanPhone;
    } else if (cleanPhone && !cleanPhone.startsWith('20') && cleanPhone.length === 10) {
      cleanPhone = '20' + cleanPhone;
    }

    const currency = settings?.currency || 'ج.م';
    const remainingText = `${(customer.current_balance || 0).toLocaleString()} ${currency}`;
    const tpl =
      settings?.whatsapp_template_statement ||
      'السلام عليكم أستاذ / {CustomerName}\nتجدون مرفقاً صورة كشف الحساب التفصيلي الخاص بكم لدى كافيه الديب.\nإجمالي الرصيد المستحق: {RemainingBalance}.\nنشكركم لثقتكم الغالية 🌹';
    const message = tpl
      .replace(/\{CustomerName\}/g, customer.full_name || 'العميل')
      .replace(/\{RemainingBalance\}/g, (customer.current_balance || 0).toLocaleString())
      .replace(/\s+ج\.م\s+ج\.م/g, ` ${currency}`);

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    // 1. Native Web Share API (Android attaches PNG image directly to WhatsApp)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
      try {
        await navigator.share({
          title: imageFileName,
          text: `${message}\n(${remainingText})`,
          files: [imageFile],
        });
        if (onSuccess) onSuccess('تمت مشاركة كشف الحساب كصورة بنجاح عبر الواتساب! 📸');
        return;
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return;
        }
        console.log('Native statement image share unavailable/failed, falling back:', shareErr);
      }
    }

    // 2. Fallback: Download PNG
    try {
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = imageFileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (dlErr) {
      console.warn('Statement PNG download failed:', dlErr);
    }

    // 3. Fallback: Copy PNG to clipboard
    try {
      if (navigator.clipboard && typeof window !== 'undefined' && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': imageBlob }),
        ]);
      }
    } catch (clipErr) {
      console.warn('Clipboard statement image write failed:', clipErr);
    }

    // 4. Open WhatsApp safely
    let windowOpened = false;
    try {
      const win = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (win) windowOpened = true;
    } catch (winErr) {
      console.warn('window.open failed for WhatsApp link:', winErr);
    }

    if (!windowOpened) {
      try {
        const waLink = document.createElement('a');
        waLink.href = whatsappUrl;
        waLink.target = '_blank';
        waLink.rel = 'noopener noreferrer';
        waLink.style.display = 'none';
        document.body.appendChild(waLink);
        waLink.click();
        document.body.removeChild(waLink);
      } catch (waErr) {
        console.warn('WhatsApp anchor link click failed:', waErr);
      }
    }

    if (onSuccess) {
      onSuccess(`📸 تم حفظ صورة كشف الحساب (${imageFileName}) ونسخها للحافظة وجاري فتح الواتساب لإرسالها!`);
    }
  } catch (err: any) {
    console.error('Unhandled error in shareCustomerStatementImageToWhatsApp:', err);
    if (onError) onError(err?.message || 'حدث خطأ أثناء تحويل كشف الحساب إلى صورة لإرسالها عبر الواتساب');
  }
}

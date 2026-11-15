import { safeHtml2Canvas } from './html2canvasHelper';
import { Invoice, InvoiceItem, Customer, AppSettings, ReturnTransaction } from '../types';
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
  const paymentMethodText = getPaymentMethodLabel(invoice);

  const paymentStatusLabel =
    invoice.payment_status === 'PAID'
      ? 'مدفوعة بالكامل'
      : invoice.payment_status === 'PARTIAL'
      ? 'مدفوعة جزئياً'
      : invoice.payment_status === 'UNPAID'
      ? 'غير مدفوعة - أجل'
      : 'ملغاة';

  const paymentStatusColor =
    invoice.payment_status === 'PAID'
      ? '#059669'
      : invoice.payment_status === 'PARTIAL'
      ? '#d97706'
      : invoice.payment_status === 'UNPAID'
      ? '#e11d48'
      : '#6b7280';

  const subtotal = invoice.subtotal ?? 0;
  const discount = invoice.discount ?? 0;
  const tax = invoice.tax ?? 0;
  const total = invoice.total ?? 0;
  const paidAmount = invoice.paid_amount ?? 0;
  const remainingAmount = invoice.remaining_amount ?? 0;
  const prevCredit = invoice.previous_credit_balance ?? 0;
  const creditPaidWithInv = invoice.credit_paid_with_invoice ?? 0;
  const remCreditAfter =
    invoice.remaining_credit_after_invoice ??
    Math.max(0, prevCredit - creditPaidWithInv + remainingAmount);
  const grandTotalWithCredit = invoice.grand_total_with_credit ?? total + prevCredit;
  const hasCreditSummary =
    invoice.previous_credit_balance !== undefined &&
    (prevCredit > 0 || creditPaidWithInv > 0 || remCreditAfter > 0);

  const itemRowsHtml =
    safeItems.length > 0
      ? safeItems
          .map((item, idx) => {
            const qty = item.quantity || 1;
            const totalPrice = item.total_price ?? 0;
            const unitPrice = item.unit_price ?? (qty > 0 ? totalPrice / qty : totalPrice);
            const borderStyle = idx < safeItems.length - 1 ? 'border-bottom: 1px solid #f3f4f6;' : '';
            const notesHtml = item.notes
              ? `<div style="font-size: 9.5px; color: #92400e; margin-top: 2px;">${escapeHtml(item.notes)}</div>`
              : '';
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; ${borderStyle} color: #374151;">
                <div style="width: 52%; text-align: right; padding-left: 6px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; word-break: break-word;">${escapeHtml(item.product_name_ar || 'صنف غير مسمى')}</div>
                  <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${unitPrice.toLocaleString()} ${escapeHtml(currency)}</div>
                  ${notesHtml}
                </div>
                <div style="width: 18%; text-align: center; font-weight: 800; font-size: 12.5px; color: #111827;">${qty}</div>
                <div style="width: 30%; text-align: left; font-weight: 800; font-size: 12px; color: #111827;">${totalPrice.toLocaleString()} ${escapeHtml(currency)}</div>
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
          <span>${hasCreditSummary ? 'حساب الفاتورة الجديدة:' : 'الإجمالي النهائي:'}</span>
          <span>${total.toLocaleString()} ${escapeHtml(currency)}</span>
        </div>
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

    const message = `مرفق إليكم صورة فاتورتكم رقم ${invoice.invoice_number}.\n\nشكراً لتعاملكم مع كافيه الديب ☕`;
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

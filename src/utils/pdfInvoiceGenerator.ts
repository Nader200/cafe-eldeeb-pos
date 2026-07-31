import jsPDF from 'jspdf';
import { safeHtml2Canvas } from './html2canvasHelper';
import { Invoice, InvoiceItem, Customer, AppSettings } from '../types';
import { getEldeebLogoDataUrl } from '../lib/logoSvg';

export interface GenerateInvoicePDFOptions {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: AppSettings;
  phone?: string;
  onStart?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Clean helper function to format Invoice Number string for filename
 * e.g. "INV-1052" or "#1052" or "1052" -> "1052"
 */
export function getCleanInvoiceNumber(rawNumber: string): string {
  if (!rawNumber) return '1000';
  return rawNumber.replace(/^[#\s]+/, '').trim();
}

/**
 * Builds the exact HTML container matching the Customer Statement design style,
 * renders it using html2canvas, creates a jsPDF document, and outputs the PDF Blob and File.
 */
export async function createInvoicePDF({
  invoice,
  items,
  customer,
  settings,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: AppSettings;
}): Promise<{ pdfBlob: Blob; pdfFile: File; pdfFileName: string }> {
  if (!invoice) {
    throw new Error('بيانات الفاتورة غير متاحة لإنشاء PDF.');
  }

  const cleanInvNum = getCleanInvoiceNumber(invoice.invoice_number);
  const pdfFileName = `Invoice-${cleanInvNum}.pdf`;

  const safeItems = items && Array.isArray(items) ? items : [];

  // Format Date & Time
  const dateObj = new Date(invoice.invoice_date || invoice.created_at || Date.now());
  const formattedDate = dateObj.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedTime = dateObj.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const formattedDateTime = `${formattedDate} - ${formattedTime}`;

  // Customer Name
  const custName = customer?.full_name || (invoice.customer_id ? 'عميل مسجل' : 'عميل عام / نقدي');

  // Payment Method text
  let paymentMethodText = 'نقدي (كاش)';
  if (invoice.payment_type === 'CREDIT') {
    paymentMethodText = 'ذمم بالآجل';
  } else if ((invoice.payment_type as string) === 'SPLIT' || (invoice.payment_type as string) === 'PARTIAL') {
    paymentMethodText = 'مجزأ (نقدي + آجل)';
  }

  const currency = settings?.currency || 'ج.م';
  const cafeName = settings?.cafe_name || 'كافيه الديب POS';

  const subtotal = invoice.subtotal ?? 0;
  const discount = invoice.discount ?? 0;
  const tax = invoice.tax ?? 0;
  const total = invoice.total ?? 0;
  const paidAmount = invoice.paid_amount ?? 0;
  const remainingAmount = invoice.remaining_amount ?? 0;

  // Products Table Rows
  const productRowsHtml = safeItems.length > 0
    ? safeItems
        .map((item, idx) => {
          const qty = item.quantity || 1;
          const unitPrice = item.unit_price ?? (qty > 0 ? ((item.total_price || 0) / qty) : (item.total_price || 0));
          const totalPrice = item.total_price ?? (qty * unitPrice);
          return `
            <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fdfdfd'};">
              <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; font-size: 12px; color: #4b5563;">${idx + 1}</td>
              <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold; font-size: 13px; color: #111827;">${item.product_name_ar || 'صنف غير مسمى'}</td>
              <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: center; font-weight: 800; font-size: 13px; color: #111827;">${qty}</td>
              <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: left; font-size: 12px; color: #374151;">${unitPrice.toLocaleString()} ${currency}</td>
              <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: left; font-weight: bold; font-size: 13px; color: #111827;">${totalPrice.toLocaleString()} ${currency}</td>
            </tr>
          `;
        })
        .join('')
    : `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #6b7280;">لا توجد أصناف في هذه الفاتورة</td></tr>`;

  // QR Code URL
  const qrData = encodeURIComponent(`Invoice-${cleanInvNum}`);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${qrData}`;

  // Offscreen HTML Container matching Customer Statement style
  const renderDiv = document.createElement('div');
  renderDiv.style.position = 'fixed';
  renderDiv.style.top = '-9999px';
  renderDiv.style.left = '-9999px';
  renderDiv.style.width = '800px';
  renderDiv.style.padding = '35px';
  renderDiv.style.backgroundColor = '#ffffff';
  renderDiv.style.color = '#333333';
  renderDiv.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  renderDiv.style.direction = 'rtl';
  renderDiv.style.boxSizing = 'border-box';
  renderDiv.id = 'invoice-pdf-hidden-render-container';

  renderDiv.innerHTML = `
    <div style="background: #ffffff; width: 100%; box-sizing: border-box; border: 1px solid #e5e7eb; padding: 30px; border-radius: 12px;">
      
      <!-- HEADER matching Customer Statement -->
      <div style="text-align: center; border-bottom: 3px double #d4af37; padding-bottom: 20px; margin-bottom: 22px;">
        <img src="${getEldeebLogoDataUrl(300, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 155px; width: auto; margin: 0 auto 12px; display: block; filter: contrast(115%) brightness(102%); image-rendering: -webkit-optimize-contrast;" />
        <h1 style="color: #111111; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${cafeName}</h1>
        <p style="margin: 6px 0 0; color: #4b5563; font-size: 14px; font-weight: bold;">فاتورة مبيعات إلكترونية • Official Sales Invoice</p>
        <p style="margin: 4px 0 0; color: #6b7280; font-size: 12px; font-weight: 600;">تاريخ الإصدار: ${formattedDateTime}</p>
      </div>

      <!-- INVOICE & CUSTOMER INFO TABLE -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13px;">
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; width: 18%; color: #374151;">رقم الفاتورة:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: 800; color: #b45309; font-size: 14px; font-family: monospace;">#${cleanInvNum}</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; width: 18%; color: #374151;">التاريخ والوقت:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; color: #1f2937; font-weight: 600;">${formattedDateTime}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; color: #374151;">اسم العميل:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; color: #111827; font-weight: 700;">${custName}</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; color: #374151;">الكاشير المسؤول:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; color: #1f2937; font-weight: 600;">${invoice.cashier_name || 'المدير العام'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; color: #374151;">طريقة الدفع:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; color: #1f2937; font-weight: 600;">${paymentMethodText}</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: bold; background-color: #f8f9fa; color: #374151;">رقم الطاولة:</td>
          <td style="padding: 8px 12px; border: 1px solid #d1d5db; color: #1f2937; font-weight: 600;">${invoice.table_number ? `طاولة رقم ${invoice.table_number}` : 'غير متوفر'}</td>
        </tr>
      </table>

      <!-- PRODUCTS TABLE SECTION HEADER -->
      <h3 style="margin-top: 25px; margin-bottom: 12px; border-right: 4px solid #d4af37; padding-right: 12px; font-size: 15px; font-weight: 800; color: #111827;">تفاصيل الطلبات والأصناف</h3>
      
      <!-- PRODUCTS TABLE -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
        <thead>
          <tr style="background-color: #111111; color: #ffffff;">
            <th style="padding: 10px 12px; border: 1px solid #111111; text-align: center; font-weight: bold; width: 6%;">#</th>
            <th style="padding: 10px 12px; border: 1px solid #111111; text-align: right; font-weight: bold;">الصنف / المادة</th>
            <th style="padding: 10px 12px; border: 1px solid #111111; text-align: center; font-weight: bold; width: 12%;">الكمية</th>
            <th style="padding: 10px 12px; border: 1px solid #111111; text-align: left; font-weight: bold; width: 20%;">سعر الوحدة</th>
            <th style="padding: 10px 12px; border: 1px solid #111111; text-align: left; font-weight: bold; width: 22%;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${productRowsHtml}
        </tbody>
      </table>

      <!-- TOTALS SUMMARY & QR CODE SECTION -->
      <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
        
        <!-- QR CODE & DIGITAL VERIFICATION -->
        <div style="text-align: center; padding: 12px; border: 1px border-dashed #cccccc; border-radius: 10px; background-color: #fafafa; width: 150px; box-sizing: border-box;">
          <img src="${qrCodeUrl}" alt="Invoice QR Code" style="width: 125px; height: 125px; display: block; margin: 0 auto 6px; border-radius: 4px;" />
          <span style="font-size: 10px; font-weight: 800; color: #4b5563; font-family: monospace; display: block;">Invoice-${cleanInvNum}</span>
          <span style="font-size: 9px; color: #9ca3af; display: block; margin-top: 2px;">رمز التحقق الرقمي</span>
        </div>

        <!-- FINANCIAL SUMMARY BOX -->
        <div style="width: 320px; border-top: 2px solid #d4af37; padding-top: 10px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #4b5563;">
            <span>المجموع الفرعي:</span>
            <span style="font-weight: 600;">${subtotal.toLocaleString()} ${currency}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #dc2626; font-weight: 600;">
              <span>إجمالي الخصم:</span>
              <span>-${discount.toLocaleString()} ${currency}</span>
            </div>
          ` : ''}
          ${tax > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #4b5563;">
              <span>الضريبة (14%):</span>
              <span style="font-weight: 600;">${tax.toLocaleString()} ${currency}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 6px; border-top: 1px solid #e5e7eb; font-size: 17px; font-weight: 800; color: #d4af37;">
            <span>الإجمالي النهائي:</span>
            <span>${total.toLocaleString()} ${currency}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #16a34a; font-size: 12px; font-weight: bold;">
            <span>المبلغ المدفوع:</span>
            <span>${paidAmount.toLocaleString()} ${currency}</span>
          </div>
          ${remainingAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #d97706; font-size: 12px; font-weight: bold;">
              <span>المتبقي في الذمة:</span>
              <span>${remainingAmount.toLocaleString()} ${currency}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${invoice.notes ? `
        <div style="margin-top: 20px; padding: 10px 14px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; font-size: 12px; color: #854d0e;">
          <b>📌 ملاحظات:</b> ${invoice.notes}
        </div>
      ` : ''}

      <!-- FOOTER -->
      <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 15px; font-weight: bold;">
        <p style="margin: 0; font-size: 13px; color: #374151;">شكراً لتعاملكم مع كافيه الديب ☕</p>
      </div>

    </div>
  `;

  document.body.appendChild(renderDiv);

  try {
    // Wait brief moment for layout/rendering
    await new Promise((resolve) => setTimeout(resolve, 300));

    const canvas = await safeHtml2Canvas(renderDiv, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 2,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210 mm
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

    if (!pdfBlob || pdfBlob.size === 0) {
      throw new Error('فشل إنشاء ملف الـ PDF الناتج (الملف فارغ).');
    }

    return { pdfBlob, pdfFile, pdfFileName };
  } catch (canvasErr: any) {
    console.error('Error in createInvoicePDF execution:', canvasErr);
    throw new Error(`تعذر تحويل الفاتورة إلى ملف PDF: ${canvasErr?.message || 'خطأ غير معروف'}`);
  } finally {
    if (document.body.contains(renderDiv)) {
      document.body.removeChild(renderDiv);
    }
  }
}

/**
 * Main handler to generate Invoice PDF and send via WhatsApp.
 * Adheres strictly to requirements 1, 2, 3, 4, 5, 6, 7, 8, 9.
 */
export async function shareInvoicePDFToWhatsApp({
  invoice,
  items,
  customer,
  settings,
  phone,
  onStart,
  onSuccess,
  onError,
}: GenerateInvoicePDFOptions): Promise<void> {
  try {
    if (onStart) onStart('جاري تحضير وإنشاء ملف الفاتورة PDF... 📄');

    // 1. Generate PDF with error handling (Requirements 2, 4)
    let pdfResult: { pdfBlob: Blob; pdfFile: File; pdfFileName: string };
    try {
      pdfResult = await createInvoicePDF({
        invoice,
        items,
        customer,
        settings,
      });
    } catch (pdfErr: any) {
      console.error('Failed to create Invoice PDF:', pdfErr);
      const errMsg = pdfErr?.message || 'فشل إنشاء ملف الـ PDF الخاص بالفاتورة';
      if (onError) onError(errMsg);
      return;
    }

    const { pdfBlob, pdfFile, pdfFileName } = pdfResult;

    // 2. Verify PDF creation before attempting to share (Requirement 3)
    if (!pdfBlob || !(pdfBlob instanceof Blob) || pdfBlob.size === 0 || !pdfFile) {
      const errMsg = 'لم يتم إنشاء ملف الفاتورة PDF بنجاح، الملف فارغ أو غير صالح.';
      console.error(errMsg);
      if (onError) onError(errMsg);
      return;
    }

    // Determine target phone number
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

    const message = `مرفق إليكم فاتورة حسابكم.\n\nشكراً لتعاملكم مع كافيه الديب ☕`;
    const encodedText = encodeURIComponent(message);

    const whatsappUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    // 3. Try Native Web Share API if supported by platform/browser
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          title: pdfFileName,
          text: message,
          files: [pdfFile],
        });
        if (onSuccess) onSuccess('تمت مشاركة الفاتورة PDF بنجاح عبر الواتساب! 📱');
        return;
      } catch (shareErr: any) {
        console.log('Native share closed/failed, proceeding to fallback download & WhatsApp launch:', shareErr);
      }
    }

    // 4. Standard Fallback (Requirement 6): Download PDF and open WhatsApp message
    // Step A: Download PDF file automatically
    try {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = pdfFileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } catch (dlErr) {
      console.warn('PDF download link click failed:', dlErr);
    }

    // Step B: Open WhatsApp with message only safely (never navigate window.location to avoid iframe crash)
    let windowOpened = false;
    try {
      const win = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (win) {
        windowOpened = true;
      }
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
        windowOpened = true;
      } catch (waErr) {
        console.warn('WhatsApp anchor link click failed:', waErr);
      }
    }

    // Step C: Provide clear feedback dialog/alert to user
    if (onSuccess) {
      onSuccess(`📄 تم تنزيل ملف الفاتورة (${pdfFileName}) بنجاح وجاري فتح الواتساب. يرجى إرفاق ملف الـ PDF مع الرسالة!`);
    }

  } catch (err: any) {
    console.error('Unhandled error in shareInvoicePDFToWhatsApp:', err);
    if (onError) onError(err?.message || 'حدث خطأ غير متوقع أثناء تصدير الفاتورة كـ PDF للواتساب');
  }
}

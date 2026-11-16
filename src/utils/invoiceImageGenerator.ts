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

const CANVAS_FONT_FAMILY = 'Tahoma, "Segoe UI", Arial, sans-serif';
const CANVAS_MONO_FAMILY = '"Courier New", Consolas, monospace';

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function isPureLtrText(str: string): boolean {
  const s = (str || '').trim();
  if (!s) return false;
  return !/[\u0600-\u06FF]/.test(s) && /[A-Za-z0-9]/.test(s);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  color = '#9ca3af',
  dash: number[] = [4, 4],
  lineWidth = 1
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  const clean = String(text ?? '').trim();
  if (!clean) return [''];
  if (maxWidth <= 20) return [clean];

  ctx.save();
  ctx.font = font;

  const paragraphs = clean.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = '';
        }
        // Handle single very long word/token
        if (ctx.measureText(word).width <= maxWidth) {
          current = word;
        } else {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }

  ctx.restore();
  return lines.length > 0 ? lines : [clean];
}

function drawTextSegment(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  font: string,
  color: string,
  forceDir?: 'rtl' | 'ltr'
) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.direction = forceDir || (isPureLtrText(text) ? 'ltr' : 'rtl');
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Renders the invoice as a high-resolution PNG thermal receipt using pure Canvas 2D
 * for crisp native Arabic HarfBuzz/Skia shaping with zero text or box overlap.
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
  const custName = customer?.full_name || 'عميل عام / نقدي';
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

  const senderPhone = invoice.sender_phone || invoice.senderPhone;
  const referenceNumber = invoice.reference_number || invoice.referenceNumber;

  const logoImg = await loadImageElement(getEldeebLogoDataUrl(300, false, 'gold'));

  // Logical dimensions
  const width = 480;
  const padX = 24;
  const padTop = 22;
  const padBottom = 26;
  const contentW = width - padX * 2;
  const rightX = width - padX;
  const leftX = padX;
  const scale = 2.5;

  // Offscreen measurement context
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('تعذر تهيئة محرك الرسم لإنشاء صورة الفاتورة.');
  }

  //Fonts
  const fMetaLabel = `400 13px ${CANVAS_FONT_FAMILY}`;
  const fMetaValue = `700 13px ${CANVAS_FONT_FAMILY}`;
  const fMetaMono = `700 13px ${CANVAS_MONO_FAMILY}`;
  const fHeaderSub = `400 12px ${CANVAS_FONT_FAMILY}`;
  const fTh = `700 12.5px ${CANVAS_FONT_FAMILY}`;
  const fItemName = `700 13.5px ${CANVAS_FONT_FAMILY}`;
  const fItemBadge = `700 10.5px ${CANVAS_FONT_FAMILY}`;
  const fItemPrice = `400 12px ${CANVAS_FONT_FAMILY}`;
  const fItemPriceBold = `700 12px ${CANVAS_FONT_FAMILY}`;
  const fItemNotes = `400 11px ${CANVAS_FONT_FAMILY}`;
  const fTotalRow = `700 12.5px ${CANVAS_FONT_FAMILY}`;
  const fGrandTotal = `700 15.5px ${CANVAS_FONT_FAMILY}`;
  const fCreditRow = `700 12.5px ${CANVAS_FONT_FAMILY}`;
  const fCreditBold = `700 13px ${CANVAS_FONT_FAMILY}`;
  const fFooter = `700 12.5px ${CANVAS_FONT_FAMILY}`;

  interface MetaEntry {
    label: string;
    value: string;
    valueColor: string;
    valueFont: string;
    valueLines: string[];
    labelWidth: number;
  }

  const rawMeta: Array<{ label: string; value: string; color?: string; font?: string }> = [
    { label: 'رقم الفاتورة:', value: invoice.invoice_number || '', color: '#000000', font: fMetaMono },
    { label: 'تاريخ المعاملة:', value: `${formattedDate} - ${formattedTime}`, color: '#374151', font: fMetaLabel },
    { label: 'الكاشير المسؤول:', value: invoice.cashier_name || 'المدير العام', color: '#000000', font: fMetaValue },
    { label: 'رقم الطاولة:', value: invoice.table_number || 'غير محدد', color: '#000000', font: fMetaValue },
    { label: 'طريقة الدفع:', value: paymentMethodText, color: '#000000', font: fMetaValue },
  ];

  if (invoice.payment_method === 'VODAFONE_CASH') {
    rawMeta.push({
      label: 'الحساب:',
      value: `فودافون كاش (${invoice.payment_number || settings?.vodafone_cash_number || ''})`,
      color: '#b91c1c',
      font: fMetaValue,
    });
  }
  if (invoice.payment_method === 'BANK_TRANSFER') {
    rawMeta.push({
      label: 'الحساب:',
      value: `إنستا باي (${invoice.payment_number || settings?.instapay_number || ''})`,
      color: '#047857',
      font: fMetaValue,
    });
  }
  if (senderPhone) {
    rawMeta.push({ label: 'رقم المحول:', value: String(senderPhone), color: '#000000', font: fMetaMono });
  }
  if (referenceNumber) {
    rawMeta.push({ label: 'رقم المرجع:', value: String(referenceNumber), color: '#1f2937', font: fMetaMono });
  }
  rawMeta.push({ label: 'حالة السداد:', value: paymentStatusLabel, color: paymentStatusColor, font: fMetaValue });
  if (invoice.customer_id) {
    rawMeta.push({ label: 'العميل:', value: custName, color: '#000000', font: fMetaValue });
  }

  const metaEntries: MetaEntry[] = rawMeta.map((m) => {
    mCtx.font = fMetaLabel;
    const labelWidth = mCtx.measureText(m.label).width;
    const availW = Math.max(80, contentW - labelWidth - 10);
    const valFont = m.font || fMetaValue;
    const valueLines = wrapCanvasText(mCtx, m.value, availW, valFont);
    return {
      label: m.label,
      value: m.value,
      valueColor: m.color || '#111827',
      valueFont: valFont,
      valueLines,
      labelWidth,
    };
  });

  // Prepare Items layout
  const nameColW = contentW * 0.52;
  const qtyColCenterX = leftX + contentW * 0.30 + (contentW * 0.16) / 2;

  interface ComputedItem {
    nameLines: string[];
    isEditedPrice: boolean;
    hasPriceDiff: boolean;
    unitPriceStr: string;
    origPriceStr: string;
    noteLines: string[];
    qtyStr: string;
    totalStr: string;
    origTotalStr: string;
    height: number;
  }

  const computedItems: ComputedItem[] = safeItems.map((item) => {
    const qty = item.quantity || 1;
    const totalPrice = item.total_price ?? 0;
    const unitPrice = item.unit_price ?? (qty > 0 ? totalPrice / qty : totalPrice);
    const origPrice = item.original_price;
    const hasPriceDiff = origPrice !== undefined && origPrice !== null && Math.abs(origPrice - unitPrice) > 0.001;
    const isEditedPrice = Boolean(item.is_price_edited || hasPriceDiff);

    const nameLines = wrapCanvasText(mCtx, item.product_name_ar || 'صنف غير مسمى', nameColW - 8, fItemName);
    const noteLines = item.notes ? wrapCanvasText(mCtx, item.notes, nameColW - 8, fItemNotes) : [];

    const unitPriceStr = `${unitPrice.toLocaleString()} ${currency}`;
    const origPriceStr = hasPriceDiff && origPrice != null ? `${origPrice.toLocaleString()} ${currency}` : '';
    const totalStr = `${totalPrice.toLocaleString()} ${currency}`;
    const origTotalStr = hasPriceDiff && origPrice != null ? `${(origPrice * qty).toLocaleString()} ${currency}` : '';

    let h = 10; // top padding
    h += nameLines.length * 20;
    if (isEditedPrice) h += 22; // badge row directly under/clean
    h += 20; // price line
    if (noteLines.length > 0) h += noteLines.length * 16 + 2;
    h += 10; // bottom padding
    const minLeftH = origTotalStr ? 54 : 38;
    h = Math.max(h, minLeftH);

    return {
      nameLines,
      isEditedPrice,
      hasPriceDiff,
      unitPriceStr,
      origPriceStr,
      noteLines,
      qtyStr: String(qty),
      totalStr,
      origTotalStr,
      height: h,
    };
  });

  // Totals lines
  const subtotalTotalsRows: Array<{ label: string; value: string; color: string; font: string }> = [
    { label: 'المجموع الفرعي:', value: `${subtotal.toLocaleString()} ${currency}`, color: '#4b5563', font: fTotalRow },
  ];
  if (discount > 0) {
    subtotalTotalsRows.push({
      label: 'خصم مباشر:',
      value: `-${discount.toLocaleString()} ${currency}`,
      color: '#dc2626',
      font: fTotalRow,
    });
  }
  subtotalTotalsRows.push({
    label: 'الضريبة (14%):',
    value: `${tax.toLocaleString()} ${currency}`,
    color: '#4b5563',
    font: fTotalRow,
  });

  const postTotalRows: Array<{ label: string; value: string; color: string; font: string }> = [];
  if (isOpenOrDraft) {
    if (paidAmount > 0) {
      postTotalRows.push({
        label: 'المدفوع مسبقاً:',
        value: `${paidAmount.toLocaleString()} ${currency}`,
        color: '#047857',
        font: fTotalRow,
      });
    }
    postTotalRows.push({
      label: 'المطلوب سداده للفاتورة:',
      value: `${Math.max(0, total - paidAmount).toLocaleString()} ${currency}`,
      color: '#b45309',
      font: fCreditBold,
    });
  } else {
    postTotalRows.push({
      label: 'المسدد للفاتورة:',
      value: `${paidAmount.toLocaleString()} ${currency}`,
      color: '#4b5563',
      font: fTotalRow,
    });
    if (remainingAmount > 0) {
      postTotalRows.push({
        label: 'المتبقي من الفاتورة الحالية (آجل):',
        value: `${remainingAmount.toLocaleString()} ${currency}`,
        color: '#d97706',
        font: fTotalRow,
      });
    }
  }

  // Credit box rows
  const creditTopRows: Array<{ label: string; value: string; color: string; font: string }> = [];
  if (hasCreditSummary) {
    creditTopRows.push(
      { label: 'الحساب الآجل السابق:', value: `${prevCredit.toLocaleString()} ${currency}`, color: '#78350f', font: fCreditRow },
      { label: 'الإجمالي (الجديد + الآجل):', value: `${grandTotalWithCredit.toLocaleString()} ${currency}`, color: '#000000', font: fCreditBold }
    );
    if (creditPaidWithInv > 0) {
      creditTopRows.push({
        label: 'المسدد من الآجل السابق:',
        value: `-${creditPaidWithInv.toLocaleString()} ${currency}`,
        color: '#047857',
        font: fCreditRow,
      });
    }
    creditTopRows.push({
      label: 'إجمالي المدفوع الآن:',
      value: `${(paidAmount + creditPaidWithInv).toLocaleString()} ${currency}`,
      color: '#064e3b',
      font: fCreditBold,
    });
  }
  const creditBoxHeight = hasCreditSummary ? 14 + creditTopRows.length * 26 + 10 + 30 + 10 : 0;

  // Returns section
  const totalReturnedAmount = safeReturns.reduce((sum, r) => sum + (r.total_return_amount || 0), 0);
  const netInvoiceTotal = Math.max(0, total - totalReturnedAmount);
  const returnsBoxHeight = safeReturns.length > 0 ? 36 + safeReturns.length * 26 + 10 : 0;

  // Address / Phone lines
  const addressLines = settings?.address ? wrapCanvasText(mCtx, settings.address, contentW, fHeaderSub) : [];
  const phoneLines = settings?.phone ? wrapCanvasText(mCtx, `هاتف: ${settings.phone}`, contentW, fHeaderSub) : [];
  const noteLines = invoice.notes ? wrapCanvasText(mCtx, invoice.notes, contentW - 24, fItemNotes) : [];
  const footerLines = wrapCanvasText(
    mCtx,
    settings?.receipt_footer || 'شكراً لتعاملكم مع كافيه الديب ☕',
    contentW,
    fFooter
  );

  // Measure total height cleanly
  let totalH = padTop;
  const logoDrawSize = logoImg ? 185 : 0;
  if (logoImg) totalH += logoDrawSize + 8;
  totalH += addressLines.length * 18;
  totalH += phoneLines.length * 18;
  totalH += 16; // dashed line gap

  // Meta
  totalH += 10;
  for (const m of metaEntries) {
    totalH += m.valueLines.length * 22;
  }
  totalH += 14;

  // Items header + items
  totalH += 34;
  if (computedItems.length > 0) {
    for (const it of computedItems) totalH += it.height;
  } else {
    totalH += 44;
  }
  totalH += 14;

  // Totals
  totalH += 10;
  totalH += subtotalTotalsRows.length * 24;
  totalH += 12; // dotted line + gap
  totalH += 28; // main total row
  totalH += postTotalRows.length * 24;
  if (hasCreditSummary) {
    totalH += 14 + creditBoxHeight + 6;
  }
  totalH += 14;

  // Returns
  if (safeReturns.length > 0) {
    totalH += 12 + returnsBoxHeight + 56 + 14;
  }

  // Invoice Notes
  if (noteLines.length > 0) {
    totalH += 10 + 22 + (noteLines.length * 18 + 16) + 14;
  }

  // Footer
  totalH += 14 + footerLines.length * 20 + padBottom;

  // Create HiDPI output canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء لوحة الرسم الخاصة بالفاتورة.');
  }

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalH);

  let y = padTop;

  // 1. Header Branding
  if (logoImg) {
    const aspect = logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0
      ? logoImg.naturalHeight / logoImg.naturalWidth
      : 1;
    const drawW = logoDrawSize;
    const drawH = Math.min(logoDrawSize, Math.round(drawW * aspect));
    ctx.drawImage(logoImg, (width - drawW) / 2, y, drawW, drawH);
    y += drawH + 10;
  }

  for (const line of addressLines) {
    drawTextSegment(ctx, line, width / 2, y + 9, 'center', fHeaderSub, '#4b5563', 'rtl');
    y += 18;
  }
  for (const line of phoneLines) {
    drawTextSegment(ctx, line, width / 2, y + 9, 'center', fHeaderSub, '#4b5563', 'rtl');
    y += 18;
  }

  y += 10;
  drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
  y += 14;

  // 2. Metadata
  for (const m of metaEntries) {
    drawTextSegment(ctx, m.label, rightX, y + 10, 'right', fMetaLabel, '#374151', 'rtl');
    const valX = rightX - m.labelWidth - 8;
    for (let li = 0; li < m.valueLines.length; li++) {
      const lineTxt = m.valueLines[li];
      drawTextSegment(
        ctx,
        lineTxt,
        valX,
        y + 10 + li * 22,
        'right',
        m.valueFont,
        m.valueColor,
        isPureLtrText(lineTxt) ? 'ltr' : 'rtl'
      );
    }
    y += m.valueLines.length * 22;
  }

  y += 10;
  drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
  y += 12;

  // 3. Items Table Header
  drawTextSegment(ctx, 'الصنف', rightX, y + 10, 'right', fTh, '#1f2937', 'rtl');
  drawTextSegment(ctx, 'الكمية', qtyColCenterX, y + 10, 'center', fTh, '#1f2937', 'rtl');
  drawTextSegment(ctx, 'الإجمالي', leftX, y + 10, 'left', fTh, '#1f2937', 'rtl');
  y += 26;
  drawDashedLine(ctx, leftX, rightX, y, '#e5e7eb', [], 1);
  y += 4;

  // 4. Items Rows
  if (computedItems.length === 0) {
    drawTextSegment(ctx, 'لا توجد أصناف في هذه الفاتورة', width / 2, y + 20, 'center', fHeaderSub, '#6b7280', 'rtl');
    y += 44;
  } else {
    computedItems.forEach((it, idx) => {
      const rowTop = y;
      let curY = rowTop + 10;

      // Item name
      for (const line of it.nameLines) {
        drawTextSegment(ctx, line, rightX, curY + 9, 'right', fItemName, '#111827', 'rtl');
        curY += 20;
      }

      // Custom Price Badge
      if (it.isEditedPrice) {
        ctx.save();
        ctx.font = fItemBadge;
        const badgeTxt = 'سعر مخصص';
        const bw = ctx.measureText(badgeTxt).width + 14;
        const bh = 18;
        const bx = rightX - bw;
        const by = curY;
        ctx.fillStyle = '#fef3c7';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        drawRoundedRectPath(ctx, bx, by, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        drawTextSegment(ctx, badgeTxt, bx + bw / 2, by + bh / 2 + 0.5, 'center', fItemBadge, '#b45309', 'rtl');
        curY += 22;
      }

      // Unit Price (+ strikethrough original price if edited)
      if (it.isEditedPrice && it.hasPriceDiff && it.origPriceStr) {
        drawTextSegment(ctx, it.unitPriceStr, rightX, curY + 9, 'right', fItemPriceBold, '#b45309', 'rtl');
        ctx.save();
        ctx.font = fItemPriceBold;
        const newPW = ctx.measureText(it.unitPriceStr).width;
        ctx.font = fItemPrice;
        const origPW = ctx.measureText(it.origPriceStr).width;
        ctx.restore();

        const origRightX = rightX - newPW - 10;
        drawTextSegment(ctx, it.origPriceStr, origRightX, curY + 9, 'right', fItemPrice, '#9ca3af', 'rtl');
        ctx.save();
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(origRightX - origPW, curY + 9);
        ctx.lineTo(origRightX, curY + 9);
        ctx.stroke();
        ctx.restore();
      } else {
        drawTextSegment(ctx, it.unitPriceStr, rightX, curY + 9, 'right', fItemPrice, '#6b7280', 'rtl');
      }
      curY += 20;

      // Item Notes
      for (const nLine of it.noteLines) {
        drawTextSegment(ctx, nLine, rightX, curY + 8, 'right', fItemNotes, '#92400e', 'rtl');
        curY += 16;
      }

      // Qty (vertically centered in item row)
      const rowMidY = rowTop + it.height / 2;
      drawTextSegment(ctx, it.qtyStr, qtyColCenterX, rowMidY, 'center', fItemName, '#111827', 'ltr');

      // Left column: Total price (+ strikethrough original total)
      if (it.origTotalStr) {
        drawTextSegment(ctx, it.totalStr, leftX, rowMidY - 8, 'left', fItemName, '#b45309', 'rtl');
        drawTextSegment(ctx, it.origTotalStr, leftX, rowMidY + 11, 'left', fItemNotes, '#9ca3af', 'rtl');
        ctx.save();
        ctx.font = fItemNotes;
        const origTotW = ctx.measureText(it.origTotalStr).width;
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(leftX, rowMidY + 11);
        ctx.lineTo(leftX + origTotW, rowMidY + 11);
        ctx.stroke();
        ctx.restore();
      } else {
        drawTextSegment(ctx, it.totalStr, leftX, rowMidY, 'left', fItemName, '#111827', 'rtl');
      }

      y += it.height;
      if (idx < computedItems.length - 1) {
        drawDashedLine(ctx, leftX, rightX, y, '#f3f4f6', [], 1);
      }
    });
  }

  y += 6;
  drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
  y += 14;

  // 5. Totals Section
  for (const r of subtotalTotalsRows) {
    drawTextSegment(ctx, r.label, rightX, y + 10, 'right', r.font, r.color, 'rtl');
    drawTextSegment(ctx, r.value, leftX, y + 10, 'left', r.font, r.color, 'rtl');
    y += 24;
  }

  y += 4;
  drawDashedLine(ctx, leftX, rightX, y, '#d1d5db', [2, 3], 1);
  y += 12;

  const mainTotalLabel = hasCreditSummary
    ? 'حساب الفاتورة الجديدة:'
    : isOpenOrDraft
    ? 'إجمالي الفاتورة المفتوحة:'
    : 'الإجمالي النهائي:';
  drawTextSegment(ctx, mainTotalLabel, rightX, y + 11, 'right', fGrandTotal, '#000000', 'rtl');
  drawTextSegment(ctx, `${total.toLocaleString()} ${currency}`, leftX, y + 11, 'left', fGrandTotal, '#000000', 'rtl');
  y += 28;

  for (const r of postTotalRows) {
    drawTextSegment(ctx, r.label, rightX, y + 10, 'right', r.font, r.color, 'rtl');
    drawTextSegment(ctx, r.value, leftX, y + 10, 'left', r.font, r.color, 'rtl');
    y += 24;
  }

  // 6. Yellow Credit Summary Box (explicitly measured & separated so zero borders collide!)
  if (hasCreditSummary) {
    y += 12;
    const boxX = leftX;
    const boxY = y;
    const boxW = contentW;
    const boxH = creditBoxHeight;
    const innerRight = rightX - 12;
    const innerLeft = leftX + 12;

    ctx.save();
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 1.5;
    drawRoundedRectPath(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    let cy = boxY + 14;
    for (const cr of creditTopRows) {
      drawTextSegment(ctx, cr.label, innerRight, cy + 10, 'right', cr.font, cr.color, 'rtl');
      drawTextSegment(ctx, cr.value, innerLeft, cy + 10, 'left', cr.font, cr.color, 'rtl');
      cy += 26;
    }

    cy += 4;
    drawDashedLine(ctx, innerLeft, innerRight, cy, '#fcd34d', [], 1);
    cy += 10;

    const remColor = remCreditAfter > 0 ? '#b91c1c' : '#047857';
    const remText =
      remCreditAfter > 0
        ? `${remCreditAfter.toLocaleString()} ${currency}`
        : `0 ${currency} (خالص)`;
    drawTextSegment(ctx, 'الحساب الآجل المتبقي على العميل:', innerRight, cy + 11, 'right', fCreditBold, remColor, 'rtl');
    drawTextSegment(ctx, remText, innerLeft, cy + 11, 'left', fCreditBold, remColor, 'rtl');

    y = boxY + boxH + 6;
  }

  y += 10;
  drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
  y += 12;

  // 7. Returns Box (if any)
  if (safeReturns.length > 0) {
    const boxY = y;
    const boxH = returnsBoxHeight;
    const innerRight = rightX - 12;
    const innerLeft = leftX + 12;

    ctx.save();
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    drawRoundedRectPath(ctx, leftX, boxY, contentW, boxH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    let ry = boxY + 12;
    drawTextSegment(ctx, '🔄 تفاصيل عمليات المرتجع:', innerRight, ry + 10, 'right', fCreditBold, '#b45309', 'rtl');
    ry += 24;

    for (const ret of safeReturns) {
      drawDashedLine(ctx, innerLeft, innerRight, ry, '#fde68a', [3, 3], 1);
      ry += 6;
      drawTextSegment(ctx, `إيصال مرتجع: ${ret.return_number}`, innerRight, ry + 9, 'right', fCreditRow, '#1f2937', 'rtl');
      drawTextSegment(ctx, `-${(ret.total_return_amount || 0).toLocaleString()} ${currency}`, innerLeft, ry + 9, 'left', fCreditRow, '#dc2626', 'rtl');
      ry += 20;
    }

    y = boxY + boxH + 10;
    drawTextSegment(ctx, 'إجمالي المبالغ المسترجعة:', rightX, y + 10, 'right', fCreditBold, '#d97706', 'rtl');
    drawTextSegment(ctx, `-${totalReturnedAmount.toLocaleString()} ${currency}`, leftX, y + 10, 'left', fCreditBold, '#d97706', 'rtl');
    y += 24;
    drawDashedLine(ctx, leftX, rightX, y, '#d1d5db', [2, 3], 1);
    y += 8;
    drawTextSegment(ctx, 'صافي قيمة الفاتورة بعد الارتجاع:', rightX, y + 10, 'right', fCreditBold, '#059669', 'rtl');
    drawTextSegment(ctx, `${netInvoiceTotal.toLocaleString()} ${currency}`, leftX, y + 10, 'left', fCreditBold, '#059669', 'rtl');
    y += 26;
    drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
    y += 12;
  }

  // 8. Invoice Notes (if any)
  if (noteLines.length > 0) {
    drawTextSegment(ctx, '📌 ملاحظات الفاتورة:', rightX, y + 10, 'right', fCreditRow, '#000000', 'rtl');
    y += 22;
    const nBoxH = noteLines.length * 18 + 14;
    ctx.save();
    ctx.fillStyle = '#f9fafb';
    drawRoundedRectPath(ctx, leftX, y, contentW, nBoxH, 6);
    ctx.fill();
    ctx.restore();
    let ny = y + 8;
    for (const nLine of noteLines) {
      drawTextSegment(ctx, nLine, rightX - 10, ny + 8, 'right', fItemNotes, '#4b5563', 'rtl');
      ny += 18;
    }
    y += nBoxH + 10;
    drawDashedLine(ctx, leftX, rightX, y, '#9ca3af');
    y += 14;
  }

  // 9. Footer
  for (const fLine of footerLines) {
    drawTextSegment(ctx, fLine, width / 2, y + 10, 'center', fFooter, '#4b5563', 'rtl');
    y += 20;
  }

  const imageBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
  );

  if (!imageBlob || imageBlob.size === 0) {
    throw new Error('فشل إنشاء صورة الفاتورة (الملف فارغ).');
  }

  const imageFile = new File([imageBlob], imageFileName, { type: 'image/png' });
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  return { imageBlob, imageFile, imageFileName, dataUrl };
}

/**
 * Generates an image of the receipt and shares it to WhatsApp.
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
    const invTotal = invoice.total ?? 0;
    const invPaid = invoice.paid_amount ?? 0;
    const invRemaining = invoice.remaining_amount ?? (isOpenOrDraft ? Math.max(0, invTotal - invPaid) : 0);
    const hasRegisteredCustomer = Boolean(customer && customer.id !== 'c_general');
    const currentCustomerDebt = hasRegisteredCustomer ? Math.max(0, customer?.current_balance || 0) : 0;

    const msgLines: string[] = [];
    if (isOpenOrDraft) {
      msgLines.push(
        `مرفق إليكم صورة الفاتورة المفتوحة رقم ${invoice.invoice_number} (قبل الدفع) بقيمة ${invTotal.toLocaleString()} ${currency}.`
      );
      const prevCredit = invoice.previous_credit_balance ?? currentCustomerDebt;
      const grandTotalWithCredit = invoice.grand_total_with_credit ?? (invRemaining + prevCredit);
      if (prevCredit > 0) {
        msgLines.push(`📌 الحساب الآجل السابق: ${prevCredit.toLocaleString()} ${currency}`);
        msgLines.push(`💰 إجمالي المطلوب (الفاتورة + الآجل): ${grandTotalWithCredit.toLocaleString()} ${currency}`);
      }
    } else {
      msgLines.push(
        `مرفق إليكم صورة فاتورتكم رقم ${invoice.invoice_number} بقيمة ${invTotal.toLocaleString()} ${currency}.`
      );
      const hasCreditSnapshot =
        invoice.previous_credit_balance !== undefined &&
        ((invoice.previous_credit_balance || 0) > 0 ||
          (invoice.credit_paid_with_invoice || 0) > 0 ||
          (invoice.remaining_credit_after_invoice || 0) > 0);

      if (hasCreditSnapshot) {
        const prevCredit = invoice.previous_credit_balance ?? 0;
        const creditPaid = invoice.credit_paid_with_invoice ?? 0;
        const remCreditAfter =
          invoice.remaining_credit_after_invoice ??
          Math.max(0, prevCredit - creditPaid + invRemaining);

        if (prevCredit > 0) {
          msgLines.push(`📌 الحساب الآجل السابق: ${prevCredit.toLocaleString()} ${currency}`);
        }
        if (creditPaid > 0) {
          msgLines.push(`✅ المسدد من الآجل مع الفاتورة: ${creditPaid.toLocaleString()} ${currency}`);
        }
        msgLines.push(
          remCreditAfter > 0
            ? `💳 الحساب الآجل المتبقي على العميل: ${remCreditAfter.toLocaleString()} ${currency}`
            : `💳 الحساب الآجل المتبقي على العميل: 0 ${currency} (خالص)`
        );
      } else if (currentCustomerDebt > 0) {
        msgLines.push(`📌 الحساب الآجل الحالي على العميل: ${currentCustomerDebt.toLocaleString()} ${currency}`);
      } else if (invRemaining > 0) {
        msgLines.push(`📌 المتبقي آجل على الفاتورة: ${invRemaining.toLocaleString()} ${currency}`);
      }
    }

    msgLines.push('', 'شكراً لتعاملكم مع كافيه الديب ☕');
    const message = msgLines.join('\n');
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

    // 3. Fallback: Copy PNG to clipboard
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

/**
 * Renders the customer account statement as a crisp high-DPI PNG image using Canvas 2D (never PDF).
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
  const safeNameForFile =
    (customer.full_name || 'customer')
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

  const logoImg = await loadImageElement(getEldeebLogoDataUrl(300, false, 'gold'));

  const width = 660;
  const padX = 24;
  const padTop = 24;
  const padBottom = 24;
  const contentW = width - padX * 2;
  const rightX = width - padX;
  const leftX = padX;
  const scale = 2.2;

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('تعذر تهيئة محرك الرسم لإنشاء صورة كشف الحساب.');
  }

  const fTitle = `700 21px ${CANVAS_FONT_FAMILY}`;
  const fSubGold = `700 13.5px ${CANVAS_FONT_FAMILY}`;
  const fMeta = `400 12px ${CANVAS_FONT_FAMILY}`;
  const fCardLabel = `700 12.5px ${CANVAS_FONT_FAMILY}`;
  const fCardBold = `700 13.5px ${CANVAS_FONT_FAMILY}`;
  const fSecHeading = `700 13.5px ${CANVAS_FONT_FAMILY}`;
  const fTh = `700 12px ${CANVAS_FONT_FAMILY}`;
  const fTd = `400 11.5px ${CANVAS_FONT_FAMILY}`;
  const fTdBold = `700 11.5px ${CANVAS_FONT_FAMILY}`;
  const fTdMono = `400 11px ${CANVAS_MONO_FAMILY}`;
  const fTotalFinal = `700 15.5px ${CANVAS_FONT_FAMILY}`;
  const fFooter = `700 11px ${CANVAS_FONT_FAMILY}`;

  const addressLines = settings?.address ? wrapCanvasText(mCtx, settings.address, contentW, fMeta) : [];
  const phoneLines = settings?.phone ? wrapCanvasText(mCtx, `هاتف: ${settings.phone}`, contentW, fMeta) : [];

  // Table columns (RTL right to left):
  // Date (86) | Desc (flex) | Debit (88) | Credit (88) | Balance (94)
  const colBalW = 94;
  const colCreW = 88;
  const colDebW = 88;
  const colDateW = 88;
  const colDescW = contentW - (colBalW + colCreW + colDebW + colDateW);

  const colDateRight = rightX;
  const colDescRight = colDateRight - colDateW;
  const colDebRight = colDescRight - colDescW;
  const colCreRight = colDebRight - colDebW;
  const colBalRight = colCreRight - colCreW; // = leftX + colBalW

  interface TableRowData {
    date: string;
    descLines: string[];
    debitStr: string;
    creditStr: string;
    balanceStr: string;
    isStarting?: boolean;
    height: number;
  }

  const tableRows: TableRowData[] = [];
  if (startingBalance !== 0 || rows.length === 0) {
    const descLines = wrapCanvasText(mCtx, 'الرصيد السابق / المرحل', colDescW - 14, fTdBold);
    tableRows.push({
      date: '-',
      descLines,
      debitStr: startingBalance > 0 ? `${startingBalance.toLocaleString()} ${currency}` : '-',
      creditStr: startingBalance < 0 ? `${Math.abs(startingBalance).toLocaleString()} ${currency}` : '-',
      balanceStr: `${startingBalance.toLocaleString()} ${currency}`,
      isStarting: true,
      height: Math.max(32, descLines.length * 18 + 14),
    });
  }

  for (const rec of rows) {
    const descLines = wrapCanvasText(mCtx, rec.desc, colDescW - 14, fTdBold);
    tableRows.push({
      date: rec.date,
      descLines,
      debitStr: rec.debit > 0 ? `${rec.debit.toLocaleString()} ${currency}` : '-',
      creditStr: rec.credit > 0 ? `${rec.credit.toLocaleString()} ${currency}` : '-',
      balanceStr: `${rec.balance.toLocaleString()} ${currency}`,
      isStarting: false,
      height: Math.max(32, descLines.length * 18 + 14),
    });
  }

  const footerText =
    settings?.statement_footer ||
    'هذا الكشف صادر آلياً من نظام كافيه الديب POS الملوكي ولا يحتاج لتوقيع.';
  const footerLines = wrapCanvasText(mCtx, footerText, contentW, fFooter);

  // Measure height
  let totalH = padTop;
  const logoDrawSize = logoImg ? 150 : 0;
  if (logoImg) totalH += logoDrawSize + 10;
  totalH += 28; // cafeName
  totalH += 22; // subtitle
  totalH += addressLines.length * 18;
  totalH += phoneLines.length * 18;
  totalH += 20; // todayStr
  totalH += 14 + 14; // divider + gap

  const summaryCardH = 128;
  totalH += summaryCardH + 16;

  // Ledger heading
  totalH += 26;
  const theadH = 32;
  totalH += theadH;
  for (const tr of tableRows) totalH += tr.height;
  totalH += 16;

  const totalsCardH = 126;
  totalH += totalsCardH + 16;

  // Footer
  totalH += 14 + footerLines.length * 18 + 22 + padBottom;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر إنشاء لوحة الرسم الخاصة بكشف الحساب.');
  }
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalH);

  let y = padTop;

  // Header
  if (logoImg) {
    const aspect = logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0
      ? logoImg.naturalHeight / logoImg.naturalWidth
      : 1;
    const drawH = Math.min(logoDrawSize, Math.round(logoDrawSize * aspect));
    ctx.drawImage(logoImg, (width - logoDrawSize) / 2, y, logoDrawSize, drawH);
    y += drawH + 10;
  }

  drawTextSegment(ctx, cafeName, width / 2, y + 12, 'center', fTitle, '#111827', 'rtl');
  y += 28;
  drawTextSegment(
    ctx,
    'كشف حساب عميل تفصيلي (الآجل والذمم المالية)',
    width / 2,
    y + 10,
    'center',
    fSubGold,
    '#b45309',
    'rtl'
  );
  y += 22;
  for (const aLine of addressLines) {
    drawTextSegment(ctx, aLine, width / 2, y + 9, 'center', fMeta, '#4b5563', 'rtl');
    y += 18;
  }
  for (const pLine of phoneLines) {
    drawTextSegment(ctx, pLine, width / 2, y + 9, 'center', fMeta, '#4b5563', 'rtl');
    y += 18;
  }
  drawTextSegment(ctx, `تاريخ الاستخراج: ${todayStr} - ${timeStr}`, width / 2, y + 10, 'center', fMeta, '#6b7280', 'rtl');
  y += 22;

  drawDashedLine(ctx, leftX, rightX, y, '#d4af37', [5, 4], 2);
  y += 14;

  // Customer Summary Card
  ctx.save();
  ctx.fillStyle = '#f9fafb';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  drawRoundedRectPath(ctx, leftX, y, contentW, summaryCardH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const cardInnerRight = rightX - 14;
  const cardInnerLeft = leftX + 14;
  let sy = y + 18;

  drawTextSegment(ctx, 'اسم العميل:', cardInnerRight, sy, 'right', fCardLabel, '#4b5563', 'rtl');
  drawTextSegment(
    ctx,
    `${customer.full_name}${customer.is_vip ? ' ⭐' : ''}`,
    cardInnerLeft,
    sy,
    'left',
    fCardBold,
    '#111827',
    'rtl'
  );
  sy += 24;

  const phoneVal = customer.phone || customer.whatsapp || 'غير مدخل';
  drawTextSegment(ctx, 'رقم الهاتف:', cardInnerRight, sy, 'right', fCardLabel, '#4b5563', 'rtl');
  drawTextSegment(ctx, phoneVal, cardInnerLeft, sy, 'left', fCardLabel, '#111827', isPureLtrText(phoneVal) ? 'ltr' : 'rtl');
  sy += 24;

  drawTextSegment(ctx, 'رصيد المحفظة:', cardInnerRight, sy, 'right', fCardLabel, '#4b5563', 'rtl');
  drawTextSegment(ctx, `${(customer.wallet_balance || 0).toLocaleString()} ${currency}`, cardInnerLeft, sy, 'left', fCardBold, '#b45309', 'rtl');
  sy += 16;

  drawDashedLine(ctx, cardInnerLeft, cardInnerRight, sy, '#d1d5db', [3, 3], 1);
  sy += 18;

  const endColor = endingBalance > 0 ? '#dc2626' : '#059669';
  drawTextSegment(ctx, 'المديونية الحالية المستحقة:', cardInnerRight, sy, 'right', fCardBold, '#111827', 'rtl');
  drawTextSegment(ctx, `${endingBalance.toLocaleString()} ${currency}`, cardInnerLeft, sy, 'left', fTotalFinal, endColor, 'rtl');

  y += summaryCardH + 16;

  // Ledger Section Heading
  ctx.save();
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(rightX - 4, y + 2, 4, 18);
  ctx.restore();
  drawTextSegment(ctx, 'سجل الحركات التفصيلي', rightX - 12, y + 11, 'right', fSecHeading, '#111827', 'rtl');
  y += 26;

  // Table Header
  ctx.save();
  ctx.fillStyle = '#111827';
  ctx.fillRect(leftX, y, contentW, theadH);
  ctx.restore();

  const thMidY = y + theadH / 2;
  drawTextSegment(ctx, 'التاريخ', colDateRight - colDateW / 2, thMidY, 'center', fTh, '#ffffff', 'rtl');
  drawTextSegment(ctx, 'البيان / العملية', colDescRight - 8, thMidY, 'right', fTh, '#ffffff', 'rtl');
  drawTextSegment(ctx, 'عليه (+)', colDebRight - colDebW / 2, thMidY, 'center', fTh, '#ffffff', 'rtl');
  drawTextSegment(ctx, 'له (-)', colCreRight - colCreW / 2, thMidY, 'center', fTh, '#ffffff', 'rtl');
  drawTextSegment(ctx, 'الرصيد', colBalRight - colBalW / 2, thMidY, 'center', fTh, '#ffffff', 'rtl');
  y += theadH;

  // Table Rows
  tableRows.forEach((tr, idx) => {
    const rowTop = y;
    const bg = tr.isStarting ? '#fffbeb' : idx % 2 === 0 ? '#ffffff' : '#f9fafb';

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(leftX, rowTop, contentW, tr.height);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(leftX, rowTop, contentW, tr.height);

    // Vertical borders
    for (const vx of [colDescRight, colDebRight, colCreRight, colBalRight]) {
      ctx.beginPath();
      ctx.moveTo(vx, rowTop);
      ctx.lineTo(vx, rowTop + tr.height);
      ctx.stroke();
    }
    ctx.restore();

    const midY = rowTop + tr.height / 2;
    drawTextSegment(ctx, tr.date, colDateRight - colDateW / 2, midY, 'center', fTdMono, '#4b5563', 'ltr');

    let dy = rowTop + 14;
    for (const dLine of tr.descLines) {
      drawTextSegment(
        ctx,
        dLine,
        colDescRight - 7,
        dy,
        'right',
        tr.isStarting ? fTdBold : fTd,
        tr.isStarting ? '#92400e' : '#111827',
        'rtl'
      );
      dy += 18;
    }

    drawTextSegment(ctx, tr.debitStr, colDebRight - colDebW / 2, midY, 'center', fTdBold, '#b91c1c', tr.debitStr === '-' ? 'ltr' : 'rtl');
    drawTextSegment(ctx, tr.creditStr, colCreRight - colCreW / 2, midY, 'center', fTdBold, '#047857', tr.creditStr === '-' ? 'ltr' : 'rtl');
    drawTextSegment(ctx, tr.balanceStr, colBalRight - colBalW / 2, midY, 'center', fTdBold, '#111827', 'rtl');

    y += tr.height;
  });

  y += 16;

  // Totals Yellow Box
  ctx.save();
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#fcd34d';
  ctx.lineWidth = 1.5;
  drawRoundedRectPath(ctx, leftX, y, contentW, totalsCardH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  let ty = y + 18;
  drawTextSegment(ctx, 'الرصيد السابق:', cardInnerRight, ty, 'right', fCardLabel, '#78350f', 'rtl');
  drawTextSegment(ctx, `${startingBalance.toLocaleString()} ${currency}`, cardInnerLeft, ty, 'left', fCardLabel, '#78350f', 'rtl');
  ty += 24;

  drawTextSegment(ctx, 'إجمالي المشتريات / الإضافات الآجلة:', cardInnerRight, ty, 'right', fCardLabel, '#b91c1c', 'rtl');
  drawTextSegment(ctx, `${totalDebits.toLocaleString()} ${currency}`, cardInnerLeft, ty, 'left', fCardLabel, '#b91c1c', 'rtl');
  ty += 24;

  drawTextSegment(ctx, 'إجمالي المبالغ المسددة:', cardInnerRight, ty, 'right', fCardLabel, '#047857', 'rtl');
  drawTextSegment(ctx, `${totalCredits.toLocaleString()} ${currency}`, cardInnerLeft, ty, 'left', fCardLabel, '#047857', 'rtl');
  ty += 16;

  drawDashedLine(ctx, cardInnerLeft, cardInnerRight, ty, '#f59e0b', [4, 3], 1.5);
  ty += 20;

  const netColor = endingBalance > 0 ? '#b91c1c' : '#047857';
  drawTextSegment(ctx, 'صافي المديونية النهائية المستحقة:', cardInnerRight, ty, 'right', fTotalFinal, netColor, 'rtl');
  drawTextSegment(ctx, `${endingBalance.toLocaleString()} ${currency}`, cardInnerLeft, ty, 'left', fTotalFinal, netColor, 'rtl');

  y += totalsCardH + 16;
  drawDashedLine(ctx, leftX, rightX, y, '#9ca3af', [4, 4], 1);
  y += 14;

  for (const fl of footerLines) {
    drawTextSegment(ctx, fl, width / 2, y + 9, 'center', fFooter, '#6b7280', 'rtl');
    y += 18;
  }
  drawTextSegment(ctx, 'شكراً لتعاملكم الراقي معنا ☕', width / 2, y + 10, 'center', fFooter, '#374151', 'rtl');

  const imageBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0)
  );

  if (!imageBlob || imageBlob.size === 0) {
    throw new Error('فشل إنشاء صورة كشف الحساب (الملف فارغ).');
  }

  const imageFile = new File([imageBlob], imageFileName, { type: 'image/png' });
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  return { imageBlob, imageFile, imageFileName, dataUrl };
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

    // 1. Native Web Share API
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

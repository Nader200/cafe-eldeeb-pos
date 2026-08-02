import { Invoice } from '../types';

/**
 * Normalizes payment method string and returns a user-friendly Arabic display label.
 */
export function getPaymentMethodLabel(invoice?: Partial<Invoice> | null): string {
  if (!invoice) return 'نقدي (كاش)';

  const method = invoice.payment_method;
  const pType = invoice.payment_type;
  const sPhone = invoice.sender_phone || invoice.senderPhone;
  const refNo = invoice.reference_number || invoice.referenceNumber;

  if (method === 'VODAFONE_CASH') {
    return 'فودافون كاش';
  }
  if (method === 'INSTAPAY' || method === 'BANK_TRANSFER') {
    return 'إنستا باي (InstaPay)';
  }
  if (method === 'BANK_CARD' || method === 'CARD') {
    return 'بطاقة بنكية';
  }
  if (method === 'WALLET') {
    return 'محفظة هدايا/رصيد';
  }
  if (method === 'WALLET_SPLIT') {
    return 'محفظة + نقدي';
  }
  if (method === 'CREDIT' || pType === 'CREDIT') {
    return 'ذمم بالآجل';
  }
  if (pType === 'SPLIT') {
    if (method === 'VODAFONE_CASH') return 'فودافون كاش + آجل';
    if (method === 'INSTAPAY' || method === 'BANK_TRANSFER') return 'إنستا باي + آجل';
    return 'دفع مركب (مجزأ)';
  }
  // Fallback check if sender phone or reference number exists
  if (sPhone || refNo) {
    return 'تحويل إلكتروني (فودافون/إنستا باي)';
  }
  return 'نقدي (كاش)';
}

/**
 * Returns Tailwind CSS badge classes for a given payment method.
 */
export function getPaymentMethodBadgeClass(method?: string, pType?: string): string {
  if (method === 'VODAFONE_CASH') return 'bg-red-950/40 text-red-400 border border-red-900';
  if (method === 'INSTAPAY' || method === 'BANK_TRANSFER') return 'bg-emerald-950/40 text-emerald-400 border border-emerald-900';
  if (method === 'BANK_CARD' || method === 'CARD') return 'bg-cyan-950/40 text-cyan-400 border border-cyan-900';
  if (method === 'CREDIT' || pType === 'CREDIT') return 'bg-amber-950/40 text-amber-400 border border-amber-900';
  if (pType === 'SPLIT') return 'bg-purple-950/40 text-purple-400 border border-purple-900';
  return 'bg-emerald-950/30 text-emerald-300 border border-emerald-950';
}

/**
 * Ensures payment method is never saved as CASH if digital payment metadata exists.
 */
export function sanitizePaymentMethod(
  paymentMethod?: string,
  senderPhone?: string,
  referenceNumber?: string,
  receiptImageUrl?: string,
  paymentNumber?: string,
  settingsVodafoneNumber?: string,
  settingsInstapayNumber?: string
): string {
  let method = paymentMethod;

  // If digital payment metadata exists, NEVER allow method to remain CASH or empty
  const hasDigitalData = Boolean(
    (senderPhone && senderPhone.trim().length > 0) ||
    (referenceNumber && referenceNumber.trim().length > 0) ||
    (receiptImageUrl && receiptImageUrl.trim().length > 0) ||
    (paymentNumber && paymentNumber.trim().length > 0)
  );

  if (hasDigitalData && (!method || method === 'CASH')) {
    if (paymentNumber && settingsInstapayNumber && paymentNumber === settingsInstapayNumber) {
      method = 'BANK_TRANSFER';
    } else if (paymentNumber && settingsVodafoneNumber && paymentNumber === settingsVodafoneNumber) {
      method = 'VODAFONE_CASH';
    } else {
      // Default to VODAFONE_CASH if digital metadata exists but method was defaulted to CASH
      method = 'VODAFONE_CASH';
    }
  }

  return method || 'CASH';
}

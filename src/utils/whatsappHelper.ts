import { safeHtml2Canvas } from './html2canvasHelper';

export interface ShareWhatsAppImageOptions {
  elementId: string;
  fileName: string;
  phone?: string;
  message: string;
  onStart?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Robust WhatsApp sharing helper:
 * Converts an HTML element to a canvas PNG image, attempts Web Share API (native mobile image sharing),
 * downloads the PNG, copies it to clipboard if supported, and opens WhatsApp cleanly.
 */
export async function shareElementAsImageToWhatsApp({
  elementId,
  fileName,
  phone,
  message,
  onStart,
  onSuccess,
  onError,
}: ShareWhatsAppImageOptions): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    if (onError) onError('عفواً، تعذر العثور على الإيصال المراد إرساله كصورة!');
    return;
  }

  try {
    if (onStart) onStart('جاري تحضير إيصال الفاتورة كصورة للواتساب... 📸');

    const canvas = await safeHtml2Canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 2,
    });

    let cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) {
      cleanPhone = '2' + cleanPhone;
    } else if (cleanPhone && !cleanPhone.startsWith('20') && cleanPhone.length === 10) {
      cleanPhone = '20' + cleanPhone;
    }

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    canvas.toBlob(async (blob) => {
      if (!blob) {
        if (onError) onError('تعذر إنشاء ملف الصورة، يرجى إعادة المحاولة.');
        return;
      }

      const file = new File([blob], fileName, { type: 'image/png' });

      // 1. Try Web Share API with File Attachment (Native Mobile WhatsApp / System Share)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: fileName,
            text: message,
            files: [file],
          });
          if (onSuccess) onSuccess('تمت مشاركة الفاتورة كصورة بنجاح عبر الواتساب! 📱');
          return;
        } catch (shareErr) {
          console.log('Native share closed/failed, fallback to download and direct link:', shareErr);
        }
      }

      // 2. Fallback: Direct Download of PNG Image
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (dlErr) {
        console.warn('Image download fallback failed:', dlErr);
      }

      // 3. Fallback: Copy Image Blob to Clipboard
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
        }
      } catch (clipErr) {
        console.warn('Clipboard image write failed:', clipErr);
      }

      // 4. Open WhatsApp safely
      let winOpened = false;
      try {
        const win = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        if (win) winOpened = true;
      } catch (e) {
        console.warn('window.open failed:', e);
      }

      if (!winOpened) {
        try {
          const a = document.createElement('a');
          a.href = whatsappUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (e2) {
          console.warn('Anchor link click failed:', e2);
        }
      }

      if (onSuccess) {
        onSuccess('📸 تم تنزيل صورة الفاتورة بهاتفك ونسخها بالحافظة! جاري فتح الواتساب لإرسالها...');
      }
    }, 'image/png');

  } catch (err) {
    console.error('Error sharing image to WhatsApp:', err);
    if (onError) onError('حدث خطأ أثناء محاولة تحويل الفاتورة لصورة، يرجى التكرار.');
  }
}

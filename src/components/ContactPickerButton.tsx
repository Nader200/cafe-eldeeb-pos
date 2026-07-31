import React, { useState } from 'react';
import { BookUser, CheckCircle, AlertCircle, Search, Clipboard, Upload, X, PhoneCall } from 'lucide-react';

interface ContactPickerButtonProps {
  onSelect: (contact: { phone: string; name?: string }) => void;
  currentName?: string;
  buttonText?: string;
  className?: string;
  iconOnly?: boolean;
}

export function cleanPhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  // Remove spaces, hyphens, brackets
  let cleaned = rawPhone.replace(/[^\d+]/g, '');
  // Convert Egyptian +201xxxxxxxxx or 00201xxxxxxxxx to 01xxxxxxxxx
  if (cleaned.startsWith('+201') && cleaned.length === 13) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.startsWith('00201') && cleaned.length === 14) {
    cleaned = '0' + cleaned.substring(4);
  } else if (cleaned.startsWith('+20') && cleaned.length === 13) {
    cleaned = '0' + cleaned.substring(3);
  }
  return cleaned;
}

// Quick sample/demo contacts for instant testing in Web preview
const SAMPLE_CONTACTS = [
  { name: 'أحمد محمود العبد', phone: '01012345678', altPhone: '01122334455' },
  { name: 'المهندس مصطفى كامل', phone: '01234567890' },
  { name: 'شركة البركة للتوريدات', phone: '01555443322' },
  { name: 'محمود حسن الخولي', phone: '01098765432' },
];

export const ContactPickerButton: React.FC<ContactPickerButtonProps> = ({
  onSelect,
  currentName = '',
  buttonText = 'جهات الاتصال',
  className = '',
  iconOnly = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [multiplePhones, setMultiplePhones] = useState<string[]>([]);
  const [pickedName, setPickedName] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handlePickContact = async () => {
    const isSupported = typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in (window as any);

    if (isSupported) {
      try {
        setLoading(true);
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const contacts = await (navigator as any).contacts.select(props, opts);

        if (contacts && contacts.length > 0) {
          const contact = contacts[0];
          const name = contact.name && contact.name.length > 0 ? contact.name[0] : '';
          const rawTels: string[] = contact.tel || [];

          const cleanedTels = Array.from(
            new Set(rawTels.map(t => cleanPhoneNumber(t)).filter(t => t.length > 0))
          );

          if (cleanedTels.length === 0) {
            showToast('⚠️ جهة الاتصال المختارة لا تحتوي على رقم هاتف مسجل');
          } else if (cleanedTels.length === 1) {
            onSelect({
              phone: cleanedTels[0],
              name: !currentName.trim() ? name : undefined,
            });
            showToast(`✨ تم استيراد (${name || cleanedTels[0]}) بنجاح`);
          } else {
            // Multiple phone numbers found
            setPickedName(name);
            setMultiplePhones(cleanedTels);
          }
          return;
        }
      } catch (err: any) {
        if (err.name === 'SecurityError' || err.name === 'NotAllowedError' || err.name === 'InvalidStateError') {
          console.warn('Contacts API not permitted in iframe/browser context, using fallback dialog:', err);
        } else if (err.name === 'AbortError') {
          // User closed native picker without selecting
          return;
        }
      } finally {
        setLoading(false);
      }
    }

    // Fallback: If Web Contacts API is unsupported or blocked by iframe context
    setShowFallbackModal(true);
  };

  const handleChoosePhone = (phone: string, name?: string) => {
    onSelect({
      phone,
      name: !currentName.trim() ? (name || pickedName) : undefined,
    });
    setMultiplePhones([]);
    setShowFallbackModal(false);
    showToast(`✨ تم اختيار (${name || phone}) بنجاح`);
  };

  // Parse text pasted or typed into fallback dialog
  const handleParsePaste = () => {
    if (!pasteText.trim()) return;
    const phoneMatch = pasteText.match(/(?:\+20|0020|0)?1[0125]\d{8}/g) || pasteText.match(/\d{8,14}/g);
    const cleanedPhone = phoneMatch ? cleanPhoneNumber(phoneMatch[0]) : '';
    
    // Extract non-numeric part as name
    const namePart = pasteText.replace(/[0-9\+\-\(\)\s]/g, ' ').trim();

    if (cleanedPhone) {
      onSelect({
        phone: cleanedPhone,
        name: !currentName.trim() && namePart.length > 2 ? namePart : undefined,
      });
      setShowFallbackModal(false);
      setPasteText('');
      showToast(`✨ تم استخراج البيانات بنجاح: ${cleanedPhone}`);
    } else {
      showToast('⚠️ لم يتم العثور على رقم هاتف صالح في النص الملصق');
    }
  };

  // vCard (.vcf) File Parser
  const handleVCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const fnMatch = content.match(/FN:(.+)/i) || content.match(/N:(.+)/i);
      const telMatch = content.match(/TEL.*:(.+)/i);

      const name = fnMatch ? fnMatch[1].replace(/;/g, ' ').trim() : '';
      const rawTel = telMatch ? telMatch[1].trim() : '';
      const cleanedTel = cleanPhoneNumber(rawTel);

      if (cleanedTel) {
        onSelect({
          phone: cleanedTel,
          name: !currentName.trim() ? name : undefined,
        });
        setShowFallbackModal(false);
        showToast(`✨ تم استيراد جهة الاتصال من vCard: ${name || cleanedTel}`);
      } else {
        showToast('⚠️ تعذر العثور على رقم هاتف في ملف vCard');
      }
    };
    reader.readAsText(file);
  };

  const filteredSamples = SAMPLE_CONTACTS.filter(c => 
    c.name.includes(searchQuery) || c.phone.includes(searchQuery)
  );

  return (
    <>
      <button
        type="button"
        onClick={handlePickContact}
        disabled={loading}
        title="استيراد من جهات الاتصال بالهاتف"
        className={
          className ||
          `flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 hover:border-gold-500/60 text-gold-400 hover:text-gold-300 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-50`
        }
      >
        <BookUser className="w-3.5 h-3.5 shrink-0 text-gold-400" />
        {!iconOnly && <span>{buttonText}</span>}
      </button>

      {/* Fallback Selection Modal when inside iFrame or browsers without native Contact Picker */}
      {showFallbackModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-4 sm:p-6 max-w-md w-full shadow-2xl text-right my-auto relative max-h-[90vh] overflow-y-auto">
            
            <button
              type="button"
              onClick={() => setShowFallbackModal(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white transition-all cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3 border-b border-gray-800 pb-3">
              <div className="p-2 bg-gold-500/10 border border-gold-500/20 rounded-xl">
                <BookUser className="w-5 h-5 text-gold-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">سجل جهات الاتصال</h3>
                <p className="text-[10px] text-gray-400">اختر جهة اتصال أو قم بلصق الاسم والرقم</p>
              </div>
            </div>

            {/* Smart Quick Paste Box */}
            <div className="bg-luxury-bg border border-gray-800 rounded-2xl p-3 mb-4">
              <label className="text-[10px] font-bold text-gold-400 block mb-1.5 flex items-center gap-1">
                <Clipboard className="w-3.5 h-3.5" />
                لصق مباشر لاسم ورقم الهاتف
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="مثال: أحمد علي 01012345678"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="flex-1 bg-black/60 border border-gray-800 focus:border-gold-500 text-white rounded-xl px-3 py-1.5 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={handleParsePaste}
                  className="px-3 py-1.5 bg-gold-500 hover:bg-gold-400 text-black font-extrabold rounded-xl text-xs transition-all cursor-pointer shrink-0"
                >
                  استخراج
                </button>
              </div>
            </div>

            {/* Quick Demo Contacts Selector */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-gray-300">جهات اتصال سريعة</span>
                <span className="text-[9px] text-gray-500">اختر للتعبئة التلقائية</span>
              </div>

              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="بحث باسم أو رقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-gray-800 text-white text-xs rounded-xl pr-3 pl-8 py-1.5 outline-none focus:border-gold-500/50"
                />
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pl-1">
                {filteredSamples.map((contact, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-luxury-bg hover:bg-gold-500/10 border border-gray-800/80 hover:border-gold-500/40 rounded-xl flex items-center justify-between transition-all"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{contact.name}</div>
                      <div className="text-[10px] text-gold-400 font-mono" dir="ltr">{contact.phone}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {contact.altPhone ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPickedName(contact.name);
                            setMultiplePhones([contact.phone, contact.altPhone!]);
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-[10px] font-bold hover:bg-amber-500/20 cursor-pointer"
                        >
                          رثمان
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleChoosePhone(contact.phone, contact.name)}
                          className="px-2.5 py-1 bg-gold-500/20 hover:bg-gold-500 border border-gold-500/40 hover:text-black text-gold-300 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <PhoneCall className="w-3 h-3" />
                          اختيار
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* vCard Import Option */}
            <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-[10px] text-gray-400">
              <label className="flex items-center gap-1.5 text-gray-300 hover:text-gold-400 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-gold-500" />
                <span>استيراد ملف (.vcf)</span>
                <input
                  type="file"
                  accept=".vcf,text/vcard"
                  onChange={handleVCardUpload}
                  className="hidden"
                />
              </label>
              <span className="text-[9px] text-gray-500">Android Contact File</span>
            </div>

            <p className="mt-3 text-[9px] text-gray-500 text-center leading-relaxed bg-black/40 p-2 rounded-xl border border-gray-900">
              📱 عند تثبيت التطبيق على هاتف Android كـ (PWA / APK)، سيتم فتح سجل أسماء الهاتف النظامي مباشرة.
            </p>
          </div>
        </div>
      )}

      {/* Multiple Phone Numbers Choice Dialog */}
      {multiplePhones.length > 1 && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-2xl p-5 max-w-xs w-full shadow-2xl text-right my-auto">
            <h4 className="text-xs font-bold text-white mb-1.5 flex items-center gap-2">
              <BookUser className="w-4 h-4 text-gold-500" />
              اختر رقم الهاتف المطلوب
            </h4>
            <p className="text-[10px] text-gray-400 mb-3">
              جهة الاتصال: <span className="text-gold-400 font-bold">{pickedName || 'بدون اسم'}</span> تحتوي على أكثر من رقم:
            </p>
            <div className="space-y-2">
              {multiplePhones.map((phoneNum, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleChoosePhone(phoneNum)}
                  className="w-full py-2 px-3 bg-luxury-bg border border-gray-800 hover:border-gold-500 text-white hover:text-gold-300 rounded-xl text-xs font-mono text-center flex items-center justify-between transition-all cursor-pointer"
                >
                  <span className="dir-ltr font-bold">{phoneNum}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-900 px-2 py-0.5 rounded-md">رقم {idx + 1}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMultiplePhones([])}
              className="w-full mt-3 py-2 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl text-xs text-center cursor-pointer font-bold"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Quick Toast feedback */}
      {toastMessage && (
        <div className="fixed bottom-16 right-1/2 translate-x-1/2 z-[120] bg-[#111111] border border-gold-500/40 text-gold-300 text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 max-w-sm text-center animate-fade-in">
          {toastMessage.includes('⚠️') ? (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
};


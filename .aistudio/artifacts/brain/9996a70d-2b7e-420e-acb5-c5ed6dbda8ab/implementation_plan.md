# خطة حل مشكلة Google OAuth: Error 400: origin_mismatch على نسخة Vercel

## 1. تشخيص سبب المشكلة بدقة
- يظهر الخطأ:
  `الخطأ 400: origin_mismatch`
  `origin=https://cafe-eldeeb-pos.vercel.app flowName=GeneralOAuthFlow`
- **السبب التقني**: عند تشغيل التطبيق على نطاق Vercel الجديد (`https://cafe-eldeeb-pos.vercel.app`)، تقوم مكتبة **Google Identity Services (GIS)** بإرسال عنوان النطاق الحالي (Origin) إلى خوادم Google للمطابقة الأمنية. خوادم Google ترفض الطلب تلقائياً لأن النطاق غير مدرج في قائمة **"الأصول المصرح بها لـ JavaScript" (Authorized JavaScript origins)** الخاصة بـ معرّف العميل (OAuth Client ID).

---

## 2. الإجراءات البرمجية داخل المشروع

### أ. تحسين وتصحيح ملف المصادقة `src/lib/googleDriveService.ts`:
1. **تصحيح أولوية Client ID**:
   - حالياً الكود يجبر استخدام `configClientId` الافتراضي دائماً ويتجاهل أي إعدادات خاصة أو متغيرات بيئة (`VITE_GOOGLE_CLIENT_ID`).
   - سنعيد ترتيب الأولوية لتدعم المتغيرات البيئية والإعدادات المخصصة أولاً، ثم العودة للافتراضي عند عدم توفرها.
2. **إضافة خيار بديل ذكي للمصادقة عبر Firebase Auth Popup**:
   - دعم محاولة الاتصال عبر `signInWithPopup(auth, googleProvider)` كخيار مكمل في حال واجهت مكتبة GIS حظراً للنطاق المباشر.
3. **التقاط أخطاء `origin_mismatch` وترجمتها إلى رسالة واضحة**:
   - إظهار رسالة موجهة وواضحة للمستخدم بدلاً من رسالة الخطأ الغامضة، تشرح ما هو النطاق المطلوب إضافته بالضبط.

### ب. تحديث شاشة النسخ الاحتياطي `src/components/GoogleDriveBackupView.tsx`:
1. إضافة كارت إرشادي تفاعلي يظهر عند حدوث خطأ `origin_mismatch`، يتضمن:
   - عرض النطاق الحالي للموقع تلقائياً (`window.location.origin`).
   - زر سريع بضغطة واحدة: **"نسخ رابط الموقع لإضافته في Google Cloud"**.
   - خطوات واضحة ومختصرة باللغة العربية لكيفية تفعيل الرابط.
2. إضافة حقل اختياري في إعدادات النسخ الاحتياطي يُتيح إدخال **Google Client ID** مخصص في أي وقت إذا أراد المالك استخدام مشروعه الخاص.

---

## 3. الخطوات المتبقية في Google Cloud Console (خلال دقيقة واحدة)
لتفعيل الرابط رسمياً في خوادم Google OAuth:
1. التوجه إلى [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials).
2. في قائمة **OAuth 2.0 Client IDs**، اضغط على معرّف العميل الخاص بالويب المستخدم في التطبيق.
3. تحت قسم **Authorized JavaScript origins (الأصول المعتمدة لـ JavaScript)**، اضغط على **+ ADD URI**.
4. أضف الرابطين التاليين:
   - `https://cafe-eldeeb-pos.vercel.app`
   - `https://cafe-eldeeb-pos.vercel.app/`
5. اضغط على **Save (حفظ)** أسفل الصفحة.
*(ملاحظة: قد تستغرق خوادم Google من دقيقة إلى 5 دقائق لتحديث القائمة المعتمدة عالمياً).*

---

## 4. التحقق والاختبار بعد التنفيذ
- فحص الكود والتأكد من خلوه من أي أخطاء برمجية (`npm run lint`).
- تجربة بناء المشروع للإنتاج (`npm run build`).
- التأكد من سلامة عمل نسخة الأندرويد والويب دون التأثير على أي بيانات حالية أو فواتير.

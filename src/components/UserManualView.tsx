import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lock,
  LayoutDashboard,
  ShoppingCart,
  Coffee,
  ClipboardList,
  Users,
  Briefcase,
  Package,
  Boxes,
  BarChart3,
  TrendingDown,
  Coins,
  Wallet,
  Gamepad2,
  Settings,
  CloudUpload,
  Mail,
  RefreshCw,
  Printer,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  KeyRound,
  FileText,
  AlertCircle,
  Info,
  Sliders,
  Download,
  Eye,
  Zap,
  Award,
  Layers,
  FolderTree,
  ChevronLeft,
  Filter,
  Clock,
  Database,
  ArrowRight
} from 'lucide-react';
import { AuthUser, UserRole } from '../types';

interface UserManualViewProps {
  currentUser?: AuthUser | null;
  onNavigateTab?: (tab: string) => void;
}

export interface ManualSection {
  id: string;
  title: string;
  category: 'core' | 'pos_tables' | 'inventory_prod' | 'finance_reports' | 'system_integrations';
  icon: React.ReactNode;
  badge: string;
  targetRoles: UserRole[]; // Which roles this section is intended for
  summary: string;
  steps: {
    title: string;
    description: string;
    tip?: string;
  }[];
  adminNotes?: string;
  keyboardShortcuts?: { key: string; description: string }[];
}

export default function UserManualView({ currentUser, onNavigateTab }: UserManualViewProps) {
  // Determine actual user role or default to Admin
  const userActualRole: UserRole = (currentUser?.role as UserRole) || 'Admin';

  // State for active role preview filter (Admins can toggle between roles to see what each role experiences)
  const [activeRoleView, setActiveRoleView] = useState<UserRole>(userActualRole);

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Expanded Sections State (Section ID -> boolean)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'login': true,
    'pos_sales': true
  });

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    manualSections.forEach(s => { all[s.id] = true; });
    setExpandedSections(all);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  // Comprehensive Manual Content Engine
  const manualSections: ManualSection[] = [
    // 1. LOGIN & SECURITY
    {
      id: 'login',
      title: 'تسجيل الدخول والأمان وصلاحيات النظام (Login & Security)',
      category: 'core',
      icon: <Lock className="w-5 h-5 text-gold-400" />,
      badge: 'الأمان والصلاحيات',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'آلية تأمين جلسات العمل، تسجيل الدخول برمز PIN السرّي، وإدارة أدوار ومستويات وصول المستخدمين.',
      steps: [
        {
          title: '١. اختيار حساب المستخدم ورمز الـ PIN السرّي',
          description: 'عند تشغيل النظام، اختر اسم الحساب من القائمة المنزلقة وقم بإدخال رمز الـ PIN المكون من ٤ أرقام. الحسابات محمية لمنع التلاعب بالسجلات.',
          tip: 'يمكن للأدمن تعيين رموز PIN فريدة لكل موظف من شاشة شؤون الموظفين.'
        },
        {
          title: '٢. الصلاحيات المستندة للأدوار (RBAC)',
          description: 'يتم تشكيل واجهة النظام تلقائياً حسب الدور: الأدمن ينفذ الإدارة الشاملة والتقارير، الكاشير يركز على نقطة البيع والفواتير والدرج، والبارستا يرى شاشة التحضير الكي دي إس (KDS) فقط.',
          tip: 'محاولة فتح شاشة غير مسموحة تعرض تنبيهاً أمنياً ويعيد النظام توجيهك لشاشتك المخصصة.'
        },
        {
          title: '٣. القفل التلقائي وسجل العمليات الرقمي (Audit Log)',
          description: 'كل عملية ملغاة، تعديل خصم، أو إلغاء فاتورة يتم تسجيلها في الأرشيف المالي باسم الموظف الذي نفذها مع توقيت الدقيقة وساعة العملية.'
        }
      ],
      adminNotes: 'نصيحة المدير: قم بتغيير كلمة سر الأدمن ورمز PIN بشكل دوري من شاشة الإعدادات لحماية البيانات الحساسة.',
      keyboardShortcuts: [
        { key: 'Esc', description: 'قفل الجلسة فوراً أو الخروج من النوافذ' }
      ]
    },

    // 2. DASHBOARD & ENTERPRISE ANALYTICS
    {
      id: 'dashboard',
      title: 'لوحة القيادة والمؤشرات الرقمية والمالية (Dashboard & Analytics)',
      category: 'core',
      icon: <LayoutDashboard className="w-5 h-5 text-gold-400" />,
      badge: 'التحليلات المباشرة',
      targetRoles: ['Admin'],
      summary: 'شاشة المركز الرئيسي لمتابعة المبيعات المباشرة، صافي الأرباح، حركة الطاولات، وأداء الوردية اللحظي.',
      steps: [
        {
          title: '١. بطاقات المؤشرات الماليّة الرئيسية (KPIs)',
          description: 'تعرض إجمالي المبيعات اليومية، صافي الأرباح بعد خصم التكلفة والمصروفات، عدد الفواتير المفتوحة، وحالة الطاولات المشغولة حالياً.',
          tip: 'تتحدث الأرقام لحظياً مع كل عملية بيع جديدة أو تحصيل فاتورة.'
        },
        {
          title: '٢. الرسم البياني للحركة والمنتجات الأكثر مبيعاً',
          description: 'يوضح توزيع المبيعات بالساعات للتعرف على أوقات الذروة، بالإضافة إلى قائمة المشروبات والمأكولات الأكثر طلباً لضبط كميات التجهيز.'
        },
        {
          title: '٣. إشعار الوردية المفتوحة ورصيد الدرج',
          description: 'متابعة نقدية الدرج المتوقعة بناءً على المبيعات النقدية المسجلة وتسهيل عملية التقفيل عند نهاية اليوم.'
        }
      ],
      adminNotes: 'شاشة Dashboard مخصصة فقط لمدير النظام (Admin) لحماية أرقام الأرباح والمؤشرات المالية من الاطلاع العام.'
    },

    // 3. POS SALES & CASH DRAWER
    {
      id: 'pos_sales',
      title: 'نقطة البيع الكاشير وتمرير الطلبات (POS & Order Entry)',
      category: 'pos_tables',
      icon: <ShoppingCart className="w-5 h-5 text-gold-400" />,
      badge: 'الكاشير والمبيعات',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'إدخال الطلبات بسرعة فائقة، إطباق الخصومات، اختيار طرق الدفع، وإرسال بونات التحضير لشاشة البارستا.',
      steps: [
        {
          title: '١. بناء السلة واختيار الأصناف',
          description: 'اضغط على الصنف من الشبكة المقسمة حسب التصنيفات أو ابحث باسم الصنف. يمكنك تعديل الكميات أو إضافة ملاحظات خاصة (مثل: سكر خفيف، حليب دسم، بدون ثلج).',
          tip: 'استخدم البحث السريع بالباركود للوصول الفوري للمنتجات المكتوبة.'
        },
        {
          title: '٢. الخصومات والتعديلات المالية',
          description: 'يمكنك تطبيق خصم بالنسبة المئوية (%) أو بمبلغ ثابت (ج.م) على صنف معين أو على إجمالي الفاتورة مع توثيق سبب الخصم.',
          tip: 'الخصومات الكبيرة فوق الحد المسموح تتطلب الموافقة أو رمز الأدمن.'
        },
        {
          title: '٣. طرق التحصيل والدفع المتاحة',
          description: 'يدعم النظام الدفع النقدي (كاش)، البطاقات (فيزا/شبكة)، الدفع الآجل للعملاء المميزين (على الحساب)، أو الدفع المزدوج (Split Payment).',
          tip: 'عند الدفع النقدي يتم احتساب المبلغ المتبقي للعميل (المتبقي) تلقائياً.'
        },
        {
          title: '٤. إرسال الطلب للبارستا وطباعة الفاتورة',
          description: 'بمجرد تأكيد الطلب أو حفظه كفاتورة مفتوحة، يتم إرسال طلب التحضير تلقائياً لشاشة البارستا والطباعة الحرارية.'
        }
      ],
      keyboardShortcuts: [
        { key: 'F2', description: 'إنهاء الدفع نقداً (كاش)' },
        { key: 'F4', description: 'إرسال بون للبارستا' },
        { key: 'F8', description: 'حفظ كفاتورة مفتوحة' }
      ]
    },

    // 4. OPEN INVOICES & TABLE LIFECYCLE
    {
      id: 'open_invoices',
      title: 'الفواتير المفتوحة والمعلقة وزيادات الخدمة (Open Invoices & Tables)',
      category: 'pos_tables',
      icon: <ClipboardList className="w-5 h-5 text-gold-400" />,
      badge: 'الفواتير والخدمة',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'إدارة طلبات الصالة، حفظ الفواتير المعلقة، دمج ونقل الفواتير، وفصل الحالة التشغيلية عن الحالة المالية.',
      steps: [
        {
          title: '١. حفظ واسترجاع الفواتير المفتوحة',
          description: 'عند حفظ الطلب بدون تحصيل فوري، تظل الفاتورة قائمة داخل شاشة "الفواتير المفتوحة والمعلقة" مع رقم الطاولة واسم العميل.',
          tip: 'لا تضيع الفواتير المفتوحة عند إغلاق الشاشة أو إعادة التشغيل حيث يتم حفظها محلياً وسحابياً.'
        },
        {
          title: '٢. الفصل التام بين الحالة التشغيلية والحالة المالية (قاعدة هامة)',
          description: 'عند تسليم الطلب للعميل ("تم التسليم 🚶")، تتغير الحالة التشغيلية فقط، وتظل الفاتورة قائمة في الفواتير المفتوحة بحالتها المالية (OPEN) لحين تحصيل المبلغ وإغلاقها نهائياً.',
          tip: 'الفاتورة لا تنتقل لأرشيف المبيعات والسجل إلا بعد السداد المالي الكترونياً أو نقداً.'
        },
        {
          title: '٣. عمليات الطاولات (الدمج - التقسيم - النقل)',
          description: 'يمكنك بسهولة نقل صنف من فاتورة لأخرى، دمج فواتير طاولتين معاً، أو نقل فاتورة طاولة بالكامل إلى جلسة بلايستيشن نشطة.'
        }
      ]
    },

    // 5. CREDIT CUSTOMERS & DEBT TRACKING
    {
      id: 'credit_customers',
      title: 'سجل العملاء والآجل والذمم المالية (Credit Customers & Debt)',
      category: 'pos_tables',
      icon: <Users className="w-5 h-5 text-gold-400" />,
      badge: 'الذمم والآجل',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'متابعة حسابات العملاء الآجلة، وضع حدود الائتمان، تسجيل دفيعات السداد، وطباعة كشوف الحساب.',
      steps: [
        {
          title: '١. تعيين سقف الائتمان للعميل',
          description: 'من ملف العميل، حدد الحد الأقصى للديون المسموح بها. عند تجاوز هذا الحد أثناء البيع بالنظام، يظهر تحذير للكاشير.',
          tip: 'يمكن للأدمن فقط استثناء سقف الائتمان وتمرير الفاتورة.'
        },
        {
          title: '٢. تسجيل الدفعات الجزئية والسداد',
          description: 'أدخل شاشة العملاء والذمم، اختر العميل ثم اضغط "تسديد دين". أدخل المبلغ المسدد وطريقة السداد (كاش/تحويل بانكي).',
          tip: 'يتم إصدار سند قبض رسمي فور تسديد أي مبلغ وتحديث رصيد الدين المتبقي.'
        },
        {
          title: '٣. طباعة كشف حساب العميل التفصيلي',
          description: 'استخراج كشف بكافة الفواتير الآجلة، المبالغ المسددة، والتاريخ الزمني للتعاملات لمشاركته مع العميل.'
        }
      ]
    },

    // 6. CUSTOMERS & LOYALTY POINTS
    {
      id: 'customers_loyalty',
      title: 'إدارة العملاء ونقاط الولاء (Customers & Loyalty Program)',
      category: 'pos_tables',
      icon: <Award className="w-5 h-5 text-gold-400" />,
      badge: 'الولاء والعملاء',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'تسجيل بيانات العملاء، تجميع نقاط المشتريات تلقائياً، واستبدال النقاط بخصومات مادية.',
      steps: [
        {
          title: '١. إضافة عميل جديد برقم الهاتف',
          description: 'أثناء البيع في POS، ابحث عن رقم هاتف العميل. إذا لم يكن مسجلاً، اضغط "إضافة عميل" وأدخل الاسم والتليفون.',
          tip: 'ربط الفاتورة برقم الهاتف يراكم نقاط الولاء للعميل تلقائياً.'
        },
        {
          title: '٢. احتساب واستبدال نقاط الولاء',
          description: 'يكتسب العميل نقاطاً مقابل كل جنيهاً ينفقه. عند تجميع حد معين، يمكن للكاشير استبدال النقاط بخصم مباشر من الفاتورة الحالية.'
        }
      ]
    },

    // 7. TABLES & RESERVATION MAP
    {
      id: 'tables_map',
      title: 'خريطة الطاولات ونظام الحجوزات (Hall Tables & Bookings)',
      category: 'pos_tables',
      icon: <FolderTree className="w-5 h-5 text-gold-400" />,
      badge: 'إدارة الصالة',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'عرض تفاعلي لطاولات الكافيه الـ ١٦، متابعة الطاولات المشغولة، وحجز الطاولات مسبقاً مع العربون.',
      steps: [
        {
          title: '١. مؤشرات حالة الطاولة التفاعلية',
          description: 'الأخضر = شاغرة جاهزة للاستقبال 🟩, الأحمر = مشغولة بفاتورة نشطة 🟥, الأزرق = محجوزة مسبقاً 🟦.',
          tip: 'الضغط على أي طاولة مشغولة يفتح فواتيرها المفتوحة مباشرة للتعديل أو التحصيل.'
        },
        {
          title: '٢. حجز طاولات الصالة وتوثيق العربون',
          description: 'اضغط على الطاولة الشاغرة، اختر "حجز الطاولة"، أدخل اسم الحجز، وقت الحضور، ومبلغ العربون المقدم إن وجد.'
        }
      ]
    },

    // 8. PRODUCTS & CATEGORIES
    {
      id: 'products_categories',
      title: 'المنيو وإدارة التصنيفات والمنتجات (Products & Categories)',
      category: 'inventory_prod',
      icon: <Coffee className="w-5 h-5 text-gold-400" />,
      badge: 'المنيو والأصناف',
      targetRoles: ['Admin'],
      summary: 'إضافة الأصناف، تعديل الأسعار، إضافة الصور والباركود، وتنظيم تصنيفات المنيو والأصناف النشطة.',
      steps: [
        {
          title: '١. إنشاء وتنظيم التصنيفات (Categories)',
          description: 'أنشئ تصنيفات مثل (المشروبات الساخنة، المشروبات الباردة، الحلويات، المأكولات) مع تحديد لون تمييزي وأيقونة لكل تصنيف.',
          tip: 'يمكنك ترتيب ظهور التصنيفات في الكاشير بسحب وإفلات العناصر.'
        },
        {
          title: '٢. إضافة وتعديل كروت المنتجات',
          description: 'أدخل اسم المنتج، سعر البيع، تكلفة الشراء، نسبة الضريبة، الباركود، والصورة التوضيحية. يمكنك إيقاف منتج مؤقتاً عند نفاده.',
          tip: 'تحديد تكلفة الصنف بدقة يضمن حساب صافي أرباح الكافيه بصورة متناهية الدقة.'
        }
      ],
      adminNotes: 'تعديل أسعار أصناف المنيو يتم تنفيذه فوراً على كافة الشاشات والكاشير بدون الحاجة لإعادة التشغيل.'
    },

    // 9. RAW MATERIALS & RECIPE ENGINEERING (BOM)
    {
      id: 'raw_materials_bom',
      title: 'المواد الخام والوصفات والمكونات BOM (Raw Materials & Recipes)',
      category: 'inventory_prod',
      icon: <Boxes className="w-5 h-5 text-gold-400" />,
      badge: 'المكونات والوصفات',
      targetRoles: ['Admin'],
      summary: 'تسجيل الخامات الأساسية (بن، حليب، سيروب، أكواب)، وربط وصفات التحضير بأصناف المنيو الخصم التلقائي.',
      steps: [
        {
          title: '١. تعريف المواد الخام والمستلزمات',
          description: 'أدخل المكونات الأولية وحدات القياس (كيلو، جرام، لتر، ملي، قطعة) مع تكلفة الشراء وحد إعادة الطلب الأدنى.',
          tip: 'مثال: بن إسبريسو برزيلي (بالكيلوجرام)، حليب كامل الدسم (باللتر)، أكواب سفري 12oz (بالقطعة).'
        },
        {
          title: '٢. هندسة الوصفة (Bill of Materials - BOM)',
          description: 'لكل صنف بالمنيو (مثال: لاتيه حار)، حدد المكونات المطلوبة: (١٨ جرام بن + ٢٠٠ ملي حليب + ١ كوب سفري).',
          tip: 'عند بيع كوب لاتيه واحد بال POS، يتم خصم جرامات البن والمليلترات والكوب تلقائياً من مخزون الخامات!'
        }
      ],
      adminNotes: 'نظام BOM يمنع الهدر وسرقة خامات البارستا حيث يطابق الاستهلاك الفعلي للمخزون مع المبيعات الرقمية.'
    },

    // 10. INVENTORY & STOCK MANAGEMENT
    {
      id: 'inventory_stock',
      title: 'إدارة المخزون والجرد والتسويات (Inventory & Stock Audit)',
      category: 'inventory_prod',
      icon: <Package className="w-5 h-5 text-gold-400" />,
      badge: 'المخزون والجرد',
      targetRoles: ['Admin'],
      summary: 'متابعة حركة المخازن، تسجيل فاتورة المشتريات من الموردين، تسوية الفروق، وتسجيل الهالك والتالف.',
      steps: [
        {
          title: '١. تسجيل فواتير الوارد والمشتريات',
          description: 'عند استلام شحنة خامات من المورد، أدخل فاتورة المشتريات لتزويد رصيد الخامات وتحديث سعر التكلفة المتوسط.',
          tip: 'يمكن تسجيل المشتريات نقداً من الدرج أو على حساب المورد آكلاً.'
        },
        {
          title: '٢. الجرد الدوري وتسوية الفروق',
          description: 'أدخل الكميات المتروكة بالبار، يقوم النظام بمقارنة الجرد الفعلي مع المخزون الدفتري وإظهار نسبة العجز أو الزيادة.',
          tip: 'تسجيل الهالك (Waste) يضمن عدم احتسابه كاختلاس ويخصمه من الأرباح كتكلفة تلفيات.'
        }
      ]
    },

    // 11. PRODUCTION BATCHES
    {
      id: 'production_batches',
      title: 'إدارة الإنتاج وتجميع التشغيلات (Production Batches)',
      category: 'inventory_prod',
      icon: <Zap className="w-5 h-5 text-gold-400" />,
      badge: 'التصنيع والتشغيل',
      targetRoles: ['Admin'],
      summary: 'تحويل الخامات الأولية إلى منتجات نصف مصنعة (مثل: تحضير جالون سيروب فانيليا، تحميص دفعة بن، خبز كيك).',
      steps: [
        {
          title: '١. إنشاء دفعة إنتاج جديدة',
          description: 'اختر المنتج المخرَج (مثل: خلطة بن الديب الخاصة ٥ كجم)، وحدد المكونات المستهلكة من المواد الخام.',
          tip: 'يخصم المكونات الخام ويضيف المنتج النهائي الجاهز للبيع فور اعتماد الدفعة.'
        }
      ]
    },

    // 12. FINANCIAL REPORTS & ANALYTICS
    {
      id: 'financial_reports',
      title: 'التقارير المالية والأرباح وقوائم الدخل (Financial Reports)',
      category: 'finance_reports',
      icon: <BarChart3 className="w-5 h-5 text-gold-400" />,
      badge: 'التقارير والضرائب',
      targetRoles: ['Admin'],
      summary: 'تقرير المبيعات التفصيلي، قائمة الأرباح والخسائر، الإقرار الضريبي، وتقارير أداء الكاشيرية.',
      steps: [
        {
          title: '١. تقرير مبيعات الأيام والورديات',
          description: 'فلترة المبيعات حسب التاريخ، الوردية، الكاشير، أو طريقة الدفع لاستعراض كشف الحركة المالية التجميعي.',
          tip: 'تصدير التقارير بصيغة PDF أو Excel بضغط زر واحدة.'
        },
        {
          title: '٢. حساب صافي الربح الحقيقي (P&L)',
          description: 'المعادل المالي: (إجمالي المبيعات) - (تكلفة البضاعة المبيعة COGS) - (المصروفات العامة والرواتب) = صافي الربح الأخير.',
          tip: 'يقوم النظام بهذه العملية الحسابية الدقيقة تلقائياً وبشكل حي.'
        }
      ]
    },

    // 13. EXPENSES & PARTNERS DRAW
    {
      id: 'expenses_partners',
      title: 'المصروفات ومسحوبات الشركاء (Expenses & Partner Draws)',
      category: 'finance_reports',
      icon: <TrendingDown className="w-5 h-5 text-gold-400" />,
      badge: 'المصروفات والشركاء',
      targetRoles: ['Admin'],
      summary: 'تسجيل النفقات التشغيلية (إيجار، كهرباء، صيانة)، ومتابعة مسحوبات وأرباح الشركاء بنسب الملكية.',
      steps: [
        {
          title: '١. تسجيل المصروفات وتبويبها',
          description: 'سجّل أي نفقات سريعة من الدرج أو البنك مع تحديد بند المصروف وإرفاق صورة الفاتورة إن وجدت.',
          tip: 'تُخصم المصروفات فوراً من صافي أرباح الكافيه للوردية أو الشهر.'
        },
        {
          title: '٢. حسابات الشركاء والمسحوبات الشخصية',
          description: 'شاشة مسحوبات الشركاء تسجل أي مبالغ يسحبها الشركاء وتخصمها من حصتهم المعتمدة في الأرباح.'
        }
      ]
    },

    // 14. DAILY CLOSING & SHIFT END
    {
      id: 'daily_closing',
      title: 'التقفيل اليومي وتصفية درج النقدية (Shift Ending & Z-Report)',
      category: 'finance_reports',
      icon: <Wallet className="w-5 h-5 text-gold-400" />,
      badge: 'تصفية الدرج',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'خطوات إغلاق الوردية، عد نقدية الدرج الفعلية، توثيق العجز أو الزيادة، وطباعة التقرير النهائي Z-Report.',
      steps: [
        {
          title: '١. بدء إجراءات تقفيل الوردية',
          description: 'من شاشة "إدارة درج النقدية"، اضغط "إغلاق الوردية وتصفية النقدية". سيطلب النظام عد الفئات النقدية الموجودة.',
          tip: 'النظام يحسب الرصيد النظري المتوقع (بداية الدرج + المبيعات الكاش - المصروفات الكاش).'
        },
        {
          title: '٢. مطابقة النقدية الفعليّة واحتساب الفروقات',
          description: 'أدخل المبلغ المالي الفعلي الذي قمت بعده بالدرج. إذا وجد عجز أو زيادة، يتم تسجيل العجز باسم الكاشير المسئول.',
          tip: 'طباعة تقرير Z-Report يحتوي على ملخص كامل وموقع من الموظف والأدمن.'
        }
      ]
    },

    // 15. GOOGLE DRIVE BACKUP
    {
      id: 'google_drive_backup',
      title: 'النسخ الاحتياطي السحابي Google Drive (Cloud Backup)',
      category: 'system_integrations',
      icon: <CloudUpload className="w-5 h-5 text-gold-400" />,
      badge: 'النسخ الاحتياطي',
      targetRoles: ['Admin'],
      summary: 'تأمين قاعدة بيانات النظام بالكامل وحفظ نسخ احتياطية مشفرة تلقائياً أو يدويّاً على حساب Google Drive.',
      steps: [
        {
          title: '١. الربط والنسخ التلقائي',
          description: 'من شاشة الإعدادات ➔ النسخ الاحتياطي، يمكنك تفعيل النسخ الذاتي التلقائي عند كل تقفيل وردية أو في وقت محدد.',
          tip: 'يتم تشفير الملفات بمفتاح أمان لمنع اطلاع أي شخص آخر على بياناتك المالية.'
        },
        {
          title: '٢. استعادة قاعدة البيانات في حالات الطوارئ',
          description: 'عند تغيير الجهاز أو صيانته، يمكنك رفع ملف النسخة الاحتياطية (.enc) لاسترجاع كافة البيانات والعملاء والأرشيف في ثوانٍ.'
        }
      ]
    },

    // 16. GMAIL INTEGRATION
    {
      id: 'gmail_integration',
      title: 'تكامل Gmail والرسائل البريدية (Gmail Receipts & Reports)',
      category: 'system_integrations',
      icon: <Mail className="w-5 h-5 text-gold-400" />,
      badge: 'الرسائل الإلكترونية',
      targetRoles: ['Admin'],
      summary: 'ربط النظام بحساب Gmail لإرسال فواتير إلكترونية للعملاء وإرسال ملخص التقفيل اليومي لبريد الأدمن.',
      steps: [
        {
          title: '١. إعداد بريد الإرسال ومفتاح التطبيق',
          description: 'من شاشة الإعدادات ➔ Gmail، أدخل البريد الإلكتروني ومفتاح App Password لإرسال الرسائل تلقائياً بدون تدخل.',
          tip: 'إرسال تقرير التقفيل اليومي لبريد المالك فور إغلاق الوردية يضمن الإشراف المستمر أثناء السفر.'
        }
      ]
    },

    // 17. FIREBASE REAL-TIME SYNC
    {
      id: 'firebase_sync',
      title: 'المزامنة اللحظية السحابية Firebase (Real-time Cloud Sync)',
      category: 'system_integrations',
      icon: <RefreshCw className="w-5 h-5 text-gold-400" />,
      badge: 'المزامنة الفورية',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'ربط أجهزة الكافيه (كاشير ١ + كاشير ٢ + الموبايل) بمزامنة فائقة السرعة.',
      steps: [
        {
          title: '١. المزامنة اللحظية متعددة الأجهزة',
          description: 'أي طلب يتم إدخاله في الكاشير يظهر فوراً في الأجهزة المرتبطة وشاشة الفواتير المفتوحة بدون الحاجة لتحديث الصفحة.',
          tip: 'يعمل النظام بوضع أوفلاين (Offline Store & Forward) في حال انقطاع الإنترنت ويقوم بالمزامنة فور عودة الاتصال.'
        }
      ]
    },

    // 18. BLUETOOTH & NETWORK PRINTING
    {
      id: 'thermal_printing',
      title: 'الطباعة الحرارية للوصولات والطابعات (ESC/POS Printing)',
      category: 'system_integrations',
      icon: <Printer className="w-5 h-5 text-gold-400" />,
      badge: 'الطباعة الحرارية',
      targetRoles: ['Admin', 'Cashier'],
      summary: 'إعداد طابعات الفواتير الحرارية (Bluetooth / USB / LAN Network) بمقاسات 80mm و 58mm.',
      steps: [
        {
          title: '١. إعداد وشبك الطابعة',
          description: 'اختر نوع الاتصال (بلوتوث أو شبكة IP)، حدد عرض الورق، وقم باختبار الطباعة لتأكيد الاتصال.',
          tip: 'يمكن تفعيل أمر الفتح التلقائي لدرج النقدية (Kick Cash Drawer) مع طباعة كل فاتورة مسددة.'
        },
        {
          title: '٢. تخصيص رأس وذيل الفاتورة',
          description: 'إضافة شعار كافيه الديب، اسم الفرع، رقم الضريبي، أرقام الدليفري، وعبارات الترحيب في أسفل الفاتورة.'
        }
      ]
    }
  ];

  // Filter Categories Options
  const categories = [
    { id: 'ALL', label: 'كافة الأقسام (All Modules)' },
    { id: 'core', label: 'النظام والتحضير (Core & KDS)' },
    { id: 'pos_tables', label: 'المبيعات والطاولات (POS & Hall)' },
    { id: 'inventory_prod', label: 'المخزون والمنيو (Stock & Menu)' },
    { id: 'finance_reports', label: 'التقارير والتقفيل (Finance & Shift)' },
    { id: 'system_integrations', label: 'الربط والطباعة (Cloud & Print)' }
  ];

  // Filter Sections Logic
  const filteredSections = useMemo(() => {
    return manualSections.filter(section => {
      // 1. Role Filter matching activeRoleView
      const roleMatch = section.targetRoles.includes(activeRoleView);

      // 2. Category Filter
      const categoryMatch = selectedCategory === 'ALL' || section.category === selectedCategory;

      // 3. Search Query Filter
      const query = searchQuery.trim().toLowerCase();
      if (!query) return roleMatch && categoryMatch;

      const titleMatch = section.title.toLowerCase().includes(query);
      const summaryMatch = section.summary.toLowerCase().includes(query);
      const stepsMatch = section.steps.some(step =>
        step.title.toLowerCase().includes(query) ||
        step.description.toLowerCase().includes(query) ||
        (step.tip && step.tip.toLowerCase().includes(query))
      );

      return (roleMatch || activeRoleView === 'Admin') && categoryMatch && (titleMatch || summaryMatch || stepsMatch);
    });
  }, [activeRoleView, selectedCategory, searchQuery]);

  return (
    <div className="space-y-6 text-right dir-rtl animate-fadeIn" dir="rtl">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-luxury-bg via-gray-900 to-luxury-bg border border-gold-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-gold-600/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gold-600/15 border border-gold-500/40 rounded-2xl text-gold-400 shadow-inner">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                  دليل المستخدم الشامل والنظام التشغيلي
                  <span className="text-xs font-bold text-gold-400 bg-gold-600/20 border border-gold-500/30 px-2.5 py-0.5 rounded-full">
                    المؤسسي Enterprise
                  </span>
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  شرح تفصيلي تفاعلي لكافة الشاشات، الصلاحيات، وآليات عمل كافيه الديب POS
                </p>
              </div>
            </div>
          </div>

          {/* ROLE SWITCHER CONTROLS */}
          <div className="bg-black/60 border border-gray-800 p-2 rounded-2xl space-y-2 shrink-0 w-full lg:w-auto">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-gold-400" />
                معاينة دليل الصلاحية:
              </span>
              <span className="text-gold-400 font-extrabold">
                {activeRoleView === 'Admin' ? '👑 أدمن المدير العام' : '☕ كاشير المبيعات'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveRoleView('Admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeRoleView === 'Admin'
                    ? 'bg-gold-600 text-black font-extrabold shadow-md'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <span>👑 أدمن</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveRoleView('Cashier')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeRoleView === 'Cashier'
                    ? 'bg-emerald-600 text-white font-extrabold shadow-md'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                <span>☕ كاشير</span>
              </button>
            </div>
            {userActualRole !== 'Admin' && (
              <p className="text-[10px] text-gray-500 text-center font-medium pt-1">
                (أنت مسجل حالياً بصلاحية الكاشير)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SEARCH BAR & QUICK FILTERS */}
      <div className="bg-luxury-bg/90 border border-gray-900 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Real-time Search Input */}
          <div className="flex-1 flex items-center gap-3 bg-black/80 border border-gray-800 rounded-xl px-4 py-3 focus-within:border-gold-500/60 transition-all">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="ابحث في دليل المستخدم (مثال: خصم، فاتورة مفتوحة، كاشير، بارستا، تقفيل درج، طباعة...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-white text-xs w-full focus:outline-none placeholder-gray-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-gray-400 hover:text-white font-bold bg-gray-800 px-2 py-0.5 rounded-md"
              >
                مسح
              </button>
            )}
          </div>

          {/* Quick Expand / Collapse All Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={expandAll}
              className="px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ChevronDown className="w-3.5 h-3.5 text-gold-400" />
              <span>توسيع الكل</span>
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ChevronUp className="w-3.5 h-3.5 text-gold-400" />
              <span>طي الكل</span>
            </button>
          </div>
        </div>

        {/* Category Tags Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-gold-600/20 text-gold-400 border border-gold-500/40 font-black'
                  : 'bg-black/40 text-gray-400 hover:text-white border border-gray-900'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* MANUAL SECTIONS LIST (ACCORDION STYLE) */}
      <div className="space-y-4">
        {filteredSections.length === 0 ? (
          <div className="bg-luxury-bg border border-gray-900 rounded-2xl p-12 text-center space-y-3">
            <HelpCircle className="w-12 h-12 text-gray-600 mx-auto" />
            <p className="text-white font-bold text-sm">لم يتم العثور على شروحات تطابق البحث "{searchQuery}"</p>
            <p className="text-xs text-gray-500">جرب البحث بكلمات أخرى مثل "فواتير"، "باركود"، "بارستا"، أو "أرباح"</p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory('ALL'); }}
              className="px-4 py-2 bg-gold-600 text-black font-bold text-xs rounded-xl cursor-pointer mt-2"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        ) : (
          filteredSections.map(section => {
            const isExpanded = !!expandedSections[section.id];
            return (
              <div
                key={section.id}
                id={`manual-section-${section.id}`}
                className={`bg-luxury-bg border rounded-2xl transition-all overflow-hidden ${
                  isExpanded
                    ? 'border-gold-500/40 shadow-xl'
                    : 'border-gray-900 hover:border-gray-800'
                }`}
              >
                {/* SECTION HEADER BAR */}
                <div
                  onClick={() => toggleSection(section.id)}
                  className="p-4 md:p-5 flex items-center justify-between cursor-pointer select-none bg-gradient-to-r from-gray-950/80 via-luxury-bg to-gray-950/80 hover:bg-gray-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-black border border-gray-800 rounded-xl shrink-0">
                      {section.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm md:text-base font-black text-white">{section.title}</h2>
                        <span className="text-[10px] font-extrabold text-gold-400 bg-gold-600/10 border border-gold-500/20 px-2 py-0.5 rounded-md">
                          {section.badge}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{section.summary}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 mr-2">
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500 font-bold bg-black/50 px-2.5 py-1 rounded-lg border border-gray-900">
                      <span>الصلاحية:</span>
                      <span className="text-gray-300">
                        {section.targetRoles.join(' / ')}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-gray-900 text-gray-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-gold-400" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* EXPANDED SECTION CONTENT */}
                {isExpanded && (
                  <div className="p-5 border-t border-gray-900 bg-black/30 space-y-5 animate-fadeIn">
                    
                    {/* Summary Callout */}
                    <div className="p-3.5 bg-gold-600/5 border border-gold-500/20 rounded-xl text-xs text-gold-300 font-medium leading-relaxed flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>ملخص الوظيفة:</strong> {section.summary}
                      </div>
                    </div>

                    {/* STEPS TIMELINE */}
                    <div className="space-y-4 relative pr-2">
                      <div className="absolute top-2 bottom-2 right-4 w-0.5 bg-gray-800/80 -z-0" />
                      {section.steps.map((step, idx) => (
                        <div key={idx} className="relative z-10 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-gold-600 text-black font-black text-xs flex items-center justify-center shrink-0 shadow-md">
                            {idx + 1}
                          </div>
                          <div className="flex-1 bg-luxury-bg border border-gray-900 rounded-xl p-3.5 space-y-2">
                            <h3 className="text-xs md:text-sm font-bold text-white">{step.title}</h3>
                            <p className="text-xs text-gray-300 leading-relaxed">{step.description}</p>
                            
                            {step.tip && (
                              <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-300 flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span><strong>ملاحظة تخصصية:</strong> {step.tip}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* KEYBOARD SHORTCUTS IF ANY */}
                    {section.keyboardShortcuts && section.keyboardShortcuts.length > 0 && (
                      <div className="pt-2 border-t border-gray-900/80 space-y-2">
                        <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-gold-400" />
                          اختصارات لوحة المفاتيح السريعة (Keyboard Shortcuts):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {section.keyboardShortcuts.map((sc, scIdx) => (
                            <div key={scIdx} className="p-2 bg-black/60 border border-gray-800 rounded-lg flex items-center justify-between text-xs">
                              <span className="text-gray-400 text-[11px]">{sc.description}</span>
                              <kbd className="px-2 py-1 bg-gold-600/20 text-gold-400 border border-gold-500/40 rounded font-mono text-[10px] font-black">
                                {sc.key}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ADMIN NOTES CALLOUT */}
                    {section.adminNotes && (
                      <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>{section.adminNotes}</span>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* FOOTER SUPPORT BOX */}
      <div className="bg-gradient-to-r from-gray-950 via-luxury-bg to-gray-950 border border-gray-900 rounded-2xl p-5 text-center space-y-2 text-xs text-gray-400">
        <p className="font-bold text-white flex items-center justify-center gap-2">
          <HelpCircle className="w-4 h-4 text-gold-400" />
          هل تحتاج إلى مساعدة إضافية أو تقديم استفسار تقني؟
        </p>
        <p className="text-[11px] text-gray-500">
          يمكنك التواصل مع الإدارة الفنية أو زيارة شاشة الإعدادات والنسخ الاحتياطي لإدارة النظام.
        </p>
      </div>

    </div>
  );
}

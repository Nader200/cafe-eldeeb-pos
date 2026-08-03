/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Category,
  Product,
  Customer,
  Supplier,
  Invoice,
  InvoiceItem,
  Expense,
  InventoryTransaction,
  CreditPayment,
  CashDrawer,
  DailyClose,
  AppSettings,
  BackupLog,
  CartItem,
  PaymentType,
  InvoiceStatus,
  ExpenseCategory,
  CustomerCommunicationLog,
  AuditLog,
  ItemModificationLog,
  PaymentStatus,
  ReturnTransaction,
  ReturnItem,
  CreditAdjustment,
  CashMovement,
  WalletTransaction,
  CustomerNote,
  CustomerVisit,
  CustomerCreditTransaction,
  TableSystem,
  Employee,
  EmployeeTransaction,
  PSDevice,
  PSSession,
  DailyRawMaterialItem,
  DailyRawMaterialSession,
  RawMaterial,
  SupplierPurchase,
  SupplierPayment,
  InventoryBatch,
  InventoryBatchLog,
  AuthUser,
  AuthAuditLog,
  UserRole,
  Partner,
  PartnerDrawing,
  UpdateLog,
  BaristaOrder,
  BaristaOrderItem,
  BaristaOrderStatus,
  OperationalStatus
} from './types';
import { sanitizePaymentMethod } from './utils/paymentUtils';
import { playBaristaNewOrderSound, playOrderReadySound } from './lib/audioService';

import { safeStorage } from './lib/safeStorage';
export { safeStorage };

// Shadow global localStorage safely for this file scope
const localStorage = safeStorage;

// Storage Helper
const getLocal = <T>(key: string, fallback: T): T => {
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    return fallback;
  }
};

const getCurrentUserRole = (): UserRole => {
  try {
    const raw = localStorage.getItem('cafe_eldeeb_logged_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.role) return u.role as UserRole;
    }
  } catch (e) {}
  return 'Admin';
};

export function isServiceOrNonInventoryProduct(prod: any): boolean {
  if (!prod) return false;
  if (prod.is_service === true) return true;
  const id = String(prod.id || '');
  const categoryId = String(prod.category_id || '');
  const barcode = String(prod.barcode || '');
  const unit = String(prod.unit || '');
  const nameEn = String(prod.name_en || '');
  const nameAr = String(prod.name_ar || '');

  if (
    id === 'service_playstation' ||
    id === 'prod_playstation' ||
    id.startsWith('service_') ||
    id.startsWith('prod_playstation') ||
    categoryId === 'cat_playstation_service' ||
    categoryId === 'cat_playstation' ||
    categoryId === 'cat_service' ||
    categoryId === 'services' ||
    barcode === 'SERVICE_PS' ||
    barcode.startsWith('SERVICE_') ||
    unit === 'جلسة' ||
    unit === 'خدمة' ||
    unit === 'ساعة' ||
    nameEn.toLowerCase().includes('playstation playtime') ||
    nameEn.toLowerCase().includes('service fee') ||
    nameAr.includes('رسم وقت لعب') ||
    nameAr.includes('وقت لعب') ||
    nameAr.includes('خدمة')
  ) {
    return true;
  }
  return false;
}

import { firebaseSyncService } from './lib/firebaseSyncService';

const setLocal = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
  syncToServer();
  firebaseSyncService.pushKeyToCloud(key, value);
};

// Database Keys
const KEYS = {
  CATEGORIES: 'cafe_categories',
  PRODUCTS: 'cafe_products',
  CUSTOMERS: 'cafe_customers',
  SUPPLIERS: 'cafe_suppliers',
  INVOICES: 'cafe_invoices',
  INVOICE_ITEMS: 'cafe_invoice_items',
  EXPENSES: 'cafe_expenses',
  INVENTORY_TRANSACTIONS: 'cafe_inventory_transactions',
  CREDIT_PAYMENTS: 'cafe_credit_payments',
  CASH_DRAWERS: 'cafe_cash_drawers',
  DAILY_CLOSES: 'cafe_daily_closes',
  SETTINGS: 'cafe_settings',
  BACKUP_LOGS: 'cafe_backup_logs',
  COMMUNICATION_LOGS: 'cafe_communication_logs',
  AUDIT_LOGS: 'cafe_audit_logs',
  ITEM_MODIFICATIONS: 'cafe_item_modifications',
  RETURNS: 'cafe_returns_list',
  CREDIT_ADJUSTMENTS: 'cafe_credit_adjustments',
  CASH_HISTORY: 'cafe_cash_history',
  WALLET_TRANSACTIONS: 'cafe_wallet_transactions',
  CUSTOMER_NOTES: 'cafe_customer_notes',
  CUSTOMER_VISITS: 'cafe_customer_visits',
  CREDIT_TRANSACTIONS: 'cafe_credit_transactions_system',
  TABLES: 'cafe_tables_system',
  EMPLOYEES: 'cafe_employees',
  EMPLOYEE_TRANSACTIONS: 'cafe_employee_transactions',
  PS_DEVICES: 'cafe_ps_devices',
  PS_SESSIONS: 'cafe_ps_sessions',
  DAILY_RAW_MATERIALS: 'cafe_daily_raw_materials',
  RAW_MATERIALS: 'cafe_raw_materials',
  RAW_MATERIALS_SEEDED: 'cafe_raw_materials_seeded',
  RAW_MATERIALS_DELETED: 'cafe_raw_materials_deleted',
  INVENTORY_BATCHES: 'cafe_inventory_batches',
  INVENTORY_BATCH_LOGS: 'cafe_inventory_batch_logs',
  BATCH_CONSUMPTIONS: 'cafe_batch_consumptions',
  AUTH_USERS: 'cafe_auth_users',
  AUTH_AUDIT_LOGS: 'cafe_auth_audit_logs',
  PARTNERS: 'cafe_partners',
  PARTNER_DRAWINGS: 'cafe_partner_drawings',
  UPDATE_LOGS: 'cafe_update_logs',
  BARISTA_ORDERS: 'cafe_barista_orders',
};

// Sync current client database state to the server
let isDatabaseLoadedFromServer = false;

export const syncToServer = (() => {
  let timeoutId: any = null;
  const syncFn = () => {
    const data: Record<string, any> = {};
    Object.entries(KEYS).forEach(([_, key]) => {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) {
          data[key] = JSON.parse(val);
        }
      } catch (e) {}
    });
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(err => console.error('Failed to sync to server database:', err));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        syncFn();
      }
    });
  }

  return () => {
    if (!isDatabaseLoadedFromServer) {
      console.log('Skipping syncToServer because server database has not been loaded/initialized yet.');
      return;
    }
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      syncFn();
      timeoutId = null;
    }, 200);
  };
})();

// Initial Settings
const defaultSettings: AppSettings = {
  id: 'settings_1',
  cafe_name: '',
  owner_name: '',
  is_setup_completed: false,
  address: '',
  phone: '',
  currency: 'ج.م',
  receipt_footer: 'شكراً لزيارتكم! سعدنا بخدمتكم.',
  logo_path: '☕',
  google_drive_backup_enabled: false,
  default_tax_percentage: 0,
  printer_paper_size: '80',
  printer_name: 'Bluetooth-Thermal-XP80',
  pin_code: '1234',
  pin_protection_enabled: false,
  updated_at: new Date().toISOString(),
  reminder_days_friendly: 7,
  reminder_days_statement: 15,
  reminder_days_final: 30,
  whatsapp_reminders_enabled: true,
  whatsapp_template_friendly: "السلام عليكم أستاذ / {CustomerName}\nنود تذكيركم بلطف بأن لديكم مديونية مستحقة بقيمة {RemainingBalance} ج.م لدى كافيه الديب.\nشاكرين تعاونكم المستمر معنا 🌹",
  whatsapp_template_statement: "السلام عليكم أستاذ / {CustomerName}\nتجدون مرفقاً كشف الحساب التفصيلي الخاص بكم لدى كافيه الديب.\nإجمالي الرصيد المستحق: {RemainingBalance} ج.م.\nنشكركم لثقتكم الغالية 🌹",
  whatsapp_template_final: "السلام عليكم أستاذ / {CustomerName}\nتنبيه نهائي بخصوص مستحقات مديونيتكم المتأخرة بقيمة {RemainingBalance} ج.م.\nنرجو التكرم بالسداد في أقرب وقت لتفادي تعليق الحساب التجاري.\nشاكرين تفهمكم 🌹",
  whatsapp_template_receipt: "تم استلام دفعة مالية بقيمة {PaymentAmount} ج.م بنجاح.\nالرصيد المتبقي المستحق: {RemainingBalance} ج.م.\nشكراً لتعاملكم معنا 🌹",
  statement_footer: "هذا الكشف صادر آلياً من نظام كافيه الديب POS الملوكي ولا يحتاج لتوقيع.",
  // Sales Settings defaults
  sales_allow_edit_price: true,
  sales_allow_discount: true,
  sales_allow_delete_item: true,
  sales_require_password_price_change: false,
  sales_require_password_discount: false,
  payment_numbers: [
    { id: 'pay_1', type: 'VODAFONE_CASH', number: '01094793701', is_active: true, name: 'نادر الديب (الرئيسي)' },
    { id: 'pay_2', type: 'INSTAPAY', number: '01094793701', is_active: true, name: 'نادر الديب' }
  ],
  vodafone_cash_number: '01094793701',
  instapay_number: '01094793701',
  employee_consumption_policy: 'DEDUCT',
  custom_expense_categories: [],
  auto_update_checks_enabled: true,
  last_update_check_date: new Date().toISOString(),
  last_installed_version: '4.2.5',
  force_update_enabled: false,
};

// Clear and Reset Database Engine
export const clearDatabase = (preserveSettings = true): void => {
  let currentSettings: AppSettings = { ...defaultSettings };
  if (preserveSettings) {
    try {
      const stored = localStorage.getItem(KEYS.SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored) as AppSettings;
        currentSettings = { ...defaultSettings, ...parsed };
      }
    } catch (e) {
      // ignore
    }
  }

  // Clear all localStorage keys except SETTINGS if preserveSettings is true
  Object.values(KEYS).forEach(k => {
    if (!preserveSettings || k !== KEYS.SETTINGS) {
      localStorage.removeItem(k);
    }
  });

  // Clear any potential leftover browser storage keys to be fully thorough
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && !Object.values(KEYS).includes(key) && key !== KEYS.SETTINGS) {
      localStorage.removeItem(key);
    }
  }

  // Clear session storage as well
  try {
    sessionStorage.clear();
  } catch (e) {}

  // Re-save settings preserving ALL requested app properties
  const resetSettings: AppSettings = preserveSettings ? {
    ...defaultSettings,
    ...currentSettings,
    cafe_name: currentSettings.cafe_name || defaultSettings.cafe_name,
    owner_name: currentSettings.owner_name || defaultSettings.owner_name,
    is_setup_completed: currentSettings.is_setup_completed ?? defaultSettings.is_setup_completed,
    address: currentSettings.address || defaultSettings.address,
    phone: currentSettings.phone || defaultSettings.phone,
    currency: currentSettings.currency || defaultSettings.currency,
    receipt_footer: currentSettings.receipt_footer || defaultSettings.receipt_footer,
    logo_path: currentSettings.logo_path || defaultSettings.logo_path,
    google_drive_backup_enabled: currentSettings.google_drive_backup_enabled ?? false,
    printer_paper_size: currentSettings.printer_paper_size ?? '80',
    printer_name: currentSettings.printer_name ?? 'Bluetooth-Thermal-XP80',
    pin_code: currentSettings.pin_code ?? '1234',
    pin_protection_enabled: currentSettings.pin_protection_enabled ?? false,
    updated_at: new Date().toISOString(),
    reminder_days_friendly: currentSettings.reminder_days_friendly ?? 7,
    reminder_days_statement: currentSettings.reminder_days_statement ?? 15,
    reminder_days_final: currentSettings.reminder_days_final ?? 30,
    whatsapp_reminders_enabled: currentSettings.whatsapp_reminders_enabled ?? true,
    whatsapp_template_friendly: currentSettings.whatsapp_template_friendly || defaultSettings.whatsapp_template_friendly,
    whatsapp_template_statement: currentSettings.whatsapp_template_statement || defaultSettings.whatsapp_template_statement,
    whatsapp_template_final: currentSettings.whatsapp_template_final || defaultSettings.whatsapp_template_final,
    whatsapp_template_receipt: currentSettings.whatsapp_template_receipt || defaultSettings.whatsapp_template_receipt,
    statement_footer: currentSettings.statement_footer || defaultSettings.statement_footer,
    // Sales Settings
    sales_allow_edit_price: currentSettings.sales_allow_edit_price ?? true,
    sales_allow_discount: currentSettings.sales_allow_discount ?? true,
    sales_allow_delete_item: currentSettings.sales_allow_delete_item ?? true,
    sales_require_password_price_change: currentSettings.sales_require_password_price_change ?? false,
    sales_require_password_discount: currentSettings.sales_require_password_discount ?? false,
    vodafone_cash_number: currentSettings.vodafone_cash_number || '01094793701',
    instapay_number: currentSettings.instapay_number || '01094793701',
    employee_consumption_policy: currentSettings.employee_consumption_policy || 'DEDUCT',
  } : {
    ...defaultSettings,
    updated_at: new Date().toISOString()
  };

  setLocal(KEYS.SETTINGS, resetSettings);

  // Initialize empty arrays for all data tables
  setLocal(KEYS.CATEGORIES, []);
  setLocal(KEYS.PRODUCTS, []);
  setLocal(KEYS.CUSTOMERS, []);
  setLocal(KEYS.SUPPLIERS, []);
  setLocal(KEYS.CASH_DRAWERS, []);
  setLocal(KEYS.EXPENSES, []);
  setLocal(KEYS.INVOICES, []);
  setLocal(KEYS.INVOICE_ITEMS, []);
  setLocal(KEYS.INVENTORY_TRANSACTIONS, []);
  setLocal(KEYS.CREDIT_PAYMENTS, []);
  setLocal(KEYS.CREDIT_TRANSACTIONS, []);
  setLocal(KEYS.DAILY_CLOSES, []);
  setLocal(KEYS.BACKUP_LOGS, []);
  setLocal(KEYS.COMMUNICATION_LOGS, []);
  setLocal(KEYS.AUDIT_LOGS, []);
  setLocal(KEYS.ITEM_MODIFICATIONS, []);
  setLocal(KEYS.EMPLOYEES, []);
  setLocal(KEYS.EMPLOYEE_TRANSACTIONS, []);
  setLocal(KEYS.PS_DEVICES, []);
  setLocal(KEYS.PS_SESSIONS, []);
  setLocal(KEYS.INVENTORY_BATCHES, []);
  setLocal(KEYS.INVENTORY_BATCH_LOGS, []);
  setLocal(KEYS.PARTNERS, []);
  setLocal(KEYS.PARTNER_DRAWINGS, []);

  // Clear IndexedDB if any
  if (typeof window !== 'undefined' && window.indexedDB && window.indexedDB.databases) {
    try {
      window.indexedDB.databases().then(dbs => {
        dbs.forEach(db => {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        });
      }).catch(() => {});
    } catch (e) {}
  }
};

// Seeding Initial Data (No demo data, empty database)
export const seedDatabase = (force = false) => {
  // Check if any existing data is present in ANY of the critical tables
  const hasCategories = getLocal<Category[]>(KEYS.CATEGORIES, []).length > 0;
  const hasProducts = getLocal<Product[]>(KEYS.PRODUCTS, []).length > 0;
  const hasCustomers = getLocal<Customer[]>(KEYS.CUSTOMERS, []).length > 0;
  const hasInvoices = getLocal<Invoice[]>(KEYS.INVOICES, []).length > 0;
  const storedSettings = localStorage.getItem(KEYS.SETTINGS);
  const hasSettings = storedSettings !== null && storedSettings !== undefined && storedSettings !== '{}';

  if (!hasSettings) {
    setLocal(KEYS.SETTINGS, defaultSettings);
  }

  if (!force && (hasCategories || hasProducts || hasCustomers || hasInvoices || hasSettings)) {
    return;
  }

  // Complete a clean initialization of an empty database if forcing, or if truly empty
  if (force && !hasCategories && !hasProducts && !hasCustomers && !hasInvoices) {
    clearDatabase(true);
    const existing = getLocal<AppSettings | null>(KEYS.SETTINGS, null);
    if (!existing) {
      setLocal(KEYS.SETTINGS, defaultSettings);
    }
    console.log('Cafe Eldeeb empty enterprise database initialized successfully!');
  }
};

// Internal Helper for Credit System transactional math
export const recordCreditTransactionInternal = (
  txs: CustomerCreditTransaction[],
  customers: Customer[],
  txData: {
    customer_id: string;
    customer_name: string;
    invoice_id?: string;
    transaction_type: 'INVOICE' | 'PAYMENT' | 'MANUAL_ADJUSTMENT' | 'CORRECTION' | 'REFUND';
    amount: number;
    notes: string;
    created_by: string;
  }
): CustomerCreditTransaction => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  // Calculate previous running balance for the customer
  const customerTxs = txs.filter(t => t.customer_id === txData.customer_id);
  let previous_balance = 0;
  customerTxs.forEach(t => {
    if (t.transaction_type === 'INVOICE') previous_balance += t.amount;
    else if (t.transaction_type === 'PAYMENT') previous_balance -= t.amount;
    else if (t.transaction_type === 'MANUAL_ADJUSTMENT') previous_balance += t.amount;
    else if (t.transaction_type === 'CORRECTION') previous_balance += t.amount;
    else if (t.transaction_type === 'REFUND') previous_balance -= t.amount;
  });

  let new_balance = previous_balance;
  if (txData.transaction_type === 'INVOICE') new_balance += txData.amount;
  else if (txData.transaction_type === 'PAYMENT') new_balance -= txData.amount;
  else if (txData.transaction_type === 'MANUAL_ADJUSTMENT') new_balance += txData.amount;
  else if (txData.transaction_type === 'CORRECTION') new_balance += txData.amount;
  else if (txData.transaction_type === 'REFUND') new_balance -= txData.amount;

  const newTx: CustomerCreditTransaction = {
    id: `ctx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    customer_id: txData.customer_id,
    customer_name: txData.customer_name,
    invoice_id: txData.invoice_id,
    transaction_type: txData.transaction_type,
    amount: txData.amount,
    previous_balance,
    new_balance,
    date: todayStr,
    time: timeStr,
    created_by: txData.created_by,
    notes: txData.notes,
    created_at: now.toISOString()
  };

  txs.push(newTx);

  // Update customer's cached credit balance
  const custIdx = customers.findIndex(c => c.id === txData.customer_id);
  if (custIdx > -1) {
    customers[custIdx].current_balance = new_balance;
    customers[custIdx].updated_at = now.toISOString();
  }

  return newTx;
};

export const isPurchaseCategory = (category: string): boolean => {
  const cat = (category || '').trim().toLowerCase();
  const purchaseKeys = [
    'coffee', 'molasses', 'charcoal', 'milk', 'sugar', 'fruits',
    'بن', 'قهوة', 'معسل', 'فحم', 'حليب', 'لبن', 'سكر', 'فواكه',
    'شراء', 'مشتريات', 'بضاعة', 'مخزون', 'توريد', 'مواد خام'
  ];
  return purchaseKeys.some(key => cat.includes(key));
};

export const isPurchaseExpense = (exp: { expense_category: string; supplier_id?: string }): boolean => {
  if (exp.supplier_id) return true; // Any expense linked to a supplier is a purchase!
  return isPurchaseCategory(exp.expense_category);
};

// Default Authentication Users
export const defaultAuthUsers: AuthUser[] = [
  {
    id: 'user_admin',
    username: 'admin',
    name: 'أدمن النظام / نادر الديب',
    role: 'Admin',
    passwordHash: 'admin123',
    phone: '01000000000',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'user_cashier',
    username: 'cashier',
    name: 'الكاشير / أحمد الديب',
    role: 'Cashier',
    passwordHash: '123456',
    phone: '01100000000',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'user_barista',
    username: 'barista',
    name: 'محضر المشروبات / البارستا',
    role: 'Barista',
    passwordHash: '123456',
    phone: '01200000000',
    is_active: true,
    created_at: new Date().toISOString()
  }
];

export const getItemCategoryIcon = (categoryName = '', productName = ''): string => {
  const cat = (categoryName || '').toLowerCase();
  const prod = (productName || '').toLowerCase();
  const combined = `${cat} ${prod}`;

  // 1. Shisha / Smoke
  if (
    combined.includes('شيشة') ||
    combined.includes('شيشه') ||
    combined.includes('معسل') ||
    combined.includes('سلوم') ||
    combined.includes('حجر') ||
    combined.includes('قص') ||
    combined.includes('فاخر') ||
    combined.includes('تفاحتين') ||
    combined.includes('shisha') ||
    combined.includes('hookah')
  ) {
    return '💨';
  }

  // 2. Juice / Cocktails / Soft Drinks
  if (
    combined.includes('عصير') ||
    combined.includes('عصائر') ||
    combined.includes('كوكتيل') ||
    combined.includes('فرابيه') ||
    combined.includes('سموذي') ||
    combined.includes('مانجو') ||
    combined.includes('فراولة') ||
    combined.includes('جوافة') ||
    combined.includes('برتقال') ||
    combined.includes('ليمون') ||
    combined.includes('موخيتو') ||
    combined.includes('موهيتو') ||
    combined.includes('بيبسي') ||
    combined.includes('كولا') ||
    combined.includes('سبرايت') ||
    combined.includes('فانتا') ||
    combined.includes('ريدبول') ||
    combined.includes('ريد بول') ||
    combined.includes('شويبس') ||
    combined.includes('مياه') ||
    combined.includes('ماء') ||
    combined.includes('soda') ||
    combined.includes('juice') ||
    combined.includes('smoothie') ||
    combined.includes('cocktail') ||
    combined.includes('frappe')
  ) {
    return '🥤';
  }

  // 3. Cold Drinks / Ice
  if (
    combined.includes('بارد') ||
    combined.includes('ايس') ||
    combined.includes('أيس') ||
    combined.includes('مكس') ||
    combined.includes('كولد') ||
    combined.includes('iced') ||
    combined.includes('cold') ||
    combined.includes('ice')
  ) {
    return '🧊';
  }

  // 4. Hot Drinks
  if (
    combined.includes('ساخن') ||
    combined.includes('قهوة') ||
    combined.includes('شاي') ||
    combined.includes('اسبريسو') ||
    combined.includes('إسبريسو') ||
    combined.includes('أمريكانو') ||
    combined.includes('كابتشينو') ||
    combined.includes('لاتيه') ||
    combined.includes('نسكافيه') ||
    combined.includes('ميكاتو') ||
    combined.includes('ماكياتو') ||
    combined.includes('موكا') ||
    combined.includes('هوت شوكليت') ||
    combined.includes('أعشاب') ||
    combined.includes('اعشاب') ||
    combined.includes('ينسون') ||
    combined.includes('نعناع') ||
    combined.includes('سحلب') ||
    combined.includes('كرك') ||
    combined.includes('تركية') ||
    combined.includes('تركي') ||
    combined.includes('hot') ||
    combined.includes('coffee') ||
    combined.includes('tea') ||
    combined.includes('espresso') ||
    combined.includes('cappuccino') ||
    combined.includes('latte')
  ) {
    return '☕';
  }

  return '☕';
};

// Database Engine Interface
export const isSugarMaterial = (itemOrName?: any): boolean => {
  if (!itemOrName) return false;
  const name = typeof itemOrName === 'string'
    ? itemOrName
    : (itemOrName.name_ar || itemOrName.name || itemOrName.item_name || '');
  const lower = name.trim().toLowerCase();
  return lower === 'سكر' || lower === 'السكر' || lower.includes('سكر') || lower.includes('sugar');
};

export const dbService = {
  // --- Employee Authentication & Roles ---
  getAuthUsers: (): AuthUser[] => {
    let users = getLocal<AuthUser[]>(KEYS.AUTH_USERS, []);
    if (!users || users.length === 0) {
      setLocal(KEYS.AUTH_USERS, defaultAuthUsers);
      return defaultAuthUsers;
    }
    let updated = false;
    defaultAuthUsers.forEach(defUser => {
      if (!users.some(u => u.username.toLowerCase() === defUser.username.toLowerCase())) {
        users.push(defUser);
        updated = true;
      }
    });
    if (updated) {
      setLocal(KEYS.AUTH_USERS, users);
    }
    return users;
  },

  saveAuthUser: (user: AuthUser): void => {
    const users = dbService.getAuthUsers();
    const idx = users.findIndex(u => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase());
    if (idx > -1) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    setLocal(KEYS.AUTH_USERS, users);
  },

  deleteAuthUser: (id: string): void => {
    const users = dbService.getAuthUsers().filter(u => u.id !== id);
    setLocal(KEYS.AUTH_USERS, users);
  },

  authenticateUser: (username: string, password: string): AuthUser | null => {
    const users = dbService.getAuthUsers();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    const found = users.find(u => {
      if (u.username.trim().toLowerCase() !== cleanUsername || !u.is_active) return false;
      if (u.passwordHash === cleanPassword) return true;

      // Allow common passwords flexible login for cashier
      if (cleanUsername === 'cashier' && (cleanPassword === '123456' || cleanPassword === 'cashier123' || cleanPassword === 'cashier')) return true;

      // Allow common passwords flexible login for admin
      if (cleanUsername === 'admin' && (cleanPassword === 'admin123' || cleanPassword === 'admin')) return true;

      return false;
    });
    return found || null;
  },

  getAuthAuditLogs: (): AuthAuditLog[] => {
    return getLocal<AuthAuditLog[]>(KEYS.AUTH_AUDIT_LOGS, []);
  },

  clearAuthAuditLogs: (): void => {
    setLocal(KEYS.AUTH_AUDIT_LOGS, []);
  },

  addAuthAuditLog: (logData: Omit<AuthAuditLog, 'id'>): AuthAuditLog => {
    const logs = getLocal<AuthAuditLog[]>(KEYS.AUTH_AUDIT_LOGS, []);
    const newLog: AuthAuditLog = {
      id: `auth_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...logData
    };
    logs.unshift(newLog); // latest first
    setLocal(KEYS.AUTH_AUDIT_LOGS, logs.slice(0, 500));
    return newLog;
  },

  // --- Reset & Purge ---
  clearDatabase: (preserveSettings = true) => {
    clearDatabase(preserveSettings);
  },

  loadFromServer: async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/db');
      if (!res.ok) {
        isDatabaseLoadedFromServer = true;
        return false;
      }
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        // We received data from the server! Write it to local storage.
        Object.entries(data).forEach(([key, val]) => {
          if (key === KEYS.INVOICES) {
            // Merge invoices to preserve client's pending (OPEN/DRAFT) invoices
            const localInvoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
            const serverInvoices = val as Invoice[];
            const mergedInvoices = [...serverInvoices];
            
            localInvoices.forEach(localInv => {
              if (localInv.invoice_status === 'OPEN' || localInv.invoice_status === 'DRAFT') {
                const serverIdx = mergedInvoices.findIndex(si => si.id === localInv.id);
                if (serverIdx === -1) {
                  mergedInvoices.push(localInv);
                } else {
                  const localTime = new Date(localInv.updated_at || 0).getTime();
                  const serverTime = new Date(mergedInvoices[serverIdx].updated_at || 0).getTime();
                  if (localTime > serverTime) {
                    mergedInvoices[serverIdx] = localInv;
                  }
                }
              }
            });
            localStorage.setItem(key, JSON.stringify(mergedInvoices));
          } else if (key === KEYS.INVOICE_ITEMS) {
            // Merge invoice items for the merged invoices
            const localItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
            const serverItems = val as InvoiceItem[];
            const mergedItems = [...serverItems];
            
            localItems.forEach(localItem => {
              const localInvoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
              const parentInvoice = localInvoices.find(li => li.id === localItem.invoice_id);
              if (parentInvoice && (parentInvoice.invoice_status === 'OPEN' || parentInvoice.invoice_status === 'DRAFT')) {
                const serverItemIdx = mergedItems.findIndex(si => si.id === localItem.id);
                if (serverItemIdx === -1) {
                  mergedItems.push(localItem);
                } else {
                  const localTime = new Date(localItem.updated_at || 0).getTime();
                  const serverTime = new Date(mergedItems[serverItemIdx].updated_at || 0).getTime();
                  if (localTime > serverTime) {
                    mergedItems[serverItemIdx] = localItem;
                  }
                }
              }
            });
            localStorage.setItem(key, JSON.stringify(mergedItems));
          } else {
            localStorage.setItem(key, JSON.stringify(val));
          }
        });
        isDatabaseLoadedFromServer = true;
        // Trigger a sync back to server to make sure any local pending invoices are written to server
        syncToServer();
        return true;
      } else {
        // Server database is empty or not configured yet.
        // Check if there is already some data in local storage
        isDatabaseLoadedFromServer = true;
        const hasProducts = getLocal<any[]>(KEYS.PRODUCTS, []).length > 0;
        const hasCustomers = getLocal<any[]>(KEYS.CUSTOMERS, []).length > 0;
        if (hasProducts || hasCustomers) {
          // Client has existing local data, so let's push/migrate it to the server!
          syncToServer();
        } else {
          // Seed default settings and empty tables
          seedDatabase(true);
        }
        return false;
      }
    } catch (e) {
      console.error('Error loading data from server:', e);
      isDatabaseLoadedFromServer = true;
      return false;
    }
  },

  syncToServer: () => {
    syncToServer();
  },

  // --- Categories ---
  getCategories: (): Category[] => {
    const list = getLocal<Category[]>(KEYS.CATEGORIES, []);
    const cleanList = list.filter(c => 
      c.id !== 'cat_playstation' && 
      !c.name_ar.includes('بلايستيشن') && 
      !c.name_ar.includes('بليستيشن') && 
      !c.name_en?.includes('PlayStation') &&
      c.id !== 'cat_raw_materials' &&
      !c.name_ar.includes('مواد خام') &&
      !c.name_en?.includes('Raw Materials')
    );
    
    // Deduplicate categories by ID
    const uniqueList: Category[] = [];
    const seenIds = new Set<string>();
    for (const c of cleanList) {
      if (!c.id) continue;
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        uniqueList.push(c);
      }
    }

    if (uniqueList.length !== list.length) {
      setLocal(KEYS.CATEGORIES, uniqueList);
    }
    return uniqueList.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  },
  saveCategory: (category: Category) => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير إضافة أو تعديل التصنيفات.');
    }
    const list = dbService.getCategories();
    const idx = list.findIndex(c => c.id === category.id);
    if (idx > -1) {
      list[idx] = { ...category, updated_at: new Date().toISOString() };
    } else {
      list.push({ ...category, id: `cat_${Date.now()}_${Math.floor(Math.random() * 1000)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    setLocal(KEYS.CATEGORIES, list);
    return list;
  },
  deleteCategory: (id: string) => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير حذف التصنيفات.');
    }
    const categoryToDelete = dbService.getCategories().find(c => c.id === id);
    if (id === 'cat_raw_materials' || (categoryToDelete && categoryToDelete.name_ar.includes('مواد خام'))) {
      localStorage.setItem(KEYS.RAW_MATERIALS_DELETED, 'true');
    }
    const list = dbService.getCategories().filter(c => c.id !== id);
    setLocal(KEYS.CATEGORIES, list);
    return list;
  },

  // --- Products ---
  getProducts: (): Product[] => {
    const list = getLocal<Product[]>(KEYS.PRODUCTS, []);
    const cleanList = list.filter(p => 
      p.id !== 'prod_playstation' && 
      p.category_id !== 'cat_playstation' && 
      !p.name_ar.includes('بلايستيشن') && 
      !p.name_ar.includes('بليستيشن') && 
      !p.name_en?.includes('PlayStation') &&
      p.category_id !== 'cat_raw_materials' &&
      p.is_raw_material !== true &&
      !p.id.startsWith('raw_')
    );
    
    // Deduplicate products by ID
    const uniqueList: Product[] = [];
    const seenIds = new Set<string>();
    for (const p of cleanList) {
      if (!p.id) continue;
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        
        // Auto-populate recipe_ingredients if used_raw_materials is present and recipe_ingredients is empty
        const hasUsedRM = p.used_raw_materials && p.used_raw_materials.length > 0;
        const hasRecipe = p.recipe_ingredients && p.recipe_ingredients.length > 0;
        if (hasUsedRM && !hasRecipe) {
          p.recipe_ingredients = p.used_raw_materials!.map(id => ({
            raw_material_id: id,
            quantity: 1
          }));
        }
        
        uniqueList.push(p);
      }
    }

    if (uniqueList.length !== list.length) {
      setLocal(KEYS.PRODUCTS, uniqueList);
    }
    return uniqueList;
  },
  saveProduct: (product: Product) => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير إضافة أو تعديل المنتجات.');
    }
    const list = dbService.getProducts();
    const idx = list.findIndex(p => p.id === product.id);
    const updatedProd = { ...product, updated_at: new Date().toISOString() };
    if (idx > -1) {
      list[idx] = updatedProd;
    } else {
      updatedProd.id = `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      updatedProd.created_at = new Date().toISOString();
      list.push(updatedProd);
    }
    setLocal(KEYS.PRODUCTS, list);
    return list;
  },
  deleteProduct: (id: string) => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير حذف المنتجات.');
    }
    const list = dbService.getProducts().filter(p => p.id !== id);
    setLocal(KEYS.PRODUCTS, list);
    return list;
  },
  toggleFavorite: (id: string) => {
    const list = dbService.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx > -1) {
      list[idx].is_favorite = !list[idx].is_favorite;
      list[idx].updated_at = new Date().toISOString();
      setLocal(KEYS.PRODUCTS, list);
    }
    return list;
  },

  // --- Customers ---
  getCustomers: (): Customer[] => {
    const list = getLocal<Customer[]>(KEYS.CUSTOMERS, []);
    // Deduplicate customers by ID
    const uniqueList: Customer[] = [];
    const seenIds = new Set<string>();
    for (const c of list) {
      if (!c.id) continue;
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        uniqueList.push(c);
      }
    }
    if (uniqueList.length !== list.length) {
      setLocal(KEYS.CUSTOMERS, uniqueList);
    }
    return uniqueList;
  },
  saveCustomer: (customer: Customer) => {
    const list = dbService.getCustomers();
    const idx = list.findIndex(c => c.id === customer.id);
    const updatedCust = { ...customer, updated_at: new Date().toISOString() };
    if (idx > -1) {
      list[idx] = updatedCust;
    } else {
      updatedCust.id = `cust_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      updatedCust.created_at = new Date().toISOString();
      list.push(updatedCust);
    }
    setLocal(KEYS.CUSTOMERS, list);
    syncToServer();
    return list;
  },
  deleteCustomer: (id: string) => {
    // 1. Remove the customer from the customer list
    const list = dbService.getCustomers().filter(c => c.id !== id);
    setLocal(KEYS.CUSTOMERS, list);

    // 2. Remove all related communication logs
    const commLogs = getLocal<CustomerCommunicationLog[]>(KEYS.COMMUNICATION_LOGS, []).filter(l => l.customer_id !== id);
    setLocal(KEYS.COMMUNICATION_LOGS, commLogs);

    // 3. Remove all related credit payments (safety cleanup)
    const payments = getLocal<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []).filter(p => p.customer_id !== id);
    setLocal(KEYS.CREDIT_PAYMENTS, payments);

    // 4. Remove all related invoices (safety cleanup)
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []).filter(inv => inv.customer_id !== id);
    setLocal(KEYS.INVOICES, invoices);

    // Cleanup wallet, notes, visits
    const walletTxs = getLocal<any[]>(KEYS.WALLET_TRANSACTIONS, []).filter(tx => tx.customer_id !== id);
    setLocal(KEYS.WALLET_TRANSACTIONS, walletTxs);

    const notes = getLocal<any[]>(KEYS.CUSTOMER_NOTES, []).filter(n => n.customer_id !== id);
    setLocal(KEYS.CUSTOMER_NOTES, notes);

    const visits = getLocal<any[]>(KEYS.CUSTOMER_VISITS, []).filter(v => v.customer_id !== id);
    setLocal(KEYS.CUSTOMER_VISITS, visits);

    syncToServer();
    return list;
  },

  // --- Wallet Transactions ---
  getWalletTransactions: (customerId?: string): WalletTransaction[] => {
    const list = getLocal<WalletTransaction[]>(KEYS.WALLET_TRANSACTIONS, []);
    if (customerId) {
      return list.filter(tx => tx.customer_id === customerId);
    }
    return list;
  },
  saveWalletTransaction: (tx: Omit<WalletTransaction, 'id' | 'created_at'> & { created_at?: string }): WalletTransaction => {
    const list = getLocal<WalletTransaction[]>(KEYS.WALLET_TRANSACTIONS, []);
    const newTx: WalletTransaction = {
      ...tx,
      id: `wtx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      created_at: tx.created_at || new Date().toISOString()
    };
    list.push(newTx);
    setLocal(KEYS.WALLET_TRANSACTIONS, list);

    // Update customer wallet balance in database
    const customers = dbService.getCustomers();
    const custIdx = customers.findIndex(c => c.id === tx.customer_id);
    if (custIdx > -1) {
      customers[custIdx].wallet_balance = tx.new_balance;
      customers[custIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.CUSTOMERS, customers);
    }

    // Automatically record a cash movement for Deposits and Withdrawals to keep cash drawer synced
    if (tx.transaction_type === 'DEPOSIT') {
      dbService.logCashMovement(tx.amount, 0, `إيداع محفظة عميل: ${tx.customer_name} - ${tx.notes}`);
    } else if (tx.transaction_type === 'WITHDRAWAL') {
      dbService.logCashMovement(0, tx.amount, `سحب من محفظة عميل: ${tx.customer_name} - ${tx.notes}`);
    }

    // Record inside the system audit log for full audit compliance
    dbService.logAuditAction(
      'WALLET_TRANSACTION',
      `عملية محفظة لعميل: ${tx.customer_name}، النوع: ${tx.transaction_type}، بمبلغ: ${tx.amount} ج.م، الرصيد قبل: ${tx.previous_balance} ج.م، الرصيد بعد: ${tx.new_balance} ج.م. ملاحظات: ${tx.notes || 'لا يوجد'}`,
      tx.user || 'أدمن النظام'
    );

    syncToServer();
    return newTx;
  },

  // --- Customer Notes ---
  getCustomerNotes: (customerId: string): CustomerNote[] => {
    const list = getLocal<CustomerNote[]>(KEYS.CUSTOMER_NOTES, []);
    return list.filter(n => n.customer_id === customerId);
  },
  saveCustomerNote: (note: Omit<CustomerNote, 'id' | 'created_at'>): CustomerNote => {
    const list = getLocal<CustomerNote[]>(KEYS.CUSTOMER_NOTES, []);
    const newNote: CustomerNote = {
      ...note,
      id: `cnote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString()
    };
    list.push(newNote);
    setLocal(KEYS.CUSTOMER_NOTES, list);
    return newNote;
  },
  deleteCustomerNote: (id: string): void => {
    const list = getLocal<CustomerNote[]>(KEYS.CUSTOMER_NOTES, []);
    const filtered = list.filter(n => n.id !== id);
    setLocal(KEYS.CUSTOMER_NOTES, filtered);
  },

  // --- Customer Visits ---
  getCustomerVisits: (customerId: string): CustomerVisit[] => {
    const list = getLocal<CustomerVisit[]>(KEYS.CUSTOMER_VISITS, []);
    return list.filter(v => v.customer_id === customerId);
  },
  saveCustomerVisit: (visit: Omit<CustomerVisit, 'id' | 'created_at'>): CustomerVisit => {
    const list = getLocal<CustomerVisit[]>(KEYS.CUSTOMER_VISITS, []);
    const newVisit: CustomerVisit = {
      ...visit,
      id: `cvisit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString()
    };
    list.push(newVisit);
    setLocal(KEYS.CUSTOMER_VISITS, list);

    // Update customer's last_visit date
    const customers = dbService.getCustomers();
    const custIdx = customers.findIndex(c => c.id === visit.customer_id);
    if (custIdx > -1) {
      customers[custIdx].last_visit = newVisit.created_at;
      setLocal(KEYS.CUSTOMERS, customers);
    }

    return newVisit;
  },

  recordVisitForInvoice: (customerId: string | null, invoiceId: string, invoiceNumber: string, totalSpent: number) => {
    if (!customerId || customerId === 'c_general') return;
    try {
      const visits = getLocal<CustomerVisit[]>(KEYS.CUSTOMER_VISITS, []);
      // Check if visit for this invoice already exists to avoid duplication
      if (visits.some(v => v.invoice_id === invoiceId)) return;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0];

      const newVisit: CustomerVisit = {
        id: `cvisit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        customer_id: customerId,
        visit_date: todayStr,
        visit_time: timeStr,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        total_spent: totalSpent,
        notes: `فاتورة مبيعات رقم ${invoiceNumber}`,
        created_at: now.toISOString()
      };
      visits.push(newVisit);
      setLocal(KEYS.CUSTOMER_VISITS, visits);

      // Also update customer's last_visit
      const customers = dbService.getCustomers();
      const custIdx = customers.findIndex(c => c.id === customerId);
      if (custIdx > -1) {
        customers[custIdx].last_visit = newVisit.created_at;
        setLocal(KEYS.CUSTOMERS, customers);
      }
    } catch (e) {
      console.error('Error recording invoice visit:', e);
    }
  },

  // --- Suppliers ---
  getSuppliers: (): Supplier[] => getLocal<Supplier[]>(KEYS.SUPPLIERS, []),
  saveSupplier: (supplier: Supplier) => {
    const list = dbService.getSuppliers();
    const idx = list.findIndex(s => s.id === supplier.id);
    const updatedSup = { ...supplier, updated_at: new Date().toISOString() };
    if (idx > -1) {
      list[idx] = updatedSup;
    } else {
      updatedSup.id = `sup_${Date.now()}`;
      updatedSup.created_at = new Date().toISOString();
      list.push(updatedSup);
    }
    setLocal(KEYS.SUPPLIERS, list);
    return list;
  },
  deleteSupplier: (id: string) => {
    const list = dbService.getSuppliers().filter(s => s.id !== id);
    setLocal(KEYS.SUPPLIERS, list);
    return list;
  },

  getSupplierPurchases: (): SupplierPurchase[] => getLocal<SupplierPurchase[]>('cafe_supplier_purchases', []),
  saveSupplierPurchase: (purchase: SupplierPurchase) => {
    const list = dbService.getSupplierPurchases();
    const idx = list.findIndex(p => p.id === purchase.id);
    if (idx > -1) {
      list[idx] = purchase;
    } else {
      purchase.id = `pur_${Date.now()}`;
      purchase.created_at = new Date().toISOString();
      list.push(purchase);
    }
    setLocal('cafe_supplier_purchases', list);
    return list;
  },
  deleteSupplierPurchase: (id: string) => {
    const list = dbService.getSupplierPurchases().filter(p => p.id !== id);
    setLocal('cafe_supplier_purchases', list);
    return list;
  },

  getSupplierPayments: (): SupplierPayment[] => getLocal<SupplierPayment[]>('cafe_supplier_payments', []),
  saveSupplierPayment: (payment: SupplierPayment) => {
    const list = dbService.getSupplierPayments();
    const idx = list.findIndex(p => p.id === payment.id);
    if (idx > -1) {
      list[idx] = payment;
    } else {
      payment.id = `pay_${Date.now()}`;
      payment.created_at = new Date().toISOString();
      list.push(payment);
    }
    setLocal('cafe_supplier_payments', list);
    return list;
  },
  deleteSupplierPayment: (id: string) => {
    const list = dbService.getSupplierPayments().filter(p => p.id !== id);
    setLocal('cafe_supplier_payments', list);
    return list;
  },

  // --- Invoices & Sales Engine ---
  determinePaymentStatus: (invoice: {
    invoice_status: InvoiceStatus;
    paid_amount: number;
    remaining_amount: number;
    total: number;
    payment_type: PaymentType;
  }): PaymentStatus => {
    if (invoice.invoice_status === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (invoice.paid_amount >= invoice.total) {
      return 'PAID';
    }
    if (invoice.paid_amount > 0 && invoice.remaining_amount > 0) {
      return 'PARTIAL';
    }
    if (invoice.paid_amount === 0 && invoice.payment_type === 'CREDIT') {
      return 'UNPAID';
    }
    if (invoice.remaining_amount <= 0) {
      return 'PAID';
    }
    return 'UNPAID';
  },

  getInvoices: (includeOpen = false): Invoice[] => {
    const list = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const baristaOrders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    const mapped = list.map(inv => {
      if (!inv.payment_status) {
        inv.payment_status = dbService.determinePaymentStatus(inv);
      }
      if (!inv.operational_status) {
        const bo = baristaOrders.find(b => b.invoice_id === inv.id || b.order_number === inv.invoice_number);
        inv.operational_status = bo ? bo.status : 'NEW';
      }
      return inv;
    });
    if (includeOpen) {
      return mapped;
    }
    return mapped.filter(inv => inv.invoice_status !== 'OPEN' && inv.invoice_status !== 'DRAFT');
  },
  getOpenInvoices: (): Invoice[] => {
    const list = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const baristaOrders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    return list
      .filter(inv => inv.invoice_status === 'OPEN' || inv.invoice_status === 'DRAFT')
      .map(inv => {
        if (!inv.payment_status) {
          inv.payment_status = dbService.determinePaymentStatus(inv);
        }
        if (!inv.operational_status) {
          const bo = baristaOrders.find(b => b.invoice_id === inv.id || b.order_number === inv.invoice_number);
          inv.operational_status = bo ? bo.status : 'NEW';
        }
        return inv;
      });
  },
  getInvoiceById: (id: string): { invoice: Invoice; items: InvoiceItem[] } | null => {
    const list = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const inv = list.find(i => i.id === id);
    if (!inv) return null;
    if (!inv.payment_status) {
      inv.payment_status = dbService.determinePaymentStatus(inv);
    }
    const items = dbService.getInvoiceItems(id);
    return { invoice: inv, items };
  },
  archiveInvoices: (adminPin: string): boolean => {
    const settings = dbService.getSettings();
    if (adminPin !== settings.pin_code) {
      throw new Error('رمز الأمان PIN للمسؤول غير صحيح!');
    }
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const updated = invoices.map(inv => ({ ...inv, is_archived: true }));
    setLocal(KEYS.INVOICES, updated);
    return true;
  },
  getInvoiceItems: (invoiceId?: string): InvoiceItem[] => {
    const items = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    if (invoiceId) {
      return items.filter(it => it.invoice_id === invoiceId);
    }
    return items;
  },

  /**
   * CRITICAL TRANSACTION: createInvoice
   * - Atomically creates invoices and invoice items
   * - Automatically reduces inventory on product stock level
   * - Registers transaction log
   * - Adjusts customer credit balance if the method is credit
   * - Updates the active cash drawer balance if the method is cash/split
   */
  createInvoice: (
    cartItems: CartItem[],
    paymentType: PaymentType,
    customerId: string | null,
    discountAmount: number,
    taxPercentage: number,
    paidAmount: number,
    cashierName: string,
    invoiceNotes = '',
    tableNumber = '',
    paymentMethod?: string,
    referenceNumber?: string,
    paymentNotes?: string,
    walletDeduction = 0,
    paymentNumber?: string,
    senderPhone?: string,
    receiptImageUrl?: string
  ): { invoice: Invoice; items: InvoiceItem[] } => {
    const invoices = dbService.getInvoices();
    const invoiceItemsList = dbService.getInvoiceItems();
    const products = dbService.getProducts();
    const rawMaterialsList = dbService.getRawMaterials();
    const customersList = dbService.getCustomers();
    const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);

    // 0. Check inventory sufficiency first
    const check = dbService.checkInventorySufficiency(cartItems);
    if (!check.sufficient) {
      throw new Error(check.message || 'المخزون غير كافٍ لإتمام عملية البيع!');
    }

    // 1. Calculations
    let subtotal = 0;
    let totalItemDiscount = 0;
    cartItems.forEach(item => {
      const price = item.custom_price !== undefined ? item.custom_price : item.product.selling_price;
      subtotal += price * item.quantity;
      if (item.item_discount_amount) {
        totalItemDiscount += item.item_discount_amount;
      }
    });

    const totalDiscountAmount = discountAmount + totalItemDiscount;
    const taxAmount = Math.round((subtotal - totalDiscountAmount) * (taxPercentage / 100));
    const total = subtotal - totalDiscountAmount + taxAmount;

    let remainingAmount = 0;
    let actualPaid = paidAmount;
    let status: InvoiceStatus = 'PAID';

    if (paymentType === 'CREDIT') {
      status = 'CREDIT';
      actualPaid = 0;
      remainingAmount = total;
    } else if (paymentType === 'SPLIT') {
      remainingAmount = Math.max(0, total - paidAmount);
      status = remainingAmount > 0 ? 'CREDIT' : 'PAID';
    } else {
      actualPaid = total;
      status = 'PAID';
    }

    // 2. Generate Invoice Number (Format: INV-2026-XXXX)
    const year = new Date().getFullYear();
    const seq = String(invoices.length + 1).padStart(5, '0');
    const invoiceNum = `INV-${year}-${seq}`;

    const invoiceId = `inv_${Date.now()}`;
    const invoiceDate = new Date().toISOString();

    const appSettings = dbService.getSettings();
    const sanitizedMethod = sanitizePaymentMethod(
      paymentMethod,
      senderPhone,
      referenceNumber,
      receiptImageUrl,
      paymentNumber,
      appSettings.vodafone_cash_number,
      appSettings.instapay_number
    );

    const newInvoice: Invoice = {
      id: invoiceId,
      invoice_number: invoiceNum,
      customer_id: customerId,
      payment_type: paymentType,
      subtotal,
      discount: totalDiscountAmount,
      tax: taxAmount,
      total,
      paid_amount: actualPaid,
      remaining_amount: remainingAmount,
      invoice_status: status,
      payment_status: dbService.determinePaymentStatus({
        invoice_status: status,
        paid_amount: actualPaid,
        remaining_amount: remainingAmount,
        total,
        payment_type: paymentType
      }),
      cashier_name: cashierName,
      invoice_date: invoiceDate,
      notes: invoiceNotes,
      table_number: tableNumber,
      payment_method: sanitizedMethod || (paymentType === 'CREDIT' ? 'CREDIT' : 'CASH'),
      reference_number: referenceNumber || '',
      sender_phone: senderPhone || '',
      senderPhone: senderPhone || '',
      receipt_image_url: receiptImageUrl || '',
      receiptImageUrl: receiptImageUrl || '',
      payment_number: paymentNumber,
      payment_date: new Date().toISOString().split('T')[0],
      payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      created_at: invoiceDate,
      updated_at: invoiceDate,
    };

    const newItems: InvoiceItem[] = [];

    // 3. Process Cart Items, Stock Reductions & Transactions
    cartItems.forEach(cartItem => {
      const prodIdx = products.findIndex(p => p.id === cartItem.product.id);
      if (prodIdx > -1) {
        const prod = products[prodIdx];
        // Enforce non-negative stock (safety catch)
        const finalStock = Math.max(0, prod.current_stock - cartItem.quantity);
        products[prodIdx].current_stock = finalStock;
        products[prodIdx].updated_at = new Date().toISOString();

        // Register transaction
        const trans: InventoryTransaction = {
          id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: prod.id,
          transaction_type: 'Sale',
          quantity: cartItem.quantity,
          reason: `بيع بموجب فاتورة رقم ${invoiceNum}`,
          transaction_date: invoiceDate,
          created_at: invoiceDate,
          updated_at: invoiceDate,
        };
        transactions.push(trans);

        // Deduct raw material recipe ingredients
        if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
          prod.recipe_ingredients.forEach(ingredient => {
            const rawIdx = rawMaterialsList.findIndex(r => r.id === ingredient.raw_material_id);
            if (rawIdx > -1) {
              const rawMat = rawMaterialsList[rawIdx];
              const cupsSold = cartItem.quantity;
              
              // Register transaction for raw material consumption
              const ingTrans: InventoryTransaction = {
                id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                product_id: rawMat.id,
                transaction_type: 'Waste',
                quantity: cupsSold,
                reason: `استهلاك تلقائي: تحضير ${cartItem.quantity} كوب من ${prod.name_ar} بموجب فاتورة رقم ${invoiceNum}`,
                transaction_date: invoiceDate,
                created_at: invoiceDate,
                updated_at: invoiceDate,
              };
              transactions.push(ingTrans);

              // Deduct cups from batch inventory
              dbService.consumeInventoryBatches(
                ingredient.raw_material_id,
                cupsSold,
                invoiceId,
                invoiceNum,
                prod.name_ar,
                cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
                cashierName,
                cartItem.quantity
              );
            } else {
              const ingIdx = products.findIndex(p => p.id === ingredient.raw_material_id);
              if (ingIdx > -1) {
                const ingProd = products[ingIdx];
                const cupsSold = cartItem.quantity;
                ingProd.current_stock = Math.max(0, ingProd.current_stock - cupsSold);
                ingProd.updated_at = new Date().toISOString();

                // Register transaction
                const ingTrans: InventoryTransaction = {
                  id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  product_id: ingProd.id,
                  transaction_type: 'Waste',
                  quantity: cupsSold,
                  reason: `استهلاك تلقائي: تحضير ${cartItem.quantity} كوب من ${prod.name_ar} بموجب فاتورة رقم ${invoiceNum}`,
                  transaction_date: invoiceDate,
                  created_at: invoiceDate,
                  updated_at: invoiceDate,
                };
                transactions.push(ingTrans);

                // Deduct from batch inventory
                dbService.consumeInventoryBatches(
                  ingredient.raw_material_id,
                  cupsSold,
                  invoiceId,
                  invoiceNum,
                  prod.name_ar,
                  cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
                  cashierName,
                  cartItem.quantity
                );
              }
            }
          });
        } else {
          // Deduct from batch inventory (ready-made products)
          dbService.consumeInventoryBatches(
            prod.id,
            cartItem.quantity,
            invoiceId,
            invoiceNum,
            prod.name_ar,
            cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
            cashierName,
            cartItem.quantity
          );
        }

        // Auto deduct Sugar for drinks/products using sugar if not already in recipe_ingredients
        const sugarRm = rawMaterialsList.find(r => isSugarMaterial(r.name));
        if (sugarRm) {
          const recipeHasSugar = prod.recipe_ingredients?.some(ri => {
            const rmItem = rawMaterialsList.find(r => r.id === ri.raw_material_id);
            return rmItem && isSugarMaterial(rmItem.name);
          });
          if (!recipeHasSugar) {
            dbService.consumeInventoryBatches(
              sugarRm.id,
              cartItem.quantity,
              invoiceId,
              invoiceNum,
              prod.name_ar,
              0,
              cashierName,
              cartItem.quantity
            );
          }
        }
      }

      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const itemTotalPrice = (unitPrice * cartItem.quantity) - (cartItem.item_discount_amount || 0);
      
      const invoiceItem: InvoiceItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        invoice_id: invoiceId,
        product_id: cartItem.product.id,
        quantity: cartItem.quantity,
        unit_price: unitPrice,
        cost_price: cartItem.product.cost_price,
        total_price: itemTotalPrice,
        product_name_ar: cartItem.product.name_ar,
        created_at: invoiceDate,
        updated_at: invoiceDate,
        original_price: cartItem.product.selling_price,
        is_price_edited: cartItem.is_price_edited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount,
      };

      newItems.push(invoiceItem);
      invoiceItemsList.push(invoiceItem);

      // Permanently Log Modification actions to ItemModification table
      if (cartItem.is_price_edited) {
        dbService.logItemModification({
          invoice_id: invoiceId,
          invoice_number: invoiceNum,
          type: 'PRICE_CHANGE',
          product_id: cartItem.product.id,
          product_name: cartItem.product.name_ar,
          original_price: cartItem.product.selling_price,
          new_price: unitPrice,
          difference: unitPrice - cartItem.product.selling_price,
          reason: cartItem.price_edit_reason || 'تعديل سعر يدوي',
          quantity: cartItem.quantity,
          cashier: cashierName
        });
      }

      if (cartItem.item_discount_amount && cartItem.item_discount_amount > 0) {
        dbService.logItemModification({
          invoice_id: invoiceId,
          invoice_number: invoiceNum,
          type: 'DISCOUNT',
          product_id: cartItem.product.id,
          product_name: cartItem.product.name_ar,
          original_price: unitPrice,
          new_price: unitPrice - (cartItem.item_discount_amount / cartItem.quantity),
          difference: -(cartItem.item_discount_amount / cartItem.quantity),
          discount_type: cartItem.item_discount_type || 'fixed',
          discount_value: cartItem.item_discount_value || cartItem.item_discount_amount,
          discount_amount: cartItem.item_discount_amount,
          reason: 'خصم على مستوى الصنف',
          quantity: cartItem.quantity,
          cashier: cashierName
        });
      }
    });

    // Log general invoice-level discount if any
    if (discountAmount > 0) {
      dbService.logItemModification({
        invoice_id: invoiceId,
        invoice_number: invoiceNum,
        type: 'DISCOUNT',
        product_id: 'invoice_discount',
        product_name: 'خصم الفاتورة الإجمالي',
        original_price: subtotal,
        new_price: subtotal - discountAmount,
        difference: -discountAmount,
        discount_type: 'fixed',
        discount_value: discountAmount,
        discount_amount: discountAmount,
        reason: 'خصم إجمالي على الفاتورة',
        quantity: 1,
        cashier: cashierName
      });
    }

    // 4. If Credit, Update Customer Balance & credit transaction log
    if ((paymentType === 'CREDIT' || paymentType === 'SPLIT') && customerId && customerId !== 'c_general' && remainingAmount > 0) {
      const custIdx = customersList.findIndex(c => c.id === customerId);
      if (custIdx > -1) {
        const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
        recordCreditTransactionInternal(creditTxs, customersList, {
          customer_id: customerId,
          customer_name: customersList[custIdx].full_name,
          invoice_id: invoiceId,
          transaction_type: 'INVOICE',
          amount: remainingAmount,
          notes: invoiceNotes ? `مبيعات بالآجل فاتورة رقم ${invoiceNum}: ${invoiceNotes}` : `مبيعات بالآجل فاتورة رقم ${invoiceNum}`,
          created_by: cashierName
        });
        setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
      }
    }

    // 4.5 Process Wallet Deduction if any
    if (walletDeduction > 0 && customerId && customerId !== 'c_general') {
      const custIdx = customersList.findIndex(c => c.id === customerId);
      if (custIdx > -1) {
        const cust = customersList[custIdx];
        const oldBal = cust.wallet_balance || 0;
        const newBal = oldBal - walletDeduction;
        customersList[custIdx].wallet_balance = newBal;
        customersList[custIdx].updated_at = new Date().toISOString();

        // Push directly to wallet transactions list
        const wtxList = getLocal<WalletTransaction[]>(KEYS.WALLET_TRANSACTIONS, []);
        const newWtx: WalletTransaction = {
          id: `wtx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          customer_id: customerId,
          customer_name: cust.full_name,
          transaction_type: 'INVOICE_PAYMENT',
          amount: walletDeduction,
          previous_balance: oldBal,
          new_balance: newBal,
          notes: `خصم سداد فاتورة مبيعات رقم ${invoiceNum}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          user: cashierName,
          created_at: new Date().toISOString()
        };
        wtxList.push(newWtx);
        setLocal(KEYS.WALLET_TRANSACTIONS, wtxList);

        // Add to system Audit Log
        dbService.logAuditAction(
          'WALLET_TRANSACTION',
          `عملية محفظة لعميل: ${cust.full_name}، النوع: INVOICE_PAYMENT، بمبلغ: ${walletDeduction} ج.م، الرصيد قبل: ${oldBal} ج.م، الرصيد بعد: ${newBal} ج.م. ملاحظات: خصم سداد فاتورة مبيعات رقم ${invoiceNum}`,
          cashierName
        );
      }
    }

    // 5. Update Cash Drawer Immediately (Net of Wallet Deduction to avoid double counts)
    const netCashPaid = actualPaid - walletDeduction;
    if (netCashPaid > 0) {
      dbService.logCashMovement(netCashPaid, 0, `مبيعات نقداً فاتورة رقم ${invoiceNum}`);
    }

    // Save All back to storage (Atomic Commit)
    invoices.push(newInvoice);
    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, invoiceItemsList);
    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.RAW_MATERIALS, rawMaterialsList);
    setLocal(KEYS.CUSTOMERS, customersList);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);

    // Track customer visit automatically
    if (customerId && customerId !== 'c_general') {
      try {
        dbService.recordVisitForInvoice(customerId, newInvoice.id, invoiceNum, total);
      } catch (e) {
        console.error('Error auto-logging visit in createInvoice:', e);
      }
    }

    return { invoice: newInvoice, items: newItems };
  },

  saveOpenInvoice: (
    id: string | undefined,
    cartItems: CartItem[],
    paymentType: PaymentType,
    customerId: string | null,
    discountAmount: number,
    taxPercentage: number,
    paidAmount: number,
    cashierName: string,
    invoiceNotes = '',
    tableNumber = '',
    paymentMethod?: string,
    referenceNumber?: string,
    paymentNotes?: string,
    status: InvoiceStatus = 'OPEN',
    senderPhone?: string,
    receiptImageUrl?: string
  ): { invoice: Invoice; items: InvoiceItem[] } => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const invoiceItemsList = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    const dateStr = new Date().toISOString();

    let subtotal = 0;
    let totalItemDiscount = 0;
    cartItems.forEach(item => {
      const price = item.custom_price !== undefined ? item.custom_price : item.product.selling_price;
      subtotal += price * item.quantity;
      if (item.item_discount_amount) {
        totalItemDiscount += item.item_discount_amount;
      }
    });

    const totalDiscountAmount = discountAmount + totalItemDiscount;
    const taxAmount = Math.round((subtotal - totalDiscountAmount) * (taxPercentage / 100));
    const total = subtotal - totalDiscountAmount + taxAmount;

    let invoiceId = id || `inv_${Date.now()}`;
    let existingInvIdx = id ? invoices.findIndex(i => i.id === id) : -1;

    const appSettings = dbService.getSettings();

    let invoice: Invoice;
    if (existingInvIdx > -1) {
      const existingInv = invoices[existingInvIdx];
      const effSenderPhone = senderPhone !== undefined ? senderPhone : (existingInv.sender_phone || existingInv.senderPhone || '');
      const effRefNo = referenceNumber !== undefined ? referenceNumber : (existingInv.reference_number || existingInv.referenceNumber || '');
      const effReceiptUrl = receiptImageUrl !== undefined ? receiptImageUrl : (existingInv.receipt_image_url || existingInv.receiptImageUrl || '');
      const effPayNum = existingInv.payment_number || '';
      const effMethod = paymentMethod || existingInv.payment_method;

      const sanitizedMethod = sanitizePaymentMethod(
        effMethod,
        effSenderPhone,
        effRefNo,
        effReceiptUrl,
        effPayNum,
        appSettings.vodafone_cash_number,
        appSettings.instapay_number
      );

      invoice = {
        ...existingInv,
        customer_id: customerId,
        payment_type: paymentType,
        subtotal,
        discount: totalDiscountAmount,
        tax: taxAmount,
        total,
        paid_amount: 0,
        remaining_amount: total,
        invoice_status: status,
        notes: invoiceNotes,
        table_number: tableNumber,
        payment_method: sanitizedMethod || 'CASH',
        reference_number: effRefNo,
        sender_phone: effSenderPhone,
        senderPhone: effSenderPhone,
        receipt_image_url: effReceiptUrl,
        receiptImageUrl: effReceiptUrl,
        updated_at: dateStr
      };
      invoices[existingInvIdx] = invoice;
    } else {
      const year = new Date().getFullYear();
      const seq = String(invoices.length + 1).padStart(5, '0');
      const invoiceNum = `INV-${year}-${seq}`;

      const sanitizedMethod = sanitizePaymentMethod(
        paymentMethod,
        senderPhone,
        referenceNumber,
        receiptImageUrl,
        '',
        appSettings.vodafone_cash_number,
        appSettings.instapay_number
      );

      invoice = {
        id: invoiceId,
        invoice_number: invoiceNum,
        customer_id: customerId,
        payment_type: paymentType,
        subtotal,
        discount: totalDiscountAmount,
        tax: taxAmount,
        total,
        paid_amount: 0,
        remaining_amount: total,
        invoice_status: status,
        cashier_name: cashierName,
        invoice_date: dateStr,
        notes: invoiceNotes,
        table_number: tableNumber,
        payment_method: sanitizedMethod || 'CASH',
        reference_number: referenceNumber || '',
        sender_phone: senderPhone || '',
        senderPhone: senderPhone || '',
        receipt_image_url: receiptImageUrl || '',
        receiptImageUrl: receiptImageUrl || '',
        payment_date: dateStr.split('T')[0],
        payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        created_at: dateStr,
        updated_at: dateStr
      };
      invoices.push(invoice);
    }

    // Save items
    const filteredItems = invoiceItemsList.filter(item => item.invoice_id !== invoiceId);
    const newItems: InvoiceItem[] = cartItems.map(cartItem => {
      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const itemTotalPrice = (unitPrice * cartItem.quantity) - (cartItem.item_discount_amount || 0);
      return {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        invoice_id: invoiceId,
        product_id: cartItem.product.id,
        quantity: cartItem.quantity,
        unit_price: unitPrice,
        cost_price: cartItem.product.cost_price,
        total_price: itemTotalPrice,
        product_name_ar: cartItem.product.name_ar,
        created_at: dateStr,
        updated_at: dateStr,
        original_price: cartItem.product.selling_price,
        is_price_edited: cartItem.is_price_edited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount
      };
    });

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, [...filteredItems, ...newItems]);
    syncToServer();

    return { invoice, items: newItems };
  },

  closeOpenInvoice: (
    id: string,
    cartItems: CartItem[],
    paymentType: PaymentType,
    customerId: string | null,
    discountAmount: number,
    taxPercentage: number,
    paidAmount: number,
    cashierName: string,
    invoiceNotes = '',
    tableNumber = '',
    paymentMethod?: string,
    referenceNumber?: string,
    paymentNotes?: string,
    walletDeduction = 0,
    paymentNumber?: string,
    senderPhone?: string,
    receiptImageUrl?: string
  ): { invoice: Invoice; items: InvoiceItem[] } => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const invoiceItemsList = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    const products = dbService.getProducts();
    const rawMaterialsList = dbService.getRawMaterials();
    const customersList = dbService.getCustomers();
    const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    const dateStr = new Date().toISOString();

    const invIdx = invoices.findIndex(i => i.id === id);
    if (invIdx === -1) {
      throw new Error('الفاتورة غير موجودة!');
    }

    const existingInvoice = invoices[invIdx];

    // Check inventory sufficiency first
    const check = dbService.checkInventorySufficiency(cartItems);
    if (!check.sufficient) {
      throw new Error(check.message || 'المخزون غير كافٍ لإتمام عملية البيع!');
    }

    let subtotal = 0;
    let totalItemDiscount = 0;
    cartItems.forEach(item => {
      const price = item.custom_price !== undefined ? item.custom_price : item.product.selling_price;
      subtotal += price * item.quantity;
      if (item.item_discount_amount) {
        totalItemDiscount += item.item_discount_amount;
      }
    });

    const totalDiscountAmount = discountAmount + totalItemDiscount;
    const taxAmount = Math.round((subtotal - totalDiscountAmount) * (taxPercentage / 100));
    const total = subtotal - totalDiscountAmount + taxAmount;

    let remainingAmount = 0;
    let actualPaid = paidAmount;

    if (paymentType === 'CREDIT') {
      actualPaid = 0;
      remainingAmount = total;
    } else if (paymentType === 'SPLIT') {
      remainingAmount = Math.max(0, total - paidAmount);
    } else {
      actualPaid = total;
    }

    const appSettings = dbService.getSettings();
    const effSenderPhone = senderPhone !== undefined ? senderPhone : (existingInvoice.sender_phone || existingInvoice.senderPhone || '');
    const effRefNo = referenceNumber || existingInvoice.reference_number || existingInvoice.referenceNumber || '';
    const effReceiptUrl = receiptImageUrl !== undefined ? receiptImageUrl : (existingInvoice.receipt_image_url || existingInvoice.receiptImageUrl || '');
    const effPayNum = paymentNumber || existingInvoice.payment_number || '';
    const effMethod = paymentMethod || existingInvoice.payment_method;

    const sanitizedMethod = sanitizePaymentMethod(
      effMethod,
      effSenderPhone,
      effRefNo,
      effReceiptUrl,
      effPayNum,
      appSettings.vodafone_cash_number,
      appSettings.instapay_number
    );

    const updatedInvoice: Invoice = {
      ...existingInvoice,
      customer_id: customerId,
      payment_type: paymentType,
      subtotal,
      discount: totalDiscountAmount,
      tax: taxAmount,
      total,
      paid_amount: actualPaid,
      remaining_amount: remainingAmount,
      invoice_status: 'CLOSED',
      payment_status: dbService.determinePaymentStatus({
        invoice_status: 'CLOSED',
        paid_amount: actualPaid,
        remaining_amount: remainingAmount,
        total,
        payment_type: paymentType
      }),
      cashier_name: cashierName,
      notes: invoiceNotes,
      table_number: tableNumber,
      payment_method: sanitizedMethod || (paymentType === 'CREDIT' ? 'CREDIT' : 'CASH'),
      reference_number: effRefNo,
      sender_phone: effSenderPhone,
      senderPhone: effSenderPhone,
      receipt_image_url: effReceiptUrl,
      receiptImageUrl: effReceiptUrl,
      payment_number: effPayNum,
      payment_date: dateStr.split('T')[0],
      payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      updated_at: dateStr,
    };

    invoices[invIdx] = updatedInvoice;

    const filteredItems = invoiceItemsList.filter(item => item.invoice_id !== id);
    const newItems: InvoiceItem[] = [];

    cartItems.forEach(cartItem => {
      const prodIdx = products.findIndex(p => p.id === cartItem.product.id);
      if (prodIdx > -1) {
        const prod = products[prodIdx];
        const finalStock = Math.max(0, prod.current_stock - cartItem.quantity);
        products[prodIdx].current_stock = finalStock;
        products[prodIdx].updated_at = dateStr;

        const trans: InventoryTransaction = {
          id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: prod.id,
          transaction_type: 'Sale',
          quantity: cartItem.quantity,
          reason: `بيع بموجب فاتورة مغلقة رقم ${existingInvoice.invoice_number}`,
          transaction_date: dateStr,
          created_at: dateStr,
          updated_at: dateStr,
        };
        transactions.push(trans);

        // Deduct raw material recipe ingredients
        if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
          prod.recipe_ingredients.forEach(ingredient => {
            const rawIdx = rawMaterialsList.findIndex(r => r.id === ingredient.raw_material_id);
            if (rawIdx > -1) {
              const rawMat = rawMaterialsList[rawIdx];
              const cupsSold = cartItem.quantity;

              // Register transaction for raw material consumption
              const ingTrans: InventoryTransaction = {
                id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                product_id: rawMat.id,
                transaction_type: 'Waste',
                quantity: cupsSold,
                reason: `استهلاك تلقائي: تحضير ${cartItem.quantity} كوب من ${prod.name_ar} بموجب فاتورة مغلقة رقم ${existingInvoice.invoice_number}`,
                transaction_date: dateStr,
                created_at: dateStr,
                updated_at: dateStr,
              };
              transactions.push(ingTrans);

              // Deduct from batch inventory
              dbService.consumeInventoryBatches(
                ingredient.raw_material_id,
                cupsSold,
                id,
                existingInvoice.invoice_number,
                prod.name_ar,
                cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
                cashierName,
                cartItem.quantity
              );
            } else {
              const ingIdx = products.findIndex(p => p.id === ingredient.raw_material_id);
              if (ingIdx > -1) {
                const ingProd = products[ingIdx];
                const cupsSold = cartItem.quantity;
                ingProd.current_stock = Math.max(0, ingProd.current_stock - cupsSold);
                ingProd.updated_at = new Date().toISOString();

                // Register transaction
                const ingTrans: InventoryTransaction = {
                  id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  product_id: ingProd.id,
                  transaction_type: 'Waste',
                  quantity: cupsSold,
                  reason: `استهلاك تلقائي: تحضير ${cartItem.quantity} كوب من ${prod.name_ar} بموجب فاتورة مغلقة رقم ${existingInvoice.invoice_number}`,
                  transaction_date: dateStr,
                  created_at: dateStr,
                  updated_at: dateStr,
                };
                transactions.push(ingTrans);

                // Deduct from batch inventory
                dbService.consumeInventoryBatches(
                  ingredient.raw_material_id,
                  cupsSold,
                  id,
                  existingInvoice.invoice_number,
                  prod.name_ar,
                  cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
                  cashierName,
                  cartItem.quantity
                );
              }
            }
          });
        } else {
          // Deduct from batch inventory (ready-made products)
          dbService.consumeInventoryBatches(
            prod.id,
            cartItem.quantity,
            id,
            existingInvoice.invoice_number,
            prod.name_ar,
            cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price,
            cashierName,
            cartItem.quantity
          );
        }

        // Auto deduct Sugar for drinks/products using sugar if not already in recipe_ingredients
        const sugarRm = rawMaterialsList.find(r => isSugarMaterial(r.name));
        if (sugarRm) {
          const recipeHasSugar = prod.recipe_ingredients?.some(ri => {
            const rmItem = rawMaterialsList.find(r => r.id === ri.raw_material_id);
            return rmItem && isSugarMaterial(rmItem.name);
          });
          if (!recipeHasSugar) {
            dbService.consumeInventoryBatches(
              sugarRm.id,
              cartItem.quantity,
              id,
              existingInvoice.invoice_number,
              prod.name_ar,
              0,
              cashierName,
              cartItem.quantity
            );
          }
        }
      }

      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const itemTotalPrice = (unitPrice * cartItem.quantity) - (cartItem.item_discount_amount || 0);
      
      const invoiceItem: InvoiceItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        invoice_id: id,
        product_id: cartItem.product.id,
        quantity: cartItem.quantity,
        unit_price: unitPrice,
        cost_price: cartItem.product.cost_price,
        total_price: itemTotalPrice,
        product_name_ar: cartItem.product.name_ar,
        created_at: dateStr,
        updated_at: dateStr,
        original_price: cartItem.product.selling_price,
        is_price_edited: cartItem.is_price_edited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount,
      };

      newItems.push(invoiceItem);
      filteredItems.push(invoiceItem);

      if (cartItem.is_price_edited) {
        dbService.logItemModification({
          invoice_id: id,
          invoice_number: existingInvoice.invoice_number,
          type: 'PRICE_CHANGE',
          product_id: cartItem.product.id,
          product_name: cartItem.product.name_ar,
          original_price: cartItem.product.selling_price,
          new_price: unitPrice,
          difference: unitPrice - cartItem.product.selling_price,
          reason: cartItem.price_edit_reason || 'تعديل سعر يدوي',
          quantity: cartItem.quantity,
          cashier: cashierName
        });
      }
    });

    if ((paymentType === 'CREDIT' || paymentType === 'SPLIT') && customerId && customerId !== 'c_general' && remainingAmount > 0) {
      const custIdx = customersList.findIndex(c => c.id === customerId);
      if (custIdx > -1) {
        const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
        recordCreditTransactionInternal(creditTxs, customersList, {
          customer_id: customerId,
          customer_name: customersList[custIdx].full_name,
          invoice_id: id,
          transaction_type: 'INVOICE',
          amount: remainingAmount,
          notes: invoiceNotes ? `إغلاق فاتورة مبيعات بالآجل رقم ${existingInvoice.invoice_number}: ${invoiceNotes}` : `إغلاق فاتورة مبيعات بالآجل رقم ${existingInvoice.invoice_number}`,
          created_by: cashierName
        });
        setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
      }
    }

    // Process Wallet Deduction if any
    if (walletDeduction > 0 && customerId && customerId !== 'c_general') {
      const custIdx = customersList.findIndex(c => c.id === customerId);
      if (custIdx > -1) {
        const cust = customersList[custIdx];
        const oldBal = cust.wallet_balance || 0;
        const newBal = oldBal - walletDeduction;
        customersList[custIdx].wallet_balance = newBal;
        customersList[custIdx].updated_at = new Date().toISOString();

        // Push directly to wallet transactions list
        const wtxList = getLocal<WalletTransaction[]>(KEYS.WALLET_TRANSACTIONS, []);
        const newWtx: WalletTransaction = {
          id: `wtx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          customer_id: customerId,
          customer_name: cust.full_name,
          transaction_type: 'INVOICE_PAYMENT',
          amount: walletDeduction,
          previous_balance: oldBal,
          new_balance: newBal,
          notes: `خصم سداد فاتورة مبيعات رقم ${existingInvoice.invoice_number}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          user: cashierName,
          created_at: new Date().toISOString()
        };
        wtxList.push(newWtx);
        setLocal(KEYS.WALLET_TRANSACTIONS, wtxList);

        // Add to system Audit Log
        dbService.logAuditAction(
          'WALLET_TRANSACTION',
          `عملية محفظة لعميل: ${cust.full_name}، النوع: INVOICE_PAYMENT، بمبلغ: ${walletDeduction} ج.م، الرصيد قبل: ${oldBal} ج.م، الرصيد بعد: ${newBal} ج.م. ملاحظات: خصم سداد فاتورة مبيعات رقم ${existingInvoice.invoice_number}`,
          cashierName
        );
      }
    }

    // Update Cash Drawer Immediately (Net of Wallet Deduction to avoid double counts)
    const netCashPaid = actualPaid - walletDeduction;
    if (netCashPaid > 0) {
      dbService.logCashMovement(netCashPaid, 0, `مبيعات نقداً فاتورة رقم ${existingInvoice.invoice_number}`);
    }

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, filteredItems);
    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.RAW_MATERIALS, rawMaterialsList);
    setLocal(KEYS.CUSTOMERS, customersList);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);
    syncToServer();

    // Track customer visit automatically
    if (customerId && customerId !== 'c_general') {
      try {
        dbService.recordVisitForInvoice(customerId, id, existingInvoice.invoice_number, total);
      } catch (e) {
        console.error('Error auto-logging visit in closeOpenInvoice:', e);
      }
    }

    return { invoice: updatedInvoice, items: newItems };
  },

  reopenClosedInvoice: (invoiceId: string, adminPin: string): Invoice => {
    const settings = dbService.getSettings();
    if (adminPin !== settings.pin_code) {
      throw new Error('رمز الأمان PIN للمسؤول غير صحيح!');
    }

    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) {
      throw new Error('الفاتورة غير موجودة!');
    }

    const invoice = invoices[invIdx];
    if (invoice.invoice_status === 'OPEN') {
      return invoice;
    }

    const products = dbService.getProducts();
    const customersList = dbService.getCustomers();
    const invoiceItemsList = dbService.getInvoiceItems(invoiceId);
    const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    const dateStr = new Date().toISOString();

    invoiceItemsList.forEach(item => {
      const prodIdx = products.findIndex(p => p.id === item.product_id);
      if (prodIdx > -1) {
        products[prodIdx].current_stock += item.quantity;
        products[prodIdx].updated_at = dateStr;

        const trans: InventoryTransaction = {
          id: `trans_ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: item.product_id,
          transaction_type: 'Return',
          quantity: item.quantity,
          reason: `إعادة فتح الفاتورة رقم ${invoice.invoice_number}`,
          transaction_date: dateStr,
          created_at: dateStr,
          updated_at: dateStr,
        };
        transactions.push(trans);
      }
    });

    if (invoice.customer_id && invoice.remaining_amount > 0 && invoice.customer_id !== 'c_general') {
      const custIdx = customersList.findIndex(c => c.id === invoice.customer_id);
      if (custIdx > -1) {
        const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
        recordCreditTransactionInternal(creditTxs, customersList, {
          customer_id: invoice.customer_id,
          customer_name: customersList[custIdx].full_name,
          invoice_id: invoiceId,
          transaction_type: 'CORRECTION',
          amount: -invoice.remaining_amount,
          notes: `تصحيح رصيد مديونية لإعادة فتح الفاتورة رقم ${invoice.invoice_number}`,
          created_by: 'مسؤول النظام'
        });
        setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
      }
    }

    if (invoice.paid_amount > 0) {
      dbService.logCashMovement(0, invoice.paid_amount, `إعادة فتح الفاتورة رقم ${invoice.invoice_number}`);
    }

    invoices[invIdx].invoice_status = 'OPEN';
    invoices[invIdx].payment_status = 'UNPAID';
    invoices[invIdx].updated_at = dateStr;

    dbService.logAuditAction('REOPEN_INVOICE', `تم إعادة فتح الفاتورة المغلقة رقم ${invoice.invoice_number} بواسطة مسؤول النظام`, 'مسؤول النظام');

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.CUSTOMERS, customersList);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);
    syncToServer();

    return invoices[invIdx];
  },

  /**
   * CRITICAL TRANSACTION: cancelInvoice
   * - Restores product inventories
   * - Adjusts customer balance (if credit was used)
   * - Deducts cash from drawer (if cash was paid)
   * - Marks status as CANCELLED
   */
  cancelInvoice: (invoiceId: string, cashierName: string): Invoice | null => {
    const invoices = dbService.getInvoices();
    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) return null;

    const invoice = invoices[invIdx];
    if (invoice.invoice_status === 'CANCELLED') return invoice; // already cancelled

    const products = dbService.getProducts();
    const customersList = dbService.getCustomers();
    const invoiceItemsList = dbService.getInvoiceItems(invoiceId);
    const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    const dateStr = new Date().toISOString();

    // 1. Restore Stock
    invoiceItemsList.forEach(item => {
      const prodIdx = products.findIndex(p => p.id === item.product_id);
      if (prodIdx > -1) {
        products[prodIdx].current_stock += item.quantity;
        products[prodIdx].updated_at = dateStr;

        // Register return transaction
        const trans: InventoryTransaction = {
          id: `trans_ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: item.product_id,
          transaction_type: 'Return',
          quantity: item.quantity,
          reason: `إلغاء وإرجاع الفاتورة رقم ${invoice.invoice_number}`,
          transaction_date: dateStr,
          created_at: dateStr,
          updated_at: dateStr,
        };
        transactions.push(trans);
      }
    });

    // Restore batch inventories (FIFO Rollback)
    dbService.rollbackInventoryBatches(invoiceId, cashierName);

    // 2. Reverse Customer Credit (if credit)
    if (invoice.customer_id && invoice.remaining_amount > 0 && invoice.customer_id !== 'c_general') {
      const custIdx = customersList.findIndex(c => c.id === invoice.customer_id);
      if (custIdx > -1) {
        const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
        recordCreditTransactionInternal(creditTxs, customersList, {
          customer_id: invoice.customer_id,
          customer_name: customersList[custIdx].full_name,
          invoice_id: invoiceId,
          transaction_type: 'REFUND',
          amount: invoice.remaining_amount,
          notes: `إرجاع مديونية الفاتورة الملغاة رقم ${invoice.invoice_number}`,
          created_by: cashierName
        });
        setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
      }
    }

    // 3. Deduct Cash Out of cash drawer
    if (invoice.paid_amount > 0) {
      dbService.logCashMovement(0, invoice.paid_amount, `إلغاء فاتورة مرتجع مبيعات رقم ${invoice.invoice_number}`);
    }

    // 4. Mark Cancelled
    invoices[invIdx].invoice_status = 'CANCELLED';
    invoices[invIdx].payment_status = 'CANCELLED';
    invoices[invIdx].updated_at = dateStr;
    if (!invoices[invIdx].timeline) invoices[invIdx].timeline = [];
    invoices[invIdx].timeline.push({
      status: 'CANCELLED',
      timestamp: dateStr,
      operator: cashierName,
      notes: 'تم إلغاء الفاتورة بالكامل وإرجاع الكميات للمخزن والRefund'
    });

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.CUSTOMERS, customersList);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);

    return invoices[invIdx];
  },

  // --- Enterprise Invoice Status, Merge, Split & Timeline ---
  addInvoiceTimelineEvent: (invoiceId: string, status: string, operator: string, notes?: string): void => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId);
    if (idx > -1) {
      if (!invoices[idx].timeline) invoices[idx].timeline = [];
      invoices[idx].timeline!.push({
        status,
        timestamp: new Date().toISOString(),
        operator,
        notes
      });
      setLocal(KEYS.INVOICES, invoices);
    }
  },

  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus, cashierName: string, notes?: string): Invoice => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) throw new Error('الفاتورة غير موجودة!');
    
    const invoice = invoices[idx];
    const oldStatus = invoice.invoice_status;
    invoice.invoice_status = status;
    invoice.updated_at = new Date().toISOString();
    
    if (!invoice.timeline) invoice.timeline = [];
    invoice.timeline.push({
      status,
      timestamp: new Date().toISOString(),
      operator: cashierName,
      notes: notes || `تم تغيير حالة الفاتورة من ${oldStatus} إلى ${status}`
    });
    
    setLocal(KEYS.INVOICES, invoices);
    dbService.logAuditAction('UPDATE_INVOICE_STATUS', `تم تحديث حالة الفاتورة رقم ${invoice.invoice_number} من ${oldStatus} إلى ${status}`, cashierName);
    syncToServer();
    return invoice;
  },

  mergeOpenInvoices: (invoiceIds: string[], cashierName: string, targetTable?: string): Invoice => {
    if (invoiceIds.length < 2) {
      throw new Error('يرجى اختيار فاتورتين على الأقل للدمج!');
    }
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allInvoiceItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    
    const invoicesToMerge = invoices.filter(inv => invoiceIds.includes(inv.id));
    if (invoicesToMerge.length !== invoiceIds.length) {
      throw new Error('بعض الفواتير المحددة غير موجودة!');
    }
    
    const invalidInvoice = invoicesToMerge.find(inv => inv.invoice_status !== 'OPEN' && inv.invoice_status !== 'DRAFT');
    if (invalidInvoice) {
      throw new Error(`الفاتورة رقم ${invalidInvoice.invoice_number} ليست مفتوحة أو مسودة ولا يمكن دمجها!`);
    }
    
    const targetInvoice = invoicesToMerge[0];
    const otherInvoices = invoicesToMerge.slice(1);
    
    const mergedItemsMap: Record<string, InvoiceItem> = {};
    
    invoiceIds.forEach(invId => {
      const items = allInvoiceItems.filter(item => item.invoice_id === invId);
      items.forEach(item => {
        if (mergedItemsMap[item.product_id]) {
          mergedItemsMap[item.product_id].quantity += item.quantity;
          mergedItemsMap[item.product_id].total_price += item.total_price;
          mergedItemsMap[item.product_id].updated_at = new Date().toISOString();
        } else {
          mergedItemsMap[item.product_id] = {
            ...item,
            invoice_id: targetInvoice.id,
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
      });
    });
    
    const finalMergedItems = Object.values(mergedItemsMap);
    
    let subtotal = 0;
    let discount = 0;
    invoicesToMerge.forEach(inv => {
      subtotal += inv.subtotal;
      discount += inv.discount;
    });
    
    const taxAmount = Math.round((subtotal - discount) * 0.14);
    const total = subtotal - discount + taxAmount;
    
    const targetIdx = invoices.findIndex(i => i.id === targetInvoice.id);
    invoices[targetIdx] = {
      ...targetInvoice,
      subtotal,
      discount,
      tax: taxAmount,
      total,
      remaining_amount: total,
      table_number: targetTable || targetInvoice.table_number,
      updated_at: new Date().toISOString(),
      notes: `فاتورة مدمجة من الفواتير: ${invoicesToMerge.map(i => i.invoice_number).join(', ')}. ${targetInvoice.notes || ''}`
    };
    
    if (!invoices[targetIdx].timeline) invoices[targetIdx].timeline = [];
    invoices[targetIdx].timeline!.push({
      status: 'MERGED',
      timestamp: new Date().toISOString(),
      operator: cashierName,
      notes: `تم دمج الفواتير التالية فيها: ${otherInvoices.map(i => i.invoice_number).join(', ')}`
    });
    
    otherInvoices.forEach(otherInv => {
      const otherIdx = invoices.findIndex(i => i.id === otherInv.id);
      if (otherIdx > -1) {
        invoices[otherIdx] = {
          ...invoices[otherIdx],
          invoice_status: 'CANCELLED',
          updated_at: new Date().toISOString(),
          notes: `ملغاة بسبب الدمج في الفاتورة رقم ${targetInvoice.invoice_number}`
        };
        if (!invoices[otherIdx].timeline) invoices[otherIdx].timeline = [];
        invoices[otherIdx].timeline!.push({
          status: 'CANCELLED',
          timestamp: new Date().toISOString(),
          operator: cashierName,
          notes: `تم الإلغاء للدمج في الفاتورة رقم ${targetInvoice.invoice_number}`
        });
      }
    });
    
    let updatedItemsList = allInvoiceItems.filter(item => !invoiceIds.includes(item.invoice_id));
    updatedItemsList = [...updatedItemsList, ...finalMergedItems];
    
    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, updatedItemsList);
    
    dbService.logAuditAction(
      'MERGE_INVOICES',
      `تم دمج الفواتير [${invoicesToMerge.map(i => i.invoice_number).join(', ')}] في الفاتورة ${targetInvoice.invoice_number}`,
      cashierName
    );
    
    syncToServer();
    return invoices[targetIdx];
  },

  splitInvoiceByItems: (invoiceId: string, itemSplits: { product_id: string; quantity: number }[], cashierName: string): { originalInvoice: Invoice; newInvoice: Invoice } => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allInvoiceItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    
    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) throw new Error('الفاتورة الأصلية غير موجودة!');
    
    const originalInvoice = invoices[invIdx];
    if (originalInvoice.invoice_status !== 'OPEN' && originalInvoice.invoice_status !== 'DRAFT') {
      throw new Error('لا يمكن تقسيم سوى الفواتير المفتوحة أو المسودة!');
    }
    
    const originalItems = allInvoiceItems.filter(item => item.invoice_id === invoiceId);
    
    const newInvoiceId = `inv_${Date.now()}`;
    const newInvoiceItems: InvoiceItem[] = [];
    const adjustedOriginalItems: InvoiceItem[] = [];
    
    originalItems.forEach(item => {
      const splitReq = itemSplits.find(s => s.product_id === item.product_id);
      if (splitReq && splitReq.quantity > 0) {
        const splitQty = Math.min(item.quantity, splitReq.quantity);
        const remainQty = item.quantity - splitQty;
        const unitPrice = item.total_price / item.quantity;
        
        newInvoiceItems.push({
          ...item,
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          invoice_id: newInvoiceId,
          quantity: splitQty,
          total_price: splitQty * unitPrice,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
        if (remainQty > 0) {
          adjustedOriginalItems.push({
            ...item,
            quantity: remainQty,
            total_price: remainQty * unitPrice,
            updated_at: new Date().toISOString()
          });
        }
      } else {
        adjustedOriginalItems.push(item);
      }
    });
    
    if (newInvoiceItems.length === 0) {
      throw new Error('لم يتم تحديد أي أصناف لنقلها إلى الفاتورة الجديدة!');
    }
    
    let origSubtotal = adjustedOriginalItems.reduce((sum, item) => sum + item.total_price, 0);
    let origTax = Math.round(origSubtotal * 0.14);
    let origTotal = origSubtotal + origTax;
    
    let splitSubtotal = newInvoiceItems.reduce((sum, item) => sum + item.total_price, 0);
    let splitTax = Math.round(splitSubtotal * 0.14);
    let splitTotal = splitSubtotal + splitTax;
    
    const year = new Date().getFullYear();
    const seq = String(invoices.length + 1).padStart(5, '0');
    const newInvoiceNum = `INV-${year}-${seq}`;
    
    const newInvoice: Invoice = {
      id: newInvoiceId,
      invoice_number: newInvoiceNum,
      customer_id: originalInvoice.customer_id,
      payment_type: originalInvoice.payment_type,
      subtotal: splitSubtotal,
      discount: 0,
      tax: splitTax,
      total: splitTotal,
      paid_amount: 0,
      remaining_amount: splitTotal,
      invoice_status: 'OPEN',
      cashier_name: cashierName,
      invoice_date: new Date().toISOString(),
      notes: `مستقطعة من الفاتورة رقم ${originalInvoice.invoice_number}`,
      table_number: originalInvoice.table_number,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      timeline: [{
        status: 'SPLIT',
        timestamp: new Date().toISOString(),
        operator: cashierName,
        notes: `تم إنشاؤها عبر تقسيم الفاتورة رقم ${originalInvoice.invoice_number}`
      }]
    };
    
    invoices[invIdx] = {
      ...originalInvoice,
      subtotal: origSubtotal,
      tax: origTax,
      total: origTotal,
      remaining_amount: origTotal,
      updated_at: new Date().toISOString(),
      notes: `${originalInvoice.notes || ''} (تم استقطاع جزء منها للفاتورة رقم ${newInvoiceNum})`
    };
    if (!invoices[invIdx].timeline) invoices[invIdx].timeline = [];
    invoices[invIdx].timeline!.push({
      status: 'SPLIT',
      timestamp: new Date().toISOString(),
      operator: cashierName,
      notes: `تم فصل جزء من الأصناف إلى الفاتورة رقم ${newInvoiceNum}`
    });
    
    invoices.push(newInvoice);
    
    let updatedItemsList = allInvoiceItems.filter(item => item.invoice_id !== invoiceId);
    updatedItemsList = [...updatedItemsList, ...adjustedOriginalItems, ...newInvoiceItems];
    
    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, updatedItemsList);
    
    dbService.logAuditAction(
      'SPLIT_INVOICE',
      `تم تقسيم الفاتورة ${originalInvoice.invoice_number} وتوليد فاتورة جديدة ${newInvoiceNum}`,
      cashierName
    );
    
    syncToServer();
    return { originalInvoice: invoices[invIdx], newInvoice };
  },

  moveItemBetweenInvoices: (
    sourceInvoiceId: string,
    targetInvoiceId: string,
    productId: string,
    quantityToMove: number,
    operator: string
  ): void => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);

    const srcIdx = invoices.findIndex(i => i.id === sourceInvoiceId);
    const tgtIdx = invoices.findIndex(i => i.id === targetInvoiceId);
    if (srcIdx === -1 || tgtIdx === -1) throw new Error('أحد الفواتير غير موجود في النظام!');

    const srcInvoice = invoices[srcIdx];
    const tgtInvoice = invoices[tgtIdx];

    // Find product in source items
    const srcItems = allItems.filter(item => item.invoice_id === sourceInvoiceId);
    const itemToMoveIndex = srcItems.findIndex(item => item.product_id === productId);
    if (itemToMoveIndex === -1) throw new Error('المنتج المطلوب نقله غير موجود بالفاتورة المصدر!');

    const itemToMove = srcItems[itemToMoveIndex];
    const moveQty = Math.min(itemToMove.quantity, quantityToMove);
    const remainQty = itemToMove.quantity - moveQty;
    const unitPrice = itemToMove.total_price / itemToMove.quantity;
    const costPrice = itemToMove.cost_price / itemToMove.quantity;

    // Calculate values to move
    const totalToMove = moveQty * unitPrice;

    // Update source item
    if (remainQty <= 0) {
      // Remove item entirely from allItems for source
      const idxToRemove = allItems.findIndex(it => it.id === itemToMove.id);
      if (idxToRemove > -1) allItems.splice(idxToRemove, 1);
    } else {
      const idxToUpdate = allItems.findIndex(it => it.id === itemToMove.id);
      if (idxToUpdate > -1) {
        allItems[idxToUpdate] = {
          ...allItems[idxToUpdate],
          quantity: remainQty,
          total_price: remainQty * unitPrice,
          updated_at: new Date().toISOString()
        };
      }
    }

    // Add/update in target items
    const tgtItems = allItems.filter(item => item.invoice_id === targetInvoiceId);
    const existingTgtItemIdx = allItems.findIndex(item => item.invoice_id === targetInvoiceId && item.product_id === productId);

    if (existingTgtItemIdx > -1) {
      // Update quantity
      allItems[existingTgtItemIdx] = {
        ...allItems[existingTgtItemIdx],
        quantity: allItems[existingTgtItemIdx].quantity + moveQty,
        total_price: allItems[existingTgtItemIdx].total_price + totalToMove,
        updated_at: new Date().toISOString()
      };
    } else {
      // Create new item in target
      allItems.push({
        ...itemToMove,
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        invoice_id: targetInvoiceId,
        quantity: moveQty,
        total_price: totalToMove,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // Recalculate totals for both invoices
    const newSrcItems = allItems.filter(item => item.invoice_id === sourceInvoiceId);
    const newSrcSubtotal = newSrcItems.reduce((sum, item) => sum + item.total_price, 0);
    const newSrcTax = Math.round(newSrcSubtotal * 0.14);
    const newSrcTotal = newSrcSubtotal + newSrcTax;

    invoices[srcIdx] = {
      ...srcInvoice,
      subtotal: newSrcSubtotal,
      tax: newSrcTax,
      total: newSrcTotal,
      remaining_amount: newSrcTotal,
      updated_at: new Date().toISOString()
    };
    if (!invoices[srcIdx].timeline) invoices[srcIdx].timeline = [];
    invoices[srcIdx].timeline!.push({
      status: 'MOVE_ITEM',
      timestamp: new Date().toISOString(),
      operator,
      notes: `تم نقل كمية ${moveQty} من ${itemToMove.product_name_ar} إلى الفاتورة ${tgtInvoice.invoice_number}`
    });

    const newTgtItems = allItems.filter(item => item.invoice_id === targetInvoiceId);
    const newTgtSubtotal = newTgtItems.reduce((sum, item) => sum + item.total_price, 0);
    const newTgtTax = Math.round(newTgtSubtotal * 0.14);
    const newTgtTotal = newTgtSubtotal + newTgtTax;

    invoices[tgtIdx] = {
      ...tgtInvoice,
      subtotal: newTgtSubtotal,
      tax: newTgtTax,
      total: newTgtTotal,
      remaining_amount: newTgtTotal,
      updated_at: new Date().toISOString()
    };
    if (!invoices[tgtIdx].timeline) invoices[tgtIdx].timeline = [];
    invoices[tgtIdx].timeline!.push({
      status: 'MOVE_ITEM',
      timestamp: new Date().toISOString(),
      operator,
      notes: `تم استقبال كمية ${moveQty} من ${itemToMove.product_name_ar} من الفاتورة ${srcInvoice.invoice_number}`
    });

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, allItems);

    dbService.logAuditAction(
      'MOVE_ITEM_BETWEEN_INVOICES',
      `تم نقل ${moveQty} من ${itemToMove.product_name_ar} من الفاتورة ${srcInvoice.invoice_number} إلى الفاتورة ${tgtInvoice.invoice_number}`,
      operator
    );
    syncToServer();
  },

  paySelectedItem: (
    invoiceId: string,
    productId: string,
    quantityToPay: number,
    paymentMethod: string,
    paymentNumber: string | undefined,
    operator: string
  ): void => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);

    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) throw new Error('الفاتورة غير موجودة!');
    const originalInvoice = invoices[invIdx];

    // Find item in invoice
    const invoiceItems = allItems.filter(item => item.invoice_id === invoiceId);
    const itemIdx = invoiceItems.findIndex(item => item.product_id === productId && !item.is_paid);
    if (itemIdx === -1) throw new Error('الصنف غير موجود أو مدفوع بالكامل بالفعل!');

    const item = invoiceItems[itemIdx];
    const payQty = Math.min(item.quantity, quantityToPay);
    const remainQty = item.quantity - payQty;
    const unitPrice = item.total_price / item.quantity;

    const itemPayAmount = payQty * unitPrice;

    // We will split the item if remainQty > 0
    const itemToUpdateIdxInAll = allItems.findIndex(it => it.id === item.id);
    if (itemToUpdateIdxInAll > -1) {
      if (remainQty <= 0) {
        allItems[itemToUpdateIdxInAll] = {
          ...allItems[itemToUpdateIdxInAll],
          is_paid: true,
          updated_at: new Date().toISOString()
        };
      } else {
        // Modify existing item to be the remaining unpaid portion
        allItems[itemToUpdateIdxInAll] = {
          ...allItems[itemToUpdateIdxInAll],
          quantity: remainQty,
          total_price: remainQty * unitPrice,
          updated_at: new Date().toISOString()
        };
        // Create a new paid portion item
        allItems.push({
          ...item,
          id: `item_${Date.now()}_p_paid`,
          quantity: payQty,
          total_price: itemPayAmount,
          is_paid: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    // Now let's calculate paid amount
    const updatedPaidAmount = (originalInvoice.paid_amount || 0) + itemPayAmount;
    const updatedRemainingAmount = Math.max(0, originalInvoice.total - updatedPaidAmount);

    invoices[invIdx] = {
      ...originalInvoice,
      paid_amount: updatedPaidAmount,
      remaining_amount: updatedRemainingAmount,
      updated_at: new Date().toISOString(),
      payment_method: paymentMethod, // save payment method
      payment_number: paymentNumber  // save payment number
    };

    if (!invoices[invIdx].timeline) invoices[invIdx].timeline = [];
    invoices[invIdx].timeline!.push({
      status: 'PAY_ITEM',
      timestamp: new Date().toISOString(),
      operator,
      notes: `تم سداد منفرد لـ ${payQty} من ${item.product_name_ar} بمبلغ ${itemPayAmount} ج.م بـ ${paymentMethod}`
    });

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, allItems);

    // Log cash movement
    dbService.logCashMovement(
      itemPayAmount,
      0,
      `سداد صنف منفرد ${item.product_name_ar} من الفاتورة رقم ${originalInvoice.invoice_number}`,
      'CASH_SALE',
      operator
    );

    dbService.logAuditAction(
      'PAY_SELECTED_ITEM',
      `سداد صنف منفرد (${item.product_name_ar} - كمية ${payQty}) من الفاتورة رقم ${originalInvoice.invoice_number} بقيمة ${itemPayAmount} ج.م`,
      operator
    );

    syncToServer();
  },

  splitInvoiceByAmount: (invoiceId: string, parts: number, cashierName: string): Invoice[] => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allInvoiceItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    
    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) throw new Error('الفاتورة غير موجودة!');
    const originalInvoice = invoices[invIdx];
    
    if (originalInvoice.invoice_status !== 'OPEN' && originalInvoice.invoice_status !== 'DRAFT') {
      throw new Error('لا يمكن تقسيم سوى الفواتير المفتوحة أو المسودة!');
    }
    
    const originalItems = allInvoiceItems.filter(item => item.invoice_id === invoiceId);
    
    const splitInvoices: Invoice[] = [];
    const newItemsList: InvoiceItem[] = [];
    
    invoices[invIdx] = {
      ...originalInvoice,
      invoice_status: 'CANCELLED',
      notes: `ملغاة ومجزأة بالتساوي إلى ${parts} فواتير`
    };
    if (!invoices[invIdx].timeline) invoices[invIdx].timeline = [];
    invoices[invIdx].timeline!.push({
      status: 'SPLIT',
      timestamp: new Date().toISOString(),
      operator: cashierName,
      notes: `تم تجزئة هذه الفاتورة إلى ${parts} أجزاء متساوية`
    });
    
    for (let p = 1; p <= parts; p++) {
      const newId = `inv_${Date.now()}_p${p}`;
      const year = new Date().getFullYear();
      const seq = String(invoices.length + p).padStart(5, '0');
      const newNum = `INV-${year}-${seq}`;
      
      const subtotal = Math.round(originalInvoice.subtotal / parts);
      const discount = Math.round(originalInvoice.discount / parts);
      const tax = Math.round(originalInvoice.tax / parts);
      const total = Math.round(originalInvoice.total / parts);
      
      const newInv: Invoice = {
        id: newId,
        invoice_number: newNum,
        customer_id: originalInvoice.customer_id,
        payment_type: originalInvoice.payment_type,
        subtotal,
        discount,
        tax,
        total,
        paid_amount: 0,
        remaining_amount: total,
        invoice_status: 'OPEN',
        cashier_name: cashierName,
        invoice_date: new Date().toISOString(),
        notes: `جزء ${p} من ${parts} مجزأة من الفاتورة رقم ${originalInvoice.invoice_number}`,
        table_number: originalInvoice.table_number,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        timeline: [{
          status: 'SPLIT',
          timestamp: new Date().toISOString(),
          operator: cashierName,
          notes: `جزء من الفاتورة رقم ${originalInvoice.invoice_number}`
        }]
      };
      
      originalItems.forEach(item => {
        newItemsList.push({
          ...item,
          id: `item_${Date.now()}_p${p}_${Math.random().toString(36).substring(2, 5)}`,
          invoice_id: newId,
          quantity: Number((item.quantity / parts).toFixed(2)),
          total_price: Number((item.total_price / parts).toFixed(2)),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
      
      splitInvoices.push(newInv);
    }
    
    const finalInvoices = [...invoices, ...splitInvoices];
    const finalItems = [...allInvoiceItems.filter(item => item.invoice_id !== invoiceId), ...newItemsList];
    
    setLocal(KEYS.INVOICES, finalInvoices);
    setLocal(KEYS.INVOICE_ITEMS, finalItems);
    
    dbService.logAuditAction(
      'SPLIT_INVOICE_AMOUNT',
      `تم تجزئة الفاتورة ${originalInvoice.invoice_number} إلى ${parts} فواتير بالتساوي`,
      cashierName
    );
    
    syncToServer();
    return splitInvoices;
  },

  // --- Expenses ---
  getExpenses: (): Expense[] => getLocal<Expense[]>(KEYS.EXPENSES, []),
  saveExpense: (
    category: string,
    description: string,
    amount: number,
    notes?: string,
    paymentMethod?: 'CASH' | 'BANK' | 'VODAFONE_CASH' | 'CREDIT',
    receiptImage?: string,
    supplierId?: string
  ): Expense => {
    const list = dbService.getExpenses();
    const todayStr = new Date().toISOString().split('T')[0];
    const newExp: Expense = {
      id: `exp_${Date.now()}`,
      expense_category: category,
      description,
      amount,
      expense_date: todayStr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes,
      payment_method: paymentMethod || 'CASH',
      receipt_image: receiptImage,
      supplier_id: supplierId
    };
    list.push(newExp);
    setLocal(KEYS.EXPENSES, list);

    // Track movement in cash drawer only if payment method is CASH
    if (!paymentMethod || paymentMethod === 'CASH') {
      dbService.logCashMovement(0, amount, `مصروفات كاش: ${category} - ${description}`);
    }

    // If CREDIT payment method and supplier is chosen, record a supplier purchase (which is a debt to them)
    if (paymentMethod === 'CREDIT' && supplierId) {
      const purchaseObj = {
        id: `pur_exp_${newExp.id}`,
        supplier_id: supplierId,
        date: new Date().toISOString().substring(0, 16),
        item_details: `فاتورة مصروفات آجلة: ${category} - ${description}`,
        total_amount: amount,
        notes: notes || 'مسجل من شاشة المصروفات',
        created_at: new Date().toISOString()
      };
      dbService.saveSupplierPurchase(purchaseObj);
    }

    return newExp;
  },
  deleteExpense: (id: string) => {
    const list = dbService.getExpenses();
    const exp = list.find(e => e.id === id);
    if (exp) {
      // Reverse cash out of drawer if payment method is CASH
      if (!exp.payment_method || exp.payment_method === 'CASH') {
        dbService.logCashMovement(exp.amount, 0, `حذف وتعديل مصروفات رقم ${id}`);
      }
      // Revert supplier purchase debt if CREDIT and supplier was selected
      if (exp.payment_method === 'CREDIT' && exp.supplier_id) {
        dbService.deleteSupplierPurchase(`pur_exp_${exp.id}`);
      }
    }
    const filtered = list.filter(e => e.id !== id);
    setLocal(KEYS.EXPENSES, filtered);
    return filtered;
  },

  // --- Credit Transactions & Statements ---
  getCreditTransactions: (customerId?: string): CustomerCreditTransaction[] => {
    const list = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    if (customerId) {
      return list.filter(tx => tx.customer_id === customerId);
    }
    return list;
  },

  recalculateCustomerCreditBalance: (customerId: string): number => {
    const list = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    const customerTxs = list.filter(tx => tx.customer_id === customerId);
    let balance = 0;
    customerTxs.forEach(tx => {
      if (tx.transaction_type === 'INVOICE') {
        balance += tx.amount;
      } else if (tx.transaction_type === 'PAYMENT') {
        balance -= tx.amount;
      } else if (tx.transaction_type === 'MANUAL_ADJUSTMENT') {
        balance += tx.amount;
      } else if (tx.transaction_type === 'CORRECTION') {
        balance += tx.amount;
      } else if (tx.transaction_type === 'REFUND') {
        balance -= tx.amount;
      }
    });
    return balance;
  },

  addManualCreditAdjustment: (
    customerId: string,
    type: 'MANUAL_ADJUSTMENT' | 'CORRECTION' | 'REFUND',
    amount: number,
    notes: string,
    operator: string
  ): CustomerCreditTransaction | null => {
    const customersList = dbService.getCustomers();
    const custIdx = customersList.findIndex(c => c.id === customerId);
    if (custIdx === -1) return null;
    const customer = customersList[custIdx];

    const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    
    const newTx = recordCreditTransactionInternal(creditTxs, customersList, {
      customer_id: customerId,
      customer_name: customer.full_name,
      transaction_type: type,
      amount,
      notes,
      created_by: operator
    });

    setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
    setLocal(KEYS.CUSTOMERS, customersList);

    // Record system Audit Log
    dbService.logAuditAction(
      'CREDIT_MANUAL_ADJUSTMENT',
      `تسوية يدوية للرصيد للعميل: ${customer.full_name}، النوع: ${type}، بمبلغ: ${amount} ج.م، الرصيد قبل: ${newTx.previous_balance} ج.م، الرصيد بعد: ${newTx.new_balance} ج.م. ملاحظات: ${notes}`,
      operator
    );

    return newTx;
  },

  // --- Credit Payments ---
  getCreditPayments: (): CreditPayment[] => getLocal<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []),
  addCreditPayment: (customerId: string, amount: number, notes: string, operator = 'أمين الصندوق'): CreditPayment | null => {
    const customersList = dbService.getCustomers();
    const custIdx = customersList.findIndex(c => c.id === customerId);
    if (custIdx === -1) return null;

    const list = dbService.getCreditPayments();
    const newPayment: CreditPayment = {
      id: `cp_${Date.now()}`,
      customer_id: customerId,
      amount,
      payment_date: new Date().toISOString(),
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    list.push(newPayment);
    setLocal(KEYS.CREDIT_PAYMENTS, list);

    // Add transaction to the customer credit transaction ledger
    const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    recordCreditTransactionInternal(creditTxs, customersList, {
      customer_id: customerId,
      customer_name: customersList[custIdx].full_name,
      transaction_type: 'PAYMENT',
      amount,
      notes: notes || 'سداد مديونية العميل نقداً',
      created_by: operator
    });
    setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
    setLocal(KEYS.CUSTOMERS, customersList);

    // Update individual credit invoices (oldest first)
    const invoices = dbService.getInvoices();
    const custInvoices = invoices.filter(
      inv => inv.customer_id === customerId &&
      inv.invoice_status !== 'CANCELLED' &&
      inv.remaining_amount > 0
    );

    // Sort by date ascending (oldest first)
    custInvoices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));

    let remainingPayment = amount;
    for (const inv of custInvoices) {
      if (remainingPayment <= 0) break;
      const invIdx = invoices.findIndex(i => i.id === inv.id);
      if (invIdx !== -1) {
        const canPay = Math.min(invoices[invIdx].remaining_amount, remainingPayment);
        invoices[invIdx].paid_amount += canPay;
        invoices[invIdx].remaining_amount -= canPay;
        invoices[invIdx].payment_status = dbService.determinePaymentStatus(invoices[invIdx]);
        invoices[invIdx].updated_at = new Date().toISOString();
        remainingPayment -= canPay;
      }
    }
    setLocal(KEYS.INVOICES, invoices);

    // Add to cash drawer
    dbService.logCashMovement(amount, 0, `سداد مديونية عميل: ${customersList[custIdx].full_name}`);

    return newPayment;
  },

  // --- Cash Drawer Management ---
  getCashDrawers: (): CashDrawer[] => getLocal<CashDrawer[]>(KEYS.CASH_DRAWERS, []),
  getActiveDrawer: (): CashDrawer => {
    const list = dbService.getCashDrawers();
    const active = list.find(d => d.closing_balance === null);
    if (active) return active;

    // Auto open with 0 if none is active to prevent crashes
    const todayStr = new Date().toISOString().split('T')[0];
    const newDrawer: CashDrawer = {
      id: `cd_${Date.now()}`,
      opening_balance: 0, // standard default for empty database
      cash_in: 0,
      cash_out: 0,
      closing_balance: null,
      business_date: todayStr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.push(newDrawer);
    setLocal(KEYS.CASH_DRAWERS, list);
    return newDrawer;
  },
  openCashDrawer: (openingBalance: number): CashDrawer => {
    const list = dbService.getCashDrawers();
    // Close any previous open drawer first (safety)
    const activeIdx = list.findIndex(d => d.closing_balance === null);
    const todayStr = new Date().toISOString().split('T')[0];
    if (activeIdx > -1) {
      list[activeIdx].closing_balance = list[activeIdx].opening_balance + list[activeIdx].cash_in - list[activeIdx].cash_out;
      list[activeIdx].updated_at = new Date().toISOString();
    }

    const newDrawer: CashDrawer = {
      id: `cd_${Date.now()}`,
      opening_balance: openingBalance,
      cash_in: 0,
      cash_out: 0,
      closing_balance: null,
      business_date: todayStr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.push(newDrawer);
    setLocal(KEYS.CASH_DRAWERS, list);
    return newDrawer;
  },
  closeCashDrawer: (closingBalance: number): CashDrawer => {
    const list = dbService.getCashDrawers();
    const activeIdx = list.findIndex(d => d.closing_balance === null);
    if (activeIdx > -1) {
      list[activeIdx].closing_balance = closingBalance;
      list[activeIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.CASH_DRAWERS, list);
      return list[activeIdx];
    }
    throw new Error('لا يوجد درج نقدية مفتوح حالياً لإغلاقه');
  },
  logCashMovement: (
    cashIn: number,
    cashOut: number,
    reason: string,
    type?: CashMovement['transaction_type'],
    user?: string,
    notes?: string
  ) => {
    const list = dbService.getCashDrawers();
    let activeIdx = list.findIndex(d => d.closing_balance === null);
    const todayStr = new Date().toISOString().split('T')[0];

    // Determine current cash balance before this transaction
    let previousBalance = 0;
    if (activeIdx > -1) {
      previousBalance = list[activeIdx].opening_balance + list[activeIdx].cash_in - list[activeIdx].cash_out;
    }

    if (activeIdx > -1) {
      list[activeIdx].cash_in += cashIn;
      list[activeIdx].cash_out += cashOut;
      list[activeIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.CASH_DRAWERS, list);
    } else {
      // Auto-create active drawer
      const newDrawer: CashDrawer = {
        id: `cd_${Date.now()}`,
        opening_balance: 0,
        cash_in: cashIn,
        cash_out: cashOut,
        closing_balance: null,
        business_date: todayStr,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      list.push(newDrawer);
      setLocal(KEYS.CASH_DRAWERS, list);
      activeIdx = list.length - 1;
    }

    const newBalance = previousBalance + cashIn - cashOut;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Determine transaction type automatically if not provided
    let finalType: CashMovement['transaction_type'] = type || (cashIn > 0 ? 'CASH_SALE' : 'EXPENSE');
    if (!type) {
      if (reason.includes('سداد مديونية')) {
        finalType = 'CUSTOMER_PAYMENT';
      } else if (reason.includes('إلغاء فاتورة مرتجع')) {
        finalType = 'CASH_WITHDRAWAL';
      }
    }

    // Save in cash movement history
    dbService.saveCashMovement({
      previous_balance: previousBalance,
      transaction_type: finalType,
      amount: cashIn > 0 ? cashIn : cashOut,
      new_balance: newBalance,
      date: todayStr,
      time: timeStr,
      user: user || 'Administrator',
      notes: notes || reason
    });
  },

  getCashHistory: (): CashMovement[] => getLocal<CashMovement[]>(KEYS.CASH_HISTORY, []),

  saveCashMovement: (movement: Omit<CashMovement, 'id' | 'created_at'>): CashMovement => {
    const list = dbService.getCashHistory();
    const newMovement: CashMovement = {
      ...movement,
      id: `cm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString()
    };
    list.push(newMovement);
    setLocal(KEYS.CASH_HISTORY, list);
    return newMovement;
  },

  setOpeningCash: (amount: number, date: string, time: string, notes: string, user: string) => {
    const list = dbService.getCashDrawers();
    let activeIdx = list.findIndex(d => d.closing_balance === null);

    let previousBalance = 0;
    if (activeIdx > -1) {
      previousBalance = list[activeIdx].opening_balance + list[activeIdx].cash_in - list[activeIdx].cash_out;
      list[activeIdx].opening_balance = amount;
      list[activeIdx].business_date = date;
      list[activeIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.CASH_DRAWERS, list);
    } else {
      const newDrawer: CashDrawer = {
        id: `cd_${Date.now()}`,
        opening_balance: amount,
        cash_in: 0,
        cash_out: 0,
        closing_balance: null,
        business_date: date,
        created_at: `${date}T${time}`,
        updated_at: new Date().toISOString(),
      };
      list.push(newDrawer);
      setLocal(KEYS.CASH_DRAWERS, list);
      activeIdx = list.length - 1;
    }

    // Add movement to history
    dbService.saveCashMovement({
      previous_balance: previousBalance,
      transaction_type: 'OPENING_CASH',
      amount: amount,
      new_balance: amount,
      date: date,
      time: time,
      user: user || 'Administrator',
      notes: notes || 'تعيين الرصيد الافتتاحي للدرج'
    });
  },

  adjustCash: (type: 'ADD' | 'WITHDRAW', amount: number, reason: string, notes: string, user: string) => {
    const cashIn = type === 'ADD' ? amount : 0;
    const cashOut = type === 'WITHDRAW' ? amount : 0;
    const movementType = type === 'ADD' ? 'CASH_ADJUSTMENT_ADD' : 'CASH_ADJUSTMENT_SUB';

    dbService.logCashMovement(
      cashIn,
      cashOut,
      reason,
      movementType,
      user,
      notes
    );
  },

  // --- Daily Close ---
  getDailyCloses: (): DailyClose[] => getLocal<DailyClose[]>(KEYS.DAILY_CLOSES, []),
  performDailyClose: (cashierName: string): DailyClose => {
    const todayStr = new Date().toISOString().split('T')[0];
    const closes = dbService.getDailyCloses();

    // Prevent duplicate close
    const alreadyClosed = closes.find(c => c.business_date === todayStr);
    if (alreadyClosed) {
      throw new Error('لقد قمت بالفعل بإغلاق مبيعات هذا اليوم!');
    }

    // Gather today financial data
    const invoices = dbService.getInvoices().filter(i => {
      const invDay = i.invoice_date.split('T')[0];
      return invDay === todayStr && i.invoice_status !== 'CANCELLED';
    });

    const expenses = dbService.getExpenses().filter(e => e.expense_date === todayStr);

    let totalSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let totalCostOfSales = 0;

    const products = dbService.getProducts();
    const todaySession = dbService.getDailyRawMaterialsSession(todayStr);
    const rawMaterialsCost = todaySession ? todaySession.items.reduce((sum, item) => sum + item.cost, 0) : 0;

    // Calculate sales revenue & costs
    invoices.forEach(inv => {
      totalSales += inv.total;
      if (inv.payment_type === 'CREDIT') {
        creditSales += inv.total;
      } else {
        cashSales += inv.total;
      }

      // Cost price summary
      const items = dbService.getInvoiceItems(inv.id);
      items.forEach(it => {
        const prod = products.find(p => p.id === it.product_id);
        const isHandmade = prod && prod.recipe_ingredients && prod.recipe_ingredients.length > 0;
        if (!isHandmade) {
          totalCostOfSales += it.cost_price * it.quantity;
        }
      });
    });

    totalCostOfSales += rawMaterialsCost;

    // Daily expenses must only contain operational expenses (not purchases/raw materials)
    const totalExpensesAmount = expenses
      .filter(e => !isPurchaseExpense(e))
      .reduce((sum, e) => sum + e.amount, 0);

    // Sales Net Profit = (Sales Total - Sales Cost) - Total Expenses
    const grossProfit = totalSales - totalCostOfSales;
    const netProfit = grossProfit - totalExpensesAmount;

    // Get Cash Drawer Balances
    const activeDrawer = dbService.getActiveDrawer();
    const finalCalculatedCash = activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out;

    // Close current cash drawer
    dbService.closeCashDrawer(finalCalculatedCash);

    const newClose: DailyClose = {
      id: `close_${Date.now()}`,
      business_date: todayStr,
      total_sales: totalSales,
      cash_sales: cashSales,
      credit_sales: creditSales,
      total_expenses: totalExpensesAmount,
      net_profit: netProfit,
      opening_cash: activeDrawer.opening_balance,
      closing_cash: finalCalculatedCash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    closes.push(newClose);
    setLocal(KEYS.DAILY_CLOSES, closes);

    // Open a brand new cash drawer for tomorrow / next turn with the current closing cash as opening balance
    dbService.openCashDrawer(finalCalculatedCash);

    return newClose;
  },

  // --- App Settings ---
  getSettings: (): AppSettings => {
    const saved = getLocal<AppSettings>(KEYS.SETTINGS, defaultSettings);
    return {
      ...defaultSettings,
      ...saved,
      cafe_name: saved?.cafe_name ?? defaultSettings.cafe_name,
      owner_name: saved?.owner_name ?? defaultSettings.owner_name,
      phone: saved?.phone ?? defaultSettings.phone,
      address: saved?.address ?? defaultSettings.address,
      currency: saved?.currency ?? defaultSettings.currency,
      receipt_footer: saved?.receipt_footer ?? defaultSettings.receipt_footer,
      logo_path: saved?.logo_path ?? defaultSettings.logo_path,
      is_setup_completed: saved?.is_setup_completed ?? defaultSettings.is_setup_completed
    };
  },
  saveSettings: (settings: Partial<AppSettings>) => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير تعديل إعدادات النظام.');
    }
    const existing = dbService.getSettings();
    const updated: AppSettings = {
      ...defaultSettings,
      ...existing,
      ...settings,
      updated_at: new Date().toISOString()
    };
    setLocal(KEYS.SETTINGS, updated);
    return updated;
  },

  // --- Backup Logs ---
  getBackupLogs: (): BackupLog[] => getLocal<BackupLog[]>(KEYS.BACKUP_LOGS, []),
  logBackup: (type: 'MANUAL' | 'AUTOMATIC', status: 'SUCCESS' | 'FAILED', fileName: string): BackupLog => {
    const logs = dbService.getBackupLogs();
    const newLog: BackupLog = {
      id: `backup_${Date.now()}`,
      backup_date: new Date().toISOString(),
      backup_type: type,
      status,
      file_name: fileName,
      created_at: new Date().toISOString(),
    };
    logs.push(newLog);
    setLocal(KEYS.BACKUP_LOGS, logs);
    return newLog;
  },

  // --- Backup & Restore Engine ---
  exportBackupData: (): string => {
    const rawDbData: Record<string, any> = {};
    Object.values(KEYS).forEach(k => {
      const val = localStorage.getItem(k);
      if (val !== null) {
        try {
          rawDbData[k] = JSON.parse(val);
        } catch (e) {
          rawDbData[k] = val;
        }
      }
    });

    const settings = dbService.getSettings();
    const products = dbService.getProducts();
    const categories = dbService.getCategories();
    const customers = dbService.getCustomers();
    const suppliers = dbService.getSuppliers();
    const invoices = dbService.getInvoices();
    const rawMaterials = dbService.getRawMaterials();
    const batches = dbService.getInventoryBatches();
    const employees = dbService.getEmployees();

    const fullPayload = {
      app: "Cafe Eldeeb POS Enterprise",
      version: "4.2",
      exported_at: new Date().toISOString(),
      cafe_name: settings.cafe_name || 'كافيه الديب',
      phone: settings.phone || '',
      summary: {
        products_count: products.length,
        categories_count: categories.length,
        customers_count: customers.length,
        suppliers_count: suppliers.length,
        invoices_count: invoices.length,
        raw_materials_count: rawMaterials.length,
        production_batches_count: batches.length,
        employees_count: employees.length
      },
      database: rawDbData
    };

    return JSON.stringify(fullPayload, null, 2);
  },

  restoreBackupData: (backupContent: string): boolean => {
    try {
      if (!backupContent || typeof backupContent !== 'string') return false;
      let rawDataObj: Record<string, any> = {};

      // 1. Try parsing directly as JSON
      try {
        const parsed = JSON.parse(backupContent);
        if (parsed && typeof parsed === 'object') {
          if (parsed.database && typeof parsed.database === 'object') {
            rawDataObj = parsed.database;
          } else {
            rawDataObj = parsed;
          }
        }
      } catch (jsonErr) {
        // 2. Try decoding as base64 encoded string
        try {
          const decrypted = decodeURIComponent(escape(atob(backupContent.trim())));
          const parsed = JSON.parse(decrypted);
          if (parsed && typeof parsed === 'object') {
            rawDataObj = parsed.database || parsed;
          }
        } catch (b64Err) {
          console.error('Failed both JSON and Base64 parsing for restore:', b64Err);
          return false;
        }
      }

      if (!rawDataObj || Object.keys(rawDataObj).length === 0) {
        return false;
      }

      // Check essential key presence
      const hasProducts = rawDataObj[KEYS.PRODUCTS] || rawDataObj['cafe_products'];
      const hasSettings = rawDataObj[KEYS.SETTINGS] || rawDataObj['cafe_settings'];
      if (!hasProducts && !hasSettings) {
        console.warn('Backup missing core products or settings keys');
      }

      // Restore all keys to localStorage
      Object.entries(rawDataObj).forEach(([k, val]) => {
        if (val !== undefined && val !== null) {
          if (typeof val === 'object') {
            localStorage.setItem(k, JSON.stringify(val));
          } else {
            localStorage.setItem(k, String(val));
          }
        }
      });

      // Force sync to server database
      try {
        syncToServer();
      } catch (sErr) {
        console.error('Error syncing restored data to server:', sErr);
      }

      return true;
    } catch (e) {
      console.error('Error during restoration:', e);
      return false;
    }
  },

  // --- Purchase / Supply Stock Integration ---
  registerPurchase: (productId: string, quantity: number, costPrice: number, notes: string) => {
    const products = dbService.getProducts();
    const idx = products.findIndex(p => p.id === productId);
    if (idx > -1) {
      products[idx].current_stock += quantity;
      products[idx].cost_price = costPrice; // update cost price
      products[idx].updated_at = new Date().toISOString();
      setLocal(KEYS.PRODUCTS, products);

      // Register transaction
      const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
      const dateStr = new Date().toISOString();
      const trans: InventoryTransaction = {
        id: `trans_pur_${Date.now()}`,
        product_id: productId,
        transaction_type: 'Purchase',
        quantity,
        reason: `توريد بضاعة: ${notes}`,
        transaction_date: dateStr,
        created_at: dateStr,
        updated_at: dateStr,
      };
      transactions.push(trans);
      setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);

      // Log cash movement (Paid out)
      const totalCost = costPrice * quantity;
      dbService.logCashMovement(0, totalCost, `شراء وتوريد مخزون: ${products[idx].name_ar}`);
    }
  },

  registerWaste: (productId: string, quantity: number, reason: string) => {
    const products = dbService.getProducts();
    const idx = products.findIndex(p => p.id === productId);
    if (idx > -1) {
      products[idx].current_stock = Math.max(0, products[idx].current_stock - quantity);
      products[idx].updated_at = new Date().toISOString();
      setLocal(KEYS.PRODUCTS, products);

      // Register transaction
      const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
      const dateStr = new Date().toISOString();
      const trans: InventoryTransaction = {
        id: `trans_waste_${Date.now()}`,
        product_id: productId,
        transaction_type: 'Waste',
        quantity,
        reason: `هالك تالف: ${reason}`,
        transaction_date: dateStr,
        created_at: dateStr,
        updated_at: dateStr,
      };
      transactions.push(trans);
      setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);
    }
  },

  getInventoryTransactions: (prodId?: string): InventoryTransaction[] => {
    const list = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    if (prodId) {
      return list.filter(t => t.product_id === prodId);
    }
    return list;
  },
  saveInventoryTransaction: (trans: InventoryTransaction): void => {
    const list = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    const idx = list.findIndex(t => t.id === trans.id);
    if (idx > -1) {
      list[idx] = trans;
    } else {
      list.push(trans);
    }
    setLocal(KEYS.INVENTORY_TRANSACTIONS, list);
  },

  // --- Communication Logs ---
  getCommunicationLogs: (customerId?: string): CustomerCommunicationLog[] => {
    const list = getLocal<CustomerCommunicationLog[]>(KEYS.COMMUNICATION_LOGS, []);
    if (customerId) {
      return list.filter(l => l.customer_id === customerId);
    }
    return list;
  },
  saveCommunicationLog: (log: Omit<CustomerCommunicationLog, 'id' | 'created_at'>): CustomerCommunicationLog => {
    const list = getLocal<CustomerCommunicationLog[]>(KEYS.COMMUNICATION_LOGS, []);
    const newLog: CustomerCommunicationLog = {
      ...log,
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString()
    };
    list.push(newLog);
    setLocal(KEYS.COMMUNICATION_LOGS, list);
    return newLog;
  },

  // --- Audit Logs ---
  getAuditLogs: (): AuditLog[] => {
    return getLocal<AuditLog[]>(KEYS.AUDIT_LOGS, []);
  },
  logAuditAction: (action: string, details: string, operator = 'مدير النظام'): AuditLog => {
    const list = dbService.getAuditLogs();
    const newLog: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action,
      details,
      operator,
      timestamp: new Date().toISOString()
    };
    list.push(newLog);
    setLocal(KEYS.AUDIT_LOGS, list);
    return newLog;
  },

  // --- Item Modifications Logs ---
  getItemModifications: (): ItemModificationLog[] => {
    return getLocal<ItemModificationLog[]>(KEYS.ITEM_MODIFICATIONS, []);
  },
  logItemModification: (log: Omit<ItemModificationLog, 'id' | 'timestamp' | 'date' | 'time'>): ItemModificationLog => {
    const list = dbService.getItemModifications();
    const now = new Date();
    // Egyptian local time formatting or standard time
    const timeString = now.toTimeString().split(' ')[0]; // e.g. "17:22:32"
    const dateString = now.toISOString().split('T')[0]; // e.g. "2026-07-03"
    
    const newLog: ItemModificationLog = {
      ...log,
      id: `mod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now.toISOString(),
      date: dateString,
      time: timeString
    };
    list.push(newLog);
    setLocal(KEYS.ITEM_MODIFICATIONS, list);
    return newLog;
  },

  getReturnTransactions: (): ReturnTransaction[] => {
    return getLocal<ReturnTransaction[]>(KEYS.RETURNS || 'cafe_returns_list', []);
  },

  createReturnTransaction: (
    originalInvoiceId: string,
    returnedItems: ReturnItem[],
    cashierName: string,
    reason: string
  ): ReturnTransaction => {
    const returns = dbService.getReturnTransactions();
    const invoices = dbService.getInvoices();
    const invoice = invoices.find(i => i.id === originalInvoiceId);
    if (!invoice) {
      throw new Error('الفاتورة الأصلية غير موجودة');
    }

    const year = new Date().getFullYear();
    const seq = String(returns.length + 1).padStart(5, '0');
    const returnNumber = `RET-${year}-${seq}`;
    const dateStr = new Date().toISOString();

    let totalReturnQuantity = 0;
    let totalReturnAmount = 0;
    
    returnedItems.forEach(item => {
      totalReturnQuantity += item.quantity;
      totalReturnAmount += item.total_price;
    });

    const newReturn: ReturnTransaction = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      original_invoice_id: originalInvoiceId,
      original_invoice_number: invoice.invoice_number,
      return_number: returnNumber,
      return_date: dateStr,
      cashier_name: cashierName,
      returned_items: returnedItems,
      total_return_quantity: totalReturnQuantity,
      total_return_amount: totalReturnAmount,
      reason: reason,
      created_at: dateStr
    };

    returns.push(newReturn);
    setLocal(KEYS.RETURNS || 'cafe_returns_list', returns);

    // 1. Restore returned quantity to inventory
    const products = dbService.getProducts();
    const transactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);

    returnedItems.forEach(item => {
      const prodIdx = products.findIndex(p => p.id === item.product_id);
      if (prodIdx > -1) {
        products[prodIdx].current_stock += item.quantity;
        products[prodIdx].updated_at = dateStr;

        const trans: InventoryTransaction = {
          id: `trans_ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: item.product_id,
          transaction_type: 'Return',
          quantity: item.quantity,
          reason: `مرتجع مبيعات رقم ${returnNumber} للفاتورة ${invoice.invoice_number}`,
          transaction_date: dateStr,
          created_at: dateStr,
          updated_at: dateStr,
        };
        transactions.push(trans);

        // Restore to batch inventory
        dbService.returnBatchQuantity(originalInvoiceId, item.product_id, item.quantity, cashierName);
      }
    });
    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, transactions);

    // 2. Reduce customer's due amount if it is a credit invoice
    if (invoice.customer_id && invoice.customer_id !== 'c_general' && (invoice.payment_type === 'CREDIT' || invoice.payment_type === 'SPLIT')) {
      const customersList = dbService.getCustomers();
      const custIdx = customersList.findIndex(c => c.id === invoice.customer_id);
      if (custIdx > -1) {
        customersList[custIdx].current_balance = Math.max(0, customersList[custIdx].current_balance - totalReturnAmount);
        customersList[custIdx].updated_at = dateStr;
        setLocal(KEYS.CUSTOMERS, customersList);
      }
    }

    // 3. Add to Audit Log
    dbService.logAuditAction(
      'RETURN_TRANSACTION',
      `إنشاء مرتجع رقم ${returnNumber} بقيمة ${totalReturnAmount} ج.م للفاتورة رقم ${invoice.invoice_number}`,
      cashierName
    );

    return newReturn;
  },

  getCreditAdjustments: (): CreditAdjustment[] => {
    return getLocal<CreditAdjustment[]>(KEYS.CREDIT_ADJUSTMENTS, []);
  },

  createCreditAdjustment: (
    customerId: string,
    type: 'INCREASE' | 'DECREASE' | 'SET',
    amount: number,
    reason: string,
    notes: string,
    adminPin: string,
    cashierName = 'Administrator'
  ): CreditAdjustment => {
    const settings = dbService.getSettings();
    if (adminPin !== settings.pin_code) {
      throw new Error('رمز الأمان PIN للمسؤول غير صحيح!');
    }

    const customers = dbService.getCustomers();
    const custIdx = customers.findIndex(c => c.id === customerId);
    if (custIdx === -1) {
      throw new Error('العميل غير موجود!');
    }

    const customer = customers[custIdx];
    const prevBalance = customer.current_balance;
    let newBalance = prevBalance;

    if (type === 'INCREASE') {
      newBalance = prevBalance + amount;
    } else if (type === 'DECREASE') {
      newBalance = Math.max(0, prevBalance - amount);
    } else if (type === 'SET') {
      newBalance = Math.max(0, amount);
    }

    const difference = newBalance - prevBalance;

    // Update customer balance
    customers[custIdx].current_balance = newBalance;
    customers[custIdx].updated_at = new Date().toISOString();
    setLocal(KEYS.CUSTOMERS, customers);

    // Save adjustment log
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    const adjustments = getLocal<CreditAdjustment[]>(KEYS.CREDIT_ADJUSTMENTS, []);
    const newAdj: CreditAdjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: dateStr,
      time: timeStr,
      user: cashierName,
      customer_id: customerId,
      customer_name: customer.full_name,
      previous_balance: prevBalance,
      new_balance: newBalance,
      difference: difference,
      reason: reason,
      notes: notes,
      created_at: now.toISOString(),
    };

    adjustments.push(newAdj);
    setLocal(KEYS.CREDIT_ADJUSTMENTS, adjustments);

    // Log to Audit action
    dbService.logAuditAction(
      'CREDIT_ADJUSTMENT',
      `تعديل رصيد حساب العميل ${customer.full_name}: من ${prevBalance} إلى ${newBalance} (الفارق: ${difference}) - السبب: ${reason}`,
      cashierName
    );

    return newAdj;
  },

  getTables: (): TableSystem[] => {
    let list = getLocal<TableSystem[]>(KEYS.TABLES, []);
    if (list.length === 0) {
      for (let i = 1; i <= 16; i++) {
        list.push({
          id: `T${i}`,
          name: `طاولة ${i}`,
          status: 'FREE'
        });
      }
      setLocal(KEYS.TABLES, list);
    }
    return list;
  },

  updateTable: (table: TableSystem): void => {
    const list = dbService.getTables();
    const idx = list.findIndex(t => t.id === table.id);
    if (idx > -1) {
      list[idx] = table;
      setLocal(KEYS.TABLES, list);
    }
  },

  reserveTable: (tableId: string, customerName: string, time: string, notes?: string): void => {
    const list = dbService.getTables();
    const idx = list.findIndex(t => t.id === tableId);
    if (idx > -1) {
      list[idx] = {
        ...list[idx],
        status: 'RESERVED',
        reserved_by: customerName,
        reservation_time: time,
        reservation_notes: notes
      };
      setLocal(KEYS.TABLES, list);
      dbService.logAuditAction('RESERVE_TABLE', `تم حجز الطاولة رقم ${tableId} للعميل ${customerName} في تمام الساعة ${time}`);
    }
  },

  clearTable: (tableId: string): void => {
    const list = dbService.getTables();
    const idx = list.findIndex(t => t.id === tableId);
    if (idx > -1) {
      list[idx] = {
        id: list[idx].id,
        name: list[idx].name,
        status: 'FREE'
      };
      setLocal(KEYS.TABLES, list);
      dbService.logAuditAction('CLEAR_TABLE', `تم إلغاء حجز / تفريغ الطاولة رقم ${tableId}`);
    }
  },

  moveTable: (sourceTableId: string, targetTableId: string, operator: string): void => {
    const list = dbService.getTables();
    const srcIdx = list.findIndex(t => t.id === sourceTableId);
    const dstIdx = list.findIndex(t => t.id === targetTableId);
    if (srcIdx > -1 && dstIdx > -1) {
      const src = list[srcIdx];
      const dst = list[dstIdx];
      list[dstIdx] = {
        ...dst,
        status: src.status,
        occupied_since: src.occupied_since,
        reserved_by: src.reserved_by,
        reservation_time: src.reservation_time,
        reservation_notes: src.reservation_notes
      };
      list[srcIdx] = {
        id: src.id,
        name: src.name,
        status: 'FREE'
      };
      setLocal(KEYS.TABLES, list);
      
      const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
      let updated = false;
      invoices.forEach((inv, i) => {
        if (inv.table_number === sourceTableId && (inv.invoice_status === 'OPEN' || inv.invoice_status === 'DRAFT')) {
          invoices[i].table_number = targetTableId;
          invoices[i].updated_at = new Date().toISOString();
          if (!invoices[i].timeline) invoices[i].timeline = [];
          invoices[i].timeline!.push({
            status: 'TABLE_MOVE',
            timestamp: new Date().toISOString(),
            operator,
            notes: `تم نقل الفاتورة من الطاولة ${sourceTableId} إلى الطاولة ${targetTableId}`
          });
          updated = true;
        }
      });
      if (updated) {
        setLocal(KEYS.INVOICES, invoices);
      }
      
      dbService.logAuditAction('MOVE_TABLE', `تم نقل الطاولة ${sourceTableId} بالكامل إلى الطاولة ${targetTableId}`, operator);
    }
  },

  transferInvoice: (invoiceId: string, targetCustomer: string | null, targetTable: string | null, operator: string): Invoice => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) throw new Error('الفاتورة غير موجودة!');
    
    const invoice = invoices[idx];
    const oldCust = invoice.customer_id;
    const oldTable = invoice.table_number;
    
    if (targetCustomer !== null) {
      invoice.customer_id = targetCustomer;
    }
    if (targetTable !== null) {
      invoice.table_number = targetTable;
    }
    invoice.updated_at = new Date().toISOString();
    
    if (!invoice.timeline) invoice.timeline = [];
    invoice.timeline.push({
      status: 'TRANSFER',
      timestamp: new Date().toISOString(),
      operator,
      notes: `نقل الفاتورة: العميل (${oldCust || 'عام'} -> ${invoice.customer_id || 'عام'})، الطاولة (${oldTable || 'بلا'} -> ${invoice.table_number || 'بلا'})`
    });
    
    setLocal(KEYS.INVOICES, invoices);
    dbService.logAuditAction('TRANSFER_INVOICE', `تم نقل الفاتورة رقم ${invoice.invoice_number}: العميل (${oldCust} -> ${invoice.customer_id}), الطاولة (${oldTable} -> ${invoice.table_number})`, operator);
    return invoice;
  },

  startFirstBusinessDay: (): void => {
    // 1. Reset customer credit balances to 0 for all customers, keeping details intact
    const customers = dbService.getCustomers();
    const updatedCustomers = customers.map(c => ({
      ...c,
      current_balance: 0,
      wallet_balance: 0,
      updated_at: new Date().toISOString()
    }));
    setLocal(KEYS.CUSTOMERS, updatedCustomers);

    // 2. Clear ONLY demo invoices, expenses, payments, reports, and stats/logs
    setLocal(KEYS.INVOICES, []);
    setLocal(KEYS.INVOICE_ITEMS, []);
    setLocal(KEYS.EXPENSES, []);
    setLocal(KEYS.CREDIT_PAYMENTS, []);
    setLocal(KEYS.CREDIT_TRANSACTIONS, []);
    setLocal(KEYS.WALLET_TRANSACTIONS, []);
    setLocal(KEYS.DAILY_CLOSES, []);
    setLocal(KEYS.COMMUNICATION_LOGS, []);
    setLocal(KEYS.ITEM_MODIFICATIONS, []);
    setLocal(KEYS.AUDIT_LOGS, []);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, []);
    setLocal(KEYS.EMPLOYEE_TRANSACTIONS, []);
    setLocal(KEYS.PS_SESSIONS, []);

    // 3. Reset Cash Drawer Balance to 0 by clearing history and starting a clean active drawer
    const todayStr = new Date().toISOString().split('T')[0];
    const newDrawer: CashDrawer = {
      id: `cd_${Date.now()}`,
      opening_balance: 0,
      cash_in: 0,
      cash_out: 0,
      closing_balance: null,
      business_date: todayStr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLocal(KEYS.CASH_DRAWERS, [newDrawer]);
  },

  getEmployees: (): Employee[] => {
    return getLocal<Employee[]>(KEYS.EMPLOYEES, []);
  },
  saveEmployee: (emp: Employee): void => {
    const employees = dbService.getEmployees();
    const idx = employees.findIndex(e => e.id === emp.id);
    if (idx > -1) {
      employees[idx] = emp;
    } else {
      employees.push(emp);
    }
    setLocal(KEYS.EMPLOYEES, employees);
  },
  deleteEmployee: (id: string): void => {
    const employees = dbService.getEmployees();
    const filtered = employees.filter(e => e.id !== id);
    setLocal(KEYS.EMPLOYEES, filtered);
  },
  getEmployeeTransactions: (): EmployeeTransaction[] => {
    return getLocal<EmployeeTransaction[]>(KEYS.EMPLOYEE_TRANSACTIONS, []);
  },
  addEmployeeTransaction: (tx: EmployeeTransaction): void => {
    const txs = dbService.getEmployeeTransactions();
    txs.push(tx);
    setLocal(KEYS.EMPLOYEE_TRANSACTIONS, txs);
  },
  deleteEmployeeTransaction: (id: string): void => {
    const txs = dbService.getEmployeeTransactions();
    const filtered = txs.filter(t => t.id !== id);
    setLocal(KEYS.EMPLOYEE_TRANSACTIONS, filtered);
  },

  recordEmployeeConsumption: (
    employeeId: string,
    employeeName: string,
    items: { product: Product; quantity: number }[],
    policy: 'FREE' | 'DEDUCT',
    cashierName: string
  ): void => {
    let totalCost = 0;
    let totalSellingPrice = 0;
    const consumedProductsList: { product_id: string; product_name_ar: string; quantity: number; selling_price: number; cost_price: number }[] = [];

    const products = dbService.getProducts();
    const rawMaterialsList = dbService.getRawMaterials();
    const inventoryTransactions = getLocal<InventoryTransaction[]>(KEYS.INVENTORY_TRANSACTIONS, []);
    const dateStr = new Date().toISOString();

    items.forEach(item => {
      const prodIdx = products.findIndex(p => p.id === item.product.id);
      if (prodIdx > -1) {
        const prod = products[prodIdx];
        
        // Deduct stock
        const finalStock = Math.max(0, prod.current_stock - item.quantity);
        products[prodIdx].current_stock = finalStock;
        products[prodIdx].updated_at = dateStr;

        // Log inventory transaction
        const invTrans: InventoryTransaction = {
          id: `trans_emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          product_id: prod.id,
          transaction_type: 'Waste',
          quantity: item.quantity,
          reason: `استهلاك موظف (${employeeName}): ${prod.name_ar}`,
          transaction_date: dateStr,
          created_at: dateStr,
          updated_at: dateStr,
        };
        inventoryTransactions.push(invTrans);

        // Deduct raw material recipe ingredients
        if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
          prod.recipe_ingredients.forEach(ingredient => {
            const rawIdx = rawMaterialsList.findIndex(r => r.id === ingredient.raw_material_id);
            if (rawIdx > -1) {
              const rawMat = rawMaterialsList[rawIdx];
              const totalConsumed = ingredient.quantity * item.quantity;
              rawMat.current_quantity = Math.max(0, rawMat.current_quantity - totalConsumed);
              rawMat.total_cost = rawMat.current_quantity * rawMat.unit_cost;
              rawMat.updated_at = dateStr;

              const ingTrans: InventoryTransaction = {
                id: `trans_rec_emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                product_id: rawMat.id,
                transaction_type: 'Waste',
                quantity: totalConsumed,
                reason: `استهلاك مكونات وصفة (${prod.name_ar}) لموظف (${employeeName})`,
                transaction_date: dateStr,
                created_at: dateStr,
                updated_at: dateStr,
              };
              inventoryTransactions.push(ingTrans);
            } else {
              const ingIdx = products.findIndex(p => p.id === ingredient.raw_material_id);
              if (ingIdx > -1) {
                const ingProd = products[ingIdx];
                const totalConsumed = ingredient.quantity * item.quantity;
                ingProd.current_stock = Math.max(0, ingProd.current_stock - totalConsumed);
                ingProd.updated_at = dateStr;

                const ingTrans: InventoryTransaction = {
                  id: `trans_rec_emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  product_id: ingProd.id,
                  transaction_type: 'Waste',
                  quantity: totalConsumed,
                  reason: `استهلاك مكونات وصفة (${prod.name_ar}) لموظف (${employeeName})`,
                  transaction_date: dateStr,
                  created_at: dateStr,
                  updated_at: dateStr,
                };
                inventoryTransactions.push(ingTrans);
              }
            }
          });
        }

        totalCost += prod.cost_price * item.quantity;
        totalSellingPrice += prod.selling_price * item.quantity;

        consumedProductsList.push({
          product_id: prod.id,
          product_name_ar: prod.name_ar,
          quantity: item.quantity,
          selling_price: prod.selling_price,
          cost_price: prod.cost_price
        });
      }
    });

    setLocal(KEYS.PRODUCTS, products);
    setLocal(KEYS.RAW_MATERIALS, rawMaterialsList);
    setLocal(KEYS.INVENTORY_TRANSACTIONS, inventoryTransactions);

    const amountToDeduct = policy === 'DEDUCT' ? totalSellingPrice : 0;

    const empTx: EmployeeTransaction = {
      id: `emp_tx_con_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      employee_id: employeeId,
      employee_name: employeeName,
      type: 'CONSUMPTION',
      amount: amountToDeduct,
      notes: `استهلاك منتجات: ${items.map(i => `${i.product.name_ar} (x${i.quantity})`).join(', ')} (${policy === 'FREE' ? 'مشروب مجاني للموظف' : 'خصم من الراتب'})`,
      date: new Date().toISOString().split('T')[0],
      created_at: dateStr,
      products: consumedProductsList
    };
    dbService.addEmployeeTransaction(empTx);

    if (policy === 'FREE') {
      dbService.saveExpense('Miscellaneous', `استهلاك مجاني للموظف: ${employeeName} - منتجات بقيمة تبيع ${totalSellingPrice} ج.م (تخفيض كشاش)، تكلفة ${totalCost} ج.م`, totalCost);
    }

    dbService.logAuditAction(
      'EMPLOYEE_CONSUMPTION',
      `تسجيل استهلاك منتجات للموظف ${employeeName} بقيمة ${totalSellingPrice} ج.م ببلسي ${policy === 'FREE' ? 'مجاني' : 'خصم من الراتب'}`,
      cashierName
    );

    syncToServer();
  },

  getPSDevices: (): PSDevice[] => {
    return getLocal<PSDevice[]>(KEYS.PS_DEVICES, []);
  },
  savePSDevice: (dev: PSDevice): void => {
    const devices = dbService.getPSDevices();
    const idx = devices.findIndex(d => d.id === dev.id);
    if (idx > -1) {
      devices[idx] = dev;
    } else {
      devices.push(dev);
    }
    setLocal(KEYS.PS_DEVICES, devices);
  },
  deletePSDevice: (id: string): void => {
    const devices = dbService.getPSDevices();
    const filtered = devices.filter(d => d.id !== id);
    setLocal(KEYS.PS_DEVICES, filtered);
  },
  getPSSessions: (): PSSession[] => {
    return getLocal<PSSession[]>(KEYS.PS_SESSIONS, []);
  },
  savePSSession: (sess: PSSession): void => {
    const sessions = dbService.getPSSessions();
    const idx = sessions.findIndex(s => s.id === sess.id);
    if (idx > -1) {
      sessions[idx] = sess;
    } else {
      sessions.push(sess);
    }
    setLocal(KEYS.PS_SESSIONS, sessions);
  },

  // --- Daily Opening Raw Materials ---
  getDailyRawMaterialSessions: (): DailyRawMaterialSession[] => {
    return getLocal<DailyRawMaterialSession[]>(KEYS.DAILY_RAW_MATERIALS, []);
  },
  getDailyRawMaterialsSession: (date: string): DailyRawMaterialSession | null => {
    const list = dbService.getDailyRawMaterialSessions();
    return list.find(s => s.business_date === date) || null;
  },
  saveDailyRawMaterialsSession: (session: DailyRawMaterialSession): void => {
    const list = dbService.getDailyRawMaterialSessions();
    const idx = list.findIndex(s => s.id === session.id || s.business_date === session.business_date);
    if (idx > -1) {
      list[idx] = session;
    } else {
      list.push(session);
    }
    setLocal(KEYS.DAILY_RAW_MATERIALS, list);
    syncToServer();
  },
  hasRegisteredRawMaterialsForToday: (): boolean => {
    const todayStr = new Date().toISOString().split('T')[0];
    return dbService.getDailyRawMaterialsSession(todayStr) !== null;
  },
  getLatestRawMaterialsSession: (): DailyRawMaterialSession | null => {
    const list = dbService.getDailyRawMaterialSessions();
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
  },
  ensureDefaultRawMaterials: (): void => {
    // No-op: Raw Materials category and products are permanently disabled from Menu Categories
    return;
  },

  // --- New Raw Materials Management Module ---
  getRawMaterials: (): RawMaterial[] => {
    return getLocal<RawMaterial[]>(KEYS.RAW_MATERIALS, []);
  },
  saveRawMaterial: (rawMaterial: RawMaterial): RawMaterial[] => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير إضافة أو تعديل المواد الخام.');
    }
    const list = dbService.getRawMaterials();
    const idx = list.findIndex(r => r.id === rawMaterial.id);
    const updated = {
      ...rawMaterial,
      total_cost: rawMaterial.current_quantity * rawMaterial.unit_cost,
      updated_at: new Date().toISOString()
    };
    if (idx > -1) {
      list[idx] = updated;
    } else {
      updated.id = `raw_${Date.now()}`;
      updated.created_at = new Date().toISOString();
      list.push(updated);
    }
    setLocal(KEYS.RAW_MATERIALS, list);
    return list;
  },
  deleteRawMaterial: (id: string): RawMaterial[] => {
    if (getCurrentUserRole() === 'Cashier') {
      throw new Error('عذراً! هذه العملية تتطلب صلاحية مدير النظام (Admin). لا يمكن للكاشير حذف المواد الخام.');
    }
    const list = dbService.getRawMaterials().filter(r => r.id !== id);
    setLocal(KEYS.RAW_MATERIALS, list);
    return list;
  },

  // --- Batch Inventory System Module ---
  getInventoryBatches: (): InventoryBatch[] => {
    return getLocal<InventoryBatch[]>(KEYS.INVENTORY_BATCHES, []);
  },

  getBatchConsumptions: (): any[] => {
    return getLocal<any[]>('cafe_batch_consumptions', []);
  },

  saveInventoryBatch: (batch: InventoryBatch): InventoryBatch[] => {
    const list = dbService.getInventoryBatches();
    const idx = list.findIndex(b => b.id === batch.id);

    const isRaw = batch.item_type === 'raw_material' || !!batch.yield_capacity;
    const yieldCap = isRaw ? (batch.yield_capacity || batch.original_quantity || 50) : batch.original_quantity;
    const remaining = Math.max(0, yieldCap - batch.consumed_quantity);

    const isSugar = isSugarMaterial(batch.item_name);
    const updated: InventoryBatch = {
      ...batch,
      original_quantity: yieldCap,
      yield_capacity: isRaw ? yieldCap : batch.yield_capacity,
      yield_unit: isRaw ? (batch.yield_unit || 'كوب') : batch.yield_unit,
      remaining_quantity: remaining,
      remaining_cups: isRaw ? remaining : batch.remaining_cups,
      total_revenue: isSugar ? 0 : (batch.total_revenue || 0),
      net_profit: isSugar ? 0 : ((batch.total_revenue || 0) - batch.purchase_price),
      profit_margin: isSugar ? 0 : (batch.purchase_price > 0 ? (((batch.total_revenue || 0) - batch.purchase_price) / batch.purchase_price) * 100 : 0)
    };
    
    // Auto calculate status
    if (updated.remaining_quantity <= 0) {
      updated.status = 'COMPLETED';
      if (!updated.ended_at) updated.ended_at = new Date().toISOString();
    } else if (updated.remaining_quantity / yieldCap <= 0.2) {
      updated.status = 'LOW';
    } else {
      updated.status = 'ACTIVE';
    }

    if (idx > -1) {
      list[idx] = updated;
    } else {
      // New batch is added independently without force closing prior active batches!
      list.push(updated);
    }
    setLocal(KEYS.INVENTORY_BATCHES, list);
    return list;
  },

  completeInventoryBatch: (id: string, operator?: string): InventoryBatch[] => {
    const list = dbService.getInventoryBatches();
    const idx = list.findIndex(b => b.id === id);
    if (idx > -1) {
      const b = list[idx];
      const previousQty = b.remaining_quantity;
      b.status = 'COMPLETED';
      b.remaining_quantity = 0;
      
      // Log completion
      dbService.addInventoryBatchLog({
        batch_id: b.id,
        batch_serial: b.batch_serial,
        item_name: b.item_name,
        action_type: 'MANUAL_DEDUCT',
        quantity_changed: b.original_quantity,
        previous_quantity: previousQty,
        new_quantity: 0,
        operator: operator || 'المالك',
        reason: `إنهاء الدفعة رسمياً بطلب المالك والبدء بالدفعة الجديدة`
      });

      // Activate next available batch for the same item if one exists
      const nextBatch = list.find(nb => 
        nb.id !== b.id &&
        (nb.item_id === b.item_id || nb.item_name.trim().toLowerCase() === b.item_name.trim().toLowerCase()) &&
        nb.status !== 'COMPLETED'
      );
      if (nextBatch) {
        nextBatch.status = 'ACTIVE';
      }
      
      setLocal(KEYS.INVENTORY_BATCHES, list);
    }
    return list;
  },

  deleteInventoryBatch: (id: string, operator: string = 'المالك'): { success: boolean; message?: string; list: InventoryBatch[] } => {
    const list = dbService.getInventoryBatches();
    const batchToDelete = list.find(b => b.id === id);
    if (!batchToDelete) {
      return { success: false, message: 'الدفعة غير موجودة!', list };
    }

    if ((batchToDelete.consumed_quantity || 0) > 0) {
      return {
        success: false,
        message: 'لا يمكن حذف دفعة تم استخدامها في المبيعات حفاظاً على سلامة البيانات المحاسبية.',
        list
      };
    }

    const filtered = list.filter(b => b.id !== id);
    setLocal(KEYS.INVENTORY_BATCHES, filtered);

    // Update Raw Material inventory if linked
    if (batchToDelete.item_id || batchToDelete.item_name) {
      const rawMaterials = dbService.getRawMaterials();
      const rm = rawMaterials.find(r =>
        r.id === batchToDelete.item_id ||
        r.name.trim().toLowerCase() === batchToDelete.item_name.trim().toLowerCase()
      );
      if (rm) {
        const rmQtyToDeduct = batchToDelete.raw_material_qty || 1;
        const newRmQty = Math.max(0, rm.current_quantity - rmQtyToDeduct);
        dbService.saveRawMaterial({
          ...rm,
          current_quantity: newRmQty
        });
      }
    }

    // Add batch operation log
    dbService.addInventoryBatchLog({
      batch_id: batchToDelete.id,
      batch_serial: batchToDelete.batch_serial,
      item_name: batchToDelete.item_name,
      action_type: 'DELETE_BATCH',
      quantity_changed: -batchToDelete.original_quantity,
      previous_quantity: batchToDelete.original_quantity,
      new_quantity: 0,
      operator: operator || 'المالك',
      reason: 'حذف الدفعة قبل الاستخدام'
    });

    return { success: true, list: filtered };
  },

  editInventoryBatch: (
    batchId: string,
    updatedData: {
      item_name?: string;
      supplier?: string;
      purchase_date?: string;
      expiry_date?: string;
      invoice_number?: string;
      notes?: string;
      purchase_price?: number;
      raw_material_qty?: number;
      yield_capacity?: number;
      yield_unit?: string;
      unit?: string;
    },
    operator: string = 'المالك'
  ): { success: boolean; message?: string; list: InventoryBatch[]; batch?: InventoryBatch } => {
    const list = dbService.getInventoryBatches();
    const idx = list.findIndex(b => b.id === batchId);
    if (idx === -1) {
      return { success: false, message: 'الدفعة غير موجودة!', list };
    }

    const b = { ...list[idx] };
    const isConsumed = (b.consumed_quantity || 0) > 0;
    const oldYieldCap = b.yield_capacity || b.original_quantity || 0;
    const oldRawQty = b.raw_material_qty || 1;

    if (isConsumed) {
      // Safe fields edit ONLY when batch is already consumed
      if (updatedData.supplier !== undefined) b.supplier = updatedData.supplier.trim();
      if (updatedData.purchase_date !== undefined) b.purchase_date = updatedData.purchase_date;
      if (updatedData.expiry_date !== undefined) b.expiry_date = updatedData.expiry_date;
      if (updatedData.invoice_number !== undefined) b.invoice_number = updatedData.invoice_number.trim();
      if (updatedData.notes !== undefined) b.notes = updatedData.notes.trim();
    } else {
      // Full fields edit allowed when batch has not been used yet
      if (updatedData.item_name !== undefined && updatedData.item_name.trim()) {
        b.item_name = updatedData.item_name.trim();
      }
      if (updatedData.supplier !== undefined) b.supplier = updatedData.supplier.trim();
      if (updatedData.purchase_date !== undefined) b.purchase_date = updatedData.purchase_date;
      if (updatedData.expiry_date !== undefined) b.expiry_date = updatedData.expiry_date;
      if (updatedData.invoice_number !== undefined) b.invoice_number = updatedData.invoice_number.trim();
      if (updatedData.notes !== undefined) b.notes = updatedData.notes.trim();

      if (updatedData.purchase_price !== undefined && !isNaN(updatedData.purchase_price) && updatedData.purchase_price >= 0) {
        b.purchase_price = updatedData.purchase_price;
      }

      if (updatedData.raw_material_qty !== undefined && !isNaN(updatedData.raw_material_qty) && updatedData.raw_material_qty > 0) {
        const newRawQty = updatedData.raw_material_qty;
        // Adjust Raw Material stock if linked
        if (b.item_id || b.item_name) {
          const rawMaterials = dbService.getRawMaterials();
          const rm = rawMaterials.find(r =>
            r.id === b.item_id ||
            r.name.trim().toLowerCase() === b.item_name.trim().toLowerCase()
          );
          if (rm) {
            const diff = newRawQty - oldRawQty;
            const newRmQty = Math.max(0, rm.current_quantity + diff);
            const newUnitCost = b.purchase_price > 0 && newRawQty > 0 ? b.purchase_price / newRawQty : rm.unit_cost;
            dbService.saveRawMaterial({
              ...rm,
              current_quantity: newRmQty,
              unit_cost: newUnitCost
            });
          }
        }
        b.raw_material_qty = newRawQty;
      }

      if (updatedData.yield_capacity !== undefined && !isNaN(updatedData.yield_capacity) && updatedData.yield_capacity > 0) {
        b.yield_capacity = updatedData.yield_capacity;
        b.original_quantity = updatedData.yield_capacity;
      }

      if (updatedData.yield_unit !== undefined && updatedData.yield_unit.trim()) {
        b.yield_unit = updatedData.yield_unit.trim();
      }

      if (updatedData.unit !== undefined && updatedData.unit.trim()) {
        b.unit = updatedData.unit.trim();
      }
    }

    // Recalculate remaining quantities and financial metrics
    const cap = b.yield_capacity || b.original_quantity;
    b.remaining_quantity = Math.max(0, cap - (b.consumed_quantity || 0));
    b.remaining_cups = b.remaining_quantity;

    const isSugar = isSugarMaterial(b.item_name);
    b.total_revenue = isSugar ? 0 : (b.total_revenue || 0);
    b.net_profit = isSugar ? 0 : (b.total_revenue - b.purchase_price);
    b.profit_margin = isSugar ? 0 : (b.purchase_price > 0 ? ((b.total_revenue - b.purchase_price) / b.purchase_price) * 100 : 0);

    // Auto status
    if (b.remaining_quantity <= 0) {
      b.status = 'COMPLETED';
      if (!b.ended_at) b.ended_at = new Date().toISOString();
    } else if (b.remaining_quantity / cap <= 0.2) {
      b.status = 'LOW';
    } else {
      b.status = 'ACTIVE';
    }

    list[idx] = b;
    setLocal(KEYS.INVENTORY_BATCHES, list);

    // Log edit operation
    dbService.addInventoryBatchLog({
      batch_id: b.id,
      batch_serial: b.batch_serial,
      item_name: b.item_name,
      action_type: 'EDIT_BATCH',
      quantity_changed: (b.yield_capacity || b.original_quantity) - oldYieldCap,
      previous_quantity: oldYieldCap,
      new_quantity: b.yield_capacity || b.original_quantity,
      operator: operator || 'المالك',
      reason: isConsumed
        ? `تعديل معلومات عامة آمنة للدفعة المستهلكة (المورد: ${b.supplier || 'بدون'}, التوريد: ${b.purchase_date})`
        : `تعديل كافة بيانات الدفعة غير المستهلكة (التكلفة: ${b.purchase_price} ج.م, السعة: ${b.original_quantity} ${b.yield_unit || 'كوب'})`
    });

    return { success: true, list, batch: b };
  },

  getInventoryBatchLogs: (): InventoryBatchLog[] => {
    return getLocal<InventoryBatchLog[]>(KEYS.INVENTORY_BATCH_LOGS, []);
  },

  addInventoryBatchLog: (log: Omit<InventoryBatchLog, 'id' | 'date' | 'time'>): InventoryBatchLog[] => {
    const list = dbService.getInventoryBatchLogs();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    const newLog: InventoryBatchLog = {
      ...log,
      id: `blog_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: dateStr,
      time: timeStr
    };
    list.unshift(newLog); // latest log first
    setLocal(KEYS.INVENTORY_BATCH_LOGS, list);
    return list;
  },

  getNextBatchNumber: (itemName: string): number => {
    const list = dbService.getInventoryBatches();
    const matching = list.filter(b => b.item_name.trim().toLowerCase() === itemName.trim().toLowerCase());
    if (matching.length === 0) return 1;
    let maxNum = 0;
    matching.forEach(b => {
      const match = b.batch_serial.match(/رقم\s+(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    return maxNum + 1;
  },

  checkInventorySufficiency: (cartItems: CartItem[]): { sufficient: boolean; message?: string } => {
    const batches = dbService.getInventoryBatches();
    const products = dbService.getProducts();
    const rawMaterials = dbService.getRawMaterials();

    // Group the required items
    const requiredQuantities: { [itemId: string]: { name: string; quantity: number; isRawMaterial: boolean } } = {};

    for (const cartItem of cartItems) {
      const prod = cartItem.product;
      if (isServiceOrNonInventoryProduct(prod)) {
        continue; // Skip inventory checks for PlayStation playtime fees and service products
      }
      const qty = cartItem.quantity;

      if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
        // It's a prepared drink using raw materials. Mark raw materials as required.
        for (const ingredient of prod.recipe_ingredients) {
          const ingProd = products.find(p => p.id === ingredient.raw_material_id) || rawMaterials.find(r => r.id === ingredient.raw_material_id);
          const ingName = ingProd ? (ingProd as any).name_ar || (ingProd as any).name : 'مادة خام';
          if (!requiredQuantities[ingredient.raw_material_id]) {
            requiredQuantities[ingredient.raw_material_id] = { name: ingName, quantity: 1, isRawMaterial: true };
          }
        }
      } else {
        // It's a ready-made product (canned, water, etc.), check piece count
        if (!requiredQuantities[prod.id]) {
          requiredQuantities[prod.id] = { name: prod.name_ar, quantity: 0, isRawMaterial: false };
        }
        requiredQuantities[prod.id].quantity += qty;
      }
    }

    // Check inventory batch availability
    for (const itemId in requiredQuantities) {
      const req = requiredQuantities[itemId];
      const targetItem = products.find(p => p.id === itemId) || rawMaterials.find(r => r.id === itemId);
      const targetName = targetItem ? ((targetItem as any).name_ar || (targetItem as any).name || '') : '';

      if (req.isRawMaterial) {
        // For raw material ingredients: presence of active open batch (status !== COMPLETED) means material is available
        const activeRmBatches = batches.filter(b => {
          const matchId = b.item_id === itemId;
          const matchName = targetName && b.item_name.trim().toLowerCase() === targetName.trim().toLowerCase();
          return (matchId || matchName) && b.status !== 'COMPLETED';
        });

        if (activeRmBatches.length === 0) {
          return {
            sufficient: false,
            message: `المادة الخام "${req.name}" لا تملك دفعة نشطة مفتوحة حالياً بالمحل! يرجى إضافة أو تفعيل دفعة مواد خام جديدة.`
          };
        }
      } else {
        // For ready-made products (cans, bottled water), check exact unit count in remaining_quantity
        const itemBatches = batches.filter(b => {
          const matchId = b.item_id === itemId;
          const matchName = targetName && b.item_name.trim().toLowerCase() === targetName.trim().toLowerCase();
          return (matchId || matchName) && b.remaining_quantity > 0;
        });
        const totalAvailable = itemBatches.reduce((sum, b) => sum + b.remaining_quantity, 0);

        if (totalAvailable < req.quantity) {
          return {
            sufficient: false,
            message: `المخزون غير كافٍ للمنتج الجاهز "${req.name}"! الكمية المطلوبة: ${req.quantity}، المتاحة في الدفعات: ${totalAvailable} فقط.`
          };
        }
      }
    }

    return { sufficient: true };
  },

  consumeInventoryBatches: (
    itemId: string,
    quantityToConsume: number,
    invoiceId: string,
    invoiceNum: string,
    productName: string,
    unitPrice: number,
    operator: string,
    productQty?: number
  ): void => {
    if (quantityToConsume <= 0) return;
    if (itemId === 'service_playstation' || itemId === 'prod_playstation' || itemId.startsWith('service_')) return;
    const batches = dbService.getInventoryBatches();
    const consumptions = getLocal<any[]>('cafe_batch_consumptions', []);
    const products = dbService.getProducts();
    const rawMaterials = dbService.getRawMaterials();

    const targetItem = products.find(p => p.id === itemId) || rawMaterials.find(r => r.id === itemId);
    if (targetItem && isServiceOrNonInventoryProduct(targetItem)) return;
    const targetName = targetItem ? ((targetItem as any).name_ar || (targetItem as any).name || '') : '';

    const rm = rawMaterials.find(r => r.id === itemId);
    if (rm) {
      // Find the open/active batch for this raw material (status !== COMPLETED)
      const sortedRmBatches = batches
        .filter(b => {
          const matchId = b.item_id === itemId;
          const matchName = targetName && b.item_name.trim().toLowerCase() === targetName.trim().toLowerCase();
          return (matchId || matchName) && b.status !== 'COMPLETED';
        })
        .sort((a, b) => {
          const activeA = a.status === 'ACTIVE' ? 1 : 0;
          const activeB = b.status === 'ACTIVE' ? 1 : 0;
          if (activeA !== activeB) return activeB - activeA;
          const dateA = new Date(a.purchase_date).getTime();
          const dateB = new Date(b.purchase_date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return a.created_at.localeCompare(b.created_at);
        });

      const batchToUpdate = sortedRmBatches[0] ? batches.find(b => b.id === sortedRmBatches[0].id) : null;
      if (batchToUpdate) {
        const consumptionId = `cons_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const pQty = productQty !== undefined ? productQty : quantityToConsume;
        
        // Check if Sugar or shared material (Sugar, Milk, Water...)
        const isSugar = isSugarMaterial(rm.name) || isSugarMaterial(targetName) || isSugarMaterial(batchToUpdate.item_name);
        const isShared = isSugar || rm.is_shared || (rm.name && (
          rm.name.includes('حليب') || rm.name.includes('لبن') || rm.name.includes('ماء') || rm.name.includes('مياه')
        ));
        
        const totalRevenue = isShared ? 0 : (unitPrice * pQty);
        const cupsSold = pQty;
        const previousConsumed = batchToUpdate.consumed_quantity;

        // Increment count of cups/units used from this open batch
        batchToUpdate.consumed_quantity += cupsSold;

        // Calculate remaining cups and auto-completion status
        if (batchToUpdate.yield_capacity) {
          const remCups = Math.max(0, batchToUpdate.yield_capacity - batchToUpdate.consumed_quantity);
          batchToUpdate.remaining_cups = remCups;
          batchToUpdate.remaining_quantity = remCups;
          
          // Accumulate Batch Sales Revenue & Profit (Always 0 for Sugar)
          if (isSugar) {
            batchToUpdate.total_revenue = 0;
            batchToUpdate.net_profit = 0;
            batchToUpdate.profit_margin = 0;
          } else {
            const currentRev = (batchToUpdate.total_revenue || 0) + totalRevenue;
            batchToUpdate.total_revenue = currentRev;
            batchToUpdate.net_profit = currentRev - batchToUpdate.purchase_price;
            batchToUpdate.profit_margin = batchToUpdate.purchase_price > 0 ? (batchToUpdate.net_profit / batchToUpdate.purchase_price) * 100 : 0;
          }

          if (remCups <= 0) {
            batchToUpdate.status = 'COMPLETED';
            if (!batchToUpdate.ended_at) batchToUpdate.ended_at = new Date().toISOString();
            // Auto activate next batch for the same raw material if available
            const nextBatch = batches.find(nb => 
              nb.id !== batchToUpdate.id &&
              (nb.item_id === batchToUpdate.item_id || nb.item_name.trim().toLowerCase() === batchToUpdate.item_name.trim().toLowerCase()) &&
              nb.status !== 'COMPLETED'
            );
            if (nextBatch) {
              nextBatch.status = 'ACTIVE';
            }
          } else if (remCups <= 10) {
            batchToUpdate.status = 'LOW';
          } else {
            batchToUpdate.status = 'ACTIVE';
          }
        } else {
          batchToUpdate.status = 'ACTIVE';
        }

        const costPerCup = isSugar ? 0 : (batchToUpdate.yield_capacity
          ? (batchToUpdate.purchase_price / batchToUpdate.yield_capacity)
          : (batchToUpdate.purchase_price / 50));

        consumptions.push({
          id: consumptionId,
          invoice_id: invoiceId,
          batch_id: batchToUpdate.id,
          item_id: itemId,
          quantity_consumed: cupsSold,
          unit_cost: isSugar ? 0 : costPerCup,
          total_cost: isShared ? 0 : (cupsSold * costPerCup),
          unit_price: isSugar ? 0 : unitPrice,
          total_revenue: totalRevenue,
          product_name: productName,
          product_quantity: pQty,
          date: new Date().toISOString()
        });

        // Add Batch Log
        dbService.addInventoryBatchLog({
          batch_id: batchToUpdate.id,
          batch_serial: batchToUpdate.batch_serial,
          item_name: batchToUpdate.item_name,
          action_type: 'SALE_DEDUCT',
          quantity_changed: cupsSold,
          previous_quantity: previousConsumed,
          new_quantity: batchToUpdate.consumed_quantity,
          operator: operator || 'الكاشير',
          reason: `مبيعات ${productName} (عدد ${pQty} كوب) - خصم كوب من الدفعة`
        });

        setLocal(KEYS.INVENTORY_BATCHES, batches);
        setLocal('cafe_batch_consumptions', consumptions);
      }
      return;
    }
    
    // Sort active batches chronologically by purchase_date then by created_at
    const sortedBatches = batches
      .filter(b => {
        const matchId = b.item_id === itemId;
        const matchName = targetName && b.item_name.trim().toLowerCase() === targetName.trim().toLowerCase();
        return (matchId || matchName) && b.remaining_quantity > 0;
      })
      .sort((a, b) => {
        const dateA = new Date(a.purchase_date).getTime();
        const dateB = new Date(b.purchase_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.created_at.localeCompare(b.created_at);
      });

    // Helper to get raw material conversion ratio
    const getRawMaterialRatio = (unit: string): number => {
      const u = (unit || '').trim().toLowerCase();
      if (
        u === 'كيلوجرام' ||
        u === 'كجم' ||
        u === 'kg' ||
        u === 'kilogram' ||
        u === 'كيلو' ||
        u === 'كيلو جرام' ||
        u === 'لتر' ||
        u === 'l' ||
        u === 'liter'
      ) {
        return 1000;
      }
      return 1;
    };

    const rmRatio = 1;
    const neededTotalInBatchUnits = quantityToConsume;
    let needed = neededTotalInBatchUnits;

    for (const batch of sortedBatches) {
      if (needed <= 0) break;

      const batchToUpdate = batches.find(b => b.id === batch.id);
      if (!batchToUpdate) continue;

      const allocatedQty = Math.min(batchToUpdate.remaining_quantity, needed);
      
      const previousQty = batchToUpdate.remaining_quantity;
      batchToUpdate.consumed_quantity += allocatedQty;
      batchToUpdate.remaining_quantity = Math.max(0, batchToUpdate.original_quantity - batchToUpdate.consumed_quantity);

      // Auto update status
      if (batchToUpdate.remaining_quantity <= 0) {
        batchToUpdate.status = 'COMPLETED';
      } else if (batchToUpdate.remaining_quantity / batchToUpdate.original_quantity <= 0.2) {
        batchToUpdate.status = 'LOW';
      } else {
        batchToUpdate.status = 'ACTIVE';
      }

      const newQty = batchToUpdate.remaining_quantity;
      needed -= allocatedQty;

      // Add Consumption record
      const consumptionId = `cons_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const ratio = neededTotalInBatchUnits > 0 ? (allocatedQty / neededTotalInBatchUnits) : 1;
      const totalRevenue = (unitPrice * (productQty !== undefined ? productQty : quantityToConsume)) * ratio;
      const allocatedProductQty = productQty !== undefined ? (productQty * ratio) : (allocatedQty * rmRatio);

      consumptions.push({
        id: consumptionId,
        invoice_id: invoiceId,
        batch_id: batchToUpdate.id,
        item_id: itemId,
        quantity_consumed: allocatedQty,
        unit_cost: batchToUpdate.purchase_price,
        total_cost: allocatedQty * batchToUpdate.purchase_price,
        unit_price: unitPrice,
        total_revenue: totalRevenue,
        product_name: productName,
        product_quantity: allocatedProductQty,
        date: new Date().toISOString()
      });

      // Add Batch Log
      dbService.addInventoryBatchLog({
        batch_id: batchToUpdate.id,
        batch_serial: batchToUpdate.batch_serial,
        item_name: batchToUpdate.item_name,
        action_type: 'SALE_DEDUCT',
        quantity_changed: allocatedQty,
        previous_quantity: previousQty,
        new_quantity: newQty,
        operator: operator || 'الكاشير',
        reason: `بيع تلقائي بموجب الفاتورة رقم ${invoiceNum}`
      });
    }

    setLocal(KEYS.INVENTORY_BATCHES, batches);
    setLocal('cafe_batch_consumptions', consumptions);
  },

  rollbackInventoryBatches: (invoiceId: string, operator: string): void => {
    const batches = dbService.getInventoryBatches();
    const consumptions = getLocal<any[]>('cafe_batch_consumptions', []);
    
    // Find all consumptions for this invoice
    const invoiceConsumptions = consumptions.filter(c => c.invoice_id === invoiceId);
    if (invoiceConsumptions.length === 0) return;

    invoiceConsumptions.forEach(cons => {
      const batchToUpdate = batches.find(b => b.id === cons.batch_id);
      if (batchToUpdate) {
        const previousQty = batchToUpdate.remaining_quantity;
        
        // Reverse consumed quantity
        batchToUpdate.consumed_quantity = Math.max(0, batchToUpdate.consumed_quantity - cons.quantity_consumed);
        batchToUpdate.remaining_quantity = Math.max(0, batchToUpdate.original_quantity - batchToUpdate.consumed_quantity);

        // Auto update status
        if (batchToUpdate.remaining_quantity <= 0) {
          batchToUpdate.status = 'COMPLETED';
        } else if (batchToUpdate.remaining_quantity / batchToUpdate.original_quantity <= 0.2) {
          batchToUpdate.status = 'LOW';
        } else {
          batchToUpdate.status = 'ACTIVE';
        }

        const newQty = batchToUpdate.remaining_quantity;

        // Add Batch Log
        dbService.addInventoryBatchLog({
          batch_id: batchToUpdate.id,
          batch_serial: batchToUpdate.batch_serial,
          item_name: batchToUpdate.item_name,
          action_type: 'SALE_RETURN',
          quantity_changed: cons.quantity_consumed,
          previous_quantity: previousQty,
          new_quantity: newQty,
          operator: operator || 'الكاشير',
          reason: `إرجاع مبيعات / إلغاء للفاتورة بموجب عملية مرتجع`
        });
      }
    });

    // Remove the consumption records
    const remainingConsumptions = consumptions.filter(c => c.invoice_id !== invoiceId);
    
    setLocal(KEYS.INVENTORY_BATCHES, batches);
    setLocal('cafe_batch_consumptions', remainingConsumptions);
  },

  returnBatchQuantity: (
    invoiceId: string,
    productId: string,
    quantityToRestore: number,
    operator: string
  ): void => {
    if (quantityToRestore <= 0) return;
    const products = dbService.getProducts();
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const batches = dbService.getInventoryBatches();
    const consumptions = getLocal<any[]>('cafe_batch_consumptions', []);
    const rawMaterials = dbService.getRawMaterials();

    // Helper to get raw material conversion ratio
    const getRawMaterialRatio = (unit: string): number => {
      const u = (unit || '').trim().toLowerCase();
      if (
        u === 'كيلوجرام' ||
        u === 'كجم' ||
        u === 'kg' ||
        u === 'kilogram' ||
        u === 'كيلو' ||
        u === 'كيلو جرام' ||
        u === 'لتر' ||
        u === 'l' ||
        u === 'liter'
      ) {
        return 1000;
      }
      return 1;
    };

    // Helper to restore specific itemId
    const restoreItemBatch = (itemId: string, amtToRestore: number) => {
      const rm = rawMaterials.find(r => r.id === itemId);
      const rmRatio = rm ? getRawMaterialRatio(rm.unit) : 1;
      let needed = amtToRestore / rmRatio;

      // Find consumptions for this item in this invoice, sorted by date DESC (reverse of FIFO)
      const itemConsumptions = consumptions
        .filter(c => c.invoice_id === invoiceId && c.item_id === itemId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      for (const cons of itemConsumptions) {
        if (needed <= 0) break;

        const batchToUpdate = batches.find(b => b.id === cons.batch_id);
        if (batchToUpdate) {
          const restoreQty = Math.min(cons.quantity_consumed, needed);
          const previousQty = batchToUpdate.remaining_quantity;

          // Proportionally restore product_quantity if stored
          if (cons.product_quantity !== undefined && cons.quantity_consumed > 0) {
            const productRestoreRatio = restoreQty / cons.quantity_consumed;
            cons.product_quantity = Math.max(0, cons.product_quantity - (cons.product_quantity * productRestoreRatio));
          }

          batchToUpdate.consumed_quantity = Math.max(0, batchToUpdate.consumed_quantity - restoreQty);
          batchToUpdate.remaining_quantity = Math.max(0, batchToUpdate.original_quantity - batchToUpdate.consumed_quantity);

          // Update status
          if (batchToUpdate.remaining_quantity <= 0) {
            batchToUpdate.status = 'COMPLETED';
          } else if (batchToUpdate.remaining_quantity / batchToUpdate.original_quantity <= 0.2) {
            batchToUpdate.status = 'LOW';
          } else {
            batchToUpdate.status = 'ACTIVE';
          }

          // Reduce the quantity in consumption record
          cons.quantity_consumed -= restoreQty;
          cons.total_cost = cons.quantity_consumed * cons.unit_cost;
          cons.total_revenue = cons.quantity_consumed * cons.unit_price;

          needed -= restoreQty;

          // Add Batch Log
          dbService.addInventoryBatchLog({
            batch_id: batchToUpdate.id,
            batch_serial: batchToUpdate.batch_serial,
            item_name: batchToUpdate.item_name,
            action_type: 'SALE_RETURN',
            quantity_changed: restoreQty,
            previous_quantity: previousQty,
            new_quantity: batchToUpdate.remaining_quantity,
            operator: operator || 'الكاشير',
            reason: `إرجاع مبيعات جزئي بموجب حركة مرتجع للفاتورة`
          });
        }
      }

      // Clean up consumption records with 0 quantity_consumed
      const cleanedConsumptions = consumptions.filter(c => c.quantity_consumed > 0 || c.invoice_id !== invoiceId || c.item_id !== itemId);
      return cleanedConsumptions;
    };

    let updatedConsumptions = consumptions;
    if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
      prod.recipe_ingredients.forEach(ingredient => {
        const totalConsumedToRestore = ingredient.quantity * quantityToRestore;
        updatedConsumptions = restoreItemBatch(ingredient.raw_material_id, totalConsumedToRestore);
      });
    } else {
      updatedConsumptions = restoreItemBatch(prod.id, quantityToRestore);
    }

    setLocal(KEYS.INVENTORY_BATCHES, batches);
    setLocal('cafe_batch_consumptions', updatedConsumptions);
  },

  // --- Partners & Partner Drawings ---
  getPartners: (): Partner[] => getLocal<Partner[]>(KEYS.PARTNERS, []),
  savePartner: (partner: Partner, operator: string = 'المدير'): Partner => {
    const list = dbService.getPartners();
    const idx = list.findIndex(p => p.id === partner.id);
    const updatedPartner = { ...partner, updated_at: new Date().toISOString() };
    if (idx > -1) {
      list[idx] = updatedPartner;
      dbService.logAuditAction('EDIT_PARTNER', `تم تعديل بيانات الشريك: ${partner.name} - نسبة الملكية: ${partner.ownership_percent}%`, operator);
    } else {
      updatedPartner.id = updatedPartner.id || `partner_${Date.now()}`;
      updatedPartner.created_at = new Date().toISOString();
      list.push(updatedPartner);
      dbService.logAuditAction('ADD_PARTNER', `تم إضافة الشريك الجديد: ${partner.name} - نسبة الملكية: ${partner.ownership_percent}%`, operator);
    }
    setLocal(KEYS.PARTNERS, list);
    return updatedPartner;
  },
  deletePartner: (id: string, operator: string = 'المدير'): void => {
    const list = dbService.getPartners();
    const partner = list.find(p => p.id === id);
    if (partner) {
      const filtered = list.filter(p => p.id !== id);
      setLocal(KEYS.PARTNERS, filtered);

      // Handle linked financial drawings safely so accounting metrics remain accurate
      const drawings = dbService.getPartnerDrawings();
      const hasDrawings = drawings.some(d => d.partner_id === id);
      if (hasDrawings) {
        const updatedDrawings = drawings.map(d => {
          if (d.partner_id === id) {
            return {
              ...d,
              partner_name: `${partner.name} (شريك محذوف)`
            };
          }
          return d;
        });
        setLocal(KEYS.PARTNER_DRAWINGS, updatedDrawings);
      }

      dbService.logAuditAction('DELETE_PARTNER', `تم حذف الشريك: ${partner.name}`, operator);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
      }
    }
  },

  getPartnerDrawings: (partnerId?: string): PartnerDrawing[] => {
    const list = getLocal<PartnerDrawing[]>(KEYS.PARTNER_DRAWINGS, []);
    if (partnerId) {
      return list.filter(d => d.partner_id === partnerId);
    }
    return list;
  },
  savePartnerDrawing: (drawing: Omit<PartnerDrawing, 'id' | 'created_at'> & { id?: string; created_at?: string }, operator: string = 'المدير'): PartnerDrawing => {
    const list = getLocal<PartnerDrawing[]>(KEYS.PARTNER_DRAWINGS, []);
    let savedDrawing: PartnerDrawing;
    
    if (drawing.id) {
      const idx = list.findIndex(d => d.id === drawing.id);
      if (idx > -1) {
        savedDrawing = {
          ...list[idx],
          ...drawing,
          id: drawing.id,
          created_at: drawing.created_at || list[idx].created_at
        };
        list[idx] = savedDrawing;
        dbService.logAuditAction(
          'EDIT_PARTNER_DRAWING',
          `تعديل مسحوب الشريك: ${savedDrawing.partner_name} بقيمة ${savedDrawing.amount} ج.م. السبب: ${savedDrawing.reason}`,
          operator
        );
      } else {
        savedDrawing = {
          ...drawing,
          id: `pdraw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          created_at: drawing.created_at || new Date().toISOString()
        } as PartnerDrawing;
        list.push(savedDrawing);
        dbService.logAuditAction(
          'ADD_PARTNER_DRAWING',
          `تسجيل مسحوب جديد للشريك: ${savedDrawing.partner_name} بقيمة ${savedDrawing.amount} ج.م. السبب: ${savedDrawing.reason}`,
          operator
        );
      }
    } else {
      savedDrawing = {
        ...drawing,
        id: `pdraw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        created_at: new Date().toISOString()
      } as PartnerDrawing;
      list.push(savedDrawing);
      dbService.logAuditAction(
        'ADD_PARTNER_DRAWING',
        `تسجيل مسحوب جديد للشريك: ${savedDrawing.partner_name} بقيمة ${savedDrawing.amount} ج.م. السبب: ${savedDrawing.reason}`,
        operator
      );
    }
    
    setLocal(KEYS.PARTNER_DRAWINGS, list);
    return savedDrawing;
  },
  deletePartnerDrawing: (id: string, operator: string = 'المدير'): void => {
    const list = getLocal<PartnerDrawing[]>(KEYS.PARTNER_DRAWINGS, []);
    const drawing = list.find(d => d.id === id);
    if (drawing) {
      const filtered = list.filter(d => d.id !== id);
      setLocal(KEYS.PARTNER_DRAWINGS, filtered);
      dbService.logAuditAction(
        'DELETE_PARTNER_DRAWING',
        `حذف مسحوب الشريك: ${drawing.partner_name} بقيمة ${drawing.amount} ج.م (تاريخ: ${drawing.date})`,
        operator
      );
    }
  },
  calculateFinancialMetrics: () => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []).filter(i => i.invoice_status !== 'CANCELLED');
    const invoiceItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    const expenses = getLocal<Expense[]>(KEYS.EXPENSES, []);

    const totalSales = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const netProfit = totalSales - totalExpenses;
    const totalOrders = invoices.length;

    const productSalesMap: Record<string, number> = {};
    invoiceItems.forEach(item => {
      const name = item.product_name_ar || 'منتج';
      productSalesMap[name] = (productSalesMap[name] || 0) + (item.quantity || 1);
    });

    const topProducts = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`);

    return {
      totalSales,
      totalExpenses,
      netProfit,
      totalOrders,
      invoicesCount: totalOrders,
      topProducts
    };
  },
  getUpdateLogs: (): UpdateLog[] => {
    return getLocal<UpdateLog[]>(KEYS.UPDATE_LOGS, []);
  },
  addUpdateLog: (logEntry: Omit<UpdateLog, 'id' | 'timestamp'>): UpdateLog => {
    const logs = getLocal<UpdateLog[]>(KEYS.UPDATE_LOGS, []);
    const newLog: UpdateLog = {
      id: `upd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    logs.unshift(newLog);
    // Keep last 100 update logs
    const trimmed = logs.slice(0, 100);
    setLocal(KEYS.UPDATE_LOGS, trimmed);
    return newLog;
  },

  // --- BARISTA ORDER MANAGEMENT ---
  getBaristaOrders: (): BaristaOrder[] => {
    return getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
  },

  addBaristaOrder: (orderData: {
    order_number: string;
    invoice_id?: string;
    table_number?: string;
    customer_name?: string;
    cashier_name?: string;
    items: BaristaOrderItem[];
    notes?: string;
    status?: BaristaOrderStatus;
    sent_time?: string;
  }): BaristaOrder => {
    const orders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const newOrder: BaristaOrder = {
      id: `bar_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      order_number: orderData.order_number,
      invoice_id: orderData.invoice_id,
      table_number: orderData.table_number || '',
      customer_name: orderData.customer_name || 'عميل مباشر',
      cashier_name: orderData.cashier_name || 'الكاشير',
      status: orderData.status || 'NEW',
      items: orderData.items || [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      sent_time: orderData.sent_time || timeStr,
      notes: orderData.notes || ''
    };

    // If active order already exists for same order_number or invoice_id, update items and timestamp
    const existingIdx = orders.findIndex(o =>
      (orderData.invoice_id && o.invoice_id === orderData.invoice_id) ||
      (o.order_number === newOrder.order_number && o.status !== 'DELIVERED')
    );

    if (existingIdx >= 0) {
      orders[existingIdx] = {
        ...orders[existingIdx],
        ...newOrder,
        id: orders[existingIdx].id,
        updated_at: now.toISOString()
      };
    } else {
      orders.unshift(newOrder);
    }

    setLocal(KEYS.BARISTA_ORDERS, orders);

    // Play notification chime
    playBaristaNewOrderSound();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('barista_orders_updated'));
      window.dispatchEvent(new CustomEvent('barista_new_order', { detail: { order: newOrder } }));
    }

    return newOrder;
  },

  updateBaristaOrderStatus: (orderId: string, status: BaristaOrderStatus): BaristaOrder | null => {
    const orders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    const index = orders.findIndex(o => o.id === orderId || o.invoice_id === orderId || o.order_number === orderId);
    if (index === -1) return null;

    const updatedOrder: BaristaOrder = {
      ...orders[index],
      status,
      updated_at: new Date().toISOString()
    };
    orders[index] = updatedOrder;
    setLocal(KEYS.BARISTA_ORDERS, orders);

    // Sync operational_status on corresponding invoice without changing invoice_status
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const invIdx = invoices.findIndex(i =>
      (updatedOrder.invoice_id && i.id === updatedOrder.invoice_id) ||
      i.id === updatedOrder.id ||
      i.invoice_number === updatedOrder.order_number ||
      i.invoice_number === `INV-${updatedOrder.order_number}` ||
      updatedOrder.order_number.endsWith(i.invoice_number)
    );
    if (invIdx > -1) {
      invoices[invIdx].operational_status = status;
      invoices[invIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.INVOICES, invoices);
    }

    if (status === 'READY') {
      playOrderReadySound();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('barista_order_ready', { detail: { order: updatedOrder } }));
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('barista_orders_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return updatedOrder;
  },

  updateInvoiceOperationalStatus: (invoiceId: string, status: OperationalStatus): Invoice | null => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId || i.invoice_number === invoiceId);
    if (idx === -1) return null;

    invoices[idx].operational_status = status;
    invoices[idx].updated_at = new Date().toISOString();
    setLocal(KEYS.INVOICES, invoices);

    // Sync matching Barista order if found
    const orders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    const baristaIdx = orders.findIndex(o =>
      o.invoice_id === invoices[idx].id ||
      o.order_number === invoices[idx].invoice_number ||
      o.id === invoices[idx].id
    );

    if (baristaIdx > -1) {
      orders[baristaIdx].status = status as BaristaOrderStatus;
      orders[baristaIdx].updated_at = new Date().toISOString();
      setLocal(KEYS.BARISTA_ORDERS, orders);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('barista_orders_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return invoices[idx];
  },

  deleteBaristaOrder: (orderId: string): boolean => {
    const orders = getLocal<BaristaOrder[]>(KEYS.BARISTA_ORDERS, []);
    const filtered = orders.filter(o => o.id !== orderId && o.invoice_id !== orderId && o.order_number !== orderId);
    setLocal(KEYS.BARISTA_ORDERS, filtered);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('barista_orders_updated'));
    }
    return true;
  }
};

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
  OrderNoteHistoryItem,
  OperationalStatus,
  Shift,
  ShiftHandover,
  ShiftType,
  ShiftStatus,
  SafeType,
  SafeTransactionType,
  SafeTransaction,
  ShortageTargetAccount,
  ShortageSettlement,
  DailyShortage
} from './types';
import { sanitizePaymentMethod } from './utils/paymentUtils';
import { playOrderReadySound } from './lib/audioService';
import { verifyAdminSecurityPassword, isAdminSecurityPasswordSet } from './lib/securityService';

import { safeStorage } from './lib/safeStorage';
import { Capacitor } from '@capacitor/core';
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

const OPEN_VAULT_KEY = 'cafe_open_invoices_vault';
const OPEN_ITEMS_VAULT_KEY = 'cafe_open_invoice_items_vault';
const OPEN_VAULT_IDB_NAME = 'cafe_eldeeb_open_vault_db';
const OPEN_VAULT_IDB_STORE = 'vault_store';

let isResettingDatabase = false;
const explicitlyDeletingInvoiceIds = new Set<string>();

const isOpenOrDraftStatus = (status: any): boolean => {
  const st = String(status || '').toUpperCase().trim();
  return st === 'OPEN' || st === 'DRAFT';
};

const parseInvTs = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 1000000000000) return num;
    const parsed = Date.parse(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const getInvTs = (inv: any): number => {
  if (!inv || typeof inv !== 'object') return 0;
  return Math.max(
    parseInvTs(inv.updated_at),
    parseInvTs(inv.created_at),
    parseInvTs(inv.invoice_date)
  );
};

const getDeletedTombstones = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem('cafe_deleted_records');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getNextInvoiceNumber = (invoices: Invoice[], offset = 1): string => {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  const seqRegex = new RegExp(`INV-${year}-(\\d+)`);
  (invoices || []).forEach(inv => {
    const m = String(inv?.invoice_number || '').match(seqRegex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  });
  const base = Math.max(maxSeq, (invoices || []).length);
  return `INV-${year}-${String(base + offset).padStart(5, '0')}`;
};

const saveVaultToIDB = (invoices: Invoice[], items: InvoiceItem[]): void => {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const req = window.indexedDB.open(OPEN_VAULT_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OPEN_VAULT_IDB_STORE)) {
        db.createObjectStore(OPEN_VAULT_IDB_STORE);
      }
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(OPEN_VAULT_IDB_STORE, 'readwrite');
        const store = tx.objectStore(OPEN_VAULT_IDB_STORE);
        store.put(invoices, OPEN_VAULT_KEY);
        store.put(items, OPEN_ITEMS_VAULT_KEY);
        tx.oncomplete = () => db.close();
      } catch {}
    };
  } catch {}
};

const restoreVaultFromIDBIfNeeded = (): Promise<void> => {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(OPEN_VAULT_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OPEN_VAULT_IDB_STORE)) {
          db.createObjectStore(OPEN_VAULT_IDB_STORE);
        }
      };
      req.onerror = () => resolve();
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(OPEN_VAULT_IDB_STORE, 'readonly');
          const store = tx.objectStore(OPEN_VAULT_IDB_STORE);
          const getInv = store.get(OPEN_VAULT_KEY);
          const getItems = store.get(OPEN_ITEMS_VAULT_KEY);
          tx.oncomplete = () => {
            try {
              const idbInvs = Array.isArray(getInv.result) ? (getInv.result as Invoice[]) : [];
              const idbItems = Array.isArray(getItems.result) ? (getItems.result as InvoiceItem[]) : [];
              if (idbInvs.length > 0) {
                const existingVault = getLocal<Invoice[]>(OPEN_VAULT_KEY, []);
                const existingItemsVault = getLocal<InvoiceItem[]>(OPEN_ITEMS_VAULT_KEY, []);
                const deletedMap = getDeletedTombstones();
                const mergedMap = new Map<string, Invoice>();
                [...existingVault, ...idbInvs].forEach(inv => {
                  if (!inv || !inv.id || !isOpenOrDraftStatus(inv.invoice_status)) return;
                  const delTs = Math.max(
                    deletedMap[`cafe_invoices::${inv.id}`] || 0,
                    deletedMap[`${OPEN_VAULT_KEY}::${inv.id}`] || 0
                  );
                  if (delTs > 0 && delTs >= getInvTs(inv)) return;
                  const cur = mergedMap.get(inv.id);
                  if (!cur || getInvTs(inv) > getInvTs(cur)) mergedMap.set(inv.id, inv);
                });
                const mergedInvs = Array.from(mergedMap.values());
                const mergedIds = new Set(mergedInvs.map(i => i.id));
                const itemMap = new Map<string, InvoiceItem>();
                [...existingItemsVault, ...idbItems].forEach(it => {
                  if (!it || !it.id || !mergedIds.has(it.invoice_id)) return;
                  const cur = itemMap.get(it.id);
                  if (!cur || getInvTs(it) > getInvTs(cur)) itemMap.set(it.id, it);
                });
                if (mergedInvs.length > existingVault.length) {
                  localStorage.setItem(OPEN_VAULT_KEY, JSON.stringify(mergedInvs));
                  localStorage.setItem(OPEN_ITEMS_VAULT_KEY, JSON.stringify(Array.from(itemMap.values())));
                }
              }
            } catch {}
            db.close();
            resolve();
          };
          tx.onerror = () => { db.close(); resolve(); };
        } catch {
          resolve();
        }
      };
    } catch {
      resolve();
    }
  });
};

const syncOpenInvoicesVaultState = (allInvoices: Invoice[], allItems?: InvoiceItem[], pushToCloud = true): void => {
  const openInvoices = (allInvoices || []).filter(inv => inv && inv.id && isOpenOrDraftStatus(inv.invoice_status));
  const openIds = new Set(openInvoices.map(i => i.id));
  const itemsSource = allItems || getLocal<InvoiceItem[]>('cafe_invoice_items', []);
  const openItems = (itemsSource || []).filter(it => it && openIds.has(it.invoice_id));

  try {
    localStorage.setItem(OPEN_VAULT_KEY, JSON.stringify(openInvoices));
    localStorage.setItem(OPEN_ITEMS_VAULT_KEY, JSON.stringify(openItems));
  } catch {}
  saveVaultToIDB(openInvoices, openItems);

  if (pushToCloud) {
    try {
      firebaseSyncService.pushKeyToCloud(OPEN_VAULT_KEY, openInvoices);
      firebaseSyncService.pushKeyToCloud(OPEN_ITEMS_VAULT_KEY, openItems);
    } catch {}
  }
};

let isReconcilingVault = false;
const reconcileOpenInvoicesWithVault = (): void => {
  if (isReconcilingVault || isResettingDatabase) return;
  isReconcilingVault = true;
  try {
    const mainInvoices = getLocal<Invoice[]>('cafe_invoices', []);
    const mainItems = getLocal<InvoiceItem[]>('cafe_invoice_items', []);
    const vaultInvoices = getLocal<Invoice[]>(OPEN_VAULT_KEY, []);
    const vaultItems = getLocal<InvoiceItem[]>(OPEN_ITEMS_VAULT_KEY, []);

    if (vaultInvoices.length === 0 && mainInvoices.every(i => !isOpenOrDraftStatus(i?.invoice_status))) {
      return;
    }

    const deletedMap = getDeletedTombstones();
    const mainById = new Map<string, Invoice>();
    mainInvoices.forEach(inv => {
      if (!inv || !inv.id) return;
      const prev = mainById.get(inv.id);
      if (!prev || getInvTs(inv) >= getInvTs(prev)) {
        mainById.set(inv.id, inv);
      }
    });

    let mainChanged = false;
    let vaultChanged = false;
    let itemsChanged = false;
    const cleanVault: Invoice[] = [];
    const restoredInvoiceIds = new Set<string>();

    for (const vInv of vaultInvoices) {
      if (!vInv || !vInv.id || !isOpenOrDraftStatus(vInv.invoice_status)) {
        vaultChanged = true;
        continue;
      }
      const delTs = Math.max(
        deletedMap[`cafe_invoices::${vInv.id}`] || 0,
        deletedMap[`${OPEN_VAULT_KEY}::${vInv.id}`] || 0
      );
      if (delTs > 0 && delTs >= getInvTs(vInv)) {
        vaultChanged = true;
        continue;
      }

      const mainInv = mainById.get(vInv.id);
      if (!mainInv) {
        // Missing from main cafe_invoices -> restore automatically from vault!
        mainById.set(vInv.id, vInv);
        cleanVault.push(vInv);
        restoredInvoiceIds.add(vInv.id);
        mainChanged = true;
      } else if (!isOpenOrDraftStatus(mainInv.invoice_status) && getInvTs(mainInv) >= getInvTs(vInv)) {
        // Invoice was legitimately closed/cancelled more recently or at same timestamp -> prune from vault
        vaultChanged = true;
      } else if (getInvTs(vInv) > getInvTs(mainInv)) {
        mainById.set(vInv.id, vInv);
        cleanVault.push(vInv);
        restoredInvoiceIds.add(vInv.id);
        mainChanged = true;
      } else {
        cleanVault.push(mainInv);
      }
    }

    // Ensure every active OPEN/DRAFT invoice in main is also mirrored in vault
    const cleanVaultIds = new Set(cleanVault.map(i => i.id));
    for (const mInv of mainById.values()) {
      if (isOpenOrDraftStatus(mInv.invoice_status) && !cleanVaultIds.has(mInv.id)) {
        cleanVault.push(mInv);
        cleanVaultIds.add(mInv.id);
        vaultChanged = true;
      }
    }

    let nextItems = [...mainItems];
    if (restoredInvoiceIds.size > 0) {
      const vaultHasItemsForInv = new Set(
        vaultItems.filter(it => it && restoredInvoiceIds.has(it.invoice_id)).map(it => it.invoice_id)
      );
      if (vaultHasItemsForInv.size > 0) {
        nextItems = nextItems.filter(it => !vaultHasItemsForInv.has(it.invoice_id));
        const seenRestoredIds = new Set(nextItems.map(it => it.id));
        for (const vItem of vaultItems) {
          if (!vItem || !vaultHasItemsForInv.has(vItem.invoice_id)) continue;
          if (!seenRestoredIds.has(vItem.id)) {
            nextItems.push(vItem);
            seenRestoredIds.add(vItem.id);
          }
        }
        itemsChanged = true;
      }
    }

    if (mainChanged) {
      const updatedMain = Array.from(mainById.values());
      localStorage.setItem('cafe_invoices', JSON.stringify(updatedMain));
      try { firebaseSyncService.pushKeyToCloud('cafe_invoices', updatedMain); } catch {}
    }
    if (itemsChanged) {
      localStorage.setItem('cafe_invoice_items', JSON.stringify(nextItems));
      try { firebaseSyncService.pushKeyToCloud('cafe_invoice_items', nextItems); } catch {}
    }
    if (vaultChanged || mainChanged || itemsChanged) {
      const latestInvoices = mainChanged ? Array.from(mainById.values()) : mainInvoices;
      syncOpenInvoicesVaultState(latestInvoices, nextItems, vaultChanged);
    }
  } finally {
    isReconcilingVault = false;
  }
};

const setLocal = <T>(key: string, value: T): void => {
  let finalValue: any = value;

  // Structural guard: NEVER allow writing KEYS.INVOICES to silently drop active OPEN/DRAFT invoices
  if (key === 'cafe_invoices' && Array.isArray(value) && !isResettingDatabase) {
    const incoming = value as Invoice[];
    const incomingIds = new Set(incoming.map(i => i?.id).filter(Boolean));
    const prevInvoices = getLocal<Invoice[]>('cafe_invoices', []);
    const vaultInvoices = getLocal<Invoice[]>(OPEN_VAULT_KEY, []);
    const deletedMap = getDeletedTombstones();

    const candidatesMap = new Map<string, Invoice>();
    [...prevInvoices, ...vaultInvoices].forEach(inv => {
      if (!inv || !inv.id || !isOpenOrDraftStatus(inv.invoice_status)) return;
      const cur = candidatesMap.get(inv.id);
      if (!cur || getInvTs(inv) > getInvTs(cur)) candidatesMap.set(inv.id, inv);
    });

    const preservedOpenDraft: Invoice[] = [];
    for (const inv of candidatesMap.values()) {
      if (incomingIds.has(inv.id)) continue;
      if (explicitlyDeletingInvoiceIds.has(inv.id)) continue;
      const delTs = Math.max(
        deletedMap[`cafe_invoices::${inv.id}`] || 0,
        deletedMap[`${OPEN_VAULT_KEY}::${inv.id}`] || 0
      );
      if (delTs > 0 && delTs >= getInvTs(inv)) continue;
      preservedOpenDraft.push(inv);
    }

    if (preservedOpenDraft.length > 0) {
      finalValue = [...incoming, ...preservedOpenDraft];
    }
  }

  try {
    localStorage.setItem(key, JSON.stringify(finalValue));
  } catch (err: any) {
    console.error('localStorage.setItem failed:', err);
  }

  if (key === 'cafe_invoices' && Array.isArray(finalValue) && !isResettingDatabase) {
    syncOpenInvoicesVaultState(finalValue as Invoice[], undefined, true);
  } else if (key === 'cafe_invoice_items' && Array.isArray(finalValue) && !isResettingDatabase) {
    const currInvs = getLocal<Invoice[]>('cafe_invoices', []);
    syncOpenInvoicesVaultState(currInvs, finalValue as InvoiceItem[], true);
  }

  syncToServer();

  try {
    firebaseSyncService.pushKeyToCloud(key, finalValue);
  } catch (err: any) {
    console.error('pushKeyToCloud Exception in setLocal:', err);
  }
};

// Database Keys
const KEYS = {
  CATEGORIES: 'cafe_categories',
  PRODUCTS: 'cafe_products',
  CUSTOMERS: 'cafe_customers',
  SUPPLIERS: 'cafe_suppliers',
  INVOICES: 'cafe_invoices',
  INVOICE_ITEMS: 'cafe_invoice_items',
  OPEN_INVOICES_VAULT: OPEN_VAULT_KEY,
  OPEN_INVOICE_ITEMS_VAULT: OPEN_ITEMS_VAULT_KEY,
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
  SHIFTS: 'cafe_shifts',
  SHIFT_HANDOVERS: 'cafe_shift_handovers',
  SAFE_TRANSACTIONS: 'cafe_safe_transactions',
  DAILY_SHORTAGES: 'cafe_daily_shortages'
};

// Sync current client database state to the server
let isDatabaseLoadedFromServer = false;

export const syncToServer = (() => {
  let timeoutId: any = null;
  const syncFn = () => {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      return;
    }
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
    }).catch(err => {
      // Offline or network disconnect - log gracefully without crashing
      console.warn('Server database sync notice:', err?.message || err);
    });
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
  instapay_id: 'cafeeldeeb@instapay',
  digital_payment_account_owner: 'Cafe Eldeeb',
  vodafone_cash_qr: '',
  instapay_qr: '',
  employee_consumption_policy: 'DEDUCT',
  custom_expense_categories: [],
  auto_update_checks_enabled: true,
  last_update_check_date: new Date().toISOString(),
  last_installed_version: '4.4.4',
  force_update_enabled: false,
  safe_auto_transfer_enabled: true,
  safe_auto_transfer_source: 'BOTH',
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

  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(resetSettings));

  // Clear all data table keys locally without pushing empty arrays to cloud Firestore
  Object.values(KEYS).forEach(k => {
    if (k !== KEYS.SETTINGS) {
      localStorage.removeItem(k);
    }
  });

  // Clear IndexedDB if any
  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      window.indexedDB.deleteDatabase(OPEN_VAULT_IDB_NAME);
      if (window.indexedDB.databases) {
        window.indexedDB.databases().then(dbs => {
          dbs.forEach(db => {
            if (db.name) window.indexedDB.deleteDatabase(db.name);
          });
        }).catch(() => {});
      }
    } catch (e) {}
  }
};

// Seeding Initial Data (No demo data, empty database)
export const seedDatabase = (force = false) => {
  console.log(`[SEED DATABASE DIAGNOSTIC] seedDatabase called with force=${force}`);
  // Check if any existing data is present in ANY of the critical tables
  const hasCategories = getLocal<Category[]>(KEYS.CATEGORIES, []).length > 0;
  const hasProducts = getLocal<Product[]>(KEYS.PRODUCTS, []).length > 0;
  const hasCustomers = getLocal<Customer[]>(KEYS.CUSTOMERS, []).length > 0;
  const hasInvoices = getLocal<Invoice[]>(KEYS.INVOICES, []).length > 0;
  const storedSettings = localStorage.getItem(KEYS.SETTINGS);
  const hasSettings = storedSettings !== null && storedSettings !== undefined && storedSettings !== '{}';

  console.log(`[SEED STATUS] hasCategories:${hasCategories}, hasProducts:${hasProducts}, hasCustomers:${hasCustomers}, hasInvoices:${hasInvoices}, hasSettings:${hasSettings}`);

  if (!hasSettings) {
    console.log('[SEED ACTION] No settings found. Initializing local defaultSettings.');
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
  }

  if (!force && (hasCategories || hasProducts || hasCustomers || hasInvoices || hasSettings)) {
    console.log('[SEED ACTION SKIPPED] Data already exists and force is false. Returning.');
    return;
  }

  // Ensure settings exist if forcing empty database init
  if (force && !hasCategories && !hasProducts && !hasCustomers && !hasInvoices) {
    const existing = getLocal<AppSettings | null>(KEYS.SETTINGS, null);
    if (!existing) {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
    }
    console.log('Cafe Eldeeb empty enterprise database initialized successfully!');
  } else {
    console.log('[SEED ACTION NOTE] seedDatabase force=true condition not fully met or tables already populated.');
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

  // Always anchor previous_balance on the customer's authoritative live current_balance when available
  const customerTxs = txs.filter(t => t.customer_id === txData.customer_id);
  const custObj = customers.find(c => c.id === txData.customer_id);
  let previous_balance = 0;
  if (custObj && typeof custObj.current_balance === 'number') {
    previous_balance = Math.max(0, Math.round((Number(custObj.current_balance) || 0) * 100) / 100);
  } else if (customerTxs.length > 0) {
    customerTxs.forEach(t => {
      if (t.transaction_type === 'INVOICE') previous_balance += t.amount;
      else if (t.transaction_type === 'PAYMENT') previous_balance -= t.amount;
      else if (t.transaction_type === 'MANUAL_ADJUSTMENT') previous_balance += t.amount;
      else if (t.transaction_type === 'CORRECTION') previous_balance += t.amount;
      else if (t.transaction_type === 'REFUND') previous_balance -= t.amount;
    });
  }

  let new_balance = previous_balance;
  if (txData.transaction_type === 'INVOICE') new_balance += txData.amount;
  else if (txData.transaction_type === 'PAYMENT') new_balance -= txData.amount;
  else if (txData.transaction_type === 'MANUAL_ADJUSTMENT') new_balance += txData.amount;
  else if (txData.transaction_type === 'CORRECTION') new_balance += txData.amount;
  else if (txData.transaction_type === 'REFUND') new_balance -= txData.amount;
  new_balance = Math.max(0, Math.round(new_balance * 100) / 100);

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
    firebaseSyncService.recordDeletion(KEYS.AUTH_USERS, id);
    setLocal(KEYS.AUTH_USERS, users);
  },

  authenticateUser: (username: string, password: string): AuthUser | null => {
    const users = dbService.getAuthUsers();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    const found = users.find(u => {
      if (u.username.trim().toLowerCase() !== cleanUsername || !u.is_active) return false;
      if (u.passwordHash === cleanPassword) return true;

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
    await restoreVaultFromIDBIfNeeded();
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      reconcileOpenInvoicesWithVault();
      isDatabaseLoadedFromServer = true;
      return true;
    }
    try {
      const res = await fetch('/api/db');
      if (!res.ok) {
        reconcileOpenInvoicesWithVault();
        isDatabaseLoadedFromServer = true;
        return false;
      }
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        // Only seed keys that do not exist locally to avoid overwriting newer local or Firestore-synced data
        Object.entries(data).forEach(([key, val]) => {
          const existingVal = safeStorage.getItem(key);
          const hasLocalData = existingVal !== null && existingVal !== undefined && existingVal !== '' && existingVal !== '[]' && existingVal !== '{}';

          if (!hasLocalData) {
            // Local storage is empty for this key; seed from db.json as baseline
            safeStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
            // Mark baseline metadata timestamp as 0 so any Firebase cloud data will supersede it cleanly
            if (!safeStorage.getItem(`__meta_updated_${key}`)) {
              safeStorage.setItem(`__meta_updated_${key}`, '0');
            }
          } else if (key === KEYS.SETTINGS) {
            const localSettings = getLocal<AppSettings | null>(KEYS.SETTINGS, null);
            const serverSettings = val as AppSettings;
            if (localSettings && localSettings.is_setup_completed && (!serverSettings || !serverSettings.is_setup_completed)) {
              safeStorage.setItem(key, JSON.stringify({ ...defaultSettings, ...serverSettings, ...localSettings, is_setup_completed: true }));
            } else if (localSettings && localSettings.cafe_name && (!serverSettings || !serverSettings.cafe_name)) {
              safeStorage.setItem(key, JSON.stringify({ ...defaultSettings, ...serverSettings, ...localSettings }));
            }
          }
        });
        reconcileOpenInvoicesWithVault();
        isDatabaseLoadedFromServer = true;
        return true;
      } else {
        reconcileOpenInvoicesWithVault();
        isDatabaseLoadedFromServer = true;
        return false;
      }
    } catch (e: any) {
      console.warn('Server database load notice:', e?.message || e);
      reconcileOpenInvoicesWithVault();
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
      try { localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(uniqueList)); } catch (e) {}
    }
    return uniqueList.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  },
  saveCategory: (category: Category) => {
    console.log('SAVE CATEGORY CALLED:', category);

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
    const categoryToDelete = dbService.getCategories().find(c => c.id === id);
    if (id === 'cat_raw_materials' || (categoryToDelete && categoryToDelete.name_ar.includes('مواد خام'))) {
      localStorage.setItem(KEYS.RAW_MATERIALS_DELETED, 'true');
    }
    const list = dbService.getCategories().filter(c => c.id !== id);
    firebaseSyncService.recordDeletion(KEYS.CATEGORIES, id);
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

        // Auto-assign unconstrained stock if 0 or undefined so invoicing is never blocked
        if (p.current_stock === undefined || p.current_stock === null || p.current_stock === 0) {
          p.current_stock = 99999;
        }
        
        uniqueList.push(p);
      }
    }

    if (uniqueList.length !== list.length) {
      try { localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(uniqueList)); } catch (e) {}
    }
    return uniqueList;
  },
  saveProduct: (product: Product) => {
    console.log('SAVE PRODUCT CALLED:', product);

    const list = dbService.getProducts();
    const idx = list.findIndex(p => p.id === product.id);
    const updatedProd = {
      ...product,
      current_stock: product.current_stock && product.current_stock > 0 ? product.current_stock : 99999,
      updated_at: new Date().toISOString()
    };
    if (idx > -1) {
      list[idx] = updatedProd;
    } else {
      updatedProd.id = (product.id && product.id.trim()) ? product.id : `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      updatedProd.created_at = product.created_at || new Date().toISOString();
      list.push(updatedProd);
    }
    setLocal(KEYS.PRODUCTS, list);
    return list;
  },
  deleteProduct: (id: string) => {
    const list = dbService.getProducts().filter(p => p.id !== id);
    firebaseSyncService.recordDeletion(KEYS.PRODUCTS, id);
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
      try { localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(uniqueList)); } catch (e) {}
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
      updatedCust.id = (customer.id && customer.id.trim()) ? customer.id : `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      updatedCust.created_at = customer.created_at || new Date().toISOString();
      list.push(updatedCust);
    }
    setLocal(KEYS.CUSTOMERS, list);
    return list;
  },
  deleteCustomer: (id: string) => {
    firebaseSyncService.recordDeletion(KEYS.CUSTOMERS, id);

    // 1. Remove the customer from the customer list
    const list = dbService.getCustomers().filter(c => c.id !== id);
    setLocal(KEYS.CUSTOMERS, list);

    // 2. Remove all related communication logs
    const commLogs = getLocal<CustomerCommunicationLog[]>(KEYS.COMMUNICATION_LOGS, []).filter(l => l.customer_id !== id);
    setLocal(KEYS.COMMUNICATION_LOGS, commLogs);

    // 3. Remove all related credit payments (safety cleanup)
    const allPayments = getLocal<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const removedPaymentIds = allPayments.filter(p => p.customer_id === id).map(p => p.id);
    if (removedPaymentIds.length > 0) firebaseSyncService.recordDeletions(KEYS.CREDIT_PAYMENTS, removedPaymentIds);
    setLocal(KEYS.CREDIT_PAYMENTS, allPayments.filter(p => p.customer_id !== id));

    // 4. Remove all related invoices (safety cleanup)
    const allInvoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const removedInvoiceIds = allInvoices.filter(inv => inv.customer_id === id).map(inv => inv.id);
    if (removedInvoiceIds.length > 0) {
      firebaseSyncService.recordDeletions(KEYS.INVOICES, removedInvoiceIds);
      firebaseSyncService.recordDeletions(KEYS.OPEN_INVOICES_VAULT, removedInvoiceIds);
      removedInvoiceIds.forEach(remId => explicitlyDeletingInvoiceIds.add(remId));
    }
    try {
      setLocal(KEYS.INVOICES, allInvoices.filter(inv => inv.customer_id !== id));
    } finally {
      removedInvoiceIds.forEach(remId => explicitlyDeletingInvoiceIds.delete(remId));
    }

    // Cleanup wallet, notes, visits
    const allWallet = getLocal<any[]>(KEYS.WALLET_TRANSACTIONS, []);
    const removedWalletIds = allWallet.filter(tx => tx.customer_id === id).map(tx => tx.id);
    if (removedWalletIds.length > 0) firebaseSyncService.recordDeletions(KEYS.WALLET_TRANSACTIONS, removedWalletIds);
    setLocal(KEYS.WALLET_TRANSACTIONS, allWallet.filter(tx => tx.customer_id !== id));

    const allNotes = getLocal<any[]>(KEYS.CUSTOMER_NOTES, []);
    const removedNoteIds = allNotes.filter(n => n.customer_id === id).map(n => n.id);
    if (removedNoteIds.length > 0) firebaseSyncService.recordDeletions(KEYS.CUSTOMER_NOTES, removedNoteIds);
    setLocal(KEYS.CUSTOMER_NOTES, allNotes.filter(n => n.customer_id !== id));

    const allVisits = getLocal<any[]>(KEYS.CUSTOMER_VISITS, []);
    const removedVisitIds = allVisits.filter(v => v.customer_id === id).map(v => v.id);
    if (removedVisitIds.length > 0) firebaseSyncService.recordDeletions(KEYS.CUSTOMER_VISITS, removedVisitIds);
    setLocal(KEYS.CUSTOMER_VISITS, allVisits.filter(v => v.customer_id !== id));

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
    firebaseSyncService.recordDeletion(KEYS.CUSTOMER_NOTES, id);
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
    firebaseSyncService.recordDeletion(KEYS.SUPPLIERS, id);
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
    firebaseSyncService.recordDeletion('cafe_supplier_purchases', id);
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
    firebaseSyncService.recordDeletion('cafe_supplier_payments', id);
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
    if (includeOpen) {
      reconcileOpenInvoicesWithVault();
    }
    const list = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const mapped = list.map(inv => {
      if (!inv.payment_status) {
        inv.payment_status = dbService.determinePaymentStatus(inv);
      }
      if (!inv.operational_status) {
        inv.operational_status = 'NEW';
      }
      return inv;
    });
    if (includeOpen) {
      return mapped;
    }
    return mapped.filter(inv => !isOpenOrDraftStatus(inv.invoice_status));
  },
  getOpenInvoices: (): Invoice[] => {
    reconcileOpenInvoicesWithVault();
    const list = getLocal<Invoice[]>(KEYS.INVOICES, []);
    return list
      .filter(inv => {
        if (!inv) return false;
        return isOpenOrDraftStatus(inv.invoice_status);
      })
      .map(inv => {
        const st = String(inv.invoice_status || '').toUpperCase().trim() as InvoiceStatus;
        if (!inv.payment_status) {
          inv.payment_status = dbService.determinePaymentStatus(inv);
        }
        if (!inv.operational_status) {
          inv.operational_status = 'NEW';
        }
        return {
          ...inv,
          invoice_status: st,
          invoice_number: inv.invoice_number || `INV-${new Date().getFullYear()}-${String(inv.id || '').slice(-5)}`,
          created_at: inv.created_at || inv.invoice_date || new Date().toISOString()
        };
      });
  },
  getInvoiceById: (id: string): { invoice: Invoice; items: InvoiceItem[] } | null => {
    reconcileOpenInvoicesWithVault();
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
    const updated = invoices.map(inv =>
      isOpenOrDraftStatus(inv.invoice_status) ? inv : { ...inv, is_archived: true }
    );
    setLocal(KEYS.INVOICES, updated);
    return true;
  },
  getInvoiceItems: (invoiceId?: string): InvoiceItem[] => {
    const items = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    if (invoiceId) {
      const matched = items.filter(it => it.invoice_id === invoiceId);
      if (matched.length > 0) return matched;
      const vaultItems = getLocal<InvoiceItem[]>(KEYS.OPEN_INVOICE_ITEMS_VAULT, []);
      return vaultItems.filter(it => it.invoice_id === invoiceId);
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
    receiptImageUrl?: string,
    creditSettlementAmount = 0
  ): { invoice: Invoice; items: InvoiceItem[] } => {
    const invoices = dbService.getInvoices(true);
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

    // 2. Generate Invoice Number (Format: INV-2026-XXXXX) safely across ALL invoices
    const invoiceNum = getNextInvoiceNumber(invoices, 1);

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

    const targetCustIdx = (customerId && customerId !== 'c_general')
      ? customersList.findIndex(c => c.id === customerId)
      : -1;
    const previousCreditBalance = targetCustIdx > -1 ? Math.max(0, customersList[targetCustIdx].current_balance || 0) : 0;
    const actualCreditPaid = (targetCustIdx > -1 && previousCreditBalance > 0 && creditSettlementAmount > 0)
      ? Math.min(creditSettlementAmount, previousCreditBalance)
      : 0;
    const remainingCreditAfter = Math.max(0, previousCreditBalance - actualCreditPaid + remainingAmount);
    const shouldAttachCreditSummary = targetCustIdx > -1 && (
      previousCreditBalance > 0 ||
      actualCreditPaid > 0 ||
      remainingAmount > 0 ||
      paymentType === 'CREDIT'
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
      receiptImageUrl: (receiptImageUrl && !receiptImageUrl.startsWith('data:')) ? receiptImageUrl : '',
      payment_number: paymentNumber,
      payment_date: new Date().toISOString().split('T')[0],
      payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      created_at: invoiceDate,
      updated_at: invoiceDate,
      ...(shouldAttachCreditSummary ? {
        previous_credit_balance: previousCreditBalance,
        credit_paid_with_invoice: actualCreditPaid,
        remaining_credit_after_invoice: remainingCreditAfter,
        grand_total_with_credit: total + previousCreditBalance,
      } : {}),
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

      const origPrice = cartItem.original_price ?? cartItem.product.selling_price;
      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const isPriceEdited = Boolean(
        cartItem.is_price_edited ||
        (cartItem.custom_price !== undefined && Math.abs(cartItem.custom_price - origPrice) > 0.001)
      );
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
        original_price: origPrice,
        is_price_edited: isPriceEdited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount,
      };

      newItems.push(invoiceItem);
      invoiceItemsList.push(invoiceItem);

      // Permanently Log Modification actions to ItemModification table
      if (isPriceEdited) {
        dbService.logItemModification({
          invoice_id: invoiceId,
          invoice_number: invoiceNum,
          type: 'PRICE_CHANGE',
          product_id: cartItem.product.id,
          product_name: cartItem.product.name_ar,
          original_price: origPrice,
          new_price: unitPrice,
          difference: unitPrice - origPrice,
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

    // 4. Settle previous credit balance if paid together with this invoice
    const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    let creditTxsModified = false;

    if (actualCreditPaid > 0 && targetCustIdx > -1 && customerId) {
      const creditPaymentsList = dbService.getCreditPayments();
      const newCreditPayment: CreditPayment = {
        id: `cp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        customer_id: customerId,
        amount: actualCreditPaid,
        payment_date: invoiceDate,
        notes: `تحصيل الحساب الآجل السابق مع الفاتورة رقم ${invoiceNum}`,
        created_at: invoiceDate,
        updated_at: invoiceDate,
      };
      creditPaymentsList.push(newCreditPayment);
      setLocal(KEYS.CREDIT_PAYMENTS, creditPaymentsList);

      recordCreditTransactionInternal(creditTxs, customersList, {
        customer_id: customerId,
        customer_name: customersList[targetCustIdx].full_name,
        invoice_id: invoiceId,
        transaction_type: 'PAYMENT',
        amount: actualCreditPaid,
        notes: `سداد الحساب الآجل السابق مع الفاتورة رقم ${invoiceNum}`,
        created_by: cashierName
      });
      creditTxsModified = true;

      // Apply payment to older unpaid credit invoices (oldest first)
      const oldUnpaidInvoices = invoices.filter(
        inv => inv.customer_id === customerId &&
          inv.id !== invoiceId &&
          inv.invoice_status !== 'CANCELLED' &&
          inv.invoice_status !== 'OPEN' &&
          inv.invoice_status !== 'DRAFT' &&
          (inv.remaining_amount || 0) > 0
      );
      oldUnpaidInvoices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));

      let remainingOldPayment = actualCreditPaid;
      for (const oldInv of oldUnpaidInvoices) {
        if (remainingOldPayment <= 0) break;
        const oldIdx = invoices.findIndex(i => i.id === oldInv.id);
        if (oldIdx !== -1) {
          const canPay = Math.min(invoices[oldIdx].remaining_amount, remainingOldPayment);
          invoices[oldIdx].paid_amount += canPay;
          invoices[oldIdx].remaining_amount -= canPay;
          invoices[oldIdx].payment_status = dbService.determinePaymentStatus(invoices[oldIdx]);
          invoices[oldIdx].updated_at = invoiceDate;
          remainingOldPayment -= canPay;
        }
      }

      customersList[targetCustIdx].current_balance = Math.max(0, previousCreditBalance - actualCreditPaid);
      customersList[targetCustIdx].updated_at = invoiceDate;

      dbService.logAuditAction(
        'CREDIT_PAYMENT_WITH_INVOICE',
        `تم تحصيل ${actualCreditPaid} ج.م من الحساب الآجل السابق للعميل ${customersList[targetCustIdx].full_name} مع الفاتورة رقم ${invoiceNum} (المتبقي بعد السداد: ${remainingCreditAfter} ج.م)`,
        cashierName
      );
    }

    // 4.1 If New Invoice has Credit remaining, Update Customer Balance & credit transaction log
    if ((paymentType === 'CREDIT' || paymentType === 'SPLIT') && targetCustIdx > -1 && customerId && remainingAmount > 0) {
      recordCreditTransactionInternal(creditTxs, customersList, {
        customer_id: customerId,
        customer_name: customersList[targetCustIdx].full_name,
        invoice_id: invoiceId,
        transaction_type: 'INVOICE',
        amount: remainingAmount,
        notes: invoiceNotes ? `مبيعات بالآجل فاتورة رقم ${invoiceNum}: ${invoiceNotes}` : `مبيعات بالآجل فاتورة رقم ${invoiceNum}`,
        created_by: cashierName
      });
      customersList[targetCustIdx].current_balance = remainingCreditAfter;
      customersList[targetCustIdx].updated_at = invoiceDate;
      creditTxsModified = true;
    }

    if (creditTxsModified) {
      setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
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

    // 5. Update Cash Drawer Immediately (Net of Wallet Deduction + Any Previous Credit Paid)
    const netCashPaid = Math.max(0, actualPaid - walletDeduction) + actualCreditPaid;
    if (netCashPaid > 0) {
      dbService.logCashMovement(
        netCashPaid,
        0,
        actualCreditPaid > 0
          ? `مبيعات نقداً فاتورة رقم ${invoiceNum} + سداد آجل سابق (${actualCreditPaid} ج.م)`
          : `مبيعات نقداً فاتورة رقم ${invoiceNum}`
      );
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

      const prevTimeline = Array.isArray(existingInv.timeline) ? [...existingInv.timeline] : [];
      prevTimeline.push({
        status: status === 'DRAFT' ? 'DRAFT_UPDATED' : 'OPEN_UPDATED',
        timestamp: dateStr,
        operator: cashierName,
        notes: status === 'DRAFT' ? 'تم تحديث الفاتورة المعلقة / المسودة' : 'تم تحديث الفاتورة المفتوحة'
      });

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
        operational_status: existingInv.operational_status || 'NEW',
        cashier_name: cashierName || existingInv.cashier_name,
        notes: invoiceNotes,
        table_number: tableNumber,
        payment_method: sanitizedMethod || 'CASH',
        reference_number: effRefNo,
        sender_phone: effSenderPhone,
        senderPhone: effSenderPhone,
        receipt_image_url: effReceiptUrl,
        receiptImageUrl: (effReceiptUrl && !effReceiptUrl.startsWith('data:')) ? effReceiptUrl : '',
        timeline: prevTimeline,
        created_at: existingInv.created_at || existingInv.invoice_date || dateStr,
        updated_at: dateStr
      };
      invoices[existingInvIdx] = invoice;
    } else {
      const year = new Date().getFullYear();
      let maxSeq = invoices.length;
      const seqRegex = new RegExp(`INV-${year}-(\\d+)`);
      invoices.forEach(inv => {
        const m = String(inv?.invoice_number || '').match(seqRegex);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > maxSeq) maxSeq = n;
        }
      });
      const seq = String(maxSeq + 1).padStart(5, '0');
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
        operational_status: 'NEW',
        cashier_name: cashierName,
        invoice_date: dateStr,
        notes: invoiceNotes,
        table_number: tableNumber,
        payment_method: sanitizedMethod || 'CASH',
        reference_number: referenceNumber || '',
        sender_phone: senderPhone || '',
        senderPhone: senderPhone || '',
        receipt_image_url: receiptImageUrl || '',
        receiptImageUrl: (receiptImageUrl && !receiptImageUrl.startsWith('data:')) ? receiptImageUrl : '',
        payment_date: dateStr.split('T')[0],
        payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timeline: [{
          status: status === 'DRAFT' ? 'DRAFT' : 'OPEN',
          timestamp: dateStr,
          operator: cashierName,
          notes: status === 'DRAFT' ? 'تم تعليق الفاتورة وحفظها كمسودة' : 'تم فتح الفاتورة وحفظها في الطلبات المفتوحة'
        }],
        created_at: dateStr,
        updated_at: dateStr
      };
      invoices.push(invoice);
    }

    // Save items
    const filteredItems = invoiceItemsList.filter(item => item.invoice_id !== invoiceId);
    const newItems: InvoiceItem[] = cartItems.map((cartItem, idx) => {
      const origPrice = cartItem.original_price ?? cartItem.product.selling_price;
      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const isPriceEdited = Boolean(
        cartItem.is_price_edited ||
        (cartItem.custom_price !== undefined && Math.abs(cartItem.custom_price - origPrice) > 0.001)
      );
      const itemTotalPrice = (unitPrice * cartItem.quantity) - (cartItem.item_discount_amount || 0);
      return {
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        invoice_id: invoiceId,
        product_id: cartItem.product.id,
        quantity: cartItem.quantity,
        unit_price: unitPrice,
        cost_price: cartItem.product.cost_price,
        total_price: itemTotalPrice,
        product_name_ar: cartItem.product.name_ar,
        notes: cartItem.notes || '',
        created_at: dateStr,
        updated_at: dateStr,
        original_price: origPrice,
        is_price_edited: isPriceEdited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount
      };
    });

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, [...filteredItems, ...newItems]);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated', { detail: { invoice } }));
      window.dispatchEvent(new CustomEvent('open_invoice_created', { detail: { invoice } }));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

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
    receiptImageUrl?: string,
    creditSettlementAmount = 0
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

    const targetCustIdx = (customerId && customerId !== 'c_general')
      ? customersList.findIndex(c => c.id === customerId)
      : -1;
    const previousCreditBalance = targetCustIdx > -1 ? Math.max(0, customersList[targetCustIdx].current_balance || 0) : 0;
    const actualCreditPaid = (targetCustIdx > -1 && previousCreditBalance > 0 && creditSettlementAmount > 0)
      ? Math.min(creditSettlementAmount, previousCreditBalance)
      : 0;
    const remainingCreditAfter = Math.max(0, previousCreditBalance - actualCreditPaid + remainingAmount);
    const shouldAttachCreditSummary = targetCustIdx > -1 && (
      previousCreditBalance > 0 ||
      actualCreditPaid > 0 ||
      remainingAmount > 0 ||
      paymentType === 'CREDIT'
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
      receiptImageUrl: (effReceiptUrl && !effReceiptUrl.startsWith('data:')) ? effReceiptUrl : '',
      payment_number: effPayNum,
      payment_date: dateStr.split('T')[0],
      payment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      updated_at: dateStr,
      ...(shouldAttachCreditSummary ? {
        previous_credit_balance: previousCreditBalance,
        credit_paid_with_invoice: actualCreditPaid,
        remaining_credit_after_invoice: remainingCreditAfter,
        grand_total_with_credit: total + previousCreditBalance,
      } : {}),
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

      const origPrice = cartItem.original_price ?? cartItem.product.selling_price;
      const unitPrice = cartItem.custom_price !== undefined ? cartItem.custom_price : cartItem.product.selling_price;
      const isPriceEdited = Boolean(
        cartItem.is_price_edited ||
        (cartItem.custom_price !== undefined && Math.abs(cartItem.custom_price - origPrice) > 0.001)
      );
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
        original_price: origPrice,
        is_price_edited: isPriceEdited,
        price_edit_reason: cartItem.price_edit_reason,
        item_discount_type: cartItem.item_discount_type,
        item_discount_value: cartItem.item_discount_value,
        item_discount_amount: cartItem.item_discount_amount,
      };

      newItems.push(invoiceItem);
      filteredItems.push(invoiceItem);

      if (isPriceEdited) {
        dbService.logItemModification({
          invoice_id: id,
          invoice_number: existingInvoice.invoice_number,
          type: 'PRICE_CHANGE',
          product_id: cartItem.product.id,
          product_name: cartItem.product.name_ar,
          original_price: origPrice,
          new_price: unitPrice,
          difference: unitPrice - origPrice,
          reason: cartItem.price_edit_reason || 'تعديل سعر يدوي',
          quantity: cartItem.quantity,
          cashier: cashierName
        });
      }
    });

    // Settle previous credit balance if paid together with closing this open invoice
    const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    let creditTxsModified = false;

    if (actualCreditPaid > 0 && targetCustIdx > -1 && customerId) {
      const creditPaymentsList = dbService.getCreditPayments();
      const newCreditPayment: CreditPayment = {
        id: `cp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        customer_id: customerId,
        amount: actualCreditPaid,
        payment_date: dateStr,
        notes: `تحصيل الحساب الآجل السابق مع إغلاق الفاتورة رقم ${existingInvoice.invoice_number}`,
        created_at: dateStr,
        updated_at: dateStr,
      };
      creditPaymentsList.push(newCreditPayment);
      setLocal(KEYS.CREDIT_PAYMENTS, creditPaymentsList);

      recordCreditTransactionInternal(creditTxs, customersList, {
        customer_id: customerId,
        customer_name: customersList[targetCustIdx].full_name,
        invoice_id: id,
        transaction_type: 'PAYMENT',
        amount: actualCreditPaid,
        notes: `سداد الحساب الآجل السابق مع الفاتورة رقم ${existingInvoice.invoice_number}`,
        created_by: cashierName
      });
      creditTxsModified = true;

      // Apply payment to older unpaid credit invoices (oldest first)
      const oldUnpaidInvoices = invoices.filter(
        inv => inv.customer_id === customerId &&
          inv.id !== id &&
          inv.invoice_status !== 'CANCELLED' &&
          inv.invoice_status !== 'OPEN' &&
          inv.invoice_status !== 'DRAFT' &&
          (inv.remaining_amount || 0) > 0
      );
      oldUnpaidInvoices.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));

      let remainingOldPayment = actualCreditPaid;
      for (const oldInv of oldUnpaidInvoices) {
        if (remainingOldPayment <= 0) break;
        const oldIdx = invoices.findIndex(i => i.id === oldInv.id);
        if (oldIdx !== -1) {
          const canPay = Math.min(invoices[oldIdx].remaining_amount, remainingOldPayment);
          invoices[oldIdx].paid_amount += canPay;
          invoices[oldIdx].remaining_amount -= canPay;
          invoices[oldIdx].payment_status = dbService.determinePaymentStatus(invoices[oldIdx]);
          invoices[oldIdx].updated_at = dateStr;
          remainingOldPayment -= canPay;
        }
      }

      customersList[targetCustIdx].current_balance = Math.max(0, previousCreditBalance - actualCreditPaid);
      customersList[targetCustIdx].updated_at = dateStr;

      dbService.logAuditAction(
        'CREDIT_PAYMENT_WITH_INVOICE',
        `تم تحصيل ${actualCreditPaid} ج.م من الحساب الآجل السابق للعميل ${customersList[targetCustIdx].full_name} مع الفاتورة رقم ${existingInvoice.invoice_number} (المتبقي بعد السداد: ${remainingCreditAfter} ج.م)`,
        cashierName
      );
    }

    if ((paymentType === 'CREDIT' || paymentType === 'SPLIT') && targetCustIdx > -1 && customerId && remainingAmount > 0) {
      recordCreditTransactionInternal(creditTxs, customersList, {
        customer_id: customerId,
        customer_name: customersList[targetCustIdx].full_name,
        invoice_id: id,
        transaction_type: 'INVOICE',
        amount: remainingAmount,
        notes: invoiceNotes ? `إغلاق فاتورة مبيعات بالآجل رقم ${existingInvoice.invoice_number}: ${invoiceNotes}` : `إغلاق فاتورة مبيعات بالآجل رقم ${existingInvoice.invoice_number}`,
        created_by: cashierName
      });
      customersList[targetCustIdx].current_balance = remainingCreditAfter;
      customersList[targetCustIdx].updated_at = dateStr;
      creditTxsModified = true;
    }

    if (creditTxsModified) {
      setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
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

    // Update Cash Drawer Immediately (Net of Wallet Deduction + Any Previous Credit Paid)
    const netCashPaid = Math.max(0, actualPaid - walletDeduction) + actualCreditPaid;
    if (netCashPaid > 0) {
      dbService.logCashMovement(
        netCashPaid,
        0,
        actualCreditPaid > 0
          ? `مبيعات نقداً فاتورة رقم ${existingInvoice.invoice_number} + سداد آجل سابق (${actualCreditPaid} ج.م)`
          : `مبيعات نقداً فاتورة رقم ${existingInvoice.invoice_number}`
      );
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

    // Record timeline & audit events for payment/credit closure
    const isCredit = paymentType === 'CREDIT' || sanitizedMethod === 'CREDIT';
    const closeStatus = isCredit ? 'CREDIT' : 'PAID';
    
    if (!updatedInvoice.timeline) updatedInvoice.timeline = [];
    updatedInvoice.timeline.push({
      status: closeStatus,
      timestamp: dateStr,
      operator: cashierName,
      notes: isCredit
        ? `تم إغلاق الفاتورة وتحويل الحساب إلى العميل الآجل`
        : `تم سداد الفاتورة بالكامل وإغلاقها بأسلوب (${sanitizedMethod || 'نقدي'})`
    });

    dbService.logAuditAction(
      isCredit ? 'INVOICE_CREDIT_CONVERTED' : 'INVOICE_PAID',
      `تم إغلاق الفاتورة رقم #${updatedInvoice.invoice_number} ${isCredit ? 'وتحويلها لحساب عميل آجل' : 'وسداد قيمتها بنجاح'} (${total} ج.م)`,
      cashierName
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent(isCredit ? 'invoice_credit_notification' : 'invoice_paid_notification', {
        detail: {
          invoice: updatedInvoice,
          message: `تم إغلاق الفاتورة رقم #${updatedInvoice.invoice_number} ${isCredit ? 'وتحويلها لحساب آجل 📜' : 'وسداد قيمتها بنجاح 💰'}`
        }
      }));
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
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
    const invoices = dbService.getInvoices(true);
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

  updateOpenInvoiceItemPrice: (
    invoiceId: string,
    itemId: string,
    newUnitPrice: number,
    operator: string,
    reason?: string
  ): { invoice: Invoice; items: InvoiceItem[] } => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const allItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    const products = dbService.getProducts();
    const dateStr = new Date().toISOString();

    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) {
      throw new Error('الفاتورة غير موجودة!');
    }
    const existingInv = invoices[invIdx];
    if (!isOpenOrDraftStatus(existingInv.invoice_status)) {
      throw new Error('لا يمكن تعديل السعر بهذه الأداة إلا للفواتير المفتوحة أو المعلقة!');
    }

    const itemIdx = allItems.findIndex(it => it.id === itemId && it.invoice_id === invoiceId);
    if (itemIdx === -1) {
      throw new Error('الصنف غير موجود داخل الفاتورة المحددة!');
    }

    const targetItem = allItems[itemIdx];
    const catalogProduct = products.find(p => p.id === targetItem.product_id);
    const origPrice =
      targetItem.original_price !== undefined && targetItem.original_price !== null
        ? targetItem.original_price
        : catalogProduct?.selling_price ?? targetItem.unit_price;
    const isPriceEdited = Math.abs(newUnitPrice - origPrice) > 0.001 || true;
    const newTotalPrice = (newUnitPrice * targetItem.quantity) - (targetItem.item_discount_amount || 0);

    allItems[itemIdx] = {
      ...targetItem,
      unit_price: newUnitPrice,
      total_price: newTotalPrice,
      original_price: origPrice,
      is_price_edited: isPriceEdited,
      price_edit_reason: reason || targetItem.price_edit_reason || 'تعديل سعر من الفواتير المفتوحة بمسؤولية المدير',
      updated_at: dateStr
    };

    const invItems = allItems.filter(it => it.invoice_id === invoiceId);
    const newSubtotal = invItems.reduce((sum, it) => sum + (it.total_price + (it.item_discount_amount || 0)), 0);
    const totalItemDiscount = invItems.reduce((sum, it) => sum + (it.item_discount_amount || 0), 0);
    const oldNet = Math.max(1, (existingInv.subtotal || 0) - (existingInv.discount || 0));
    const effectiveTaxPct = existingInv.tax > 0 && existingInv.subtotal > 0 ? Math.round((existingInv.tax / oldNet) * 100) : 0;
    const invoiceLevelDiscount = Math.max(0, (existingInv.discount || 0) - totalItemDiscount);
    const newDiscount = invoiceLevelDiscount + totalItemDiscount;
    const newTax = Math.round(Math.max(0, newSubtotal - newDiscount) * (effectiveTaxPct / 100));
    const newTotal = Math.max(0, newSubtotal - newDiscount + newTax);

    const prevTimeline = Array.isArray(existingInv.timeline) ? [...existingInv.timeline] : [];
    prevTimeline.push({
      status: 'PRICE_EDITED',
      timestamp: dateStr,
      operator,
      notes: `تعديل سعر "${targetItem.product_name_ar}" من ${targetItem.unit_price} إلى ${newUnitPrice} (السعر الأصلي: ${origPrice})`
    });

    invoices[invIdx] = {
      ...existingInv,
      subtotal: newSubtotal,
      discount: newDiscount,
      tax: newTax,
      total: newTotal,
      remaining_amount: Math.max(0, newTotal - (existingInv.paid_amount || 0)),
      updated_at: dateStr,
      timeline: prevTimeline
    };

    setLocal(KEYS.INVOICES, invoices);
    setLocal(KEYS.INVOICE_ITEMS, allItems);

    dbService.logItemModification({
      invoice_id: invoiceId,
      invoice_number: existingInv.invoice_number,
      type: 'PRICE_CHANGE',
      product_id: targetItem.product_id,
      product_name: targetItem.product_name_ar,
      original_price: origPrice,
      new_price: newUnitPrice,
      difference: newUnitPrice - origPrice,
      reason: reason || 'تعديل سعر من شاشة الفواتير المفتوحة',
      quantity: targetItem.quantity,
      cashier: operator
    });

    dbService.logAuditAction(
      'EDIT_OPEN_INVOICE_ITEM_PRICE',
      `تعديل سعر الصنف (${targetItem.product_name_ar}) في الفاتورة المفتوحة ${existingInv.invoice_number} من ${targetItem.unit_price} إلى ${newUnitPrice}`,
      operator
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated', { detail: { invoice: invoices[invIdx] } }));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return { invoice: invoices[invIdx], items: invItems };
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
          if (mergedItemsMap[item.product_id].quantity > 0) {
            mergedItemsMap[item.product_id].unit_price = Number(
              (mergedItemsMap[item.product_id].total_price / mergedItemsMap[item.product_id].quantity).toFixed(2)
            );
          }
          if (item.is_price_edited) {
            mergedItemsMap[item.product_id].is_price_edited = true;
          }
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
    
    const newInvoiceNum = getNextInvoiceNumber(invoices, 1);
    
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
      const newNum = getNextInvoiceNumber(invoices, p);
      
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
    firebaseSyncService.recordDeletion(KEYS.EXPENSES, id);
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
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('تعديل مديونية العميل متاح للأدمن فقط!');
    }
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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('customer_credit_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return newTx;
  },

  // Admin-Only Customer Debt Correction (تعديل مديونية العميل في حالة وجود خطأ في مبلغ الآجل - للأدمن فقط)
  adjustCustomerDebtAdmin: async (params: {
    customerId: string;
    mode: 'SET' | 'DECREASE' | 'INCREASE';
    amount: number;
    reason: string;
    notes?: string;
    adminCredential: string;
    operatorName?: string;
  }): Promise<{ customer: Customer; transaction: CustomerCreditTransaction; adjustment: CreditAdjustment }> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('تعديل مديونية العميل متاح للأدمن فقط!');
    }

    const isValid = await dbService.verifyAdminActionCredential(params.adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const customersList = dbService.getCustomers();
    const custIdx = customersList.findIndex(c => c.id === params.customerId);
    if (custIdx === -1) {
      throw new Error('العميل غير موجود!');
    }

    const cleanAmt = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (params.mode === 'SET') {
      if (isNaN(cleanAmt) || cleanAmt < 0) {
        throw new Error('يرجى إدخال قيمة مديونية صحيحة (0 أو أكثر)');
      }
    } else if (isNaN(cleanAmt) || cleanAmt <= 0) {
      throw new Error('يرجى إدخال مبلغ تعديل صحيح أكبر من صفر');
    }

    const customer = customersList[custIdx];
    const prevBalance = Math.max(0, Math.round((Number(customer.current_balance) || 0) * 100) / 100);
    let newBalance = prevBalance;

    if (params.mode === 'SET') {
      newBalance = cleanAmt;
    } else if (params.mode === 'DECREASE') {
      newBalance = Math.max(0, Math.round((prevBalance - cleanAmt) * 100) / 100);
    } else if (params.mode === 'INCREASE') {
      newBalance = Math.round((prevBalance + cleanAmt) * 100) / 100;
    }

    const difference = Math.round((newBalance - prevBalance) * 100) / 100;
    if (difference === 0) {
      throw new Error('المبلغ الجديد مطابق لمديونية العميل الحالية بالفعل!');
    }

    const op = params.operatorName || cu?.name || 'أدمن النظام';
    const cleanReason = params.reason?.trim() || 'تصحيح خطأ في مبلغ الآجل';
    const fullNote = params.notes?.trim()
      ? `[تعديل أدمن] ${cleanReason} - ${params.notes.trim()}`
      : `[تعديل أدمن] ${cleanReason} (من ${prevBalance} إلى ${newBalance} ج.م)`;

    const creditTxs = getLocal<CustomerCreditTransaction[]>(KEYS.CREDIT_TRANSACTIONS, []);
    const newTx = recordCreditTransactionInternal(creditTxs, customersList, {
      customer_id: params.customerId,
      customer_name: customer.full_name,
      transaction_type: 'CORRECTION',
      amount: difference,
      notes: fullNote,
      created_by: op
    });

    // Ensure authoritative balance matches exact calculation
    customersList[custIdx].current_balance = newBalance;
    customersList[custIdx].updated_at = new Date().toISOString();

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const adjustments = getLocal<CreditAdjustment[]>(KEYS.CREDIT_ADJUSTMENTS, []);
    const newAdj: CreditAdjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: dateStr,
      time: timeStr,
      user: op,
      customer_id: params.customerId,
      customer_name: customer.full_name,
      previous_balance: prevBalance,
      new_balance: newBalance,
      difference,
      reason: cleanReason,
      notes: fullNote,
      created_at: now.toISOString()
    };
    adjustments.push(newAdj);

    setLocal(KEYS.CREDIT_TRANSACTIONS, creditTxs);
    setLocal(KEYS.CREDIT_ADJUSTMENTS, adjustments);
    setLocal(KEYS.CUSTOMERS, customersList);

    dbService.logAuditAction(
      'ADMIN_DEBT_ADJUSTMENT',
      `قام الأدمن (${op}) بتعديل مديونية العميل "${customer.full_name}" من ${prevBalance} ج.م إلى ${newBalance} ج.م (الفارق: ${difference > 0 ? `+${difference}` : difference} ج.م). السبب: ${cleanReason}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('customer_credit_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      customer: customersList[custIdx],
      transaction: newTx,
      adjustment: newAdj
    };
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
    const invoices = dbService.getInvoices(true);
    const custInvoices = invoices.filter(
      inv => inv.customer_id === customerId &&
      inv.invoice_status !== 'CANCELLED' &&
      !isOpenOrDraftStatus(inv.invoice_status) &&
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

  // --- Admin Verification Helper for Drawer Reset & Safes ---
  verifyAdminActionCredential: async (credential: string): Promise<boolean> => {
    const trimmed = String(credential || '').trim();
    if (!trimmed) return false;
    if (isAdminSecurityPasswordSet()) {
      return await verifyAdminSecurityPassword(trimmed);
    }
    const settings = dbService.getSettings();
    return trimmed === String(settings.pin_code || '1234').trim();
  },

  // --- Admin-Only Reset Cash Drawer (تصفير حساب الدرج للأدمن فقط) ---
  resetCashDrawerAdmin: async (
    adminCredential: string,
    reason: string,
    operatorName?: string
  ): Promise<{ previousDrawerBalance: number; previousShiftBalance: number; newBalance: number }> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('عذراً! صلاحية تصفير حساب الدرج متاحة للأدمن فقط.');
    }

    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const operator = operatorName || cu?.name || 'أدمن النظام';
    const nowIso = new Date().toISOString();
    const resetCutoffIso = new Date(Date.now() + 2).toISOString();
    const todayStr = nowIso.split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 1. Reset active CashDrawer cleanly (close erroneous drawer, open fresh 0-balance drawer)
    const drawers = dbService.getCashDrawers();
    const activeDrawerIdx = drawers.findIndex(d => d.closing_balance === null);
    let previousDrawerBalance = 0;

    if (activeDrawerIdx > -1) {
      const activeD = drawers[activeDrawerIdx];
      previousDrawerBalance = Math.round((activeD.opening_balance + activeD.cash_in - activeD.cash_out) * 100) / 100;
      drawers[activeDrawerIdx] = {
        ...activeD,
        closing_balance: previousDrawerBalance,
        updated_at: nowIso
      };
    }

    const freshDrawer: CashDrawer = {
      id: `cd_${Date.now()}`,
      opening_balance: 0,
      cash_in: 0,
      cash_out: 0,
      closing_balance: null,
      business_date: todayStr,
      created_at: resetCutoffIso,
      updated_at: resetCutoffIso
    };
    drawers.push(freshDrawer);
    setLocal(KEYS.CASH_DRAWERS, drawers);

    // 2. Log DRAWER_RESET movement in Cash History
    const cleanReason = reason?.trim() || 'تصحيح خطأ حسابي بالدرج';
    dbService.saveCashMovement({
      previous_balance: previousDrawerBalance,
      transaction_type: 'DRAWER_RESET',
      amount: Math.abs(previousDrawerBalance),
      new_balance: 0,
      date: todayStr,
      time: timeStr,
      user: operator,
      notes: `تصفير حساب الدرج (خاص بالأدمن): ${cleanReason}`
    });

    // 3. Synchronize any active Shift so Dashboard, POS & ShiftHandoverModal all show 0
    const shifts = dbService.getShifts();
    const activeShiftIdx = shifts.findIndex(s => s.status === 'OPEN' || s.status === 'PENDING_HANDOVER');
    let previousShiftBalance = previousDrawerBalance;

    if (activeShiftIdx > -1) {
      const currentShiftMetrics = dbService.calculateShiftMetrics(shifts[activeShiftIdx]);
      previousShiftBalance = currentShiftMetrics.expected_cash;
      shifts[activeShiftIdx] = {
        ...shifts[activeShiftIdx],
        status: 'OPEN',
        opening_balance: 0,
        cash_in: 0,
        cash_out: 0,
        expected_cash: 0,
        declared_cash: undefined,
        actual_received_cash: undefined,
        discrepancy: undefined,
        discrepancy_reason: undefined,
        ended_at: undefined,
        last_reset_at: resetCutoffIso,
        updated_at: nowIso
      };
      setLocal(KEYS.SHIFTS, shifts);
    }

    dbService.logAuditAction(
      'RESET_CASH_DRAWER',
      `قام الأدمن (${operator}) بتصفير حساب الدرج إلى 0 ج.م (رصيد الدرج السابق: ${previousDrawerBalance} ج.م | رصيد الوردية السابق: ${previousShiftBalance} ج.م). السبب: ${cleanReason}`,
      operator
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      previousDrawerBalance,
      previousShiftBalance,
      newBalance: 0
    };
  },

  // --- Treasury System (الخزنة الخاصة + قسم الإيجار + قسم الجمعية + العجز) ---
  getSafeArabicLabel: (safeType: SafeType): string => {
    switch (safeType) {
      case 'PRIVATE_SAFE':
        return 'الخزنة الخاصة';
      case 'RENT_BOX':
        return 'قسم الإيجار';
      case 'GAMIA_BOX':
        return 'قسم الجمعية';
      case 'MAIN_SAFE':
        return 'الخزنة الرئيسية';
      default:
        return 'الخزنة';
    }
  },

  getShortageAccountArabicLabel: (acc: ShortageTargetAccount): string => {
    switch (acc) {
      case 'PRIVATE_SAFE':
        return 'الخزنة الخاصة';
      case 'RENT_BOX':
        return 'قسم الإيجار';
      case 'GAMIA_BOX':
        return 'قسم الجمعية';
      case 'MAIN_SAFE':
        return 'الخزنة الرئيسية';
      case 'DRAWER':
      default:
        return 'درج النقدية';
    }
  },

  getSafeTransactions: (safeType?: SafeType): SafeTransaction[] => {
    const list = getLocal<SafeTransaction[]>(KEYS.SAFE_TRANSACTIONS, []);
    if (safeType) {
      return list.filter(t => t.safe_type === safeType);
    }
    return list;
  },

  getSafeBalance: (safeType: SafeType): number => {
    const list = dbService.getSafeTransactions(safeType);
    const total = list.reduce((acc, tx) => {
      const amt = Number(tx.amount) || 0;
      switch (tx.transaction_type) {
        case 'DAILY_DEPOSIT':
        case 'DEPOSIT':
        case 'TRANSFER_FROM_DRAWER':
        case 'SHORTAGE_SETTLEMENT':
          return acc + amt;
        case 'WITHDRAWAL':
        case 'TRANSFER_TO_DRAWER':
        case 'TRANSFER_TO_PRIVATE':
          return acc - amt;
        case 'AUTO_DAILY_TRANSFER':
          // Outgoing from MAIN_SAFE, incoming into PRIVATE_SAFE
          return tx.safe_type === 'PRIVATE_SAFE' ? acc + amt : acc - amt;
        case 'BALANCE_ADJUSTMENT':
        case 'SAFE_RESET': {
          const delta =
            typeof tx.adjustment_delta === 'number'
              ? tx.adjustment_delta
              : (Number(tx.new_balance) || 0) - (Number(tx.previous_balance) || 0);
          return acc + delta;
        }
        default:
          return acc;
      }
    }, 0);
    return Math.round(total * 100) / 100;
  },

  addMainSafeDeposit: (
    amount: number,
    operator?: string,
    notes?: string,
    isDaily = true
  ): SafeTransaction => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('إضافة مبالغ للخزنة الرئيسية متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const prev = dbService.getSafeBalance('MAIN_SAFE');
    const next = Math.round((prev + cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: 'MAIN_SAFE',
      transaction_type: isDaily ? 'DAILY_DEPOSIT' : 'DEPOSIT',
      amount: cleanAmount,
      previous_balance: prev,
      new_balance: next,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: notes?.trim() || (isDaily ? 'إضافة المبلغ اليومي للخزنة الرئيسية' : 'إيداع في الخزنة الرئيسية'),
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      'MAIN_SAFE_DEPOSIT',
      `إضافة ${cleanAmount} ج.م إلى الخزنة الرئيسية بواسطة ${op} (الرصيد الجديد: ${next} ج.م). ${tx.notes}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return tx;
  },

  addBoxDailyDeposit: (
    safeType: 'RENT_BOX' | 'GAMIA_BOX',
    amount: number,
    operator?: string,
    notes?: string,
    deductFromDrawer = false
  ): SafeTransaction => {
    const cu = dbService.getCurrentUser();
    const boxLabel = dbService.getSafeArabicLabel(safeType);
    if (cu && cu.role !== 'Admin') {
      throw new Error(`إضافة المبلغ اليومي في ${boxLabel} متاح للأدمن فقط!`);
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const defaultNote =
      safeType === 'RENT_BOX'
        ? 'إضافة المبلغ اليومي لقسم الإيجار'
        : 'إضافة المبلغ اليومي لقسم الجمعية';
    const finalNote = notes?.trim() || defaultNote;

    if (deductFromDrawer) {
      const activeDrawer = dbService.getActiveDrawer();
      const drawerAvail = Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100;
      if (cleanAmount > drawerAvail) {
        throw new Error(`رصيد الدرج الحالي (${drawerAvail} ج.م) لا يكفي لخصم مبلغ ${boxLabel}!`);
      }
      dbService.logCashMovement(
        0,
        cleanAmount,
        `استقطاع يومي لـ${boxLabel}: ${finalNote}`,
        'CASH_ADJUSTMENT_SUB',
        op,
        `استقطاع يومي لـ${boxLabel}: ${finalNote}`
      );
    }

    const prev = dbService.getSafeBalance(safeType);
    const next = Math.round((prev + cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: safeType,
      transaction_type: 'DAILY_DEPOSIT',
      amount: cleanAmount,
      previous_balance: prev,
      new_balance: next,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: deductFromDrawer ? `${finalNote} (مخصوم من الدرج)` : finalNote,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      safeType === 'RENT_BOX' ? 'RENT_DAILY_DEPOSIT' : 'GAMIA_DAILY_DEPOSIT',
      `إضافة مبلغ يومي ${cleanAmount} ج.م في ${boxLabel} بواسطة ${op} (الرصيد الجديد: ${next} ج.م). ${tx.notes}`,
      op
    );

    if (typeof window !== 'undefined') {
      if (deductFromDrawer) {
        window.dispatchEvent(new CustomEvent('shift_updated'));
      }
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return tx;
  },

  withdrawFromSafe: (
    safeType: SafeType,
    amount: number,
    operator?: string,
    notes?: string
  ): SafeTransaction => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('السحب من الخزنة متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const safeLabel = dbService.getSafeArabicLabel(safeType);
    const prev = dbService.getSafeBalance(safeType);
    if (cleanAmount > prev) {
      throw new Error(`رصيد ${safeLabel} الحالي (${prev} ج.م) لا يكفي لسحب هذا المبلغ!`);
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const next = Math.round((prev - cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: safeType,
      transaction_type: 'WITHDRAWAL',
      amount: cleanAmount,
      previous_balance: prev,
      new_balance: next,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: notes?.trim() || `سحب / صرف نقدية من ${safeLabel}`,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      'SAFE_WITHDRAWAL',
      `سحب مبلغ ${cleanAmount} ج.م من ${safeLabel} بواسطة ${op} (المتبقي: ${next} ج.م). السبب: ${tx.notes}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return tx;
  },

  transferMainSafeToDrawer: (
    amount: number,
    operator?: string,
    notes?: string
  ): SafeTransaction => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('التحويل من الخزنة الرئيسية للدرج متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const prev = dbService.getSafeBalance('MAIN_SAFE');
    if (cleanAmount > prev) {
      throw new Error(`رصيد الخزنة الرئيسية (${prev} ج.م) غير كافٍ لتحويل هذا المبلغ للدرج!`);
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const next = Math.round((prev - cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const noteText = notes?.trim() || 'تغذية درج النقدية من الخزنة الرئيسية';

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: 'MAIN_SAFE',
      transaction_type: 'TRANSFER_TO_DRAWER',
      amount: cleanAmount,
      previous_balance: prev,
      new_balance: next,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: noteText,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    // Add cash directly into active Drawer (and Shift metrics automatically)
    dbService.logCashMovement(cleanAmount, 0, noteText, 'CASH_ADJUSTMENT_ADD', op, noteText);

    dbService.logAuditAction(
      'TRANSFER_MAIN_SAFE_TO_DRAWER',
      `تغذية الدرج بمبلغ ${cleanAmount} ج.م من الخزنة الرئيسية بواسطة ${op} (المتبقي بالخزنة الرئيسية: ${next} ج.م)`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return tx;
  },

  transferPrivateSafeToDrawer: (
    amount: number,
    operator?: string,
    notes?: string
  ): {
    tx: SafeTransaction;
    previousSafeBalance: number;
    newSafeBalance: number;
    previousDrawerBalance: number;
    newDrawerBalance: number;
  } => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('السحب من الخزنة الخاصة إلى درج النقدية متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const prevSafe = dbService.getSafeBalance('PRIVATE_SAFE');
    if (cleanAmount > prevSafe) {
      throw new Error(`رصيد الخزنة الخاصة الحالي (${prevSafe.toLocaleString('ar-EG')} ج.م) غير كافٍ لتحويل هذا المبلغ إلى الدرج!`);
    }

    const activeDrawer = dbService.getActiveDrawer();
    const prevDrawer = Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100;

    const op = operator || cu?.name || 'أدمن النظام';
    const nextSafe = Math.round((prevSafe - cleanAmount) * 100) / 100;
    const nextDrawer = Math.round((prevDrawer + cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cleanNotes = notes?.trim();
    const safeNote = cleanNotes
      ? `سحب وتحويل إلى درج النقدية - ${cleanNotes}`
      : 'سحب من الخزنة الخاصة لتغذية درج النقدية';
    const drawerNote = cleanNotes
      ? `تغذية الدرج من الخزنة الخاصة - ${cleanNotes}`
      : 'تغذية درج النقدية من الخزنة الخاصة';

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: 'PRIVATE_SAFE',
      transaction_type: 'TRANSFER_TO_DRAWER',
      amount: cleanAmount,
      previous_balance: prevSafe,
      new_balance: nextSafe,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: safeNote,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    // Add cash directly into active Drawer and update Cash History & Active Shift metrics
    dbService.logCashMovement(cleanAmount, 0, drawerNote, 'CASH_ADJUSTMENT_ADD', op, drawerNote);

    dbService.logAuditAction(
      'TRANSFER_PRIVATE_SAFE_TO_DRAWER',
      `سحب ${cleanAmount} ج.م من الخزنة الخاصة إلى درج النقدية بواسطة ${op} (الخزنة الخاصة: ${prevSafe} ← ${nextSafe} ج.م | الدرج: ${prevDrawer} ← ${nextDrawer} ج.م)`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      tx,
      previousSafeBalance: prevSafe,
      newSafeBalance: nextSafe,
      previousDrawerBalance: prevDrawer,
      newDrawerBalance: nextDrawer
    };
  },

  transferDrawerToMainSafe: (
    amount: number,
    operator?: string,
    notes?: string
  ): SafeTransaction => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('توريد النقدية من الدرج للخزنة الرئيسية متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const activeDrawer = dbService.getActiveDrawer();
    const drawerAvail = Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100;
    if (cleanAmount > drawerAvail) {
      throw new Error(`رصيد الدرج الحالي (${drawerAvail} ج.م) لا يكفي لتحويل هذا المبلغ!`);
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const noteText = notes?.trim() || 'توريد نقدية من الدرج إلى الخزنة الرئيسية';

    dbService.logCashMovement(0, cleanAmount, noteText, 'CASH_ADJUSTMENT_SUB', op, noteText);

    const prev = dbService.getSafeBalance('MAIN_SAFE');
    const next = Math.round((prev + cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const tx: SafeTransaction = {
      id: `safe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: 'MAIN_SAFE',
      transaction_type: 'TRANSFER_FROM_DRAWER',
      amount: cleanAmount,
      previous_balance: prev,
      new_balance: next,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: noteText,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      'TRANSFER_DRAWER_TO_MAIN_SAFE',
      `توريد ${cleanAmount} ج.م من الدرج إلى الخزنة الرئيسية بواسطة ${op}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return tx;
  },

  transferMainSafeToPrivateSafe: (
    amount: number,
    operator?: string,
    notes?: string
  ): { mainTx: SafeTransaction; privateTx: SafeTransaction } => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('الترحيل إلى الخزنة الخاصة متاح للأدمن فقط!');
    }
    const cleanAmount = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const mainPrev = dbService.getSafeBalance('MAIN_SAFE');
    if (cleanAmount > mainPrev) {
      throw new Error(`رصيد الخزنة الرئيسية (${mainPrev} ج.م) غير كافٍ!`);
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const mainNext = Math.round((mainPrev - cleanAmount) * 100) / 100;
    const privPrev = dbService.getSafeBalance('PRIVATE_SAFE');
    const privNext = Math.round((privPrev + cleanAmount) * 100) / 100;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const noteText = notes?.trim() || 'ترحيل يدوي من الخزنة الرئيسية إلى الخزنة الخاصة';

    const mainTx: SafeTransaction = {
      id: `safe_${Date.now()}_m_${Math.random().toString(36).substring(2, 5)}`,
      safe_type: 'MAIN_SAFE',
      transaction_type: 'TRANSFER_TO_PRIVATE',
      amount: cleanAmount,
      previous_balance: mainPrev,
      new_balance: mainNext,
      date: dateStr,
      time: timeStr,
      operator: op,
      related_safe: 'PRIVATE_SAFE',
      notes: noteText,
      created_at: now.toISOString()
    };

    const privateTx: SafeTransaction = {
      id: `safe_${Date.now() + 1}_p_${Math.random().toString(36).substring(2, 5)}`,
      safe_type: 'PRIVATE_SAFE',
      transaction_type: 'TRANSFER_TO_PRIVATE',
      amount: cleanAmount,
      previous_balance: privPrev,
      new_balance: privNext,
      date: dateStr,
      time: timeStr,
      operator: op,
      related_safe: 'MAIN_SAFE',
      notes: noteText,
      created_at: new Date(now.getTime() + 1).toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(mainTx, privateTx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      'TRANSFER_MAIN_TO_PRIVATE_SAFE',
      `ترحيل ${cleanAmount} ج.م من الخزنة الرئيسية إلى الخزنة الخاصة بواسطة ${op}. السبب: ${noteText}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return { mainTx, privateTx };
  },

  transferRemainingToPrivateSafeAtEndOfDay: (
    operator?: string,
    options?: {
      dailyCloseId?: string;
      drawerClosingAmount?: number;
      source?: 'BOTH' | 'DRAWER_ONLY' | 'MAIN_SAFE_ONLY';
      notes?: string;
    }
  ): { drawerTransferred: number; mainSafeTransferred: number; totalTransferred: number } => {
    const op = operator || dbService.getCurrentUser()?.name || 'أدمن النظام';
    const activeDrawer = dbService.getActiveDrawer();
    const drawerRem = typeof options?.drawerClosingAmount === 'number'
      ? Math.max(0, Math.round(options.drawerClosingAmount * 100) / 100)
      : Math.max(0, Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100);

    let drawerTransferred = 0;
    const mainSafeTransferred = 0;

    const all = dbService.getSafeTransactions();
    const privRunningBalance = dbService.getSafeBalance('PRIVATE_SAFE');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (drawerRem > 0) {
      const nextPriv = Math.round((privRunningBalance + drawerRem) * 100) / 100;
      all.push({
        id: `safe_${Date.now()}_d_${Math.random().toString(36).substring(2, 5)}`,
        safe_type: 'PRIVATE_SAFE',
        transaction_type: 'AUTO_DAILY_TRANSFER',
        amount: drawerRem,
        previous_balance: privRunningBalance,
        new_balance: nextPriv,
        date: dateStr,
        time: timeStr,
        operator: op,
        daily_close_id: options?.dailyCloseId,
        notes: options?.notes?.trim()
          ? `ترحيل تلقائي لباقي الدرج نهاية اليوم (${options.notes.trim()})`
          : 'ترحيل تلقائي لباقي الدرج نهاية اليوم إلى الخزنة الخاصة',
        created_at: now.toISOString()
      });
      drawerTransferred = drawerRem;
    }

    const totalTransferred = drawerTransferred;
    if (totalTransferred > 0) {
      setLocal(KEYS.SAFE_TRANSACTIONS, all);
      dbService.logAuditAction(
        'AUTO_EOD_PRIVATE_SAFE_TRANSFER',
        `ترحيل تلقائي نهاية اليوم من الدرج إلى الخزنة الخاصة بإجمالي ${totalTransferred} ج.م`,
        op
      );
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return { drawerTransferred, mainSafeTransferred, totalTransferred };
  },

  performEndOfDaySafeSweep: async (
    adminCredential: string,
    operator?: string,
    notes?: string,
    options?: {
      actualCashCounted?: number;
      shortageAmount?: number;
      shortageTargetAccount?: ShortageTargetAccount;
    }
  ): Promise<{ drawerTransferred: number; mainSafeTransferred: number; totalTransferred: number; recordedShortage: DailyShortage | null }> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('ترحيل نهاية اليوم إلى الخزنة الخاصة متاح للأدمن فقط!');
    }
    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const settings = dbService.getSettings();
    const source = settings.safe_auto_transfer_source || 'BOTH';
    const activeDrawer = dbService.getActiveDrawer();
    const expectedDrawerRem = Math.max(0, Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100);

    const effectiveDrawerCash =
      typeof options?.actualCashCounted === 'number' && !isNaN(options.actualCashCounted) && options.actualCashCounted >= 0
        ? Math.round(options.actualCashCounted * 100) / 100
        : expectedDrawerRem;

    const explicitShortage =
      typeof options?.shortageAmount === 'number' && !isNaN(options.shortageAmount) && options.shortageAmount > 0
        ? Math.round(options.shortageAmount * 100) / 100
        : undefined;
    const autoShortage = effectiveDrawerCash < expectedDrawerRem ? Math.round((expectedDrawerRem - effectiveDrawerCash) * 100) / 100 : 0;
    const finalShortage = explicitShortage !== undefined ? explicitShortage : autoShortage;

    const res = dbService.transferRemainingToPrivateSafeAtEndOfDay(op, {
      drawerClosingAmount: effectiveDrawerCash,
      source,
      notes: notes || 'ترحيل وتصفية نهاية اليوم إلى الخزنة الخاصة'
    });

    let recordedShortage: DailyShortage | null = null;
    if (finalShortage > 0) {
      recordedShortage = dbService.recordDailyShortage({
        expectedAmount: expectedDrawerRem,
        actualAmount: effectiveDrawerCash,
        shortageAmount: finalShortage,
        targetAccount: options?.shortageTargetAccount || 'PRIVATE_SAFE',
        cashierName: op,
        notes: notes?.trim() || 'عجز مسجل عند ترحيل وتصفية نهاية اليوم للخزنة الخاصة'
      });
    }

    if (res.drawerTransferred > 0 || (effectiveDrawerCash === 0 && expectedDrawerRem > 0)) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      dbService.closeCashDrawer(effectiveDrawerCash);
      if (res.drawerTransferred > 0) {
        dbService.saveCashMovement({
          previous_balance: effectiveDrawerCash,
          transaction_type: 'CASH_WITHDRAWAL',
          amount: res.drawerTransferred,
          new_balance: 0,
          date: todayStr,
          time: timeStr,
          user: op,
          notes: 'ترحيل نهاية اليوم تلقائياً إلى الخزنة الخاصة'
        });
      }
      dbService.openCashDrawer(0);

      // Complete any active shift so dashboard starts fresh at 0
      const shifts = dbService.getShifts();
      const activeShiftIdx = shifts.findIndex(s => s.status === 'OPEN' || s.status === 'PENDING_HANDOVER');
      if (activeShiftIdx > -1) {
        const metrics = dbService.calculateShiftMetrics(shifts[activeShiftIdx]);
        shifts[activeShiftIdx] = {
          ...metrics,
          status: 'COMPLETED',
          actual_received_cash: effectiveDrawerCash,
          discrepancy: Math.round((effectiveDrawerCash - metrics.expected_cash) * 100) / 100,
          discrepancy_reason: notes || (finalShortage > 0 ? `تصفية نهاية اليوم مع عجز ${finalShortage} ج.م` : 'تصفية نهاية اليوم وترحيل المتبقي للخزنة الخاصة'),
          ended_at: now.toISOString(),
          updated_at: now.toISOString()
        };
        setLocal(KEYS.SHIFTS, shifts);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return { ...res, recordedShortage };
  },

  adjustSafeBalanceAdmin: async (
    safeType: SafeType,
    newBalance: number,
    adminCredential: string,
    reason: string,
    operatorName?: string,
    mode: 'ADJUST' | 'RESET' = 'ADJUST'
  ): Promise<{ previousBalance: number; newBalance: number; delta: number; transaction: SafeTransaction }> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('عذراً! صلاحية تعديل وتصفير أرصدة الخزن متاحة للأدمن فقط.');
    }

    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const targetBalance = Math.round((Number(newBalance) || 0) * 100) / 100;
    if (isNaN(targetBalance) || targetBalance < 0) {
      throw new Error('يرجى إدخال رصيد صحيح لا يقل عن 0 ج.م');
    }

    const safeLabel = dbService.getSafeArabicLabel(safeType);
    const prev = dbService.getSafeBalance(safeType);
    const delta = Math.round((targetBalance - prev) * 100) / 100;

    if (delta === 0) {
      throw new Error(
        mode === 'RESET'
          ? `رصيد ${safeLabel} مصفّر بالفعل (0 ج.م).`
          : `الرصيد الجديد مطابق للرصيد الحالي في ${safeLabel} (${prev.toLocaleString('ar-EG')} ج.م).`
      );
    }

    const op = operatorName || cu?.name || 'أدمن النظام';
    const cleanReason =
      reason?.trim() ||
      (mode === 'RESET'
        ? `تصفير رصيد ${safeLabel} لتصحيح خطأ حسابي`
        : `تعديل رصيد ${safeLabel} يدوياً لتصحيح خطأ حسابي`);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const txType: SafeTransactionType = mode === 'RESET' ? 'SAFE_RESET' : 'BALANCE_ADJUSTMENT';
    const tx: SafeTransaction = {
      id: `safe_adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      safe_type: safeType,
      transaction_type: txType,
      amount: Math.abs(delta),
      previous_balance: prev,
      new_balance: targetBalance,
      adjustment_delta: delta,
      date: dateStr,
      time: timeStr,
      operator: op,
      notes: `${mode === 'RESET' ? 'تصفير رصيد الخزنة' : 'تعديل رصيد الخزنة'}: ${cleanReason}`,
      created_at: now.toISOString()
    };

    const all = dbService.getSafeTransactions();
    all.push(tx);
    setLocal(KEYS.SAFE_TRANSACTIONS, all);

    dbService.logAuditAction(
      mode === 'RESET' ? 'RESET_SAFE_BALANCE' : 'ADJUST_SAFE_BALANCE',
      `قام الأدمن (${op}) بـ${mode === 'RESET' ? 'تصفير' : 'تعديل'} رصيد ${safeLabel} من ${prev} ج.م إلى ${targetBalance} ج.م (الفرق: ${delta >= 0 ? `+${delta}` : delta} ج.م). السبب: ${cleanReason}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      previousBalance: prev,
      newBalance: targetBalance,
      delta,
      transaction: tx
    };
  },

  resetSafeBalanceAdmin: async (
    safeType: SafeType,
    adminCredential: string,
    reason: string,
    operatorName?: string
  ) => {
    return dbService.adjustSafeBalanceAdmin(
      safeType,
      0,
      adminCredential,
      reason || `تصفير رصيد ${dbService.getSafeArabicLabel(safeType)} إلى 0 ج.م`,
      operatorName,
      'RESET'
    );
  },

  // --- End-of-Day Cash Shortage Ledger (خانة العجز اليومية والتسوية التلقائية) ---
  getDailyShortages: (): DailyShortage[] => getLocal<DailyShortage[]>(KEYS.DAILY_SHORTAGES, []),

  getPendingShortages: (): DailyShortage[] =>
    dbService.getDailyShortages().filter(s => s.status !== 'SETTLED' && Number(s.remaining_amount) > 0),

  getTotalPendingShortage: (): number => {
    const sum = dbService.getPendingShortages().reduce((acc, s) => acc + (Number(s.remaining_amount) || 0), 0);
    return Math.round(sum * 100) / 100;
  },

  recordDailyShortage: (params: {
    expectedAmount: number;
    actualAmount: number;
    shortageAmount?: number;
    targetAccount?: ShortageTargetAccount;
    cashierName?: string;
    notes?: string;
    businessDate?: string;
    dailyCloseId?: string;
  }): DailyShortage => {
    const expected = Math.round((Number(params.expectedAmount) || 0) * 100) / 100;
    const actual = Math.round((Number(params.actualAmount) || 0) * 100) / 100;
    const calcShortage =
      typeof params.shortageAmount === 'number' && !isNaN(params.shortageAmount)
        ? Math.round(Number(params.shortageAmount) * 100) / 100
        : Math.round(Math.max(0, expected - actual) * 100) / 100;

    if (calcShortage <= 0) {
      throw new Error('قيمة العجز يجب أن تكون أكبر من صفر');
    }

    const appSettings = dbService.getSettings();
    const defaultTarget: ShortageTargetAccount =
      params.targetAccount || (appSettings.safe_auto_transfer_enabled !== false ? 'PRIVATE_SAFE' : 'DRAWER');

    const now = new Date();
    const dateStr = params.businessDate || now.toISOString().split('T')[0];
    const cashier = params.cashierName || dbService.getCurrentUser()?.name || 'الكاشير';

    const record: DailyShortage = {
      id: `short_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      business_date: dateStr,
      expected_amount: expected,
      actual_amount: actual,
      shortage_amount: calcShortage,
      paid_amount: 0,
      remaining_amount: calcShortage,
      target_account: defaultTarget,
      cashier_name: cashier,
      notes: params.notes?.trim() || 'عجز نقدية مسجل في نهاية اليوم',
      status: 'PENDING',
      daily_close_id: params.dailyCloseId,
      settlements: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const all = dbService.getDailyShortages();
    const duplicateRecent = all.find(existing => {
      if (
        existing.business_date !== dateStr ||
        Number(existing.shortage_amount) !== calcShortage ||
        Number(existing.expected_amount) !== expected ||
        Number(existing.actual_amount) !== actual
      ) {
        return false;
      }
      const createdMs = Date.parse(existing.created_at || '');
      return !isNaN(createdMs) && Math.abs(now.getTime() - createdMs) < 5000;
    });
    if (duplicateRecent) {
      return duplicateRecent;
    }

    all.push(record);
    setLocal(KEYS.DAILY_SHORTAGES, all);

    dbService.logAuditAction(
      'RECORD_DAILY_SHORTAGE',
      `تسجيل عجز نهاية اليوم بتاريخ ${dateStr} بقيمة ${calcShortage} ج.م (المتوقع: ${expected} | الفعلي: ${actual}). الحساب المستفيد عند السداد: ${dbService.getShortageAccountArabicLabel(defaultTarget)}`,
      cashier
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return record;
  },

  settleShortageAdmin: (
    shortageId: string,
    amount: number,
    targetAccount?: ShortageTargetAccount,
    operator?: string,
    notes?: string
  ): DailyShortage => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('إضافة وتسوية العجز متاحة للأدمن فقط!');
    }

    const all = dbService.getDailyShortages();
    const idx = all.findIndex(s => s.id === shortageId);
    if (idx === -1) {
      throw new Error('سجل العجز غير موجود!');
    }

    const shortage = all[idx];
    if (shortage.status === 'SETTLED' || shortage.remaining_amount <= 0) {
      throw new Error('تم سداد هذا العجز بالكامل مسبقاً!');
    }

    const cleanAmt = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmt <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }
    if (cleanAmt > shortage.remaining_amount) {
      throw new Error(`المبلغ المدخل (${cleanAmt} ج.م) أكبر من العجز المتبقي (${shortage.remaining_amount} ج.م)!`);
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const destAccount: ShortageTargetAccount = targetAccount || shortage.target_account || 'PRIVATE_SAFE';
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const accountLabel = dbService.getShortageAccountArabicLabel(destAccount);
    const noteText =
      notes?.trim() || `إضافة وسداد عجز يوم ${shortage.business_date} تلقائياً إلى ${accountLabel}`;

    // Credit the target account automatically
    if (destAccount === 'DRAWER') {
      dbService.logCashMovement(cleanAmt, 0, noteText, 'SHORTAGE_SETTLEMENT', op, noteText);
    } else {
      const prev = dbService.getSafeBalance(destAccount);
      const next = Math.round((prev + cleanAmt) * 100) / 100;
      const safeTx: SafeTransaction = {
        id: `safe_${Date.now()}_sh_${Math.random().toString(36).substring(2, 5)}`,
        safe_type: destAccount,
        transaction_type: 'SHORTAGE_SETTLEMENT',
        amount: cleanAmt,
        previous_balance: prev,
        new_balance: next,
        date: dateStr,
        time: timeStr,
        operator: op,
        notes: noteText,
        created_at: now.toISOString()
      };
      const safeTxs = dbService.getSafeTransactions();
      safeTxs.push(safeTx);
      setLocal(KEYS.SAFE_TRANSACTIONS, safeTxs);
    }

    const nextPaid = Math.round((shortage.paid_amount + cleanAmt) * 100) / 100;
    const nextRemaining = Math.max(0, Math.round((shortage.shortage_amount - nextPaid) * 100) / 100);
    const settlement: ShortageSettlement = {
      id: `shset_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      amount: cleanAmt,
      target_account: destAccount,
      settled_at: now.toISOString(),
      operator: op,
      notes: noteText
    };

    all[idx] = {
      ...shortage,
      paid_amount: nextPaid,
      remaining_amount: nextRemaining,
      target_account: destAccount,
      status: nextRemaining <= 0 ? 'SETTLED' : 'PARTIAL',
      settlements: [...(shortage.settlements || []), settlement],
      updated_at: now.toISOString()
    };
    setLocal(KEYS.DAILY_SHORTAGES, all);

    dbService.logAuditAction(
      'SETTLE_DAILY_SHORTAGE',
      `قام الأدمن (${op}) بإضافة مبلغ العجز (${cleanAmt} ج.م) ليوم ${shortage.business_date} وتمت إضافته تلقائياً إلى ${accountLabel} (المتبقي من العجز: ${nextRemaining} ج.م)`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return all[idx];
  },

  addShortageDepositFIFO: (
    amount: number,
    targetAccount: ShortageTargetAccount,
    operator?: string,
    notes?: string
  ): { settledAmount: number; extraDeposited: number; totalAdded: number; settledIds: string[] } => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('إضافة وتسوية العجز متاحة للأدمن فقط!');
    }
    const cleanAmt = Math.round((Number(amount) || 0) * 100) / 100;
    if (cleanAmt <= 0) {
      throw new Error('يرجى إدخال مبلغ صحيح أكبر من صفر');
    }

    const op = operator || cu?.name || 'أدمن النظام';
    const pending = dbService.getPendingShortages();
    let remainingToApply = cleanAmt;
    let settledAmount = 0;
    const settledIds: string[] = [];

    for (const s of pending) {
      if (remainingToApply <= 0) break;
      const portion = Math.round(Math.min(remainingToApply, s.remaining_amount) * 100) / 100;
      if (portion > 0) {
        dbService.settleShortageAdmin(s.id, portion, targetAccount, op, notes);
        settledAmount = Math.round((settledAmount + portion) * 100) / 100;
        remainingToApply = Math.round((remainingToApply - portion) * 100) / 100;
        settledIds.push(s.id);
      }
    }

    let extraDeposited = 0;
    if (remainingToApply > 0) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const accountLabel = dbService.getShortageAccountArabicLabel(targetAccount);
      const noteText = notes?.trim() || `إضافة مبلغ عجز / تسوية تلقائية إلى ${accountLabel}`;

      if (targetAccount === 'DRAWER') {
        dbService.logCashMovement(remainingToApply, 0, noteText, 'SHORTAGE_SETTLEMENT', op, noteText);
      } else {
        const prev = dbService.getSafeBalance(targetAccount);
        const next = Math.round((prev + remainingToApply) * 100) / 100;
        const safeTx: SafeTransaction = {
          id: `safe_${Date.now()}_she_${Math.random().toString(36).substring(2, 5)}`,
          safe_type: targetAccount,
          transaction_type: 'SHORTAGE_SETTLEMENT',
          amount: remainingToApply,
          previous_balance: prev,
          new_balance: next,
          date: dateStr,
          time: timeStr,
          operator: op,
          notes: noteText,
          created_at: now.toISOString()
        };
        const safeTxs = dbService.getSafeTransactions();
        safeTxs.push(safeTx);
        setLocal(KEYS.SAFE_TRANSACTIONS, safeTxs);
      }

      extraDeposited = remainingToApply;
      dbService.logAuditAction(
        'ADD_SHORTAGE_TO_ACCOUNT',
        `إضافة مبلغ ${extraDeposited} ج.م تلقائياً إلى ${accountLabel} من خانة العجز بواسطة ${op}`,
        op
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shortage_updated'));
        window.dispatchEvent(new CustomEvent('safe_updated'));
        window.dispatchEvent(new CustomEvent('shift_updated'));
        window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
      }
    }

    return {
      settledAmount,
      extraDeposited,
      totalAdded: cleanAmt,
      settledIds
    };
  },

  adjustTotalPendingShortageAdmin: async (
    newTotalShortage: number,
    adminCredential: string,
    reason: string,
    operatorName?: string,
    mode: 'ADJUST' | 'RESET' = 'ADJUST'
  ): Promise<{ previousTotal: number; newTotal: number; delta: number; removedIds: string[] }> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('عذراً! صلاحية تعديل أو تصفير مبلغ العجز متاحة للأدمن فقط.');
    }

    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const targetTotal = mode === 'RESET' ? 0 : Math.round((Number(newTotalShortage) || 0) * 100) / 100;
    if (isNaN(targetTotal) || targetTotal < 0) {
      throw new Error('يرجى إدخال قيمة عجز صحيحة لا تقل عن 0 ج.م');
    }

    const previousTotal = dbService.getTotalPendingShortage();
    const delta = Math.round((targetTotal - previousTotal) * 100) / 100;
    if (delta === 0) {
      throw new Error(
        mode === 'RESET'
          ? 'رصيد خانة العجز مصفّر بالفعل (0 ج.م).'
          : `القيمة الجديدة مطابقة لإجمالي العجز الحالي (${previousTotal.toLocaleString('ar-EG')} ج.م).`
      );
    }

    const op = operatorName || cu?.name || 'أدمن النظام';
    const cleanReason =
      reason?.trim() ||
      (mode === 'RESET' ? 'تصفير خانة العجز لتصحيح خطأ حسابي' : 'تعديل إجمالي مبلغ العجز يدوياً لتصحيح خطأ حسابي');
    const nowIso = new Date().toISOString();
    const all = dbService.getDailyShortages();
    const removedIds: string[] = [];

    if (targetTotal === 0) {
      const nextList: DailyShortage[] = [];
      for (const s of all) {
        if (s.status !== 'SETTLED' && Number(s.remaining_amount) > 0) {
          if ((Number(s.paid_amount) || 0) <= 0) {
            removedIds.push(s.id);
          } else {
            nextList.push({
              ...s,
              shortage_amount: Math.round((Number(s.paid_amount) || 0) * 100) / 100,
              remaining_amount: 0,
              status: 'SETTLED',
              notes: `${s.notes ? s.notes + ' | ' : ''}تصفير العجز المتبقي: ${cleanReason}`,
              updated_at: nowIso
            });
          }
        } else {
          nextList.push(s);
        }
      }
      setLocal(KEYS.DAILY_SHORTAGES, nextList);
      if (removedIds.length > 0) {
        firebaseSyncService.recordDeletions(KEYS.DAILY_SHORTAGES, removedIds);
      }
    } else if (targetTotal < previousTotal) {
      // Reduce pending shortages from newest first
      let toReduce = Math.round((previousTotal - targetTotal) * 100) / 100;
      const updatedMap = new Map<string, DailyShortage | null>();
      for (let i = all.length - 1; i >= 0 && toReduce > 0; i--) {
        const s = all[i];
        if (s.status === 'SETTLED' || Number(s.remaining_amount) <= 0) continue;
        const rem = Math.round((Number(s.remaining_amount) || 0) * 100) / 100;
        const paid = Math.round((Number(s.paid_amount) || 0) * 100) / 100;
        const cut = Math.min(rem, toReduce);
        const nextRem = Math.max(0, Math.round((rem - cut) * 100) / 100);
        const nextShortage = Math.round((paid + nextRem) * 100) / 100;
        toReduce = Math.round((toReduce - cut) * 100) / 100;

        if (nextShortage <= 0 && paid <= 0) {
          removedIds.push(s.id);
          updatedMap.set(s.id, null);
        } else {
          updatedMap.set(s.id, {
            ...s,
            shortage_amount: nextShortage,
            remaining_amount: nextRem,
            status: nextRem <= 0 ? 'SETTLED' : paid > 0 ? 'PARTIAL' : 'PENDING',
            notes: `${s.notes ? s.notes + ' | ' : ''}تعديل أدمن: ${cleanReason}`,
            updated_at: nowIso
          });
        }
      }
      const nextList = all
        .map(s => (updatedMap.has(s.id) ? updatedMap.get(s.id) : s))
        .filter((s): s is DailyShortage => Boolean(s));
      setLocal(KEYS.DAILY_SHORTAGES, nextList);
      if (removedIds.length > 0) {
        firebaseSyncService.recordDeletions(KEYS.DAILY_SHORTAGES, removedIds);
      }
    } else {
      // Increase pending shortage
      const diff = Math.round((targetTotal - previousTotal) * 100) / 100;
      const lastPendingIdx = [...all].reverse().findIndex(s => s.status !== 'SETTLED' && Number(s.remaining_amount) > 0);
      if (lastPendingIdx !== -1) {
        const actualIdx = all.length - 1 - lastPendingIdx;
        const target = all[actualIdx];
        const nextRem = Math.round((Number(target.remaining_amount) + diff) * 100) / 100;
        const nextShortage = Math.round((Number(target.shortage_amount) + diff) * 100) / 100;
        all[actualIdx] = {
          ...target,
          shortage_amount: nextShortage,
          remaining_amount: nextRem,
          status: Number(target.paid_amount) > 0 ? 'PARTIAL' : 'PENDING',
          notes: `${target.notes ? target.notes + ' | ' : ''}تعديل أدمن (+${diff} ج.م): ${cleanReason}`,
          updated_at: nowIso
        };
        setLocal(KEYS.DAILY_SHORTAGES, all);
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const activeDrawer = dbService.getActiveDrawer();
        const drawerBal = Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100;
        all.push({
          id: `short_adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          business_date: todayStr,
          expected_amount: Math.round((drawerBal + diff) * 100) / 100,
          actual_amount: drawerBal,
          shortage_amount: diff,
          paid_amount: 0,
          remaining_amount: diff,
          target_account: 'PRIVATE_SAFE',
          cashier_name: op,
          notes: `تعديل عجز يدوي (أدمن): ${cleanReason}`,
          status: 'PENDING',
          settlements: [],
          created_at: nowIso,
          updated_at: nowIso
        });
        setLocal(KEYS.DAILY_SHORTAGES, all);
      }
    }

    dbService.logAuditAction(
      mode === 'RESET' ? 'RESET_SHORTAGE_BALANCE' : 'ADJUST_SHORTAGE_BALANCE',
      `قام الأدمن (${op}) بـ${mode === 'RESET' ? 'تصفير' : 'تعديل'} إجمالي خانة العجز من ${previousTotal} ج.م إلى ${targetTotal} ج.م (الفرق: ${delta >= 0 ? `+${delta}` : delta} ج.م). السبب: ${cleanReason}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      previousTotal,
      newTotal: targetTotal,
      delta,
      removedIds
    };
  },

  updateShortageRecordAdmin: async (
    shortageId: string,
    params: {
      newShortageAmount: number;
      expectedAmount?: number;
      actualAmount?: number;
      targetAccount?: ShortageTargetAccount;
      notes?: string;
    },
    adminCredential: string,
    operatorName?: string
  ): Promise<DailyShortage> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('عذراً! تعديل سجل العجز متاح للأدمن فقط.');
    }

    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const all = dbService.getDailyShortages();
    const idx = all.findIndex(s => s.id === shortageId);
    if (idx === -1) {
      throw new Error('سجل العجز غير موجود!');
    }

    const current = all[idx];
    const cleanNewAmount = Math.round((Number(params.newShortageAmount) || 0) * 100) / 100;
    const paid = Math.round((Number(current.paid_amount) || 0) * 100) / 100;

    if (isNaN(cleanNewAmount) || cleanNewAmount <= 0) {
      throw new Error('يرجى إدخال قيمة عجز صحيحة أكبر من صفر (أو استخدم زر الحذف لإلغاء السجل).');
    }
    if (cleanNewAmount < paid) {
      throw new Error(`لا يمكن جعل قيمة العجز أقل من المبلغ المسدد بالفعل (${paid.toLocaleString('ar-EG')} ج.م)!`);
    }

    const op = operatorName || cu?.name || 'أدمن النظام';
    const nextRemaining = Math.max(0, Math.round((cleanNewAmount - paid) * 100) / 100);
    const nextStatus: DailyShortage['status'] =
      nextRemaining <= 0 ? 'SETTLED' : paid > 0 ? 'PARTIAL' : 'PENDING';
    const nowIso = new Date().toISOString();

    const updated: DailyShortage = {
      ...current,
      shortage_amount: cleanNewAmount,
      remaining_amount: nextRemaining,
      expected_amount:
        typeof params.expectedAmount === 'number' && !isNaN(params.expectedAmount) && params.expectedAmount >= 0
          ? Math.round(params.expectedAmount * 100) / 100
          : current.expected_amount,
      actual_amount:
        typeof params.actualAmount === 'number' && !isNaN(params.actualAmount) && params.actualAmount >= 0
          ? Math.round(params.actualAmount * 100) / 100
          : current.actual_amount,
      target_account: params.targetAccount || current.target_account,
      notes: params.notes?.trim() || current.notes,
      status: nextStatus,
      updated_at: nowIso
    };

    all[idx] = updated;
    setLocal(KEYS.DAILY_SHORTAGES, all);

    dbService.logAuditAction(
      'UPDATE_SHORTAGE_RECORD',
      `قام الأدمن (${op}) بتعديل سجل عجز يوم ${current.business_date} من ${current.shortage_amount} ج.م إلى ${cleanNewAmount} ج.م (المتبقي: ${nextRemaining} ج.م). السبب: ${updated.notes}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return updated;
  },

  deleteShortageRecordAdmin: async (
    shortageId: string,
    adminCredential: string,
    reason?: string,
    operatorName?: string
  ): Promise<DailyShortage> => {
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('عذراً! حذف سجل العجز متاح للأدمن فقط.');
    }

    const isValid = await dbService.verifyAdminActionCredential(adminCredential);
    if (!isValid) {
      throw new Error(
        isAdminSecurityPasswordSet()
          ? 'كلمة مرور حماية الشاشات الحساسة (Admin Security Password) غير صحيحة!'
          : 'رمز الأمان PIN للمسؤول غير صحيح!'
      );
    }

    const all = dbService.getDailyShortages();
    const idx = all.findIndex(s => s.id === shortageId);
    if (idx === -1) {
      throw new Error('سجل العجز غير موجود!');
    }

    const target = all[idx];
    const nextList = all.filter(s => s.id !== shortageId);
    setLocal(KEYS.DAILY_SHORTAGES, nextList);
    firebaseSyncService.recordDeletion(KEYS.DAILY_SHORTAGES, shortageId);

    const op = operatorName || cu?.name || 'أدمن النظام';
    const cleanReason = reason?.trim() || 'حذف سجل عجز مكرر أو مدخل بالخطأ';
    dbService.logAuditAction(
      'DELETE_SHORTAGE_RECORD',
      `قام الأدمن (${op}) بحذف سجل عجز يوم ${target.business_date} بقيمة ${target.shortage_amount} ج.م (المتبقي كان: ${target.remaining_amount} ج.م). السبب: ${cleanReason}`,
      op
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return target;
  },

  // --- Daily Close ---
  getDailyCloses: (): DailyClose[] => getLocal<DailyClose[]>(KEYS.DAILY_CLOSES, []),
  performDailyClose: (
    cashierName: string,
    options?: {
      actualCashCounted?: number;
      notes?: string;
      shortageAmount?: number;
      shortageTargetAccount?: ShortageTargetAccount;
    }
  ): DailyClose => {
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
    const finalCalculatedCash = Math.round((activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out) * 100) / 100;
    const effectiveClosingCash =
      typeof options?.actualCashCounted === 'number' && !isNaN(options.actualCashCounted) && options.actualCashCounted >= 0
        ? Math.round(options.actualCashCounted * 100) / 100
        : finalCalculatedCash;

    const closeId = `close_${Date.now()}`;
    const appSettings = dbService.getSettings();
    const autoTransferEnabled = appSettings.safe_auto_transfer_enabled !== false;

    let transferResult = { drawerTransferred: 0, mainSafeTransferred: 0, totalTransferred: 0 };
    if (autoTransferEnabled) {
      transferResult = dbService.transferRemainingToPrivateSafeAtEndOfDay(cashierName, {
        dailyCloseId: closeId,
        drawerClosingAmount: effectiveClosingCash,
        source: appSettings.safe_auto_transfer_source || 'BOTH',
        notes: options?.notes
      });
    }

    // Close current cash drawer
    dbService.closeCashDrawer(effectiveClosingCash);

    if (transferResult.drawerTransferred > 0) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      dbService.saveCashMovement({
        previous_balance: effectiveClosingCash,
        transaction_type: 'CASH_WITHDRAWAL',
        amount: transferResult.drawerTransferred,
        new_balance: 0,
        date: todayStr,
        time: timeStr,
        user: cashierName,
        notes: 'ترحيل تلقائي لباقي الدرج نهاية اليوم إلى الخزنة الخاصة'
      });
    }

    // Record end-of-day shortage automatically if deficit exists or explicit shortage entered
    const explicitShortage =
      typeof options?.shortageAmount === 'number' && !isNaN(options.shortageAmount) && options.shortageAmount >= 0
        ? Math.round(options.shortageAmount * 100) / 100
        : undefined;
    const autoShortage =
      effectiveClosingCash < finalCalculatedCash
        ? Math.round((finalCalculatedCash - effectiveClosingCash) * 100) / 100
        : 0;
    const finalShortageAmount = explicitShortage !== undefined ? explicitShortage : autoShortage;

    let recordedShortage: DailyShortage | null = null;
    if (finalShortageAmount > 0) {
      recordedShortage = dbService.recordDailyShortage({
        expectedAmount: finalCalculatedCash,
        actualAmount: effectiveClosingCash,
        shortageAmount: finalShortageAmount,
        targetAccount: options?.shortageTargetAccount || (autoTransferEnabled ? 'PRIVATE_SAFE' : 'DRAWER'),
        cashierName,
        notes: options?.notes?.trim() || 'عجز نهاية اليوم عند إغلاق الوردية',
        businessDate: todayStr,
        dailyCloseId: closeId
      });
    }

    const newClose: DailyClose = {
      id: closeId,
      business_date: todayStr,
      total_sales: totalSales,
      cash_sales: cashSales,
      credit_sales: creditSales,
      total_expenses: totalExpensesAmount,
      net_profit: netProfit,
      opening_cash: activeDrawer.opening_balance,
      closing_cash: effectiveClosingCash,
      transferred_to_private_safe: transferResult.totalTransferred,
      drawer_transferred: transferResult.drawerTransferred,
      main_safe_transferred: transferResult.mainSafeTransferred,
      shortage_amount: finalShortageAmount > 0 ? finalShortageAmount : 0,
      shortage_id: recordedShortage?.id,
      notes: options?.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    closes.push(newClose);
    setLocal(KEYS.DAILY_CLOSES, closes);

    // Open tomorrow's drawer at 0 if remaining drawer cash was swept to Private Safe, otherwise carry forward
    const nextDrawerOpening = transferResult.drawerTransferred > 0 ? 0 : effectiveClosingCash;
    dbService.openCashDrawer(nextDrawerOpening);

    // Close active shift cleanly when drawer remainder is swept at end of day
    if (transferResult.drawerTransferred > 0 || finalShortageAmount > 0) {
      const shifts = dbService.getShifts();
      const activeShiftIdx = shifts.findIndex(s => s.status === 'OPEN' || s.status === 'PENDING_HANDOVER');
      if (activeShiftIdx > -1) {
        const metrics = dbService.calculateShiftMetrics(shifts[activeShiftIdx]);
        shifts[activeShiftIdx] = {
          ...metrics,
          status: 'COMPLETED',
          actual_received_cash: effectiveClosingCash,
          discrepancy: Math.round((effectiveClosingCash - metrics.expected_cash) * 100) / 100,
          discrepancy_reason: options?.notes?.trim() || (finalShortageAmount > 0 ? `إغلاق نهاية اليوم بعجز ${finalShortageAmount} ج.م` : 'إغلاق نهاية اليوم وترحيل الباقي للخزنة الخاصة'),
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setLocal(KEYS.SHIFTS, shifts);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('safe_updated'));
      window.dispatchEvent(new CustomEvent('shortage_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return newClose;
  },

  // --- App Settings ---
  getSettings: (): AppSettings => {
    const saved = getLocal<AppSettings>(KEYS.SETTINGS, defaultSettings);
    const hasExistingCafeName = Boolean(saved?.cafe_name && saved.cafe_name.trim().length > 0);
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
      is_setup_completed: Boolean(saved?.is_setup_completed || hasExistingCafeName)
    };
  },
  saveSettings: (settings: Partial<AppSettings>) => {
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
      isResettingDatabase = true;
      try {
        Object.entries(rawDataObj).forEach(([k, val]) => {
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              localStorage.setItem(k, JSON.stringify(val));
            } else {
              localStorage.setItem(k, String(val));
            }
          }
        });
      } finally {
        isResettingDatabase = false;
      }

      reconcileOpenInvoicesWithVault();
      syncOpenInvoicesVaultState(getLocal<Invoice[]>(KEYS.INVOICES, []), getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []), true);

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
    setLocal(KEYS.AUDIT_LOGS, list.slice(-300));
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
    setLocal(KEYS.ITEM_MODIFICATIONS, list.slice(-300));
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
    const cu = dbService.getCurrentUser();
    if (cu && cu.role !== 'Admin') {
      throw new Error('تعديل مديونية العميل متاح للأدمن فقط!');
    }
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
    isResettingDatabase = true;
    try {
      setLocal(KEYS.INVOICES, []);
      setLocal(KEYS.INVOICE_ITEMS, []);
      setLocal(KEYS.OPEN_INVOICES_VAULT, []);
      setLocal(KEYS.OPEN_INVOICE_ITEMS_VAULT, []);
      saveVaultToIDB([], []);
    } finally {
      isResettingDatabase = false;
    }
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
    firebaseSyncService.recordDeletion(KEYS.EMPLOYEES, id);
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
    firebaseSyncService.recordDeletion(KEYS.EMPLOYEE_TRANSACTIONS, id);
    setLocal(KEYS.EMPLOYEE_TRANSACTIONS, filtered);
  },

  recordEmployeeConsumption: (
    employeeId: string,
    employeeName: string,
    items: { product: Product; quantity: number; unitPrice?: number; custom_price?: number }[],
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

        const effectiveUnitPrice =
          item.unitPrice !== undefined && !isNaN(item.unitPrice)
            ? item.unitPrice
            : (item.custom_price !== undefined && !isNaN(item.custom_price) ? item.custom_price : prod.selling_price);

        totalCost += prod.cost_price * item.quantity;
        totalSellingPrice += effectiveUnitPrice * item.quantity;

        consumedProductsList.push({
          product_id: prod.id,
          product_name_ar: prod.name_ar,
          quantity: item.quantity,
          selling_price: effectiveUnitPrice,
          cost_price: prod.cost_price
        });
      }
    });

    totalSellingPrice = Math.round(totalSellingPrice * 100) / 100;

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
      notes: `استهلاك منتجات: ${items.map(i => {
        const pPrice = i.unitPrice !== undefined && !isNaN(i.unitPrice)
          ? i.unitPrice
          : (i.custom_price !== undefined && !isNaN(i.custom_price) ? i.custom_price : i.product.selling_price);
        return `${i.product.name_ar} (x${i.quantity} × ${pPrice} ج.م)`;
      }).join(', ')} (${policy === 'FREE' ? 'مشروب مجاني للموظف' : 'خصم من الراتب'})`,
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
    firebaseSyncService.recordDeletion(KEYS.PS_DEVICES, id);
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
    const list = dbService.getRawMaterials().filter(r => r.id !== id);
    firebaseSyncService.recordDeletion(KEYS.RAW_MATERIALS, id);
    setLocal(KEYS.RAW_MATERIALS, list);
    return list;
  },

  // --- Batch Inventory System Module ---
  getInventoryBatches: (): InventoryBatch[] => {
    const list = getLocal<InventoryBatch[]>(KEYS.INVENTORY_BATCHES, []);
    let modified = false;
    const sanitized = list.map(b => {
      let bMod = false;
      let consumed = b.consumed_quantity;
      if (consumed === undefined || consumed === null || isNaN(consumed)) {
        consumed = 0;
        bMod = true;
      }
      let orig = b.original_quantity || b.yield_capacity || 0;
      let remaining = b.remaining_quantity;
      if (remaining === undefined || remaining === null || isNaN(remaining)) {
        remaining = Math.max(0, orig - consumed);
        bMod = true;
      }
      if (bMod) {
        modified = true;
        return {
          ...b,
          consumed_quantity: consumed,
          remaining_quantity: remaining,
          remaining_cups: b.yield_capacity ? remaining : b.remaining_cups
        };
      }
      return b;
    });
    if (modified) {
      setLocal(KEYS.INVENTORY_BATCHES, sanitized);
    }
    return sanitized;
  },

  getBatchConsumptions: (): any[] => {
    return getLocal<any[]>('cafe_batch_consumptions', []);
  },

  saveInventoryBatch: (batch: InventoryBatch): InventoryBatch[] => {
    const list = dbService.getInventoryBatches();
    const idx = list.findIndex(b => b.id === batch.id);

    const isRaw = batch.item_type === 'raw_material' || !!batch.yield_capacity;
    const yieldCap = isRaw ? (batch.yield_capacity || batch.original_quantity || 50) : (batch.original_quantity || 1);
    const consumed = batch.consumed_quantity !== undefined && batch.consumed_quantity !== null && !isNaN(batch.consumed_quantity) ? batch.consumed_quantity : 0;
    const remaining = Math.max(0, yieldCap - consumed);

    const isSugar = isSugarMaterial(batch.item_name);
    const updated: InventoryBatch = {
      ...batch,
      consumed_quantity: consumed,
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
    firebaseSyncService.recordDeletion(KEYS.INVENTORY_BATCHES, id);
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
      desired_remaining_quantity?: number;
      reset_consumed?: boolean;
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
    const oldYieldCap = b.yield_capacity || b.original_quantity || 0;
    const oldRemaining = b.remaining_quantity ?? Math.max(0, oldYieldCap - (b.consumed_quantity || 0));
    const oldRawQty = b.raw_material_qty ?? 1;

    if (updatedData.item_name !== undefined && updatedData.item_name.trim()) {
      b.item_name = updatedData.item_name.trim();
    }
    if (updatedData.supplier !== undefined) b.supplier = updatedData.supplier.trim();
    if (updatedData.purchase_date !== undefined) b.purchase_date = updatedData.purchase_date;
    if (updatedData.expiry_date !== undefined) b.expiry_date = updatedData.expiry_date;
    if (updatedData.invoice_number !== undefined) b.invoice_number = updatedData.invoice_number.trim();
    if (updatedData.notes !== undefined) b.notes = updatedData.notes.trim();

    if (updatedData.reset_consumed) {
      b.consumed_quantity = 0;
    }

    if (updatedData.purchase_price !== undefined && !isNaN(updatedData.purchase_price) && updatedData.purchase_price >= 0) {
      b.purchase_price = updatedData.purchase_price;
    }

    if (updatedData.unit !== undefined && updatedData.unit.trim()) {
      b.unit = updatedData.unit.trim();
    }
    if (updatedData.yield_unit !== undefined && updatedData.yield_unit.trim()) {
      b.yield_unit = updatedData.yield_unit.trim();
    }

    if (updatedData.raw_material_qty !== undefined && !isNaN(updatedData.raw_material_qty) && updatedData.raw_material_qty >= 0) {
      const newRawQty = updatedData.raw_material_qty;
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
            unit: b.unit || rm.unit,
            unit_cost: newUnitCost
          });
        }
      }
      b.raw_material_qty = newRawQty;
    }

    if (
      updatedData.desired_remaining_quantity !== undefined &&
      !isNaN(updatedData.desired_remaining_quantity) &&
      updatedData.desired_remaining_quantity >= 0
    ) {
      const desiredRem = updatedData.desired_remaining_quantity;
      const newCap = (b.consumed_quantity || 0) + desiredRem;
      b.original_quantity = newCap;
      if (b.item_type === 'raw_material' || b.yield_capacity !== undefined) {
        b.yield_capacity = newCap;
        b.remaining_cups = desiredRem;
      }
      b.remaining_quantity = desiredRem;
    } else if (
      updatedData.yield_capacity !== undefined &&
      !isNaN(updatedData.yield_capacity) &&
      updatedData.yield_capacity >= 0
    ) {
      const newCap = updatedData.yield_capacity;
      b.original_quantity = newCap;
      if (b.item_type === 'raw_material' || b.yield_capacity !== undefined) {
        b.yield_capacity = newCap;
      }
      b.remaining_quantity = Math.max(0, newCap - (b.consumed_quantity || 0));
      b.remaining_cups = b.remaining_quantity;
    } else {
      const cap = b.yield_capacity || b.original_quantity || 0;
      b.remaining_quantity = Math.max(0, cap - (b.consumed_quantity || 0));
      b.remaining_cups = b.remaining_quantity;
    }

    const finalCap = b.yield_capacity || b.original_quantity || 0;
    const isSugar = isSugarMaterial(b.item_name);
    b.total_revenue = isSugar ? 0 : (b.total_revenue || 0);
    b.net_profit = isSugar ? 0 : (b.total_revenue - b.purchase_price);
    b.profit_margin = isSugar ? 0 : (b.purchase_price > 0 ? ((b.total_revenue - b.purchase_price) / b.purchase_price) * 100 : 0);
    b.updated_at = new Date().toISOString();

    if (b.remaining_quantity <= 0) {
      b.status = 'COMPLETED';
      if (!b.ended_at) b.ended_at = new Date().toISOString();
    } else {
      b.ended_at = undefined;
      if (finalCap > 0 && b.remaining_quantity / finalCap <= 0.2) {
        b.status = 'LOW';
      } else {
        b.status = 'ACTIVE';
      }
    }

    list[idx] = b;
    setLocal(KEYS.INVENTORY_BATCHES, list);

    // Keep linked ready/direct-sale product stock in sync
    const products = dbService.getProducts();
    const norm = (s: string) =>
      (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const bNorm = norm(b.item_name);
    const matchingProd = products.find(p =>
      !p.is_raw_material &&
      (p.id === b.item_id || (bNorm && norm(p.name_ar) === bNorm))
    );
    if (matchingProd && (!matchingProd.recipe_ingredients || matchingProd.recipe_ingredients.length === 0)) {
      const totalProdRemaining = list
        .filter(nb =>
          nb.status !== 'COMPLETED' &&
          (nb.id === b.id || nb.item_id === matchingProd.id || norm(nb.item_name) === norm(matchingProd.name_ar))
        )
        .reduce((sum, nb) => sum + Math.max(0, nb.remaining_quantity || 0), 0);
      dbService.saveProduct({
        ...matchingProd,
        current_stock: totalProdRemaining,
        updated_at: new Date().toISOString()
      });
    }

    dbService.addInventoryBatchLog({
      batch_id: b.id,
      batch_serial: b.batch_serial,
      item_name: b.item_name,
      action_type: 'EDIT_BATCH',
      quantity_changed: b.remaining_quantity - oldRemaining,
      previous_quantity: oldRemaining,
      new_quantity: b.remaining_quantity,
      operator: operator || 'المالك',
      reason: `تعديل بيانات وكمية الدفعة (المخزن: ${b.raw_material_qty ?? 0} ${b.unit || 'وحدة'}, المتبقي: ${b.remaining_quantity} ${b.yield_unit || 'كوب'}, التكلفة: ${b.purchase_price} ج.م)`
    });

    return { success: true, list, batch: b };
  },

  setDailyRawMaterialAllocations: (
    entries: Array<{
      itemName: string;
      itemType: 'raw_material' | 'ready_product';
      rawMaterialId?: string;
      productId?: string;
      batchId?: string;
      rawQty: number;
      rawUnit: string;
      dailyYieldQty: number;
      yieldUnit: string;
      batchCost?: number;
      mode: 'SET_REMAINING' | 'ADD_NEW';
      date?: string;
    }>,
    operator: string = 'المالك'
  ): { success: boolean; updatedCount: number } => {
    if (!entries || entries.length === 0) {
      return { success: false, updatedCount: 0 };
    }

    const norm = (s: string) =>
      (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

    const todayStr = entries[0].date || new Date().toISOString().split('T')[0];
    let updatedCount = 0;

    const existingSession = dbService.getDailyRawMaterialsSession(todayStr);
    const sessionItemsMap = new Map<string, DailyRawMaterialItem>();
    if (existingSession?.items) {
      existingSession.items.forEach(it => {
        sessionItemsMap.set(norm(it.name_ar), { ...it });
      });
    }

    for (const entry of entries) {
      const cleanName = entry.itemName.trim();
      if (!cleanName) continue;
      const nName = norm(cleanName);
      const safeRawQty = Math.max(0, isNaN(entry.rawQty) ? 0 : entry.rawQty);
      const safeYieldQty = Math.max(0, isNaN(entry.dailyYieldQty) ? 0 : entry.dailyYieldQty);
      const safeCost = entry.batchCost !== undefined && !isNaN(entry.batchCost) && entry.batchCost >= 0 ? entry.batchCost : undefined;

      // Sync or create RawMaterial record for raw materials
      const rawMaterials = dbService.getRawMaterials();
      let resolvedItemId = entry.rawMaterialId || entry.productId || '';
      if (entry.itemType === 'raw_material') {
        let rm = rawMaterials.find(r =>
          (entry.rawMaterialId && r.id === entry.rawMaterialId) || norm(r.name) === nName
        );
        if (rm) {
          const nextRmQty = entry.mode === 'SET_REMAINING' ? safeRawQty : (rm.current_quantity || 0) + safeRawQty;
          const nextUnitCost = safeCost !== undefined && safeCost > 0 && safeRawQty > 0
            ? safeCost / safeRawQty
            : rm.unit_cost;
          dbService.saveRawMaterial({
            ...rm,
            current_quantity: nextRmQty,
            unit: entry.rawUnit || rm.unit,
            unit_cost: nextUnitCost
          });
          resolvedItemId = rm.id;
        } else {
          const newRm: RawMaterial = {
            id: `raw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: cleanName,
            unit: entry.rawUnit || 'كجم',
            current_quantity: safeRawQty,
            add_quantity: 0,
            unit_cost: safeCost && safeRawQty > 0 ? safeCost / safeRawQty : 0,
            total_cost: safeCost || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          dbService.saveRawMaterial(newRm);
          resolvedItemId = newRm.id;
        }
      }

      const batches = dbService.getInventoryBatches();
      const matchingOpenBatches = batches.filter(b =>
        b.status !== 'COMPLETED' &&
        ((entry.batchId && b.id === entry.batchId) ||
          (resolvedItemId && b.item_id === resolvedItemId) ||
          norm(b.item_name) === nName)
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (entry.mode === 'SET_REMAINING') {
        const targetBatch = (entry.batchId ? batches.find(b => b.id === entry.batchId) : null) || matchingOpenBatches[0];
        if (targetBatch) {
          dbService.editInventoryBatch(
            targetBatch.id,
            {
              item_name: cleanName,
              raw_material_qty: safeRawQty,
              desired_remaining_quantity: safeYieldQty,
              unit: entry.rawUnit || targetBatch.unit,
              yield_unit: entry.yieldUnit || targetBatch.yield_unit || 'كوب',
              purchase_price: safeCost !== undefined ? safeCost : targetBatch.purchase_price,
              purchase_date: todayStr
            },
            operator
          );

          // If there are leftover duplicate auto "(بيع مباشر)" batches for the same item, mark them completed so total matches daily allocation
          const afterEdit = dbService.getInventoryBatches();
          let closedDuplicates = false;
          const cleaned = afterEdit.map(b => {
            if (
              b.id !== targetBatch.id &&
              b.status !== 'COMPLETED' &&
              (b.batch_serial.includes('بيع مباشر') || b.batch_serial.includes('تشغيل فوري')) &&
              norm(b.item_name) === nName
            ) {
              closedDuplicates = true;
              return {
                ...b,
                remaining_quantity: 0,
                remaining_cups: 0,
                status: 'COMPLETED' as const,
                ended_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
            }
            return b;
          });
          if (closedDuplicates) {
            setLocal(KEYS.INVENTORY_BATCHES, cleaned);
          }
        } else if (safeYieldQty > 0 || safeRawQty > 0) {
          const isSugar = isSugarMaterial(cleanName);
          const costVal = safeCost ?? 0;
          const capVal = safeYieldQty > 0 ? safeYieldQty : safeRawQty;
          const nextNum = dbService.getNextBatchNumber(cleanName);
          const newBatch: InventoryBatch = {
            id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            batch_serial: `دفعة ${cleanName} رقم ${nextNum} (يومي ${todayStr})`,
            item_type: entry.itemType,
            item_id: resolvedItemId || `item_${Date.now()}`,
            item_name: cleanName,
            raw_material_qty: safeRawQty,
            unit: entry.rawUnit || 'كجم',
            original_quantity: capVal,
            consumed_quantity: 0,
            remaining_quantity: capVal,
            yield_capacity: entry.itemType === 'raw_material' ? capVal : undefined,
            remaining_cups: entry.itemType === 'raw_material' ? capVal : undefined,
            yield_unit: entry.yieldUnit || (entry.itemType === 'raw_material' ? 'كوب' : 'قطعة'),
            purchase_price: costVal,
            supplier: 'تخصيص يومي',
            purchase_date: todayStr,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            total_revenue: 0,
            net_profit: isSugar ? 0 : -costVal,
            profit_margin: isSugar ? 0 : (costVal > 0 ? -100 : 0)
          };
          dbService.saveInventoryBatch(newBatch);
          dbService.addInventoryBatchLog({
            batch_id: newBatch.id,
            batch_serial: newBatch.batch_serial,
            item_name: newBatch.item_name,
            action_type: 'ADD_BATCH',
            quantity_changed: capVal,
            previous_quantity: 0,
            new_quantity: capVal,
            operator,
            reason: `تحديد كمية يومية (${capVal} ${newBatch.yield_unit || newBatch.unit}) ليوم ${todayStr}`
          });
        }
      } else {
        // ADD_NEW: add a new daily batch on top of existing remaining stock
        if (safeYieldQty > 0 || safeRawQty > 0) {
          const isSugar = isSugarMaterial(cleanName);
          const costVal = safeCost ?? 0;
          const capVal = safeYieldQty > 0 ? safeYieldQty : safeRawQty;
          const nextNum = dbService.getNextBatchNumber(cleanName);
          const newBatch: InventoryBatch = {
            id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            batch_serial: `دفعة ${cleanName} رقم ${nextNum} (يومي ${todayStr})`,
            item_type: entry.itemType,
            item_id: resolvedItemId || `item_${Date.now()}`,
            item_name: cleanName,
            raw_material_qty: safeRawQty,
            unit: entry.rawUnit || 'كجم',
            original_quantity: capVal,
            consumed_quantity: 0,
            remaining_quantity: capVal,
            yield_capacity: entry.itemType === 'raw_material' ? capVal : undefined,
            remaining_cups: entry.itemType === 'raw_material' ? capVal : undefined,
            yield_unit: entry.yieldUnit || (entry.itemType === 'raw_material' ? 'كوب' : 'قطعة'),
            purchase_price: costVal,
            supplier: 'تخصيص يومي إضافي',
            purchase_date: todayStr,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            total_revenue: 0,
            net_profit: isSugar ? 0 : -costVal,
            profit_margin: isSugar ? 0 : (costVal > 0 ? -100 : 0)
          };
          dbService.saveInventoryBatch(newBatch);
          dbService.addInventoryBatchLog({
            batch_id: newBatch.id,
            batch_serial: newBatch.batch_serial,
            item_name: newBatch.item_name,
            action_type: 'MANUAL_ADD',
            quantity_changed: capVal,
            previous_quantity: 0,
            new_quantity: capVal,
            operator,
            reason: `إضافة كمية يومية جديدة (+${capVal} ${newBatch.yield_unit || newBatch.unit}) ليوم ${todayStr}`
          });
        }
      }

      // Sync Ready/Direct product stock
      const products = dbService.getProducts();
      const matchingProd = products.find(p =>
        !p.is_raw_material &&
        ((entry.productId && p.id === entry.productId) || norm(p.name_ar) === nName)
      );
      if (matchingProd && (!matchingProd.recipe_ingredients || matchingProd.recipe_ingredients.length === 0)) {
        const latestBatches = dbService.getInventoryBatches();
        const totalProdRemaining = latestBatches
          .filter(nb => nb.status !== 'COMPLETED' && (nb.item_id === matchingProd.id || norm(nb.item_name) === nName))
          .reduce((sum, nb) => sum + Math.max(0, nb.remaining_quantity || 0), 0);
        dbService.saveProduct({
          ...matchingProd,
          current_stock: totalProdRemaining,
          updated_at: new Date().toISOString()
        });
      }

      sessionItemsMap.set(nName, {
        raw_material_id: resolvedItemId || `item_${nName}`,
        name_ar: cleanName,
        quantity: safeYieldQty,
        cost: safeCost ?? 0,
        unit: entry.yieldUnit || entry.rawUnit || 'وحدة'
      });

      updatedCount++;
    }

    dbService.saveDailyRawMaterialsSession({
      id: existingSession?.id || `rm_sess_${Date.now()}`,
      business_date: todayStr,
      items: Array.from(sessionItemsMap.values()),
      created_at: existingSession?.created_at || new Date().toISOString(),
      is_active: true
    });

    return { success: true, updatedCount };
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
    setLocal(KEYS.INVENTORY_BATCH_LOGS, list.slice(0, 300));
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

    const normalizeName = (s: string) => {
      if (!s) return '';
      return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');
    };

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
      const normTargetName = normalizeName(targetName);

      if (req.isRawMaterial) {
        // For raw material ingredients: presence of active open batch (status !== COMPLETED) means material is available
        const activeRmBatches = batches.filter(b => {
          const matchId = b.item_id === itemId;
          const matchName = normTargetName && normalizeName(b.item_name) === normTargetName;
          return (matchId || matchName) && b.status !== 'COMPLETED';
        });

        if (activeRmBatches.length === 0) {
          // Auto-provision an active batch for this raw material so the sale is NEVER blocked
          const newBatch: InventoryBatch = {
            id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            batch_serial: `تشغيل فوري - ${req.name}`,
            item_type: 'raw_material',
            item_id: itemId,
            item_name: req.name,
            raw_material_qty: 10000,
            original_quantity: 10000,
            consumed_quantity: 0,
            remaining_quantity: 10000,
            unit: 'جرام',
            purchase_price: 0,
            supplier: 'مورد عام',
            purchase_date: new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
            created_at: new Date().toISOString()
          };
          dbService.saveInventoryBatch(newBatch);
          batches.push(newBatch);
        }
      } else {
        // For products, check exact unit count in remaining_quantity
        let itemBatches = batches.filter(b => {
          const matchId = b.item_id === itemId;
          const matchName = normTargetName && normalizeName(b.item_name) === normTargetName;
          return (matchId || matchName) && (b.remaining_quantity || 0) > 0;
        });

        let totalAvailable = itemBatches.reduce((sum, b) => sum + (b.remaining_quantity || 0), 0);

        // Fallback / Auto-sync: If totalAvailable is less than requested, auto-provision an active batch so the sale is NEVER blocked!
        if (totalAvailable < req.quantity && targetItem) {
          const prodObj = targetItem as Product;
          const openStock = 99999;
          const newBatch: InventoryBatch = {
            id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            batch_serial: `دفعة ${prodObj.name_ar} (بيع مباشر)`,
            item_type: 'ready_product',
            item_id: prodObj.id,
            item_name: prodObj.name_ar,
            raw_material_qty: openStock,
            original_quantity: openStock,
            consumed_quantity: 0,
            remaining_quantity: openStock,
            unit: prodObj.unit || 'قطعة',
            purchase_price: (prodObj.cost_price || 0),
            supplier: 'مورد عام',
            purchase_date: new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
            created_at: new Date().toISOString()
          };
          dbService.saveInventoryBatch(newBatch);
          batches.push(newBatch);
          totalAvailable = openStock;
          if (prodObj.current_stock < 99999) {
            prodObj.current_stock = openStock;
            dbService.saveProduct(prodObj);
          }
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
    
    const normalizeName = (s: string) => {
      if (!s) return '';
      return s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');
    };
    const normTargetName = normalizeName(targetName);

    // Sort active batches chronologically by purchase_date then by created_at
    let sortedBatches = batches
      .filter(b => {
        const matchId = b.item_id === itemId;
        const matchName = normTargetName && normalizeName(b.item_name) === normTargetName;
        return (matchId || matchName) && (b.remaining_quantity || 0) > 0;
      })
      .sort((a, b) => {
        const dateA = new Date(a.purchase_date).getTime();
        const dateB = new Date(b.purchase_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.created_at.localeCompare(b.created_at);
      });

    // Fallback: If no batch found in INVENTORY_BATCHES but targetItem exists
    if (sortedBatches.length === 0 && targetItem) {
      const prodObj = targetItem as Product;
      const openStock = Math.max(prodObj.current_stock || 0, 99999);
      const newBatch: InventoryBatch = {
        id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        batch_serial: `دفعة ${prodObj.name_ar || 'منتج'} (بيع مباشر)`,
        item_type: 'ready_product',
        item_id: prodObj.id || itemId,
        item_name: prodObj.name_ar || targetName || 'منتج',
        raw_material_qty: openStock,
        original_quantity: openStock,
        consumed_quantity: 0,
        remaining_quantity: openStock,
        unit: prodObj.unit || 'قطعة',
        purchase_price: (prodObj.cost_price || 0) * openStock,
        supplier: 'مورد عام',
        purchase_date: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };
      dbService.saveInventoryBatch(newBatch);
      batches.push(newBatch);
      sortedBatches = [newBatch];
    }

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
      firebaseSyncService.recordDeletion(KEYS.PARTNERS, id);
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
      firebaseSyncService.recordDeletion(KEYS.PARTNER_DRAWINGS, id);
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

  updateInvoiceOperationalStatus: (invoiceId: string, status: OperationalStatus): Invoice | null => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId || i.invoice_number === invoiceId);
    if (idx === -1) return null;

    invoices[idx].operational_status = status;
    invoices[idx].updated_at = new Date().toISOString();
    setLocal(KEYS.INVOICES, invoices);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return invoices[idx];
  },

  updateInvoiceNotes: (invoiceId: string, notes: string): Invoice | null => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const idx = invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) return null;

    invoices[idx].notes = notes;
    invoices[idx].updated_at = new Date().toISOString();
    setLocal(KEYS.INVOICES, invoices);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return invoices[idx];
  },

  deleteOpenInvoice: (invoiceId: string, operator = 'أدمن النظام / نادر الديب'): void => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const filtered = invoices.filter(inv => inv.id !== invoiceId);

    const allItems = getLocal<InvoiceItem[]>(KEYS.INVOICE_ITEMS, []);
    const deletedItemIds = allItems.filter(it => it.invoice_id === invoiceId).map(it => it.id).filter(Boolean);
    const filteredItems = allItems.filter(it => it.invoice_id !== invoiceId);

    firebaseSyncService.recordDeletion(KEYS.INVOICES, invoiceId);
    firebaseSyncService.recordDeletion(KEYS.OPEN_INVOICES_VAULT, invoiceId);
    if (deletedItemIds.length > 0) {
      firebaseSyncService.recordDeletions(KEYS.INVOICE_ITEMS, deletedItemIds);
      firebaseSyncService.recordDeletions(KEYS.OPEN_INVOICE_ITEMS_VAULT, deletedItemIds);
    }

    explicitlyDeletingInvoiceIds.add(invoiceId);
    try {
      setLocal(KEYS.INVOICES, filtered);
      setLocal(KEYS.INVOICE_ITEMS, filteredItems);
    } finally {
      explicitlyDeletingInvoiceIds.delete(invoiceId);
    }

    dbService.logAuditAction(
      'CANCEL_OPEN_INVOICE',
      `تم إلغاء وحذف الفاتورة المفتوحة رقم ${invoiceId} بالكامل من نظام التعليق بواسطة المسؤول`,
      operator
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }
  },

  createBlankTableInvoice: (tableId: string, operator: string, mergeNotes = ''): Invoice => {
    const invoices = getLocal<Invoice[]>(KEYS.INVOICES, []);
    const year = new Date().getFullYear();
    let maxSeq = invoices.length;
    const seqRegex = new RegExp(`INV-${year}-(\\d+)`);
    invoices.forEach(inv => {
      const m = String(inv?.invoice_number || '').match(seqRegex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    const seq = String(maxSeq + 1).padStart(5, '0');
    const dateStr = new Date().toISOString();

    const newInv: Invoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      invoice_number: `INV-${year}-${seq}`,
      customer_id: 'c_general',
      payment_type: 'CASH',
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paid_amount: 0,
      remaining_amount: 0,
      invoice_status: 'OPEN',
      operational_status: 'NEW',
      cashier_name: operator,
      invoice_date: dateStr,
      table_number: tableId,
      created_at: dateStr,
      updated_at: dateStr,
      timeline: [{
        status: 'OPEN',
        timestamp: dateStr,
        operator,
        notes: mergeNotes || `فاتورة جديدة على الطاولة ${tableId}`
      }]
    };

    invoices.push(newInv);
    setLocal(KEYS.INVOICES, invoices);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return newInv;
  },

  getCurrentUser: (): AuthUser | null => {
    try {
      const raw = localStorage.getItem('cafe_eldeeb_logged_user');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  saveInvoices: (invoices: Invoice[]): void => {
    setLocal(KEYS.INVOICES, invoices);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open_invoices_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }
  },

  // --- Shift Handover System ---
  getShifts: (): Shift[] => {
    return getLocal<Shift[]>(KEYS.SHIFTS, []);
  },

  getActiveShift: (): Shift | null => {
    const shifts = dbService.getShifts();
    const active = shifts.find(s => s.status === 'OPEN' || s.status === 'PENDING_HANDOVER');
    if (!active) return null;
    return dbService.calculateShiftMetrics(active);
  },

  getShiftHandovers: (): ShiftHandover[] => {
    return getLocal<ShiftHandover[]>(KEYS.SHIFT_HANDOVERS, []);
  },

  calculateShiftMetrics: (shift: Shift): Shift => {
    const invoices = dbService.getInvoices();
    const expenses = dbService.getExpenses();
    const creditPayments = getLocal<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const cashMovements = dbService.getCashHistory();
    const returns = dbService.getReturnTransactions();

    const rawStartTime = new Date(shift.started_at).getTime();
    const resetStartTime = shift.last_reset_at ? new Date(shift.last_reset_at).getTime() : 0;
    const startTime = Math.max(rawStartTime, resetStartTime);
    const endTime = shift.ended_at ? new Date(shift.ended_at).getTime() : Date.now();

    let cashIn = 0;
    let cashOut = 0;

    // 1. Cash from Invoices
    invoices.forEach(inv => {
      if (inv.invoice_status === 'CANCELLED') return;
      const invTime = new Date(inv.invoice_date).getTime();
      if (invTime >= startTime && invTime <= endTime) {
        if (inv.payment_type === 'CASH') {
          cashIn += inv.paid_amount || inv.total;
        } else if (inv.payment_type === 'SPLIT') {
          cashIn += inv.paid_amount || 0;
        }
      }
    });

    // 2. Cash from Debt Repayments
    creditPayments.forEach(cp => {
      const pTime = new Date(cp.payment_date).getTime();
      if (pTime >= startTime && pTime <= endTime) {
        cashIn += cp.amount;
      }
    });

    // 3. Manual Cash Movements
    cashMovements.forEach(cm => {
      if (!cm.created_at || cm.transaction_type === 'DRAWER_RESET') return;
      const cmTime = new Date(cm.created_at).getTime();
      if (cmTime >= startTime && cmTime <= endTime) {
        if (cm.transaction_type === 'CASH_ADJUSTMENT_ADD' || cm.transaction_type === 'SHORTAGE_SETTLEMENT') {
          cashIn += cm.amount;
        } else if (cm.transaction_type === 'CASH_ADJUSTMENT_SUB') {
          cashOut += cm.amount;
        }
      }
    });

    // 4. Cash Expenses
    expenses.forEach(exp => {
      if (!exp.payment_method || exp.payment_method === 'CASH') {
        const expTime = new Date(exp.created_at || exp.expense_date).getTime();
        if (expTime >= startTime && expTime <= endTime) {
          cashOut += exp.amount;
        }
      }
    });

    // 5. Cash Refunds from Returns
    returns.forEach(ret => {
      const retTime = new Date(ret.created_at || ret.return_date).getTime();
      if (retTime >= startTime && retTime <= endTime) {
        cashOut += ret.total_return_amount;
      }
    });

    const expectedCash = Math.round((shift.opening_balance + cashIn - cashOut) * 100) / 100;

    return {
      ...shift,
      cash_in: Math.round(cashIn * 100) / 100,
      cash_out: Math.round(cashOut * 100) / 100,
      expected_cash: expectedCash
    };
  },

  startShift: (shiftType: ShiftType, openingBalance: number, cashierName: string): Shift => {
    const shifts = dbService.getShifts();
    const existingActive = shifts.find(s => s.status === 'OPEN' || s.status === 'PENDING_HANDOVER');
    if (existingActive) {
      throw new Error('توجد وردية قائمة بالفعل. يجب إتمام عملية التسليم والاستلام أولًا.');
    }

    const now = new Date().toISOString();
    const newShift: Shift = {
      id: `shift_${Date.now()}`,
      shift_type: shiftType,
      cashier_name: cashierName || 'الكاشير',
      status: 'OPEN',
      opening_balance: openingBalance,
      cash_in: 0,
      cash_out: 0,
      expected_cash: openingBalance,
      started_at: now,
      created_at: now,
      updated_at: now
    };

    shifts.push(newShift);
    setLocal(KEYS.SHIFTS, shifts);

    // Sync CashDrawer opening balance
    dbService.setOpeningCash(
      openingBalance,
      now.split('T')[0],
      now.split('T')[1].substring(0, 8),
      `بداية ${shiftType === 'DAY' ? 'وردية النهار' : 'وردية المساء'}`,
      cashierName
    );

    dbService.logAuditAction('START_SHIFT', `بداية وردية جديدة (${shiftType === 'DAY' ? 'نهار' : 'مساء'}) برصيد افتتاحي ${openingBalance} ج.م`, cashierName);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return newShift;
  },

  submitShiftForHandover: async (
    shiftId: string,
    declaredCash: number,
    adminSecurityPassword: string,
    cashierName?: string
  ): Promise<Shift> => {
    // Verify admin security password
    const isValidPassword = await verifyAdminSecurityPassword(adminSecurityPassword);
    if (!isValidPassword) {
      throw new Error('كلمة مرور حماية الشاشات الحساسة غير صحيحة! لا يمكن إغلاق الوردية وتسليمها بدون التوثيق الإداري.');
    }

    const shifts = dbService.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx === -1) {
      throw new Error('الوردية غير موجودة!');
    }

    const shift = shifts[idx];
    if (shift.status !== 'OPEN') {
      throw new Error('هذه الوردية ليست مفتوحة للإغلاق!');
    }

    const now = new Date().toISOString();
    const updatedWithMetrics = dbService.calculateShiftMetrics({
      ...shift,
      ended_at: now
    });

    const discrepancy = Math.round((declaredCash - updatedWithMetrics.expected_cash) * 100) / 100;

    shifts[idx] = {
      ...updatedWithMetrics,
      status: 'PENDING_HANDOVER',
      declared_cash: declaredCash,
      discrepancy,
      ended_at: now,
      updated_at: now
    };

    setLocal(KEYS.SHIFTS, shifts);

    dbService.logAuditAction(
      'SUBMIT_SHIFT_HANDOVER',
      `تم تسليم الوردية (${shifts[idx].shift_type === 'DAY' ? 'النهار' : 'المساء'}) بانتظار استلام الأدمن. المكتشف: ${declaredCash} ج.م | المتوقع: ${shifts[idx].expected_cash} ج.م | الفرق: ${discrepancy} ج.م`,
      cashierName || shift.cashier_name
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return shifts[idx];
  },

  completeShiftAndHandover: (
    shiftId: string,
    actualReceivedCash: number,
    discrepancyReason: string,
    adminName: string
  ): { completedShift: Shift; newShift: Shift; handover: ShiftHandover } => {
    const shifts = dbService.getShifts();
    const idx = shifts.findIndex(s => s.id === shiftId);
    if (idx === -1) {
      throw new Error('الوردية غير موجودة!');
    }

    const currentShift = shifts[idx];
    if (currentShift.status !== 'PENDING_HANDOVER') {
      throw new Error('هذه الوردية ليست معلقة بانتظار الاستلام!');
    }

    const handoverDiscrepancy = Math.round((actualReceivedCash - currentShift.expected_cash) * 100) / 100;

    if (handoverDiscrepancy !== 0 && (!discrepancyReason || !discrepancyReason.trim())) {
      throw new Error('يجب إدخال سبب الفرق (العجز أو الزيادة) قبل تأكيد الاستلام!');
    }

    const now = new Date().toISOString();

    // 1. Mark current shift as COMPLETED
    shifts[idx] = {
      ...currentShift,
      status: 'COMPLETED',
      actual_received_cash: actualReceivedCash,
      discrepancy: handoverDiscrepancy,
      discrepancy_reason: discrepancyReason.trim() || undefined,
      updated_at: now
    };

    // 2. Record ShiftHandover
    const handovers = dbService.getShiftHandovers();
    const handover: ShiftHandover = {
      id: `handover_${Date.now()}`,
      shift_id: currentShift.id,
      outgoing_user: currentShift.cashier_name,
      incoming_user: adminName,
      handed_amount: currentShift.declared_cash || 0,
      accepted_amount: actualReceivedCash,
      discrepancy: handoverDiscrepancy,
      discrepancy_reason: discrepancyReason.trim() || undefined,
      notes: `تسليم واستلام وردية من ${currentShift.cashier_name} إلى ${adminName}`,
      handover_timestamp: now,
      created_at: now
    };
    handovers.push(handover);
    setLocal(KEYS.SHIFT_HANDOVERS, handovers);

    // 3. Log Audit if discrepancy exists
    if (handoverDiscrepancy !== 0) {
      dbService.logAuditAction(
        'SHIFT_DISCREPANCY',
        `تأكيد استلام وردية مع وجود فرق (${handoverDiscrepancy > 0 ? 'زيادة' : 'عجز'} بقيمة ${Math.abs(handoverDiscrepancy)} ج.م). السبب: ${discrepancyReason}`,
        adminName
      );
    } else {
      dbService.logAuditAction(
        'SHIFT_HANDOVER_SUCCESS',
        `تم تسلم وردية ${currentShift.shift_type === 'DAY' ? 'النهار' : 'المساء'} بنجاح برصيد ${actualReceivedCash} ج.م وبدون أي فرق.`,
        adminName
      );
    }

    // 4. Automatically create next Shift
    const nextType: ShiftType = currentShift.shift_type === 'DAY' ? 'NIGHT' : 'DAY';
    const newShift: Shift = {
      id: `shift_${Date.now() + 1}`,
      shift_type: nextType,
      cashier_name: adminName,
      status: 'OPEN',
      opening_balance: actualReceivedCash,
      cash_in: 0,
      cash_out: 0,
      expected_cash: actualReceivedCash,
      started_at: now,
      created_at: now,
      updated_at: now
    };

    shifts.push(newShift);
    setLocal(KEYS.SHIFTS, shifts);

    // Sync Cash Drawer opening balance
    dbService.setOpeningCash(
      actualReceivedCash,
      now.split('T')[0],
      now.split('T')[1].substring(0, 8),
      `استلام وردية وبداية ${nextType === 'DAY' ? 'وردية النهار' : 'وردية المساء'}`,
      adminName
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shift_updated'));
      window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
    }

    return {
      completedShift: shifts[idx],
      newShift,
      handover
    };
  }
};

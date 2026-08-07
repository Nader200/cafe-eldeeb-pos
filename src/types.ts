/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Category {
  id: string;
  name_ar: string;
  name_en: string;
  image: string; // URL or Emoji icon
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  raw_material_id: string; // Product ID of the raw material (which itself is a Product with is_raw_material: true)
  quantity: number; // amount of the raw material consumed
}

export interface Product {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  barcode: string;
  image: string; // Emoji, icon name or visual representation
  selling_price: number;
  cost_price: number;
  current_stock: number;
  minimum_stock: number;
  unit: string;
  is_favorite: boolean;
  is_available: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  is_raw_material?: boolean; // True if this item is a raw material/ingredient (e.g. Coffee Beans, Milk) rather than a direct sellable menu item
  is_service?: boolean; // True if item is a service or non-inventory playtime charge
  recipe_ingredients?: RecipeIngredient[]; // List of ingredients that this menu item consumes upon sale
  used_raw_materials?: string[]; // IDs of separate Raw Materials used in this product
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  add_quantity: number;
  unit_cost: number;
  total_cost: number; // calculated automatically as current_quantity * unit_cost
  is_shared?: boolean; // True for shared items (e.g. Sugar, Milk) where only consumption is tracked without profit calculation
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  whatsapp?: string;
  address: string;
  notes: string;
  national_id?: string;
  credit_limit: number;
  current_balance: number; // Balance owed
  status?: 'ACTIVE' | 'BLOCKED';
  is_archived?: boolean;
  created_at: string;
  updated_at: string;

  // Enterprise Customer fields
  is_vip?: boolean;
  wallet_balance?: number; // current wallet balance
  photo?: string; // photo data url or emoji avatar
  birthday?: string; // YYYY-MM-DD
  last_visit?: string; // ISO string or date
  tags?: string[]; // e.g. ['VIP', 'Frequent', 'Credit', 'Wallet', 'Inactive']
}

export interface Supplier {
  id: string;
  supplier_name: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierPurchase {
  id: string;
  supplier_id: string;
  date: string;
  item_details: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  raw_material_id?: string;
  purchased_quantity?: number;
  unit_cost?: number;
  payment_method?: 'CASH' | 'CREDIT';
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  date: string;
  amount_paid: number;
  payment_method: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY' | 'BANK';
  notes?: string;
  created_at: string;
}

export type PaymentType = 'CASH' | 'CREDIT' | 'SPLIT';
export type InvoiceStatus = 'PAID' | 'CREDIT' | 'CANCELLED' | 'DRAFT' | 'REFUNDED' | 'OPEN' | 'CLOSED' | 'PREPARING' | 'READY' | 'SERVED' | 'RETURNED';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
export type OperationalStatus = 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED';

export interface InvoiceTimelineEvent {
  status: InvoiceStatus | string;
  timestamp: string;
  operator: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  payment_type: PaymentType;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  invoice_status: InvoiceStatus;
  payment_status?: PaymentStatus;
  operational_status?: OperationalStatus;
  cashier_name: string;
  invoice_date: string; // ISO String
  notes?: string;
  table_number?: string;
  is_archived?: boolean;
  payment_method?: string; // 'CASH' | 'VODAFONE_CASH' | 'BANK_CARD' | 'BANK_TRANSFER' | 'CREDIT'
  payment_number?: string; // selected Vodafone Cash / InstaPay phone number
  reference_number?: string;
  referenceNumber?: string;
  sender_phone?: string;
  senderPhone?: string;
  receipt_image_url?: string;
  receiptImageUrl?: string;
  payment_date?: string;
  payment_time?: string;
  created_at: string;
  updated_at: string;
  delivery_time?: string;
  admin_name?: string;
  timeline?: InvoiceTimelineEvent[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  total_price: number;
  product_name_ar: string; // Denormalized for printing/display speed
  created_at: string;
  updated_at: string;
  notes?: string;
  original_price?: number;
  is_price_edited?: boolean;
  price_edit_reason?: string;
  item_discount_type?: 'percent' | 'fixed' | 'none';
  item_discount_value?: number;
  item_discount_amount?: number;
  is_paid?: boolean;
}

export type ExpenseCategory =
  | 'Coffee'
  | 'Molasses'
  | 'Charcoal'
  | 'Milk'
  | 'Sugar'
  | 'Fruits'
  | 'Rent'
  | 'Salaries'
  | 'Electricity'
  | 'Water'
  | 'Internet'
  | 'Miscellaneous';

export interface Expense {
  id: string;
  expense_category: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
  updated_at: string;
  notes?: string;
  payment_method?: 'CASH' | 'BANK' | 'VODAFONE_CASH' | 'CREDIT';
  receipt_image?: string;
  supplier_id?: string;
}

export type TransactionType = 'Purchase' | 'Sale' | 'Return' | 'Adjustment' | 'Waste';

export interface InventoryTransaction {
  id: string;
  product_id: string;
  transaction_type: TransactionType;
  quantity: number;
  reason: string;
  transaction_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreditPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CashDrawer {
  id: string;
  opening_balance: number;
  cash_in: number;
  cash_out: number;
  closing_balance: number | null; // Null if open
  business_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface DailyClose {
  id: string;
  business_date: string;
  total_sales: number;
  cash_sales: number;
  credit_sales: number;
  total_expenses: number;
  net_profit: number;
  opening_cash: number;
  closing_cash: number;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  cafe_name: string;
  owner_name?: string;
  is_setup_completed?: boolean;
  address: string;
  phone: string;
  currency: string;
  receipt_footer: string;
  logo_path: string;
  google_drive_backup_enabled: boolean;
  google_drive_auto_backup_enabled?: boolean;
  google_drive_last_backup_date?: string;
  google_drive_user_email?: string;
  google_drive_user_name?: string;
  google_drive_user_picture?: string;
  google_drive_access_token?: string;
  google_drive_client_id?: string;
  printer_paper_size: '58' | '80';
  printer_name: string;
  pin_code: string; // login protection
  pin_protection_enabled?: boolean;
  updated_at: string;
  // --- Customer Credit Reminders Settings ---
  reminder_days_friendly?: number;
  reminder_days_statement?: number;
  reminder_days_final?: number;
  whatsapp_reminders_enabled?: boolean;
  whatsapp_template_friendly?: string;
  whatsapp_template_statement?: string;
  whatsapp_template_final?: string;
  whatsapp_template_receipt?: string;
  statement_footer?: string;
  // --- Sales Settings ---
  sales_allow_edit_price?: boolean;
  sales_allow_discount?: boolean;
  sales_allow_delete_item?: boolean;
  sales_require_password_price_change?: boolean;
  sales_require_password_discount?: boolean;
  payment_numbers?: PaymentNumber[];
  vodafone_cash_number?: string;
  instapay_number?: string;
  instapay_id?: string;
  digital_payment_account_owner?: string;
  vodafone_cash_qr?: string;
  instapay_qr?: string;
  // --- Employee Settings ---
  employee_consumption_policy?: 'FREE' | 'DEDUCT';
  seasonal_theme?: 'LUXURY_COFFEE' | 'RAMADAN' | 'EID' | 'EID_AL_FITR' | 'EID_AL_ADHA' | 'WINTER' | 'SUMMER' | 'VALENTINE' | 'NEW_YEAR' | 'NONE';
  enable_theme_animations?: boolean;
  custom_expense_categories?: string[];
  default_tax_percentage?: number;
  // --- Version & Update Settings ---
  auto_update_checks_enabled?: boolean;
  last_update_check_date?: string;
  last_installed_version?: string;
  force_update_enabled?: boolean;
  client_platform?: 'web' | 'android';
}

export interface UpdateLog {
  id: string;
  timestamp: string;
  action: 'CHECK_FOR_UPDATES' | 'UPDATE_DETECTED' | 'UPDATE_APPLIED' | 'UPDATE_POSTPONED' | 'UPDATE_DISMISSED' | 'UPDATE_FAILED';
  installed_version: string;
  remote_version: string;
  platform: 'web' | 'android';
  status: 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR';
  details?: string;
  user_role?: string;
}

export interface PaymentNumber {
  id: string;
  type: 'VODAFONE_CASH' | 'INSTAPAY';
  number: string;
  is_active: boolean;
  name?: string; // holder name / label
}

export interface CustomerCommunicationLog {
  id: string;
  customer_id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  message_type: 'Reminder' | 'Statement' | 'Receipt' | 'Other';
  status: 'SUCCESS' | 'FAILED';
  message_sent: string;
  notes?: string;
  created_at: string;
}

export interface BackupLog {
  id: string;
  backup_date: string;
  backup_type: 'MANUAL' | 'AUTOMATIC';
  status: 'SUCCESS' | 'FAILED';
  file_name: string;
  created_at: string;
}

// POS State Interfaces
export interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  kitchen_notes: string;
  custom_price?: number; // edited unit price for this item
  is_price_edited?: boolean;
  price_edit_reason?: string;
  item_discount_type?: 'percent' | 'fixed' | 'none';
  item_discount_value?: number; // percentage or fixed value
  item_discount_amount?: number; // actual discount amount
}

export interface ItemModificationLog {
  id: string;
  invoice_id: string;
  invoice_number: string;
  type: 'PRICE_CHANGE' | 'DISCOUNT' | 'DELETE_ITEM' | 'CHANGE_PRODUCT' | 'QUANTITY_CHANGE' | 'EDITED_INVOICE';
  product_id: string;
  product_name: string;
  original_price: number;
  new_price: number;
  difference: number;
  discount_type?: 'percent' | 'fixed' | 'none';
  discount_value?: number;
  discount_amount?: number;
  quantity?: number;
  reason: string;
  timestamp: string; // ISO string
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  cashier: string;
}

export interface AuditLog {
  id: string;
  action: string; // e.g. 'DELETE_CUSTOMER', 'ARCHIVE_CUSTOMER', 'RESTORE_CUSTOMER'
  details: string; // Description in Arabic
  operator: string; // 'Administrator' or user
  timestamp: string; // ISO string
}

export interface ReturnItem {
  product_id: string;
  product_name_ar: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ReturnTransaction {
  id: string;
  original_invoice_id: string;
  original_invoice_number: string;
  return_number: string;
  return_date: string; // ISO String
  cashier_name: string;
  returned_items: ReturnItem[];
  total_return_quantity: number;
  total_return_amount: number;
  reason: string;
  created_at: string;
}

export interface CreditAdjustment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  user: string;
  customer_id: string;
  customer_name: string;
  previous_balance: number;
  new_balance: number;
  difference: number;
  reason: string;
  notes: string;
  created_at: string;
}

export interface CashMovement {
  id: string;
  previous_balance: number;
  transaction_type: 'OPENING_CASH' | 'CASH_SALE' | 'CUSTOMER_PAYMENT' | 'EXPENSE' | 'CASH_WITHDRAWAL' | 'ADD_CASH' | 'CASH_ADJUSTMENT_ADD' | 'CASH_ADJUSTMENT_SUB' | 'MANUAL_ADD' | 'MANUAL_SUB';
  amount: number;
  new_balance: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  user: string;
  notes: string;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  customer_id: string;
  customer_name: string;
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL' | 'MANUAL_ADJUSTMENT' | 'INVOICE_DEDUCTION' | 'INVOICE_REFUND' | 'INVOICE_PAYMENT' | 'REFUND' | 'BONUS' | 'CORRECTION';
  amount: number;
  previous_balance: number;
  new_balance: number;
  notes: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  user: string;
  created_at: string;
}

export interface CustomerCreditTransaction {
  id: string;
  customer_id: string;
  customer_name: string;
  invoice_id?: string;
  transaction_type: 'INVOICE' | 'PAYMENT' | 'MANUAL_ADJUSTMENT' | 'CORRECTION' | 'REFUND';
  amount: number;
  previous_balance: number;
  new_balance: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  created_by: string; // cashier or system user name
  notes: string;
  created_at: string; // ISO string
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  author: string;
  note_text: string;
  created_at: string;
}

export interface CustomerVisit {
  id: string;
  customer_id: string;
  visit_date: string; // YYYY-MM-DD
  visit_time: string; // HH:MM:SS
  invoice_id?: string;
  invoice_number?: string;
  total_spent?: number;
  notes?: string;
  created_at: string;
}

export interface TableSystem {
  id: string;
  name: string;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED';
  occupied_since?: string;
  reserved_by?: string;
  reservation_time?: string;
  reservation_notes?: string;
  merged_into?: string;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  daily_wage: number;
  created_at: string;
  photo?: string; // photo data url or emoji avatar
}

export interface EmployeeTransaction {
  id: string;
  employee_id: string;
  employee_name: string;
  type: 'LOAN' | 'DRINK_DEDUCTION' | 'CUSTOM_DEDUCTION' | 'WAGE_PAYMENT' | 'ENTITLEMENT' | 'CONSUMPTION';
  amount: number;
  notes: string;
  date: string; // YYYY-MM-DD
  created_at: string;
  products?: { product_id: string; product_name_ar: string; quantity: number; selling_price: number; cost_price: number }[];
}

export interface PSDevice {
  id: string;
  name: string;
  hourly_price_single: number;
  hourly_price_multi: number;
  status: 'FREE' | 'PLAYING_SINGLE' | 'PLAYING_MULTI' | 'PAUSED' | 'TIME_EXPIRED';
  session_start_time: string | null;
  session_pause_time: string | null;
  session_accumulated_seconds: number;
  session_notes: string;
  current_session_id: string | null;
  is_limited?: boolean;
  limit_minutes?: number;
  target_end_time?: string | null;
  expired_notified?: boolean;
}

export interface PSSession {
  id: string;
  device_id: string;
  device_name: string;
  session_type: 'SINGLE' | 'MULTI';
  start_time: string;
  end_time: string | null;
  pause_time: string | null;
  accumulated_seconds: number;
  hourly_price: number;
  discount: number;
  additional_charges: number;
  total_price: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';
  notes: string;
  created_at: string;
  is_limited?: boolean;
  limit_minutes?: number;
  target_end_time?: string | null;
  products?: { product_id: string; product_name_ar: string; quantity: number; selling_price: number; discount_amount?: number }[];
}export interface DailyRawMaterialItem {
  raw_material_id: string;
  name_ar: string;
  quantity: number;
  cost: number; // Purchase Cost in EGP
  unit: string;
}

export interface DailyRawMaterialSession {
  id: string;
  business_date: string; // YYYY-MM-DD
  items: DailyRawMaterialItem[];
  created_at: string;
  is_active: boolean; // True if started and active
}

export interface InventoryBatch {
  id: string;
  batch_serial: string; // e.g. "دفعة البن رقم 1"
  item_type: 'raw_material' | 'ready_product';
  item_id: string; // references raw material id or product id
  item_name: string; // e.g., "بن برازيلي" or "كولا"
  raw_material_qty?: number; // كمية المادة الخام بالمخزن المخصصة للدفعة (مثل 1 كجم) - لا تتغير أثناء البيع
  original_quantity: number; // السعة الإنتاجية الكلية بالوحدات المحددة (مثل 50 كوب أو 20 حجر شيشة)
  consumed_quantity: number; // الكمية المباعة/المستهلكة (0 -> 1 -> 2 -> 50)
  remaining_quantity: number; // الكمية المتبقية (50 -> 49 -> 0)
  unit: string; // وحدة تخزين المادة الخام بالمخزن (مثل "كيلوجرام" / "لتر")
  yield_unit?: string; // وحدة الإنتاج / التقديم المحسوبة (مثل "كوب"، "كاس"، "بولة"، "حجر شيشة"، "قطعة"، "زجاجة"...)
  purchase_price: number; // إجمالي تكلفة شراء الدفعة بالكامِل (مثل 380 جنيه) - لا تتغير مطلقا
  supplier: string;
  purchase_date: string;
  invoice_number?: string;
  expiry_date?: string;
  status: 'ACTIVE' | 'LOW' | 'COMPLETED'; // نشطة - قاربت على النفاد - منتهية
  created_at: string; // تاريخ البداية
  ended_at?: string; // تاريخ انتهاء الدفعة عند وصول المتبقي لصفر
  yield_capacity?: number; // السعة الإنتاجية للدفعة (مثل 50 كوب أو 100 حجر من 1 كجم)
  remaining_cups?: number; // الوحدات/الأكواب المتبقية من إنتاجية الدفعة
  total_revenue?: number; // إجمالي الإيرادات المحققة من بيع وحدات هذه الدفعة
  net_profit?: number; // صافي ربح الدفعة (الإيرادات - تكلفة الدفعة الثابتة)
  profit_margin?: number; // نسبة ربح الدفعة %
  notes?: string; // ملاحظات الشراء أو الدفعة
}

export interface InventoryBatchLog {
  id: string;
  batch_id: string;
  batch_serial: string;
  item_name: string;
  action_type: 'ADD_BATCH' | 'EDIT_BATCH' | 'DELETE_BATCH' | 'MANUAL_DEDUCT' | 'MANUAL_ADD' | 'INVENTORY_CHECK' | 'SALE_DEDUCT' | 'SALE_RETURN'; // إضافة دفعة - تعديل دفعة - حذف دفعة - خصم يدوي - إضافة يدوية - جرد - بيع - مرتجع بيع
  quantity_changed: number;
  previous_quantity: number;
  new_quantity: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  operator: string;
  reason: string;
}

// Authentication & Employee User Roles
export type UserRole = 'Admin' | 'Cashier';

export interface OrderNoteHistoryItem {
  id: string;
  timestamp: string;
  date?: string;
  author_name: string;
  author_role?: string;
  note: string;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  passwordHash: string; // Stored plaintext or hashed password for authentication
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface AuthAuditLog {
  id: string;
  employee_name: string;
  username: string;
  role: UserRole;
  action: 'LOGIN' | 'LOGOUT';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  timestamp: string; // ISO string
}

// Partner Withdrawals Accounting System
export interface Partner {
  id: string;
  name: string;
  ownership_percent: number; // e.g. 50, 25
  phone?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface PartnerDrawing {
  id: string;
  partner_id: string;
  partner_name: string;
  amount: number;
  date: string; // YYYY-MM-DD
  time?: string;
  reason: string; // e.g. "سلفة على الحساب", "توزيع أرباح", "مسحوبات شخصية"
  notes?: string;
  created_by?: string;
  created_at: string;
}




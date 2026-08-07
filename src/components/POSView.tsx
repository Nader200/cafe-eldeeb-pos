/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ContactPickerButton } from './ContactPickerButton';
import { EldeebLogoFull } from './EldeebLogo';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Edit3,
  User,
  PlusCircle,
  Clock,
  Coins,
  ChevronLeft,
  Star,
  Printer,
  X,
  CreditCard,
  Percent,
  Sparkles,
  ClipboardList,
  ShieldAlert,
  Check,
  Tags,
  RotateCcw,
  Copy,
  Smartphone,
  RefreshCw,
  Share2,
  Wallet,
  DollarSign,
  ArrowRightLeft,
  CheckSquare,
  Settings,
  Home,
  History,
  Calculator,
  Upload,
  Eye,
  FileText,
  Download,
  Coffee
} from 'lucide-react';
import { dbService, safeStorage, getItemCategoryIcon } from '../dbService';
const localStorage = safeStorage;
import { Product, Category, Customer, CartItem, PaymentType, Invoice } from '../types';
import { safeHtml2Canvas } from '../utils/html2canvasHelper';
import { shareInvoicePDFToWhatsApp } from '../utils/pdfInvoiceGenerator';
import { useAuth } from '../contexts/AuthContext';
import SyncStatusIndicator from './SyncStatusIndicator';
import { uploadReceiptImage } from '../lib/receiptStorage';
import { getPaymentMethodLabel } from '../utils/paymentUtils';

interface POSViewProps {
  onNavigate: (tab: string) => void;
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  onTriggerReceiptPrint: (invoiceId: string) => void;
  reopenedInvoiceId?: string;
  clearReopenedInvoiceId?: () => void;
  onTriggerRegisterRawMaterials?: () => void;
}

export default function POSView({
  onNavigate,
  onShowSuccessAlert,
  onShowWarningAlert,
  onTriggerReceiptPrint,
  reopenedInvoiceId,
  clearReopenedInvoiceId,
  onTriggerRegisterRawMaterials
}: POSViewProps) {
  
  // Auth user context
  const { currentUser } = useAuth();
  const cashierName = currentUser ? `${currentUser.name} (${currentUser.role})` : 'الكاشير الحالى';

  // State
  const getProductMaxAvailableText = (prod: Product): string => {
    if (prod.recipe_ingredients && prod.recipe_ingredients.length > 0) {
      const batches = dbService.getInventoryBatches();
      const rawMaterialsList = dbService.getRawMaterials();
      const productsList = dbService.getProducts();
      
      let maxQuantity = Infinity;
      
      for (const ingredient of prod.recipe_ingredients) {
        const targetItem = productsList.find(p => p.id === ingredient.raw_material_id) || rawMaterialsList.find(r => r.id === ingredient.raw_material_id);
        const targetName = targetItem ? ((targetItem as any).name_ar || (targetItem as any).name || '') : '';
        
        const itemBatches = batches.filter(b => {
          const matchId = b.item_id === ingredient.raw_material_id;
          const matchName = targetName && b.item_name.trim().toLowerCase() === targetName.trim().toLowerCase();
          return (matchId || matchName) && b.remaining_quantity > 0;
        });
        
        const totalAvailable = itemBatches.reduce((sum, b) => sum + b.remaining_quantity, 0);
        const possibleWithThis = Math.floor(totalAvailable / ingredient.quantity);
        if (possibleWithThis < maxQuantity) {
          maxQuantity = possibleWithThis;
        }
      }
      
      if (maxQuantity === Infinity || maxQuantity < 0) return '0 وحدة';
      return `${maxQuantity} وحدة (تحضير)`;
    }
    return `${prod.current_stock} وحدة`;
  };

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Dispatch global cart status event so Update System can postpone updates if invoice active
  useEffect(() => {
    const hasItems = cart.length > 0;
    (window as any).hasActivePOSCart = hasItems;
    window.dispatchEvent(new CustomEvent('pos_cart_updated', { detail: { hasItems, count: cart.length } }));
  }, [cart]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('c_general'); // default general customer
  const [discount, setDiscount] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(() => {
    const s = dbService.getSettings();
    return s.default_tax_percentage !== undefined ? s.default_tax_percentage : 0;
  }); // VAT standard Egyptian tax from settings
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'items' | 'cart'>('items'); // Mobile screen toggle
  
  // Draggable FAB position state
  const [fabPos, setFabPos] = useState<{ x: number | null; y: number | null; side: 'left' | 'right'; yPercent: number }>({
    x: null,
    y: null,
    side: 'left',
    yPercent: 75
  });
  const [isFabDragging, setIsFabDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number; hasMoved: boolean } | null>(null);

  // Load saved position
  useEffect(() => {
    const saved = localStorage.getItem('pos_fab_position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if ((parsed.side === 'left' || parsed.side === 'right') && typeof parsed.yPercent === 'number') {
          setFabPos(prev => ({ ...prev, side: parsed.side, yPercent: parsed.yPercent }));
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handleFabStart = (clientX: number, clientY: number, buttonEl: HTMLButtonElement) => {
    const rect = buttonEl.getBoundingClientRect();
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      startLeft: rect.left,
      startTop: rect.top,
      hasMoved: false
    };
    setIsFabDragging(true);
    setFabPos(prev => ({
      ...prev,
      x: rect.left,
      y: rect.top
    }));
  };

  const handleFabMove = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const { startX, startY, startLeft, startTop } = dragStartRef.current;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragStartRef.current.hasMoved = true;
    }

    setFabPos(prev => ({
      ...prev,
      x: startLeft + dx,
      y: startTop + dy
    }));
  };

  const handleFabEnd = () => {
    if (!dragStartRef.current) return;
    const wasDragging = dragStartRef.current.hasMoved;
    const finalX = fabPos.x ?? dragStartRef.current.startLeft;
    const finalY = fabPos.y ?? dragStartRef.current.startTop;

    dragStartRef.current = null;
    setIsFabDragging(false);

    if (!wasDragging) {
      onNavigate('open-invoices');
      setFabPos(prev => ({ ...prev, x: null, y: null }));
      return;
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // FAB size is 56px, radius 28px
    const centerX = finalX + 28;
    const side = centerX < screenWidth / 2 ? 'left' : 'right';

    let yPercent = ((finalY + 28) / screenHeight) * 100;
    yPercent = Math.max(10, Math.min(90, yPercent));

    const newPos = { side, yPercent };
    setFabPos({
      x: null,
      y: null,
      side,
      yPercent
    });
    localStorage.setItem('pos_fab_position', JSON.stringify(newPos));
  };

  useEffect(() => {
    if (!isFabDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      handleFabMove(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
      handleFabEnd();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      if (e.cancelable) {
        e.preventDefault();
      }
      handleFabMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchEnd = () => {
      handleFabEnd();
    };

    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isFabDragging, fabPos.x, fabPos.y]);
  
  const isRawMaterialSessionRegistered = useMemo(() => {
    return dbService.hasRegisteredRawMaterialsForToday();
  }, []);
  
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | undefined>(reopenedInvoiceId);

  // Load reopened invoice details if provided
  useEffect(() => {
    if (reopenedInvoiceId) {
      setActiveInvoiceId(reopenedInvoiceId);
      const details = dbService.getInvoiceById(reopenedInvoiceId);
      if (details) {
        const { invoice, items } = details;
        const allProducts = dbService.getProducts();
        const mappedCart: CartItem[] = items.map(item => {
          const product: Product = allProducts.find(p => p.id === item.product_id) || {
            id: item.product_id,
            category_id: 'cat_all',
            name_ar: item.product_name_ar,
            name_en: item.product_name_ar,
            barcode: '',
            selling_price: item.original_price || item.unit_price,
            cost_price: item.cost_price,
            current_stock: 999,
            minimum_stock: 0,
            unit: 'عدد',
            is_favorite: false,
            is_available: true,
            notes: '',
            image: '☕',
            created_at: '',
            updated_at: ''
          };
          return {
            product,
            quantity: item.quantity,
            notes: '',
            kitchen_notes: '',
            custom_price: item.is_price_edited ? item.unit_price : undefined,
            is_price_edited: item.is_price_edited,
            price_edit_reason: item.price_edit_reason,
            item_discount_type: item.item_discount_type,
            item_discount_value: item.item_discount_value,
            item_discount_amount: item.item_discount_amount
          };
        });
        setCart(mappedCart);
        setSelectedCustomer(invoice.customer_id || 'c_general');
        setTableNumber(invoice.table_number || '');
        setInvoiceNotes(invoice.notes || '');
        setPaymentType(invoice.payment_type || 'CASH');
        setPaymentMethod(invoice.payment_method || (invoice.payment_type === 'CREDIT' ? 'CREDIT' : 'CASH'));
        setReferenceNumber(invoice.reference_number || invoice.referenceNumber || '');
        setSenderPhone(invoice.sender_phone || invoice.senderPhone || '');
        setReceiptImageUrl(invoice.receipt_image_url || invoice.receiptImageUrl || '');
        setPaymentNumber(invoice.payment_number || '');
        const totalItemDiscount = items.reduce((acc, it) => acc + (it.item_discount_amount || 0), 0);
        const invoiceLevelDiscount = Math.max(0, invoice.discount - totalItemDiscount);
        setDiscount(invoiceLevelDiscount);
        
        // Calculate and set loaded tax percentage
        const loadedTaxPercentage = invoice.subtotal > 0 ? Math.round((invoice.tax / Math.max(1, invoice.subtotal - invoice.discount)) * 100) : 0;
        setTaxPercentage(loadedTaxPercentage);
        
        onShowSuccessAlert(`تم تحميل الفاتورة المفتوحة رقم ${invoice.invoice_number} للمتابعة والتعديل.`);
      }
    } else {
      setActiveInvoiceId(undefined);
    }
  }, [reopenedInvoiceId]);

  const reloadInvoice = (invId: string) => {
    const details = dbService.getInvoiceById(invId);
    if (details) {
      const { invoice, items } = details;
      const allProducts = dbService.getProducts();
      const mappedCart: CartItem[] = items.map(item => {
        const product: Product = allProducts.find(p => p.id === item.product_id) || {
          id: item.product_id,
          category_id: 'cat_all',
          name_ar: item.product_name_ar,
          name_en: item.product_name_ar,
          barcode: '',
          selling_price: item.original_price || item.unit_price,
          cost_price: item.cost_price,
          current_stock: 999,
          minimum_stock: 0,
          unit: 'عدد',
          is_favorite: false,
          is_available: true,
          notes: '',
          image: '☕',
          created_at: '',
          updated_at: ''
        };
        return {
          product,
          quantity: item.quantity,
          notes: '',
          kitchen_notes: '',
          custom_price: item.is_price_edited ? item.unit_price : undefined,
          is_price_edited: item.is_price_edited,
          price_edit_reason: item.price_edit_reason,
          item_discount_type: item.item_discount_type,
          item_discount_value: item.item_discount_value,
          item_discount_amount: item.item_discount_amount
        };
      });
      setCart(mappedCart);
      setSelectedCustomer(invoice.customer_id || 'c_general');
      setTableNumber(invoice.table_number || '');
      setInvoiceNotes(invoice.notes || '');
      setPaymentType(invoice.payment_type || 'CASH');
      setPaymentMethod(invoice.payment_method || (invoice.payment_type === 'CREDIT' ? 'CREDIT' : 'CASH'));
      setReferenceNumber(invoice.reference_number || invoice.referenceNumber || '');
      setSenderPhone(invoice.sender_phone || invoice.senderPhone || '');
      setReceiptImageUrl(invoice.receipt_image_url || invoice.receiptImageUrl || '');
      setPaymentNumber(invoice.payment_number || '');
      const totalItemDiscount = items.reduce((acc, it) => acc + (it.item_discount_amount || 0), 0);
      const invoiceLevelDiscount = Math.max(0, invoice.discount - totalItemDiscount);
      setDiscount(invoiceLevelDiscount);
      
      // Calculate and set loaded tax percentage
      const loadedTaxPercentage = invoice.subtotal > 0 ? Math.round((invoice.tax / Math.max(1, invoice.subtotal - invoice.discount)) * 100) : 0;
      setTaxPercentage(loadedTaxPercentage);
    } else {
      setCart([]);
      setActiveInvoiceId(undefined);
      setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
    }
  };

  const startItemActionMenu = (index: number) => {
    setActionMenuIndex(index);
    const item = cart[index];
    if (!item) return;
    setEditQty(item.quantity);
    setEditNotes(item.notes || '');
    setEditKitchenNotes(item.kitchen_notes || '');
    setShowMoveTargetList(false);
    setAdminPinInput('');
    setNewPriceVal(String(item.custom_price !== undefined ? item.custom_price : item.product.selling_price));
    setPriceEditError('');
    setShowItemActionMenu(true);
  };
  
  // Advanced Item modification states
  const [userRole, setUserRole] = useState<'Administrator' | 'Manager' | 'Cashier'>('Administrator');
  const [showItemBottomSheet, setShowItemBottomSheet] = useState<boolean>(false);
  const [selectedCartItemIndex, setSelectedCartItemIndex] = useState<number | null>(null);

  const [showPriceEditDialog, setShowPriceEditDialog] = useState<boolean>(false);
  const [newPriceVal, setNewPriceVal] = useState<string>('');
  const [priceEditReasonVal, setPriceEditReasonVal] = useState<string>('');
  const [priceEditIndex, setPriceEditIndex] = useState<number | null>(null);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [priceEditError, setPriceEditError] = useState<string>('');
  const [showItemActionMenu, setShowItemActionMenu] = useState<boolean>(false);
  const [actionMenuIndex, setActionMenuIndex] = useState<number | null>(null);
  const [showMoveTargetList, setShowMoveTargetList] = useState<boolean>(false);

  const [showQtyEditDialog, setShowQtyEditDialog] = useState<boolean>(false);
  const [posMobileTab, setPosMobileTab] = useState<'products' | 'cart'>('products');
  const [newQtyVal, setNewQtyVal] = useState<string>('');

  const [showDiscountDialog, setShowDiscountDialog] = useState<boolean>(false);
  const [discountTypeSel, setDiscountTypeSel] = useState<'percent' | 'fixed'>('percent');
  const [discountValInput, setDiscountValInput] = useState<string>('');

  const [showProductReplaceDialog, setShowProductReplaceDialog] = useState<boolean>(false);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState<string>('');

  const [showRemoveConfirmDialog, setShowRemoveConfirmDialog] = useState<boolean>(false);
  const [deletingCartItem, setDeletingCartItem] = useState<CartItem | null>(null);
  const [cartItemDeletionReason, setCartItemDeletionReason] = useState<string>('');

  const [showPinVerifyDialog, setShowPinVerifyDialog] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinErrorMsg, setPinErrorMsg] = useState<string>('');
  const [pinSuccessAction, setPinSuccessAction] = useState<string>(''); // action key

  // Modals state
  const [showItemNotesModal, setShowItemNotesModal] = useState<boolean>(false);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editKitchenNotes, setEditKitchenNotes] = useState<string>('');
  
  const [showAddCustomerModal, setShowAddCustomerModal] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustAddress, setNewCustAddress] = useState<string>('');
  const [newCustLimit, setNewCustLimit] = useState<number>(5000);

  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [recentInvoice, setRecentInvoice] = useState<Invoice | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  
  // Custom multi-payment support states
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paymentNumber, setPaymentNumber] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [senderPhone, setSenderPhone] = useState<string>('');
  const [receiptImageUrl, setReceiptImageUrl] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState<boolean>(false);
  const [viewReceiptModalUrl, setViewReceiptModalUrl] = useState<string | null>(null);
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  
  // Credit Limit Warning Modal States
  const [showCreditWarningModal, setShowCreditWarningModal] = useState<boolean>(false);
  const [creditWarningPin, setCreditWarningPin] = useState<string>('');
  const [creditWarningError, setCreditWarningError] = useState<string>('');

  // Wallet checkout states
  const [useWallet, setUseWallet] = useState<boolean>(false);
  const [walletDeductionAmount, setWalletDeductionAmount] = useState<number>(0);
  const [showAdvancedPanel, setShowAdvancedPanel] = useState<boolean>(false);

  // Load datasets on startup & subscribe to real-time sync
  useEffect(() => {
    const refreshData = () => {
      setCategories(dbService.getCategories());
      setProducts(dbService.getProducts());
      setCustomers(dbService.getCustomers());
    };

    refreshData();
    window.addEventListener('cafe_db_synced_remote', refreshData);
    window.addEventListener('storage', refreshData);

    // Check for auto-table redirect from Tables Map
    const tableNo = localStorage.getItem('temp_pos_table_number');
    if (tableNo) {
      setTableNumber(tableNo);
      localStorage.removeItem('temp_pos_table_number');
      setTimeout(() => {
        onShowSuccessAlert(`تم تجهيز الكاشير وتثبيت رقم طاولة الخدمة: ${tableNo}`);
      }, 300);
    }

    return () => {
      window.removeEventListener('cafe_db_synced_remote', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  const handleSaveOpenInvoice = async () => {
    if (cart.length === 0) {
      onShowWarningAlert('يرجى إضافة سلع أو مشروبات أولاً لإرسال طلب الفاتورة المفتوحة!');
      return;
    }

    const tableNumberStr = tableNumber ? (tableNumber.includes('طاولة') ? tableNumber : `طاولة ${tableNumber}`) : '';
    const customerObj = customers.find(c => c.id === selectedCustomer);
    const cashierName = currentUser?.name || 'الكاشير';

    try {
      // 1. Save Open Invoice in DB
      const savedOpenRes = dbService.saveOpenInvoice(
        activeInvoiceId,
        cart,
        paymentType,
        selectedCustomer === 'c_general' ? null : selectedCustomer,
        discount,
        taxPercentage,
        0,
        cashierName,
        invoiceNotes,
        tableNumberStr,
        paymentMethod,
        referenceNumber,
        paymentNotes,
        'OPEN',
        senderPhone,
        receiptImageUrl
      );

      onShowSuccessAlert(`تم حفظ الطلب رقم #${savedOpenRes.invoice.invoice_number} كفاتورة مفتوحة 📋!`);

      // 2. Reset cart state for cashier
      setCart([]);
      setDiscount(0);
      setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
      setInvoiceNotes('');
      setTableNumber('');
      setSelectedCustomer('c_general');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setPaymentNotes('');
      setSenderPhone('');
      setReceiptImageUrl('');
      setActiveInvoiceId(undefined);
      if (clearReopenedInvoiceId) {
        clearReopenedInvoiceId();
      }
    } catch (e: any) {
      onShowWarningAlert(`حدث خطأ أثناء حفظ الفاتورة: ${e?.message || e}`);
    }
  };

  const activeDrawer = useMemo(() => dbService.getActiveDrawer(), []);
  const settings = useMemo(() => dbService.getSettings(), []);

  // Filter products by category & search query
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
      const matchSearch =
        p.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery);
      return matchCat && matchSearch && p.is_available && !p.is_raw_material;
    });
  }, [products, selectedCategory, searchQuery]);

  // Favorites Sorted First
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return 0;
    });
  }, [filteredProducts]);

  // Quick Buttons: Items with IDs defined in our seed database
  const quickItems = useMemo(() => {
    const ids = [
      'p_turkish', 'p_tea', 'p_cappuccino', 'p_espresso', 'p_sahlab',
      'p_hot_chocolate', 'p_mango', 'p_strawberry', 'p_banana',
      'p_oreo', 'p_vanilla', 'p_lemon_mint', 'p_sh_apple', 'p_sh_grape', 'p_sh_premium'
    ];
    return products.filter(p => ids.includes(p.id));
  }, [products]);

  // Cart Calculations
  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let totalItemDiscount = 0;
    cart.forEach(item => {
      const price = item.custom_price !== undefined ? item.custom_price : item.product.selling_price;
      subtotal += price * item.quantity;
      if (item.item_discount_amount) {
        totalItemDiscount += item.item_discount_amount;
      }
    });
    const discountAmount = Math.min(subtotal, discount + totalItemDiscount);
    const taxAmount = Math.round((subtotal - discountAmount) * (taxPercentage / 100));
    const total = subtotal - discountAmount + taxAmount;
    return { subtotal, discountAmount, taxAmount, total, totalItemDiscount };
  }, [cart, discount, taxPercentage]);

  // Clock state
  const [time, setTime] = useState(new Date().toLocaleTimeString('ar-EG'));
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('ar-EG'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- POS Actions ---
  const handleAddToCart = (product: Product | string) => {
    const prodObj = typeof product === 'string'
      ? products.find(p => p.id === product)
      : product;

    if (!prodObj) return;

    // Build potential updated cart first to run full batch/recipe validation
    let potentialCart: CartItem[] = [];
    const idx = cart.findIndex(item => item.product.id === prodObj.id);
    if (idx > -1) {
      potentialCart = cart.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item);
    } else {
      potentialCart = [...cart, { product: prodObj, quantity: 1, notes: '', kitchen_notes: '' }];
    }

    const check = dbService.checkInventorySufficiency(potentialCart);
    if (!check.sufficient) {
      onShowWarningAlert(check.message || 'المخزون غير كافٍ، يرجى إضافة دفعة جديدة.');
      return;
    }

    if (idx > -1) {
      const updated = [...cart];
      updated[idx].quantity += 1;
      setCart(updated);
    } else {
      setCart(prev => [...prev, { product: prodObj, quantity: 1, notes: '', kitchen_notes: '' }]);
    }
  };

  const handleDecreaseFromCart = (productId: string) => {
    const idx = cart.findIndex(item => item.product.id === productId);
    if (idx > -1) {
      const updated = [...cart];
      if (updated[idx].quantity > 1) {
        updated[idx].quantity -= 1;
        setCart(updated);
      } else {
        handleInitiateDeleteCartItem(updated[idx]);
      }
    }
  };

  const handleRemoveFromCart = (productId: string) => {
    const item = cart.find(it => it.product.id === productId);
    if (item) {
      handleInitiateDeleteCartItem(item);
    }
  };

  const handleInitiateDeleteCartItem = (item: CartItem) => {
    setDeletingCartItem(item);
    setCartItemDeletionReason('');
  };

  const handleConfirmDeleteCartItem = () => {
    if (!deletingCartItem) return;

    const reasonText = cartItemDeletionReason.trim() ? ` - السبب: ${cartItemDeletionReason.trim()}` : '';
    const details = `حذف صنف من سلة الفاتورة الحالية: ${deletingCartItem.product.name_ar} (الكمية: ${deletingCartItem.quantity})${reasonText}`;
    
    dbService.logAuditAction(
      'DELETE_CART_ITEM',
      details,
      cashierName
    );

    setCart(prev => prev.filter(item => item.product.id !== deletingCartItem.product.id));
    onShowSuccessAlert(`تم حذف الصنف "${deletingCartItem.product.name_ar}" من الفاتورة الحالية.`);
    setDeletingCartItem(null);
  };

  const handleClearOrder = () => {
    setCart([]);
    setDiscount(0);
    setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
    setInvoiceNotes('');
    setSelectedCustomer('c_general');
    setCashReceived('');
    setActiveInvoiceId(undefined);
    if (clearReopenedInvoiceId) {
      clearReopenedInvoiceId();
    }
  };

  const handleOpenItemDetails = (index: number) => {
    setEditingCartItemIndex(index);
    setEditQty(cart[index].quantity);
    setEditNotes(cart[index].notes);
    setEditKitchenNotes(cart[index].kitchen_notes);
    setShowItemNotesModal(true);
  };

  const handleSaveItemDetails = () => {
    if (editingCartItemIndex !== null) {
      const targetProduct = cart[editingCartItemIndex].product;
      if (editQty <= 0) {
        onShowWarningAlert('الكمية يجب أن تكون أكبر من الصفر');
        return;
      }
      
      const potentialCart = cart.map((item, idx) => idx === editingCartItemIndex ? { ...item, quantity: editQty } : item);
      const check = dbService.checkInventorySufficiency(potentialCart);
      if (!check.sufficient) {
        onShowWarningAlert(check.message || 'المخزون غير كافٍ، يرجى إضافة دفعة جديدة.');
        return;
      }
      
      const updated = [...cart];
      updated[editingCartItemIndex] = {
        ...updated[editingCartItemIndex],
        quantity: editQty,
        notes: editNotes,
        kitchen_notes: editKitchenNotes
      };
      setCart(updated);
      setShowItemNotesModal(false);
      setEditingCartItemIndex(null);
    }
  };

  const handleSaveDraft = () => {
    if (cart.length === 0) {
      onShowWarningAlert('لا يوجد منتجات في الفاتورة لحفظها كمسودة!');
      return;
    }
    try {
      const res = dbService.saveOpenInvoice(
        activeInvoiceId,
        cart,
        paymentType,
        selectedCustomer === 'c_general' ? null : selectedCustomer,
        discount,
        taxPercentage,
        0,
        cashierName,
        invoiceNotes,
        tableNumber,
        paymentMethod,
        referenceNumber,
        paymentNotes,
        'DRAFT'
      );

      onShowSuccessAlert(`تم حفظ وتعليق الفاتورة كمسودة بنجاح برقم: ${res.invoice.invoice_number}`);

      // Clear Cart state
      setCart([]);
      setDiscount(0);
      setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
      setInvoiceNotes('');
      setTableNumber('');
      setSelectedCustomer('c_general');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setPaymentNotes('');
      setActiveInvoiceId(undefined);
      if (clearReopenedInvoiceId) {
        clearReopenedInvoiceId();
      }
      setProducts(dbService.getProducts()); // refresh product stock displays
    } catch (err: any) {
      onShowWarningAlert(err.message || 'حدث خطأ أثناء حفظ المسودة!');
    }
  };

  const handleDuplicateOrder = () => {
    if (cart.length === 0) {
      onShowWarningAlert('لا يوجد طلب لتكراره');
      return;
    }
    setCart(prev => [...prev, ...JSON.parse(JSON.stringify(cart))]);
    onShowSuccessAlert('تم تكرار عناصر السلة الحالية مضاعفة!');
  };

  const handleSplitBill = () => {
    if (cart.length === 0) {
      onShowWarningAlert('لا يمكن تقسيم فاتورة فارغة');
      return;
    }
    const splitCount = 2; // Split half
    const halfTotal = Math.round(cartTotals.total / splitCount);
    onShowSuccessAlert(`فاتورة مقسمة بالتساوي على شخصين: كل شخص سيسدد ${halfTotal} ${settings.currency}`);
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName) return;

    const newCust: Customer = {
      id: `cust_${Date.now()}`,
      full_name: newCustName,
      phone: newCustPhone || 'بدون هاتف',
      address: newCustAddress || 'بدون عنوان',
      credit_limit: newCustLimit,
      current_balance: 0,
      notes: 'تم إنشاؤه عبر نافذة المبيعات السريعة',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbService.saveCustomer(newCust);
    setCustomers(dbService.getCustomers());
    setSelectedCustomer(newCust.id);
    setShowAddCustomerModal(false);
    
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    
    onShowSuccessAlert(`تم تسجيل العميل الجديد "${newCustName}" وتعيينه فوراً للفاتورة.`);
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) {
      onShowWarningAlert('يرجى إضافة سلع أولاً لتسجيل عملية الدفع!');
      return;
    }

    if (paymentType === 'CREDIT' && selectedCustomer === 'c_general') {
      onShowWarningAlert('لا يمكن البيع بالآجل (الائتمان) لعميل نقدي عام! يرجى اختيار عميل مسجل أو إضافة عميل جديد.');
      return;
    }

    // Prefill cash received for quick checkout
    setUseWallet(false);
    setWalletDeductionAmount(0);
    setCashReceived(String(cartTotals.total));
    if (!paymentMethod || paymentMethod === 'CASH') {
      if (senderPhone || referenceNumber || receiptImageUrl) {
        setPaymentMethod(paymentNumber === settings.instapay_number ? 'BANK_TRANSFER' : 'VODAFONE_CASH');
      } else {
        setPaymentMethod(paymentType === 'CREDIT' ? 'CREDIT' : 'CASH');
      }
    }
    setShowCheckoutModal(true);
  };

  const handleQuickCashCheckout = () => {
    if (cart.length === 0) {
      onShowWarningAlert('يرجى إضافة سلع أولاً لتسجيل عملية الدفع السريع!');
      return;
    }
    try {
      let res;
      if (activeInvoiceId) {
        res = dbService.closeOpenInvoice(
          activeInvoiceId,
          cart,
          'CASH',
          selectedCustomer === 'c_general' ? null : selectedCustomer,
          discount,
          taxPercentage,
          cartTotals.total,
          cashierName,
          invoiceNotes,
          tableNumber,
          'CASH',
          '',
          '',
          0,
          ''
        );
      } else {
        res = dbService.createInvoice(
          cart,
          'CASH',
          selectedCustomer === 'c_general' ? null : selectedCustomer,
          discount,
          taxPercentage,
          cartTotals.total,
          cashierName,
          invoiceNotes,
          tableNumber,
          'CASH',
          '',
          '',
          0,
          ''
        );
      }

      setRecentInvoice(res.invoice);
      setShowCheckoutModal(false);
      setShowReceiptModal(true);
      onShowSuccessAlert(`تم الدفع النقدي السريع بنجاح! فاتورة رقم: ${res.invoice.invoice_number}`);

      // Clear Cart state
      setCart([]);
      setDiscount(0);
      setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
      setInvoiceNotes('');
      setTableNumber('');
      setSelectedCustomer('c_general');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setPaymentNotes('');
      setActiveInvoiceId(undefined);
      if (clearReopenedInvoiceId) {
        clearReopenedInvoiceId();
      }
      setProducts(dbService.getProducts());
      setCustomers(dbService.getCustomers());
    } catch (e: any) {
      onShowWarningAlert(e.message || 'حدث خطأ أثناء السداد النقدي السريع');
    }
  };

  const handleCompletePayment = () => {
    if (paymentType === 'CREDIT' && selectedCustomer === 'c_general') {
      onShowWarningAlert('لا يمكن البيع بالآجل (الائتمان) لعميل نقدي عام! يرجى اختيار عميل مسجل أو إضافة عميل جديد.');
      return;
    }

    // Validate electronic payment required fields
    if (paymentMethod === 'VODAFONE_CASH' || paymentMethod === 'BANK_TRANSFER') {
      if (!senderPhone || !/^01[0125]\d{8}$/.test(senderPhone.trim())) {
        onShowWarningAlert('يرجى إدخال رقم هاتف محول محلي صحيح مكون من 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015!');
        return;
      }
    }

    // Validate that Vodafone Cash or InstaPay numbers are configured if selected
    if (paymentMethod === 'VODAFONE_CASH' && !settings.vodafone_cash_number) {
      onShowWarningAlert('يرجى تهيئة رقم فودافون كاش أولاً من إعدادات النظام لإتمام عملية الدفع!');
      return;
    }
    if (paymentMethod === 'BANK_TRANSFER' && !settings.instapay_number) {
      onShowWarningAlert('يرجى تهيئة رقم إنستا باي (InstaPay) أولاً من إعدادات النظام لإتمام عملية الدفع!');
      return;
    }

    // Validate Credit Limit
    const cust = customers.find(c => c.id === selectedCustomer);
    if ((paymentType === 'CREDIT' || paymentType === 'SPLIT') && cust && cust.id !== 'c_general') {
      const paidVal = paymentType === 'CREDIT' ? 0 : (parseFloat(cashReceived) || 0);
      const addedDebt = Math.max(0, cartTotals.total - paidVal);
      const expectedBalance = cust.current_balance + addedDebt;
      if (addedDebt > 0 && expectedBalance > cust.credit_limit) {
        setShowCreditWarningModal(true);
        setCreditWarningPin('');
        setCreditWarningError('');
        return;
      }
    }

    completePaymentDirectly();
  };

  const handleConfirmCreditExceeded = () => {
    const settings = dbService.getSettings();
    if (creditWarningPin !== settings.pin_code) {
      setCreditWarningError('رمز الأمان PIN للمسؤول غير صحيح!');
      return;
    }

    setShowCreditWarningModal(false);
    completePaymentDirectly();
  };

  const completePaymentDirectly = () => {
    const walletAmt = useWallet ? walletDeductionAmount : 0;
    const cashAmt = paymentType === 'CASH' ? (cartTotals.total - walletAmt) : (paymentType === 'CREDIT' ? 0 : parseFloat(cashReceived) || 0);
    const paidVal = cashAmt + walletAmt;

    try {
      let res;
      if (activeInvoiceId) {
        res = dbService.closeOpenInvoice(
          activeInvoiceId,
          cart,
          paymentType,
          selectedCustomer === 'c_general' ? null : selectedCustomer,
          discount,
          taxPercentage,
          paidVal,
          cashierName,
          invoiceNotes,
          tableNumber,
          useWallet && cashAmt === 0 ? 'WALLET' : (useWallet ? 'WALLET_SPLIT' : paymentMethod),
          referenceNumber,
          paymentNotes,
          walletAmt,
          paymentNumber,
          senderPhone,
          receiptImageUrl
        );
      } else {
        res = dbService.createInvoice(
          cart,
          paymentType,
          selectedCustomer === 'c_general' ? null : selectedCustomer,
          discount,
          taxPercentage,
          paidVal,
          cashierName,
          invoiceNotes,
          tableNumber,
          useWallet && cashAmt === 0 ? 'WALLET' : (useWallet ? 'WALLET_SPLIT' : paymentMethod),
          referenceNumber,
          paymentNotes,
          walletAmt,
          paymentNumber,
          senderPhone,
          receiptImageUrl
        );
      }

      setRecentInvoice(res.invoice);
      setShowCheckoutModal(false);
      setShowReceiptModal(true);
      onShowSuccessAlert(`تم تسجيل وإغلاق الفاتورة بنجاح برقم: ${res.invoice.invoice_number}`);

      // Clear Cart state
      setCart([]);
      setDiscount(0);
      setTaxPercentage(settings.default_tax_percentage !== undefined ? settings.default_tax_percentage : 0);
      setInvoiceNotes('');
      setTableNumber('');
      setSelectedCustomer('c_general');
      setPaymentMethod('CASH');
      setReferenceNumber('');
      setSenderPhone('');
      setReceiptImageUrl('');
      setPaymentNotes('');
      setActiveInvoiceId(undefined);
      if (clearReopenedInvoiceId) {
        clearReopenedInvoiceId();
      }
      setProducts(dbService.getProducts()); // refresh product stock displays
      setCustomers(dbService.getCustomers()); // refresh customer list and balances
    } catch (e: any) {
      onShowWarningAlert(e.message || 'حدث خطأ غير متوقع أثناء تسجيل الدفع');
    }
  };

  const triggerReprint = (inv: Invoice) => {
    onTriggerReceiptPrint(inv.id);
    onShowSuccessAlert('جاري إرسال الفاتورة الحرارية عبر البلوتوث للطابعة...');
    setShowReceiptModal(false);
  };

  const handleShareInvoiceAsPDFToWhatsApp = async () => {
    if (!recentInvoice) return;
    
    let customerPhone = '';
    let custObj: Customer | null = null;
    
    if (recentInvoice.customer_id) {
      custObj = customers.find(c => c.id === recentInvoice.customer_id) || null;
      if (custObj) {
        customerPhone = custObj.phone || custObj.whatsapp || '';
      }
    }

    try {
      const items = dbService.getInvoiceItems(recentInvoice.id);

      await shareInvoicePDFToWhatsApp({
        invoice: recentInvoice,
        items,
        customer: custObj,
        settings,
        phone: customerPhone,
        onStart: (msg) => onShowSuccessAlert(msg),
        onSuccess: (msg) => onShowSuccessAlert(msg),
        onError: (msg) => onShowWarningAlert(msg),
      });
    } catch (err: any) {
      console.error('Error in handleShareInvoiceAsPDFToWhatsApp:', err);
      onShowWarningAlert(err?.message || 'عفواً، حدث خطأ أثناء معالجة الفاتورة عبر الواتساب');
    }
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4 w-full h-full select-none" dir="rtl">
      
      {/* Top Navigation & Search Bar */}
      <div className="bg-luxury-card border border-luxury-border p-3 rounded-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 shadow-md shrink-0">
        
        {/* Top Navigation Bar: Quick Links for Cashier */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <SyncStatusIndicator />

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open_calculator_modal'))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 rounded-xl text-gold-400 hover:text-white font-bold text-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
            title="فتح الآلة الحاسبة الذكية وحاسبة الكاشير (🧮)"
          >
            <Calculator className="w-3.5 h-3.5 text-gold-500" />
            <span>الآلة الحاسبة 🧮</span>
          </button>

          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 rounded-xl text-gray-300 hover:text-white font-bold text-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
          >
            <Home className="w-3.5 h-3.5 text-gold-500" />
            <span>لوحة التحكم الرئيسية</span>
          </button>

          <button
            onClick={() => onNavigate('invoice-history')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-luxury-bg border border-gray-900 hover:border-gold-600 rounded-xl text-gray-300 hover:text-white font-bold text-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
          >
            <History className="w-3.5 h-3.5 text-blue-500" />
            <span>أرشيف وسجل المبيعات</span>
          </button>
        </div>

        {/* Dynamic barcode/search */}
        <div className="relative w-full md:w-80">
          <input
            id="pos-search-input"
            type="text"
            placeholder="ابحث بالاسم العربي، الباركود أو التصنيف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-10 text-xs focus:outline-none focus:border-gold-600 focus:ring-1 focus:ring-gold-600 text-right font-medium"
          />
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Mobile Tab Toggle Bar (visible only on mobile) */}
      <div className="md:hidden flex gap-2 p-1 bg-[#050505] border border-gold-500/10 rounded-2xl shrink-0">
        <button
          type="button"
          onClick={() => setPosMobileTab('products')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            posMobileTab === 'products'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🍔 المنيو والمنتجات
        </button>
        <button
          type="button"
          onClick={() => setPosMobileTab('cart')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 relative ${
            posMobileTab === 'cart'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🛒 سلة الدفع تفصيلي
          {cart.length > 0 && (
            <span className="absolute -top-1 -left-1 bg-red-600 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Main Workspace split */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        
        {/* RIGHT PANEL: Category navigation list & Product Grid */}
        <div className={`flex-1 min-h-0 flex gap-3 md:gap-4 overflow-hidden ${posMobileTab === 'products' ? 'h-[calc(100vh-310px)] flex' : 'hidden md:flex md:h-full'}`}>
          
          {/* Categories Sidebar (RTL Sidebar is on the right) */}
          <div className="w-20 md:w-32 bg-luxury-card border border-luxury-border rounded-2xl md:rounded-3xl p-1.5 md:p-2 flex flex-col gap-1.5 md:gap-2 overflow-y-auto shrink-0">
            <button
              id="category-tab-all"
              onClick={() => setSelectedCategory('all')}
              className={`py-2.5 md:py-3 px-1 rounded-xl md:rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 md:gap-1.5 border ${
                selectedCategory === 'all'
                  ? 'bg-gold-600/10 border-gold-600 text-gold-500 shadow-md font-bold'
                  : 'bg-transparent border-transparent text-gray-400 hover:text-white hover:bg-gray-900'
              }`}
            >
              <span className="text-lg md:text-xl">✨</span>
              <span className="text-[10px] md:text-xs">الكل</span>
            </button>

            {categories.map(cat => (
              <button
                key={cat.id}
                id={`category-tab-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`py-2.5 md:py-3 px-1 rounded-xl md:rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 md:gap-1.5 border ${
                  selectedCategory === cat.id
                    ? 'bg-gold-600/10 border-gold-600 text-gold-500 shadow-md font-bold'
                    : 'bg-transparent border-transparent text-gray-400 hover:text-white hover:bg-gray-900'
                }`}
              >
                <span className="text-lg md:text-xl">{cat.image}</span>
                <span className="text-[10px] md:text-xs truncate max-w-[60px] md:max-w-[90px]">{cat.name_ar}</span>
              </button>
            ))}
          </div>

          {/* Product grid Workspace */}
          <div className="flex-1 flex flex-col gap-3 md:gap-4 overflow-hidden h-full">
            
            {/* Quick Favorites buttons strip */}
            <div className="bg-luxury-card border border-luxury-border p-2 md:p-3 rounded-xl md:rounded-2xl flex items-center gap-1.5 md:gap-2 overflow-x-auto shrink-0 no-scrollbar">
              <span className="text-[9px] md:text-[10px] font-bold text-gold-500 shrink-0 border-l border-gray-800 pl-2">الطلبات السريعة:</span>
              {quickItems.map(p => (
                <button
                  key={p.id}
                  id={`quick-button-${p.id}`}
                  onClick={() => handleAddToCart(p)}
                  className="px-2.5 py-1 md:px-3.5 md:py-1.5 bg-luxury-bg border border-gray-900 rounded-lg md:rounded-xl text-[11px] md:text-xs font-semibold text-gray-300 hover:border-gold-600 hover:text-white active:scale-95 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <span className="text-[11px] md:text-xs">{p.image}</span>
                  <span>{p.name_ar.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {/* Core Product Cards Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              {sortedProducts.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  لا توجد منتجات مطابقة لخيارات البحث الحالية
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 pb-4">
                  {sortedProducts.map(prod => {
                    const lowStock = prod.current_stock <= prod.minimum_stock;
                    // Calculate a dynamic stock level percentage for the premium stat bar
                    const maxTrackedStock = Math.max(prod.minimum_stock * 3, 20);
                    const stockPercent = Math.min(100, Math.max(5, (prod.current_stock / maxTrackedStock) * 100));

                    const isRecipe = prod.recipe_ingredients && prod.recipe_ingredients.length > 0;
                    const isAvailable = !isRecipe || dbService.checkInventorySufficiency([{ product: prod, quantity: 1, notes: '', kitchen_notes: '' }]).sufficient;

                    return (
                      <div
                        key={prod.id}
                        id={`product-card-${prod.id}`}
                        onClick={() => handleAddToCart(prod)}
                        className="bg-luxury-card border border-luxury-border rounded-xl md:rounded-luxury p-2.5 md:p-4 flex flex-col justify-between h-[130px] md:h-[190px] relative group hover:border-gold-600 hover:shadow-[0_4px_25px_rgba(212,175,55,0.15)] transition-all duration-300 cursor-pointer select-none overflow-hidden"
                      >
                        {/* Favorite Star */}
                        {prod.is_favorite && (
                          <div className="absolute top-2.5 left-2.5 md:top-3 md:left-3 w-4 h-4 md:w-5 md:h-5 bg-gold-600/20 text-gold-500 rounded-full flex items-center justify-center z-10">
                            <Star className="w-2.5 h-2.5 md:w-3 md:h-3 fill-gold-500 text-[#D4AF37]" />
                          </div>
                        )}

                        <div className="flex gap-2 md:gap-3">
                          <div className="w-8 h-8 md:w-11 md:h-11 bg-luxury-bg rounded-lg md:rounded-xl border border-gray-900 flex items-center justify-center text-base md:text-xl shrink-0 shadow-inner">
                            {prod.image}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-[10px] md:text-xs font-extrabold text-white group-hover:text-gold-400 transition-colors line-clamp-2 min-h-[24px] md:min-h-[32px] leading-tight md:leading-snug">
                              {prod.name_ar}
                            </h5>
                            <span className="text-[9px] md:text-[10px] text-gray-500 font-medium block mt-0.5">{prod.unit}</span>
                          </div>
                        </div>

                        <div className="mt-1 md:mt-2 space-y-1 md:space-y-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[9px] md:text-[10px] text-gray-400">السعر:</span>
                            <span className="text-xs md:text-sm font-bold text-[#D4AF37] font-mono gold-glow">
                              {prod.selling_price} <span className="text-[9px] md:text-[10px] text-gold-500">{settings.currency}</span>
                            </span>
                          </div>

                          {/* Immersive UI Stat Bar */}
                          <div className="w-full stat-bar h-1">
                            {isRecipe ? (
                              <div className="stat-fill" style={{ width: '100%', backgroundColor: isAvailable ? '#10b981' : '#ef4444' }} />
                            ) : (
                              <div className="stat-fill" style={{ width: `${stockPercent}%` }} />
                            )}
                          </div>

                          <div className="flex justify-between items-center text-[9px] md:text-[10px]">
                            <span className="text-gray-500">مخزون:</span>
                            {isRecipe ? (
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                                isAvailable
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30'
                                  : 'bg-red-950/40 text-red-500 border border-red-950'
                              }`}>
                                {isAvailable ? 'حسب الطلب' : 'مكونات ناقصة'}
                              </span>
                            ) : (
                              <span className={`font-mono font-bold px-1 py-0.5 rounded text-[9px] ${
                                prod.current_stock === 0
                                  ? 'bg-red-950/40 text-red-500 border border-red-950'
                                  : lowStock
                                  ? 'bg-amber-950/40 text-amber-500 border border-amber-950'
                                  : 'bg-gray-900 text-gray-300'
                              }`}>
                                {prod.current_stock}
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LEFT PANEL: Active Order / Bill Summary Panel */}
        <div className={`w-full md:w-[380px] min-h-0 bg-luxury-card border border-luxury-border rounded-3xl p-4 md:p-5 flex flex-col justify-start md:justify-between shadow-xl shrink-0 overflow-y-auto md:overflow-hidden relative ${posMobileTab === 'cart' ? 'h-[calc(100vh-310px)] pb-32 flex' : 'hidden md:flex md:h-full'}`}>
          
          {/* 1. High-Density Unified POS Header */}
          <div className="border-b border-gray-950 pb-2 shrink-0 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-black text-white">
                  {activeInvoiceId ? `فاتورة #${dbService.getInvoiceById(activeInvoiceId)?.invoice.invoice_number}` : 'طلب جديد'}
                </span>
                {tableNumber && (
                  <span className="px-1.5 py-0.5 bg-gold-600/10 text-gold-500 border border-gold-600/20 text-[9px] font-black rounded-lg">
                    طاولة {tableNumber}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-900/60 px-2 py-0.5 rounded-full border border-gray-900">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} قطع
              </span>
            </div>

            {/* Quick Customer Selection Bar */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 relative">
                <select
                  id="customer-select"
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-900 text-gray-200 text-[11px] py-1.5 pl-3 pr-8 rounded-xl focus:outline-none focus:border-gold-600 text-right font-medium cursor-pointer"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      👤 {c.full_name} {c.id !== 'c_general' ? `(رصيد: ${c.wallet_balance} | مديونية: ${c.current_balance} ${settings.currency})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                id="add-customer-pos-btn"
                onClick={() => setShowAddCustomerModal(true)}
                className="w-8 h-8 bg-luxury-bg border border-gray-900 hover:border-gold-600 text-gold-500 hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="إضافة عميل جديد"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Main Cart items list - maximizes remaining height */}
          <div className="md:flex-1 md:min-h-0 md:overflow-y-auto py-2 space-y-1.5 my-1 pr-1">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-8 md:py-20 gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-luxury-bg border border-gray-900 flex items-center justify-center text-gray-600 text-lg md:text-xl">
                  🛒
                </div>
                <span>قائمة السلة فارغة حالياً.<br />اختر المشروبات والمأكولات لإضافتها.</span>
              </div>
            ) : (
              cart.map((item, index) => {
                let pressTimer: any = null;
                const startPress = () => {
                  pressTimer = setTimeout(() => {
                    startItemActionMenu(index);
                  }, 650);
                };
                const cancelPress = () => {
                  if (pressTimer) clearTimeout(pressTimer);
                };

                return (
                  <div
                    key={item.product.id}
                    id={`cart-item-${item.product.id}`}
                    onMouseDown={startPress}
                    onMouseUp={cancelPress}
                    onMouseLeave={cancelPress}
                    onTouchStart={startPress}
                    onTouchEnd={cancelPress}
                    className="bg-luxury-bg border border-gray-900/60 rounded-xl p-2 flex flex-col gap-1 hover:border-gold-900/30 transition-all duration-150"
                  >
                    <div className="flex justify-between items-start gap-1.5">
                      <div
                        className="flex gap-1.5 cursor-pointer select-none flex-1"
                        onClick={() => {
                          startItemActionMenu(index);
                        }}
                      >
                        <span className="text-xs shrink-0 mt-0.5">{item.product.image}</span>
                        <div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <h6 className="text-[10px] md:text-[11px] font-black text-white line-clamp-1">{item.product.name_ar}</h6>
                            {item.is_price_edited && (
                              <span className="px-1 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] rounded font-extrabold">
                                سعر مخصص
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {item.is_price_edited ? (
                              <>
                                <span className="text-[8px] md:text-[9px] text-amber-400 font-bold font-mono">{(item.custom_price !== undefined ? item.custom_price : item.product.selling_price)} {settings.currency}</span>
                                <span className="text-[8px] md:text-[9px] text-gray-650 line-through font-mono">{item.product.selling_price} {settings.currency}</span>
                              </>
                            ) : (
                              <span className="text-[8px] md:text-[9px] text-gray-500 block">{item.product.selling_price} {settings.currency}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        id={`delete-cart-item-${item.product.id}`}
                        onClick={() => handleRemoveFromCart(item.product.id)}
                        className="text-gray-600 hover:text-red-500 transition-colors p-1 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Notes indicators if any */}
                    {(item.notes || item.kitchen_notes) && (
                      <div className="bg-luxury-card border border-luxury-border/30 px-2 py-0.5 rounded-lg text-[8px] md:text-[9px] text-gray-450 flex flex-col gap-0.5">
                        {item.notes && <p>📌 ملاحظة: <span className="text-white font-medium">{item.notes}</span></p>}
                        {item.kitchen_notes && <p>🍳 مطبخ: <span className="text-gold-400 font-medium">{item.kitchen_notes}</span></p>}
                      </div>
                    )}

                    {/* Quantities trigger bar */}
                    <div className="flex justify-between items-center mt-1 border-t border-gray-900/30 pt-1 shrink-0">
                      <button
                        id={`edit-item-btn-${item.product.id}`}
                        onClick={() => handleOpenItemDetails(index)}
                        className="text-[8px] md:text-[9px] text-gold-500 hover:text-white flex items-center gap-1 cursor-pointer font-bold"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                        تعديل التفاصيل
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          id={`decrease-qty-${item.product.id}`}
                          onClick={() => handleDecreaseFromCart(item.product.id)}
                          className="w-5 h-5 rounded-md bg-luxury-panel border border-gray-800 hover:border-gold-600 text-gray-300 flex items-center justify-center hover:text-white transition-all cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-[11px] md:text-xs font-bold font-mono text-white min-w-4 text-center">{item.quantity}</span>
                        <button
                          id={`increase-qty-${item.product.id}`}
                          onClick={() => handleAddToCart(item.product.id as any)}
                          className="w-5 h-5 rounded-md bg-luxury-panel border border-gray-800 hover:border-gold-600 text-gray-300 flex items-center justify-center hover:text-white transition-all cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      <span className="text-[11px] md:text-xs font-black text-white font-mono">
                        {((item.custom_price !== undefined ? item.custom_price : item.product.selling_price) * item.quantity).toLocaleString()} <span className="text-[9px] md:text-[10px] text-gray-500">{settings.currency}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Kitchen / Barista Notes Input on Main Order Screen */}
          <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl space-y-1.5 shrink-0 my-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-amber-300 flex items-center gap-1">
                <span>🍳 ملاحظات للمطبخ / البارستا:</span>
              </label>
              {invoiceNotes && (
                <button
                  type="button"
                  onClick={() => setInvoiceNotes('')}
                  className="text-[9px] text-amber-400 hover:text-amber-200 cursor-pointer font-bold"
                >
                  مسح
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="مثال: مع كأس ثلج، بدون سكر، كوب سفري..."
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              className="w-full bg-black/80 border border-amber-500/40 text-amber-200 text-xs font-bold rounded-lg py-1.5 px-2.5 focus:outline-none focus:border-amber-400"
            />
            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1">
              {['مع كأس ثلج', 'بدون سكر', 'سكر زيادة', 'كوب سفري', 'بعد الأكل'].map((chip, cIdx) => (
                <button
                  key={cIdx}
                  type="button"
                  onClick={() => {
                    if (!invoiceNotes.trim()) {
                      setInvoiceNotes(chip);
                    } else if (!invoiceNotes.includes(chip)) {
                      setInvoiceNotes(`${invoiceNotes.trim()} - ${chip}`);
                    }
                  }}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 text-amber-300 text-[9px] font-bold rounded-md transition-all cursor-pointer"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Compact Totals Section with Advanced Panel Toggle */}
          <div className="border-t border-gray-950 pt-1.5 shrink-0 space-y-1.5">
            
            {/* Clean, Non-Cluttered Totals Card */}
            <div className="bg-black/40 border border-gray-900 p-2 md:p-3 rounded-xl md:rounded-2xl space-y-1">
              <div className="flex justify-between items-center text-[10px] md:text-[11px] text-gray-400">
                <span>المجموع الفرعي:</span>
                <span className="font-mono font-bold text-xs">{cartTotals.subtotal.toLocaleString()} {settings.currency}</span>
              </div>
              
              {/* Show discount / tax tags only if customized */}
              {(cartTotals.discountAmount > 0 || taxPercentage > 0) && (
                <div className="flex justify-between items-center text-[9px] md:text-[10px] border-t border-gray-900/30 pt-1 text-gray-500">
                  <span>الخصم والضرائب:</span>
                  <div className="flex items-center gap-1.5">
                    {cartTotals.discountAmount > 0 && <span className="text-red-400 font-mono">-{cartTotals.discountAmount.toLocaleString()} {settings.currency}</span>}
                    {taxPercentage > 0 && <span className="text-blue-400 font-mono">+{cartTotals.taxAmount.toLocaleString()} {settings.currency}</span>}
                  </div>
                </div>
              )}

              {/* Mega Final Total display */}
              <div className="flex justify-between items-center border-t border-gray-900/50 pt-1">
                <span className="text-[11px] md:text-xs font-black text-gold-500">الإجمالي النهائي:</span>
                <span className="text-base md:text-lg font-black text-gold-500 font-mono gold-glow">
                  {cartTotals.total.toLocaleString()} <span className="text-[9px] md:text-[10px] text-gold-500">{settings.currency}</span>
                </span>
              </div>

              {/* Advanced Popover Toggle Button */}
              <button
                type="button"
                onClick={() => setShowAdvancedPanel(true)}
                className="w-full mt-1 py-1 px-2 bg-gray-900/80 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-850 hover:border-gray-700 text-[9px] md:text-[10px] font-black rounded-lg md:rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <Settings className="w-3 h-3 text-gold-500 animate-pulse" />
                <span>الخصم، الضريبة والملاحظات ⚙️</span>
                {(discount > 0 || taxPercentage !== 14 || invoiceNotes !== '') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* Core Direct Selling CTAs */}
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  id="pos-save-open-invoice-btn"
                  type="button"
                  onClick={handleSaveOpenInvoice}
                  disabled={cart.length === 0}
                  className={`py-2 px-2 text-[10px] md:text-xs font-black rounded-xl border transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                    cart.length === 0
                      ? 'bg-transparent border-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-amber-950/40 border-amber-500/50 hover:bg-amber-900 text-amber-300 active:scale-[0.98]'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                  <span>فاتورة مفتوحة 📋</span>
                </button>

                <button
                  id="pos-quick-cash-btn"
                  onClick={handleQuickCashCheckout}
                  disabled={cart.length === 0}
                  className={`py-2 px-2 text-[10px] md:text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg cursor-pointer ${
                    cart.length === 0
                      ? 'bg-gray-900/40 text-gray-600 border border-gray-950 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:opacity-90 active:scale-[0.98]'
                  }`}
                >
                  <DollarSign className="w-4 h-4 text-emerald-300 stroke-[2.5]" />
                  <span>سداد كاش ⚡</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  id="pos-checkout-btn"
                  onClick={handleCheckoutClick}
                  disabled={cart.length === 0}
                  className={`py-1.5 md:py-2.5 text-[9px] md:text-xs font-bold rounded-lg md:rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 shadow-md cursor-pointer ${
                    cart.length === 0
                      ? 'bg-gray-900/40 text-gray-500 border border-gray-950 cursor-not-allowed'
                      : 'bg-gradient-to-r from-gold-500 via-gold-600 to-gold-700 text-black hover:opacity-90 active:scale-[0.98]'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5] text-black" />
                  <span>دفع تفصيلي 🧾</span>
                </button>

                <button
                  id="pos-suspend-btn"
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={cart.length === 0}
                  className={`py-1.5 md:py-2.5 text-[9px] md:text-xs font-bold rounded-lg md:rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    cart.length === 0
                      ? 'bg-transparent border-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-amber-950/20 border-amber-600/40 hover:bg-amber-950 text-amber-500 active:scale-[0.98]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>تعليق الفاتورة ⏳</span>
                </button>

                <button
                  id="pos-save-open-btn"
                  onClick={handleSaveOpenInvoice}
                  disabled={cart.length === 0}
                  className={`py-1.5 md:py-2.5 text-[9px] md:text-xs font-bold rounded-lg md:rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                    cart.length === 0
                      ? 'bg-transparent border-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-blue-950/20 border-blue-600/40 hover:bg-blue-950 text-blue-400 active:scale-[0.98]'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                  <span>فاتورة مفتوحة 📋</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. PREMIUM SLIDE-UP ADVANCED DRAWER OVERLAY */}
          {showAdvancedPanel && (
            <div className="absolute inset-0 bg-black/95 z-35 flex flex-col justify-between p-5 animate-slide-up rounded-3xl" dir="rtl">
              <div className="space-y-4 overflow-y-auto max-h-[85%] pr-1">
                
                {/* Drawer Header */}
                <div className="flex justify-between items-center border-b border-gray-900 pb-3">
                  <div className="flex items-center gap-2 text-gold-500">
                    <Settings className="w-4 h-4 animate-spin-slow text-gold-500" />
                    <h4 className="text-xs font-black text-white">إعدادات الفاتورة والتفاصيل المتقدمة</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPanel(false)}
                    className="w-7 h-7 rounded-full bg-gray-900 hover:bg-gray-850 text-gray-400 flex items-center justify-center cursor-pointer font-black text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Customer Detailed Profile (Only when not General Customer) */}
                {selectedCustomer !== 'c_general' && (() => {
                  const cust = customers.find(c => c.id === selectedCustomer);
                  if (!cust) return null;
                  return (
                    <div className="bg-[#101010] border border-gray-900 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          {cust.is_vip && (
                            <span className="px-1.5 py-0.5 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-black rounded-md text-[8px] tracking-wide animate-pulse">
                              ⭐ VIP
                            </span>
                          )}
                          <strong className="text-white text-xs">{cust.full_name}</strong>
                        </div>
                        <span className="text-[9px] text-gray-500">تفاصيل العميل والذمم</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-gray-900/40 pt-2.5">
                        <div className="bg-black/60 border border-gray-950 p-2 rounded-xl flex flex-col justify-center">
                          <span className="text-gray-500 block text-[9px]">رصيد المحفظة:</span>
                          <strong className="text-emerald-400 font-mono font-black mt-0.5 text-xs">{(cust.wallet_balance || 0).toLocaleString()} {settings.currency}</strong>
                        </div>
                        <div className="bg-black/60 border border-gray-950 p-2 rounded-xl flex flex-col justify-center">
                          <span className="text-gray-500 block text-[9px]">المديونية / الحد الائتماني:</span>
                          <strong className="text-rose-400 font-mono font-black mt-0.5 text-xs">{(cust.current_balance || 0).toLocaleString()} / {(cust.credit_limit || 0).toLocaleString()} {settings.currency}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Direct Discount & VAT Inputs */}
                <div className="bg-[#101010] border border-gray-900 rounded-2xl p-3.5 space-y-3">
                  <span className="text-[10px] text-gold-500 font-black block border-b border-gray-900/20 pb-1.5">الخصومات والضرائب</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 block mb-1">الخصم المباشر (ج.م)</label>
                      <input
                        id="discount-input-advanced"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={discount || ''}
                        onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs text-center focus:outline-none focus:border-gold-600 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 block mb-1">ضريبة المبيعات (%)</label>
                      <input
                        id="tax-input-advanced"
                        type="number"
                        min="0"
                        placeholder="14"
                        value={taxPercentage}
                        onChange={(e) => setTaxPercentage(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs text-center focus:outline-none focus:border-gold-600 font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* General Invoice Notes */}
                <div className="bg-[#101010] border border-gray-900 rounded-2xl p-3.5 space-y-2">
                  <label className="text-[10px] text-gray-400 font-bold block">ملاحظات عامة على الفاتورة</label>
                  <input
                    type="text"
                    placeholder="ملاحظات التسليم، رقم كولر، تعليمات الطيار..."
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs text-right focus:outline-none focus:border-gold-600"
                  />
                </div>

                {/* Advanced Quick Actions Grid */}
                <div className="bg-[#101010] border border-gray-900 rounded-2xl p-3.5 space-y-2.5">
                  <span className="text-[10px] text-gray-400 font-bold block">إجراءات الفاتورة والطلبات المعلقة</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { handleDuplicateOrder(); setShowAdvancedPanel(false); }}
                      className="py-2 px-3 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer text-center"
                    >
                      🔁 تكرار الطلب
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleSplitBill(); setShowAdvancedPanel(false); }}
                      className="py-2 px-3 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer text-center"
                    >
                      ⚖️ تقسيم الفاتورة
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleSaveDraft(); setShowAdvancedPanel(false); }}
                      className="py-2 px-3 bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer text-center"
                    >
                      💾 حفظ كمسودة
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleClearOrder(); setShowAdvancedPanel(false); }}
                      className="py-2 px-3 bg-red-950/20 border border-red-900/30 text-red-450 hover:bg-red-950/40 text-[10px] font-bold rounded-xl transition-all cursor-pointer text-center"
                    >
                      🗑️ مسح الفاتورة
                    </button>
                  </div>
                </div>

              </div>

              {/* Apply Button */}
              <button
                type="button"
                onClick={() => setShowAdvancedPanel(false)}
                className="w-full py-3 bg-gold-600 hover:bg-gold-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md border border-gold-400/20 mt-4 shrink-0"
              >
                تطبيق وحفظ الخصومات والتعديلات 💾
              </button>
            </div>
          )}

        </div>

        </div>

      {/* --- CART ITEM DELETE CONFIRMATION MODAL --- */}
      {deletingCartItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
            <button
              id="close-cart-delete-modal"
              onClick={() => setDeletingCartItem(null)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center gap-3 mb-6 pb-4 border-b border-gray-900">
              <span className="text-4xl bg-red-500/10 p-3 rounded-full border border-red-500/30 text-red-500 mb-2">🗑️</span>
              <h3 className="text-base font-bold text-white">تأكيد حذف صنف</h3>
              <p className="text-xs text-gray-400">هل تريد حذف هذا الصنف من الفاتورة؟</p>
            </div>

            <div className="bg-luxury-bg border border-gray-900 rounded-2xl p-4 flex gap-3 mb-5">
              <span className="text-2xl self-center">{deletingCartItem.product.image}</span>
              <div className="text-right">
                <h4 className="text-xs font-bold text-white">{deletingCartItem.product.name_ar}</h4>
                <p className="text-[10px] text-gray-500 mt-1">الكمية الحالية بالسلة: <span className="text-gold-500 font-bold font-mono">{deletingCartItem.quantity}</span></p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-2">سبب الحذف (اختياري):</label>
                <input
                  id="cart-delete-reason-input"
                  type="text"
                  placeholder="مثال: رغبة الزبون، اختيار صنف آخر..."
                  value={cartItemDeletionReason}
                  onChange={(e) => setCartItemDeletionReason(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                id="cart-delete-cancel-btn"
                onClick={() => setDeletingCartItem(null)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold text-xs rounded-xl cursor-pointer transition-all text-center"
              >
                تراجع وإلغاء
              </button>
              <button
                id="cart-delete-confirm-btn"
                onClick={handleConfirmDeleteCartItem}
                className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all text-center shadow-md shadow-red-950/20"
              >
                نعم، احذف الصنف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 1: Add Item Notes / Quantity Edit Modal --- */}
      {showItemNotesModal && editingCartItemIndex !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-md p-6 relative">
            <button
              id="close-item-notes-modal"
              onClick={() => setShowItemNotesModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex gap-3 mb-5 border-b border-gray-900 pb-4">
              <span className="text-2xl">{cart[editingCartItemIndex].product.image}</span>
              <div>
                <h4 className="text-sm font-bold text-white">{cart[editingCartItemIndex].product.name_ar}</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">تعديل مواصفات العنصر الحالي بالسلة</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Quantity manually editable with constraint */}
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-2">تعديل كمية الطلب:</label>
                <div className="flex items-center gap-3">
                  <button
                    id="modal-dec-qty"
                    onClick={() => setEditQty(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-xl bg-luxury-bg border border-gray-800 text-white flex items-center justify-center text-lg font-bold cursor-pointer hover:border-gold-600"
                  >
                    -
                  </button>
                  <input
                    id="modal-qty-input"
                    type="number"
                    min="1"
                    value={editQty}
                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-luxury-bg border border-gray-800 text-white text-center py-2 rounded-xl text-sm font-mono font-bold focus:outline-none focus:border-gold-600"
                  />
                  <button
                    id="modal-inc-qty"
                    onClick={() => setEditQty(prev => prev + 1)}
                    className="w-10 h-10 rounded-xl bg-luxury-bg border border-gray-800 text-white flex items-center justify-center text-lg font-bold cursor-pointer hover:border-gold-600"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">الحد الأقصى المتاح بالمخزن: <span className="text-gold-500 font-bold">{getProductMaxAvailableText(cart[editingCartItemIndex].product)}</span></span>
              </div>

              {/* Customer General Notes */}
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">ملاحظات الزبون (مثل: سكر خفيف، بدون مبيض):</label>
                <input
                  id="modal-notes-input"
                  type="text"
                  placeholder="مثال: سكر زيادة، وسط فاتح..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              {/* Kitchen Notes */}
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">تعليمات المطبخ والتحضير (طباعة منفصلة):</label>
                <input
                  id="modal-kitchen-notes"
                  type="text"
                  placeholder="مثال: تقديم في كاسات طويلة، بارد جداً..."
                  value={editKitchenNotes}
                  onChange={(e) => setEditKitchenNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                id="modal-save-details"
                onClick={handleSaveItemDetails}
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                تحديث وحفظ التعديلات
              </button>
              <button
                id="modal-cancel-details"
                onClick={() => {
                  // Direct delete shortcut
                  handleRemoveFromCart(cart[editingCartItemIndex].product.id);
                  setShowItemNotesModal(false);
                }}
                className="py-3 bg-red-950/20 border border-red-900/50 hover:bg-red-900 text-red-500 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إزالة المادة بالكامل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Add Customer Quick Modal --- */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleAddCustomer} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-md p-6 relative">
            <button
              type="button"
              id="close-add-customer-pos"
              onClick={() => setShowAddCustomerModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-gold-500" />
              تسجيل عميل جديد بالآجل
            </h4>
            <p className="text-gray-400 text-xs mb-5 border-b border-gray-900 pb-4">تسجيل بيانات العميل فوراً لمنحه حساب مبيعات مؤجل بحد ائتماني</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الاسم الثنائي / الثلاثي بالكامل *</label>
                <input
                  id="new-customer-name"
                  type="text"
                  required
                  placeholder="مثال: يوسف ماجد الهواري"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-400 font-bold block">رقم الهاتف المحمول *</label>
                  <ContactPickerButton
                    currentName={newCustName}
                    onSelect={({ phone, name }) => {
                      setNewCustPhone(phone);
                      if (name && !newCustName.trim()) {
                        setNewCustName(name);
                      }
                    }}
                    buttonText="سجل الأسماء"
                  />
                </div>
                <input
                  id="new-customer-phone"
                  type="tel"
                  placeholder="مثال: 01012345678"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">العنوان بالتفصيل</label>
                <input
                  id="new-customer-address"
                  type="text"
                  placeholder="مثال: عمارة رقم 4، التجمع الخامس"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الحد الأقصى للائتمان والديون (ج.م)</label>
                <input
                  id="new-customer-limit"
                  type="number"
                  min="500"
                  value={newCustLimit}
                  onChange={(e) => setNewCustLimit(Math.max(500, parseFloat(e.target.value) || 0))}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                id="submit-customer-pos"
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                حفظ وتسجيل الحساب
              </button>
              <button
                type="button"
                id="cancel-customer-pos"
                onClick={() => setShowAddCustomerModal(false)}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL 3: Checkout and Payment Mode Selector --- */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-md max-h-[85vh] md:max-h-[92vh] overflow-y-auto p-5 md:p-6 relative">
            <button
              id="close-checkout-modal"
              onClick={() => setShowCheckoutModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1">تأكيد طريقة الدفع وإصدار الفاتورة</h4>

            {/* Payment Type Tabs */}
            <div className="bg-luxury-bg border border-gray-950 p-1 rounded-2xl my-3 grid grid-cols-3 gap-1 shadow-inner">
              <button
                type="button"
                id="paytype-cash"
                onClick={() => {
                  setPaymentType('CASH');
                  if (paymentMethod === 'CREDIT') {
                    setPaymentMethod('CASH');
                  }
                  setCashReceived(String(cartTotals.total - walletDeductionAmount));
                }}
                className={`py-2 px-1 rounded-xl text-center font-black text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  paymentType === 'CASH'
                    ? 'bg-gold-600/10 border-gold-600 text-gold-500 shadow-md'
                    : 'bg-luxury-card/50 border-transparent text-gray-500 hover:text-white'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>نقدي (كاش)</span>
              </button>

              <button
                type="button"
                id="paytype-credit"
                onClick={() => {
                  setPaymentType('CREDIT');
                  setPaymentMethod('CREDIT');
                  setCashReceived('0');
                }}
                className={`py-2 px-1 rounded-xl text-center font-black text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  paymentType === 'CREDIT'
                    ? 'bg-amber-600/10 border-amber-600 text-amber-500 shadow-md'
                    : 'bg-luxury-card/50 border-transparent text-gray-500 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>أجل / على الحساب</span>
              </button>

              <button
                type="button"
                id="paytype-split"
                onClick={() => {
                  setPaymentType('SPLIT');
                  if (paymentMethod === 'CREDIT') {
                    setPaymentMethod('CASH');
                  }
                  setCashReceived(String(cartTotals.total - walletDeductionAmount));
                }}
                className={`py-2 px-1 rounded-xl text-center font-black text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  paymentType === 'SPLIT'
                    ? 'bg-purple-600/10 border-purple-600 text-purple-500 shadow-md'
                    : 'bg-luxury-card/50 border-transparent text-gray-500 hover:text-white'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>دفع مركب (مجزأ)</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Wallet Integration Option for Registered Customers */}
              {(() => {
                const cust = customers.find(c => c.id === selectedCustomer);
                if (!cust || selectedCustomer === 'c_general') return null;
                const walletBal = cust.wallet_balance || 0;
                return (
                  <div className="bg-luxury-bg border border-gold-600/30 p-4 rounded-2xl animate-fade-in space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-950/40 border border-gold-600/30 flex items-center justify-center text-gold-500">
                          <Wallet className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-white">رصيد محفظة العميل الملوكية</p>
                          <p className="text-[9px] text-gray-400">العميل: {cust.full_name}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-mono font-bold text-gold-500">{walletBal.toLocaleString()} ج.م</p>
                      </div>
                    </div>

                    {walletBal > 0 ? (
                      <label className="flex items-center gap-2.5 bg-luxury-card/50 hover:bg-luxury-card p-2 rounded-xl border border-gray-900 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={useWallet}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUseWallet(checked);
                            if (checked) {
                              const amt = Math.min(walletBal, cartTotals.total);
                              setWalletDeductionAmount(amt);
                              setCashReceived(String(cartTotals.total - amt));
                            } else {
                              setWalletDeductionAmount(0);
                              setCashReceived(String(cartTotals.total));
                            }
                          }}
                          className="rounded border-gray-800 text-gold-600 focus:ring-gold-600 focus:ring-offset-luxury-bg bg-luxury-bg w-4 h-4 accent-gold-600"
                        />
                        <span className="text-xs font-bold text-gray-300">تفعيل الدفع باستخدام رصيد المحفظة</span>
                      </label>
                    ) : (
                      <div className="text-[10px] text-amber-500/80 bg-amber-950/10 p-2 rounded-xl border border-amber-900/20 text-center font-bold">
                        ⚠️ رصيد المحفظة الحالي 0 ج.م - لا يمكن سداد الفاتورة منها.
                      </div>
                    )}

                    {useWallet && (
                      <div className="bg-gold-950/10 border border-gold-600/20 p-2.5 rounded-xl space-y-1.5 font-medium text-xs">
                        <div className="flex justify-between text-gray-400">
                          <span>الخصم من المحفظة:</span>
                          <span className="font-mono font-bold text-gold-500">-{walletDeductionAmount.toLocaleString()} ج.م</span>
                        </div>
                        <div className="flex justify-between text-white border-t border-gray-900/80 pt-1.5">
                          <span>المتبقي المطلوب سداده:</span>
                          <span className="font-mono font-extrabold text-white">{(cartTotals.total - walletDeductionAmount).toLocaleString()} ج.م</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Conditional Inputs based on mode */}
              {paymentType === 'CASH' && (
                <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl">
                  {cartTotals.total - walletDeductionAmount === 0 ? (
                    <div className="text-center py-2 text-gold-500 font-bold text-xs flex flex-col items-center gap-1.5 bg-gold-950/15 border border-gold-600/20 p-3 rounded-xl">
                      <Check className="w-5 h-5 text-gold-500 animate-bounce" />
                      <span>الفاتورة مدفوعة بالكامل من رصيد المحفظة!</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-[10px] text-gray-400 block mb-1">المبلغ النقدي المستلم من الزبون (ج.م)</span>
                      <input
                        id="checkout-cash-received"
                        type="number"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2.5 px-3 text-lg text-center focus:outline-none focus:border-gold-600 font-mono font-bold"
                      />
                      
                      {/* Giant Quick-Cash Buttons Grid for One-Handed Use */}
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {(() => {
                          const exactAmt = cartTotals.total - walletDeductionAmount;
                          const quickBills = [exactAmt, 50, 100, 200, 500];
                          // Remove duplicates if exact is 50, 100 etc.
                          const uniqueBills = Array.from(new Set(quickBills)).filter(b => b > 0);
                          
                          return uniqueBills.map((bill, bIdx) => (
                            <button
                              key={bIdx}
                              type="button"
                              onClick={() => setCashReceived(String(bill))}
                              className="py-2.5 bg-gray-900 border border-gray-850 hover:border-gold-600 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 text-center font-mono flex flex-col justify-center items-center"
                            >
                              <span className="text-gold-500 font-extrabold">{bill.toLocaleString()}</span>
                              <span className="text-[8px] text-gray-500 font-medium">{bill === exactAmt ? "المطلوب بالضبط" : "جنية"}</span>
                            </button>
                          ));
                        })()}
                      </div>

                      {parseFloat(cashReceived) > (cartTotals.total - walletDeductionAmount) && (
                        <div className="flex justify-between items-center text-xs mt-3 bg-gold-950/20 p-2.5 rounded-xl border border-gold-600/20 text-gold-500 font-bold">
                          <span>الباقي / المرتجع للزبون:</span>
                          <span className="font-mono font-black text-sm">{(parseFloat(cashReceived) - (cartTotals.total - walletDeductionAmount)).toLocaleString()} ج.م</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {paymentType === 'CREDIT' && (
                <div className="bg-amber-950/15 border border-amber-900/30 p-4 rounded-2xl space-y-2">
                  <p className="text-xs text-amber-500 font-bold">⚠️ تنبيه البيع بالآجل:</p>
                  <p className="text-[10px] text-gray-400">
                    سيتم ترحيل المبلغ المتبقي وقدره <span className="text-white font-bold">{(cartTotals.total - walletDeductionAmount).toLocaleString()} ج.م</span> كحساب مدين على العميل: <span className="text-gold-500 font-bold">{(customers.find(c => c.id === selectedCustomer))?.full_name}</span>.
                  </p>
                </div>
              )}

              {paymentType === 'SPLIT' && (
                <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl space-y-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">المبلغ المسدد نقداً الآن (ج.م)</span>
                    <input
                      id="split-cash-paid"
                      type="number"
                      placeholder="0"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-gold-600 font-mono font-bold text-center"
                    />
                  </div>
                  {(cartTotals.total - walletDeductionAmount - (parseFloat(cashReceived) || 0)) > 0 && (
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-800 text-amber-500">
                      <span>المتبقي في ذمة العميل (بالآجل):</span>
                      <span className="font-mono font-bold">{(cartTotals.total - walletDeductionAmount - (parseFloat(cashReceived) || 0)).toLocaleString()} ج.م</span>
                    </div>
                  )}
                </div>
              )}

              {/* Detailed Payment Method for CASH / SPLIT */}
              {(paymentType === 'CASH' || paymentType === 'SPLIT') && (cartTotals.total - walletDeductionAmount > 0) && (
                <div className="bg-luxury-bg border border-gray-950 p-4 rounded-2xl space-y-4">
                  <span className="text-[10px] text-gray-400 block mb-2 font-bold">طريقة الدفع التفصيلية:</span>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Cash Payment */}
                    <button
                      type="button"
                      id="method-cash"
                      onClick={() => {
                        setPaymentMethod('CASH');
                        setPaymentNumber('');
                      }}
                      className={`py-3 px-1 rounded-xl font-bold text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        paymentMethod === 'CASH'
                          ? 'bg-gold-600/10 border-gold-600 text-gold-500 shadow-md'
                          : 'bg-luxury-card border-gray-800 text-gray-400 hover:bg-gray-900'
                      }`}
                    >
                      <Coins className="w-4 h-4 text-gold-500" />
                      <span>نقدي (Cash)</span>
                    </button>

                    {/* Vodafone Cash */}
                    <button
                      type="button"
                      id="method-vodafone"
                      onClick={() => {
                        setPaymentMethod('VODAFONE_CASH');
                        setPaymentNumber(settings.vodafone_cash_number || '');
                      }}
                      className={`py-3 px-1 rounded-xl font-bold text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        paymentMethod === 'VODAFONE_CASH'
                          ? 'bg-red-600/15 border-red-600 text-red-500 shadow-md'
                          : 'bg-luxury-card border-gray-800 text-gray-400 hover:bg-gray-900'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center text-white font-mono text-[8px] font-black leading-none">V</div>
                      <span>فودافون كاش</span>
                    </button>

                    {/* InstaPay */}
                    <button
                      type="button"
                      id="method-instapay"
                      onClick={() => {
                        setPaymentMethod('BANK_TRANSFER');
                        setPaymentNumber(settings.instapay_number || '');
                      }}
                      className={`py-3 px-1 rounded-xl font-bold text-[10px] border transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                        paymentMethod === 'BANK_TRANSFER'
                          ? 'bg-emerald-600/15 border-emerald-600 text-emerald-500 shadow-md'
                          : 'bg-luxury-card border-gray-800 text-gray-400 hover:bg-gray-900'
                      }`}
                    >
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-black font-mono text-[8px] font-black leading-none">⚡</div>
                      <span>إنستا باي (IP)</span>
                    </button>
                  </div>

                  {/* Configured Digital Payments Info Display */}
                  {paymentMethod !== 'CASH' && (
                    <div className="space-y-3">
                      {paymentMethod === 'VODAFONE_CASH' && (
                        <div className="bg-red-950/10 border border-red-900/20 p-4 rounded-2xl animate-scale-in">
                          <div className="flex justify-between items-center text-xs mb-3">
                            <span className="text-gray-400 font-bold">المستلم: <strong className="text-white">فودافون كاش (كافيه الديب)</strong></span>
                            <span className="text-red-500 font-mono font-bold text-sm select-all tracking-wider">{settings.vodafone_cash_number || 'غير مخصص'}</span>
                          </div>
                          
                          {settings.vodafone_cash_number ? (
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(settings.vodafone_cash_number || '');
                                  onShowSuccessAlert('تم نسخ رقم فودافون كاش بنجاح!');
                                }}
                                className="py-2 px-2.5 bg-luxury-card border border-gray-850 hover:bg-gray-900 text-gray-300 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                              >
                                <Copy className="w-3.5 h-3.5 text-red-500" />
                                نسخ الرقم
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextSeq = String(dbService.getInvoices().length + 1).padStart(5, '0');
                                  const nextInvoiceNum = `INV-${new Date().getFullYear()}-${nextSeq}`;
                                  const shareText = `كافيه الديب\nتحويل فودافون كاش\nالرقم: ${settings.vodafone_cash_number}\nالمطلوب: ${cartTotals.total.toLocaleString()} ج.م\nرقم الفاتورة: ${nextInvoiceNum}`;
                                  navigator.clipboard.writeText(shareText);
                                  onShowSuccessAlert('تم نسخ تفاصيل الدفع لمشاركتها بنجاح!');
                                }}
                                className="py-2 px-2.5 bg-luxury-card border border-gray-850 hover:bg-gray-900 text-gray-300 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                              >
                                <Share2 className="w-3.5 h-3.5 text-red-500" />
                                مشاركة التفاصيل
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-red-500 bg-red-950/20 border border-red-900/30 p-2.5 rounded-xl text-center font-bold">
                              ⚠️ تنبيه: رقم فودافون كاش غير مهيأ حالياً في الإعدادات! يرجى إضافته من (الإعدادات ← وسائل الدفع).
                            </div>
                          )}
                        </div>
                      )}

                      {paymentMethod === 'BANK_TRANSFER' && (
                        <div className="bg-emerald-950/10 border border-emerald-900/20 p-4 rounded-2xl animate-scale-in">
                          <div className="flex justify-between items-center text-xs mb-3">
                            <span className="text-gray-400 font-bold">المستلم: <strong className="text-white">إنستا باي (كافيه الديب)</strong></span>
                            <span className="text-emerald-500 font-mono font-bold text-sm select-all tracking-wider">{settings.instapay_number || 'غير مخصص'}</span>
                          </div>

                          {settings.instapay_number ? (
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(settings.instapay_number || '');
                                  onShowSuccessAlert('تم نسخ رقم إنستا باي بنجاح!');
                                }}
                                className="py-2 px-2.5 bg-luxury-card border border-gray-850 hover:bg-gray-900 text-gray-300 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                              >
                                <Copy className="w-3.5 h-3.5 text-emerald-500" />
                                نسخ الرقم
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextSeq = String(dbService.getInvoices().length + 1).padStart(5, '0');
                                  const nextInvoiceNum = `INV-${new Date().getFullYear()}-${nextSeq}`;
                                  const shareText = `كافيه الديب\nتحويل إنستا باي (InstaPay)\nالرقم: ${settings.instapay_number}\nالمطلوب: ${cartTotals.total.toLocaleString()} ج.م\nرقم الفاتورة: ${nextInvoiceNum}`;
                                  navigator.clipboard.writeText(shareText);
                                  onShowSuccessAlert('تم نسخ تفاصيل الدفع لمشاركتها بنجاح!');
                                }}
                                className="py-2 px-2.5 bg-luxury-card border border-gray-850 hover:bg-gray-900 text-gray-300 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                              >
                                <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                                مشاركة التفاصيل
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-500 bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-xl text-center font-bold">
                              ⚠️ تنبيه: رقم إنستا باي (InstaPay) غير مهيأ حالياً في الإعدادات! يرجى إضافته من (الإعدادات ← وسائل الدفع).
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Electronic Payment Specific Fields (Vodafone Cash / InstaPay) */}
                  {(paymentMethod === 'VODAFONE_CASH' || paymentMethod === 'BANK_TRANSFER') && (
                    <div className="space-y-3 pt-3 border-t border-gray-950">
                      {/* Required Sender Phone Number */}
                      <div>
                        <label className="text-[11px] text-amber-400 font-extrabold flex items-center justify-between mb-1">
                          <span>رقم هاتف المحول (Sender Phone Number) <span className="text-red-500">*</span></span>
                          <span className="text-[9px] text-gray-400 font-normal">(11 رقم يبدأ بـ 010, 011, 012, 015)</span>
                        </label>
                        <input
                          id="sender-phone-number"
                          type="tel"
                          maxLength={11}
                          placeholder="010XXXXXXXX"
                          value={senderPhone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setSenderPhone(val);
                          }}
                          className={`w-full bg-luxury-card border text-white rounded-xl py-2 px-3 text-xs focus:outline-none font-bold font-mono text-center tracking-wider transition-colors ${
                            senderPhone && !/^01[0125]\d{8}$/.test(senderPhone)
                              ? 'border-red-500 focus:border-red-400'
                              : 'border-gray-800 focus:border-gold-600'
                          }`}
                        />
                        {senderPhone && !/^01[0125]\d{8}$/.test(senderPhone) && (
                          <p className="text-[9px] text-red-400 font-bold mt-1">⚠️ رقم هاتف محلي غير صحيح (يجب أن يكون 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015)</p>
                        )}
                      </div>

                      {/* Existing Reference Number */}
                      <div>
                        <label className="text-[10px] text-gray-400 font-bold block mb-1">رقم مرجع المعاملة (Reference Number):</label>
                        <input
                          id="payment-ref-number"
                          type="text"
                          placeholder="أدخل رقم العملية للتسوية..."
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold font-mono"
                        />
                      </div>

                      {/* Electronic Transfer Receipt Section */}
                      <div className="bg-luxury-card/60 border border-gray-850 p-3.5 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-gold-400 font-extrabold flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-gold-500" />
                            <span>إيصال التحويل الإلكتروني (Electronic Transfer Receipt)</span>
                          </label>
                          {receiptImageUrl && (
                            <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                              ✓ تم إرفاق الإيصال
                            </span>
                          )}
                        </div>

                        {!receiptImageUrl ? (
                          <div>
                            <label className="w-full py-2.5 px-4 bg-gradient-to-r from-gold-600/20 to-amber-600/20 hover:from-gold-600/30 hover:to-amber-600/30 border border-gold-600/40 text-gold-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98">
                              <Upload className="w-4 h-4 text-gold-500" />
                              <span>{isUploadingReceipt ? 'جاري رفع صورة الإيصال...' : 'إرفاق إيصال التحويل (Attach Receipt)'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploadingReceipt}
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setIsUploadingReceipt(true);
                                    const reader = new FileReader();
                                    reader.onload = async (ev) => {
                                      const base64 = ev.target?.result as string;
                                      if (base64) {
                                        try {
                                          const uploadedUrl = await uploadReceiptImage(base64, `receipt_${paymentMethod.toLowerCase()}`);
                                          setReceiptImageUrl(uploadedUrl);
                                          onShowSuccessAlert('تم تحميل وإرفاق إيصال التحويل بنجاح!');
                                        } catch (err: any) {
                                          onShowWarningAlert('تعذر رفع الصورة، تم الحفظ مؤقتاً.');
                                        }
                                      }
                                      setIsUploadingReceipt(false);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            <p className="text-[9px] text-gray-500 text-center mt-1">يمكن التقاط صورة الإيصال بالكاميرا أو اختيارها من المعرض</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="relative group rounded-xl overflow-hidden border border-gold-600/30 bg-black/50 p-1 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={receiptImageUrl}
                                  alt="Receipt Preview"
                                  className="w-14 h-14 object-cover rounded-lg border border-gray-800 cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setViewReceiptModalUrl(receiptImageUrl)}
                                />
                                <div>
                                  <p className="text-xs font-bold text-white">إيصال تحويل مرفق</p>
                                  <p className="text-[9px] text-gray-400">انقر للرؤية بالحجم الكامل</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 pl-1">
                                <button
                                  type="button"
                                  onClick={() => setViewReceiptModalUrl(receiptImageUrl)}
                                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gold-400 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="عرض الإيصال"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>عرض</span>
                                </button>
                                <label className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer" title="تغيير الصورة">
                                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                                  <span>تغيير</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    disabled={isUploadingReceipt}
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setIsUploadingReceipt(true);
                                        const reader = new FileReader();
                                        reader.onload = async (ev) => {
                                          const base64 = ev.target?.result as string;
                                          if (base64) {
                                            try {
                                              const uploadedUrl = await uploadReceiptImage(base64, `receipt_${paymentMethod.toLowerCase()}`);
                                              setReceiptImageUrl(uploadedUrl);
                                              onShowSuccessAlert('تم استبدال وتحديث إيصال التحويل بنجاح!');
                                            } catch (err: any) {
                                              onShowWarningAlert('تعذر استبدال الصورة حالياً.');
                                            }
                                          }
                                          setIsUploadingReceipt(false);
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptImageUrl('');
                                    onShowSuccessAlert('تم حذف إيصال التحويل المرفق.');
                                  }}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/30 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="حذف الإيصال"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Payment Notes */}
                      <div>
                        <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات الدفع الإلكتروني (Notes):</label>
                        <input
                          id="payment-notes"
                          type="text"
                          placeholder="أية ملاحظات إضافية على التحويل..."
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          className="w-full bg-luxury-card border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Table number and Invoice notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">رقم الطاولة (إن وجد):</label>
                  <input
                    id="checkout-table-number"
                    type="text"
                    placeholder="مثال: طاولة 5، بار..."
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات عامة على الفاتورة:</label>
                  <input
                    id="checkout-invoice-notes"
                    type="text"
                    placeholder="مثال: بدون سكر..."
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                id="pos-confirm-payment"
                onClick={handleCompletePayment}
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md"
              >
                تأكيد الدفع وطباعة الإيصال
              </button>
              <button
                id="pos-cancel-payment"
                onClick={() => setShowCheckoutModal(false)}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                الرجوع لتعديل الطلب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Credit Limit Exceeded Warning --- */}
      {showCreditWarningModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-red-500/50 rounded-3xl w-full max-w-md p-6 relative shadow-2xl shadow-red-950/20 text-right">
            <h4 className="text-base font-bold text-red-500 mb-2 flex items-center gap-2">
              ⚠️ تم تجاوز الحد الائتماني للعميل!
            </h4>
            <p className="text-gray-300 text-xs mb-4 leading-relaxed font-medium">
              تتجاوز هذه المعاملة الحد الائتماني المعتمد لهذا العميل. يرجى إلغاء المعاملة أو إدخال الرمز السري للمسؤول للمتابعة وتجاوز الحد.
            </p>

            {(() => {
              const cust = customers.find(c => c.id === selectedCustomer);
              if (!cust) return null;
              const paidVal = paymentType === 'CREDIT' ? 0 : (parseFloat(cashReceived) || 0);
              const addedDebt = Math.max(0, cartTotals.total - paidVal);
              const expectedBalance = cust.current_balance + addedDebt;
              return (
                <div className="bg-luxury-bg border border-gray-900 rounded-2xl p-4 space-y-2 mb-4 font-medium text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">اسم العميل:</span>
                    <span className="text-white font-bold">{cust.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">الحد الائتماني الحالي:</span>
                    <span className="text-white font-mono">{cust.credit_limit.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">الرصيد المستحق الحالي:</span>
                    <span className="text-white font-mono text-amber-500 font-bold">{cust.current_balance.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">مبلغ الفاتورة (الآجل):</span>
                    <span className="text-white font-mono text-blue-400 font-bold">{addedDebt.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-900 pt-2 text-red-400">
                    <span>الرصيد المتوقع بعد العملية:</span>
                    <span className="font-mono font-extrabold">{expectedBalance.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex justify-between text-red-500 font-bold text-[10px]">
                    <span>مبلغ التجاوز:</span>
                    <span className="font-mono">{(expectedBalance - cust.credit_limit).toLocaleString()} ج.م</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">الرمز السري للمسؤول (PIN Code):</label>
                <input
                  id="credit-warning-pin"
                  type="password"
                  placeholder="••••"
                  value={creditWarningPin}
                  onChange={(e) => {
                    setCreditWarningPin(e.target.value);
                    setCreditWarningError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-base text-center focus:outline-none focus:border-red-500 font-mono font-bold"
                />
                {creditWarningError && (
                  <p className="text-red-500 text-[10px] mt-1 text-center font-bold">{creditWarningError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  id="credit-warning-confirm"
                  onClick={handleConfirmCreditExceeded}
                  className="py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg text-center"
                >
                  تأكيد واستمرار
                </button>
                <button
                  id="credit-warning-cancel"
                  onClick={() => setShowCreditWarningModal(false)}
                  className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                >
                  تراجع وإلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Action Options Menu (Edit Price / Add Notes) */}
      {showItemActionMenu && actionMenuIndex !== null && (() => {
        const item = cart[actionMenuIndex];
        if (!item) return null;
        
        // Fetch other open invoices to enable direct 1-tap item movement
        const otherInvoices = dbService.getInvoices(true).filter(
          inv => inv.invoice_status === 'OPEN' && inv.id !== activeInvoiceId
        );

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in" dir="rtl">
            <div className="bg-[#0c0c0c] border border-gray-900 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-right flex flex-col gap-4 my-auto">
              
              {/* Header */}
              <div className="flex justify-between items-center border-b border-gray-900 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{item.product.image}</span>
                  <div>
                    <h4 className="text-sm font-black text-white">{item.product.name_ar}</h4>
                    <p className="text-[10px] text-gray-500 font-mono">السعر: {item.custom_price !== undefined ? item.custom_price : item.product.selling_price} {settings.currency}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowItemActionMenu(false)}
                  className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-gray-400 flex items-center justify-center cursor-pointer transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Container */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">

                {/* 1- Qty Controls */}
                <div className="bg-luxury-bg border border-gray-950 p-3.5 rounded-2xl">
                  <label className="text-[10px] text-gold-500 font-black block mb-2">تعديل كمية الصنف (Quantity Control)</label>
                  <div className="flex items-center justify-center gap-6">
                    <button
                      type="button"
                      onClick={() => setEditQty(prev => Math.max(1, prev - 1))}
                      className="w-12 h-12 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white text-xl font-black flex items-center justify-center transition-all cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-2xl font-black font-mono text-white min-w-[50px] text-center">{editQty}</span>
                    <button
                      type="button"
                      onClick={() => setEditQty(prev => prev + 1)}
                      className="w-12 h-12 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white text-xl font-black flex items-center justify-center transition-all cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 2- Notes Inputs */}
                <div className="bg-luxury-bg border border-gray-950 p-3.5 rounded-2xl space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">ملاحظات الزبون (مثلا: سكر خفيف)</label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="اكتب ملاحظات الزبون هنا..."
                      className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs text-right focus:outline-none focus:border-gold-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gold-500/80 font-bold block mb-1">تعليمات المطبخ والبار (مثلا: تيك أواي)</label>
                    <input
                      type="text"
                      value={editKitchenNotes}
                      onChange={(e) => setEditKitchenNotes(e.target.value)}
                      placeholder="مثال: وسط، بارد، بدون ثلج..."
                      className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs text-right focus:outline-none focus:border-gold-600"
                    />
                  </div>
                </div>

                {/* 3- Advanced Open Invoice Operations */}
                {activeInvoiceId && (
                  <div className="bg-amber-950/20 border border-amber-900/30 p-3.5 rounded-2xl space-y-3">
                    <label className="text-[10px] text-amber-500 font-black block">إجراءات الفاتورة المعلقة النشطة</label>
                    
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Pay this item only */}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("هل أنت متأكد من سداد هذا الصنف منفرداً كاش؟")) {
                            const item = cart[actionMenuIndex];
                            try {
                              dbService.paySelectedItem(
                                activeInvoiceId,
                                item.product.id,
                                editQty,
                                'CASH',
                                undefined,
                                'أدمن النظام / نادر الديب'
                              );
                              onShowSuccessAlert(`تم سداد الصنف منفرداً كاش بنجاح!`);
                              setShowItemActionMenu(false);
                              reloadInvoice(activeInvoiceId);
                            } catch (err: any) {
                              onShowWarningAlert(err.message || 'فشل السداد المنفرد');
                            }
                          }
                        }}
                        className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        سداد الصنف منفرداً 💵
                      </button>

                      {/* Move item */}
                      <button
                        type="button"
                        onClick={() => setShowMoveTargetList(prev => !prev)}
                        className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[10px] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        نقل الصنف لفاتورة أخرى 🔄
                      </button>
                    </div>

                    {/* 1-Tap Move Invoices Sub-grid */}
                    {showMoveTargetList && (
                      <div className="bg-black/60 border border-gray-900 p-3 rounded-xl space-y-2 mt-2">
                        <span className="text-[9px] text-gray-400 block mb-1 font-bold">اختر الفاتورة المستهدفة للنقل المباشر:</span>
                        {otherInvoices.length === 0 ? (
                          <p className="text-[10px] text-gray-600 text-center py-2">لا توجد فواتير مفتوحة أخرى حالياً لنقل الصنف إليها.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto">
                            {otherInvoices.map(inv => (
                              <button
                                key={inv.id}
                                type="button"
                                onClick={() => {
                                  const item = cart[actionMenuIndex];
                                  try {
                                    dbService.moveItemBetweenInvoices(
                                      activeInvoiceId,
                                      inv.id,
                                      item.product.id,
                                      editQty,
                                      'أدمن النظام / نادر الديب'
                                    );
                                    onShowSuccessAlert(`تم نقل ${editQty} وحدة إلى طاولة/فاتورة ${inv.table_number || inv.invoice_number}`);
                                    setShowItemActionMenu(false);
                                    reloadInvoice(activeInvoiceId);
                                  } catch (err: any) {
                                    onShowWarningAlert(err.message || 'فشل نقل الصنف');
                                  }
                                }}
                                className="w-full py-2 px-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white rounded-lg text-[10px] text-right font-bold transition-all cursor-pointer flex justify-between items-center"
                              >
                                <span>طاولة/مكان: {inv.table_number || 'كاونتر خارجي'}</span>
                                <span className="font-mono text-[9px] text-gray-500">#{inv.invoice_number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 4- Manager Custom Price with PIN Authorization */}
                <div className="bg-luxury-bg border border-gray-950 p-3.5 rounded-2xl space-y-2.5">
                  <label className="text-[10px] text-gray-400 font-bold block">تعديل سعر الوحدة (خاص بالمدير والمسؤول)</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[9px] text-gray-500 block mb-1">السعر الجديد المقترح</span>
                      <input
                        type="number"
                        value={newPriceVal}
                        onChange={(e) => setNewPriceVal(e.target.value)}
                        className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 block mb-1">رمز الأمان للمدير (Manager PIN)</span>
                      <input
                        type="password"
                        value={adminPinInput}
                        onChange={(e) => setAdminPinInput(e.target.value)}
                        placeholder="••••"
                        className="w-full bg-black/40 border border-gray-900 text-white rounded-xl py-2 px-3 text-xs font-mono font-bold text-center focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                  {priceEditError && <p className="text-[10px] text-rose-500 font-bold">{priceEditError}</p>}
                  <button
                    type="button"
                    onClick={() => {
                      if (adminPinInput !== settings.pin_code) {
                        setPriceEditError('رمز الأمان PIN غير صحيح!');
                        return;
                      }
                      const updatedCart = [...cart];
                      const currentItem = updatedCart[actionMenuIndex];
                      if (currentItem) {
                        currentItem.custom_price = parseFloat(newPriceVal);
                        currentItem.is_price_edited = true;
                        currentItem.price_edit_reason = 'تعديل سريع من لوحة التحكم بمسؤولية المدير';
                        setCart(updatedCart);
                        
                        if (activeInvoiceId) {
                          try {
                            dbService.saveOpenInvoice(
                              activeInvoiceId,
                              updatedCart,
                              paymentType,
                              selectedCustomer === 'c_general' ? null : selectedCustomer,
                              discount,
                              taxPercentage,
                              0,
                              'أدمن النظام / نادر الديب',
                              invoiceNotes,
                              tableNumber
                            );
                          } catch (err: any) {
                            onShowWarningAlert(err.message || 'فشل تحديث السعر في الفاتورة المعلقة');
                          }
                        }
                        onShowSuccessAlert('تم تحديث السعر المخصص بنجاح!');
                        setPriceEditError('');
                      }
                    }}
                    className="w-full py-2 bg-gradient-to-r from-red-800 to-amber-700 hover:opacity-90 text-white font-black text-[10px] rounded-xl transition-all cursor-pointer shadow-md"
                  >
                    تطبيق واعتماد السعر الجديد 🔑
                  </button>
                </div>

              </div>

              {/* Bottom Buttons Row */}
              <div className="flex gap-2.5 border-t border-gray-900 pt-3">
                {/* Save Note & Qty */}
                <button
                  type="button"
                  onClick={() => {
                    const updatedCart = [...cart];
                    const currentItem = updatedCart[actionMenuIndex];
                    if (currentItem) {
                      const potentialCart = updatedCart.map((item, idx) => idx === actionMenuIndex ? { ...item, quantity: editQty } : item);
                      const check = dbService.checkInventorySufficiency(potentialCart);
                      if (!check.sufficient) {
                        onShowWarningAlert(check.message || 'المخزون غير كافٍ، يرجى إضافة دفعة جديدة.');
                        return;
                      }

                      currentItem.quantity = editQty;
                      currentItem.notes = editNotes;
                      currentItem.kitchen_notes = editKitchenNotes;
                      setCart(updatedCart);
                      
                      if (activeInvoiceId) {
                        try {
                          dbService.saveOpenInvoice(
                            activeInvoiceId,
                            updatedCart,
                            paymentType,
                            selectedCustomer === 'c_general' ? null : selectedCustomer,
                            discount,
                            taxPercentage,
                            0,
                            'أدمن النظام / نادر الديب',
                            invoiceNotes,
                            tableNumber
                          );
                          onShowSuccessAlert('تم حفظ تعديلات الفاتورة المعلقة بنجاح!');
                        } catch (err: any) {
                          onShowWarningAlert(err.message || 'فشل تحديث الفاتورة');
                        }
                      } else {
                        onShowSuccessAlert('تم حفظ تفاصيل الصنف بالسلة.');
                      }
                    }
                    setShowItemActionMenu(false);
                  }}
                  className="flex-1 py-3 bg-gold-600 hover:bg-gold-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md"
                >
                  <CheckSquare className="w-4 h-4" />
                  حفظ التعديلات السريعة 💾
                </button>

                {/* Direct Delete */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("هل أنت متأكد من رغبتك في حذف وإزالة هذا الصنف تماماً؟")) {
                      const updatedCart = cart.filter((_, idx) => idx !== actionMenuIndex);
                      setCart(updatedCart);
                      
                      if (activeInvoiceId) {
                        try {
                          dbService.saveOpenInvoice(
                            activeInvoiceId,
                            updatedCart,
                            paymentType,
                            selectedCustomer === 'c_general' ? null : selectedCustomer,
                            discount,
                            taxPercentage,
                            0,
                            'أدمن النظام / نادر الديب',
                            invoiceNotes,
                            tableNumber
                          );
                          onShowSuccessAlert('تم حذف الصنف وتحديث الفاتورة المعلقة!');
                        } catch (err: any) {
                          onShowWarningAlert(err.message || 'فشل تحديث الفاتورة');
                        }
                      } else {
                        onShowSuccessAlert('تم إزالة الصنف من السلة.');
                      }
                      setShowItemActionMenu(false);
                    }
                  }}
                  className="py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف الصنف 🗑️
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Edit Price Modal (Admin Authenticated) */}
      {showPriceEditDialog && priceEditIndex !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-scale-in" dir="rtl">
          <div className="w-full max-w-sm bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right">
            
            <h3 className="text-base font-bold text-gold-500 mb-4 flex items-center gap-2 border-b border-gray-900 pb-2">
              <Tags className="w-5 h-5 text-gold-500" />
              تعديل سعر المشروب / الوجبة
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-500 font-bold block mb-1">اسم المنتج</label>
                <div className="w-full bg-luxury-bg border border-gray-950 text-white rounded-xl py-2 px-3 text-xs font-bold font-sans">
                  {cart[priceEditIndex]?.product.name_ar}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-bold block mb-1">السعر الأصلي (غير قابل للتعديل)</label>
                <div className="w-full bg-luxury-bg border border-gray-950 text-gray-400 rounded-xl py-2 px-3 text-xs font-mono font-bold">
                  {cart[priceEditIndex]?.product.selling_price} {settings.currency}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gold-500 font-bold block mb-1">السعر الجديد المقترح للفاتورة الحالية فقط *</label>
                <input
                  id="edit-price-new-value"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={newPriceVal}
                  onChange={(e) => {
                    setNewPriceVal(e.target.value);
                    setPriceEditError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-gold-600 font-mono font-bold text-center"
                />
              </div>

              <div>
                <label className="text-[10px] text-red-400 font-bold block mb-1">رمز التحقق للمسؤول (Admin PIN) للترخيص *</label>
                <input
                  id="edit-price-admin-pin"
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={adminPinInput}
                  onChange={(e) => {
                    setAdminPinInput(e.target.value);
                    setPriceEditError('');
                  }}
                  className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-gold-600 font-mono font-bold text-center tracking-widest text-right"
                />
              </div>

              {priceEditError && (
                <p className="text-red-500 text-[10px] font-bold text-center mt-1">
                  ⚠️ {priceEditError}
                </p>
              )}

              <div className="flex gap-3 justify-end border-t border-gray-900 pt-4 mt-2">
                <button
                  id="cancel-edit-price-btn"
                  type="button"
                  onClick={() => {
                    setShowPriceEditDialog(false);
                    setPriceEditIndex(null);
                  }}
                  className="px-4 py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex-1 text-center"
                >
                  إلغاء (Cancel)
                </button>
                <button
                  id="save-edit-price-btn"
                  type="button"
                  onClick={() => {
                    const parsedPrice = parseFloat(newPriceVal);
                    if (isNaN(parsedPrice) || parsedPrice < 0) {
                      setPriceEditError('يرجى إدخال سعر صحيح أكبر من أو يساوي الصفر');
                      return;
                    }

                    if (adminPinInput !== settings.pin_code) {
                      setPriceEditError('رمز الأمان PIN للمسؤول غير صحيح! لا يمكن تعديل السعر إلا من خلال المسؤول.');
                      return;
                    }

                    // Save the custom price to this cart item
                    const updatedCart = [...cart];
                    updatedCart[priceEditIndex] = {
                      ...updatedCart[priceEditIndex],
                      custom_price: parsedPrice,
                      is_price_edited: true,
                      price_edit_reason: 'تعديل يدوي مصرح من المسؤول'
                    };
                    setCart(updatedCart);
                    
                    onShowSuccessAlert(`تم تعديل سعر المنتج "${cart[priceEditIndex].product.name_ar}" إلى ${parsedPrice} ${settings.currency} لهذه الفاتورة بنجاح.`);
                    setShowPriceEditDialog(false);
                    setPriceEditIndex(null);
                  }}
                  className="px-5 py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl text-xs cursor-pointer transition-all flex-1 text-center"
                >
                  حفظ (Save)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- MODAL 4: High fidelity Receipt Printer Preview modal --- */}
      {showReceiptModal && recentInvoice && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              id="close-receipt-modal"
              onClick={() => setShowReceiptModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1 flex items-center gap-1.5 justify-center">
              <Printer className="w-5 h-5 text-gold-500" />
              إيصال الكافية الفاخر جاهز
            </h4>
            <p className="text-gray-400 text-xs text-center mb-4">معاينة واقعية لإيصال طابعة بكرة {settings.printer_paper_size} ملم</p>

            {/* Receipt Inner Styled Box */}
            <div id="receipt-print-area" className="bg-white text-black p-4 rounded-xl font-mono text-xs shadow-inner leading-relaxed select-text flex flex-col items-center">
              
              {/* Branding header */}
              <div className="text-center w-full border-b border-dashed border-gray-400 pb-3 flex flex-col items-center">
                <div className="mb-1.5 flex justify-center">
                  <EldeebLogoFull className="w-[220px] sm:w-[250px]" showSubtext={true} />
                </div>
                <p className="text-[10px] text-gray-600 mt-0.5">{settings.address}</p>
                <p className="text-[10px] text-gray-600">الهاتف: {settings.phone}</p>
              </div>

              {/* Invoice details */}
              <div className="w-full text-right border-b border-dashed border-gray-400 py-2 space-y-1 text-[10px]">
                <p>رقم الفاتورة: <span className="font-bold">{recentInvoice.invoice_number}</span></p>
                <p>التاريخ: {new Date(recentInvoice.invoice_date).toLocaleDateString('ar-EG')} - {new Date(recentInvoice.invoice_date).toLocaleTimeString('ar-EG')}</p>
                <p>الكاشير: {recentInvoice.cashier_name}</p>
                <p>طريقة الدفع: <span className="font-bold text-black">{getPaymentMethodLabel(recentInvoice)}</span></p>
                {recentInvoice.payment_method === 'VODAFONE_CASH' && (
                  <p className="font-bold text-red-700">الحساب: فودافون كاش ({recentInvoice.payment_number || settings.vodafone_cash_number})</p>
                )}
                {recentInvoice.payment_method === 'BANK_TRANSFER' && (
                  <p className="font-bold text-emerald-700">الحساب: إنستا باي ({recentInvoice.payment_number || settings.instapay_number})</p>
                )}
                {(recentInvoice.sender_phone || recentInvoice.senderPhone) && (
                  <p className="font-bold text-black">رقم المحول: <span className="font-mono dir-ltr">{recentInvoice.sender_phone || recentInvoice.senderPhone}</span></p>
                )}
                {(recentInvoice.reference_number || recentInvoice.referenceNumber) && (
                  <p className="font-bold text-gray-800">رقم المرجع: <span className="font-mono">{recentInvoice.reference_number || recentInvoice.referenceNumber}</span></p>
                )}
                {(recentInvoice.receipt_image_url || recentInvoice.receiptImageUrl) && (
                  <div className="pt-1.5 flex items-center justify-between bg-gray-100 p-1.5 rounded-lg border border-gray-300 my-1">
                    <div className="flex items-center gap-2">
                      <img
                        src={recentInvoice.receipt_image_url || recentInvoice.receiptImageUrl}
                        alt="Receipt Thumbnail"
                        className="w-10 h-10 object-cover rounded border border-gray-400 cursor-pointer"
                        onClick={() => setViewReceiptModalUrl(recentInvoice.receipt_image_url || recentInvoice.receiptImageUrl || null)}
                      />
                      <span className="text-[9px] font-bold text-gray-700">إيصال تحويل مرفق</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewReceiptModalUrl(recentInvoice.receipt_image_url || recentInvoice.receiptImageUrl || null)}
                      className="px-2 py-1 bg-black text-gold-400 rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>عرض الإيصال</span>
                    </button>
                  </div>
                )}
                {recentInvoice.customer_id && (
                  <p>العميل: {(customers.find(c => c.id === recentInvoice.customer_id))?.full_name}</p>
                )}
              </div>

              {/* Items Table */}
              <div className="w-full py-2 border-b border-dashed border-gray-400 text-[10px]">
                <div className="flex justify-between font-bold pb-1 text-gray-800">
                  <span className="w-1/2 text-right">البيان</span>
                  <span className="w-1/6 text-center">الكمية</span>
                  <span className="w-1/3 text-left">الإجمالي</span>
                </div>
                
                {dbService.getInvoiceItems(recentInvoice.id).map(item => (
                  <div key={item.id} className="flex justify-between py-0.5 text-gray-800">
                    <span className="w-1/2 text-right truncate">{item.product_name_ar}</span>
                    <span className="w-1/6 text-center font-bold">{item.quantity}</span>
                    <span className="w-1/3 text-left font-bold">{item.total_price} ج.م</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="w-full py-2 space-y-1 text-[10px] border-b border-dashed border-gray-400 font-bold">
                <div className="flex justify-between text-gray-700">
                  <span>المجموع الفرعي:</span>
                  <span>{recentInvoice.subtotal} ج.م</span>
                </div>
                {recentInvoice.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>الخصم المباشر:</span>
                    <span>-{recentInvoice.discount} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-700">
                  <span>ضريبة القيمة المضافة:</span>
                  <span>{recentInvoice.tax} ج.م</span>
                </div>
                <div className="flex justify-between text-black text-xs font-black pt-1.5 border-t border-dotted border-gray-300">
                  <span>الإجمالي الكلي:</span>
                  <span>{recentInvoice.total} ج.م</span>
                </div>
              </div>

              {/* Footer thank you and Barcode simulation */}
              <div className="text-center w-full pt-3 space-y-1.5 text-[9px] text-gray-600">
                <p className="font-bold">{settings.receipt_footer}</p>
                
                {/* Simulated QR Code for digital invoices */}
                <div className="w-16 h-16 bg-gray-200 border border-gray-300 mx-auto rounded-md flex items-center justify-center font-bold text-gray-700 text-[8px]">
                  [QR CODE]
                </div>
                
                <p className="font-bold tracking-widest font-mono text-gray-500 text-[8px]">{recentInvoice.invoice_number}</p>
              </div>

            </div>

            <button
              id="share-whatsapp-pdf"
              onClick={handleShareInvoiceAsPDFToWhatsApp}
              className="w-full mt-5 py-3.5 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Share2 className="w-4 h-4 text-white" />
              إرسال الفاتورة عبر واتساب 📱
            </button>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                id="print-bluetooth-confirm"
                onClick={() => triggerReprint(recentInvoice)}
                className="py-3 bg-gradient-to-r from-gold-500 to-gold-600 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                طابعة البلوتوث XP
              </button>
              <button
                id="close-receipt-done"
                onClick={() => setShowReceiptModal(false)}
                className="py-3 bg-luxury-bg border border-gray-800 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer hover:bg-gray-900"
              >
                إغلاق وفتح طلب جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable Floating Action Button (FAB) for Open Invoices */}
      <button
        id="pos-floating-open-invoices-btn"
        onMouseDown={(e) => {
          if (e.button !== 0) return; // Only left click
          handleFabStart(e.clientX, e.clientY, e.currentTarget);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 0) return;
          handleFabStart(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
        }}
        style={
          isFabDragging
            ? {
                position: 'fixed',
                left: fabPos.x !== null ? `${fabPos.x}px` : '16px',
                top: fabPos.y !== null ? `${fabPos.y}px` : '75%',
                right: 'auto',
                bottom: 'auto',
                transform: 'none',
                transition: 'none',
                zIndex: 9999,
                touchAction: 'none'
              }
            : {
                position: 'fixed',
                left: fabPos.side === 'left' ? '16px' : 'auto',
                right: fabPos.side === 'right' ? '16px' : 'auto',
                top: `${fabPos.yPercent}%`,
                transform: 'translateY(-50%)',
                transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                zIndex: 9999,
                touchAction: 'none'
              }
        }
        className={`w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br from-gold-400 via-amber-500 to-amber-600 border border-yellow-300/40 shadow-[0_4px_20px_rgba(212,175,55,0.4)] hover:shadow-[0_8px_30px_rgba(212,175,55,0.6)] cursor-grab active:cursor-grabbing select-none hover:scale-105 active:scale-95 ${
          isFabDragging ? 'scale-110 rotate-12 cursor-grabbing shadow-[0_12px_35px_rgba(212,175,55,0.7)]' : ''
        }`}
        title="📂 الفواتير المفتوحة والمعلقة"
      >
        <ClipboardList className="w-6 h-6 text-black stroke-[2.2]" />
        
        {/* Badge with count of open invoices */}
        {dbService.getOpenInvoices().length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white border-2 border-black rounded-full text-[10px] font-black font-mono w-6 h-6 flex items-center justify-center shadow-lg">
            {dbService.getOpenInvoices().length}
          </span>
        )}
      </button>

      {/* --- Full Screen Electronic Transfer Receipt Viewer Modal --- */}
      {viewReceiptModalUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setViewReceiptModalUrl(null)}
          dir="rtl"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center bg-luxury-card border border-gold-600/30 rounded-3xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold-500" />
                <h3 className="text-sm font-bold text-white">إيصال التحويل الإلكتروني - معاينة كاملة</h3>
              </div>
              <button
                onClick={() => setViewReceiptModalUrl(null)}
                className="p-1.5 bg-gray-800 hover:bg-red-600 text-gray-300 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full overflow-auto max-h-[75vh] flex items-center justify-center rounded-2xl bg-black/80 p-2">
              <img
                src={viewReceiptModalUrl}
                alt="Full Size Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg"
              />
            </div>
            <div className="w-full flex items-center justify-between pt-3 mt-3 border-t border-gray-800">
              <a
                href={viewReceiptModalUrl}
                download="electronic_receipt.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-4 bg-luxury-card border border-gold-600/40 hover:bg-gray-800 text-gold-400 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                تحميل صورة الإيصال
              </a>
              <button
                onClick={() => setViewReceiptModalUrl(null)}
                className="py-2 px-6 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

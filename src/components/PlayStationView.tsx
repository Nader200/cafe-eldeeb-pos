/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Gamepad2,
  Clock,
  Play,
  Pause,
  StopCircle,
  PlusCircle,
  Trash2,
  Edit,
  Coins,
  History,
  MoveRight,
  TrendingUp,
  FileText,
  User,
  Coffee,
  CheckCircle,
  HelpCircle,
  Smartphone,
  ChevronRight,
  Sparkles,
  XCircle,
  Search,
  Minus,
  ShoppingCart
} from 'lucide-react';
import { dbService } from '../dbService';
import { PSDevice, PSSession, Customer, Category, Product, CartItem } from '../types';

interface PlayStationViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function PlayStationView({ onShowSuccessAlert, onShowWarningAlert }: PlayStationViewProps) {
  const [devices, setDevices] = useState<PSDevice[]>([]);
  const [sessions, setSessions] = useState<PSSession[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // View states
  const [activeSubTab, setActiveSubTab] = useState<'devices' | 'sessions' | 'reports'>('devices');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Modal control
  const [showDeviceModal, setShowDeviceModal] = useState<boolean>(false);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStopModal, setShowStopModal] = useState<boolean>(false);
  const [showMoveModal, setShowMoveModal] = useState<boolean>(false);
  const [showExtendModal, setShowExtendModal] = useState<boolean>(false);

  // Device Form States
  const [editingDevice, setEditingDevice] = useState<PSDevice | null>(null);
  const [devName, setDevName] = useState<string>('');
  const [devPriceSingle, setDevPriceSingle] = useState<number>(40);
  const [devPriceMulti, setDevPriceMulti] = useState<number>(60);

  // Active session parameters
  const [selectedDevice, setSelectedDevice] = useState<PSDevice | null>(null);
  const [sessionType, setSessionType] = useState<'SINGLE' | 'MULTI'>('SINGLE');
  const [isLimited, setIsLimited] = useState<boolean>(false);
  const [limitedMinutes, setLimitedMinutes] = useState<number>(60);
  const [sessionNotes, setSessionNotes] = useState<string>('');

  // Stop / Billing parameters
  const [billingSession, setBillingSession] = useState<PSSession | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [billingNotes, setBillingNotes] = useState<string>('');

  // Move parameters
  const [targetDeviceId, setTargetDeviceId] = useState<string>('');

  // Extend parameters
  const [extendMinutes, setExtendMinutes] = useState<number>(30);

  // Deletion states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deviceToDelete, setDeviceToDelete] = useState<PSDevice | null>(null);

  // PlayStation session products state
  const [showPSProductsModal, setShowPSProductsModal] = useState<boolean>(false);
  const [selectedDeviceForProd, setSelectedDeviceForProd] = useState<PSDevice | null>(null);
  const [psProductsCart, setPsProductsCart] = useState<{ product: Product; quantity: number; discount_amount?: number }[]>([]);
  const [psProductSearch, setPsProductSearch] = useState<string>('');
  const [selectedPSCategory, setSelectedPSCategory] = useState<string>('ALL');

  const [psProducts, setPsProducts] = useState<Product[]>([]);
  const [psCategories, setPsCategories] = useState<Category[]>([]);

  const [psMobileTab, setPsMobileTab] = useState<'products' | 'cart'>('products');

  useEffect(() => {
    if (showPSProductsModal) {
      setPsProducts(dbService.getProducts().filter(p => !p.is_raw_material));
      setPsCategories(dbService.getCategories());
      setPsMobileTab('products');
    }
  }, [showPSProductsModal]);

  const filteredPSProducts = useMemo(() => {
    return psProducts.filter(p => {
      const matchSearch = p.name_ar.toLowerCase().includes(psProductSearch.toLowerCase()) || 
                          (p.name_en && p.name_en.toLowerCase().includes(psProductSearch.toLowerCase()));
      const matchCategory = selectedPSCategory === 'ALL' || p.category_id === selectedPSCategory;
      return matchSearch && matchCategory;
    });
  }, [psProducts, psProductSearch, selectedPSCategory]);

  const handleOpenAddProductsToSession = (dev: PSDevice) => {
    if (!dev.current_session_id) return;
    
    const sessList = dbService.getPSSessions();
    const activeSess = sessList.find(s => s.id === dev.current_session_id);
    if (!activeSess) return;

    setSelectedDeviceForProd(dev);
    
    // Load existing items from active session
    const allDBProducts = dbService.getProducts();
    const initialCart = (activeSess.products || []).map(p => {
      const foundProd = allDBProducts.find(prod => prod.id === p.product_id);
      
      const productObj: Product = foundProd ? {
        ...foundProd,
        selling_price: p.selling_price // Use the saved selling price
      } : {
        id: p.product_id,
        category_id: '',
        name_ar: p.product_name_ar,
        name_en: '',
        barcode: '',
        image: '',
        selling_price: p.selling_price,
        cost_price: 0,
        current_stock: 99999,
        minimum_stock: 0,
        unit: 'عدد',
        is_favorite: false,
        is_available: true,
        notes: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_raw_material: false
      };

      return {
        product: productObj,
        quantity: p.quantity,
        discount_amount: p.discount_amount || 0
      };
    });

    setPsProductsCart(initialCart);
    setPsProductSearch('');
    setSelectedPSCategory('ALL');
    setShowPSProductsModal(true);
  };

  const handleAddToPSProductsCart = (product: Product) => {
    setPsProductsCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        const discountAmt = existing.discount_amount || 0;
        const maxDiscount = existing.product.selling_price * newQty;
        return prev.map(item => item.product.id === product.id ? { 
          ...item, 
          quantity: newQty,
          discount_amount: Math.min(maxDiscount, discountAmt)
        } : item);
      }
      return [...prev, { product, quantity: 1, discount_amount: 0 }];
    });
  };

  const handleUpdatePSProductsQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setPsProductsCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    setPsProductsCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const discountAmt = item.discount_amount || 0;
        const maxDiscount = item.product.selling_price * quantity;
        return {
          ...item,
          quantity,
          discount_amount: Math.min(maxDiscount, discountAmt)
        };
      }
      return item;
    }));
  };

  const handleUpdatePSProductPrice = (productId: string, price: number) => {
    setPsProductsCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const safePrice = Math.max(0, price);
        const discountAmt = item.discount_amount || 0;
        const maxDiscount = safePrice * item.quantity;
        return {
          ...item,
          product: {
            ...item.product,
            selling_price: safePrice
          },
          discount_amount: Math.min(maxDiscount, discountAmt)
        };
      }
      return item;
    }));
  };

  const handleUpdatePSProductDiscount = (productId: string, discountAmt: number) => {
    setPsProductsCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const maxDiscount = item.product.selling_price * item.quantity;
        return {
          ...item,
          discount_amount: Math.min(maxDiscount, Math.max(0, discountAmt))
        };
      }
      return item;
    }));
  };

  const handleRemoveFromPSProductsCart = (productId: string) => {
    setPsProductsCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleSavePSProducts = () => {
    if (!selectedDeviceForProd || !selectedDeviceForProd.current_session_id) return;

    const sessList = dbService.getPSSessions();
    const activeSess = sessList.find(s => s.id === selectedDeviceForProd.current_session_id);
    if (!activeSess) {
      onShowWarningAlert('لم يتم العثور على الجلسة النشطة!');
      return;
    }

    // Map cart items back to PlayStation Session Product structure (overwriting completely)
    const updatedProductsList = psProductsCart.map(item => ({
      product_id: item.product.id,
      product_name_ar: item.product.name_ar,
      quantity: item.quantity,
      selling_price: item.product.selling_price,
      discount_amount: item.discount_amount || 0
    }));

    const updatedSess: PSSession = {
      ...activeSess,
      products: updatedProductsList
    };

    dbService.savePSSession(updatedSess);
    onShowSuccessAlert(`تم حفظ وتحديث طلبات جلسة جهاز "${selectedDeviceForProd.name}" بنجاح!`);
    setShowPSProductsModal(false);
    loadData();
  };

  const loadData = () => {
    setDevices(dbService.getPSDevices());
    setSessions(dbService.getPSSessions().reverse()); // Newest first
    setCustomers(dbService.getCustomers());
  };

  // Live timer tick
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setDevices(dbService.getPSDevices());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- DEVICE MANAGEMENT ---
  const handleOpenAddDevice = () => {
    setEditingDevice(null);
    setDevName('');
    setDevPriceSingle(40);
    setDevPriceMulti(60);
    setShowDeviceModal(true);
  };

  const handleOpenEditDevice = (dev: PSDevice) => {
    setEditingDevice(dev);
    setDevName(dev.name);
    setDevPriceSingle(dev.hourly_price_single);
    setDevPriceMulti(dev.hourly_price_multi);
    setShowDeviceModal(true);
  };

  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devName.trim()) {
      onShowWarningAlert('يرجى إدخال اسم الجهاز!');
      return;
    }

    const devData: PSDevice = {
      id: editingDevice ? editingDevice.id : `ps_dev_${Date.now()}`,
      name: devName.trim(),
      hourly_price_single: devPriceSingle,
      hourly_price_multi: devPriceMulti,
      status: editingDevice ? editingDevice.status : 'FREE',
      session_start_time: editingDevice ? editingDevice.session_start_time : null,
      session_pause_time: editingDevice ? editingDevice.session_pause_time : null,
      session_accumulated_seconds: editingDevice ? editingDevice.session_accumulated_seconds : 0,
      session_notes: editingDevice ? editingDevice.session_notes : '',
      current_session_id: editingDevice ? editingDevice.current_session_id : null
    };

    dbService.savePSDevice(devData);
    onShowSuccessAlert(editingDevice ? `تم تعديل الجهاز "${devName}" بنجاح!` : `تم تسجيل الجهاز الجديد "${devName}" بنجاح!`);
    setShowDeviceModal(false);
    loadData();
  };

  const handleDeleteDeviceClick = (dev: PSDevice) => {
    if (dev.status !== 'FREE') {
      onShowWarningAlert('لا يمكن حذف جهاز نشط يلعب حالياً! أوقف الجلسة أولاً.');
      return;
    }
    setDeviceToDelete(dev);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteDevice = () => {
    if (!deviceToDelete) return;
    dbService.deletePSDevice(deviceToDelete.id);
    onShowSuccessAlert(`تم إزالة جهاز "${deviceToDelete.name}" من قائمة الأجهزة بنجاح.`);
    setShowDeleteConfirm(false);
    setDeviceToDelete(null);
    loadData();
  };

  // --- SESSION CONTROLS ---

  // Helper: calculate seconds played for an active/paused/expired device
  const getPlayedSeconds = (dev: PSDevice): number => {
    if (dev.status === 'TIME_EXPIRED') {
      let limitMin = dev.limit_minutes || 60;
      if (!dev.limit_minutes) {
        const match = dev.session_notes.match(/(?:محدد|محددة|وقت محدد):\s*(\d+)/) || dev.session_notes.match(/(\d+)\s*د/);
        if (match) limitMin = parseInt(match[1]);
      }
      return limitMin * 60; // Freeze at exact limit
    }
    if (!dev.session_start_time) return dev.session_accumulated_seconds || 0;
    let seconds = dev.session_accumulated_seconds || 0;
    if (dev.status === 'PLAYING_SINGLE' || dev.status === 'PLAYING_MULTI') {
      const start = new Date(dev.session_start_time).getTime();
      const now = currentTime.getTime();
      seconds += Math.max(0, Math.floor((now - start) / 1000));
    }
    if (dev.is_limited && dev.limit_minutes && dev.limit_minutes > 0) {
      const maxSecs = dev.limit_minutes * 60;
      if (seconds >= maxSecs) {
        return maxSecs; // Freeze at exact limit
      }
    }
    return seconds;
  };

  // Helper: format seconds to hh:mm:ss
  const formatDuration = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Helper: calculate live cost based on status and elapsed time
  const getSessionLiveCost = (dev: PSDevice): number => {
    const totalSecs = getPlayedSeconds(dev);
    const hours = totalSecs / 3600;
    let isMulti = dev.status === 'PLAYING_MULTI' || (dev.status === 'PAUSED' && dev.session_notes.includes('زوجي'));
    if (dev.current_session_id) {
      const sess = sessions.find(s => s.id === dev.current_session_id);
      if (sess) {
        isMulti = sess.session_type === 'MULTI';
      }
    }
    const hourlyPrice = isMulti ? dev.hourly_price_multi : dev.hourly_price_single;
    const rawCost = hours * hourlyPrice;
    return Math.round(rawCost * 10) / 10; // round to nearest 0.1
  };

  // 1. Start Session
  const handleOpenStartSession = (dev: PSDevice) => {
    setSelectedDevice(dev);
    setSessionType('SINGLE');
    setIsLimited(false);
    setLimitedMinutes(60);
    setSessionNotes('');
    setShowStartModal(true);
  };

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    const sessionId = `ps_sess_${Date.now()}`;
    const startTimeStr = new Date().toISOString();
    const targetEndTime = isLimited ? new Date(Date.now() + limitedMinutes * 60 * 1000).toISOString() : null;

    // 1. Update Device State
    const updatedDevice: PSDevice = {
      ...selectedDevice,
      status: sessionType === 'SINGLE' ? 'PLAYING_SINGLE' : 'PLAYING_MULTI',
      session_start_time: startTimeStr,
      session_pause_time: null,
      session_accumulated_seconds: 0,
      session_notes: sessionNotes.trim() + (isLimited ? ` | (وقت محدد: ${limitedMinutes} دقيقة)` : ' | (وقت مفتوح)'),
      current_session_id: sessionId,
      is_limited: isLimited,
      limit_minutes: isLimited ? limitedMinutes : 0,
      target_end_time: targetEndTime,
      expired_notified: false
    };

    // 2. Create Session Log
    const hourlyPrice = sessionType === 'SINGLE' ? selectedDevice.hourly_price_single : selectedDevice.hourly_price_multi;
    const newSession: PSSession = {
      id: sessionId,
      device_id: selectedDevice.id,
      device_name: selectedDevice.name,
      session_type: sessionType,
      start_time: startTimeStr,
      end_time: null,
      pause_time: null,
      accumulated_seconds: 0,
      hourly_price: hourlyPrice,
      discount: 0,
      additional_charges: 0,
      total_price: 0,
      status: 'ACTIVE',
      notes: sessionNotes.trim() + (isLimited ? ` (محدد ${limitedMinutes} د)` : ' (مفتوح)'),
      created_at: startTimeStr,
      is_limited: isLimited,
      limit_minutes: isLimited ? limitedMinutes : 0,
      target_end_time: targetEndTime
    };

    dbService.savePSDevice(updatedDevice);
    dbService.savePSSession(newSession);
    dbService.logAuditAction('START_PS_SESSION', `بدء جلسة لعب على جهاز ${selectedDevice.name} عيار ${sessionType === 'SINGLE' ? 'فردي' : 'زوجي'}`, 'نظام البلايستيشن');

    onShowSuccessAlert(`تم بدء وقت اللعب بنجاح على جهاز "${selectedDevice.name}" 🎮`);
    setShowStartModal(false);
    loadData();
  };

  // 2. Pause Session
  const handlePauseSession = (dev: PSDevice) => {
    if (!dev.session_start_time || !dev.current_session_id) return;
    
    const nowStr = new Date().toISOString();
    const playedSecs = getPlayedSeconds(dev);

    // Update Device
    const updatedDev: PSDevice = {
      ...dev,
      status: 'PAUSED',
      session_pause_time: nowStr,
      session_accumulated_seconds: playedSecs,
      session_start_time: null // will be set when resumed
    };

    // Update Session log
    const sessionsList = dbService.getPSSessions();
    const sess = sessionsList.find(s => s.id === dev.current_session_id);
    if (sess) {
      sess.status = 'PAUSED';
      sess.pause_time = nowStr;
      sess.accumulated_seconds = playedSecs;
      dbService.savePSSession(sess);
    }

    dbService.savePSDevice(updatedDev);
    onShowSuccessAlert(`تم إيقاف اللعب مؤقتاً للجهاز "${dev.name}" ⏸️`);
    loadData();
  };

  // 3. Resume Session
  const handleResumeSession = (dev: PSDevice) => {
    if (!dev.current_session_id) return;

    const nowStr = new Date().toISOString();

    // Update Device
    const updatedDev: PSDevice = {
      ...dev,
      status: dev.status === 'PAUSED' && dev.session_notes.includes('زوجي') ? 'PLAYING_MULTI' : 'PLAYING_SINGLE', // fallback or match
      session_start_time: nowStr,
      session_pause_time: null
    };
    // determine playing status based on session type
    const sessionsList = dbService.getPSSessions();
    const sess = sessionsList.find(s => s.id === dev.current_session_id);
    if (sess) {
      sess.status = 'ACTIVE';
      sess.pause_time = null;
      updatedDev.status = sess.session_type === 'SINGLE' ? 'PLAYING_SINGLE' : 'PLAYING_MULTI';
      dbService.savePSSession(sess);
    }

    dbService.savePSDevice(updatedDev);
    onShowSuccessAlert(`تم استئناف اللعب وجاري الحساب للجهاز "${dev.name}" ▶️`);
    loadData();
  };

  // 4. Extend Session (Open modal to add minutes)
  const handleOpenExtendSession = (dev: PSDevice) => {
    setSelectedDevice(dev);
    setExtendMinutes(30);
    setShowExtendModal(true);
  };

  const handleExtendSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    const extraMin = extendMinutes || 30;
    const currentNotes = selectedDevice.session_notes || '';
    const updatedNotes = currentNotes + ` | تم التمديد +${extraMin} دقيقة`;

    const oldLimit = selectedDevice.limit_minutes || 60;
    const newLimit = oldLimit + extraMin;

    const sessList = dbService.getPSSessions();
    const sess = sessList.find(s => s.id === selectedDevice.current_session_id);

    const sessType = sess ? sess.session_type : (selectedDevice.session_notes.includes('زوجي') ? 'MULTI' : 'SINGLE');
    const activeStatus = sessType === 'SINGLE' ? 'PLAYING_SINGLE' : 'PLAYING_MULTI';

    let startTime = selectedDevice.session_start_time;
    let accumulatedSecs = selectedDevice.session_accumulated_seconds || 0;

    // Fix accumulatedSecs if it was previously overwritten by legacy expiry logic
    if (selectedDevice.status === 'TIME_EXPIRED' && startTime) {
      if (accumulatedSecs >= oldLimit * 60) {
        accumulatedSecs = Math.max(0, accumulatedSecs - oldLimit * 60);
      }
    }

    if (!startTime) {
      startTime = new Date(Date.now() - accumulatedSecs * 1000).toISOString();
    }

    const remainingSecsFromStart = Math.max(0, (newLimit * 60) - accumulatedSecs);
    const targetEndTime = new Date(new Date(startTime).getTime() + remainingSecsFromStart * 1000).toISOString();

    const updatedDev: PSDevice = {
      ...selectedDevice,
      status: selectedDevice.status === 'PAUSED' ? 'PAUSED' : activeStatus,
      session_start_time: startTime,
      session_pause_time: selectedDevice.status === 'PAUSED' ? selectedDevice.session_pause_time : null,
      session_accumulated_seconds: accumulatedSecs,
      session_notes: updatedNotes,
      is_limited: true,
      limit_minutes: newLimit,
      target_end_time: targetEndTime,
      expired_notified: false
    };

    if (sess) {
      sess.status = selectedDevice.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
      sess.is_limited = true;
      sess.limit_minutes = newLimit;
      sess.target_end_time = targetEndTime;
      sess.notes += ` (تمديد +${extraMin} د - المجموع ${newLimit} د)`;
      dbService.savePSSession(sess);
    }

    dbService.savePSDevice(updatedDev);
    dbService.logAuditAction('EXTEND_PS_SESSION', `تمديد وقت اللعب للجهاز ${selectedDevice.name} بزيادة +${extraMin} دقيقة (المجموع: ${newLimit} دقيقة)`, 'نظام البلايستيشن');
    onShowSuccessAlert(`تم تمديد جلسة جهاز "${selectedDevice.name}" بزيادة قدرها ${extraMin} دقيقة (المجموع الجديد: ${newLimit} دقيقة) بنجاح! ⏰`);
    setShowExtendModal(false);
    loadData();
  };

  // 5. Move Session (Transfer active timer from device A to free device B)
  const handleOpenMoveSession = (dev: PSDevice) => {
    setSelectedDevice(dev);
    setTargetDeviceId('');
    setShowMoveModal(true);
  };

  const handleMoveSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !targetDeviceId) return;

    const targetDev = devices.find(d => d.id === targetDeviceId);
    if (!targetDev || targetDev.status !== 'FREE') {
      onShowWarningAlert('الجهاز المستهدف مشغول حالياً!');
      return;
    }

    // Move state
    const elapsedSecs = getPlayedSeconds(selectedDevice);

    // Target device gets the play session
    const updatedTarget: PSDevice = {
      ...targetDev,
      status: selectedDevice.status,
      session_start_time: selectedDevice.session_start_time,
      session_pause_time: selectedDevice.session_pause_time,
      session_accumulated_seconds: selectedDevice.session_accumulated_seconds,
      session_notes: selectedDevice.session_notes + ` (منقول من ${selectedDevice.name})`,
      current_session_id: selectedDevice.current_session_id
    };

    // Source device is reset to FREE
    const updatedSource: PSDevice = {
      ...selectedDevice,
      status: 'FREE',
      session_start_time: null,
      session_pause_time: null,
      session_accumulated_seconds: 0,
      session_notes: '',
      current_session_id: null
    };

    // Update Session log to reflect device rename
    if (selectedDevice.current_session_id) {
      const sessionsList = dbService.getPSSessions();
      const sess = sessionsList.find(s => s.id === selectedDevice.current_session_id);
      if (sess) {
        sess.device_id = targetDev.id;
        sess.device_name = targetDev.name;
        sess.notes += ` (نقل من ${selectedDevice.name})`;
        dbService.savePSSession(sess);
      }
    }

    dbService.savePSDevice(updatedTarget);
    dbService.savePSDevice(updatedSource);
    dbService.logAuditAction('MOVE_PS_SESSION', `نقل جلسة بلايستيشن من جهاز ${selectedDevice.name} إلى ${targetDev.name}`, 'نظام البلايستيشن');

    onShowSuccessAlert(`تم نقل اللعب بنجاح من جهاز "${selectedDevice.name}" إلى "${targetDev.name}" ⚡`);
    setShowMoveModal(false);
    loadData();
  };

  // 6. Stop and Bill Session
  const handleOpenStopSession = (dev: PSDevice) => {
    if (!dev.current_session_id) return;
    
    const sessList = dbService.getPSSessions();
    const activeSess = sessList.find(s => s.id === dev.current_session_id);
    if (!activeSess) return;

    const elapsedSecs = getPlayedSeconds(dev);
    const hours = elapsedSecs / 3600;
    const playFee = Math.max(5, Math.round(hours * activeSess.hourly_price)); // minimum charge of 5 ج.م

    const currentSessCopy: PSSession = {
      ...activeSess,
      accumulated_seconds: elapsedSecs,
      end_time: new Date().toISOString(),
      total_price: playFee,
      notes: dev.session_notes
    };

    setSelectedDevice(dev);
    setBillingSession(currentSessCopy);
    setAdditionalCharges(0);
    setDiscount(0);
    setPaymentType('CASH');
    setSelectedCustomerId('');
    setBillingNotes('');
    setShowStopModal(true);
  };

  const handleStopSessionAndGenerateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !billingSession) return;

    if (paymentType === 'CREDIT' && !selectedCustomerId) {
      onShowWarningAlert('يرجى اختيار العميل لتسجيل الجلسة كمديونية على حسابه!');
      return;
    }

    const calculatedPlayTotal = billingSession.total_price + additionalCharges - discount;
    const finalPlayTotal = Math.max(0, calculatedPlayTotal);

    let productsTotal = 0;
    if (billingSession.products && billingSession.products.length > 0) {
      productsTotal = billingSession.products.reduce((sum, p) => sum + p.selling_price * p.quantity, 0);
    }

    const grandTotal = finalPlayTotal + productsTotal;

    // 1. Memory-only PlayStation Service representation (never saved in DB products list)
    const psServiceProduct: Product = {
      id: 'service_playstation',
      category_id: 'cat_playstation_service',
      name_ar: `رسم وقت لعب بلايستيشن: ${selectedDevice.name} 🎮`,
      name_en: `PlayStation Playtime Fee: ${selectedDevice.name}`,
      barcode: 'SERVICE_PS',
      image: '',
      selling_price: 0,
      cost_price: 0,
      current_stock: 99999,
      minimum_stock: 0,
      unit: 'جلسة',
      is_favorite: false,
      is_available: true,
      notes: 'رسم وقت لعب بلايستيشن ملوكي',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_raw_material: false,
      is_service: true
    };

    // 2. Build CartItem representing the play fee
    const hours = billingSession.accumulated_seconds / 3600;
    const minutes = Math.round((billingSession.accumulated_seconds % 3600) / 60);
    const durationLabel = `${Math.floor(hours)} ساعة و ${minutes} دقيقة`;
    
    const cartItems: CartItem[] = [
      {
        product: psServiceProduct,
        quantity: 1,
        custom_price: finalPlayTotal,
        notes: `جلسة لعب على جهاز ${selectedDevice.name} (${billingSession.session_type === 'SINGLE' ? 'فردي' : 'زوجي'}) | المدة: ${durationLabel} | إضافي: ${additionalCharges}ج.م | خصم: ${discount}ج.م`,
        kitchen_notes: ''
      }
    ];

    // Append session products to the invoice items list
    if (billingSession.products && billingSession.products.length > 0) {
      const allDBProducts = dbService.getProducts();
      billingSession.products.forEach(p => {
        const fullProd = allDBProducts.find(prod => prod.id === p.product_id);
        if (fullProd) {
          cartItems.push({
            product: fullProd,
            quantity: p.quantity,
            custom_price: p.selling_price,
            item_discount_type: (p.discount_amount && p.discount_amount > 0) ? 'fixed' : 'none',
            item_discount_value: p.discount_amount || 0,
            item_discount_amount: p.discount_amount || 0,
            notes: `استهلاك مشروبات/سناكس لجلسة لعب جهاز ${selectedDevice.name}`,
            kitchen_notes: ''
          });
        }
      });
    }

    // 3. Create POS Invoice
    const checkoutResult = dbService.createInvoice(
      cartItems,
      paymentType === 'CREDIT' ? 'CREDIT' : 'CASH',
      paymentType === 'CREDIT' ? selectedCustomerId : null,
      0, // discount handled inside custom_price or pre-calculated
      0, // tax
      paymentType === 'CREDIT' ? 0 : grandTotal,
      'نظام البلايستيشن'
    );

    // 4. Close and Complete PlayStation Session log
    const completedSession: PSSession = {
      ...billingSession,
      status: 'COMPLETED',
      end_time: new Date().toISOString(),
      additional_charges: additionalCharges,
      discount: discount,
      total_price: grandTotal, // full session revenue (play + snacks)
      notes: billingNotes.trim() || `تم الدفع نقداً بموجب فاتورة رقم ${checkoutResult.invoice.invoice_number}`
    };
    dbService.savePSSession(completedSession);

    // 5. Reset Device status to FREE
    const resetDev: PSDevice = {
      ...selectedDevice,
      status: 'FREE',
      session_start_time: null,
      session_pause_time: null,
      session_accumulated_seconds: 0,
      session_notes: '',
      current_session_id: null,
      is_limited: false,
      limit_minutes: 0,
      target_end_time: null,
      expired_notified: false
    };
    dbService.savePSDevice(resetDev);

    onShowSuccessAlert(`تم إنهاء الجلسة بنجاح وفوترتها بمبلغ ${grandTotal} ج.م! فاتورة رقم: ${checkoutResult.invoice.invoice_number} 🧾`);
    setShowStopModal(false);
    loadData();
  };

  // --- REVENUE REPORTS ---
  const completedSessionsList = useMemo(() => {
    return sessions.filter(s => s.status === 'COMPLETED');
  }, [sessions]);

  const totalCompletedRevenue = useMemo(() => {
    return completedSessionsList.reduce((sum, s) => sum + s.total_price, 0);
  }, [completedSessionsList]);

  const todayCompletedRevenue = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return completedSessionsList
      .filter(s => s.end_time?.startsWith(todayStr))
      .reduce((sum, s) => sum + s.total_price, 0);
  }, [completedSessionsList]);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-900 pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Gamepad2 className="w-6 h-6 text-gold-500 animate-pulse" />
            <h2 className="text-xl font-bold text-white tracking-tight">لوحة تحكم ألعاب بلايستيشن 🎮</h2>
          </div>
          <p className="text-xs text-gray-400">إدارة الجلسات الحية بالوقت والتعريفة، نقل الجلسات، وحساب الأرباح تلقائياً وربطها بنظام الكاشير الموحد</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenAddDevice}
            className="flex items-center gap-2 bg-gradient-to-l from-gold-600 to-amber-600 hover:from-gold-500 hover:to-amber-500 text-black px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            إضافة جهاز بلايستيشن جديد
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">الأجهزة المضافة</span>
          <span className="text-sm font-mono font-bold text-white">{devices.length} أجهزة بالصالة</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">الأجهزة النشطة الآن</span>
          <span className="text-sm font-mono font-bold text-gold-500">
            {devices.filter(d => d.status.startsWith('PLAYING')).length} قيد التشغيل
          </span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl">
          <span className="text-[10px] text-gray-500 font-extrabold block mb-1">إيرادات ألعاب اليوم الفعالة</span>
          <span className="text-sm font-mono font-bold text-green-400">+{todayCompletedRevenue.toLocaleString()} ج.م</span>
        </div>
        <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl bg-gradient-to-l from-gold-600/5 to-transparent">
          <span className="text-[10px] text-gold-500 font-extrabold block mb-1">إجمالي إيرادات ألعاب البلايستيشن</span>
          <span className="text-sm font-mono font-bold text-gold-500">{totalCompletedRevenue.toLocaleString()} ج.م</span>
        </div>
      </div>

      {/* Sub-tabs Selection */}
      <div className="flex gap-2 border-b border-gray-900 pb-px">
        <button
          onClick={() => setActiveSubTab('devices')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'devices' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          🎮 الأجهزة النشطة وحجز الصالة ({devices.length})
          {activeSubTab === 'devices' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
        <button
          onClick={() => setActiveSubTab('sessions')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer ${
            activeSubTab === 'sessions' ? 'text-gold-500' : 'text-gray-400 hover:text-white'
          }`}
        >
          📜 أرشيف الجلسات المنتهية ({completedSessionsList.length})
          {activeSubTab === 'sessions' && <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gold-600" />}
        </button>
      </div>

      {/* 1. Sub-tab: Active devices grid */}
      {activeSubTab === 'devices' && (
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border text-center py-12 rounded-3xl">
              <Gamepad2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-white mb-1">لم يتم تسجيل أي أجهزة بعد</h3>
              <p className="text-xs text-gray-500 mb-4">أضف شاشات وأجهزة البلايستيشن عيار 4 أو 5 بالصالة أو الغرف الخاصة</p>
              <button
                onClick={handleOpenAddDevice}
                className="bg-gold-600 hover:bg-gold-500 text-black px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                + إضافة جهاز أول
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map(dev => {
                const isSessLimited = dev.is_limited || dev.session_notes.includes('محدد') || dev.session_notes.includes('دقيقة');
                let limitMin = dev.limit_minutes || 0;
                if (!dev.limit_minutes && isSessLimited) {
                  const match = dev.session_notes.match(/(?:محدد|محددة|وقت محدد):\s*(\d+)/) || dev.session_notes.match(/(\d+)\s*د/);
                  if (match) limitMin = parseInt(match[1]);
                }
                const playedSecs = getPlayedSeconds(dev);
                const isTimeUp = isSessLimited && limitMin > 0 && playedSecs >= limitMin * 60;
                const isExpired = dev.status === 'TIME_EXPIRED' || isTimeUp;
                const isPlaying = (dev.status === 'PLAYING_SINGLE' || dev.status === 'PLAYING_MULTI') && !isTimeUp;
                const isPaused = dev.status === 'PAUSED';
                const playedCost = getSessionLiveCost(dev);

                return (
                  <div key={dev.id} className={`bg-luxury-card border rounded-3xl p-5 relative flex flex-col justify-between transition-all ${
                    isExpired
                      ? 'border-amber-500 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse'
                      : isPlaying 
                        ? 'border-gold-500/35 shadow-[0_0_15px_rgba(212,175,55,0.06)] bg-gradient-to-l from-gold-600/5 to-transparent' 
                        : isPaused
                          ? 'border-amber-500/25 bg-amber-950/5'
                          : 'border-luxury-border'
                  }`}>
                    <div>
                      {/* Name, category, edit */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                            isExpired
                              ? 'bg-amber-500 text-black animate-bounce'
                              : isPlaying
                                ? 'bg-gold-600 text-black'
                                : isPaused
                                  ? 'bg-amber-600 text-black animate-pulse'
                                  : 'bg-black border border-gray-800 text-gray-400'
                          }`}>
                            <Gamepad2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-white flex items-center gap-1">
                              {dev.name}
                              {isPlaying && <span className="w-2 h-2 rounded-full bg-green-500 animate-ping inline-block" />}
                            </h4>
                            <span className="text-[9px] text-gray-500 font-semibold block mt-0.5">
                              فردي: {dev.hourly_price_single} ج.م | زوجي: {dev.hourly_price_multi} ج.م
                            </span>
                          </div>
                        </div>

                        {/* Edit delete for config */}
                        {!isPlaying && !isPaused && !isExpired && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditDevice(dev)}
                              className="p-1 hover:bg-gray-900 rounded text-gray-500 hover:text-white transition-colors cursor-pointer"
                              title="تعديل الجهاز"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteDeviceClick(dev)}
                              className="p-1 hover:bg-red-950/20 rounded text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                              title="حذف الجهاز"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Display live timer for playing, paused, or expired devices */}
                      {(isPlaying || isPaused || isExpired) && (() => {
                        const sess = sessions.find(s => s.id === dev.current_session_id);
                        const isSessLimited = dev.is_limited || dev.session_notes.includes('محدد') || dev.session_notes.includes('دقيقة');
                        
                        let limitMin = dev.limit_minutes || 60;
                        if (!dev.limit_minutes) {
                          const match = dev.session_notes.match(/(?:محدد|محددة|وقت محدد):\s*(\d+)/) || dev.session_notes.match(/(\d+)\s*د/);
                          if (match) limitMin = parseInt(match[1]);
                        }

                        const startTimeStr = dev.session_start_time ? new Date(dev.session_start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) : '---';
                        const expectedEndTimeStr = (dev.session_start_time && isSessLimited) 
                          ? new Date(new Date(dev.session_start_time).getTime() + limitMin * 60 * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
                          : 'مفتوح ♾️';

                        return (
                          <div className="bg-black/45 p-3 rounded-2xl border border-gray-900/60 mb-3 space-y-2">
                            <div className="flex justify-between items-center text-[10px] text-gray-400 font-semibold">
                              <span>الـحـالة الحية:</span>
                              <span className={isExpired ? 'text-amber-400 font-black flex items-center gap-1' : isPaused ? 'text-amber-500 font-bold' : 'text-gold-500 font-black'}>
                                {isExpired ? '🟡 انتهى الوقت (بانتظار المحاسبة)' : isPaused ? '⏸️ مؤقت متوقف' : dev.status === 'PLAYING_MULTI' ? '🎮 لعب زوجي (Multi)' : '🎮 لعب فردي (Single)'}
                              </span>
                            </div>

                            {/* Start and End Times */}
                            <div className="grid grid-cols-2 gap-2 border-t border-gray-900/40 pt-1.5 text-[9px] text-gray-400">
                              <div className="bg-black/20 p-1.5 rounded-lg border border-gray-950/40 text-center">
                                <span className="block text-gray-500 mb-0.5">وقت بدء الجلسة:</span>
                                <span className="font-mono font-bold text-white">{startTimeStr}</span>
                              </div>
                              <div className="bg-black/20 p-1.5 rounded-lg border border-gray-950/40 text-center">
                                <span className="block text-gray-500 mb-0.5">الانتهاء المتوقع:</span>
                                <span className="font-mono font-bold text-white">{expectedEndTimeStr}</span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-900/40 pt-1.5">
                              <span className="text-[9px] text-gray-500">نوع الوقت المفتوح/المحدد:</span>
                              <span className="text-[10px] font-bold text-gray-300">
                                {isSessLimited ? `⏱️ محدد (${limitMin} دقيقة)` : '♾️ جلسة مفتوحة'}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-900/40 pt-1.5">
                              <span className="text-[9px] text-gray-500">مدة الوقت المنقضي:</span>
                              <span className="text-xs font-mono font-black text-white flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gold-500" />
                                {formatDuration(playedSecs)}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-900/40 pt-1.5">
                              <span className="text-[9px] text-gray-500">الوقت المتبقي:</span>
                              <span className="text-xs font-mono font-bold">
                                {isExpired ? (
                                  <span className="text-amber-400 font-bold">00:00:00 (انتهى الوقت)</span>
                                ) : isSessLimited ? (
                                  <span className="text-emerald-400">{formatDuration(Math.max(0, limitMin * 60 - playedSecs))}</span>
                                ) : (
                                  <span className="text-gray-400">مفتوح</span>
                                )}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-900/40 pt-1.5">
                              <span className="text-[9px] text-gray-500">تكلفة اللعب المستحقة:</span>
                              <span className="text-xs font-mono font-bold text-gold-500">{playedCost} ج.م</span>
                            </div>
                            {dev.session_notes && (
                              <p className="text-[8px] text-gray-500 leading-normal border-t border-gray-900/40 pt-1 truncate" title={dev.session_notes}>
                                بيان: {dev.session_notes}
                              </p>
                            )}
                            {sess && sess.products && sess.products.length > 0 && (
                              <div className="border-t border-gray-900/40 pt-1.5 mt-1.5">
                                <span className="text-[8px] text-gray-400 block mb-1 font-bold">🥤 الطلبات الحالية:</span>
                                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                  {sess.products.map((p, pIdx) => (
                                    <span key={pIdx} className="text-[8px] px-1.5 py-0.5 rounded bg-purple-950/25 border border-purple-900/30 text-purple-400 font-bold">
                                      {p.product_name_ar} (x{p.quantity})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Bottom Action Triggers */}
                    <div className="mt-4 pt-3 border-t border-gray-900/30 flex items-center justify-between">
                      <div>
                        {isExpired ? (
                          <span className="text-[10px] text-amber-400 font-black flex items-center gap-1">
                            🟡 بانتظار المحاسبة
                          </span>
                        ) : !isPlaying && !isPaused ? (
                          <span className="text-[10px] text-emerald-500 font-extrabold flex items-center gap-1">
                            🟢 مـتـاح الآن
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-500 font-mono">ID: {dev.current_session_id?.slice(-5)}</span>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        {/* Start play if free */}
                        {!isPlaying && !isPaused && !isExpired && (
                          <button
                            onClick={() => handleOpenStartSession(dev)}
                            className="px-4 py-1.5 bg-gold-600 hover:bg-gold-500 text-black text-[10px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            بدء تشغيل اللعب
                          </button>
                        )}

                        {/* Expired session controls */}
                        {isExpired && (
                          <>
                            <button
                              onClick={() => handleOpenExtendSession(dev)}
                              className="px-2.5 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-lg text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1"
                              title="تمديد الوقت"
                            >
                              <Clock className="w-3 h-3 text-amber-400" />
                              تمديد
                            </button>
                            <button
                              onClick={() => handleOpenAddProductsToSession(dev)}
                              className="px-2 py-1 bg-purple-950/30 border border-purple-900/40 text-purple-400 hover:text-white hover:bg-purple-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="إضافة منتجات ومشروبات للجلسة"
                            >
                              🥤 + طلب
                            </button>
                            <button
                              onClick={() => handleOpenStopSession(dev)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-md animate-pulse"
                            >
                              <StopCircle className="w-3 h-3" />
                              محاسبة وإنهاء
                            </button>
                          </>
                        )}

                        {/* Resume / Pause toggle if playing */}
                        {isPlaying && (
                          <>
                            <button
                              onClick={() => handleOpenExtendSession(dev)}
                              className="px-2.5 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-lg text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1"
                              title="تمديد الوقت"
                            >
                              <Clock className="w-3 h-3 text-amber-400" />
                              تمديد
                            </button>
                            <button
                              onClick={() => handlePauseSession(dev)}
                              className="p-2 bg-amber-950/40 border border-amber-900/40 text-amber-500 hover:text-white hover:bg-amber-950 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="إيقاف مؤقت"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenMoveSession(dev)}
                              className="px-2 py-1 bg-luxury-bg border border-gray-800 text-gray-400 hover:text-white rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="نقل لجهاز آخر"
                            >
                              نقل ⚡
                            </button>
                            <button
                              onClick={() => handleOpenAddProductsToSession(dev)}
                              className="px-2 py-1 bg-purple-950/30 border border-purple-900/40 text-purple-400 hover:text-white hover:bg-purple-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="إضافة منتجات ومشروبات للجلسة"
                            >
                              🥤 + طلب
                            </button>
                            <button
                              onClick={() => handleOpenStopSession(dev)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-md"
                            >
                              <StopCircle className="w-3 h-3" />
                              محاسبة وإنهاء
                            </button>
                          </>
                        )}

                        {/* Resume if paused */}
                        {isPaused && (
                          <>
                            <button
                              onClick={() => handleOpenExtendSession(dev)}
                              className="px-2.5 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-lg text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1"
                              title="تمديد الوقت"
                            >
                              <Clock className="w-3 h-3 text-amber-400" />
                              تمديد
                            </button>
                            <button
                              onClick={() => handleResumeSession(dev)}
                              className="p-2 bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 hover:text-white hover:bg-emerald-950 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="استئناف اللعب"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                            <button
                              onClick={() => handleOpenAddProductsToSession(dev)}
                              className="px-2 py-1 bg-purple-950/30 border border-purple-900/40 text-purple-400 hover:text-white hover:bg-purple-900 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              title="إضافة منتجات ومشروبات للجلسة"
                            >
                              🥤 + طلب
                            </button>
                            <button
                              onClick={() => handleOpenStopSession(dev)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-md"
                            >
                              <StopCircle className="w-3 h-3" />
                              محاسبة وإنهاء
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Sub-tab: Completed sessions history */}
      {activeSubTab === 'sessions' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-gray-900 bg-black/20 flex justify-between items-center">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <History className="w-4 h-4 text-gold-500" />
              سجل جلسات ألعاب البلايستيشن المكتملة والمفوترة
            </h4>
            <span className="text-[10px] text-gray-500 font-semibold">مسجلة تلقائياً في دفتر مبيعات الكاشير</span>
          </div>

          {completedSessionsList.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">لا توجد جلسات لعب مكتملة أو مدفوعة في الأرشيف بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black/45 border-b border-gray-900 text-gray-400 text-[10px] font-bold uppercase">
                  <tr>
                    <th className="py-3 px-4">تاريخ ووقت البدء</th>
                    <th className="py-3 px-4">اسم الجهاز</th>
                    <th className="py-3 px-4 text-center">نوع الجلسة</th>
                    <th className="py-3 px-4 text-center">المدة الإجمالية</th>
                    <th className="py-3 px-4 text-center">سعر الساعة</th>
                    <th className="py-3 px-4 text-center">إضافات / خصومات</th>
                    <th className="py-3 px-4 text-center">المبلغ المدفوع</th>
                    <th className="py-3 px-4">ملاحظات وفوترة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900/50">
                  {completedSessionsList.map(s => {
                    const hrs = s.accumulated_seconds / 3600;
                    const mins = Math.round((s.accumulated_seconds % 3600) / 60);
                    const durationText = `${Math.floor(hrs)}ساعة و ${mins}د`;

                    return (
                      <tr key={s.id} className="hover:bg-gray-900/20 transition-colors">
                        <td className="py-3.5 px-4 text-[10px] font-mono text-gray-500">
                          {new Date(s.start_time).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">{s.device_name}</td>
                        <td className="py-3.5 px-4 text-center">
                          {s.session_type === 'SINGLE' ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-950 border border-blue-900 text-blue-400 text-[9px] font-bold">فردي</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 border border-purple-900 text-purple-400 text-[9px] font-bold">زوجي</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-white">{durationText}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-gray-400">{s.hourly_price} ج.م</td>
                        <td className="py-3.5 px-4 text-center text-[11px]">
                          {s.additional_charges > 0 && <span className="text-green-400 font-mono">+{s.additional_charges}</span>}
                          {s.discount > 0 && <span className="text-red-400 font-mono"> -{s.discount}</span>}
                          {s.additional_charges === 0 && s.discount === 0 && <span className="text-gray-600 font-mono">-</span>}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-black text-gold-500">{s.total_price} ج.م</td>
                        <td className="py-3.5 px-4 text-[10px] text-gray-500 max-w-xs truncate" title={s.notes}>{s.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- MODAL DIALOG: ADD / EDIT PLAYSTATION DEVICE --- */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleSaveDevice} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              onClick={() => setShowDeviceModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-gold-500" />
              {editingDevice ? 'تعديل بيانات الجهاز' : 'تسجيل جهاز بلايستيشن جديد'}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">أدخل اسم الشاشة أو الجهاز وحدد أسعار الإيجار الفردي والزوجي للساعة</p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم شاشة / جهاز البلايستيشن *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شاشة VIP - 1 (PS5)"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">سعر الساعة فردي (Single) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={devPriceSingle}
                    onChange={(e) => setDevPriceSingle(parseFloat(e.target.value) || 0)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-gold-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">سعر الساعة زوجي (Multi) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={devPriceMulti}
                    onChange={(e) => setDevPriceMulti(parseFloat(e.target.value) || 0)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-gold-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
              >
                {editingDevice ? 'حفظ التعديلات' : 'إضافة وتسجيل الجهاز'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: START SESSION PLAYTIME --- */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleStartSession} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              onClick={() => setShowStartModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <Play className="w-4 h-4 fill-gold-500 text-gold-500" />
              بدء جلسة لعب على: {selectedDevice?.name}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">اختر نوع اللعب وتحديد الوقت لبدء عداد الدقائق التلقائي</p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">نوع اللعب / التعريفة المتبعة</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSessionType('SINGLE')}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      sessionType === 'SINGLE'
                        ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                        : 'bg-black/35 border-gray-900 text-gray-400'
                    }`}
                  >
                    فردي (Single) - {selectedDevice?.hourly_price_single} ج.م/ساعه
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionType('MULTI')}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      sessionType === 'MULTI'
                        ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                        : 'bg-black/35 border-gray-900 text-gray-400'
                    }`}
                  >
                    زوجي (Multi) - {selectedDevice?.hourly_price_multi} ج.م/ساعه
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">نظام حجز الوقت</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLimited(false)}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      !isLimited
                        ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                        : 'bg-black/35 border-gray-900 text-gray-400'
                    }`}
                  >
                    ⏱️ الوقت مفتوح (Open-time)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLimited(true)}
                    className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      isLimited
                        ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                        : 'bg-black/35 border-gray-900 text-gray-400'
                    }`}
                  >
                    ⏰ وقت محدد (Limited)
                  </button>
                </div>
              </div>

              {isLimited && (
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">حدد الوقت بالدقائق *</label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    required
                    value={limitedMinutes}
                    onChange={(e) => setLimitedMinutes(parseInt(e.target.value) || 0)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-gold-500"
                  />
                  <div className="flex gap-1.5 mt-2 justify-center">
                    {[30, 60, 120, 180].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLimitedMinutes(m)}
                        className="px-2 py-1 bg-black hover:bg-gray-900 text-gray-400 hover:text-white rounded text-[10px] font-bold border border-gray-900"
                      >
                        {m === 60 ? 'ساعة' : m === 120 ? 'ساعتين' : `${m} دقيقة`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">ملاحظات على الجلسة</label>
                <input
                  type="text"
                  placeholder="مثال: حجز باسم الأستاذ نادر، طلب دراعات إضافية..."
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
              >
                🚀 بدء عد الوقت واللعب
              </button>
              <button
                type="button"
                onClick={() => setShowStartModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: MOVE ACTIVE SESSION --- */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleMoveSession} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              onClick={() => setShowMoveModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <MoveRight className="w-5 h-5 text-gold-500" />
              نقل جلسة جهاز: {selectedDevice?.name}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">انقل وقت اللعب التراكمي لجهاز آخر فارغ في الصالة</p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اختر الجهاز الفارغ المستهدف *</label>
                <select
                  required
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                >
                  <option value="">-- اختر جهاز متاح --</option>
                  {devices
                    .filter(d => d.status === 'FREE' && d.id !== selectedDevice?.id)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name} (فردي: {d.hourly_price_single} ج.م)</option>
                    ))
                  }
                </select>
                {devices.filter(d => d.status === 'FREE').length === 0 && (
                  <span className="text-[10px] text-red-500 font-bold block mt-1.5">⚠️ نأسف، لا توجد أجهزة شاغرة ومتاحة حالياً لنقل الجلسة إليها!</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                disabled={!targetDeviceId}
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚡ تنفيذ نقل الجلسة فوراً
              </button>
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: EXTEND PLAYSTATION SESSION --- */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleExtendSession} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              onClick={() => setShowExtendModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              تمديد وقت الجلسة: {selectedDevice?.name}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">
              إضافة دقائق إضافية لزيادة إجمالي وقت الجلسة الأصلي واستئناف عداد الوقت تلقائياً
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">عدد الدقائق الإضافية للتمديد *</label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  required
                  value={extendMinutes}
                  onChange={(e) => setExtendMinutes(parseInt(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                />
                <div className="flex gap-1.5 mt-2 justify-center">
                  {[15, 30, 60, 120].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExtendMinutes(m)}
                      className="px-2.5 py-1 bg-black hover:bg-gray-900 text-gray-400 hover:text-amber-400 rounded text-[10px] font-bold border border-gray-900 transition-colors cursor-pointer"
                    >
                      +{m} دقيقة
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-gray-900/60 text-[10px] space-y-1.5">
                <div className="flex justify-between text-gray-400">
                  <span>الوقت المحدد الأصلي:</span>
                  <span className="font-mono text-gray-300 font-bold">{selectedDevice?.limit_minutes || 60} دقيقة</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold border-t border-gray-900 pt-1">
                  <span>إجمالي الوقت الجديد بعد التمديد:</span>
                  <span className="font-mono text-amber-300 font-black">{(selectedDevice?.limit_minutes || 60) + (extendMinutes || 0)} دقيقة</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                className="py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs flex items-center justify-center gap-1 shadow-md shadow-amber-950/40"
              >
                ⏰ تأكيد التمديد الآن
              </button>
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: BILL AND STOP PLAY SESSION --- */}
      {showStopModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <form onSubmit={handleStopSessionAndGenerateInvoice} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 relative">
            <button
              type="button"
              onClick={() => setShowStopModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h4 className="text-sm font-extrabold text-white mb-1 flex items-center gap-2">
              <StopCircle className="w-5 h-5 text-red-500" />
              إنهاء وفوترة: {selectedDevice?.name}
            </h4>
            <p className="text-[10px] text-gray-500 mb-4 pb-3 border-b border-gray-900">مراجعة المدة الزمنية المحسوبة وحساب التكلفة مع إمكانية إضافة سناك ومشروبات</p>

            {billingSession && (
              <div className="space-y-3.5 text-xs">
                
                {/* Duration and rates details summary */}
                <div className="p-3 bg-black/40 rounded-xl border border-gray-900 text-[10px] text-gray-400 font-semibold space-y-1">
                  <p className="flex justify-between">
                    <span>المدة الإجمالية للعب:</span>
                    <span className="text-white font-mono font-bold">
                      {Math.floor(billingSession.accumulated_seconds / 3600)} ساعة و {Math.round((billingSession.accumulated_seconds % 3600) / 60)} دقيقة
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span>تعريفة فئة اللعب المعمول بها:</span>
                    <span className="text-white font-mono">{billingSession.session_type === 'SINGLE' ? 'فردي (Single)' : 'زوجي (Multi)'} | {billingSession.hourly_price} ج.م/س</span>
                  </p>
                  <p className="flex justify-between text-gold-500 border-t border-gray-900 pt-1 mt-1 font-black">
                    <span>حساب تكلفة اللعب الفعلي:</span>
                    <span className="font-mono">{billingSession.total_price} ج.م</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-bold block mb-1">مشروبات وسناكس إضافية (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      value={additionalCharges}
                      onChange={(e) => setAdditionalCharges(parseFloat(e.target.value) || 0)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-green-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-bold block mb-1">خصم مستقطع خاص (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-center font-mono font-bold text-red-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">طريقة دفع الحساب وعقده</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setPaymentType('CASH')}
                      className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                        paymentType === 'CASH'
                          ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                          : 'bg-black/35 border-gray-900 text-gray-400'
                      }`}
                    >
                      💵 كاش نقدي (بالدرج)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('CREDIT')}
                      className={`py-2 px-3 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                        paymentType === 'CREDIT'
                          ? 'bg-gold-600/10 border-gold-500 text-gold-500'
                          : 'bg-black/35 border-gray-900 text-gray-400'
                      }`}
                    >
                      👥 دين / ذمم (على عميل)
                    </button>
                  </div>

                  {paymentType === 'CREDIT' && (
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold block mb-1">اختر العميل المسجل للذمم *</label>
                      <select
                        required
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                      >
                        <option value="">-- اختر عميل من الدفتر --</option>
                        {customers.map(cust => (
                          <option key={cust.id} value={cust.id}>{cust.name} (رصيد حالي: {cust.current_balance} ج.م)</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">ملاحظات الفاتورة والختام</label>
                  <input
                    type="text"
                    placeholder="مثال: خصم خاص للمجموعة، تم استلام المبلغ بالكامل..."
                    value={billingNotes}
                    onChange={(e) => setBillingNotes(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs text-right"
                  />
                </div>

                {/* Session Products consumption list */}
                {billingSession.products && billingSession.products.length > 0 && (
                  <div className="p-3 bg-purple-950/20 rounded-xl border border-purple-900/30 text-[10px] space-y-1.5">
                    <span className="text-[9px] text-purple-400 font-extrabold block">🥤 مشروبات وسناكس تم طلبها خلال الجلسة:</span>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {billingSession.products.map((p, pIdx) => {
                        const itemDiscount = p.discount_amount || 0;
                        const itemSubtotal = (p.selling_price * p.quantity) - itemDiscount;
                        return (
                          <div key={pIdx} className="flex justify-between text-gray-300">
                            <span>
                              {p.product_name_ar} (x{p.quantity})
                              {itemDiscount > 0 && <span className="text-red-400 mr-1 text-[9px] font-bold">(خصم {itemDiscount} ج.م)</span>}
                            </span>
                            <span className="font-mono text-white">{itemSubtotal} ج.م</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between border-t border-purple-900/30 pt-1 text-purple-400 font-bold">
                      <span>إجمالي قيمة الطلبات بعد الخصم:</span>
                      <span className="font-mono">
                        {billingSession.products.reduce((sum, p) => sum + (p.selling_price * p.quantity) - (p.discount_amount || 0), 0)} ج.م
                      </span>
                    </div>
                  </div>
                )}

                {/* Final Net Invoice Calculation Indicator */}
                <div className="bg-[#090909] p-3 rounded-2xl border border-gray-900 text-center">
                  <span className="text-[10px] text-gray-500 block mb-0.5 font-bold">إجمالي المبلغ النهائي المستحق (لعب + طلبات):</span>
                  <span className="text-base font-mono font-black text-gold-500">
                    {Math.max(0, billingSession.total_price + additionalCharges - discount + (billingSession.products?.reduce((sum, p) => sum + (p.selling_price * p.quantity) - (p.discount_amount || 0), 0) || 0))} ج.م
                  </span>
                </div>

              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="submit"
                className="py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-xl transition-all cursor-pointer text-xs"
              >
                🧾 طباعة فاتورة الحساب كاشير
              </button>
              <button
                type="button"
                onClick={() => setShowStopModal(false)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL DIALOG: ADD PRODUCTS TO PLAYSTATION SESSION --- */}
      {/* Improved Order Selection Modal */}
      {showPSProductsModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden relative shadow-2xl">
            
            {/* Header */}
            <div className="p-4 border-b border-gray-900 flex justify-between items-center bg-black/40">
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-purple-400 animate-pulse" />
                  إضافة وإدارة طلبات جلسة جهاز: <span className="text-purple-400 font-black text-base">{selectedDeviceForProd?.name}</span>
                </h4>
                <p className="text-[10px] text-gray-500 mt-0.5">تعديل كميات، أسعار، حذف أو إضافة مشروبات وأصناف جديدة مباشرة في الجلسة النشطة</p>
              </div>
              <button
                onClick={() => setShowPSProductsModal(false)}
                className="text-gray-500 hover:text-white transition-colors cursor-pointer bg-black/20 p-1.5 rounded-full"
              >
                <XCircle className="w-6 h-6 text-gray-400 hover:text-red-500 transition-colors" />
              </button>
            </div>

            {/* Mobile Tabs Segmented Picker (Only visible on screens smaller than md) */}
            <div className="flex md:hidden border-b border-gray-900 bg-black/20 p-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPsMobileTab('products')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  psMobileTab === 'products'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                    : 'bg-black/30 border border-gray-900/50 text-gray-400 hover:text-white'
                }`}
              >
                <Coffee className="w-4 h-4" />
                الأصناف والمنتجات 🍽️
              </button>
              <button
                type="button"
                onClick={() => setPsMobileTab('cart')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 relative ${
                  psMobileTab === 'cart'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                    : 'bg-black/30 border border-gray-900/50 text-gray-400 hover:text-white'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                الطلبات المحددة ({psProductsCart.reduce((sum, item) => sum + item.quantity, 0)}) 🛒
              </button>
            </div>

            {/* Split Content: Products Selector (Right) vs Cart Summary (Left) */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              
              {/* Products Catalog Area (Right Panel) */}
              <div className={`flex-1 flex flex-col p-5 overflow-hidden border-l border-gray-900 bg-black/10 ${
                psMobileTab === 'products' ? 'flex' : 'hidden md:flex'
              }`}>
                {/* Search field */}
                <div className="relative mb-3">
                  <span className="absolute inset-y-0 right-3.5 flex items-center text-gray-400">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="🔍 ابحث عن مشروب أو صنف بالاسم العربي أو الإنجليزي..."
                    value={psProductSearch}
                    onChange={(e) => setPsProductSearch(e.target.value)}
                    className="w-full bg-black/55 border border-gray-800 text-white rounded-2xl py-2.5 pr-10 pl-4 text-xs text-right focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/25 transition-all placeholder:text-gray-600 font-bold"
                  />
                </div>

                {/* Touch-Friendly Category pills list (Horizontal Scrollable) */}
                <div className="flex gap-2 overflow-x-auto pb-2.5 mb-4 scrollbar-none" dir="rtl">
                  <button
                    onClick={() => setSelectedPSCategory('ALL')}
                    className={`px-4.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedPSCategory === 'ALL'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30 font-black'
                        : 'bg-black/30 border border-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    كل الأصناف 🍽️
                  </button>
                  {psCategories.map(cat => {
                    const isSelected = selectedPSCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedPSCategory(cat.id)}
                        className={`px-4.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30 font-black'
                            : 'bg-black/30 border border-gray-900 text-gray-400 hover:text-white'
                        }`}
                      >
                        {cat.name_ar}
                      </button>
                    );
                  })}
                </div>

                {/* Products Grid */}
                <div className="flex-1 overflow-y-auto pr-1">
                  {filteredPSProducts.length === 0 ? (
                    <div className="text-center py-20 text-gray-600 text-xs font-bold">لا توجد منتجات مطابقة لخيارات البحث.</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      {filteredPSProducts.map(prod => {
                        const inCartCount = psProductsCart.find(item => item.product.id === prod.id)?.quantity || 0;
                        const isOutOfStock = prod.current_stock <= 0;

                        return (
                          <button
                            key={prod.id}
                            disabled={isOutOfStock}
                            onClick={() => handleAddToPSProductsCart(prod)}
                            className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-28 relative ${
                              inCartCount > 0
                                ? 'bg-purple-950/20 border-purple-500/60 shadow-lg shadow-purple-950/35 scale-[1.01]'
                                : isOutOfStock
                                  ? 'bg-black/20 border-gray-950 opacity-30 cursor-not-allowed'
                                  : 'bg-black/45 border-gray-900 hover:border-purple-900/55 hover:bg-black/60'
                            }`}
                          >
                            <div className="w-full">
                              <div className="flex justify-between items-start gap-1">
                                <span className="text-xs font-black text-white block truncate leading-relaxed">{prod.name_ar}</span>
                                {inCartCount > 0 && (
                                  <span className="bg-purple-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black font-mono">
                                    {inCartCount}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-500 block mt-0.5 font-bold truncate">{prod.name_en || 'No english name'}</span>
                            </div>

                            <div className="w-full flex justify-between items-end border-t border-gray-900/30 pt-2 mt-1">
                              <span className="text-[9px] text-gray-400 font-bold">متاح: <strong className="font-mono text-white font-extrabold">{prod.current_stock}</strong></span>
                              <span className="text-xs font-mono font-black text-gold-500">{prod.selling_price} ج.م</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Cart Summary Side Area (Left Panel) */}
              <div className={`w-full md:w-96 bg-black/25 p-5 flex flex-col justify-between overflow-hidden ${
                psMobileTab === 'cart' ? 'flex' : 'hidden md:flex'
              }`}>
                <div className="flex-1 flex flex-col overflow-hidden">
                  <h5 className="text-xs font-black text-gray-400 flex items-center gap-1.5 mb-4 border-b border-gray-900 pb-2">
                    <PlusCircle className="w-4 h-4 text-purple-400 animate-spin-slow" />
                    الطلبات المحددة بالجلسة ({psProductsCart.reduce((sum, item) => sum + item.quantity, 0)} صنف)
                  </h5>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {psProductsCart.length === 0 ? (
                      <div className="text-center py-20 text-gray-600 text-xs flex flex-col items-center justify-center gap-3">
                        <Coffee className="w-12 h-12 opacity-15 stroke-[1]" />
                        <span className="font-bold">سلة الطلبات فارغة للجلسة.</span>
                        <span className="text-[10px] text-gray-700">اختر من الأصناف باليمين لتعبئة السلة أو اتركها فارغة لحذف الطلبات الحالية.</span>
                      </div>
                    ) : (
                      psProductsCart.map(item => (
                        <div key={item.product.id} className="p-3 bg-black/55 border border-gray-900 rounded-2xl flex flex-col gap-2.5 animate-scale-in">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-black text-white block truncate leading-normal">{item.product.name_ar}</span>
                              
                              <div className="grid grid-cols-2 gap-2 mt-1.5">
                                {/* Price Modifier Input */}
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-gray-500 font-bold">السعر:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.product.selling_price}
                                    onChange={(e) => handleUpdatePSProductPrice(item.product.id, parseFloat(e.target.value) || 0)}
                                    className="w-14 bg-black/60 border border-gray-800 rounded-md py-0.5 px-1 text-center font-mono text-[10px] font-black text-gold-500 focus:outline-none focus:border-purple-600"
                                  />
                                </div>

                                {/* Discount Modifier Input */}
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-gray-500 font-bold">الخصم:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.product.selling_price * item.quantity}
                                    value={item.discount_amount || ''}
                                    placeholder="0"
                                    onChange={(e) => handleUpdatePSProductDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                                    className="w-14 bg-black/60 border border-gray-800 rounded-md py-0.5 px-1 text-center font-mono text-[10px] font-black text-red-400 focus:outline-none focus:border-purple-600"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Control Quantity Buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleUpdatePSProductsQty(item.product.id, item.quantity - 1)}
                                className="w-7 h-7 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-all hover:bg-gray-850"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-xs font-mono font-black text-white">{item.quantity}</span>
                              <button
                                disabled={item.quantity >= item.product.current_stock}
                                onClick={() => handleUpdatePSProductsQty(item.product.id, item.quantity + 1)}
                                className="w-7 h-7 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-all hover:bg-gray-850 disabled:opacity-30"
                              >
                                <span className="text-xs font-bold">+</span>
                              </button>
                              <button
                                onClick={() => handleRemoveFromPSProductsCart(item.product.id)}
                                className="w-7 h-7 rounded-lg bg-red-950/15 text-red-500 hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors mr-1 border border-red-900/20"
                                title="حذف بالكامل"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Item total price indicator */}
                          <div className="flex justify-between text-[10px] border-t border-gray-900/40 pt-1.5 text-gray-500">
                            <span>إجمالي الصنف المالي:</span>
                            <div className="flex items-center gap-1">
                              {item.discount_amount && item.discount_amount > 0 ? (
                                <>
                                  <span className="font-mono font-bold text-gray-550 line-through text-[9px]">{item.product.selling_price * item.quantity} ج.م</span>
                                  <span className="font-mono font-black text-purple-400">{Math.max(0, (item.product.selling_price * item.quantity) - item.discount_amount)} ج.م</span>
                                </>
                              ) : (
                                <span className="font-mono font-bold text-gray-300">{item.product.selling_price * item.quantity} ج.m</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Subtotal & Action buttons */}
                <div className="border-t border-gray-900 pt-4 mt-4 space-y-4">
                  <div className="bg-black/35 p-3 rounded-xl border border-gray-900 text-xs space-y-1.5 animate-fade-in">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-400 font-bold">إجمالي قيمة الطلبات الفعلي:</span>
                      <span className="text-gray-300 font-mono font-bold">
                        {psProductsCart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0)} ج.م
                      </span>
                    </div>
                    {psProductsCart.reduce((sum, item) => sum + (item.discount_amount || 0), 0) > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-red-400">
                        <span>إجمالي الخصومات على الأصناف:</span>
                        <span className="font-mono font-bold">
                          -{psProductsCart.reduce((sum, item) => sum + (item.discount_amount || 0), 0)} ج.م
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-t border-gray-900/40 pt-1.5">
                      <span className="text-gray-400 font-extrabold">صافي قيمة الطلبات بالجلسة:</span>
                      <span className="text-base font-mono font-black text-purple-400">
                        {psProductsCart.reduce((sum, item) => sum + (item.product.selling_price * item.quantity) - (item.discount_amount || 0), 0)} ج.م
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleSavePSProducts}
                      className="py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-purple-900/25 flex items-center justify-center gap-1"
                    >
                      ✓ إثبات وحفظ بالجلسة
                    </button>
                    <button
                      onClick={() => setShowPSProductsModal(false)}
                      className="py-3 px-4 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl text-xs transition-all cursor-pointer text-center"
                    >
                      إلغاء التراجع
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && deviceToDelete && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-6 shadow-2xl text-right">
            <h4 className="text-sm font-extrabold text-red-500 mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              تأكيد حذف جهاز البلايستيشن
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              هل أنت متأكد من رغبتك في حذف جهاز <strong className="text-white font-black">"{deviceToDelete.name}"</strong> نهائياً من قائمة الأجهزة؟ لا يمكن التراجع عن هذا الإجراء وسيتم مسح جميع الإعدادات الخاصة به.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleConfirmDeleteDevice}
                className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all cursor-pointer text-xs"
              >
                نعم، احذف الجهاز
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeviceToDelete(null);
                }}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

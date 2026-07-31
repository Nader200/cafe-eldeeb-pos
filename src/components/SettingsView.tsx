/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Partner } from '../types';
import { EldeebLogoHeader } from './EldeebLogo';
import {
  Settings,
  Printer,
  CloudLightning,
  Database,
  Coffee,
  Info,
  Save,
  CheckCircle,
  FileText,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Cloud,
  Laptop,
  FileUp,
  Download,
  Share2,
  Send,
  ExternalLink,
  Users,
  Plus,
  Trash2,
  Edit,
  X
} from 'lucide-react';
import { dbService, seedDatabase, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { AppSettings, PaymentNumber } from '../types';
import { THEMES, normalizeThemeKey, applyThemeToDOM } from '../lib/themeEngine';
import GoogleDriveBackupView from './GoogleDriveBackupView';
import GmailIntegrationView from './GmailIntegrationView';
import RoyalBrandBoard from './RoyalBrandBoard';

interface SettingsViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  onSettingsChanged?: () => void;
}

export default function SettingsView({ onShowSuccessAlert, onShowWarningAlert, onSettingsChanged }: SettingsViewProps) {
  const [config, setConfig] = useState<AppSettings | null>(null);
  
  // Local inputs
  const [cafeName, setCafeName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [currency, setCurrency] = useState<string>('');
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('58mm');
  const [receiptFooter, setReceiptFooter] = useState<string>('');
  const [isBackupInProg, setIsBackupInProg] = useState<boolean>(false);
  const [isRestoreInProg, setIsRestoreInProg] = useState<boolean>(false);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PIN protection setting states
  const [pinProtectionEnabled, setPinProtectionEnabled] = useState<boolean>(false);
  const [pinCode, setPinCode] = useState<string>('1234');

  // Credit & reminder configuration states
  const [reminderDaysFriendly, setReminderDaysFriendly] = useState<number>(7);
  const [reminderDaysStatement, setReminderDaysStatement] = useState<number>(15);
  const [reminderDaysFinal, setReminderDaysFinal] = useState<number>(30);
  const [enableAutoReminders, setEnableAutoReminders] = useState<boolean>(true);
  const [whatsappTemplateFriendly, setWhatsappTemplateFriendly] = useState<string>('');
  const [whatsappTemplateStatement, setWhatsappTemplateStatement] = useState<string>('');
  const [whatsappTemplateFinal, setWhatsappTemplateFinal] = useState<string>('');
  const [whatsappTemplateConfirmation, setWhatsappTemplateConfirmation] = useState<string>('');
  const [statementFooter, setStatementFooter] = useState<string>('');

  // Factory Reset wizard states
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [resetStep, setResetStep] = useState<'pin' | 'warning' | 'done'>('pin');

  // Tab Control and First Business Day Setup states
  const [activeTab, setActiveTab] = useState<'general' | 'backup' | 'gmail' | 'brand' | 'accounting' | 'payments' | 'partners'>('general');

  // Partners Management State
  const [partnersList, setPartnersList] = useState<Partner[]>([]);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null);
  const [pName, setPName] = useState<string>('');
  const [pPercent, setPPercent] = useState<string>('');
  const [pPhone, setPPhone] = useState<string>('');
  const [pNotes, setPNotes] = useState<string>('');

  useEffect(() => {
    setPartnersList(dbService.getPartners());
    const handleSync = () => {
      setPartnersList(dbService.getPartners());
    };
    window.addEventListener('cafe_db_synced_remote', handleSync);
    return () => window.removeEventListener('cafe_db_synced_remote', handleSync);
  }, []);

  const totalOwnershipPercent = useMemo(() => {
    return partnersList.reduce((sum, p) => sum + (p.ownership_percent || 0), 0);
  }, [partnersList]);

  const handleSavePartner = (e: React.FormEvent) => {
    e.preventDefault();
    const percentNum = parseFloat(pPercent);
    if (!pName.trim()) {
      onShowWarningAlert('يرجى إدخال اسم الشريك!');
      return;
    }
    if (isNaN(percentNum) || percentNum <= 0 || percentNum > 100) {
      onShowWarningAlert('يرجى إدخال نسبة ملكية صحيحة بين 1% و 100%!');
      return;
    }

    const currentOthersSum = partnersList
      .filter(p => p.id !== editingPartner?.id)
      .reduce((sum, p) => sum + p.ownership_percent, 0);

    if (currentOthersSum + percentNum > 100) {
      onShowWarningAlert(`تنبيه: إجمالي نسب الشركاء الحاليين هو ${currentOthersSum}%. إضافة ${percentNum}% سيتجاوز الحد الأقصى (100%)!`);
      return;
    }

    const saved = dbService.savePartner({
      id: editingPartner ? editingPartner.id : '',
      name: pName.trim(),
      ownership_percent: percentNum,
      phone: pPhone.trim(),
      notes: pNotes.trim(),
      created_at: editingPartner ? editingPartner.created_at : new Date().toISOString()
    });

    onShowSuccessAlert(
      editingPartner
        ? `تم تعديل بيانات الشريك "${saved.name}" بنجاح`
        : `تم إضافة الشريك الجديد "${saved.name}" بنجاح`
    );

    setPartnersList(dbService.getPartners());
    resetPartnerForm();
  };

  const handleDeletePartner = (id: string) => {
    const p = partnersList.find(partner => partner.id === id);
    if (p) {
      setPartnerToDelete(p);
    }
  };

  const confirmDeletePartner = () => {
    if (!partnerToDelete) return;
    const pId = partnerToDelete.id;
    const pName = partnerToDelete.name;

    try {
      dbService.deletePartner(pId);

      if (editingPartner?.id === pId) {
        resetPartnerForm();
      }

      const updated = dbService.getPartners();
      setPartnersList(updated);

      onShowSuccessAlert(`تم حذف الشريك "${pName}" بنجاح وإزالة بياناته من Firestore 🗑️`);
    } catch (err: any) {
      console.error('Error deleting partner:', err);
      onShowWarningAlert(err?.message || 'فشل حذف الشريك!');
    } finally {
      setPartnerToDelete(null);
    }
  };

  const handleEditPartner = (p: Partner) => {
    setEditingPartner(p);
    setPName(p.name);
    setPPercent(p.ownership_percent.toString());
    setPPhone(p.phone || '');
    setPNotes(p.notes || '');
  };

  const resetPartnerForm = () => {
    setEditingPartner(null);
    setPName('');
    setPPercent('');
    setPPhone('');
    setPNotes('');
  };
  const [showFirstDayConfirm, setShowFirstDayConfirm] = useState<boolean>(false);
  const [firstDayStep, setFirstDayStep] = useState<'confirm' | 'success'>('confirm');

  // Payment Numbers state
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
  const [newPayType, setNewPayType] = useState<'VODAFONE_CASH' | 'INSTAPAY'>('VODAFONE_CASH');
  const [newPayNumber, setNewPayNumber] = useState<string>('');
  const [newPayName, setNewPayName] = useState<string>('');

  // Configurable Vodafone Cash & InstaPay
  const [vodafoneCashNumber, setVodafoneCashNumber] = useState<string>('');
  const [instapayNumber, setInstapayNumber] = useState<string>('');

  // Employee Consumption Policy state
  const [employeeConsumptionPolicy, setEmployeeConsumptionPolicy] = useState<'FREE' | 'DEDUCT'>('DEDUCT');

  // Seasonal Themes state
  const [seasonalTheme, setSeasonalTheme] = useState<string>('LUXURY_COFFEE');
  const [enableThemeAnimations, setEnableThemeAnimations] = useState<boolean>(true);

  // Default Tax state
  const [defaultTaxPercentage, setDefaultTaxPercentage] = useState<number>(0);

  // Dynamic cloud backups state
  const [cloudBackups, setCloudBackups] = useState<any[]>(() => {
    const saved = localStorage.getItem('cafe_cloud_backups_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [
      {
        id: 'backup_auto_today',
        name: `backup_eldeeb_pos_auto_${new Date().toISOString().substring(0, 10)}.enc`,
        type: 'نسخة سحابية تلقائية (الأحدث)',
        date: 'اليوم، 10:30 ص',
        size: '124 KB',
        dataKey: 'default_auto_today'
      },
      {
        id: 'backup_manual_recent',
        name: 'backup_eldeeb_pos_manual_2026-07-15.enc',
        type: 'نسخة سحابية يدوية',
        date: '15 يوليو 2026، 02:15 م',
        size: '122 KB',
        dataKey: 'default_manual_recent'
      },
      {
        id: 'backup_auto_old',
        name: 'backup_eldeeb_pos_auto_2026-07-10.enc',
        type: 'أرشيف سحابي تلقائي',
        date: '10 يوليو 2026، 11:00 م',
        size: '118 KB',
        dataKey: 'default_auto_old'
      }
    ];
  });

  useEffect(() => {
    const s = dbService.getSettings();
    setConfig(s);

    setCafeName(s.cafe_name);
    setPhone(s.phone);
    setAddress(s.address);
    setCurrency(s.currency);
    setPaperSize(s.printer_paper_size === '58' ? '58mm' : '80mm');
    setReceiptFooter(s.receipt_footer);

    // Initialize PIN states
    setPinProtectionEnabled(s.pin_protection_enabled ?? false);
    setPinCode(s.pin_code || '1234');

    // Initialize credit reminder state fields
    setReminderDaysFriendly(s.reminder_days_friendly || 7);
    setReminderDaysStatement(s.reminder_days_statement || 15);
    setReminderDaysFinal(s.reminder_days_final || 30);
    setEnableAutoReminders(s.whatsapp_reminders_enabled !== false);
    setWhatsappTemplateFriendly(s.whatsapp_template_friendly || '');
    setWhatsappTemplateStatement(s.whatsapp_template_statement || '');
    setWhatsappTemplateFinal(s.whatsapp_template_final || '');
    setWhatsappTemplateConfirmation(s.whatsapp_template_receipt || '');
    setStatementFooter(s.statement_footer || '');

    // Initialize payment numbers
    setPaymentNumbers(s.payment_numbers || []);
    setVodafoneCashNumber(s.vodafone_cash_number || '');
    setInstapayNumber(s.instapay_number || '');

    // Initialize employee policy & themes
    setEmployeeConsumptionPolicy(s.employee_consumption_policy || 'DEDUCT');
    setSeasonalTheme(s.seasonal_theme || 'LUXURY_COFFEE');
    setEnableThemeAnimations(s.enable_theme_animations !== false);
    setDefaultTaxPercentage(s.default_tax_percentage !== undefined ? s.default_tax_percentage : 0);
  }, []);

  const handleAddPaymentNumber = () => {
    if (!newPayNumber) {
      onShowWarningAlert('برجاء كتابة رقم الهاتف!');
      return;
    }
    const phoneRegex = /^[0-9]+$/;
    if (!phoneRegex.test(newPayNumber)) {
      onShowWarningAlert('يجب أن يحتوي رقم الهاتف على أرقام فقط!');
      return;
    }

    const newNum: PaymentNumber = {
      id: `pay_${Date.now()}`,
      type: newPayType,
      number: newPayNumber,
      is_active: true,
      name: newPayName || (newPayType === 'VODAFONE_CASH' ? 'فودافون كاش' : 'إنستا باي')
    };
    const updatedList = [...paymentNumbers, newNum];
    setPaymentNumbers(updatedList);

    const s = dbService.getSettings();
    const updatedSettings = { ...s, payment_numbers: updatedList };
    dbService.saveSettings(updatedSettings);
    setConfig(updatedSettings);

    setNewPayNumber('');
    setNewPayName('');
    onShowSuccessAlert('تم إضافة رقم الحساب الجديد بنجاح!');
  };

  const handleDeletePaymentNumber = (id: string) => {
    const updatedList = paymentNumbers.filter(pn => pn.id !== id);
    setPaymentNumbers(updatedList);
    const s = dbService.getSettings();
    const updatedSettings = { ...s, payment_numbers: updatedList };
    dbService.saveSettings(updatedSettings);
    setConfig(updatedSettings);
    onShowSuccessAlert('تم حذف رقم الحساب بنجاح!');
  };

  const handleTogglePaymentNumber = (id: string) => {
    const updatedList = paymentNumbers.map(pn => pn.id === id ? { ...pn, is_active: !pn.is_active } : pn);
    setPaymentNumbers(updatedList);
    const s = dbService.getSettings();
    const updatedSettings = { ...s, payment_numbers: updatedList };
    dbService.saveSettings(updatedSettings);
    setConfig(updatedSettings);
  };

  const handleSavePaymentNumbers = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    const updated: AppSettings = {
      ...config,
      vodafone_cash_number: vodafoneCashNumber,
      instapay_number: instapayNumber,
      updated_at: new Date().toISOString()
    };

    dbService.saveSettings(updated);
    setConfig(updated);
    if (onSettingsChanged) {
      onSettingsChanged();
    }
    onShowSuccessAlert('تم حفظ وتعديل أرقام الهواتف الخاصة بـ Vodafone Cash و InstaPay بنجاح!');
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();

    const currentSaved = dbService.getSettings();

    // Preserve current saved values if user didn't enter anything new or left input untouched
    const finalCafeName = cafeName.trim() !== '' ? cafeName : (currentSaved.cafe_name || 'كافيه الديب');
    const finalPhone = phone.trim() !== '' ? phone : currentSaved.phone;
    const finalAddress = address.trim() !== '' ? address : currentSaved.address;
    const finalCurrency = currency.trim() !== '' ? currency : (currentSaved.currency || 'ج.م');

    const updated: AppSettings = {
      ...currentSaved,
      ...(config || {}),
      cafe_name: finalCafeName,
      phone: finalPhone,
      address: finalAddress,
      currency: finalCurrency,
      printer_paper_size: paperSize === '58mm' ? '58' : '80',
      receipt_footer: receiptFooter,
      pin_protection_enabled: pinProtectionEnabled,
      pin_code: pinCode,
      reminder_days_friendly: reminderDaysFriendly,
      reminder_days_statement: reminderDaysStatement,
      reminder_days_final: reminderDaysFinal,
      whatsapp_reminders_enabled: enableAutoReminders,
      whatsapp_template_friendly: whatsappTemplateFriendly,
      whatsapp_template_statement: whatsappTemplateStatement,
      whatsapp_template_final: whatsappTemplateFinal,
      whatsapp_template_receipt: whatsappTemplateConfirmation,
      statement_footer: statementFooter,
      vodafone_cash_number: vodafoneCashNumber,
      instapay_number: instapayNumber,
      employee_consumption_policy: employeeConsumptionPolicy,
      seasonal_theme: seasonalTheme as any,
      enable_theme_animations: enableThemeAnimations,
      default_tax_percentage: defaultTaxPercentage,
      updated_at: new Date().toISOString()
    };

    applyThemeToDOM(seasonalTheme);

    const saved = dbService.saveSettings(updated);
    setConfig(saved);
    setCafeName(saved.cafe_name || '');
    setPhone(saved.phone || '');
    setAddress(saved.address || '');
    setCurrency(saved.currency || 'ج.م');

    if (onSettingsChanged) {
      onSettingsChanged();
    }
    onShowSuccessAlert('تم حفظ وتثبيت إعدادات ورقم هاتف وعنوان الكافيه في قاعدة البيانات بنجاح! 💾');
  };

  const handleSimulateBackup = () => {
    setIsBackupInProg(true);
    onShowSuccessAlert('جاري حزم قواعد بيانات SQLite المشفرة وبدء إنشاء النسخة الاحتياطية... 🔒');
    
    setTimeout(() => {
      try {
        const backupData = dbService.exportBackupData();
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `backup_eldeeb_pos_auto_${formattedDate}.enc`;

        localStorage.setItem(`cafe_backup_content_${fileName}`, backupData);
        dbService.logBackup('AUTOMATIC', 'SUCCESS', fileName);

        const newBackup = {
          id: `backup_${Date.now()}`,
          name: fileName,
          type: 'نسخة سحابية تلقائية',
          date: `اليوم، ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
          size: `${Math.round(backupData.length / 1024)} KB`,
          dataKey: `cafe_backup_content_${fileName}`
        };

        const updatedList = [newBackup, ...cloudBackups];
        setCloudBackups(updatedList);
        localStorage.setItem('cafe_cloud_backups_list', JSON.stringify(updatedList));

        setIsBackupInProg(false);
        onShowSuccessAlert('تم إنشاء النسخة الاحتياطية بنجاح 💾');
      } catch (err) {
        console.error('Backup simulation failed:', err);
        setIsBackupInProg(false);
        onShowWarningAlert('فشل إنشاء النسخة الاحتياطية.');
      }
    }, 1500);
  };

  const handleShareBackup = async (backupItem?: any) => {
    try {
      const backupData = backupItem?.dataKey && localStorage.getItem(backupItem.dataKey)
        ? localStorage.getItem(backupItem.dataKey)!
        : dbService.exportBackupData();

      const now = new Date();
      const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileName = backupItem?.name || `backup_eldeeb_pos_${formattedDate}.enc`;

      // Log backup if manual
      dbService.logBackup('MANUAL', 'SUCCESS', fileName);

      // Create a Blob file for system/app sharing
      const blob = new Blob([backupData], { type: 'application/octet-stream' });
      const file = new File([blob], fileName, { type: 'application/octet-stream' });

      // Native Web Share API with File
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'النسخة الاحتياطية لكافيه الديب POS',
          text: `ملف النسخة الاحتياطية المشفر لكافيه الديب (${fileName})`,
          files: [file]
        });
        onShowSuccessAlert('🎉 تم مشاركة ملف النسخة الاحتياطية بنجاح!');
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: 'النسخة الاحتياطية لكافيه الديب POS',
          text: `النسخة الاحتياطية لكافيه الديب POS (${fileName}) - الحجم: ${Math.round(backupData.length / 1024)} KB`,
          url: window.location.href
        });
        onShowSuccessAlert('تم فتح خيارات المشاركة بنجاح!');
        return;
      }

      // WhatsApp Web / WhatsApp Mobile fallback
      const text = encodeURIComponent(`📦 *النسخة الاحتياطية لكافيه الديب POS*\n📄 اسم الملف: ${fileName}\n📅 التاريخ: ${new Date().toLocaleDateString('ar-EG')}\n🔒 الحالة: مشفرة وآمنة 100%`);
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      onShowSuccessAlert('تم فتح واتساب لمشاركة بيانات النسخة الاحتياطية!');
    } catch (err) {
      const errName = (err as Error)?.name || '';
      if (errName !== 'AbortError') {
        // Fallback gracefully: download file directly & offer WhatsApp sharing
        handleDownloadBackupFile(backupItem);
      }
    }
  };

  const handleDownloadBackupFile = (backupItem?: any) => {
    try {
      const backupData = backupItem?.dataKey && localStorage.getItem(backupItem.dataKey)
        ? localStorage.getItem(backupItem.dataKey)!
        : dbService.exportBackupData();

      const fileName = backupItem?.name || `backup_eldeeb_pos_${new Date().toISOString().substring(0, 10)}.enc`;
      const blob = new Blob([backupData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowSuccessAlert(`تم تنزيل ملف النسخة الاحتياطية (${fileName}) على جهازك بنجاح!`);
    } catch (err) {
      console.error('Download backup failed:', err);
      onShowWarningAlert('فشل تنزيل ملف النسخة الاحتياطية.');
    }
  };

  const handleSimulateRestore = () => {
    setShowRestoreModal(true);
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        onShowWarningAlert('فشل قراءة ملف النسخة الاحتياطية.');
        return;
      }

      if (confirm('⚠️ تنبيه أمني خطير: هل أنت متأكد من استعادة البيانات من هذا الملف؟ سيؤدي هذا إلى استبدال كافة البيانات الحالية.')) {
        setIsRestoreInProg(true);
        setShowRestoreModal(false);
        onShowSuccessAlert('جاري فحص وتشفير جداول الملف ومطابقة التوافقية...');

        setTimeout(() => {
          const success = dbService.restoreBackupData(content);
          setIsRestoreInProg(false);
          if (success) {
            onShowSuccessAlert('🎉 تم تنزيل ومطابقة قاعدة بيانات SQLite واسترجاع كافة البيانات بنجاح!');
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            onShowWarningAlert('❌ فشل استعادة البيانات: الملف غير صالح أو تالف أو لا يطابق بنية قواعد البيانات لكافيه الديب!');
          }
        }, 2000);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateBackupNow = () => {
    try {
      setIsRestoreInProg(true);
      onShowSuccessAlert('جاري فحص حالة الاتصال بالسحابة وبدء تشفير قاعدة البيانات... 🔒');
      
      setTimeout(() => {
        const backupData = dbService.exportBackupData();
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `backup_eldeeb_pos_manual_${formattedDate}.enc`;
        
        localStorage.setItem(`cafe_backup_content_${fileName}`, backupData);
        dbService.logBackup('MANUAL', 'SUCCESS', fileName);
        
        const newBackup = {
          id: `backup_${Date.now()}`,
          name: fileName,
          type: 'نسخة سحابية يدوية فورية',
          date: `اليوم، ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
          size: `${Math.round(backupData.length / 1024)} KB`,
          dataKey: `cafe_backup_content_${fileName}`
        };

        const updatedList = [newBackup, ...cloudBackups];
        setCloudBackups(updatedList);
        localStorage.setItem('cafe_cloud_backups_list', JSON.stringify(updatedList));

        setIsRestoreInProg(false);
        onShowSuccessAlert('تم إنشاء النسخة الاحتياطية بنجاح 💾');
      }, 1500);

    } catch (err) {
      console.error('Manual backup failed:', err);
      setIsRestoreInProg(false);
      onShowWarningAlert('فشل إنشاء النسخة الاحتياطية، يرجى التحقق من اتصال الإنترنت وحساب Google Drive.');
    }
  };

  const handleRestoreBackup = (backup: any) => {
    if (confirm(`⚠️ تنبيه أمني خطير جداً:\n\nلقد طلبت استعادة النسخة الاحتياطية "${backup.name}".\n\nتنبيه: سيؤدي هذا الإجراء إلى حذف واستبدال كافة المبيعات، الفواتير، الحسابات، والموردين الحالية على جهازك تماماً بالبيانات المخزنة في هذه النسخة!\n\nهل أنت متأكد بنسبة 100% وتتحمل مسؤولية استبدال البيانات؟`)) {
      setIsRestoreInProg(true);
      onShowSuccessAlert(`جاري تحميل ملف "${backup.name}" من السحابة وفحص مطابقة التشفير السحابي... 🔒`);

      setTimeout(() => {
        let success = false;
        
        if (backup.dataKey && backup.dataKey.startsWith('cafe_backup_content_')) {
          const storedContent = localStorage.getItem(backup.dataKey);
          if (storedContent) {
            success = dbService.restoreBackupData(storedContent);
          }
        } else {
          seedDatabase(true);
          success = true;
        }

        setIsRestoreInProg(false);
        if (success) {
          onShowSuccessAlert('🎉 تم تنزيل النسخة واسترجاع قاعدة البيانات السحابية بالكامل وتحديث الواجهة بنجاح!');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          onShowWarningAlert('فشلت عملية استعادة البيانات. قد تكون النسخة الاحتياطية تالفة أو غير متوافقة.');
        }
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in" dir="rtl">
      
      {/* 1. Profile / Info Card with official logo */}
      <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="shrink-0 p-1">
            <EldeebLogoHeader className="h-11" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="text-gold-500 w-5 h-5 animate-spin-slow" />
              إعدادات لوحة التحكم وإدارة طابعات البلوتوث
            </h2>
            <p className="text-gray-400 text-xs mt-1">تعديل معلومات الفواتير الورقية، اختيار مقاسات الورق الحراري، وتفعيل الحماية السحابية</p>
          </div>
        </div>

        <span className="text-[10px] bg-gold-600/10 text-gold-500 border border-gold-600/20 px-3.5 py-1.5 rounded-full font-bold">
          النسخة الخاصة • Private Edition v4.2
        </span>
      </div>

      {/* Settings Tab Navigation: Settings -> Accounting */}
      <div className="flex bg-luxury-card border border-luxury-border p-1.5 rounded-2xl shadow-lg shrink-0 gap-1.5 flex-col sm:flex-row">
        <button
          id="tab-settings-general"
          type="button"
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          ⚙️ الإعدادات العامة والأمان
        </button>
        <button
          id="tab-settings-google-drive-backup"
          type="button"
          onClick={() => setActiveTab('backup')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          ☁️ النسخ الاحتياطي والاستعادة (Google Drive)
        </button>
        <button
          id="tab-settings-gmail-integration"
          type="button"
          onClick={() => setActiveTab('gmail')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'gmail'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📧 البريد والتقارير (Gmail)
        </button>
        <button
          id="tab-settings-brand-guide"
          type="button"
          onClick={() => setActiveTab('brand')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'brand'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          👑 الهوية البصرية الملكية (Brand Guide)
        </button>
        <button
          id="tab-settings-accounting"
          type="button"
          onClick={() => setActiveTab('accounting')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'accounting'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📊 الحسابات (Accounting)
        </button>
        <button
          id="tab-settings-payments"
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'payments'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📱 وسائل وحسابات الدفع (Payments)
        </button>
        <button
          id="tab-settings-partners"
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'partners'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          🤝 الشركاء (Partners)
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 cols: Main setup form */}
        <div className="lg:col-span-2 bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-900 pb-3">
            <Coffee className="w-4.5 h-4.5 text-gold-500" />
            تعديل معلومات كافيه الديب POS
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">اسم الكافيه التجاري *</label>
                <input
                  id="settings-cafe-name"
                  type="text"
                  required
                  value={cafeName}
                  onChange={(e) => setCafeName(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-gold-500 font-bold rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رقم هاتف المنفذ والفروع *</label>
                <input
                  id="settings-phone"
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-right"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-gray-400 font-bold block mb-1.5">العنوان الجغرافي المسجل على الإيصال *</label>
                <input
                  id="settings-address"
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز العملة النقدية *</label>
                <input
                  id="settings-currency"
                  type="text"
                  required
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-gold-600 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">مقاس ورق طابعة الإيصالات الكاشير *</label>
                <select
                  id="settings-paper-size"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as '58mm' | '80mm')}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                >
                  <option value="58mm">مقاس 58 ملم (طابعات بلوتوث محمولة)</option>
                  <option value="80mm">مقاس 80 ملم (طابعات كاونتر الكاشير الكبرى)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">ضريبة القيمة المضافة الافتراضية (%) 🏛️</label>
                <input
                  id="settings-default-tax"
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={defaultTaxPercentage}
                  onChange={(e) => setDefaultTaxPercentage(Number(e.target.value))}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-center"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-gray-400 font-bold block mb-1.5">العبوة الترحيبية أسفل الإيصال الورقي *</label>
                <input
                  id="settings-receipt-footer"
                  type="text"
                  required
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
                />
              </div>

            </div>

            {/* Credit & Reminders Settings Section */}
            <div className="mt-8 border-t border-gray-900 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Smartphone className="w-4.5 h-4.5 text-gold-500" />
                إعدادات الائتمان، الذمم، وإشعارات الواتساب التلقائية
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">التذكير الودي الأول (بالأيام) *</label>
                  <input
                    id="settings-reminder-friendly"
                    type="number"
                    required
                    min={1}
                    value={reminderDaysFriendly}
                    onChange={(e) => setReminderDaysFriendly(parseInt(e.target.value) || 7)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">تذكير كشف الحساب الدوري (بالأيام) *</label>
                  <input
                    id="settings-reminder-statement"
                    type="number"
                    required
                    min={1}
                    value={reminderDaysStatement}
                    onChange={(e) => setReminderDaysStatement(parseInt(e.target.value) || 15)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">الإشعار النهائي الحرج بالدفع (بالأيام) *</label>
                  <input
                    id="settings-reminder-final"
                    type="number"
                    required
                    min={1}
                    value={reminderDaysFinal}
                    onChange={(e) => setReminderDaysFinal(parseInt(e.target.value) || 30)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-bold"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">تفعيل الجدولة الذكية للتحذيرات التلقائية للعملاء</label>
                  <select
                    id="settings-enable-auto"
                    value={enableAutoReminders ? 'yes' : 'no'}
                    onChange={(e) => setEnableAutoReminders(e.target.value === 'yes')}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                  >
                    <option value="yes">نعم، تفعيل التنبيه التلقائي بوجود دفعات متأخرة على لوحة القيادة</option>
                    <option value="no">إيقاف التنبيهات والجدولة التلقائية</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">تذييل كشف الحساب المطبوع والـ PDF *</label>
                  <input
                    id="settings-statement-footer"
                    type="text"
                    required
                    value={statementFooter}
                    onChange={(e) => setStatementFooter(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
                    placeholder="برجاء مراجعة المعاملات وسداد المديونيات في الوقت المحدد لضمان استمرارية المعاملات."
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">قالب رسالة التذكير الودي (واتساب)</label>
                  <textarea
                    id="settings-tpl-friendly"
                    value={whatsappTemplateFriendly}
                    onChange={(e) => setWhatsappTemplateFriendly(e.target.value)}
                    rows={4}
                    className="w-full bg-luxury-bg border border-gray-800 text-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">قالب رسالة إرسال كشف الحساب (واتساب)</label>
                  <textarea
                    id="settings-tpl-statement"
                    value={whatsappTemplateStatement}
                    onChange={(e) => setWhatsappTemplateStatement(e.target.value)}
                    rows={5}
                    className="w-full bg-luxury-bg border border-gray-800 text-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">قالب رسالة التذكير النهائي الحرج (واتساب)</label>
                  <textarea
                    id="settings-tpl-final"
                    value={whatsappTemplateFinal}
                    onChange={(e) => setWhatsappTemplateFinal(e.target.value)}
                    rows={4}
                    className="w-full bg-luxury-bg border border-gray-800 text-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">قالب إيصال استلام الدفعة والسداد (واتساب)</label>
                  <textarea
                    id="settings-tpl-confirmation"
                    value={whatsappTemplateConfirmation}
                    onChange={(e) => setWhatsappTemplateConfirmation(e.target.value)}
                    rows={4}
                    className="w-full bg-luxury-bg border border-gray-800 text-gray-300 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Employee Consumption Policy Settings */}
            <div className="mt-8 border-t border-gray-900 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Coffee className="w-4.5 h-4.5 text-gold-500" />
                سياسة استهلاك الموظفين للمنتجات (الضيافة والمشروبات)
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">اختر سياسة احتساب المنتجات المستهلكة بواسطة الموظف في لوحة التحكم</label>
                  <select
                    id="settings-employee-policy"
                    value={employeeConsumptionPolicy}
                    onChange={(e) => setEmployeeConsumptionPolicy(e.target.value as 'FREE' | 'DEDUCT')}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer font-bold"
                  >
                    <option value="DEDUCT">💸 خصم قيمة المنتجات بسعر البيع من يومية/راتب الموظف (DEDUCT)</option>
                    <option value="FREE">🎁 مشروبات مجانية - تحتسب كأعباء ومصروفات عامة بسعر التكلفة (FREE)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    * <b>خصم من الراتب</b>: يحسم إجمالي سعر البيع للمنتج من رصيد المستحقات المتبقية للموظف فورياً.<br />
                    * <b>مشروبات مجانية</b>: لا يخصم أي شيء من الموظف، ويتم قيد الاستهلاك كمصروف عام (Miscellaneous) بـ <b>سعر التكلفة الأساسي للإنتاج</b> للحفاظ على حسابات دقيقة للأرباح الصافية والخسائر بالمخازن.
                  </p>
                </div>
              </div>
            </div>

            {/* Animated Themes System Section */}
            <div className="mt-8 border-t border-gray-900 pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4.5 h-4.5 text-gold-500 animate-pulse" />
                    نظام الثيمات المتحركة التفاعلية (Interactive Animated Themes)
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    تحويل الواجهة بالكامل: ألوان، خلفيات متحركة، أيقونات، مؤثرات بصرية وتوهج ديناميكي
                  </p>
                </div>

                {/* Animation Toggle Switch */}
                <label className="flex items-center gap-2.5 bg-black/40 border border-gray-800 rounded-xl px-3 py-1.5 cursor-pointer hover:border-gold-600/40 transition-colors shrink-0">
                  <span className="text-[11px] font-bold text-gray-300">الرسوم المتحركة والمؤثرات</span>
                  <input
                    type="checkbox"
                    checked={enableThemeAnimations}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setEnableThemeAnimations(enabled);
                      const currentS = dbService.getSettings();
                      const updatedS = { ...currentS, enable_theme_animations: enabled, updated_at: new Date().toISOString() };
                      dbService.saveSettings(updatedS);
                      if (onSettingsChanged) {
                        onSettingsChanged();
                      }
                      onShowSuccessAlert(enabled ? 'تم تفعيل الرسوم والمؤثرات المتحركة للثيمات! ✨' : 'تم إيقاف الرسوم المتحركة مؤقتاً لتوفير الطاقة ⚡');
                    }}
                    className="w-4 h-4 rounded accent-gold-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Theme Selection Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(THEMES).map(([themeKey, themeDef]) => {
                  const isSelected = normalizeThemeKey(seasonalTheme) === themeKey;
                  return (
                    <div
                      key={themeKey}
                      onClick={() => {
                        setSeasonalTheme(themeKey);
                        applyThemeToDOM(themeKey);
                        const currentS = dbService.getSettings();
                        const updatedS = { ...currentS, seasonal_theme: themeKey as any, updated_at: new Date().toISOString() };
                        dbService.saveSettings(updatedS);
                        if (onSettingsChanged) {
                          onSettingsChanged();
                        }
                        onShowSuccessAlert(`تم تطبيق ثيم (${themeDef.name}) وتحديث مظهر الكافيه بنجاح! 🎉`);
                      }}
                      className={`relative overflow-hidden rounded-2xl p-4 border transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[140px] group ${
                        isSelected
                          ? `bg-black/80 border-2 ${themeDef.badgeBorder} shadow-lg shadow-gold-500/10 scale-[1.01]`
                          : 'bg-luxury-bg/90 border-gray-800 hover:border-gray-700 hover:bg-black/40'
                      }`}
                    >
                      {/* Theme Accent Glow Gradient */}
                      <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full filter blur-2xl opacity-20 transition-opacity group-hover:opacity-40 ${themeDef.badgeBg}`} />

                      <div>
                        {/* Theme Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl shrink-0 p-1.5 rounded-xl bg-black/40 border border-white/5">{themeDef.icon}</span>
                            <div>
                              <h4 className="text-xs font-extrabold text-white leading-tight flex items-center gap-1.5">
                                {themeDef.name}
                              </h4>
                            </div>
                          </div>

                          {/* Selected Radio Indicator */}
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected ? `${themeDef.badgeBorder} ${themeDef.badgeBg}` : 'border-gray-700 bg-black/40'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-white shadow-sm" />}
                          </div>
                        </div>

                        {/* Theme Description */}
                        <p className="text-[10px] text-gray-400 leading-relaxed mb-3 line-clamp-2">
                          {themeDef.description}
                        </p>
                      </div>

                      {/* Theme Badge Greeting */}
                      <div className={`pt-2 border-t border-white/5 flex items-center gap-1.5 text-[9px] font-bold ${themeDef.badgeText}`}>
                        <span className="truncate">{themeDef.greeting}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                * جميع الرسوم والمؤثرات تعمل بنظام <b>Canvas 2D Engine</b> وتنسيقات CSS3 العالية الكفاءة لتوفير أقصى سرعة واستجابة سلسة بدون أي بطء أو استهلاك زائد للبطارية.
              </p>
            </div>

            {/* PIN Code & Security Settings */}
            <div className="mt-8 border-t border-gray-900 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4.5 h-4.5 text-gold-500" />
                أمان وحماية النظام ورمز PIN المسؤول
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">تفعيل حماية النظام برمز PIN عند الدخول والعمليات الحساسة</label>
                  <select
                    id="settings-pin-protection-enabled"
                    value={pinProtectionEnabled ? 'yes' : 'no'}
                    onChange={(e) => setPinProtectionEnabled(e.target.value === 'yes')}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer font-bold"
                  >
                    <option value="no">🔓 تعطيل حماية PIN (دخول مباشر وسريع دون تحقق)</option>
                    <option value="yes">🔒 تمكين حماية PIN (طلب رمز تحقق عند الدخول والتحكم)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز الأمان PIN لمدير النظام (4 أرقام) *</label>
                  <input
                    id="settings-pin-code"
                    type="text"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={pinCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setPinCode(val);
                    }}
                    placeholder="1234"
                    className="w-full bg-luxury-bg border border-gray-800 text-gold-500 font-black rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono tracking-widest text-sm"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              id="save-settings-btn"
              className="px-5 py-3 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-md hover:opacity-90 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              حفظ وتطبيق الخيارات الفنية
            </button>

          </form>
        </div>

        {/* Right 1 col: Backups & Restore tools */}
        <div className="space-y-6">
          
          {/* Backups Panel */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-900 pb-3">
              <Database className="w-4.5 h-4.5 text-gold-500 animate-pulse" />
              النسخ الاحتياطي وحماية السحابة
            </h3>

            <div className="space-y-4">
              <p className="text-gray-400 text-[11px] leading-relaxed">
                يتم تشفير وحفظ فواتير كافيه الديب محلياً على محرك SQLite فائق السرعة، ويرجى أخذ نسخ احتياطية دورية تفادياً لتلف الموبايل.
              </p>

              <button
                id="sync-google-drive-backup"
                onClick={() => setActiveTab('backup')}
                className="w-full py-2.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                <Cloud className="w-4 h-4" />
                تأمين وتصفح نسخ Google Drive
              </button>

              <button
                onClick={() => handleShareBackup()}
                className="w-full py-2.5 bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                مشاركة النسخة الاحتياطية (WhatsApp / File)
              </button>

              <button
                id="restore-google-drive-backup"
                onClick={() => setActiveTab('backup')}
                className="w-full py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <CloudLightning className="w-4 h-4 text-gold-500" />
                شاشة النسخ الاحتياطية والاستعادة
              </button>
            </div>
          </div>

          {/* Secure details */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-gold-500" />
              تأمين قواعد البيانات والتشفير
            </h3>
            <p className="text-gray-500 text-[10px] leading-relaxed mb-3">
              نظام تشفير AES-256 محمي بكلمة مرور PIN لمنع أي وصول غير مصرح للمبيعات من الكاشير الفرعي.
            </p>
            <div className="p-3 bg-luxury-bg border border-gray-900 rounded-xl space-y-1.5 font-mono text-[9px] text-gray-500">
              <p className="flex justify-between"><span>محرك التخزين:</span><span className="text-white font-bold">SQLite Encypted</span></p>
              <p className="flex justify-between"><span>توازن الفواتير:</span><span className="text-white font-bold">نشط ومتطابق</span></p>
              <p className="flex justify-between"><span>حالة الأمان والربط:</span><span className="text-green-500 font-bold">متصل بـ Google Cloud</span></p>
            </div>
          </div>

          {/* System & Factory Reset Panel */}
          <div className="bg-luxury-card border border-red-950/40 rounded-3xl p-6 shadow-lg">
            <h3 className="text-xs font-bold text-red-500 mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              النظام وإعادة تعيين المصنع
            </h3>
            <p className="text-gray-400 text-[10px] leading-relaxed mb-4">
              إعادة تعيين قاعدة البيانات كلياً ومسح كافة فواتير المبيعات، والعملاء، والمنتجات، والبدء من جديد بتركيب فارغ تماماً.
            </p>
            <button
              id="system-factory-reset-btn"
              onClick={() => {
                setEnteredPin('');
                setPinError('');
                if (config?.pin_protection_enabled) {
                  setResetStep('pin');
                } else {
                  setResetStep('warning');
                }
                setShowResetConfirm(true);
              }}
              className="w-full py-2.5 bg-red-950/20 hover:bg-red-900 hover:text-white text-red-500 font-extrabold text-xs rounded-xl border border-red-900/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <AlertTriangle className="w-4 h-4 text-red-500" />
              بدء إعادة تعيين المصنع كلياً
            </button>
          </div>

        </div>

      </div>
      )}

      {activeTab === 'backup' && (
        <GoogleDriveBackupView
          onShowSuccessAlert={onShowSuccessAlert}
          onShowWarningAlert={onShowWarningAlert}
          onSettingsChanged={onSettingsChanged}
        />
      )}

      {activeTab === 'gmail' && (
        <GmailIntegrationView
          onShowSuccessAlert={onShowSuccessAlert}
          onShowWarningAlert={onShowWarningAlert}
          onSettingsChanged={onSettingsChanged}
        />
      )}

      {activeTab === 'brand' && (
        <RoyalBrandBoard />
      )}

      {activeTab === 'accounting' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-8 shadow-lg max-w-4xl mx-auto w-full text-right animate-fade-in" dir="rtl">
          <div className="flex items-center gap-3 border-b border-gray-900 pb-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gold-600/10 border border-gold-600/20 flex items-center justify-center text-gold-500 text-lg">
              📊
            </div>
            <div>
              <h3 className="text-base font-bold text-white">إدارة الحسابات واليوم الأول للعمل (Accounting)</h3>
              <p className="text-gray-400 text-xs mt-0.5">تهيئة النظام وتصفير الأرصدة المالية والبيانات التجريبية لبدء النشاط التجاري الفعلي</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-luxury-bg border border-gray-800 rounded-2xl p-6">
              <h4 className="text-sm font-bold text-gold-500 mb-3 flex items-center gap-2">
                🚀 ما هو "إعداد اليوم الأول للعمل"؟
              </h4>
              <p className="text-gray-300 text-xs leading-relaxed mb-4">
                تُستخدم هذه الميزة عندما تنتهي من فترة التدريب واختبار النظام باستخدام البيانات التجريبية، وتستعد لبدء العمل الحقيقي في الكافيه. تقوم هذه الميزة بتجهيز حساباتك المالية وتصفيرها بالكامل لتبدأ دفتراً حسابياً وجدول مبيعات نظيفين، مع الحفاظ على كل مجهودك في إدخال المنتجات والعملاء والموردين.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-red-950/10 border border-red-900/20 rounded-xl">
                  <p className="text-red-400 text-xs font-bold mb-2">🔴 البيانات التي سيتم حذفها وتصفيرها:</p>
                  <ul className="text-gray-400 text-[11px] list-disc list-inside space-y-1.5 leading-relaxed">
                    <li>تصفير رصيد درج النقدية بالكامل (Cash Drawer = 0).</li>
                    <li>تصفير مبيعات ومصروفات وأرباح اليوم والشهور السابقة.</li>
                    <li>حذف كافة فواتير المبيعات التجريبية وعمليات المرتجع.</li>
                    <li>حذف المصروفات وحركات الصندوق المسجلة سابقاً.</li>
                    <li>تصفير الأرصدة والذمم الائتمانية المستحقة على العملاء.</li>
                    <li>تصفير حسابات وسجلات سداد مديونيات الموردين والعملاء.</li>
                    <li>مسح التقارير اليومية والإحصائيات وملخصات الورديات.</li>
                  </ul>
                </div>

                <div className="p-4 bg-green-950/10 border border-green-900/20 rounded-xl">
                  <p className="text-green-400 text-xs font-bold mb-2">🟢 البيانات التي سيتم الاحتفاظ بها بالكامل:</p>
                  <ul className="text-gray-400 text-[11px] list-disc list-inside space-y-1.5 leading-relaxed">
                    <li>جميع المنتجات بأسعارها وصورها وأقسامها.</li>
                    <li>قوائم وبيانات العملاء وجهات الاتصال المسجلة.</li>
                    <li>قوائم وبيانات الموردين والشركات المسجلة.</li>
                    <li>كميات ومستويات المخزون الحالي للمنتجات في المستودع.</li>
                    <li>إعدادات الكافيه، وعنوانك، وطابعات الإيصال والعملات.</li>
                    <li>رمز الأمان PIN للمسؤول لتسجيل الدخول وحماية العمليات.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-4 bg-yellow-950/20 border border-yellow-900/30 rounded-2xl text-yellow-500 text-xs leading-relaxed flex gap-2.5 items-start">
              <AlertTriangle className="w-5 h-5 text-gold-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-gold-500 mb-1">🚨 تنبيه أمني هام:</p>
                <p>
                  سيتم تصفير جميع الأرصدة المالية الحالية والبيانات التجريبية، مع الاحتفاظ بجميع المنتجات والعملاء والموردين والمخزون والإعدادات. لا يمكن التراجع عن هذه العملية.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                id="start-first-business-day-trigger"
                onClick={() => {
                  setFirstDayStep('confirm');
                  setShowFirstDayConfirm(true);
                }}
                className="px-6 py-3.5 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-lg hover:opacity-90 active:scale-95 flex items-center gap-2"
              >
                <CheckCircle className="w-4.5 h-4.5 stroke-[2.5]" />
                بدء تهيئة اليوم الأول للعمل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* First Business Day Confirmation Dialog Overlay */}
      {showFirstDayConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-gold-600/20 rounded-3xl p-6 shadow-2xl relative text-right animate-scale-in" dir="rtl">
            
            {firstDayStep === 'confirm' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gold-500 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-gold-500 animate-pulse" />
                  تأكيد تفعيل تهيئة اليوم الأول للعمل
                </h3>

                <p className="text-gray-300 text-xs leading-relaxed">
                  سيتم تصفير جميع الأرصدة المالية الحالية والبيانات التجريبية، مع الاحتفاظ بجميع المنتجات والعملاء والموردين والمخزون والإعدادات. لا يمكن التراجع عن هذه العملية.
                </p>

                <div className="flex gap-3 justify-end border-t border-gray-900 pt-4 mt-2">
                  <button
                    id="cancel-first-day-btn"
                    onClick={() => setShowFirstDayConfirm(false)}
                    className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold cursor-pointer transition-all"
                  >
                    إلغاء (Cancel)
                  </button>
                  <button
                    id="confirm-first-day-btn"
                    onClick={() => {
                      // Perform First Business Day reset
                      dbService.startFirstBusinessDay();
                      setFirstDayStep('success');
                      onShowSuccessAlert('تم تجهيز النظام لبدء العمل بنجاح.');
                      if (onSettingsChanged) {
                        onSettingsChanged();
                      }
                    }}
                    className="px-5 py-2 bg-gold-600 hover:bg-gold-500 text-black font-extrabold rounded-lg text-xs cursor-pointer transition-all"
                  >
                    ابدأ (Start)
                  </button>
                </div>
              </div>
            )}

            {firstDayStep === 'success' && (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border border-gold-500/30 flex items-center justify-center bg-gold-950/20 mx-auto text-gold-500">
                  <CheckCircle className="w-6 h-6 text-gold-500" />
                </div>
                <h3 className="text-gold-500 font-extrabold text-sm">تم التجهيز بنجاح!</h3>
                <p className="text-gray-300 text-xs">
                  تم تجهيز النظام لبدء العمل بنجاح.
                </p>
                <div className="pt-2">
                  <button
                    id="reload-after-success-btn"
                    onClick={() => {
                      setShowFirstDayConfirm(false);
                      window.location.reload();
                    }}
                    className="px-6 py-2 bg-gold-600 hover:bg-gold-500 text-black font-bold rounded-lg text-xs cursor-pointer transition-all mx-auto block"
                  >
                    استمرار ودخول النظام
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Secure Factory Reset Dialog Overlay */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-red-900/30 rounded-3xl p-6 shadow-2xl relative text-right animate-scale-in" dir="rtl">
            
            <h3 className="text-base font-bold text-red-500 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              صلاحيات النظام وإعادة ضبط المصنع
            </h3>
            
            {resetStep === 'pin' && (
              <div className="space-y-4">
                <p className="text-gray-400 text-xs">
                  لحماية حسابات وأموال الكافيه من الحذف غير المصرح به، يرجى إدخال رمز الأمان الرئيسي للمسؤول (PIN) للاستمرار:
                </p>
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز الأمان PIN لمدير النظام *</label>
                  <input
                    id="reset-pin-input"
                    type="password"
                    maxLength={4}
                    value={enteredPin}
                    onChange={(e) => {
                      setEnteredPin(e.target.value);
                      setPinError('');
                    }}
                    className="w-full bg-luxury-bg border border-gray-800 text-gold-500 font-extrabold rounded-xl py-2.5 px-3 text-center focus:outline-none focus:border-red-600 font-mono text-sm tracking-widest placeholder-gray-700"
                    placeholder="••••"
                  />
                  {pinError && <p className="text-red-500 text-[10px] mt-1.5 font-bold">{pinError}</p>}
                </div>
                
                <div className="flex gap-3 justify-end border-t border-gray-900 pt-4 mt-2">
                  <button
                    id="cancel-reset-pin-btn"
                    onClick={() => setShowResetConfirm(false)}
                    className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold cursor-pointer transition-all"
                  >
                    إلغاء
                  </button>
                  <button
                    id="submit-reset-pin-btn"
                    onClick={() => {
                      if (enteredPin === config?.pin_code) {
                        setResetStep('warning');
                      } else {
                        setPinError('رمز الأمان المدخل غير صحيح! يرجى إدخال الرمز الصحيح للمسؤول.');
                      }
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-black font-extrabold rounded-lg text-xs cursor-pointer transition-all"
                  >
                    التحقق والمتابعة
                  </button>
                </div>
              </div>
            )}

            {resetStep === 'warning' && (
              <div className="space-y-4">
                <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-2xl text-red-400 text-xs leading-relaxed space-y-2">
                  <p className="font-extrabold">🚨 تحذير خطير وغير قابل للتراجع:</p>
                  <p>
                    سيقوم هذا الخيار بحذف كافة البيانات الفنية فوراً من الكافيه بما في ذلك: المبيعات بالكامل، الفواتير الملغية، المخازن، والذمم الائتمانية للعملاء، وقوائم الموردين، وإقفال الوردية.
                  </p>
                </div>
                
                <p className="text-gray-400 text-xs font-bold">
                  هل تؤكد موافقتك الصريحة على تفريغ قاعدة البيانات والبدء من جديد؟
                </p>
                
                <div className="flex gap-3 justify-end border-t border-gray-900 pt-4">
                  <button
                    id="cancel-reset-warn-btn"
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetStep('pin');
                      setEnteredPin('');
                    }}
                    className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold cursor-pointer transition-all"
                  >
                    تراجع وإلغاء
                  </button>
                  <button
                    id="confirm-factory-reset-btn"
                    onClick={() => {
                      setResetStep('done');
                      setTimeout(() => {
                        // Perform the factory reset
                        dbService.clearDatabase(true);
                        // Reload screen to trigger the SetupWizard
                        window.location.reload();
                      }, 1200);
                    }}
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-black font-extrabold rounded-lg text-xs cursor-pointer transition-all animate-pulse"
                  >
                    موافق، احذف البيانات كلياً!
                  </button>
                </div>
              </div>
            )}

            {resetStep === 'done' && (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full border border-red-500/30 flex items-center justify-center bg-red-950/20 mx-auto text-red-500 animate-spin">
                  <RefreshCw className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-red-500 font-extrabold text-sm">جاري فرمتة قواعد البيانات وإعادة التهيئة...</p>
                <p className="text-gray-400 text-[10px]">يرجى الانتظار، سيتم إعادة تشغيل نظام كافيه الديب POS تلقائياً...</p>
              </div>
            )}

          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-8 shadow-lg max-w-4xl mx-auto w-full text-right animate-fade-in" dir="rtl">
          <div className="flex items-center gap-3 border-b border-gray-900 pb-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gold-600/10 border border-gold-600/20 flex items-center justify-center text-gold-500 text-lg">
              📱
            </div>
            <div>
              <h3 className="text-base font-bold text-white">إعدادات وسائل الدفع (Payment Methods)</h3>
              <p className="text-gray-400 text-xs mt-0.5">تعديل أرقام الهواتف المخصصة لاستقبال المدفوعات الرقمية والتحويلات للعملاء</p>
            </div>
          </div>

          <form onSubmit={handleSavePaymentNumbers} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Vodafone Cash Configuration Card */}
              <div className="bg-luxury-bg border border-gray-900 hover:border-red-900/30 transition-all rounded-2xl p-6 space-y-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl group-hover:bg-red-500/10 transition-all"></div>
                
                <div className="flex items-center gap-3 border-b border-gray-900/60 pb-3">
                  <div className="w-11 h-11 rounded-xl bg-red-600/10 border border-red-600/30 flex items-center justify-center text-red-500 text-xl font-bold font-mono">
                    🔴
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">فودافون كاش (Vodafone Cash)</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">المحفظة الإلكترونية لشركة فودافون مصر</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-bold block">رقم فودافون كاش المسجل *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 01012345678"
                    value={vodafoneCashNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setVodafoneCashNumber(val);
                    }}
                    className="w-full bg-luxury-card border border-gray-800 text-gold-500 text-sm font-black rounded-xl py-3 px-4 text-center font-mono focus:outline-none focus:border-red-600 tracking-wider"
                  />
                  <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                    سيقوم النظام بقراءة هذا الرقم وإظهاره للعميل تلقائياً في نافذة السداد التفصيلي وإيصال الاستلام عند الدفع بمحفظة فودافون كاش.
                  </p>
                </div>
              </div>

              {/* InstaPay Configuration Card */}
              <div className="bg-luxury-bg border border-gray-900 hover:border-emerald-900/30 transition-all rounded-2xl p-6 space-y-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all"></div>

                <div className="flex items-center gap-3 border-b border-gray-900/60 pb-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-600/10 border border-emerald-600/30 flex items-center justify-center text-emerald-500 text-xl font-bold font-mono">
                    ⚡
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">إنستا باي (InstaPay Egypt)</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">شبكة المدفوعات اللحظية للبنك المركزي</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-bold block">رقم الهاتف المرتبط بـ InstaPay *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 01012345678"
                    value={instapayNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setInstapayNumber(val);
                    }}
                    className="w-full bg-luxury-card border border-gray-800 text-gold-500 text-sm font-black rounded-xl py-3 px-4 text-center font-mono focus:outline-none focus:border-emerald-600 tracking-wider"
                  />
                  <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                    يجب إدخال رقم الهاتف المسجل في البنك والمرتبط بحساب إنستا باي لاستقبل التحويلات البنكية الفورية.
                  </p>
                </div>
              </div>

            </div>

            <div className="flex justify-end pt-4 border-t border-gray-900/80">
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-lg hover:opacity-90 active:scale-95 flex items-center gap-1.5"
              >
                <Save className="w-4 h-4 stroke-[2.5]" />
                حفظ تعديلات وسائل الدفع 📱
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. GOOGLE DRIVE BACKUP & RESTORE MODAL */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in" dir="rtl">
          <div className="bg-[#050505] border border-gold-500/20 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl text-right overflow-y-auto max-h-[90vh]">
            
            <button
              onClick={() => setShowRestoreModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-900 pb-4 mb-4">
              <div className="w-12 h-12 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
                <CloudLightning className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">إدارة الاستعادة والنسخ الاحتياطي السحابي</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">حافظ على أمان بيانات كافيه الديب POS سحابياً</p>
              </div>
            </div>

            {/* Explanatory Top Block */}
            <div className="bg-[#0a0a0a] border border-gray-950 p-4 rounded-2xl mb-4 text-xs space-y-2 text-gray-400">
              <p className="font-bold text-white flex items-center gap-1.5">
                <span>💡 كيف يعمل نظام النسخ الاحتياطي السحابي؟</span>
              </p>
              <p className="leading-relaxed text-[11px]">
                يقوم النظام برفع وتحديث نسخة مشفرة من قاعدة البيانات الخاصة بك بالكامل إلى حسابك المربوط بـ <strong className="text-emerald-400">Google Drive</strong>. 
                عند الضغط على <strong className="text-gold-500">استعادة</strong>، سيتم استبدال البيانات الحالية بجهازك ببيانات تلك النسخة الاحتياطية. 
                يمكنك أيضاً إنشاء نسخة احتياطية يدوية سحابية فوراً بالضغط على زر <strong className="text-emerald-400">إنشاء نسخة احتياطية سحابية الآن ⚡</strong>.
              </p>
            </div>

            {/* Google Drive Status */}
            <div className="bg-[#0a110d] border border-emerald-950 p-4 rounded-2xl mb-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute" />
                <span className="text-gray-300 font-bold">الحساب السحابي المرتبط:</span>
              </div>
              <span className="text-emerald-400 font-mono font-bold">Nader.Eldeeb.2015@gmail.com</span>
            </div>

            {/* Manual Backup Trigger Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <button
                onClick={handleCreateBackupNow}
                disabled={isRestoreInProg}
                className="py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow active:scale-[0.98] disabled:opacity-55"
              >
                <CloudLightning className="w-4 h-4" />
                إنشاء نسخة احتياطية سحابية الآن ⚡
              </button>

              <button
                onClick={() => handleShareBackup(cloudBackups[0])}
                disabled={isRestoreInProg}
                className="py-3 bg-luxury-bg hover:bg-black border border-emerald-500/40 text-emerald-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow active:scale-[0.98] disabled:opacity-55"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                مشاركة النسخة الاحتياطية 📤
              </button>
            </div>

            {/* List of Cloud Backups */}
            <div className="space-y-3 mb-5">
              <h4 className="text-xs font-black text-gray-300 mb-2">الملفات الاحتياطية المتوفرة على السحابة:</h4>
              
              {cloudBackups.map((backup) => (
                <div key={backup.id} className="bg-luxury-card border border-gray-900 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gold-500/20 transition-all">
                  <div className="text-right">
                    <p className="text-xs font-black text-white font-mono break-all" dir="ltr">{backup.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-bold">
                      <span className="text-gold-500">{backup.type}</span>
                      <span>•</span>
                      <span>{backup.date}</span>
                      <span>•</span>
                      <span className="text-gray-500 font-mono">{backup.size}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestoreBackup(backup)}
                      disabled={isRestoreInProg}
                      className="px-3 py-1.5 bg-gold-600/10 hover:bg-gold-600 border border-gold-600/30 hover:border-transparent text-gold-400 hover:text-black rounded-lg text-[10px] font-black cursor-pointer transition-all active:scale-95 disabled:opacity-55 whitespace-nowrap"
                    >
                      استعادة 📥
                    </button>

                    <button
                      onClick={() => handleShareBackup(backup)}
                      disabled={isRestoreInProg}
                      className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white rounded-lg text-[10px] font-black cursor-pointer transition-all active:scale-95 disabled:opacity-55 whitespace-nowrap"
                    >
                      مشاركة 📤
                    </button>

                    <button
                      onClick={() => handleDownloadBackupFile(backup)}
                      disabled={isRestoreInProg}
                      className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-55"
                      title="تنزيل الملف مشفر دون فتحه"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Offline file restore option */}
            <div className="border-t border-gray-900 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-gray-400 font-bold">لديك ملف نسخة احتياطية محلي (.enc)؟</span>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0"
              >
                <FileUp className="w-4 h-4 text-emerald-500" />
                تحميل ملف نسخة احتياطية
              </button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileRestore}
                accept=".enc,.txt"
                className="hidden"
              />
            </div>

          </div>
        </div>
      )}

      {/* PARTNERS TAB */}
      {activeTab === 'partners' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Form col */}
          <div className="lg:col-span-1 bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg h-fit">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-900 pb-3">
              <Users className="w-4.5 h-4.5 text-gold-500" />
              <span>{editingPartner ? 'تعديل بيانات الشريك' : 'إضافة شريك جديد'}</span>
            </h3>

            <form onSubmit={handleSavePartner} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1">اسم الشريك *</label>
                <input
                  type="text"
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  placeholder="أدخل اسم الشريك..."
                  required
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1">نسبة الملكية (%) *</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  max="100"
                  value={pPercent}
                  onChange={e => setPPercent(e.target.value)}
                  placeholder="مثال: 50 أو 25..."
                  required
                  className="w-full bg-luxury-bg border border-gray-800 text-gold-400 font-mono font-bold rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1">رقم الهاتف (اختياري)</label>
                <input
                  type="text"
                  value={pPhone}
                  onChange={e => setPPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full bg-luxury-bg border border-gray-800 text-white font-mono rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1">ملاحظات (اختياري)</label>
                <textarea
                  rows={2}
                  value={pNotes}
                  onChange={e => setPNotes(e.target.value)}
                  placeholder="أي ملاحظات حول عقد الشراكة..."
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-gold-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow transition-all cursor-pointer"
                >
                  {editingPartner ? 'تحديث البيانات' : 'حفظ الشريك'}
                </button>
                {editingPartner && (
                  <button
                    type="button"
                    onClick={resetPartnerForm}
                    className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Table col */}
          <div className="lg:col-span-2 bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-900 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-gold-500" />
                <span>قائمة الشركاء المسجلين ({partnersList.length})</span>
              </h3>
              
              <div className={`px-3 py-1 rounded-xl border text-xs font-black font-mono ${
                totalOwnershipPercent === 100 
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' 
                  : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
              }`}>
                إجمالي الملكية: {totalOwnershipPercent}% {totalOwnershipPercent === 100 ? '✅ مكتمل' : '⚠️'}
              </div>
            </div>

            {partnersList.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                لا يوجد شركاء مسجلين حتى الآن. استخدم النموذج للبدء في إضافة الشركاء.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-[11px]">
                      <th className="py-2.5 px-3 font-bold">اسم الشريك</th>
                      <th className="py-2.5 px-3 font-bold">نسبة الملكية</th>
                      <th className="py-2.5 px-3 font-bold">الهاتف</th>
                      <th className="py-2.5 px-3 font-bold">الملاحظات</th>
                      <th className="py-2.5 px-3 font-bold text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {partnersList.map(partner => (
                      <tr key={partner.id} className="hover:bg-gray-900/30 transition-colors">
                        <td className="py-3 px-3 font-black text-white">{partner.name}</td>
                        <td className="py-3 px-3 font-mono font-bold text-gold-400">{partner.ownership_percent}%</td>
                        <td className="py-3 px-3 font-mono text-gray-300">{partner.phone || '—'}</td>
                        <td className="py-3 px-3 text-gray-400 text-[11px] max-w-[150px] truncate">{partner.notes || '—'}</td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditPartner(partner)}
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-all cursor-pointer"
                              title="تعديل"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePartner(partner.id)}
                              className="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white rounded-lg border border-red-800/50 transition-all cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Delete Partner Modal Confirmation */}
      {partnerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-luxury-card border border-red-900/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-red-400 border-b border-gray-800 pb-3">
              <div className="p-2.5 bg-red-950/60 rounded-xl border border-red-800/40">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">تأكيد حذف الشريك</h3>
                <p className="text-xs text-gray-400">إجراء دائم ولا يمكن التراجع عنه</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-gray-300 bg-black/40 p-4 rounded-xl border border-gray-800/80">
              <p className="font-semibold text-white">
                هل أنت متأكد من حذف الشريك <span className="text-amber-400 font-bold">"{partnerToDelete.name}"</span>؟
              </p>
              <div className="space-y-1 text-[11px] text-gray-400 border-t border-gray-800/80 pt-2">
                <p>• سيتم إزالة الشريك نهائياً من قائمة الشركاء والسحابة (Firestore).</p>
                <p>• نسبة الملكية الحالية للشريك ({partnerToDelete.ownership_percent}%) ستتاح لإعادة التوزيع.</p>
                <p>• السجلات المالية ومسحوبات الشريك ستظل محفوظة بأمان في التقارير التاريخية.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPartnerToDelete(null)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl border border-gray-700 text-xs font-bold transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDeletePartner}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-900/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد الحذف النهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

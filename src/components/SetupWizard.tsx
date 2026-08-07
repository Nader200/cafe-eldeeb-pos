/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Coffee, Sparkles, Building, User, Phone, MapPin, Coins, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { AppSettings } from '../types';
import { EldeebLogoFull } from './EldeebLogo';

interface SetupWizardProps {
  onComplete: (config: {
    cafe_name: string;
    owner_name: string;
    phone: string;
    address: string;
    currency: string;
  }) => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [cafeName, setCafeName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('ج.م');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    console.log(`[SETUP WIZARD] handleNext called at step ${step}`);
    if (step === 1 && (!cafeName.trim() || !ownerName.trim())) {
      console.warn('[SETUP WIZARD] Step 1 validation failed: cafeName or ownerName missing');
      return;
    }
    if (step === 2 && (!phone.trim() || !address.trim() || !currency.trim())) {
      console.warn('[SETUP WIZARD] Step 2 validation failed: phone, address or currency missing');
      return;
    }
    if (step < 3) {
      console.log(`[SETUP WIZARD] Moving to step ${step + 1}`);
      setStep(prev => prev + 1);
    } else {
      console.log('[SETUP WIZARD] Step 3: Button clicked: "إنشاء قاعدة البيانات الآن"');
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      console.log(`[SETUP WIZARD] Moving back from step ${step} to ${step - 1}`);
      setStep(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    console.log('[SETUP WIZARD STEP 3 - SUBMIT] Initializing database creation...');
    console.log('Cafe Name:', cafeName);
    console.log('Owner Name:', ownerName);
    console.log('Phone:', phone);
    console.log('Address:', address);
    console.log('Currency:', currency);

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      console.log('[SETUP WIZARD STEP 3 - CALLING ONCOMPLETE] Invoking onComplete callback...');
      onComplete({
        cafe_name: cafeName,
        owner_name: ownerName,
        phone: phone,
        address: address,
        currency: currency
      });
    }, 1500);
  };

  return (
    <div id="setup-wizard-container" className="fixed inset-0 bg-[#060606] flex flex-col items-center justify-center z-50 px-4 select-none overflow-y-auto font-sans" dir="rtl">
      {/* Background gold gradient glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.06)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,_rgba(212,175,55,0.06)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none" />

      {/* Main setup wizard wrapper */}
      <div className="w-full max-w-lg bg-luxury-card border border-luxury-border rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-8 md:p-10 flex flex-col my-8 relative">
        
        {/* Step progress line indicators */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 1 ? 'w-12 bg-gold-500 shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'w-4 bg-gray-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 2 ? 'w-12 bg-gold-500 shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'w-4 bg-gray-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 3 ? 'w-12 bg-gold-500 shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'w-4 bg-gray-800'}`} />
        </div>

        {/* Wizard Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="p-1 mb-2">
            <EldeebLogoFull className="w-[180px]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">مساعد التثبيت والتهيئة الملوكي</h2>
          <p className="text-gray-400 text-xs">مرحباً بك في كافيه الديب POS Enterprise. لنقم بإعداد البيانات الأساسية لتجارتك.</p>
        </div>

        {/* Dynamic step rendering with smooth transitions */}
        <div className="flex-1 min-h-[180px]">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in text-right">
              <h3 className="text-gold-500 font-extrabold text-sm mb-3 flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5" />
                الخطوة الأولى: الهوية التجارية للمشروع
              </h3>
              
              <div className="space-y-4.5">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">اسم الكافيه التجاري *</label>
                  <div className="relative">
                    <Building className="absolute right-3.5 top-3 w-4 h-4 text-gray-500" />
                    <input
                      id="setup-cafe-name"
                      type="text"
                      required
                      placeholder="مثال: كافيه الديب الفاخر"
                      value={cafeName}
                      onChange={(e) => setCafeName(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-gold-500 font-bold rounded-xl py-2.5 pr-11 pl-4 text-xs focus:outline-none focus:border-gold-600 text-right placeholder-gray-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">اسم المالك / المدير المسؤول *</label>
                  <div className="relative">
                    <User className="absolute right-3.5 top-3 w-4 h-4 text-gray-500" />
                    <input
                      id="setup-owner-name"
                      type="text"
                      required
                      placeholder="مثال: نادر الديب"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 pr-11 pl-4 text-xs focus:outline-none focus:border-gold-600 text-right placeholder-gray-600 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in text-right">
              <h3 className="text-gold-500 font-extrabold text-sm mb-3 flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5" />
                الخطوة الثانية: معلومات الاتصال والعملة
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رقم الهاتف والفروع الكبرى *</label>
                  <div className="relative">
                    <Phone className="absolute right-3.5 top-3 w-4 h-4 text-gray-500" />
                    <input
                      id="setup-phone"
                      type="text"
                      required
                      placeholder="مثال: 01002345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 pr-11 pl-4 text-xs focus:outline-none focus:border-gold-600 text-right placeholder-gray-600 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">العنوان الجغرافي المسجل على الفواتير *</label>
                  <div className="relative">
                    <MapPin className="absolute right-3.5 top-3 w-4 h-4 text-gray-500" />
                    <input
                      id="setup-address"
                      type="text"
                      required
                      placeholder="مثال: شارع الثورة، مصر الجديدة، القاهرة"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 pr-11 pl-4 text-xs focus:outline-none focus:border-gold-600 text-right placeholder-gray-600 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز العملة النقدية للتعاملات المالية *</label>
                  <div className="relative">
                    <Coins className="absolute right-3.5 top-3 w-4 h-4 text-gray-500" />
                    <input
                      id="setup-currency"
                      type="text"
                      required
                      placeholder="مثال: ج.م أو ر.س أو $"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-gold-500 font-bold rounded-xl py-2.5 pr-11 pl-4 text-xs focus:outline-none focus:border-gold-600 text-center placeholder-gray-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in text-center py-4">
              <h3 className="text-gold-500 font-extrabold text-sm mb-3 flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-500 animate-pulse" />
                الخطوة الثالثة: مراجعة البيانات واعتمادها
              </h3>
              
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                يرجى التأكد من مطابقة ومراجعة كافة البيانات المدخلة قبل البناء النهائي لقاعدة البيانات وتنشيط الحماية المشفرة.
              </p>

              <div className="p-4 bg-luxury-bg border border-gray-800 rounded-2xl space-y-2 text-right text-xs max-w-sm mx-auto">
                <div className="flex justify-between border-b border-gray-900 pb-1.5">
                  <span className="text-gray-400">اسم الكافيه:</span>
                  <span className="text-gold-500 font-bold">{cafeName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-900 pb-1.5">
                  <span className="text-gray-400">اسم المالك:</span>
                  <span className="text-white font-medium">{ownerName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-900 pb-1.5">
                  <span className="text-gray-400">الهاتف:</span>
                  <span className="text-white font-mono">{phone}</span>
                </div>
                <div className="flex justify-between border-b border-gray-900 pb-1.5">
                  <span className="text-gray-400">العنوان:</span>
                  <span className="text-white font-medium text-[11px] truncate max-w-[200px]">{address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">العملة الافتراضية:</span>
                  <span className="text-gold-500 font-bold">{currency}</span>
                </div>
              </div>

              {loading && (
                <div className="mt-4 text-xs text-gold-500 font-bold animate-pulse flex items-center justify-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold-500 animate-ping" />
                  جاري بناء قاعدة بيانات SQLite المشفرة وتثبيت الجداول...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 border-t border-gray-900 pt-6 mt-8">
          {step > 1 && (
            <button
              id="setup-back-btn"
              onClick={handleBack}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-luxury-bg hover:bg-gray-900 border border-gray-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <ArrowRight className="w-4 h-4" />
              الرجوع للخلف
            </button>
          )}

          <button
            id="setup-next-btn"
            onClick={handleNext}
            disabled={
              loading ||
              (step === 1 && (!cafeName.trim() || !ownerName.trim())) ||
              (step === 2 && (!phone.trim() || !address.trim() || !currency.trim()))
            }
            className="flex-1 py-3 px-4 bg-gradient-to-r from-gold-600 to-gold-700 hover:opacity-90 disabled:opacity-40 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {step === 3 ? 'إنشاء قاعدة البيانات الآن' : 'متابعة الخطوة التالية'}
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="text-gray-600 text-xs text-center mt-4">
        العلامة التجارية المسجلة لـ Cafe Eldeeb POS Enterprise • 100% Offline
      </div>
    </div>
  );
}

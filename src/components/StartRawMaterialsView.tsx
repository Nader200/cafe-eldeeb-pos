import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Package,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Coins,
  History,
  Info
} from 'lucide-react';
import { dbService } from '../dbService';
import { AppSettings, Product } from '../types';

interface StartRawMaterialsViewProps {
  settings: AppSettings;
  onComplete: (success?: boolean) => void;
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

interface RawMaterialFormItem {
  id: string;
  name_ar: string;
  name_en: string;
  unit: string;
  carriedQty: number; // carried forward from previous stock
  qtyInput: number;    // owner entered quantity to use today
  costInput: number;   // owner entered purchase cost today
}

export default function StartRawMaterialsView({
  settings,
  onComplete,
  onShowSuccessAlert,
  onShowWarningAlert
}: StartRawMaterialsViewProps) {
  const [rawMaterials, setRawMaterials] = useState<RawMaterialFormItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Make sure default raw materials exist
    dbService.ensureDefaultRawMaterials();

    const rms = dbService.getRawMaterials();

    const formItems: RawMaterialFormItem[] = rms.map(rm => ({
      id: rm.id,
      name_ar: rm.name,
      name_en: '',
      unit: rm.unit,
      carriedQty: rm.current_quantity || 0,
      qtyInput: rm.current_quantity || 0, // carry forward remaining as default
      costInput: 0 // purchase cost defaults to 0 (owner enters if purchased)
    }));

    setRawMaterials(formItems);
    setIsLoading(false);
  }, []);

  const handleQtyChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setRawMaterials(prev =>
      prev.map(item => (item.id === id ? { ...item, qtyInput: num } : item))
    );
  };

  const handleCostChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setRawMaterials(prev =>
      prev.map(item => (item.id === id ? { ...item, costInput: num } : item))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Verification
    const hasNegative = rawMaterials.some(item => item.qtyInput < 0 || item.costInput < 0);
    if (hasNegative) {
      onShowWarningAlert('لا يمكن إدخال كميات أو تكاليف بقيم سالبة!');
      return;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Build daily raw materials items
      const items = rawMaterials.map(rm => ({
        raw_material_id: rm.id,
        name_ar: rm.name_ar,
        quantity: rm.qtyInput,
        cost: rm.costInput,
        unit: rm.unit
      }));

      // Create Daily Session
      const session = {
        id: `rm_sess_${Date.now()}`,
        business_date: todayStr,
        items,
        created_at: new Date().toISOString(),
        is_active: true
      };

      // Save Session
      dbService.saveDailyRawMaterialsSession(session);

      // Sync raw materials current_quantity & log transactions
      const rms = dbService.getRawMaterials();
      rawMaterials.forEach(rm => {
        const rawIdx = rms.findIndex(r => r.id === rm.id);
        if (rawIdx > -1) {
          const rawMat = rms[rawIdx];
          rawMat.current_quantity = rm.qtyInput;
          rawMat.unit_cost = rm.costInput > 0 ? (rm.qtyInput > 0 ? rm.costInput / rm.qtyInput : rawMat.unit_cost) : rawMat.unit_cost;
          rawMat.total_cost = rawMat.current_quantity * rawMat.unit_cost;
          rawMat.updated_at = new Date().toISOString();
          dbService.saveRawMaterial(rawMat);

          // Add inventory log
          const trans = {
            id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            product_id: rawMat.id,
            transaction_type: 'Adjustment' as const,
            quantity: rm.qtyInput,
            reason: `افتتاح اليومية: اعتماد كمية ${rm.qtyInput} ${rm.unit} بتكلفة ${rm.costInput} ج.م`,
            transaction_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          dbService.saveInventoryTransaction(trans);
        }
      });

      onShowSuccessAlert('تم تهيئة واعتماد مخزون المواد الخام لبداية هذا اليوم الملوكي بنجاح! 🚀');
      onComplete(true);
    } catch (err: any) {
      onShowWarningAlert(err.message || 'حدث خطأ أثناء اعتماد المواد الخام للوردية الجديدة.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-luxury-bg flex items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-gold-600/20 border-t-gold-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-luxury-bg text-white flex items-center justify-center p-4 select-none font-sans" dir="rtl">
      <div className="w-full max-w-3xl bg-luxury-card border border-luxury-border p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden my-8 animate-fade-in">
        
        {/* Subtle decorative background glow */}
        <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] rounded-full bg-gold-600/5 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[300px] h-[300px] rounded-full bg-gold-600/5 blur-3xl" />

        {/* Header section */}
        <div className="text-center space-y-3 mb-8 border-b border-gray-900 pb-6 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-br from-gold-500/10 to-gold-600/20 border border-gold-500/40 rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Package className="w-8 h-8 text-gold-500 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight sm:text-2xl">اعتماد جرد المواد الخام لليوم الجديد</h2>
            <p className="text-gold-500 text-[11px] font-mono tracking-wider uppercase font-extrabold">Start Today's Raw Materials Inventory</p>
          </div>
          <p className="text-gray-400 text-xs max-w-lg mx-auto leading-relaxed">
            مرحباً بك يا سيد <span className="text-white font-bold">{settings.owner_name || 'المالك'}</span>! لبدء وردية عمل جديدة، يرجى مراجعة وتحديد كميات المواد الخام التي سيتم استخدامها اليوم وتكلفة شرائها. الكميات المتبقية من الأمس تم ترحيلها تلقائياً.
          </p>
        </div>

        {/* Form area */}
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          {rawMaterials.length === 0 ? (
            <div className="p-8 text-center bg-black/40 border border-dashed border-gray-900 rounded-2xl space-y-3">
              <AlertCircle className="w-8 h-8 text-gold-500 mx-auto" />
              <p className="text-xs text-gray-400">لم يتم العثور على أي مواد خام مسجلة بالنظام الملوكي.</p>
              <p className="text-[10px] text-gray-500">سيتم إنشاء المواد الخام الافتراضية تلقائياً بمجرد إعادة تشغيل النظام.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="hidden sm:grid grid-cols-12 gap-4 text-[10px] text-gray-500 font-extrabold uppercase px-4 pb-2 border-b border-gray-900/40">
                <div className="col-span-4 text-right">المادة الخام 🌿</div>
                <div className="col-span-2 text-center">المتبقي والمرحل 📦</div>
                <div className="col-span-3 text-center">الكمية لليوم الجديد ⚖️</div>
                <div className="col-span-3 text-center">تكلفة الشراء الكلية اليوم 💵</div>
              </div>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {rawMaterials.map((rm) => (
                  <div
                    key={rm.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-center bg-luxury-bg/50 border border-gray-900/60 p-4 sm:p-3.5 rounded-2xl hover:border-gold-600/30 transition-all group"
                  >
                    {/* Material Name & Unit */}
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-black border border-gray-800 flex items-center justify-center text-sm text-gold-500 group-hover:border-gold-500/20 transition-all shrink-0">
                        {rm.name_ar.includes('بن') || rm.name_ar.includes('قهوة') ? '🫘' :
                         rm.name_ar.includes('شاي') ? '🍂' :
                         rm.name_ar.includes('لبن') || rm.name_ar.includes('حليب') ? '🥛' :
                         rm.name_ar.includes('معسل') ? '💨' :
                         rm.name_ar.includes('فحم') ? '🪵' :
                         rm.name_ar.includes('سكر') ? '🍬' :
                         rm.name_ar.includes('فواكه') || rm.name_ar.includes('فاكهة') ? '🍎' : '🌾'}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">{rm.name_ar}</h4>
                        <span className="text-[9px] text-gray-500 font-mono block mt-0.5">{rm.name_en} | الوحدة: {rm.unit}</span>
                      </div>
                    </div>

                    {/* Carried Forward Quantity */}
                    <div className="col-span-2 text-center sm:text-center flex sm:block justify-between items-center bg-black/20 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold sm:hidden">المرحل من الأمس:</span>
                      <span className="text-xs font-mono font-black text-gold-500">{rm.carriedQty} {rm.unit}</span>
                    </div>

                    {/* Quantity input */}
                    <div className="col-span-3 flex sm:block justify-between items-center bg-black/20 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold sm:hidden">الكمية لليوم:</span>
                      <div className="relative max-w-[140px] sm:max-w-none">
                        <input
                          type="number"
                          step="any"
                          required
                          min="0"
                          value={rm.qtyInput}
                          onChange={(e) => handleQtyChange(rm.id, e.target.value)}
                          className="w-full bg-black border border-gray-850 hover:border-gray-700 focus:border-gold-600 text-white font-mono font-bold text-center text-xs py-2 px-3 rounded-xl focus:outline-none transition-all"
                        />
                        <span className="absolute left-3 top-2.5 text-[9px] text-gray-500 font-bold">{rm.unit}</span>
                      </div>
                    </div>

                    {/* Purchase Cost input */}
                    <div className="col-span-3 flex sm:block justify-between items-center bg-black/20 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold sm:hidden">تكلفة الشراء (ج.م):</span>
                      <div className="relative max-w-[140px] sm:max-w-none">
                        <input
                          type="number"
                          step="any"
                          required
                          min="0"
                          value={rm.costInput}
                          onChange={(e) => handleCostChange(rm.id, e.target.value)}
                          className="w-full bg-black border border-gray-850 hover:border-gray-700 focus:border-gold-600 text-white font-mono font-bold text-center text-xs py-2 px-3 rounded-xl focus:outline-none transition-all text-emerald-400"
                        />
                        <span className="absolute left-3 top-2.5 text-[9px] text-gray-500 font-bold">ج.م</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips card */}
          <div className="p-3.5 bg-gold-950/10 border border-gold-900/30 rounded-2xl flex items-start gap-3 text-[10px] text-gold-400 leading-relaxed font-semibold">
            <Info className="w-4 h-4 shrink-0 text-gold-500 mt-0.5" />
            <p>
              <strong>ملاحظة ملوكية:</strong> سيقوم النظام تلقائياً بخصم واستهلاك المواد الخام من خلال المبيعات بناءً على مكونات وريسبت كل مشروب. وفي نهاية اليوم، سيحسب تقرير الأرباح التكلفة بناءً على المبالغ المدخلة أعلاه لضمان قياس دقيق لأرباح الكافيه دون الحاجة لحساب تكلفة ثابتة لكل كوب.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 border-t border-gray-900/60 pt-6">
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-gold-600 to-gold-700 hover:from-gold-500 hover:to-gold-600 text-black text-xs font-black rounded-xl transition-all shadow-lg shadow-gold-600/15 cursor-pointer active:scale-95 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              اعتماد وبدء الوردية الملوكية
            </button>
            <button
              type="button"
              onClick={() => onComplete(false)}
              className="py-3 px-6 bg-luxury-bg border border-gray-800 hover:border-gray-750 text-gray-400 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
            >
              التسجيل لاحقاً وتخطي الآن ⚠️
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

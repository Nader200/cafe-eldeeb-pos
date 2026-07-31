/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Star,
  Search,
  Grid,
  List,
  Coffee,
  CheckCircle,
  Tag,
  Settings,
  Layers,
  Info,
  X
} from 'lucide-react';
import { dbService } from '../dbService';
import { Product, Category, AppSettings, RawMaterial } from '../types';
import { getRawMaterialBaseDetails } from '../lib/rawMaterialUtils';

interface ProductsViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function ProductsView({ onShowSuccessAlert, onShowWarningAlert }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  
  // Product Form states
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [pNameAr, setPNameAr] = useState<string>('');
  const [pNameEn, setPNameEn] = useState<string>('');
  const [pCategoryId, setPCategoryId] = useState<string>('');
  const [pBarcode, setPBarcode] = useState<string>('');
  const [pIcon, setPIcon] = useState<string>('☕');
  const [pSellingPrice, setPSellingPrice] = useState<number>(35);
  const [pCostPrice, setPCostPrice] = useState<number>(12);
  const [pCurrentStock, setPCurrentStock] = useState<number>(100);
  const [pMinStock, setPMinStock] = useState<number>(10);
  const [pUnit, setPUnit] = useState<string>('كوب');
  const [pNotes, setPNotes] = useState<string>('');

  // Recipe and Raw Materials state
  const [allRawMaterials, setAllRawMaterials] = useState<RawMaterial[]>([]);
  const [pRecipeIngredients, setPRecipeIngredients] = useState<{ raw_material_id: string; quantity: number }[]>([]);

  // Category Form States
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catNameAr, setCatNameAr] = useState<string>('');
  const [catNameEn, setCatNameEn] = useState<string>('');
  const [catIcon, setCatIcon] = useState<string>('☕');
  const [catDisplayOrder, setCatDisplayOrder] = useState<number>(0);

  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState<boolean>(false);
  const [categoryToDeleteConfirm, setCategoryToDeleteConfirm] = useState<Category | null>(null);
  const [productToDeleteConfirm, setProductToDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const loadCatalogData = () => {
    setProducts(dbService.getProducts());
    setCategories(dbService.getCategories());
    setAllRawMaterials(dbService.getRawMaterials());
  };

  useEffect(() => {
    loadCatalogData();
  }, []);

  const settings = useMemo(() => dbService.getSettings(), []);

  // Filter list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = selectedCat === 'all' || p.category_id === selectedCat;
      const matchSearch =
        p.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery);
      return matchCat && matchSearch;
    });
  }, [products, selectedCat, searchQuery]);

  // --- Product Handlers ---
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setPNameAr('');
    setPNameEn('');
    setPCategoryId(categories[0]?.id || '');
    setPBarcode(`622${Date.now().toString().slice(-4)}`);
    setPIcon('☕');
    setPSellingPrice(0);
    setPCostPrice(0);
    setPCurrentStock(0); // Default opening stock to 0 actual count
    setPMinStock(5);
    setPUnit('كوب');
    setPNotes('');
    setPRecipeIngredients([]);
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setPNameAr(prod.name_ar);
    setPNameEn(prod.name_en);
    setPCategoryId(prod.category_id);
    setPBarcode(prod.barcode);
    setPIcon(prod.image);
    setPSellingPrice(prod.selling_price);
    setPCostPrice(prod.cost_price);
    setPCurrentStock(prod.current_stock);
    setPMinStock(prod.minimum_stock);
    setPUnit(prod.unit);
    setPNotes(prod.notes);
    setPRecipeIngredients(prod.recipe_ingredients || []);
    setShowProductModal(true);
  };

  // Calculate actual unit cost based on recipe ingredients
  const calculatedRecipeCost = useMemo(() => {
    let total = 0;
    pRecipeIngredients.forEach(ing => {
      const rm = allRawMaterials.find(r => r.id === ing.raw_material_id);
      if (rm) {
        const details = getRawMaterialBaseDetails(rm.unit, rm.unit_cost);
        total += ing.quantity * details.baseCost;
      }
    });
    return total;
  }, [pRecipeIngredients, allRawMaterials]);

  // Calculate actual dynamic available stock based on raw material inventory
  const calculatedStockFromRaw = useMemo(() => {
    if (pRecipeIngredients.length === 0) return pCurrentStock;
    let minStock = Infinity;
    pRecipeIngredients.forEach(ing => {
      const rm = allRawMaterials.find(r => r.id === ing.raw_material_id);
      if (rm && ing.quantity > 0) {
        const available = Math.floor(rm.current_quantity / ing.quantity);
        if (available < minStock) minStock = available;
      }
    });
    return minStock === Infinity ? 0 : Math.max(0, minStock);
  }, [pRecipeIngredients, allRawMaterials, pCurrentStock]);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pSellingPrice < 0 || pCostPrice < 0) {
      onShowWarningAlert('الأسعار لا يمكن أن تكون قيم سالبة!');
      return;
    }
    if (pCurrentStock < 0 || pMinStock < 0) {
      onShowWarningAlert('كميات المخزون لا يمكن أن تكون سالبة!');
      return;
    }

    const prodData: Product = {
      id: editingProduct ? editingProduct.id : '',
      category_id: pCategoryId,
      name_ar: pNameAr,
      name_en: pNameEn,
      barcode: pBarcode,
      image: pIcon,
      selling_price: pSellingPrice,
      cost_price: pCostPrice,
      current_stock: pCurrentStock,
      minimum_stock: pMinStock,
      unit: pUnit,
      is_favorite: editingProduct ? editingProduct.is_favorite : false,
      is_available: true,
      notes: pNotes,
      is_raw_material: false,
      created_at: editingProduct ? editingProduct.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      used_raw_materials: pRecipeIngredients.map(r => r.raw_material_id),
      recipe_ingredients: pRecipeIngredients
    };

    dbService.saveProduct(prodData);
    onShowSuccessAlert(`تم حفظ المنتج "${pNameAr}" بنجاح في قاعدة البيانات.`);
    setShowProductModal(false);
    loadCatalogData();
  };

  const handleDeleteProduct = (id: string, name: string) => {
    setProductToDeleteConfirm({ id, name });
  };

  const handleToggleFav = (id: string) => {
    dbService.toggleFavorite(id);
    loadCatalogData();
  };

  // --- Category Handlers ---
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCatNameAr('');
    setCatNameEn('');
    setCatIcon('☕');
    setCatDisplayOrder(categories.length + 1);
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCatNameAr(cat.name_ar);
    setCatNameEn(cat.name_en || '');
    setCatIcon(cat.image || '☕');
    setCatDisplayOrder(cat.display_order !== undefined ? cat.display_order : 0);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameAr) return;

    if (editingCategory) {
      const updatedCat: Category = {
        ...editingCategory,
        name_ar: catNameAr,
        name_en: catNameEn || catNameAr,
        image: catIcon,
        display_order: catDisplayOrder,
        updated_at: new Date().toISOString()
      };
      dbService.saveCategory(updatedCat);
      onShowSuccessAlert(`تم تعديل التصنيف "${catNameAr}" بنجاح.`);
    } else {
      const newCat: Category = {
        id: `cat_${Date.now()}`,
        name_ar: catNameAr,
        name_en: catNameEn || catNameAr,
        image: catIcon,
        display_order: catDisplayOrder,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      dbService.saveCategory(newCat);
      onShowSuccessAlert(`تم تسجيل التصنيف الجديد "${catNameAr}" وتثبيته.`);
    }

    setShowCategoryModal(false);
    setEditingCategory(null);
    setCatNameAr('');
    setCatNameEn('');
    loadCatalogData();
  };

  const handleDeleteCategory = (cat: Category) => {
    // Check if there are products belonging to this category
    const linkedProducts = products.filter(p => p.category_id === cat.id && !p.is_raw_material);
    if (linkedProducts.length > 0) {
      onShowWarningAlert(`⚠️ عذراً، هذا التصنيف يحتوي على ${linkedProducts.length} من المنتجات المسجلة بالفعل بالمنيو. يرجى نقل أو حذف المنتجات أولاً قبل إتمام عملية الحذف.`);
    } else {
      setCategoryToDeleteConfirm(cat);
    }
  };

  const handleConfirmDeleteCategoryReal = () => {
    if (!categoryToDeleteConfirm) return;
    dbService.deleteCategory(categoryToDeleteConfirm.id);
    onShowSuccessAlert(`تم إزالة التصنيف "${categoryToDeleteConfirm.name_ar}" بنجاح.`);
    setCategoryToDeleteConfirm(null);
    loadCatalogData();
  };

  const handleMoveCategoryUp = (index: number) => {
    if (index === 0) return;
    const cats = [...categories];
    cats.forEach((c, idx) => {
      c.display_order = idx;
    });
    
    // Swap
    const temp = cats[index].display_order;
    cats[index].display_order = cats[index - 1].display_order;
    cats[index - 1].display_order = temp;
    
    cats.forEach(c => {
      dbService.saveCategory(c);
    });
    
    onShowSuccessAlert('تم تقديم ترتيب التصنيف بنجاح ⬆️');
    loadCatalogData();
  };

  const handleMoveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return;
    const cats = [...categories];
    cats.forEach((c, idx) => {
      c.display_order = idx;
    });
    
    // Swap
    const temp = cats[index].display_order;
    cats[index].display_order = cats[index + 1].display_order;
    cats[index + 1].display_order = temp;
    
    cats.forEach(c => {
      dbService.saveCategory(c);
    });
    
    onShowSuccessAlert('تم تأخير ترتيب التصنيف بنجاح ⬇️');
    loadCatalogData();
  };

  return (
    <div className="flex flex-col gap-5 w-full animate-fade-in" dir="rtl">
      
      {/* 1. Header with Catalog quick info and Add buttons */}
      <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="text-gold-500 w-6 h-6" />
            إدارة قائمة المشروبات والمأكولات والتصنيفات
          </h2>
          <p className="text-gray-400 text-xs mt-1">تعديل الأسعار والمسميات، مراجعة باركود المنتجات وتعيين المفضلة</p>
        </div>

        <div className="flex gap-2">
          <button
            id="manage-categories-btn"
            onClick={() => setShowManageCategoriesModal(true)}
            className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:border-gold-600 text-gold-500 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            📂 إدارة وترتيب التصنيفات
          </button>
          
          <button
            id="add-category-btn"
            onClick={handleOpenAddCategory}
            className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:border-gold-600 text-gold-500 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
          >
            + إضافة تصنيف جديد
          </button>
          
          <button
            id="add-product-btn"
            onClick={handleOpenAddProduct}
            className="px-5 py-2.5 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-md hover:opacity-90 active:scale-95 flex items-center gap-1"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            إضافة منتج جديد
          </button>
        </div>
      </div>

      {/* 2. Selection filter bar and Search input */}
      <div className="bg-luxury-card border border-luxury-border p-4 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* Category filters strip */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 pr-1 no-scrollbar">
          <button
            id="catalog-filter-all"
            onClick={() => setSelectedCat('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              selectedCat === 'all'
                ? 'bg-gold-600/10 border-gold-600 text-gold-500 font-bold'
                : 'bg-transparent border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            كل السلع ({products.length})
          </button>
          
          {categories.map(cat => (
            <button
              key={cat.id}
              id={`catalog-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                selectedCat === cat.id
                  ? 'bg-gold-600/10 border-gold-600 text-gold-500 font-bold'
                  : 'bg-transparent border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{cat.image}</span> {cat.name_ar}
            </button>
          ))}
        </div>

        {/* Catalog search bar */}
        <div className="relative w-full md:w-72 shrink-0">
          <input
            id="catalog-search"
            type="text"
            placeholder="ابحث بالاسم، الباركود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-luxury-bg border border-gray-900 text-white rounded-xl py-2 px-10 text-xs focus:outline-none focus:border-gold-600 text-right font-medium"
          />
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
        </div>

      </div>

      {/* 3. Products List Matrix Grid */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Tag className="w-4.5 h-4.5 text-gold-500" />
          قائمة المواد الفعالة بالمنيو ({filteredProducts.length} مواد مسجلة)
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-900 text-gray-400 font-bold">
                <th className="pb-3 pt-1 px-2 text-right">المادة</th>
                <th className="pb-3 pt-1 px-2">الباركود الدولي</th>
                <th className="pb-3 pt-1 px-2">التصنيف</th>
                <th className="pb-3 pt-1 px-2 text-left">تكلفة الإنتاج</th>
                <th className="pb-3 pt-1 px-2 text-left">سعر البيع المقيد</th>
                <th className="pb-3 pt-1 px-2 text-center">المخزون الحالي</th>
                <th className="pb-3 pt-1 px-2 text-center">المفضلة</th>
                <th className="pb-3 pt-1 px-2 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/40">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    لا توجد منتجات مسجلة مطابقة لخيارات الفلترة
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const cat = categories.find(c => c.id === p.category_id);
                  const isLow = p.current_stock <= p.minimum_stock;

                  return (
                    <tr key={p.id} className="hover:bg-luxury-bg/40 transition-colors">
                      <td className="py-3 px-2 font-bold text-white">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-lg bg-luxury-bg border border-gray-900 flex items-center justify-center text-base">{p.image}</span>
                          <div>
                            <span>{p.name_ar}</span>
                            <span className="text-[9px] text-gray-500 block mt-0.5">الاسم الأجنبي: {p.name_en}</span>
                            {p.used_raw_materials && p.used_raw_materials.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {p.used_raw_materials.map(id => {
                                  const rm = allRawMaterials.find(r => r.id === id);
                                  if (!rm) return null;
                                  return (
                                    <span key={id} className="px-1.5 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/20 rounded text-[8px] font-medium leading-none">
                                      {rm.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono text-gray-400 font-semibold">{p.barcode}</td>
                      <td className="py-3 px-2">
                        <span className="px-2.5 py-0.5 bg-luxury-bg border border-gray-800 rounded-md text-[10px] font-semibold text-gray-300">
                          {cat ? cat.name_ar : 'غير محدد'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-left font-mono text-gray-400">
                        {p.cost_price.toLocaleString()} {settings.currency}
                      </td>
                      <td className="py-3 px-2 text-left font-mono font-bold text-gold-500">
                        {p.selling_price.toLocaleString()} {settings.currency}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-md font-mono font-bold ${
                          p.current_stock === 0
                            ? 'bg-red-950/40 text-red-500 border border-red-950'
                            : isLow
                            ? 'bg-amber-950/40 text-amber-500 border border-amber-950 animate-pulse'
                            : 'bg-gray-900 text-gray-300'
                        }`}>
                          {p.current_stock} {p.unit}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          id={`toggle-fav-${p.id}`}
                          onClick={() => handleToggleFav(p.id)}
                          className="text-gray-600 hover:text-gold-500 transition-colors cursor-pointer"
                        >
                          <Star className={`w-4.5 h-4.5 ${p.is_favorite ? 'text-gold-500 fill-gold-500' : 'text-gray-700'}`} />
                        </button>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            id={`edit-prod-btn-${p.id}`}
                            onClick={() => handleOpenEditProduct(p)}
                            className="p-1.5 bg-luxury-bg border border-gray-800 text-gray-400 hover:text-white hover:border-gold-600 rounded-lg cursor-pointer"
                            title="تعديل السعر والبيانات"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            id={`delete-prod-btn-${p.id}`}
                            onClick={() => handleDeleteProduct(p.id, p.name_ar)}
                            className="p-1.5 bg-luxury-bg border border-gray-800 text-gray-500 hover:text-red-500 hover:border-red-600 rounded-lg cursor-pointer"
                            title="حذف نهائي"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- PRODUCT ADD / EDIT MODAL --- */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveProduct} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-lg p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              id="close-product-modal"
              onClick={() => setShowProductModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1">
              {editingProduct ? `تعديل بيانات السلعة: ${editingProduct.name_ar}` : 'إضافة سلعة ومشروب جديد بالمنيو'}
            </h4>
            <p className="text-gray-400 text-xs mb-5 border-b border-gray-900 pb-4">تحديث فوري لمعايير التكلفة والبيع والمخزن المقابل</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الاسم التجاري بالعربي *</label>
                <input
                  id="p-name-ar"
                  type="text"
                  required
                  placeholder="مثال: قهوة تركي دوبل"
                  value={pNameAr}
                  onChange={(e) => setPNameAr(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الاسم بالأجنبية (English)</label>
                <input
                  id="p-name-en"
                  type="text"
                  placeholder="مثال: Double Turkish Coffee"
                  value={pNameEn}
                  onChange={(e) => setPNameEn(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-left font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">التصنيف التابع له *</label>
                <select
                  id="p-category-select"
                  value={pCategoryId}
                  onChange={(e) => setPCategoryId(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name_ar}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رقم الباركود الدولي (Barcode) *</label>
                <input
                  id="p-barcode-input"
                  type="text"
                  required
                  placeholder="6220000000"
                  value={pBarcode}
                  onChange={(e) => setPBarcode(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right font-mono font-semibold"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">أيقونة توضيحية (إيموجي)</label>
                <input
                  id="p-icon-input"
                  type="text"
                  placeholder="☕"
                  value={pIcon}
                  onChange={(e) => setPIcon(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">وحدة قياس السلعة *</label>
                <input
                  id="p-unit-input"
                  type="text"
                  required
                  placeholder="مثال: كوب، فنجان، قطعة..."
                  value={pUnit}
                  onChange={(e) => setPUnit(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">تكلفة الإنتاج / الشراء (ج.م) *</label>
                <input
                  id="p-cost-price"
                  type="number"
                  step="0.01"
                  required
                  value={pCostPrice}
                  onChange={(e) => setPCostPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-center"
                />
                <span className="text-[9px] text-gray-500 block mt-1">
                  سعر الشراء / التكلفة الفعليه للوحدة (يمكنك إدخال أي قيمة يدوياً)
                </span>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">سعر البيع النهائي للزبون (ج.م) *</label>
                <input
                  id="p-selling-price"
                  type="number"
                  step="0.5"
                  required
                  value={pSellingPrice}
                  onChange={(e) => setPSellingPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-center text-gold-500 font-bold"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رصيد المخزون الافتتاحي المتاح *</label>
                <input
                  id="p-current-stock"
                  type="number"
                  step="any"
                  required
                  value={pCurrentStock}
                  onChange={(e) => setPCurrentStock(parseFloat(e.target.value) || 0)}
                  placeholder="أدخل رصيد المخزون المتوفر فعلياً"
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-center"
                />
                <span className="text-[9px] text-gray-500 block mt-1">
                  أدخل رصيد المخزون الفعلي المتوفر للسلعة يدوياً
                </span>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الحد الأدنى للتنبيه بالمخزون *</label>
                <input
                  id="p-min-stock"
                  type="number"
                  step="any"
                  required
                  value={pMinStock}
                  onChange={(e) => setPMinStock(parseFloat(e.target.value) || 0)}
                  placeholder="الحد الأدنى"
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono text-center"
                />
              </div>

              {/* Used Raw Materials configuration panel */}
              <div className="col-span-1 md:col-span-2 bg-[#0d0d0d] p-4 rounded-2xl border border-gold-500/10 mt-2">
                <h5 className="text-xs font-extrabold text-gold-500 mb-1 flex items-center gap-1.5">
                  🌿 اختيار المواد الخام الداخلة في هذا المنتج
                </h5>
                <p className="text-[10px] text-gray-400 mb-2">اختر المواد الخام التي يدخل استخدامها في تحضير هذا المشروب فقط (مثال: قهوة تركي = ☑ بن + ☑ سكر اختياري):</p>
                <div className="mb-3 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl text-[10px] text-amber-300 font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>تنويه: إنشاء أو تعديل هذا المنتج لا يستهلك ولا يخصم شيئاً من رصيد المادة الخام بالمخزن. الخصم والاستهلاك يتم فقط عند إجراء عملية بيع فعلي من الكاشير.</span>
                </div>

                {allRawMaterials.length === 0 ? (
                  <div className="text-center py-4 bg-black/20 border border-gray-900 rounded-xl">
                    <p className="text-[10px] text-gray-500">لم تقم بإضافة أي مواد خام بعد في صفحة "المواد الخام".</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 max-h-52 overflow-y-auto pr-1 font-sans">
                    {allRawMaterials.map(rm => {
                      const ingredient = pRecipeIngredients.find(r => r.raw_material_id === rm.id);
                      const isChecked = !!ingredient;
                      
                      return (
                        <div
                          key={rm.id}
                          className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                            isChecked
                              ? 'bg-gold-950/5 border-gold-600/30 text-white'
                              : 'bg-black/30 border-gray-900 text-gray-400 hover:border-zinc-800'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPRecipeIngredients(prev => [...prev, { raw_material_id: rm.id, quantity: 1 }]);
                                } else {
                                  setPRecipeIngredients(prev => prev.filter(r => r.raw_material_id !== rm.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-850 text-gold-500 focus:ring-gold-500 bg-black cursor-pointer"
                            />
                            <div className="text-right">
                              <span className="text-xs font-bold block text-white">{rm.name}</span>
                              <span className="text-[10px] text-gray-400">
                                الرصيد الحقيقي بالمخزن: <strong className="text-emerald-400 font-mono font-black">{rm.current_quantity} {rm.unit}</strong> | سعر الوحدة: <span className="font-mono text-gray-300">{rm.unit_cost} ج.م</span>
                              </span>
                            </div>
                          </label>

                          {isChecked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] bg-gold-500/10 text-gold-400 border border-gold-500/20 font-bold px-2.5 py-1 rounded-lg">
                                مادة خام مخصصة للتحضير ✓
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs text-gray-400 font-bold block mb-1.5">ملاحظات تركيب أو تحضير المشروب</label>
              <textarea
                id="p-notes"
                placeholder="تفاصيل تضاف لباركود أو فاتورة الكيتشن..."
                value={pNotes}
                rows={2}
                onChange={(e) => setPNotes(e.target.value)}
                className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4 sticky bottom-0 bg-luxury-card z-10">
              <button
                type="submit"
                id="submit-product-btn"
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md"
              >
                تثبيت وحفظ التغييرات
              </button>
              <button
                type="button"
                id="cancel-product-modal"
                onClick={() => setShowProductModal(false)}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إلغاء التراجع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- CATEGORY ADD / EDIT MODAL --- */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveCategory} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-sm p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto">
            <button
              type="button"
              id="close-category-modal"
              onClick={() => {
                setShowCategoryModal(false);
                setEditingCategory(null);
                setCatNameAr('');
                setCatNameEn('');
              }}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1">
              {editingCategory ? `تعديل تصنيف القائمة` : 'إضافة تصنيف قائمة جديد'}
            </h4>
            <p className="text-gray-400 text-xs mb-5 border-b border-gray-900 pb-4">
              {editingCategory ? 'تعديل وتحديث مسميات التصنيف المختار' : 'مثال: مشروبات ممتازة، شيشة عائلية، مأكولات'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">اسم التصنيف بالعربية *</label>
                <input
                  id="cat-name-ar"
                  type="text"
                  required
                  placeholder="مثال: مشروبات الطاقة"
                  value={catNameAr}
                  onChange={(e) => setCatNameAr(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الاسم بالأجنبية (English)</label>
                <input
                  id="cat-name-en"
                  type="text"
                  placeholder="مثال: Energy Drinks"
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-left font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز تعبيري (إيموجي)</label>
                <input
                  id="cat-icon-input"
                  type="text"
                  placeholder="⚡"
                  value={catIcon}
                  onChange={(e) => setCatIcon(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">ترتيب العرض (Display Order)</label>
                <input
                  id="cat-display-order"
                  type="number"
                  min="0"
                  placeholder="مثال: 1"
                  value={catDisplayOrder}
                  onChange={(e) => setCatDisplayOrder(Number(e.target.value))}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-center font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4 sticky bottom-0 bg-luxury-card z-10">
              <button
                type="submit"
                id="submit-category-btn"
                className="py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer"
              >
                {editingCategory ? 'تحديث وتعديل' : 'تسجيل وحفظ التصنيف'}
              </button>
              <button
                type="button"
                id="cancel-category-modal"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                  setCatNameAr('');
                  setCatNameEn('');
                }}
                className="py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MANAGE CATEGORIES MODAL --- */}
      {showManageCategoriesModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-45 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-lg p-4 sm:p-6 relative max-h-[85vh] overflow-y-auto my-auto">
            <button
              type="button"
              id="close-manage-categories-modal"
              onClick={() => setShowManageCategoriesModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <h4 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Layers className="text-gold-500 w-5 h-5" />
              إدارة وترتيب تصنيفات القائمة والمنيو
            </h4>
            <p className="text-gray-400 text-xs mb-5 border-b border-gray-900 pb-4">
              رتب تصنيفات العرض في الكاشير بتقديمها أو تأخيرها، وقم بتعديل الأسماء أو إزالتها بأمان.
            </p>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-xs">لا توجد تصنيفات معرفة بعد.</p>
              ) : (
                categories.map((cat, idx) => {
                  const linkedCount = products.filter(p => p.category_id === cat.id && !p.is_raw_material).length;
                  return (
                    <div key={cat.id} className="flex justify-between items-center bg-luxury-bg/60 border border-gray-900 p-3 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-black border border-gray-900 flex items-center justify-center text-base">
                          {cat.image || '☕'}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-white">{cat.name_ar}</span>
                          <span className="text-[10px] text-gray-500 block">
                            {cat.name_en} • {linkedCount} منتج تتابع
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Order Controls */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveCategoryUp(idx)}
                          className="p-1.5 bg-black/40 border border-gray-900 text-gray-400 hover:text-gold-500 hover:border-gold-600 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:border-gray-900 rounded-lg transition-colors cursor-pointer text-xs"
                          title="تقديم الترتيب"
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          disabled={idx === categories.length - 1}
                          onClick={() => handleMoveCategoryDown(idx)}
                          className="p-1.5 bg-black/40 border border-gray-900 text-gray-400 hover:text-gold-500 hover:border-gold-600 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:border-gray-900 rounded-lg transition-colors cursor-pointer text-xs"
                          title="تأخير الترتيب"
                        >
                          ⬇️
                        </button>

                        <div className="w-px h-6 bg-gray-900 mx-1"></div>

                        {/* Edit Control */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditCategory(cat)}
                          className="p-1.5 bg-black/40 border border-gray-900 text-gold-500 hover:bg-gold-600 hover:text-black rounded-lg transition-all cursor-pointer"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Control */}
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1.5 bg-black/40 border border-gray-900 text-red-500 hover:bg-red-950/40 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 border-t border-gray-900 pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowManageCategoriesModal(false)}
                className="px-5 py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إغلاق نافذة التحكم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE CATEGORY MODAL --- */}
      {categoryToDeleteConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-red-950 rounded-3xl w-full max-w-sm p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto my-auto">
            <h4 className="text-base font-bold text-red-500 mb-2 flex items-center gap-1.5">
              ⚠️ تأكيد حذف التصنيف نهائياً
            </h4>
            <p className="text-gray-300 text-xs mb-5">
              هل أنت متأكد من رغبتك في حذف التصنيف <strong className="text-white">"{categoryToDeleteConfirm.name_ar}"</strong> نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-6 border-t border-gray-900 pt-4">
              <button
                type="button"
                id="confirm-delete-category-btn"
                onClick={handleConfirmDeleteCategoryReal}
                className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md"
              >
                تأكيد الحذف
              </button>
              <button
                type="button"
                id="cancel-delete-category-btn"
                onClick={() => setCategoryToDeleteConfirm(null)}
                className="py-2.5 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إلغاء وتراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE PRODUCT MODAL --- */}
      {productToDeleteConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-red-950 rounded-3xl w-full max-w-sm p-4 sm:p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
            <h4 className="text-base font-bold text-red-500 mb-2 flex items-center gap-1.5">
              ⚠️ تأكيد حذف المنتج نهائياً
            </h4>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              هل أنت متأكد من رغبتك في حذف السلعة <span className="text-gold-400 font-bold">"{productToDeleteConfirm.name}"</span> نهائياً من القوائم؟
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="confirm-delete-product-btn"
                onClick={() => {
                  dbService.deleteProduct(productToDeleteConfirm.id);
                  onShowSuccessAlert(`تم إزالة المنتج "${productToDeleteConfirm.name}" بنجاح.`);
                  setProductToDeleteConfirm(null);
                  loadCatalogData();
                }}
                className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
              >
                تأكيد الحذف
              </button>
              <button
                type="button"
                id="cancel-delete-product-btn"
                onClick={() => setProductToDeleteConfirm(null)}
                className="py-2.5 bg-luxury-bg border border-gray-800 text-gray-400 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
              >
                إلغاء التراجع
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

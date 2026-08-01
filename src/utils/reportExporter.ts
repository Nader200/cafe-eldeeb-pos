import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { safeHtml2Canvas } from './html2canvasHelper';
import { getEldeebLogoDataUrl } from '../lib/logoSvg';
import { dbService, isPurchaseExpense } from '../dbService';
import {
  Invoice,
  Expense,
  Product,
  InvoiceItem,
  CashDrawer,
  ReturnTransaction,
  Partner,
  PartnerDrawing,
  InventoryBatch,
  AppSettings
} from '../types';

export interface ReportExportOptions {
  activeReportTab: 'batch_profit' | 'daily_raw_materials' | 'general' | 'partners_statement';
  invoices: Invoice[];
  expenses: Expense[];
  products: Product[];
  invoiceItems: InvoiceItem[];
  drawerHistory: CashDrawer[];
  returnTransactions: ReturnTransaction[];
  partnersList: Partner[];
  partnerDrawingsList: PartnerDrawing[];
  selectedDate: string;
  selectedPartnerId: string;
  settings: AppSettings;
  onStart?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

// Format numbers in EGP
function formatMoney(amount: number): string {
  return amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Download file helper supporting Web & Android share
async function saveAndShareFile(
  blob: Blob,
  fileName: string,
  mimeType: string,
  shareTitle: string,
  onSuccess?: (msg: string) => void,
  onError?: (msg: string) => void
) {
  try {
    const file = new File([blob], fileName, { type: mimeType });

    // 1. Try Native Web Share API (Android / Mobile)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${shareTitle} - كافيه الديب ☕`,
          files: [file],
        });
        if (onSuccess) onSuccess(`تمت مشاركة وحفظ "${fileName}" بنجاح! 🚀`);
        return;
      } catch (shareErr: any) {
        console.log('Native share canceled or unhandled, proceeding to download fallback:', shareErr);
      }
    }

    // 2. Standard Browser / Web View Download
    const blobUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);

    if (onSuccess) onSuccess(`تم تنزيل المستند "${fileName}" بنجاح! 📥`);
  } catch (err: any) {
    console.error('Save file error:', err);
    if (onError) onError(err?.message || 'فشل حفظ التقرير');
  }
}

/**
 * Helper to compute general financial totals
 */
function computeFinancials(
  invoices: Invoice[],
  expenses: Expense[],
  invoiceItems: InvoiceItem[],
  returnTransactions: ReturnTransaction[]
) {
  const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED');
  const validInvoiceIds = new Set(validInvoices.map(i => i.id));

  const totalSales = validInvoices.reduce((sum, i) => sum + i.total, 0) - returnTransactions.reduce((sum, r) => sum + r.total_return_amount, 0);
  const totalCost = invoiceItems.filter(it => validInvoiceIds.has(it.invoice_id)).reduce((sum, it) => sum + (it.cost_price * it.quantity), 0);
  const totalExp = expenses.filter(e => !isPurchaseExpense(e)).reduce((sum, e) => sum + e.amount, 0);
  const grossProfit = totalSales - totalCost;
  const netProfit = grossProfit - totalExp;

  return { totalSales, totalCost, totalExp, grossProfit, netProfit, validInvoiceCount: validInvoices.length };
}

/**
 * 1. EXCEL EXPORTER (.XLSX)
 */
export async function exportReportToExcel(options: ReportExportOptions) {
  const {
    activeReportTab,
    invoices,
    expenses,
    products,
    invoiceItems,
    returnTransactions,
    partnersList,
    partnerDrawingsList,
    selectedDate,
    selectedPartnerId,
    onStart,
    onSuccess,
    onError
  } = options;

  if (onStart) onStart('📂 جاري تجميع كشوفات البيانات وإنشاء ملف Excel (.xlsx) احترافي...');

  try {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    if (activeReportTab === 'batch_profit') {
      // 1. Batch Profit Analysis Data
      const batches = dbService.getInventoryBatches();
      const batchConsumptions = dbService.getBatchConsumptions();
      const validInvoiceIds = new Set(invoices.filter(i => i.invoice_status !== 'CANCELLED').map(i => i.id));
      const activeConsumptions = batchConsumptions.filter(c => validInvoiceIds.has(c.invoice_id));

      const rows: any[] = [];
      
      // Header info row
      rows.push(['كافيه الديب ☕ - تقرير تحليل أرباح وتكلفة الدفعات والمخزون']);
      rows.push([`تاريخ الإصدار: ${dateStr}`]);
      rows.push([]); // Spacer

      // Summary KPI Row
      let totalPurchaseCost = 0;
      let totalRevenue = 0;
      let totalNetProfit = 0;

      batches.forEach(b => {
        const bCons = activeConsumptions.filter(c => c.batch_id === b.id);
        const revenue = bCons.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
        const cost = b.purchase_price || 0;
        const net = revenue - cost;
        totalPurchaseCost += cost;
        totalRevenue += revenue;
        totalNetProfit += net;
      });

      const overallRoi = totalPurchaseCost > 0 ? ((totalNetProfit / totalPurchaseCost) * 100) : 0;

      rows.push(['المؤشر المالي', 'القيمة']);
      rows.push(['إجمالي عدد الدفعات', batches.length]);
      rows.push(['إجمالي تكلفة الشراء الثابتة (ج.م)', totalPurchaseCost]);
      rows.push(['إجمالي الإيرادات المحققة (ج.م)', totalRevenue]);
      rows.push(['إجمالي صافي الأرباح (ج.م)', totalNetProfit]);
      rows.push(['نسبة العائد على الاستثمار الكلية (ROI %)', `${overallRoi.toFixed(2)}%`]);
      rows.push([]); // Spacer

      // Table Headers
      rows.push([
        'رقم الدفعة / السيريال',
        'اسم المادة / الصنف',
        'نوع العنصر',
        'تاريخ الشراء',
        'السعة الإنتاجية',
        'الكمية المستهلكة',
        'الكمية المتبقية',
        'وحدة التقديم',
        'التكلفة الثابتة (ج.م)',
        'الإيرادات المحققة (ج.م)',
        'صافي الربح (ج.م)',
        'نسبة العائد ROI %',
        'الحالة'
      ]);

      batches.forEach(b => {
        const bCons = activeConsumptions.filter(c => c.batch_id === b.id);
        const revenue = bCons.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
        const cost = b.purchase_price || 0;
        const net = revenue - cost;
        const roi = cost > 0 ? ((net / cost) * 100) : 0;

        const yieldCap = b.yield_capacity || b.original_quantity || 50;
        const consumed = b.consumed_quantity || 0;
        const remaining = Math.max(0, yieldCap - consumed);
        const yieldUnit = b.yield_unit || 'كوب';

        let statusText = 'نشطة';
        if (remaining <= 0 || b.status === 'COMPLETED') statusText = 'مكتملة (منتهية)';
        else if (b.status === 'LOW' || remaining / yieldCap <= 0.2) statusText = 'منخفضة جداً';

        rows.push([
          b.batch_serial || b.id,
          b.item_name,
          b.item_type === 'raw_material' ? 'مادة خام' : 'منتج جاهز',
          b.purchase_date || b.created_at.split('T')[0],
          yieldCap,
          consumed,
          remaining,
          yieldUnit,
          cost,
          revenue,
          net,
          `${roi.toFixed(2)}%`,
          statusText
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'ربحية_الدفعات');

    } else if (activeReportTab === 'daily_raw_materials') {
      // 2. Daily Raw Materials Report Data
      const daySession = dbService.getDailyRawMaterialsSession(selectedDate);
      const dayInvoices = invoices.filter(i => i.invoice_date.split('T')[0] === selectedDate && i.invoice_status !== 'CANCELLED');
      const dayInvoiceIds = new Set(dayInvoices.map(i => i.id));
      const dayItems = invoiceItems.filter(it => dayInvoiceIds.has(it.invoice_id));

      const rows: any[] = [];
      rows.push([`كافيه الديب ☕ - تقرير جرد وأرباح المواد الخام اليومية (${selectedDate})`]);
      rows.push([`حالة الافتتاح: ${daySession ? 'تم تسجيل مخزون الافتتاح' : 'لم يتم التسجيل بعد'}`]);
      rows.push([]);

      // Section 1: Raw Materials
      rows.push(['--- سجل جرد المواد الخام اليومية ---']);
      rows.push(['اسم المادة الخام', 'وحدة التخزين', 'رصيد الافتتاح', 'التكلفة (ج.م)', 'المنتجات المباعة منها', 'إجمالي الإيرادات (ج.م)', 'صافي ربح المادة (ج.م)']);

      if (daySession && daySession.items) {
        // Calculate product sales
        const productQuantitiesSold: Record<string, number> = {};
        const productTotalSales: Record<string, number> = {};
        dayItems.forEach(it => {
          productQuantitiesSold[it.product_id] = (productQuantitiesSold[it.product_id] || 0) + it.quantity;
          productTotalSales[it.product_id] = (productTotalSales[it.product_id] || 0) + it.total_price;
        });

        daySession.items.forEach(item => {
          let totalRev = 0;
          const producedSummary: string[] = [];

          products.forEach(p => {
            const usesRM = p.recipe_ingredients?.some(ri => ri.raw_material_id === item.raw_material_id);
            if (usesRM) {
              const qty = productQuantitiesSold[p.id] || 0;
              const rev = productTotalSales[p.id] || 0;
              if (qty > 0) {
                producedSummary.push(`${p.name_ar} (${qty})`);
                totalRev += rev;
              }
            }
          });

          const profit = totalRev - item.cost;
          rows.push([
            item.name_ar,
            item.unit,
            item.quantity,
            item.cost,
            producedSummary.length > 0 ? producedSummary.join(' + ') : 'لم يباع منها اليوم',
            totalRev,
            profit
          ]);
        });
      } else {
        rows.push(['لا توجد جلسة جرد مسجلة لهذا اليوم']);
      }

      rows.push([]);
      rows.push(['--- سجل المنتجات الجاهزة المباعة ---']);
      rows.push(['اسم المنتج الجاهز', 'الكمية المباعة', 'إجمالي المبيعات (ج.م)', 'التكلفة الكلية (ج.م)', 'مجمل الربح (ج.م)']);

      // Ready-made products sales
      const productQuantitiesSold: Record<string, number> = {};
      const productTotalSales: Record<string, number> = {};
      dayItems.forEach(it => {
        productQuantitiesSold[it.product_id] = (productQuantitiesSold[it.product_id] || 0) + it.quantity;
        productTotalSales[it.product_id] = (productTotalSales[it.product_id] || 0) + it.total_price;
      });

      Object.keys(productQuantitiesSold).forEach(pId => {
        if (pId === 'service_playstation' || pId === 'prod_playstation') return;
        const p = products.find(prod => prod.id === pId);
        if (!p) return;

        const isPrepared = p.recipe_ingredients && p.recipe_ingredients.length > 0;
        if (!isPrepared && !p.is_raw_material) {
          const qtySold = productQuantitiesSold[pId] || 0;
          const totalSalesPrice = productTotalSales[pId] || 0;
          const totalCostPrice = p.cost_price * qtySold;
          const gross = totalSalesPrice - totalCostPrice;

          rows.push([p.name_ar, qtySold, totalSalesPrice, totalCostPrice, gross]);
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, 'جرد_المواد_الخام');

    } else if (activeReportTab === 'general') {
      // 3. Royal Master Financial Report (ExcelJS Generator)
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Cafe Eldeeb POS';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('التقرير الملكي', {
        views: [{ rightToLeft: true }]
      });

      // Helper function to merge cell range and style every cell in the range cleanly
      const mergeAndStyle = (
        startRow: number,
        startCol: number,
        endRow: number,
        endCol: number,
        style: {
          font?: Partial<ExcelJS.Font>;
          fill?: ExcelJS.Fill;
          alignment?: Partial<ExcelJS.Alignment>;
          border?: Partial<ExcelJS.Borders>;
        },
        value?: any
      ) => {
        ws.mergeCells(startRow, startCol, endRow, endCol);
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            const cell = ws.getCell(r, c);
            if (style.font) cell.font = style.font;
            if (style.fill) cell.fill = style.fill;
            if (style.alignment) cell.alignment = style.alignment;
            if (style.border) cell.border = style.border;
          }
        }
        if (value !== undefined) {
          ws.getCell(startRow, startCol).value = value;
        }
      };

      // Calculate Financials
      const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED');
      const validExpenses = expenses.filter(e => !isPurchaseExpense(e));
      const validInvoiceIds = new Set(validInvoices.map(i => i.id));

      const initialSales = validInvoices.reduce((sum, i) => sum + i.total, 0);
      const totalRefunds = returnTransactions.reduce((sum, r) => sum + r.total_return_amount, 0);
      const totalRevenue = initialSales - totalRefunds;
      const totalDiscounts = validInvoices.reduce((sum, i) => sum + (i.discount || 0), 0);

      const initialCost = invoiceItems
        .filter(item => validInvoiceIds.has(item.invoice_id))
        .reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);

      let returnedCost = 0;
      returnTransactions.forEach(ret => {
        ret.returned_items.forEach(item => {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            returnedCost += product.cost_price * item.quantity;
          }
        });
      });
      const totalCost = Math.max(0, initialCost - returnedCost);
      const totalExp = validExpenses.reduce((sum, e) => sum + e.amount, 0);
      const grossProfit = totalRevenue - totalCost;
      const netProfit = grossProfit - totalExp;

      // Row heights for header
      ws.getRow(1).height = 28;
      ws.getRow(2).height = 24;
      ws.getRow(3).height = 20;

      // A1:A3 Logo Box
      mergeAndStyle(1, 1, 3, 1, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          top: { style: 'medium', color: { argb: 'FFD4AF37' } },
          bottom: { style: 'medium', color: { argb: 'FFD4AF37' } },
          left: { style: 'medium', color: { argb: 'FFD4AF37' } },
          right: { style: 'thin', color: { argb: 'FFD4AF37' } },
        }
      });

      // Embed Logo on top right box (A1:A3)
      try {
        const logoDataUrl = getEldeebLogoDataUrl(120, true, 'gold');
        if (logoDataUrl) {
          const base64Clean = logoDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
          const imageId = workbook.addImage({
            base64: base64Clean,
            extension: 'png',
          });
          ws.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 68, height: 68 }
          });
        }
      } catch (e) {
        console.error('Logo embedding error:', e);
      }

      // Title Header Block (B1:J1, B2:J2, B3:J3)
      mergeAndStyle(1, 2, 1, 10, {
        font: { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFD700' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          top: { style: 'medium', color: { argb: 'FFD4AF37' } },
          left: { style: 'thin', color: { argb: 'FFD4AF37' } },
          right: { style: 'medium', color: { argb: 'FFD4AF37' } },
        }
      }, '👑 كافيه الديب - Cafe Eldeeb ☕');

      mergeAndStyle(2, 2, 2, 10, {
        font: { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1810' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          left: { style: 'thin', color: { argb: 'FFD4AF37' } },
          right: { style: 'medium', color: { argb: 'FFD4AF37' } },
        }
      }, 'التقرير الملكي');

      const nowStrDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      const nowStrTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      mergeAndStyle(3, 2, 3, 10, {
        font: { name: 'Arial', size: 10, italic: true, color: { argb: 'FFD4AF37' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1810' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
          bottom: { style: 'medium', color: { argb: 'FFD4AF37' } },
          left: { style: 'thin', color: { argb: 'FFD4AF37' } },
          right: { style: 'medium', color: { argb: 'FFD4AF37' } },
        }
      }, `تاريخ ووقت إنشاء التقرير: ${nowStrDate} - ${nowStrTime}`);

      ws.addRow([]); // Blank spacer row

      const hasData = validInvoices.length > 0 || validExpenses.length > 0;

      if (!hasData) {
        const emptyRow = ws.addRow(['لا توجد بيانات للفترة المحددة.']);
        mergeAndStyle(emptyRow.number, 1, emptyRow.number, 10, {
          font: { name: 'Arial', size: 13, bold: true, color: { argb: 'FFDC2626' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: {
            top: { style: 'thin', color: { argb: 'FFEF4444' } },
            bottom: { style: 'thin', color: { argb: 'FFEF4444' } },
            left: { style: 'thin', color: { argb: 'FFEF4444' } },
            right: { style: 'thin', color: { argb: 'FFEF4444' } },
          }
        }, 'لا توجد بيانات للفترة المحددة.');
        emptyRow.height = 32;
      } else {
        // 1. KPI Summary Table
        const kpiSectionHeader = ws.addRow([]);
        kpiSectionHeader.height = 26;
        mergeAndStyle(kpiSectionHeader.number, 1, kpiSectionHeader.number, 10, {
          font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFD700' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } },
          alignment: { horizontal: 'right', vertical: 'middle' },
          border: {
            top: { style: 'medium', color: { argb: 'FFD4AF37' } },
            bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
          }
        }, '📊 أولاً: ملخص المؤشرات المالية والأداء العام');

        const kpiHeaderRow = ws.addRow(['المؤشر المالي', 'القيمة الإجمالية (ج.م)', 'النوع / البيان التفصيلي']);
        kpiHeaderRow.height = 26;
        kpiHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFD700' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD4AF37' } },
            bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
            left: { style: 'thin', color: { argb: 'FFD4AF37' } },
            right: { style: 'thin', color: { argb: 'FFD4AF37' } },
          };
        });

        const kpiRowsData = [
          ['إجمالي الإيرادات (المبيعات الصافية)', totalRevenue, 'حجم المبيعات الفعلي بعد الخصم والمرتجعات'],
          ['إجمالي التخفيضات والخصومات', totalDiscounts, 'قيمة الخصومات الممنوحة للعملاء'],
          ['تكلفة البضاعة والمواد المباعة (COGS)', totalCost, 'إجمالي تكلفة الخامات المستهلكة'],
          ['مجمل الربح الإجمالي', grossProfit, 'المبيعات الصافية مطروحاً منها تكلفة المبيعات'],
          ['إجمالي المصروفات التشغيلية', totalExp, 'إجمالي النفقات والمصاريف التشغيلية والإدارية'],
          ['صافي الربح النهائي الصافي', netProfit, 'صافي الأرباح المتبقية للنشاط التجاري'],
          ['عدد الفواتير الصادرة الناجحة', validInvoices.length, 'إجمالي عدد المعاملات والعمليات المنفذة']
        ];

        kpiRowsData.forEach((rData, idx) => {
          const r = ws.addRow([rData[0], rData[1], rData[2]]);
          r.height = 22;
          r.eachCell((cell, colNum) => {
            cell.font = { name: 'Arial', size: 10, bold: colNum === 2 || idx === 5, color: { argb: 'FF1A1A1A' } };
            if (colNum === 2 && typeof rData[1] === 'number') {
              cell.numFmt = '#,##0.00" ج.م"';
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              if (idx === 5) {
                cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: netProfit >= 0 ? 'FF059669' : 'FFDC2626' } };
              }
            } else {
              cell.alignment = { horizontal: colNum === 1 ? 'right' : 'center', vertical: 'middle' };
            }
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F6' }
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
              right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            };
          });
        });

        ws.addRow([]); // Blank spacer

        // 2. Invoices Section Table
        if (validInvoices.length > 0) {
          const invSecHeader = ws.addRow([]);
          invSecHeader.height = 26;
          mergeAndStyle(invSecHeader.number, 1, invSecHeader.number, 10, {
            font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFD700' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } },
            alignment: { horizontal: 'right', vertical: 'middle' },
            border: {
              top: { style: 'medium', color: { argb: 'FFD4AF37' } },
              bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
            }
          }, '🧾 ثانياً: تفاصيل المبيعات وسجل الفواتير الملكي');

          const invHeaders = [
            'رقم الفاتورة',
            'تاريخ ووقت الفاتورة',
            'العميل / نوع الطلب',
            'طريقة الدفع',
            'إجمالي الفاتورة (ج.م)',
            'الخصم (ج.م)',
            'الصافي (ج.م)',
            'التكلفة (ج.م)',
            'صافي الربح (ج.م)',
            'الحالة'
          ];

          const invHeaderRow = ws.addRow(invHeaders);
          invHeaderRow.height = 26;
          invHeaderRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFD700' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD4AF37' } },
              bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
              left: { style: 'thin', color: { argb: 'FFD4AF37' } },
              right: { style: 'thin', color: { argb: 'FFD4AF37' } },
            };
          });

          validInvoices.forEach((inv, idx) => {
            const invItems = invoiceItems.filter(it => it.invoice_id === inv.id);
            const invCost = invItems.reduce((sum, it) => sum + (it.cost_price * it.quantity), 0);
            const invNetSales = inv.total;
            const invProfit = invNetSales - invCost;

            const dateFormatted = new Date(inv.invoice_date).toLocaleString('ar-EG');
            const payMethod = inv.payment_method === 'CASH' ? 'نقداً'
              : inv.payment_method === 'CARD' ? 'بطاقة'
              : inv.payment_method === 'CREDIT' ? 'آجل' : 'حفظ/محفظة';

            const rowValues = [
              inv.invoice_number || inv.id,
              dateFormatted,
              (inv as any).customer_name || (inv as any).order_type || (inv.table_number ? 'طاولة ' + inv.table_number : 'طلب مباشر'),
              payMethod,
              inv.total + (inv.discount || 0),
              inv.discount || 0,
              invNetSales,
              invCost,
              invProfit,
              inv.invoice_status === 'PAID' ? 'مدفوعة' : inv.invoice_status === 'REFUNDED' ? 'مرتجعة' : 'مكتملة'
            ];

            const r = ws.addRow(rowValues);
            r.height = 20;
            r.eachCell((cell, colNum) => {
              cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1A1A1A' } };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              if (colNum >= 5 && colNum <= 9) {
                cell.numFmt = '#,##0.00" ج.م"';
              }
              if (colNum === 9) {
                cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: invProfit >= 0 ? 'FF059669' : 'FFDC2626' } };
              }
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F6' }
              };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              };
            });
          });

          ws.addRow([]); // Blank spacer
        }

        // 3. Expenses Section Table
        if (validExpenses.length > 0) {
          const expSecHeader = ws.addRow([]);
          expSecHeader.height = 26;
          mergeAndStyle(expSecHeader.number, 1, expSecHeader.number, 10, {
            font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFD700' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } },
            alignment: { horizontal: 'right', vertical: 'middle' },
            border: {
              top: { style: 'medium', color: { argb: 'FFD4AF37' } },
              bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
            }
          }, '💸 ثالثاً: تفاصيل المصروفات التشغيلية والإدارية');

          const expHeaders = [
            'مسلسل',
            'بند / قسم المصروف',
            'البيان والوصف التفصيلي',
            'المبلغ (ج.م)',
            'التاريخ',
            'المسجل بواسطة'
          ];

          const expHeaderRow = ws.addRow(expHeaders);
          expHeaderRow.height = 26;
          expHeaderRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFD700' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD4AF37' } },
              bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
              left: { style: 'thin', color: { argb: 'FFD4AF37' } },
              right: { style: 'thin', color: { argb: 'FFD4AF37' } },
            };
          });

          validExpenses.forEach((e, idx) => {
            const rowValues = [
              idx + 1,
              e.expense_category,
              e.description,
              e.amount,
              e.expense_date,
              (e as any).created_by || 'المدير'
            ];

            const r = ws.addRow(rowValues);
            r.height = 20;
            r.eachCell((cell, colNum) => {
              cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1A1A1A' } };
              cell.alignment = { horizontal: colNum === 3 ? 'right' : 'center', vertical: 'middle' };
              if (colNum === 4) {
                cell.numFmt = '#,##0.00" ج.م"';
                cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
              }
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9F9F6' }
              };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              };
            });
          });

          ws.addRow([]); // Blank spacer
        }

        // 4. Grand Summary Footer (Requirement 7)
        const grandSecHeader = ws.addRow([]);
        grandSecHeader.height = 26;
        mergeAndStyle(grandSecHeader.number, 1, grandSecHeader.number, 10, {
          font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFD700' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } },
          alignment: { horizontal: 'right', vertical: 'middle' },
          border: {
            top: { style: 'medium', color: { argb: 'FFD4AF37' } },
            bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
          }
        }, '👑 رابعاً: خلاصة صافي الأرباح والإيرادات النهائية');

        const footerHeaders = ['البيان المالي النهائي', 'الإجمالي القومي (ج.م)', 'التقييم المحاسبي'];
        const footerHeaderRow = ws.addRow(footerHeaders);
        footerHeaderRow.height = 26;
        footerHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFD700' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD4AF37' } },
            bottom: { style: 'thin', color: { argb: 'FFD4AF37' } },
            left: { style: 'thin', color: { argb: 'FFD4AF37' } },
            right: { style: 'thin', color: { argb: 'FFD4AF37' } },
          };
        });

        const footerRowsData = [
          ['إجمالي الإيرادات', totalRevenue, 'إجمالي المقبوضات والمبيعات الناتجة'],
          ['إجمالي المصروفات', totalExp, 'إجمالي النفقات والمصاريف التشغيلية'],
          ['صافي الربح', netProfit, 'الأرباح الصافية الحقيقية المتبقية للنشاط']
        ];

        footerRowsData.forEach((fData, idx) => {
          const r = ws.addRow(fData);
          r.height = 24;
          r.eachCell((cell, colNum) => {
            cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF1A1A1A' } };
            if (colNum === 2) {
              cell.numFmt = '#,##0.00" ج.م"';
              if (idx === 0) cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF059669' } };
              if (idx === 1) cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFDC2626' } };
              if (idx === 2) cell.font = { name: 'Arial', size: 11.5, bold: true, color: { argb: netProfit >= 0 ? 'FF059669' : 'FFDC2626' } };
            }
            cell.alignment = { horizontal: colNum === 1 ? 'right' : 'center', vertical: 'middle' };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: idx === 2 ? 'FFFFFBEB' : 'FFFFFFFF' }
            };
            cell.border = {
              top: { style: idx === 2 ? 'medium' : 'thin', color: { argb: 'FFD4AF37' } },
              bottom: { style: idx === 2 ? 'double' : 'thin', color: { argb: 'FFD4AF37' } },
              left: { style: 'thin', color: { argb: 'FFD4AF37' } },
              right: { style: 'thin', color: { argb: 'FFD4AF37' } },
            };
          });
        });
      }

      // Auto-fit column widths cleanly (Requirement 6)
      ws.columns.forEach((column) => {
        let maxLen = 14;
        column.eachCell({ includeEmpty: false }, (cell) => {
          if (cell.value) {
            const strVal = cell.value.toString();
            if (strVal.length <= 45) {
              if (strVal.length > maxLen) {
                maxLen = strVal.length;
              }
            }
          }
        });
        column.width = Math.min(Math.max(maxLen + 4, 15), 40);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const filename = `Cafe_Eldeeb_Royal_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      await saveAndShareFile(
        blob,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'التقرير الملكي - كافيه الديب',
        onSuccess,
        onError
      );
      return;

    } else if (activeReportTab === 'partners_statement') {
      // 4. Partners Statement Data
      const fin = computeFinancials(invoices, expenses, invoiceItems, returnTransactions);

      const rows: any[] = [];
      rows.push(['كافيه الديب ☕ - كشف حساب الشركاء والمسحوبات الشخصية']);
      rows.push([`تاريخ الإصدار: ${dateStr}`]);
      rows.push([]);

      rows.push(['--- قائمة الشركاء وحصة الأرباح ---']);
      rows.push(['اسم الشريك', 'رقم الهاتف', 'نسبة الملكية %', 'حصة الأرباح المستحقة (ج.م)', 'إجمالي المسحوبات (ج.م)', 'صافي المتبقي للشريك (ج.م)']);

      partnersList.forEach(p => {
        const pDrawings = partnerDrawingsList.filter(d => d.partner_id === p.id);
        const totalDraw = pDrawings.reduce((sum, d) => sum + d.amount, 0);
        const earnedShare = fin.netProfit * ((p.ownership_percent || 0) / 100);
        const netBal = earnedShare - totalDraw;

        rows.push([
          p.name,
          p.phone || 'غير مسجل',
          `${p.ownership_percent || 0}%`,
          earnedShare,
          totalDraw,
          netBal
        ]);
      });

      rows.push([]);
      rows.push(['--- سجل حركة المسحوبات والعمولات ---']);
      rows.push(['اسم الشريك', 'التاريخ والوقت', 'المبلغ المسحوب (ج.م)', 'سبب المسحوب / التفاصيل', 'بواسطة']);

      const filteredDrawings = selectedPartnerId === 'ALL'
        ? partnerDrawingsList
        : partnerDrawingsList.filter(d => d.partner_id === selectedPartnerId);

      filteredDrawings.forEach(d => {
        rows.push([
          d.partner_name,
          d.date || d.created_at ? new Date(d.date || d.created_at).toLocaleString('ar-EG') : '',
          d.amount,
          d.reason || '-',
          d.created_by || 'المدير'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 35 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, 'كشف_حساب_الشركاء');
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const filename = `Cafe_Eldeeb_Report_${activeReportTab}_${dateStr}.xlsx`;
    await saveAndShareFile(
      blob,
      filename,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'كشف Excel - تقرير كافيه الديب',
      onSuccess,
      onError
    );

  } catch (err: any) {
    console.error('Failed to export Excel report:', err);
    if (onError) onError(err?.message || 'حدث خطأ أثناء تصدير كشف Excel');
  }
}

/**
 * 2. PDF EXPORTER (jsPDF + html2canvas)
 */
export async function exportReportToPDF(options: ReportExportOptions) {
  const {
    activeReportTab,
    invoices,
    expenses,
    products,
    invoiceItems,
    returnTransactions,
    partnersList,
    partnerDrawingsList,
    selectedDate,
    selectedPartnerId,
    settings,
    onStart,
    onSuccess,
    onError
  } = options;

  if (onStart) onStart('📄 جاري تجهيز التقرير الملوكي وتوليد مستند PDF عالي الجودة للطباعة والحفظ...');

  try {
    const logoDataUrl = getEldeebLogoDataUrl(200, true, 'gold');
    const cafeName = settings?.cafe_name || 'كافيه الديب ☕ Cafe Eldeeb';
    const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // Build offscreen printable HTML document
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '850px';
    container.style.backgroundColor = '#0a0a0a';
    container.style.color = '#f3f4f6';
    container.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    container.style.direction = 'rtl';
    container.style.padding = '24px';
    container.style.boxSizing = 'border-box';
    container.style.border = '2px solid #d4af37';

    let titleText = 'منظومة التقارير الملوكية الشاملة';
    let subtitleText = '';
    let reportBodyHtml = '';

    if (activeReportTab === 'batch_profit') {
      titleText = 'تقرير تحليل أرباح الدفعات والمخزون الملوكي (Batch Profit)';
      subtitleText = 'تحليل التكلفة الثابتة للشراء والإيرادات وصافي الأرباح ونسبة العائد لكل دفعة';

      const batches = dbService.getInventoryBatches();
      const batchConsumptions = dbService.getBatchConsumptions();
      const validInvoiceIds = new Set(invoices.filter(i => i.invoice_status !== 'CANCELLED').map(i => i.id));
      const activeConsumptions = batchConsumptions.filter(c => validInvoiceIds.has(c.invoice_id));

      let totalPurchaseCost = 0;
      let totalRevenue = 0;
      let totalNetProfit = 0;

      batches.forEach(b => {
        const bCons = activeConsumptions.filter(c => c.batch_id === b.id);
        const rev = bCons.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
        const cost = b.purchase_price || 0;
        totalPurchaseCost += cost;
        totalRevenue += rev;
        totalNetProfit += (rev - cost);
      });

      const overallRoi = totalPurchaseCost > 0 ? ((totalNetProfit / totalPurchaseCost) * 100) : 0;

      reportBodyHtml = `
        <!-- KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; rounded-radius: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa; font-weight: bold;">إجمالي عدد الدفعات</div>
            <div style="font-size: 18px; color: #ffffff; font-weight: 900; margin-top: 4px;">${batches.length} دفعة</div>
          </div>
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; rounded-radius: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa; font-weight: bold;">إجمالي تكلفة الشراء الثابتة</div>
            <div style="font-size: 18px; color: #ef4444; font-weight: 900; margin-top: 4px;">${formatMoney(totalPurchaseCost)} ج.م</div>
          </div>
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; rounded-radius: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa; font-weight: bold;">إجمالي الإيرادات المحققة</div>
            <div style="font-size: 18px; color: #3b82f6; font-weight: 900; margin-top: 4px;">${formatMoney(totalRevenue)} ج.م</div>
          </div>
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; rounded-radius: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa; font-weight: bold;">إجمالي صافي الأرباح (ROI)</div>
            <div style="font-size: 18px; color: #10b981; font-weight: 900; margin-top: 4px;">${formatMoney(totalNetProfit)} ج.م (${overallRoi.toFixed(1)}%)</div>
          </div>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #111111; border: 1px solid #2a251a;">
          <thead>
            <tr style="background: #1c1810; color: #d4af37; border-bottom: 2px solid #d4af37; text-align: right;">
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">سيريال الدفعة</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">الصنف/المادة</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">النوع</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">السعة الإنتاجية</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">المباع/المستهلك</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">المتبقي</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">التكلفة</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">الإيراد</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">صافي الربح</th>
              <th style="padding: 10px 8px; border: 1px solid #2a251a;">الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map((b, idx) => {
              const bCons = activeConsumptions.filter(c => c.batch_id === b.id);
              const rev = bCons.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
              const cost = b.purchase_price || 0;
              const net = rev - cost;

              const yieldCap = b.yield_capacity || b.original_quantity || 50;
              const consumed = b.consumed_quantity || 0;
              const remaining = Math.max(0, yieldCap - consumed);
              const yieldUnit = b.yield_unit || 'كوب';

              let statusBg = '#065f46';
              let statusText = 'نشطة';
              if (remaining <= 0 || b.status === 'COMPLETED') {
                statusBg = '#374151';
                statusText = 'مكتملة';
              } else if (b.status === 'LOW' || remaining / yieldCap <= 0.2) {
                statusBg = '#92400e';
                statusText = 'منخفضة';
              }

              return `
                <tr style="background-color: ${idx % 2 === 0 ? '#141414' : '#0d0d0d'}; border-bottom: 1px solid #2a251a;">
                  <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #e5e7eb;">${b.batch_serial || b.id}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #ffffff;">${b.item_name}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #a1a1aa;">${b.item_type === 'raw_material' ? 'مادة خام' : 'منتج'}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #fbbf24; font-weight: bold;">${yieldCap} ${yieldUnit}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #60a5fa;">${consumed} ${yieldUnit}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #34d399; font-weight: bold;">${remaining} ${yieldUnit}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #f87171;">${formatMoney(cost)}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #60a5fa; font-weight: bold;">${formatMoney(rev)}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: ${net >= 0 ? '#34d399' : '#f87171'}; font-weight: bold;">${formatMoney(net)}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; text-align: center;">
                    <span style="background: ${statusBg}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">${statusText}</span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

    } else if (activeReportTab === 'daily_raw_materials') {
      titleText = `تقرير جرد وأرباح المواد الخام اليومية (${selectedDate})`;
      subtitleText = 'بيانات المخزون الافتتاحي والمنتجات المصنعة والإيرادات اليومية';

      const daySession = dbService.getDailyRawMaterialsSession(selectedDate);
      const dayInvoices = invoices.filter(i => i.invoice_date.split('T')[0] === selectedDate && i.invoice_status !== 'CANCELLED');
      const dayInvoiceIds = new Set(dayInvoices.map(i => i.id));
      const dayItems = invoiceItems.filter(it => dayInvoiceIds.has(it.invoice_id));

      const productQuantitiesSold: Record<string, number> = {};
      const productTotalSales: Record<string, number> = {};
      dayItems.forEach(it => {
        productQuantitiesSold[it.product_id] = (productQuantitiesSold[it.product_id] || 0) + it.quantity;
        productTotalSales[it.product_id] = (productTotalSales[it.product_id] || 0) + it.total_price;
      });

      reportBodyHtml = `
        <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; border-radius: 10px; margin-bottom: 16px;">
          <span style="color: #d4af37; font-weight: bold;">حالة مخزون بداية اليوم:</span>
          <span style="color: #ffffff; font-weight: bold; margin-right: 8px;">${daySession ? '✓ تم تسجيل مخزون الافتتاح بنجاح' : '⚠️ لم يتم تسجيل مخزون الافتتاح بعد'}</span>
        </div>

        <h4 style="color: #d4af37; margin: 12px 0 8px 0; font-size: 13px;">1. جرد المواد الخام والمنتجات المصنعة منه</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #111111; border: 1px solid #2a251a; margin-bottom: 20px;">
          <thead>
            <tr style="background: #1c1810; color: #d4af37; border-bottom: 2px solid #d4af37; text-align: right;">
              <th style="padding: 8px; border: 1px solid #2a251a;">اسم المادة الخام</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">الرصيد الافتتاحي</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">التكلفة</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">المنتجات المباعة منه اليوم</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">إجمالي الإيرادات</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">الربح المبدئي</th>
            </tr>
          </thead>
          <tbody>
            ${daySession && daySession.items ? daySession.items.map((item, idx) => {
              let totalRev = 0;
              const producedSummary: string[] = [];

              products.forEach(p => {
                const usesRM = p.recipe_ingredients?.some(ri => ri.raw_material_id === item.raw_material_id);
                if (usesRM) {
                  const qty = productQuantitiesSold[p.id] || 0;
                  const rev = productTotalSales[p.id] || 0;
                  if (qty > 0) {
                    producedSummary.push(`${p.name_ar} (${qty})`);
                    totalRev += rev;
                  }
                }
              });

              const profit = totalRev - item.cost;
              return `
                <tr style="background-color: ${idx % 2 === 0 ? '#141414' : '#0d0d0d'};">
                  <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #ffffff;">${item.name_ar}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #fbbf24;">${item.quantity} ${item.unit}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #f87171;">${formatMoney(item.cost)} ج.م</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #a1a1aa;">${producedSummary.length > 0 ? producedSummary.join(' + ') : 'لا مبيعات'}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #60a5fa; font-weight: bold;">${formatMoney(totalRev)} ج.م</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: ${profit >= 0 ? '#34d399' : '#f87171'}; font-weight: bold;">${formatMoney(profit)} ج.م</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="6" style="padding: 12px; text-align: center; color: #a1a1aa;">لا توجد بيانات جرد لهذا اليوم</td></tr>`}
          </tbody>
        </table>
      `;

    } else if (activeReportTab === 'general') {
      titleText = 'التقرير المالي العام والأداء المالي للمنشأة';
      subtitleText = 'عرض الإيرادات الإجمالية والمصروفات وصافي الأرباح';

      const fin = computeFinancials(invoices, expenses, invoiceItems, returnTransactions);

      reportBodyHtml = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa;">إجمالي المبيعات</div>
            <div style="font-size: 18px; color: #3b82f6; font-weight: 900; margin-top: 4px;">${formatMoney(fin.totalSales)} ج.م</div>
          </div>
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa;">المصروفات التشغيلية</div>
            <div style="font-size: 18px; color: #ef4444; font-weight: 900; margin-top: 4px;">${formatMoney(fin.totalExp)} ج.م</div>
          </div>
          <div style="background: #141414; border: 1px solid #d4af37; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #a1a1aa;">صافي الربح النهائي</div>
            <div style="font-size: 18px; color: #10b981; font-weight: 900; margin-top: 4px;">${formatMoney(fin.netProfit)} ج.م</div>
          </div>
        </div>

        <h4 style="color: #d4af37; margin: 12px 0 8px 0; font-size: 13px;">تفاصيل المصروفات الإدارية والتشغيلية</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #111111; border: 1px solid #2a251a;">
          <thead>
            <tr style="background: #1c1810; color: #d4af37; border-bottom: 2px solid #d4af37; text-align: right;">
              <th style="padding: 8px; border: 1px solid #2a251a;">البند / القسم</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">الوصف والبيان</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">المبلغ</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.filter(e => !isPurchaseExpense(e)).map((e, idx) => `
              <tr style="background-color: ${idx % 2 === 0 ? '#141414' : '#0d0d0d'};">
                <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #d4af37;">${e.expense_category}</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #ffffff;">${e.description}</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #ef4444; font-weight: bold;">${formatMoney(e.amount)} ج.م</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #a1a1aa;">${e.expense_date}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

    } else if (activeReportTab === 'partners_statement') {
      titleText = 'كشف حساب الشركاء والمسحوبات الشخصية الملوكي';
      subtitleText = 'سجل برؤوس الأموال والمسحوبات ونسب الأرباح المستحقة';

      const fin = computeFinancials(invoices, expenses, invoiceItems, returnTransactions);

      reportBodyHtml = `
        <h4 style="color: #d4af37; margin: 8px 0 8px 0; font-size: 13px;">ملخص حسابات الشركاء ونسبة الربح المستحقة</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #111111; border: 1px solid #2a251a; margin-bottom: 20px;">
          <thead>
            <tr style="background: #1c1810; color: #d4af37; border-bottom: 2px solid #d4af37; text-align: right;">
              <th style="padding: 8px; border: 1px solid #2a251a;">اسم الشريك</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">نسبة الملكية</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">حصة الربح المستحقة</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">إجمالي المسحوبات</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">صافي المتبقي للشريك</th>
            </tr>
          </thead>
          <tbody>
            ${partnersList.map((p, idx) => {
              const pDrawings = partnerDrawingsList.filter(d => d.partner_id === p.id);
              const totalDraw = pDrawings.reduce((sum, d) => sum + d.amount, 0);
              const earnedShare = fin.netProfit * ((p.ownership_percent || 0) / 100);
              const netBal = earnedShare - totalDraw;
              return `
                <tr style="background-color: ${idx % 2 === 0 ? '#141414' : '#0d0d0d'};">
                  <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #ffffff;">${p.name}</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #fbbf24; font-weight: bold;">${p.ownership_percent || 0}%</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #3b82f6; font-weight: bold;">${formatMoney(earnedShare)} ج.م</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: #ef4444; font-weight: bold;">${formatMoney(totalDraw)} ج.م</td>
                  <td style="padding: 8px; border: 1px solid #2a251a; color: ${netBal >= 0 ? '#10b981' : '#f87171'}; font-weight: bold;">${formatMoney(netBal)} ج.م</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <h4 style="color: #d4af37; margin: 12px 0 8px 0; font-size: 13px;">حركات المسحوبات والعمولات</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #111111; border: 1px solid #2a251a;">
          <thead>
            <tr style="background: #1c1810; color: #d4af37; border-bottom: 2px solid #d4af37; text-align: right;">
              <th style="padding: 8px; border: 1px solid #2a251a;">اسم الشريك</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">التاريخ والوقت</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">المبلغ المسحوب</th>
              <th style="padding: 8px; border: 1px solid #2a251a;">سبب المسحوب / التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            ${partnerDrawingsList.map((d, idx) => `
              <tr style="background-color: ${idx % 2 === 0 ? '#141414' : '#0d0d0d'};">
                <td style="padding: 8px; border: 1px solid #2a251a; font-weight: bold; color: #ffffff;">${d.partner_name}</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #a1a1aa;">${new Date(d.date || d.created_at || Date.now()).toLocaleDateString('ar-EG')}</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #ef4444; font-weight: bold;">${formatMoney(d.amount)} ج.م</td>
                <td style="padding: 8px; border: 1px solid #2a251a; color: #d1d5db;">${d.reason || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Assemble complete HTML string
    container.innerHTML = `
      <!-- Header with Logo -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d4af37; padding-bottom: 16px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <img src="${logoDataUrl}" alt="Logo" style="width: 65px; height: 65px; object-fit: contain;" />
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #d4af37;">${cafeName}</h2>
            <h3 style="margin: 4px 0 0 0; font-size: 14px; font-weight: bold; color: #ffffff;">${titleText}</h3>
            <p style="margin: 2px 0 0 0; font-size: 10px; color: #a1a1aa;">${subtitleText}</p>
          </div>
        </div>

        <div style="text-align: left; font-size: 10px; color: #a1a1aa; line-height: 1.5;">
          <div><strong style="color: #d4af37;">تاريخ التقرير:</strong> ${dateStr}</div>
          <div><strong style="color: #d4af37;">توقيت الطباعة:</strong> ${timeStr}</div>
          <div><strong style="color: #d4af37;">العملة:</strong> الجنيه المصري (EGP)</div>
        </div>
      </div>

      <!-- Report Content -->
      ${reportBodyHtml}

      <!-- Footer -->
      <div style="border-top: 1px solid #2a251a; margin-top: 24px; padding-top: 12px; display: flex; justify-content: space-between; font-size: 9px; color: #71717a;">
        <div>كافيه الديب ☕ - منظومة إدارة المبيعات والجرد الملوكية</div>
        <div>تم الاستخراج والطباعة تلقائياً بواسطة نظام كافيه الديب POS</div>
      </div>
    `;

    document.body.appendChild(container);

    // Render HTML to Canvas
    const canvas = await safeHtml2Canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0a0a0a',
    });

    document.body.removeChild(container);

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('فشل رسم التقرير على الكانفاس.');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const filename = `Cafe_Eldeeb_${activeReportTab}_Report_${new Date().toISOString().split('T')[0]}.pdf`;

    await saveAndShareFile(
      blob,
      filename,
      'application/pdf',
      `تقرير PDF ملوكي - ${titleText}`,
      onSuccess,
      onError
    );

  } catch (err: any) {
    console.error('Failed to export PDF report:', err);
    if (onError) onError(err?.message || 'حدث خطأ أثناء تصدير تقرير PDF');
  }
}

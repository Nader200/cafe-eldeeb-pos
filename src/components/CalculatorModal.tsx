/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calculator as CalcIcon,
  Copy,
  Check,
  RotateCcw,
  History,
  Coins,
  Percent,
  TrendingUp,
  Users,
  CornerDownLeft,
  Delete
} from 'lucide-react';
import { safeStorage } from '../lib/safeStorage';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertResult?: (val: string) => void;
}

export interface HistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

const CALCULATOR_HISTORY_KEY = 'cafe_eldeeb_calc_history';

export default function CalculatorModal({ isOpen, onClose, onInsertResult }: CalculatorModalProps) {
  const [activeTab, setActiveTab] = useState<'standard' | 'cashier'>('standard');

  // --- Standard Calculator State ---
  const [expression, setExpression] = useState<string>('');
  const [display, setDisplay] = useState<string>('0');
  const [isEvaluated, setIsEvaluated] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [insertedToast, setInsertedToast] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = safeStorage.getItem(CALCULATOR_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // --- Cashier Calculator State ---
  // 1. Change Calculator
  const [dueAmount, setDueAmount] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState<string>('');

  // 2. Discount Calculator
  const [originalPrice, setOriginalPrice] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<string>('');

  // 3. Profit Calculator
  const [costPrice, setCostPrice] = useState<string>('');
  const [sellPrice, setSellPrice] = useState<string>('');

  // 4. Split Bill Calculator
  const [totalBill, setTotalBill] = useState<string>('');
  const [peopleCount, setPeopleCount] = useState<string>('2');

  // Save history to storage
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    try {
      safeStorage.setItem(CALCULATOR_HISTORY_KEY, JSON.stringify(newHistory));
    } catch (e) {}
  };

  const showToast = (msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2000);
  };

  // Safe expression evaluator
  const evaluateExpression = (expr: string): string => {
    try {
      if (!expr.trim()) return '0';

      // Replace unicode symbols with standard operators
      let cleanExpr = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/,/g, '');

      // Handle Percentage % intelligently: e.g. "100+10%" => "100+(100*0.1)" or simple numbers
      // Standard % replacement: Replace "N%" with "(N/100)"
      cleanExpr = cleanExpr.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

      // Validate formula characters to prevent security issues
      if (!/^[0-9+\-*/().\s]+$/.test(cleanExpr)) {
        return 'خطأ في العملية';
      }

      // Safe Function evaluation
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${cleanExpr})`)();

      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return 'خطأ بالقسمة على 0';
      }

      // Format result nicely (remove unnecessary trailing zeroes)
      const numResult = Number(Math.round(Number(result + 'e+8')) + 'e-8');
      return String(numResult);
    } catch (err) {
      return 'خطأ في العملية';
    }
  };

  const handleKeyPress = (val: string) => {
    if (val === 'AC') {
      setExpression('');
      setDisplay('0');
      setIsEvaluated(false);
      return;
    }

    if (val === 'DEL') {
      if (isEvaluated) {
        setExpression('');
        setDisplay('0');
        setIsEvaluated(false);
        return;
      }
      if (display.length > 1) {
        const nextVal = display.slice(0, -1);
        setDisplay(nextVal);
        setExpression(prev => prev.slice(0, -1));
      } else {
        setDisplay('0');
        setExpression('');
      }
      return;
    }

    if (val === '=') {
      if (!expression && display === '0') return;

      const targetToEval = expression || display;
      const res = evaluateExpression(targetToEval);

      if (res !== 'خطأ في العملية' && res !== 'خطأ بالقسمة على 0') {
        // Add to history (keep max 20)
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          expression: targetToEval,
          result: res,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        };
        const updatedHistory = [newItem, ...history.slice(0, 19)];
        saveHistory(updatedHistory);
      }

      setDisplay(res);
      setExpression(targetToEval + ' =');
      setIsEvaluated(true);
      return;
    }

    // Standard digit/operator input
    if (isEvaluated) {
      // If pressing operator after evaluation, continue with result
      if (['+', '-', '×', '÷', '%'].includes(val)) {
        const newExpr = display + ' ' + val + ' ';
        setExpression(newExpr);
        setDisplay(val);
        setIsEvaluated(false);
      } else {
        // Clear and start new entry
        setExpression(val);
        setDisplay(val);
        setIsEvaluated(false);
      }
      return;
    }

    // Building display & expression
    if (['+', '-', '×', '÷'].includes(val)) {
      setExpression(prev => prev + ' ' + val + ' ');
      setDisplay(val);
    } else if (val === '%') {
      setExpression(prev => prev + '%');
      setDisplay(prev => prev + '%');
    } else if (val === '(' || val === ')') {
      setExpression(prev => prev + val);
      setDisplay(val);
    } else {
      // Digits & Dot
      if (display === '0' || ['+', '-', '×', '÷', '(', ')'].includes(display)) {
        setDisplay(val === '.' ? '0.' : val);
      } else {
        setDisplay(prev => prev + val);
      }
      setExpression(prev => prev + val);
    }
  };

  // Keyboard shortcut listener for standard calculator
  useEffect(() => {
    if (!isOpen || activeTab !== 'standard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside a form input element
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === '.') {
        handleKeyPress('.');
      } else if (e.key === '+') {
        handleKeyPress('+');
      } else if (e.key === '-') {
        handleKeyPress('-');
      } else if (e.key === '*') {
        handleKeyPress('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleKeyPress('÷');
      } else if (e.key === '%') {
        handleKeyPress('%');
      } else if (e.key === '(' || e.key === ')') {
        handleKeyPress(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleKeyPress('=');
      } else if (e.key === 'Backspace') {
        handleKeyPress('DEL');
      } else if (e.key === 'Escape') {
        if (expression || display !== '0') {
          handleKeyPress('AC');
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, expression, display, isEvaluated]);

  // Copy result to clipboard
  const handleCopyResult = (textToCopy: string) => {
    try {
      navigator.clipboard.writeText(textToCopy);
      showToast(`تم نسخ (${textToCopy}) إلى الحافظة!`);
    } catch (e) {
      showToast(`الرمز: ${textToCopy}`);
    }
  };

  // Insert result into focused field or callback
  const handleInsertResult = (val: string) => {
    if (onInsertResult) {
      onInsertResult(val);
      showToast('تم إدراج الناتج بنجاح!');
      setTimeout(() => onClose(), 600);
      return;
    }

    // Attempt to insert into active input element in DOM
    const activeEl = document.activeElement as HTMLInputElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      try {
        const start = activeEl.selectionStart || 0;
        const end = activeEl.selectionEnd || 0;
        const currentVal = activeEl.value;
        const newVal = currentVal.substring(0, start) + val + currentVal.substring(end);

        // Native setter trigger for React
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(activeEl, newVal);
        } else {
          activeEl.value = newVal;
        }

        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        activeEl.dispatchEvent(new Event('change', { bubbles: true }));

        setInsertedToast(true);
        showToast('تم إدراج الناتج في الحقل المحدد!');
        setTimeout(() => {
          setInsertedToast(false);
          onClose();
        }, 700);
        return;
      } catch (err) {
        console.warn('Failed inserting directly into element:', err);
      }
    }

    // Fallback: Copy to clipboard
    handleCopyResult(val);
  };

  if (!isOpen) return null;

  // --- Cashier Calculations ---
  // Change
  const dueNum = parseFloat(dueAmount) || 0;
  const paidNum = parseFloat(paidAmount) || 0;
  const changeVal = paidNum - dueNum;

  // Discount
  const origPriceNum = parseFloat(originalPrice) || 0;
  const discPercentNum = parseFloat(discountPercent) || 0;
  const discAmount = (origPriceNum * discPercentNum) / 100;
  const finalPrice = origPriceNum - discAmount;

  // Profit
  const costNum = parseFloat(costPrice) || 0;
  const sellNum = parseFloat(sellPrice) || 0;
  const profitAmount = sellNum - costNum;
  const profitMarginPercent = costNum > 0 ? (profitAmount / costNum) * 100 : 0;

  // Split Bill
  const billNum = parseFloat(totalBill) || 0;
  const countNum = parseInt(peopleCount, 10) || 1;
  const perPersonAmount = countNum > 0 ? billNum / countNum : billNum;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="bg-[#0c0c0e] border border-[#D4AF37]/40 rounded-3xl w-full max-w-xl shadow-[0_10px_40px_rgba(0,0,0,0.9),0_0_20px_rgba(212,175,55,0.15)] overflow-hidden flex flex-col max-h-[92vh] relative">
        
        {/* Toast Notification Header */}
        {copiedToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-gold-500 text-black px-4 py-1.5 rounded-full text-xs font-black shadow-lg flex items-center gap-1.5 animate-bounce">
            <Check className="w-4 h-4" />
            <span>{copiedToast}</span>
          </div>
        )}

        {/* Modal Top Header Bar */}
        <div className="bg-[#121215] border-b border-gray-800 p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <CalcIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                حاسبة Cafe Eldeeb Enterprise
                <span className="text-[10px] bg-gold-500/20 text-gold-400 border border-gold-500/30 px-2 py-0.5 rounded-full font-mono">
                  v2.5
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">آلة حاسبة ذكية وإدراج سريع للنتائج</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-[#101013] px-4 pt-3 border-b border-gray-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('standard')}
            className={`px-4 py-2 rounded-t-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'standard'
                ? 'bg-[#0c0c0e] border-[#D4AF37]/40 text-gold-400 shadow-inner'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <CalcIcon className="w-4 h-4" />
            <span>آلة حاسبة عامة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cashier')}
            className={`px-4 py-2 rounded-t-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-t border-x ${
              activeTab === 'cashier'
                ? 'bg-[#0c0c0e] border-[#D4AF37]/40 text-gold-400 shadow-inner'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>حاسبة الكاشير والتجار</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
          
          {/* ========================================================= */}
          {/* TAB 1: STANDARD GENERAL CALCULATOR */}
          {/* ========================================================= */}
          {activeTab === 'standard' && (
            <div className="space-y-4">
              
              {/* Calculator Screen Display */}
              <div className="bg-[#050507] border border-[#D4AF37]/30 rounded-2xl p-4 text-left font-mono relative shadow-inner overflow-hidden">
                <div className="text-xs text-gray-400 h-5 truncate dir-ltr font-sans text-right">
                  {expression || ' '}
                </div>
                <div className="text-2xl sm:text-3.5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gold-200 to-gold-400 dir-ltr tracking-wider truncate text-right py-1">
                  {display}
                </div>

                {/* Quick Copy / Insert Overlay Bar when evaluated */}
                {isEvaluated && display !== 'خطأ في العملية' && display !== 'خطأ بالقسمة على 0' && (
                  <div className="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between gap-2 animate-fade-in font-sans">
                    <span className="text-[10px] text-gray-400">الناتج جاهز للاستخدام:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyResult(display)}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gold-400 text-[11px] font-bold rounded-lg border border-gray-700 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>📋 نسخ الناتج</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInsertResult(display)}
                        className="px-3 py-1 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black text-[11px] font-black rounded-lg shadow flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✔ إدراج الناتج</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Keypad Buttons Grid */}
              <div className="grid grid-cols-4 gap-2 text-sm select-none">
                {/* Row 1 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('AC')}
                  className="py-3.5 rounded-xl font-black bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
                >
                  AC
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('DEL')}
                  className="py-3.5 rounded-xl font-bold bg-gray-800/80 hover:bg-gray-700 border border-gray-700 text-amber-400 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1"
                >
                  <Delete className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('(')}
                  className="py-3.5 rounded-xl font-bold bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 transition-all cursor-pointer active:scale-95"
                >
                  (
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress(')')}
                  className="py-3.5 rounded-xl font-bold bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 transition-all cursor-pointer active:scale-95"
                >
                  )
                </button>

                {/* Row 2 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('%')}
                  className="py-3.5 rounded-xl font-bold bg-gold-950/20 hover:bg-gold-900/40 border border-gold-800/40 text-gold-400 transition-all cursor-pointer active:scale-95"
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('÷')}
                  className="py-3.5 rounded-xl font-black bg-gold-950/30 hover:bg-gold-900/50 border border-gold-800/50 text-gold-400 text-base transition-all cursor-pointer active:scale-95"
                >
                  ÷
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('×')}
                  className="py-3.5 rounded-xl font-black bg-gold-950/30 hover:bg-gold-900/50 border border-gold-800/50 text-gold-400 text-base transition-all cursor-pointer active:scale-95"
                >
                  ×
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('-')}
                  className="py-3.5 rounded-xl font-black bg-gold-950/30 hover:bg-gold-900/50 border border-gold-800/50 text-gold-400 text-lg transition-all cursor-pointer active:scale-95"
                >
                  -
                </button>

                {/* Row 3 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('7')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  7
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('8')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  8
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('9')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  9
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('+')}
                  className="py-3.5 rounded-xl font-black bg-gold-950/30 hover:bg-gold-900/50 border border-gold-800/50 text-gold-400 text-lg transition-all cursor-pointer active:scale-95"
                >
                  +
                </button>

                {/* Row 4 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('4')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  4
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('5')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  5
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('6')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  6
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('=')}
                  className="row-span-2 py-3.5 rounded-xl font-black bg-gradient-to-b from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-black text-xl shadow-lg border border-gold-400 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
                >
                  =
                </button>

                {/* Row 5 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('1')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('2')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  2
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('3')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  3
                </button>

                {/* Row 6 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('0')}
                  className="col-span-2 py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('.')}
                  className="py-3.5 rounded-xl font-bold bg-[#16161a] hover:bg-[#202026] border border-gray-800 text-white text-base transition-all cursor-pointer active:scale-95"
                >
                  .
                </button>
              </div>

              {/* History Log Section */}
              <div className="bg-[#070709] border border-gray-800 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
                    <History className="w-3.5 h-3.5 text-gold-500" />
                    <span>سجل آخر 20 عملية حاسبة</span>
                  </div>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => saveHistory([])}
                      className="text-[10px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      تفريغ السجل
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <p className="text-[11px] text-gray-500 text-center py-2">لا توجد عمليات سابقة في السجل بعد.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setDisplay(item.result);
                          setExpression(item.result);
                          setIsEvaluated(true);
                          showToast(`تم نسخ الناتج (${item.result}) إلى الشاشة`);
                        }}
                        className="bg-[#101013] hover:bg-[#18181f] border border-gray-800/80 p-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-all hover:border-gold-500/40 group"
                        title="انقر لنقل الناتج إلى شاشة الآلة الحاسبة"
                      >
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-gray-400 group-hover:text-gray-200 dir-ltr">{item.expression} =</span>
                          <span className="text-gold-400 font-bold group-hover:text-gold-300 dir-ltr">{item.result}</span>
                        </div>
                        <span className="text-[9px] text-gray-500 font-mono">{item.timestamp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: CASHIER SPECIALIZED CALCULATORS */}
          {/* ========================================================= */}
          {activeTab === 'cashier' && (
            <div className="space-y-4 text-xs">
              
              {/* 1. Change Calculator (حساب الباقي) */}
              <div className="bg-[#070709] border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-gold-400 font-bold pb-2 border-b border-gray-800/80">
                  <Coins className="w-4 h-4 text-gold-500" />
                  <h4 className="text-sm font-black">1. حاسبة الباقي للعميل (Change Calculator)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">المبلغ المطلوب (Total Due)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={dueAmount}
                      onChange={(e) => setDueAmount(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">المبلغ المدفوع (Amount Paid)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Preset Fast Money Buttons */}
                {dueNum > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-500">اختصارات سريعة للمدفوع:</span>
                    {[dueNum, 50, 100, 200, 500].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPaidAmount(String(preset))}
                        className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 font-mono cursor-pointer"
                      >
                        {preset} ج.م
                      </button>
                    ))}
                  </div>
                )}

                {/* Result Card */}
                <div className="bg-[#0f0f13] border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block">الباقي الواجب إرجاعه للعميل:</span>
                    <span className={`text-lg font-black font-mono ${changeVal < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {changeVal.toFixed(2)} ج.م
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyResult(changeVal.toFixed(2))}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gold-400 text-xs font-bold rounded-xl border border-gray-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الباقي</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Discount Calculator (حساب الخصم) */}
              <div className="bg-[#070709] border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-gold-400 font-bold pb-2 border-b border-gray-800/80">
                  <Percent className="w-4 h-4 text-gold-500" />
                  <h4 className="text-sm font-black">2. حاسبة الخصومات والتخفيضات (Discount)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">السعر الأصلي (Price)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={originalPrice}
                      onChange={(e) => setOriginalPrice(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">نسبة الخصم (%)</label>
                    <input
                      type="number"
                      placeholder="مثال: 10 أو 15"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="bg-[#0f0f13] border border-gray-800 rounded-xl p-3 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block">قيمة الخصم بالجنيه:</span>
                    <span className="text-base font-bold font-mono text-amber-400">{discAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="text-left border-r border-gray-800 pr-3">
                    <span className="text-[10px] text-gray-400 block">السعر النهائي بعد الخصم:</span>
                    <span className="text-base font-black font-mono text-emerald-400">{finalPrice.toFixed(2)} ج.م</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyResult(finalPrice.toFixed(2))}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gold-400 text-xs font-bold rounded-xl border border-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ السعر النهائي ({finalPrice.toFixed(2)})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertResult(finalPrice.toFixed(2))}
                    className="px-3 py-1.5 bg-gold-600 hover:bg-gold-500 text-black text-xs font-black rounded-xl shadow flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>إدراج السعر النهائي</span>
                  </button>
                </div>
              </div>

              {/* 3. Profit Calculator (حساب الربح) */}
              <div className="bg-[#070709] border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-gold-400 font-bold pb-2 border-b border-gray-800/80">
                  <TrendingUp className="w-4 h-4 text-gold-500" />
                  <h4 className="text-sm font-black">3. حاسبة الأرباح وهامش الربح (Profit Margin)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">سعر الشراء / التكلفة (Cost)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">سعر البيع (Selling Price)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="bg-[#0f0f13] border border-gray-800 rounded-xl p-3 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block">صافي مقدار الربح:</span>
                    <span className={`text-base font-black font-mono ${profitAmount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {profitAmount.toFixed(2)} ج.م
                    </span>
                  </div>
                  <div className="text-left border-r border-gray-800 pr-3">
                    <span className="text-[10px] text-gray-400 block">نسبة هامش الربح %:</span>
                    <span className={`text-base font-black font-mono ${profitMarginPercent < 0 ? 'text-red-400' : 'text-gold-400'}`}>
                      {profitMarginPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Split Bill Calculator (تقسيم الفاتورة) */}
              <div className="bg-[#070709] border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-gold-400 font-bold pb-2 border-b border-gray-800/80">
                  <Users className="w-4 h-4 text-gold-500" />
                  <h4 className="text-sm font-black">4. حاسبة تقسيم الفاتورة (Split Bill)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">إجمالي الفاتورة (Total Bill)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={totalBill}
                      onChange={(e) => setTotalBill(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-[11px] mb-1 font-bold">عدد الأشخاص (People Count)</label>
                    <input
                      type="number"
                      min="1"
                      value={peopleCount}
                      onChange={(e) => setPeopleCount(e.target.value)}
                      className="w-full bg-[#121216] border border-gray-800 focus:border-gold-500 rounded-xl px-3 py-2 text-white font-mono text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="bg-[#0f0f13] border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block">المبلغ المطلوب من كل شخص:</span>
                    <span className="text-lg font-black font-mono text-gold-400">
                      {perPersonAmount.toFixed(2)} ج.م
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyResult(perPersonAmount.toFixed(2))}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gold-400 text-xs font-bold rounded-xl border border-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ النصيب</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Download, Sparkles, Shield, Check, Copy, FileCode, Layers, Eye, Palette } from 'lucide-react';
import { EldeebLogoFull, EldeebAppIcon, EldeebLogoHeader } from './EldeebLogo';
import { getEldeebLogoSvgString, getEldeebLogoDataUrl } from '../lib/logoSvg';

export const RoyalBrandBoard: React.FC = () => {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'board' | 'variants' | 'code'>('board');

  const colorPalette = [
    { name: 'Matte Imperial Black', hex: '#040302', usage: 'Main Background & Canvas', class: 'bg-[#040302] border-amber-500/30 text-white' },
    { name: 'Radiant Gold', hex: '#FFF4B8', usage: 'Primary Metallic Highlights', class: 'bg-[#FFF4B8] border-amber-500/30 text-black' },
    { name: 'Pure Royal Gold', hex: '#FFD700', usage: 'Emblem Stroke & Calligraphy', class: 'bg-[#FFD700] border-amber-500/30 text-black' },
    { name: 'Imperial Bronze Gold', hex: '#D4AF37', usage: 'Bezel Ring & Accents', class: 'bg-[#D4AF37] border-amber-500/30 text-black' },
    { name: 'Deep Gold Shadow', hex: '#996515', usage: 'Shading & Dimensional Facets', class: 'bg-[#996515] border-amber-500/30 text-white' },
  ];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedColor(text);
    setTimeout(() => setCopiedColor(null), 2000);
  };

  const handleDownloadSvg = (width: number, filename: string, variant: 'gold' | 'white' | 'black' = 'gold') => {
    const svgContent = getEldeebLogoSvgString(width, true, variant);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-[#070604] border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-white shadow-[0_0_50px_rgba(212,175,55,0.12)] space-y-8 animate-fade-in">
      
      {/* Brand Board Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-amber-500/20">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>الهوية الملوكية المعتمدة v1.0</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 font-serif">
            CAFE ELDEEB POS ENTERPRISE
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            دليل الهوية البصرية الملكية الكاملة - الخاتم الإمبراطوري برأس الذئب الملكي، التاج والدرع حرف E (Gold & Matte Black)
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-2xl border border-amber-500/30 self-stretch md:self-auto justify-center">
          <button
            onClick={() => setActiveTab('board')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'board'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-black shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>لوحة الهوية</span>
          </button>
          <button
            onClick={() => setActiveTab('variants')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'variants'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-black shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>النسخ والاستخدامات</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'code'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-black shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>تصدير SVG</span>
          </button>
        </div>
      </div>

      {activeTab === 'board' && (
        <div className="space-y-8 animate-fade-in">
          {/* Main Master Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Master Emblem Preview */}
            <div className="lg:col-span-7 bg-black/80 border border-amber-500/40 rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-[0_0_40px_rgba(212,175,55,0.15)] group">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.1)_0%,_transparent_70%)] pointer-events-none" />
              
              <div className="relative z-10 py-4">
                <EldeebLogoFull className="w-[240px] sm:w-[280px]" showSubtext={true} />
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3 relative z-10">
                <button
                  onClick={() => handleDownloadSvg(512, 'eldeeb-royal-master-logo.svg', 'gold')}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition flex items-center gap-2 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير الشعار Master SVG</span>
                </button>
                <button
                  onClick={() => handleDownloadSvg(1024, 'eldeeb-app-icon-1024.svg', 'gold')}
                  className="px-4 py-2 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold text-xs hover:bg-amber-900 transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>أيقونة التطبيق High-Res</span>
                </button>
              </div>
            </div>

            {/* Emblem Specifications */}
            <div className="lg:col-span-5 bg-black/40 border border-amber-500/20 rounded-3xl p-6 flex flex-col justify-between space-y-4">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                <span>عناصر الخاتم الملكي</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-2xl bg-black/60 border border-amber-500/10">
                  <div className="font-bold text-amber-200 mb-0.5">1. رأس الذئب الملكي (Royal Wolf Head)</div>
                  <div className="text-gray-400">ينظر للأمام مباشرة بنظرة حادة وواثقة، تعبير قوي وهيبة ملكية بدون عدوانية.</div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-amber-500/10">
                  <div className="font-bold text-amber-200 mb-0.5">2. التاج الملوكي الفاخر (Royal Crown)</div>
                  <div className="text-gray-400">فوق رأس الذئب مباشرة مرصع بأحجار سوداء صغيرة باللون الذهبي المعدني.</div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-amber-500/10">
                  <div className="font-bold text-amber-200 mb-0.5">3. الدرع الملكي وحرف E (Royal Shield E)</div>
                  <div className="text-gray-400">خلف رأس الذئب درع أسود بحدود ذهبية يتوسطه حرف E بأسلوب ملكي رفيع.</div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-amber-500/10">
                  <div className="font-bold text-amber-200 mb-0.5">3. إكليل الغار والنصر (Laurel Wreath)</div>
                  <div className="text-gray-400">يطوق الشعار من الجانبين للتعبير عن الجودة والنجاح المستمر.</div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-amber-500/10">
                  <div className="font-bold text-amber-200 mb-0.5">4. الخط العربي الكلاسيكي "كافيه الديب"</div>
                  <div className="text-gray-400">خط عربي ملكي عريض وواضح بدون أي تشويه أو تصغير حاد.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Color Swatches */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-amber-300 flex items-center gap-2">
              <Palette className="w-5 h-5 text-amber-500" />
              <span>لوحة الألوان الملكية (Color Palette)</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {colorPalette.map((color) => (
                <div
                  key={color.hex}
                  onClick={() => handleCopy(color.hex)}
                  className={`p-4 rounded-2xl border cursor-pointer transition transform hover:-translate-y-1 ${color.class} flex flex-col justify-between h-32 relative overflow-hidden group shadow-lg`}
                >
                  <div>
                    <div className="text-xs font-black tracking-wide">{color.name}</div>
                    <div className="text-[10px] opacity-80 mt-1">{color.usage}</div>
                  </div>
                  <div className="flex items-center justify-between font-mono font-bold text-xs">
                    <span>{color.hex}</span>
                    {copiedColor === color.hex ? (
                      <Check className="w-4 h-4 text-emerald-400 animate-bounce" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'variants' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          
          {/* Gold Dark Theme Version */}
          <div className="bg-black border border-amber-500/40 rounded-3xl p-6 flex flex-col items-center justify-between text-center space-y-6">
            <div className="space-y-1">
              <h4 className="text-base font-bold text-amber-400">النسخة الذهبية الملكية</h4>
              <p className="text-xs text-gray-400">للشاشة الرئيسية، القوائم، وشاشات القفل</p>
            </div>

            <div className="p-4 bg-[#040302] rounded-2xl border border-amber-500/20 w-full flex items-center justify-center">
              <EldeebLogoFull className="w-[180px]" variant="gold" />
            </div>

            <button
              onClick={() => handleDownloadSvg(512, 'eldeeb-logo-gold.svg', 'gold')}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition"
            >
              تصدير النسخة الذهبية (SVG)
            </button>
          </div>

          {/* White Invoice Version */}
          <div className="bg-white text-black rounded-3xl p-6 flex flex-col items-center justify-between text-center space-y-6 shadow-2xl">
            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900">نسخة الفواتير الناصعة (Monochrome White)</h4>
              <p className="text-xs text-gray-600">للطباعة الحرارية والمستندات الورقية الرسمية</p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-gray-300 w-full flex items-center justify-center">
              <EldeebLogoFull className="w-[180px]" variant="white" />
            </div>

            <button
              onClick={() => handleDownloadSvg(512, 'eldeeb-logo-print-white.svg', 'white')}
              className="w-full py-2.5 rounded-xl bg-black text-white font-black text-xs hover:bg-gray-800 transition"
            >
              تصدير نسخة الفواتير والطباعة (SVG)
            </button>
          </div>

          {/* Header Compact Version */}
          <div className="bg-black border border-amber-500/40 rounded-3xl p-6 flex flex-col items-center justify-between text-center space-y-6">
            <div className="space-y-1">
              <h4 className="text-base font-bold text-amber-400">نسخة الترويسة والقائمة الجانبية</h4>
              <p className="text-xs text-gray-400">للشريط العالي والقوالب المدمجة</p>
            </div>

            <div className="p-6 bg-[#040302] rounded-2xl border border-amber-500/20 w-full flex items-center justify-center">
              <EldeebLogoHeader className="h-12" />
            </div>

            <button
              onClick={() => handleDownloadSvg(512, 'eldeeb-logo-header.svg', 'gold')}
              className="w-full py-2.5 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold text-xs hover:bg-amber-900 transition"
            >
              تصدير نسخة الترويسة (SVG)
            </button>
          </div>

        </div>
      )}

      {activeTab === 'code' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-amber-300">كود Vector SVG المباشر للشعار</h3>
            <button
              onClick={() => handleCopy(getEldeebLogoSvgString(512))}
              className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition flex items-center gap-2"
            >
              {copiedColor === getEldeebLogoSvgString(512) ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>نسخ كود SVG بالكامل</span>
            </button>
          </div>

          <pre className="p-4 bg-black/90 border border-amber-500/30 rounded-2xl text-[11px] font-mono text-amber-200/90 overflow-x-auto max-h-80 leading-relaxed dir-ltr">
            {getEldeebLogoSvgString(512)}
          </pre>
        </div>
      )}

    </div>
  );
};

export default RoyalBrandBoard;

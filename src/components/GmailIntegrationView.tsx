import React, { useState, useEffect } from 'react';
import {
    Mail,
    Send,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    LogIn,
    LogOut,
    FileText,
    DollarSign,
    ShieldCheck,
    Inbox,
    UserCheck,
    Copy,
    ExternalLink,
    Check
} from 'lucide-react';
import { dbService, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { AppSettings } from '../types';
import {
    requestGmailAuth,
    sendEmailViaGmail,
    buildDailySalesReportHtml,
    buildMailtoUrl,
    buildGmailWebUrl,
    GmailUser
} from '../lib/gmailService';

interface GmailIntegrationViewProps {
    onShowSuccessAlert: (msg: string) => void;
    onShowWarningAlert: (msg: string) => void;
    onSettingsChanged?: () => void;
}

export default function GmailIntegrationView({
    onShowSuccessAlert,
    onShowWarningAlert,
    onSettingsChanged
}: GmailIntegrationViewProps) {
    const [settings, setSettings] = useState<AppSettings>(() => dbService.getSettings());
    const [gmailUser, setGmailUser] = useState<GmailUser | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

    // Email state
    const [recipientEmail, setRecipientEmail] = useState<string>(() => {
        const s = dbService.getSettings();
        return s.phone || s.google_drive_user_email || 'Nader.Eldeeb.2015@gmail.com';
    });

    const [emailSubject, setEmailSubject] = useState<string>(`تقرير كافيه الديب اليومي - ${new Date().toLocaleDateString('ar-EG')}`);
    const [customMessage, setCustomMessage] = useState<string>('');
    const [isSending, setIsSending] = useState<boolean>(false);
    const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
    const [showFallbackCard, setShowFallbackCard] = useState<boolean>(false);
    const [fallbackData, setFallbackData] = useState<{ mailtoUrl: string; gmailWebUrl: string; summaryText: string; errorMsg: string }>({ mailtoUrl: '', gmailWebUrl: '', summaryText: '', errorMsg: '' });

    // Load saved Gmail token on mount & handle redirect token
    useEffect(() => {
        // 1. Check if returning from Google direct redirect
        const hash = window.location.hash;
        if (hash && hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            if (accessToken) {
                localStorage.setItem('cafe_gmail_access_token', accessToken);
                setIsConnected(true);
                onShowSuccessAlert('تم الاتصال بحساب Gmail بنجاح!');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }
        }

        // 2. Existing local storage load
        const s = dbService.getSettings();
        setSettings(s);

        const savedEmail = localStorage.getItem('cafe_gmail_user_email');
        const savedToken = localStorage.getItem('cafe_gmail_access_token');

        if (savedEmail && savedToken) {
            setGmailUser({
                email: savedEmail,
                accessToken: savedToken,
                access_token: savedToken
            });
            setIsConnected(true);
        }
    }, []);

    const handleSignIn = async () => {
        try {
            setIsAuthenticating(true);
            const user = await requestGmailAuth();
            if (user) {
                setGmailUser(user);
                setIsConnected(true);
                const token = user.accessToken || user.access_token || '';
                localStorage.setItem('cafe_gmail_user_email', user.email);
                localStorage.setItem('cafe_gmail_access_token', token);
                onShowSuccessAlert(`تم الاتصال بحساب Google (Gmail) بنجاح: (${user.email})! 🚀`);
            } else {
                onShowWarningAlert('لم يتم استكمال الاتصال بحساب Google.');
            }
        } catch (err) {
            console.error('Gmail Sign In failed:', err);
            onShowWarningAlert('فشل الاتصال بحساب جوجل.');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSignOut = () => {
        setGmailUser(null);
        setIsConnected(false);
        setShowFallbackCard(false);
        localStorage.removeItem('cafe_gmail_user_email');
        localStorage.removeItem('cafe_gmail_access_token');
        onShowSuccessAlert('تم تسجيل الخروج من Gmail.');
    };

    const handleSendDailyReportNow = () => {
        if (!recipientEmail || !recipientEmail.includes('@')) {
            onShowWarningAlert('يرجى إدخال بريد إلكتروني صحيح للمستلم.');
            return;
        }

        try {
            const metrics = dbService.calculateFinancialMetrics();
            const dateStr = new Date().toLocaleDateString('ar-EG');
            
            const summaryText = `☕ تقرير كافيه الديب اليومي - ${dateStr}\n----------------------------------\n📊 إجمالي المبيعات: ${metrics.totalSales.toFixed(2)} ج.م\n💸 إجمالي المصروفات: ${metrics.totalExpenses.toFixed(2)} ج.م\n💰 صافي الأرباح: ${metrics.netProfit.toFixed(2)} ج.م\n🧾 عدد الفواتير: ${metrics.totalOrders} فاتورة\n${customMessage ? `\n📝 ملاحظات إضافية: ${customMessage}` : ''}\n\nتم استخراج التقرير من نظام Cafe Eldeeb POS Enterprise`;

            const mailtoUrl = buildMailtoUrl(recipientEmail, emailSubject, summaryText);
            const gmailWebUrl = buildGmailWebUrl(recipientEmail, emailSubject, summaryText);

            setFallbackData({
                mailtoUrl,
                gmailWebUrl,
                summaryText,
                errorMsg: ''
            });
            setShowFallbackCard(true);

            // Trigger default email application launch via Mailto
            window.location.href = mailtoUrl;

            onShowSuccessAlert('تم فتح تطبيق البريد المفضل لديك وتجهيز التقرير بنجاح! 🚀');
        } catch (err: any) {
            console.error('Mailto error:', err);
            onShowWarningAlert('تعذر فتح تطبيق البريد تلقائياً.');
        }
    };

    return (
        <div className="p-4 max-w-4xl mx-auto space-y-6 dir-rtl text-right">
            {/* Top Connection Card */}
            <div className="bg-[#111111] border border-[#d4af37]/30 rounded-2xl p-6 luxury-shadow relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4 space-x-reverse">
                        <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-inner">
                            <Mail className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-white">ربط حساب Gmail</h2>
                                {isConnected && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        متصل
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-400 mt-0.5">إرسال التقارير والربط المباشر ببريد جوجل لإرسال إشعارات كافيه الديب</p>
                        </div>
                    </div>

                    <div>
                        {isConnected ? (
                            <div className="flex items-center gap-3">
                                <div className="text-left sm:text-right">
                                    <div className="text-xs text-gray-400">الحساب المتصل:</div>
                                    <div className="text-sm font-semibold text-emerald-400 dir-ltr">{gmailUser?.email || localStorage.getItem('cafe_gmail_user_email') || 'حساب Google'}</div>
                                </div>
                                <button
                                    onClick={handleSignOut}
                                    className="flex items-center space-x-2 space-x-reverse px-4 py-2 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/40 rounded-xl transition-all text-sm font-medium"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>قطع الاتصال</span>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleSignIn}
                                disabled={isAuthenticating}
                                className="flex items-center space-x-2 space-x-reverse px-5 py-2.5 bg-gradient-to-r from-[#d4af37] to-[#b58d2a] text-black font-bold rounded-xl hover:brightness-110 transition-all text-sm shadow-lg shadow-[#d4af37]/10 disabled:opacity-50"
                            >
                                <LogIn className="w-4 h-4" />
                                <span>{isAuthenticating ? 'جاري الاتصال...' : 'اتصال بـ Google'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {isConnected && (
                    <div className="mt-5 p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center space-x-3 space-x-reverse text-emerald-300 text-sm">
                        <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                        <span>تم توثيق الاتصال بحساب Google بنجاح. يمكن الآن إرسال التقارير المالية واليومية بنقرة واحدة.</span>
                    </div>
                )}
            </div>

            {/* Daily Report Section */}
            <div className="bg-[#111111] border border-[#d4af37]/30 rounded-2xl p-6 luxury-shadow space-y-5">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <div className="flex items-center space-x-2.5 space-x-reverse text-[#d4af37]">
                        <FileText className="w-5 h-5" />
                        <h3 className="text-lg font-bold text-white">إرسال التقرير اليومي عبر Gmail</h3>
                    </div>
                    <span className="text-xs text-gray-400 bg-[#1a1a1a] px-3 py-1 rounded-lg border border-gray-800">
                        كافيه الديب POS Enterprise
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1.5">بريد المستلم *</label>
                        <input
                            type="email"
                            value={recipientEmail}
                            onChange={(e) => setRecipientEmail(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#1a1a1a] border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-[#d4af37] focus:outline-none transition-colors text-sm"
                            placeholder="example@gmail.com"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1.5">موضوع الرسالة *</label>
                        <input
                            type="text"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            className="w-full px-4 py-2.5 bg-[#1a1a1a] border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-[#d4af37] focus:outline-none transition-colors text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-300 mb-1.5">ملاحظات إضافية ملحقة بالتقرير (اختياري)</label>
                    <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-[#1a1a1a] border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-[#d4af37] focus:outline-none transition-colors text-sm"
                        placeholder="اكتب أي ملاحظات إدارية أو إضافية ترغب في تضمينها في التقرير..."
                    />
                </div>

                <button
                    onClick={handleSendDailyReportNow}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold rounded-xl transition-all flex items-center justify-center space-x-2 space-x-reverse shadow-lg shadow-emerald-900/30 text-sm active:scale-[0.99]"
                >
                    <Mail className="w-5 h-5" />
                    <span>إرسال التقرير اليومي المباشر الآن 🚀</span>
                </button>
            </div>

            {/* Fallback Options Card */}
            {showFallbackCard && (
                <div className="bg-[#181205] border border-[#d4af37]/50 rounded-2xl p-5 space-y-4 luxury-shadow animate-fadeIn">
                    <div className="flex items-center space-x-2 space-x-reverse text-[#d4af37] font-bold text-base">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <span>خيارات إرسال التقرير البديلة</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                        إذا تعذر الإرسال المباشر من النظام لعدم توفر تصاريح API كافية، يمكنك إرسال كشف التقرير بنقرة واحدة عبر التطبيقات المثبتة لديك:
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                        <a
                            href={fallbackData.gmailWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-sm font-bold transition-all flex items-center space-x-2 space-x-reverse shadow-md"
                        >
                            <ExternalLink className="w-4 h-4" />
                            <span>فتح موقع Gmail Web وتجهيز الرسالة 🚀</span>
                        </a>
                        <a
                            href={fallbackData.mailtoUrl}
                            className="px-4 py-2.5 bg-[#252525] border border-gray-700 hover:border-[#d4af37] text-white rounded-xl text-sm font-semibold transition-all flex items-center space-x-2 space-x-reverse"
                        >
                            <Mail className="w-4 h-4 text-[#d4af37]" />
                            <span>فتح تطبيق البريد (Mailto)</span>
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(fallbackData.summaryText || '');
                                setCopiedSummary(true);
                                setTimeout(() => setCopiedSummary(false), 3000);
                            }}
                            className="px-4 py-2.5 bg-[#1f1f1f] border border-gray-700 hover:border-gray-500 text-gray-200 rounded-xl text-sm font-semibold transition-all flex items-center space-x-2 space-x-reverse"
                        >
                            {copiedSummary ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                            <span>{copiedSummary ? 'تم نسخ التقرير!' : 'نسخ نص التقرير'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebaseClient';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';

export interface GmailUser {
  email: string;
  messagesTotal?: number;
  threadsTotal?: number;
  accessToken?: string;
  access_token?: string;
}

const GMAIL_SCOPES = 'https://mail.google.com/ https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';

// Ensure Google Identity Services script is loaded
export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      setTimeout(() => resolve(), 1500);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

/**
 * Prompt user for Gmail OAuth token using Firebase Auth popup or Google Identity Services (GIS)
 */
export async function requestGmailAuth(clientId?: string): Promise<GmailUser | null> {
  const configClientId = (firebaseConfig as any)?.oAuthClientId || (firebaseConfig as any)?.OAuthClientId;
  const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  const storedSettings = ((): any => {
    try {
      const s = localStorage.getItem('cafe_settings') || localStorage.getItem('cafe_eldeeb_settings');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();
  const settingsClientId = storedSettings?.google_drive_client_id || storedSettings?.gmail_client_id;

  const resolvedClientId = (clientId && clientId.includes('.apps.googleusercontent.com'))
    ? clientId
    : (settingsClientId && settingsClientId.includes('.apps.googleusercontent.com'))
      ? settingsClientId
      : (envClientId && envClientId.includes('.apps.googleusercontent.com'))
        ? envClientId
        : (configClientId && configClientId.includes('.apps.googleusercontent.com'))
          ? configClientId
          : '864337937711-gi69esgs44rn7d2li3mb6bfjhdspe2pv.apps.googleusercontent.com';

  // ==========================================
  // 1. Android Native Flow (Capacitor Native Platform)
  // ==========================================
  // On native Android, attempt Native Google Sign-In with Credential Manager / AuthorizationClient.
  let nativeAccountHint: string | undefined = undefined;

  if (Capacitor.isNativePlatform()) {
    const maskedClientId = resolvedClientId ? `...${resolvedClientId.slice(-15)}` : 'MISSING';
    console.log('[Android Native Gmail] Starting Auth Flow:', {
      platform: Capacitor.getPlatform(),
      appId: 'com.eldeeb.pos',
      clientIdSuffix: maskedClientId,
      scopesCount: 3
    });

    try {
      const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ];

      try {
        await GoogleSignIn.initialize({
          clientId: resolvedClientId,
          scopes
        });
        console.log('[Android Native Gmail] GoogleSignIn.initialize succeeded.');
      } catch (initErr: any) {
        console.warn('[Android Native Gmail] GoogleSignIn.initialize notice:', initErr?.message || initErr);
      }

      console.log('[Android Native Gmail] Calling GoogleSignIn.signIn()...');
      const result = await GoogleSignIn.signIn();
      console.log('[Android Native Gmail] GoogleSignIn.signIn result received:', {
        hasUserId: !!result?.userId,
        hasEmail: !!result?.email,
        hasIdToken: !!result?.idToken,
        hasAccessToken: !!result?.accessToken,
        accessTokenType: result?.accessToken?.startsWith('eyJ') ? 'JWT_ID_TOKEN' : 'OAUTH2_TOKEN',
        hasServerAuthCode: !!result?.serverAuthCode
      });

      if (result?.email) {
        nativeAccountHint = result.email;
      }

      // If a valid OAuth2 access token was returned directly by native layer
      if (result.accessToken && !result.accessToken.startsWith('eyJ')) {
        try {
          const testRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${result.accessToken}` }
          });
          if (testRes.ok || testRes.status !== 401) {
            const profile = await fetchGmailProfile(result.accessToken);
            const userEmail = result.email || profile?.emailAddress || 'user@gmail.com';
            return {
              email: userEmail,
              accessToken: result.accessToken,
              access_token: result.accessToken,
              messagesTotal: profile?.messagesTotal,
              threadsTotal: profile?.threadsTotal
            };
          }
        } catch (verifyErr: any) {
          console.warn('[Android Native Gmail] Gmail verify check notice:', verifyErr?.message || verifyErr);
        }
      }

      console.log('[Android Native Gmail] Native layer completed account selection, proceeding to complete OAuth2 token acquisition...');
    } catch (nativeErr: any) {
      console.warn('[Android Native Gmail] Native sign-in notice, proceeding to web/GIS fallback:', nativeErr?.message || nativeErr);
    }
  }

  // ==========================================
  // 2. Google Identity Services (GIS) Token Client Flow
  // ==========================================
  // GIS Token Client is standard for Web/Vercel and yields an OAuth2 Access Token for Gmail.
  await loadGisScript();

  const gisUser = await new Promise<GmailUser | null>((resolve) => {
    let hasResolved = false;
    const safeResolve = (user: GmailUser | null) => {
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(timeoutId);
        resolve(user);
      }
    };

    const timeoutId = setTimeout(() => {
      console.warn('Gmail auth timed out or popup closed');
      safeResolve(null);
    }, 45000);

    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
      try {
        const clientConfig: any = {
          client_id: resolvedClientId,
          scope: GMAIL_SCOPES,
          callback: async (response: any) => {
            if (response && response.access_token && !response.error) {
              const token = response.access_token;
              const profile = await fetchGmailProfile(token);
              const userEmail = profile?.emailAddress || nativeAccountHint || 'user@gmail.com';

              const user: GmailUser = {
                email: userEmail,
                accessToken: token,
                access_token: token,
                messagesTotal: profile?.messagesTotal,
                threadsTotal: profile?.threadsTotal
              };
              safeResolve(user);
            } else {
              if (response?.error) {
                console.warn('Google Auth callback error:', response.error);
              }
              safeResolve(null);
            }
          },
          error_callback: (err: any) => {
            console.warn('GIS token client error:', err);
            safeResolve(null);
          },
          onerror: (err: any) => {
            console.warn('GIS Auth onerror:', err);
            safeResolve(null);
          }
        };

        if (nativeAccountHint) {
          clientConfig.hint = nativeAccountHint;
        }

        const client = google.accounts.oauth2.initTokenClient(clientConfig);
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn('Google Token Client init exception:', e);
        safeResolve(null);
      }
    } else {
      safeResolve(null);
    }
  });

  if (gisUser) {
    return gisUser;
  }

  // ==========================================
  // 3. Web Secondary Fallback: Firebase Auth Google Popup (Web only)
  // ==========================================
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    const userEmail = result.user?.email || 'user@gmail.com';

    if (token) {
      return {
        email: userEmail,
        accessToken: token,
        access_token: token
      };
    }
  } catch (fbErr: any) {
    console.warn('Firebase Auth Google popup warning:', fbErr?.code || fbErr?.message || fbErr);
  }

  return null;
}

/**
 * Fetch Gmail user profile / email
 */
export async function fetchGmailProfile(accessToken: string): Promise<any> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.email) {
        return { emailAddress: data.email, ...data };
      }
    }
  } catch (e) {
    console.warn('Error fetching Google userinfo:', e);
  }

  try {
    const res = await fetch('https://gmail.googleapis.com/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Error fetching Gmail profile:', e);
  }
  return null;
}

/**
 * Create base64url encoded MIME email
 */
function createMimeMessage(to: string, subject: string, htmlBody: string): string {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    htmlBody
  ];
  const message = messageParts.join('\r\n');
  return btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email using Gmail API
 */
export async function sendEmailViaGmail(
  optsOrToken: string | { token?: string; accessToken?: string; to?: string; toEmail?: string; subject?: string; htmlBody?: string; htmlContent?: string },
  toEmailParam?: string,
  subjectParam?: string,
  htmlContentParam?: string
): Promise<{ success: boolean; id?: string; error?: string; needReauth?: boolean }> {
  let token = '';
  let toEmail = '';
  let subject = '';
  let htmlContent = '';

  if (typeof optsOrToken === 'object' && optsOrToken !== null) {
    token = optsOrToken.token || optsOrToken.accessToken || '';
    toEmail = optsOrToken.to || optsOrToken.toEmail || '';
    subject = optsOrToken.subject || '';
    htmlContent = optsOrToken.htmlBody || optsOrToken.htmlContent || '';
  } else {
    token = (optsOrToken as string) || '';
    toEmail = toEmailParam || '';
    subject = subjectParam || '';
    htmlContent = htmlContentParam || '';
  }

  if (!token || token === 'dummy_token') {
    return {
      success: false,
      error: 'يرجى تسجيل الدخول أولاً بحساب Google لمنح صلاحيات إرسال البريد عبر Gmail.',
      needReauth: true
    };
  }

  // 1. Try server-side API proxy first (avoids browser CORS issues)
  try {
    const apiRes = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, toEmail, subject, htmlContent })
    });
    
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success) {
        return { success: true, id: data.id || 'server_ok' };
      }
    } else {
      const errData = await apiRes.json().catch(() => ({}));
      if (errData.needReauth || apiRes.status === 401 || apiRes.status === 403) {
        return {
          success: false,
          error: errData.error || 'انتهت صلاحية جلسة تسجيل الدخول بحساب قوقل. يرجى إعادة الاتصال بالحساب.',
          needReauth: true
        };
      }
    }
  } catch (apiErr) {
    console.warn('Server email proxy call failed, attempting direct fetch fallback:', apiErr);
  }

  // 2. Direct browser fetch fallback
  try {
    const raw = createMimeMessage(toEmail, subject, htmlContent);
    const response = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, id: data.id };
    } else {
      const errJson = await response.json().catch(() => ({}));
      console.warn('Gmail send error response:', response.status, errJson);
      const isAuthErr = response.status === 401 || response.status === 403;
      return {
        success: false,
        error: isAuthErr
          ? 'انتهت صلاحية جلسة تسجيل الدخول بحساب قوقل. يرجى الضغط على زر "اتصال بحساب Google" لإعادة التنشيط.'
          : (errJson.error?.message || `خطأ في استجابة خادم Google (${response.status})`),
        needReauth: isAuthErr
      };
    }
  } catch (err: any) {
    console.warn('Gmail send exception:', err);
    return {
      success: false,
      error: 'تعذر الاتصال المباشر بخوادم Gmail (قد تكون الجلسة قد انتهت). يرجى إعادة الاتصال بالحساب.',
      needReauth: true
    };
  }
}

/**
 * Generate direct Gmail Web compose URL (works on all devices without OAuth restrictions)
 */
export function buildGmailWebUrl(
  toEmail: string,
  subject: string,
  salesOrSummary?: any,
  expenses?: number,
  netProfit?: number,
  invoicesCount?: number,
  topProducts?: string[]
): string {
  let bodyText = '';
  if (typeof salesOrSummary === 'string') {
    bodyText = salesOrSummary;
  } else {
    const sales = Number(salesOrSummary || 0);
    const exp = Number(expenses || 0);
    const net = Number(netProfit || 0);
    const invCount = Number(invoicesCount || 0);
    const tops = topProducts || [];
    bodyText = `☕ تقرير كافيه الديب اليومي - ${new Date().toLocaleDateString('ar-EG')}
----------------------------------
📊 إجمالي المبيعات: ${sales.toFixed(2)} ج.م
💸 إجمالي المصروفات: ${exp.toFixed(2)} ج.م
💰 صافي الأرباح اليومي: ${net.toFixed(2)} ج.م
🧾 عدد الفواتير المنفذة: ${invCount} فاتورة
----------------------------------
🔥 الأكثر مبيعاً اليوم:
${tops.length > 0 ? tops.map(p => `• ${p}`).join('\n') : 'لا توجد مبيعات مسجلة حتى الآن'}

تم الاستخراج آلياً من نظام كافيه الديب POS Enterprise.`;
  }

  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
}

/**
 * Generate plain text mailto URL fallback for any mail client
 */
export function buildMailtoUrl(
  toEmail: string,
  subject: string,
  salesOrSummary?: any,
  expenses?: number,
  netProfit?: number,
  invoicesCount?: number,
  topProducts?: string[]
): string {
  let bodyText = '';
  if (typeof salesOrSummary === 'string') {
    bodyText = salesOrSummary;
  } else {
    const sales = Number(salesOrSummary || 0);
    const exp = Number(expenses || 0);
    const net = Number(netProfit || 0);
    const invCount = Number(invoicesCount || 0);
    const tops = topProducts || [];
    bodyText = `☕ تقرير كافيه الديب اليومي
----------------------------------
📊 إجمالي المبيعات: ${sales.toFixed(2)} ج.م
💸 إجمالي المصروفات: ${exp.toFixed(2)} ج.م
💰 صافي الأرباح: ${net.toFixed(2)} ج.م
🧾 عدد الفواتير: ${invCount} فاتورة
----------------------------------
🔥 الأكثر مبيعاً:
${tops.map(p => `- ${p}`).join('\n')}

تم الاستخراج آلياً من نظام كافيه الديب POS Enterprise.`;
  }

  return `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
}

/**
 * Helper template builders for Cafe Eldeeb reports
 */
export function buildDailySalesReportHtml(
  arg1: any,
  arg2?: any,
  arg3?: any,
  expensesParam?: number,
  netProfitParam?: number,
  invoicesCountParam?: number,
  topProductsParam?: string[]
): string {
  let cafeName = 'كافيه الديب';
  let dateStr = new Date().toLocaleDateString('ar-EG');
  let sales = 0;
  let expenses = 0;
  let netProfit = 0;
  let invoicesCount = 0;
  let topProducts: string[] = [];

  if (typeof arg1 === 'object' && arg1 !== null) {
    const metrics = arg1;
    const settingsData = arg2 || {};
    cafeName = settingsData.cafe_name || 'كافيه الديب';
    sales = metrics.totalSales || 0;
    expenses = metrics.totalExpenses || 0;
    netProfit = metrics.netProfit ?? (sales - expenses);
    invoicesCount = metrics.totalOrders || metrics.invoicesCount || 0;
    topProducts = metrics.topProducts || [];
  } else {
    cafeName = String(arg1 || 'كافيه الديب');
    dateStr = String(arg2 || new Date().toLocaleDateString('ar-EG'));
    sales = Number(arg3 || 0);
    expenses = Number(expensesParam || 0);
    netProfit = Number(netProfitParam || 0);
    invoicesCount = Number(invoicesCountParam || 0);
    topProducts = topProductsParam || [];
  }

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #0d0d0d; color: #f3f4f6; padding: 24px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid #d4af37;">
      <div style="text-align: center; border-bottom: 2px solid #d4af37; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #d4af37; margin: 0; font-size: 24px;">☕ ${cafeName}</h1>
        <p style="color: #9ca3af; margin: 6px 0 0 0; font-size: 14px;">التقرير المالي والحسابات اليومي — ${dateStr}</p>
      </div>

      <div style="background-color: #1a1a1a; padding: 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #333;">
        <h2 style="color: #ffffff; font-size: 16px; margin-top: 0;">📊 ملخص الأرباح والمبيعات</h2>
        <table style="width: 100%; text-align: right; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">إجمالي المبيعات:</td>
            <td style="padding: 8px 0; color: #10b981; font-weight: bold; text-align: left;">${sales.toFixed(2)} ج.م</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">إجمالي المصروفات:</td>
            <td style="padding: 8px 0; color: #ef4444; font-weight: bold; text-align: left;">${expenses.toFixed(2)} ج.م</td>
          </tr>
          <tr style="border-top: 1px solid #333;">
            <td style="padding: 12px 0; color: #ffffff; font-weight: bold;">صافي الأرباح اليومي:</td>
            <td style="padding: 12px 0; color: #d4af37; font-weight: bold; font-size: 18px; text-align: left;">${netProfit.toFixed(2)} ج.م</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">عدد الفواتير المنفذة:</td>
            <td style="padding: 8px 0; color: #ffffff; font-weight: bold; text-align: left;">${invoicesCount} فاتورة</td>
          </tr>
        </table>
      </div>

      ${topProducts.length > 0 ? `
      <div style="background-color: #1a1a1a; padding: 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #333;">
        <h3 style="color: #d4af37; font-size: 14px; margin-top: 0;">🔥 الأكثر مبيعاً اليوم:</h3>
        <ul style="margin: 0; padding-right: 20px; color: #e5e7eb; font-size: 13px;">
          ${topProducts.map(p => `<li style="margin-bottom: 4px;">${p}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      <div style="text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #262626; padding-top: 12px;">
        تم استخراج وإرسال هذا التقرير آلياً عبر نظام كافيه الديب POS Enterprise
      </div>
    </div>
  `;
}

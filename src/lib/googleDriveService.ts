/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebaseClient';
import {
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';

export interface GmailUser {
  email: string;
  messagesTotal?: number;
  threadsTotal?: number;
  accessToken?: string;
  access_token?: string;
}

const GMAIL_SEND_SCOPE =
  'https://www.googleapis.com/auth/gmail.send';

const GOOGLE_EMAIL_SCOPE =
  'https://www.googleapis.com/auth/userinfo.email';

const GOOGLE_PROFILE_SCOPE =
  'https://www.googleapis.com/auth/userinfo.profile';

const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '864337937711-gi69esgs44rn7d2li3mb6bfjhdspe2pv.apps.googleusercontent.com';

let nativeGoogleInitialized = false;

/**
 * Resolve WEB OAuth client ID.
 *
 * IMPORTANT:
 * @capawesome/capacitor-google-sign-in requires
 * the WEB client ID in initialize(), including Android.
 */
function resolveGoogleWebClientId(
  clientId?: string
): string {
  const configClientId =
    (firebaseConfig as any)?.oAuthClientId ||
    (firebaseConfig as any)?.OAuthClientId;

  const envClientId =
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

  let storedSettings: any = null;

  try {
    const raw =
      localStorage.getItem('cafe_settings') ||
      localStorage.getItem(
        'cafe_eldeeb_settings'
      );

    storedSettings = raw
      ? JSON.parse(raw)
      : null;
  } catch {
    storedSettings = null;
  }

  const settingsClientId =
    storedSettings?.gmail_client_id ||
    storedSettings?.google_drive_client_id;

  const candidates = [
    clientId,
    settingsClientId,
    envClientId,
    configClientId,
    DEFAULT_GOOGLE_WEB_CLIENT_ID
  ];

  const valid = candidates.find(
    (value) =>
      typeof value === 'string' &&
      value.includes(
        '.apps.googleusercontent.com'
      )
  );

  return (
    valid ||
    DEFAULT_GOOGLE_WEB_CLIENT_ID
  );
}

/**
 * Initialize native Google authorization.
 *
 * OAuth scopes are mandatory because they are what make
 * result.accessToken available.
 */
async function initializeNativeGoogle(
  clientId: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (nativeGoogleInitialized) {
    return;
  }

  await GoogleSignIn.initialize({
    clientId,

    scopes: [
      GMAIL_SEND_SCOPE,
      GOOGLE_EMAIL_SCOPE,
      GOOGLE_PROFILE_SCOPE
    ]
  });

  nativeGoogleInitialized = true;

  console.log(
    '[Google Native Gmail] initialized with OAuth scopes'
  );
}

/**
 * Load GIS on Web only.
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if (
      (window as any).google?.accounts?.oauth2
    ) {
      resolve();
      return;
    }

    const existing =
      document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );

    if (existing) {
      existing.addEventListener(
        'load',
        () => resolve()
      );

      setTimeout(
        () => resolve(),
        2000
      );

      return;
    }

    const script =
      document.createElement('script');

    script.src =
      'https://accounts.google.com/gsi/client';

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => resolve();

    document.head.appendChild(
      script
    );
  });
}

/**
 * Fetch Gmail profile.
 */
export async function fetchGmailProfile(
  accessToken: string
): Promise<any> {
  if (!accessToken?.trim()) {
    return null;
  }

  try {
    const response =
      await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      if (data?.email) {
        return {
          emailAddress:
            data.email,
          ...data
        };
      }
    }
  } catch (error) {
    console.warn(
      '[Gmail] userinfo failed:',
      error
    );
  }

  try {
    const response =
      await fetch(
        'https://gmail.googleapis.com/v1/users/me/profile',
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    console.warn(
      '[Gmail] Gmail profile failed:',
      error
    );
  }

  return null;
}

/**
 * Native Android Gmail OAuth.
 *
 * IMPORTANT:
 * Only result.accessToken is accepted.
 *
 * result.idToken is NEVER used as an API token.
 */
async function requestNativeGmailAuth(
  clientId: string
): Promise<GmailUser | null> {
  try {
    await initializeNativeGoogle(
      clientId
    );

    console.log(
      '[Android Native Gmail] Starting OAuth authorization...'
    );

    const result =
      await GoogleSignIn.signIn();

    console.log(
      '[Android Native Gmail] Native result:',
      {
        hasEmail: !!result?.email,
        hasIdToken: !!result?.idToken,
        hasAccessToken:
          !!result?.accessToken,
        hasServerAuthCode:
          !!result?.serverAuthCode
      }
    );

    /*
     * ABSOLUTELY IMPORTANT:
     *
     * NEVER:
     *
     * result.accessToken || result.idToken
     *
     * ID token cannot be sent to Gmail API.
     */

    const accessToken =
      result?.accessToken || '';

    if (!accessToken.trim()) {
      console.error(
        '[Android Native Gmail] No OAuth access token returned by Google.',
        {
          hasIdToken: !!result?.idToken,
          hasServerAuthCode:
            !!result?.serverAuthCode
        }
      );

      return null;
    }

    const profile =
      await fetchGmailProfile(
        accessToken
      );

    const email =
      result.email ||
      profile?.emailAddress ||
      'user@gmail.com';

    console.log(
      '[Android Native Gmail] OAuth access token acquired for:',
      email
    );

    return {
      email,
      accessToken,
      access_token: accessToken,
      messagesTotal:
        profile?.messagesTotal,
      threadsTotal:
        profile?.threadsTotal
    };
  } catch (error: any) {
    console.error(
      '[Android Native Gmail] OAuth failed:',
      error?.message || error
    );

    return null;
  }
}

/**
 * Web GIS Gmail authorization.
 */
async function requestWebGmailAuth(
  clientId: string
): Promise<GmailUser | null> {
  await loadGisScript();

  return new Promise<GmailUser | null>(
    (resolve) => {
      let completed = false;

      const finish = (
        value: GmailUser | null
      ) => {
        if (completed) {
          return;
        }

        completed = true;
        clearTimeout(timeout);
        resolve(value);
      };

      const timeout =
        setTimeout(() => {
          console.warn(
            '[Web Gmail] OAuth timeout'
          );

          finish(null);
        }, 45000);

      const google =
        (window as any).google;

      if (
        !google?.accounts?.oauth2
      ) {
        finish(null);
        return;
      }

      try {
        const client =
          google.accounts.oauth2.initTokenClient(
            {
              client_id: clientId,

              scope: [
                GMAIL_SEND_SCOPE,
                GOOGLE_EMAIL_SCOPE,
                GOOGLE_PROFILE_SCOPE
              ].join(' '),

              callback: async (
                response: any
              ) => {
                if (
                  !response?.access_token ||
                  response?.error
                ) {
                  console.warn(
                    '[Web Gmail] OAuth error:',
                    response?.error
                  );

                  finish(null);
                  return;
                }

                const accessToken =
                  response.access_token;

                const profile =
                  await fetchGmailProfile(
                    accessToken
                  );

                finish({
                  email:
                    profile?.emailAddress ||
                    'user@gmail.com',

                  accessToken,

                  access_token:
                    accessToken,

                  messagesTotal:
                    profile?.messagesTotal,

                  threadsTotal:
                    profile?.threadsTotal
                });
              },

              error_callback: (
                error: any
              ) => {
                console.warn(
                  '[Web Gmail] OAuth error:',
                  error
                );

                finish(null);
              }
            }
          );

        client.requestAccessToken();
      } catch (error) {
        console.error(
          '[Web Gmail] OAuth exception:',
          error
        );

        finish(null);
      }
    }
  );
}

/**
 * Firebase Google OAuth fallback.
 *
 * Web only.
 */
async function requestFirebaseGmailAuth():
  Promise<GmailUser | null> {
  try {
    const provider =
      new GoogleAuthProvider();

    provider.addScope(
      GMAIL_SEND_SCOPE
    );

    provider.addScope(
      GOOGLE_EMAIL_SCOPE
    );

    provider.addScope(
      GOOGLE_PROFILE_SCOPE
    );

    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const result =
      await signInWithPopup(
        auth,
        provider
      );

    const credential =
      GoogleAuthProvider.credentialFromResult(
        result
      );

    const accessToken =
      credential?.accessToken;

    /*
     * Do not use Firebase ID token here.
     */
    if (!accessToken) {
      console.error(
        '[Firebase Gmail] No OAuth access token returned'
      );

      return null;
    }

    return {
      email:
        result.user?.email ||
        'user@gmail.com',

      accessToken,

      access_token:
        accessToken
    };
  } catch (error: any) {
    console.warn(
      '[Firebase Gmail] OAuth failed:',
      error?.code ||
        error?.message ||
        error
    );

    return null;
  }
}

/**
 * Main Gmail authentication.
 */
export async function requestGmailAuth(
  clientId?: string
): Promise<GmailUser | null> {
  const resolvedClientId =
    resolveGoogleWebClientId(
      clientId
    );

  console.log(
    '[Gmail] Client ID:',
    `...${resolvedClientId.slice(-20)}`
  );

  /*
   * ANDROID:
   *
   * Native only.
   *
   * We deliberately do NOT fall back to
   * GIS inside the Android WebView.
   */
  if (Capacitor.isNativePlatform()) {
    return requestNativeGmailAuth(
      resolvedClientId
    );
  }

  /*
   * WEB:
   */
  const gisUser =
    await requestWebGmailAuth(
      resolvedClientId
    );

  if (gisUser) {
    return gisUser;
  }

  return requestFirebaseGmailAuth();
}

/**
 * Create Base64URL MIME email.
 */
function createMimeMessage(
  to: string,
  subject: string,
  htmlBody: string
): string {
  const utf8Subject =
    `=?utf-8?B?${btoa(
      unescape(
        encodeURIComponent(
          subject
        )
      )
    )}?=`;

  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    htmlBody
  ];

  const message =
    messageParts.join('\r\n');

  return btoa(
    unescape(
      encodeURIComponent(
        message
      )
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email through Gmail API.
 */
export async function sendEmailViaGmail(
  optsOrToken:
    | string
    | {
        token?: string;
        accessToken?: string;
        to?: string;
        toEmail?: string;
        subject?: string;
        htmlBody?: string;
        htmlContent?: string;
      },

  toEmailParam?: string,
  subjectParam?: string,
  htmlContentParam?: string
): Promise<{
  success: boolean;
  id?: string;
  error?: string;
  needReauth?: boolean;
}> {
  let token = '';
  let toEmail = '';
  let subject = '';
  let htmlContent = '';

  if (
    typeof optsOrToken ===
      'object' &&
    optsOrToken !== null
  ) {
    token =
      optsOrToken.accessToken ||
      optsOrToken.token ||
      '';

    toEmail =
      optsOrToken.toEmail ||
      optsOrToken.to ||
      '';

    subject =
      optsOrToken.subject ||
      '';

    htmlContent =
      optsOrToken.htmlBody ||
      optsOrToken.htmlContent ||
      '';
  } else {
    token =
      optsOrToken || '';

    toEmail =
      toEmailParam || '';

    subject =
      subjectParam || '';

    htmlContent =
      htmlContentParam || '';
  }

  if (
    !token ||
    token === 'dummy_token'
  ) {
    return {
      success: false,
      error:
        'يرجى تسجيل الدخول أولاً بحساب Google لمنح صلاحية إرسال البريد عبر Gmail.',
      needReauth: true
    };
  }

  /*
   * Native Android:
   *
   * Send directly to Gmail API.
   *
   * No /api/send-email proxy is required.
   */
  try {
    const raw =
      createMimeMessage(
        toEmail,
        subject,
        htmlContent
      );

    const response =
      await fetch(
        'https://gmail.googleapis.com/v1/users/me/messages/send',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${token}`,

            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            raw
          })
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      return {
        success: true,
        id: data.id
      };
    }

    const errorJson =
      await response
        .json()
        .catch(() => ({}));

    console.warn(
      '[Gmail] Send failed:',
      response.status,
      errorJson
    );

    const authError =
      response.status === 401 ||
      response.status === 403;

    return {
      success: false,

      error: authError
        ? 'انتهت صلاحية تصريح Google أو لم يتم منح صلاحية Gmail. يرجى إعادة الاتصال بحساب Google.'
        : (
            errorJson?.error
              ?.message ||
            `خطأ في Gmail (${response.status})`
          ),

      needReauth: authError
    };
  } catch (error: any) {
    console.error(
      '[Gmail] Send exception:',
      error
    );

    return {
      success: false,

      error:
        'تعذر الاتصال بخادم Gmail. يرجى إعادة الاتصال بحساب Google.',

      needReauth: true
    };
  }
}

/**
 * Direct Gmail compose URL.
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

  if (
    typeof salesOrSummary ===
    'string'
  ) {
    bodyText =
      salesOrSummary;
  } else {
    const sales =
      Number(
        salesOrSummary || 0
      );

    const exp =
      Number(expenses || 0);

    const net =
      Number(netProfit || 0);

    const invCount =
      Number(
        invoicesCount || 0
      );

    const tops =
      topProducts || [];

    bodyText =
      `☕ تقرير كافيه الديب اليومي - ${new Date().toLocaleDateString('ar-EG')}
----------------------------------
📊 إجمالي المبيعات: ${sales.toFixed(2)} ج.م
💸 إجمالي المصروفات: ${exp.toFixed(2)} ج.م
💰 صافي الأرباح اليومي: ${net.toFixed(2)} ج.م
🧾 عدد الفواتير المنفذة: ${invCount} فاتورة
----------------------------------
🔥 الأكثر مبيعاً اليوم:
${
  tops.length > 0
    ? tops
        .map(
          (p) => `• ${p}`
        )
        .join('\n')
    : 'لا توجد مبيعات مسجلة حتى الآن'
}

تم الاستخراج آلياً من نظام كافيه الديب POS Enterprise.`;
  }

  return (
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(
      toEmail
    )}` +
    `&su=${encodeURIComponent(
      subject
    )}` +
    `&body=${encodeURIComponent(
      bodyText
    )}`
  );
}

/**
 * mailto fallback.
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

  if (
    typeof salesOrSummary ===
    'string'
  ) {
    bodyText =
      salesOrSummary;
  } else {
    const sales =
      Number(
        salesOrSummary || 0
      );

    const exp =
      Number(expenses || 0);

    const net =
      Number(netProfit || 0);

    const invCount =
      Number(
        invoicesCount || 0
      );

    const tops =
      topProducts || [];

    bodyText =
      `☕ تقرير كافيه الديب اليومي
----------------------------------
📊 إجمالي المبيعات: ${sales.toFixed(2)} ج.م
💸 إجمالي المصروفات: ${exp.toFixed(2)} ج.م
💰 صافي الأرباح: ${net.toFixed(2)} ج.م
🧾 عدد الفواتير: ${invCount} فاتورة
----------------------------------
🔥 الأكثر مبيعاً:
${
  tops.length
    ? tops
        .map(
          (p) => `- ${p}`
        )
        .join('\n')
    : 'لا توجد مبيعات'
}

تم الاستخراج آلياً من نظام كافيه الديب POS Enterprise.`;
  }

  return (
    `mailto:${encodeURIComponent(
      toEmail
    )}` +
    `?subject=${encodeURIComponent(
      subject
    )}` +
    `&body=${encodeURIComponent(
      bodyText
    )}`
  );
}

/**
 * Daily report HTML.
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
  let cafeName =
    'كافيه الديب';

  let dateStr =
    new Date().toLocaleDateString(
      'ar-EG'
    );

  let sales = 0;
  let expenses = 0;
  let netProfit = 0;
  let invoicesCount = 0;

  let topProducts: string[] =
    [];

  if (
    typeof arg1 ===
      'object' &&
    arg1 !== null
  ) {
    const metrics =
      arg1;

    const settingsData =
      arg2 || {};

    cafeName =
      settingsData.cafe_name ||
      'كافيه الديب';

    sales =
      metrics.totalSales ||
      0;

    expenses =
      metrics.totalExpenses ||
      0;

    netProfit =
      metrics.netProfit ??
      (sales - expenses);

    invoicesCount =
      metrics.totalOrders ||
      metrics.invoicesCount ||
      0;

    topProducts =
      metrics.topProducts ||
      [];
  } else {
    cafeName =
      String(
        arg1 ||
          'كافيه الديب'
      );

    dateStr =
      String(
        arg2 ||
          new Date().toLocaleDateString(
            'ar-EG'
          )
      );

    sales =
      Number(arg3 || 0);

    expenses =
      Number(
        expensesParam || 0
      );

    netProfit =
      Number(
        netProfitParam || 0
      );

    invoicesCount =
      Number(
        invoicesCountParam ||
          0
      );

    topProducts =
      topProductsParam || [];
  }

  return `
<div dir="rtl" style="font-family:Arial,sans-serif;background:#0d0d0d;color:#f3f4f6;padding:24px;border-radius:16px;max-width:600px;margin:0 auto;border:1px solid #d4af37;">

  <div style="text-align:center;border-bottom:2px solid #d4af37;padding-bottom:16px;margin-bottom:20px;">
    <h1 style="color:#d4af37;margin:0;font-size:24px;">
      ☕ ${cafeName}
    </h1>

    <p style="color:#9ca3af;margin:6px 0 0 0;font-size:14px;">
      التقرير المالي والحسابات اليومي — ${dateStr}
    </p>
  </div>

  <div style="background:#1a1a1a;padding:16px;border-radius:12px;margin-bottom:20px;border:1px solid #333;">

    <h2 style="color:#fff;font-size:16px;margin-top:0;">
      📊 ملخص الأرباح والمبيعات
    </h2>

    <table style="width:100%;text-align:right;font-size:14px;border-collapse:collapse;">

      <tr>
        <td style="padding:8px 0;color:#9ca3af;">
          إجمالي المبيعات:
        </td>

        <td style="padding:8px 0;font-weight:bold;text-align:left;">
          ${sales.toFixed(2)} ج.م
        </td>
      </tr>

      <tr>
        <td style="padding:8px 0;color:#9ca3af;">
          إجمالي المصروفات:
        </td>

        <td style="padding:8px 0;font-weight:bold;text-align:left;">
          ${expenses.toFixed(2)} ج.م
        </td>
      </tr>

      <tr style="border-top:1px solid #333;">
        <td style="padding:12px 0;color:#fff;font-weight:bold;">
          صافي الأرباح اليومي:
        </td>

        <td style="padding:12px 0;font-weight:bold;font-size:18px;text-align:left;">
          ${netProfit.toFixed(2)} ج.م
        </td>
      </tr>

      <tr>
        <td style="padding:8px 0;color:#9ca3af;">
          عدد الفواتير المنفذة:
        </td>

        <td style="padding:8px 0;font-weight:bold;text-align:left;">
          ${invoicesCount} فاتورة
        </td>
      </tr>

    </table>
  </div>

  ${
    topProducts.length > 0
      ? `
  <div style="background:#1a1a1a;padding:16px;border-radius:12px;margin-bottom:20px;border:1px solid #333;">

    <h3 style="font-size:14px;margin-top:0;">
      🔥 الأكثر مبيعاً اليوم:
    </h3>

    <ul style="margin:0;padding-right:20px;font-size:13px;">
      ${topProducts
        .map(
          (p) =>
            `<li style="margin-bottom:4px;">${p}</li>`
        )
        .join('')}
    </ul>

  </div>
  `
      : ''
  }

  <div style="text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #262626;padding-top:12px;">
    تم استخراج وإرسال هذا التقرير آلياً عبر نظام كافيه الديب POS Enterprise
  </div>

</div>
`;
}

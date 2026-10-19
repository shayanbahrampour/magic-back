// Myket in-app billing — server-side purchase validation.
//
// The Android build published on Myket must sell through Myket's own billing,
// so the app buys products in the Myket app and hands us the purchase token.
// We never trust the app's word for it: every purchase is confirmed here
// against Myket's developer API before anything is granted.
//
// Configuration comes from the environment:
//   MYKET_ACCESS_TOKEN   from the Myket developer panel, in-app products section.
//   MYKET_PACKAGE_NAME   the Android package the products are registered under
//                        (`expo.android.package` in the app's app.json).
//
// Docs: https://myket.ir/kb/pages/server-to-server-payment-validation-api/

const MYKET_API_BASE = 'https://developer.myket.ir/api/partners/applications';
const REQUEST_TIMEOUT_MS = 15_000;

/** Myket could not be asked (network, config) — the purchase is still undecided. */
export class MyketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MyketError';
  }
}

/** Myket answered and refused the purchase — it is not a valid payment. */
export class MyketRejection extends Error {
  code: number | string | null;

  constructor(message: string, code: number | string | null) {
    super(message);
    this.name = 'MyketRejection';
    this.code = code;
  }
}

export type MyketPurchaseInfo = {
  kind?: string;
  /** Milliseconds since the epoch. */
  purchaseTime?: number;
  /** 0 = purchased, 1 = refunded / failed. */
  purchaseState?: number;
  /** 0 = not consumed yet, 1 = consumed. */
  consumptionState?: number;
  developerPayload?: string;
};

export function myketConfigured(): boolean {
  return Boolean(process.env.MYKET_ACCESS_TOKEN?.trim() && process.env.MYKET_PACKAGE_NAME?.trim());
}

/**
 * Asks Myket about one purchase. Resolves only when Myket confirmed the
 * purchase exists; a refusal throws MyketRejection, and anything that leaves
 * the answer unknown throws MyketError.
 */
export async function verifyMyketPurchase(sku: string, purchaseToken: string): Promise<MyketPurchaseInfo> {
  const accessToken = process.env.MYKET_ACCESS_TOKEN?.trim();
  const packageName = process.env.MYKET_PACKAGE_NAME?.trim();
  if (!accessToken || !packageName) {
    throw new MyketError('پرداخت مایکت روی سرور تنظیم نشده است.');
  }

  const url =
    `${MYKET_API_BASE}/${encodeURIComponent(packageName)}` +
    `/purchases/products/${encodeURIComponent(sku)}/verify`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Access-Token': accessToken,
      },
      body: JSON.stringify({ tokenId: purchaseToken }),
      signal: controller.signal,
    });
  } catch {
    throw new MyketError('ارتباط با مایکت برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.');
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (response.ok && data) return data as MyketPurchaseInfo;

  // An error body with a code is Myket's verdict on this purchase (unknown
  // token, wrong SKU). Anything else — a bare 5xx, an auth failure — says
  // nothing about the purchase itself.
  if (data && (data.code != null || data.messageCode != null) && response.status !== 401 && response.status !== 403) {
    console.warn('[MYKET] verify refused:', response.status, data.code, data.messageCode);
    throw new MyketRejection(
      typeof data.translatedMessage === 'string' && data.translatedMessage
        ? data.translatedMessage
        : 'مایکت این خرید را تأیید نکرد.',
      data.code ?? data.messageCode ?? null
    );
  }

  console.error('[MYKET] verify failed:', response.status, raw.slice(0, 300));
  throw new MyketError('پاسخ نامعتبر از مایکت دریافت شد. لطفاً چند لحظه بعد دوباره تلاش کنید.');
}

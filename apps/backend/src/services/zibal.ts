// Zibal internet payment gateway (IPG) client.
//
// Configuration comes from the environment — never hardcode the merchant, since
// this file is committed:
//   ZIBAL_MERCHANT   the gateway id from the Zibal panel. Defaults to the
//                    sandbox merchant `zibal`, which accepts any card and never
//                    moves real money, so a local backend works out of the box.
//   PUBLIC_BASE_URL  the publicly reachable origin of *this* backend, e.g.
//                    `https://magicapi.gerdoo.app`. Zibal redirects the payer
//                    here after the bank, so it must be https and reachable
//                    from the open internet.
//
// Zibal's IPG is authenticated purely by `merchant`; there is no bearer token
// on these endpoints.
//
// Docs: https://help.zibal.ir/IPG/API/

const ZIBAL_BASE_URL = 'https://gateway.zibal.ir';
const REQUEST_TIMEOUT_MS = 15_000;

/** Sandbox merchant. Real cards are never charged while this is in use. */
export const SANDBOX_MERCHANT = 'zibal';

export class ZibalError extends Error {
  /** Zibal's `result` code when the gateway answered but refused. */
  result?: number;

  constructor(message: string, result?: number) {
    super(message);
    this.name = 'ZibalError';
    this.result = result;
  }
}

export function zibalMerchant(): string {
  return process.env.ZIBAL_MERCHANT?.trim() || SANDBOX_MERCHANT;
}

/** True when a real (non-sandbox) merchant is configured. */
export function zibalConfigured(): boolean {
  return zibalMerchant() !== SANDBOX_MERCHANT;
}

/** The page the payer is redirected to after the bank. */
export function callbackUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new ZibalError('PUBLIC_BASE_URL تنظیم نشده است. پرداخت آنلاین در دسترس نیست.');
  }
  return `${base}/api/payments/callback`;
}

/** The gateway page the user must be sent to for a given session. */
export function paymentPageUrl(trackId: string): string {
  return `${ZIBAL_BASE_URL}/start/${trackId}`;
}

// ── Zibal's documented code tables, in Persian ──────────────────────────────

// جدول کدهای نتیجه (shared shape across request / verify / inquiry).
const RESULT_MESSAGES: Record<number, string> = {
  100: 'با موفقیت انجام شد.',
  102: 'درگاه پرداخت یافت نشد.',
  103: 'درگاه پرداخت غیرفعال است.',
  104: 'اطلاعات درگاه پرداخت نامعتبر است.',
  105: 'مبلغ تراکنش کمتر از حد مجاز است.',
  106: 'آدرس بازگشت نامعتبر است.',
  107: 'حالت تسهیم درصدی نامعتبر است.',
  108: 'اطلاعات یکی از ذی‌نفعان تسهیم نامعتبر است.',
  109: 'یکی از ذی‌نفعان تسهیم غیرفعال است.',
  110: 'اطلاعات تسهیم ناقص است.',
  111: 'مبلغ تراکنش با مجموع سهم‌های تسهیم برابر نیست.',
  112: 'موجودی کیف پول کارمزد کافی نیست.',
  113: 'مبلغ تراکنش از سقف مجاز بیشتر است.',
  114: 'کد ملی ارسالی نامعتبر است.',
  115: 'آی‌پی سرور در پنل زیبال ثبت نشده است.',
  116: 'حالت کارمزد نامعتبر است.',
  201: 'این پرداخت پیش‌تر تأیید شده است.',
  202: 'پرداخت انجام نشده یا ناموفق بوده است.',
  203: 'شناسه پیگیری نامعتبر است.',
};

// جدول وضعیت‌ها — the state of the payment itself.
const STATUS_MESSAGES: Record<number, string> = {
  [-1]: 'در انتظار پرداخت',
  [-2]: 'خطای داخلی درگاه',
  1: 'پرداخت شده و تأییدشده',
  2: 'پرداخت شده اما تأییدنشده',
  3: 'پرداخت توسط شما لغو شد.',
  4: 'شماره کارت نامعتبر است.',
  5: 'موجودی حساب کافی نیست.',
  6: 'رمز واردشده اشتباه است.',
  7: 'تعداد درخواست‌ها بیش از حد مجاز است.',
  8: 'تعداد پرداخت اینترنتی روزانه بیش از حد مجاز است.',
  9: 'مبلغ پرداخت اینترنتی روزانه بیش از حد مجاز است.',
  10: 'صادرکننده‌ی کارت نامعتبر است.',
  11: 'خطای سوییچ بانکی',
  12: 'کارت قابل دسترسی نیست.',
  15: 'تراکنش استرداد شده است.',
  16: 'تراکنش در حال استرداد است.',
  18: 'تراکنش ریورس شده است.',
  21: 'پذیرنده نامعتبر است.',
};

export function resultMessage(result: number | null | undefined): string {
  if (result == null) return 'پاسخ نامشخص از درگاه پرداخت.';
  return RESULT_MESSAGES[result] ?? `خطای درگاه پرداخت (کد ${result}).`;
}

export function statusMessage(status: number | null | undefined): string {
  if (status == null) return 'وضعیت پرداخت نامشخص است.';
  return STATUS_MESSAGES[status] ?? `وضعیت نامشخص پرداخت (کد ${status}).`;
}

/** Zibal statuses 1 and 2 both mean the bank took the money. */
export function isPaidStatus(status: number | null | undefined): boolean {
  return status === 1 || status === 2;
}

// ── Wire types ──────────────────────────────────────────────────────────────

export type ZibalRequestParams = {
  /** In rials — Zibal never speaks tomans. */
  amountRial: number;
  description?: string;
  orderId: string;
  /** Pre-fills the payer's saved cards on the gateway page. Optional. */
  mobile?: string;
};

export type ZibalRequestResult = {
  trackId: string;
  result: number;
  message?: string;
};

export type ZibalVerifyResult = {
  result: number;
  message?: string;
  status?: number;
  amount?: number;
  refNumber?: number | string;
  cardNumber?: string;
  orderId?: string;
  paidAt?: string;
};

export type ZibalInquiryResult = ZibalVerifyResult & {
  createdAt?: string;
  verifiedAt?: string;
};

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ZIBAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: zibalMerchant(), ...body }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ZibalError('ارتباط با درگاه پرداخت برقرار نشد. لطفاً دوباره تلاش کنید.');
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

  if (!response.ok || data == null) {
    throw new ZibalError('پاسخ نامعتبر از درگاه پرداخت دریافت شد.');
  }
  return data as T;
}

/**
 * Step 1 — registers the order with Zibal and returns the session's `trackId`.
 * Throws ZibalError with a Persian message for any non-100 result.
 */
export async function requestPayment(params: ZibalRequestParams): Promise<ZibalRequestResult> {
  const data = await post<{ trackId?: number | string; result?: number; message?: string }>(
    '/v1/request',
    {
      amount: params.amountRial,
      callbackUrl: callbackUrl(),
      description: params.description,
      orderId: params.orderId,
      ...(params.mobile ? { mobile: params.mobile } : {}),
    }
  );

  if (data.result !== 100 || !data.trackId) {
    throw new ZibalError(resultMessage(data.result), data.result);
  }
  return { trackId: String(data.trackId), result: data.result, message: data.message };
}

/**
 * Step 3 — confirms a paid session and settles it. Result 201 ("already
 * verified") is *not* an error for us: it means a duplicate verify, which the
 * caller treats as success. The raw result is returned rather than thrown so
 * the caller can make that distinction.
 */
export async function verifyPayment(trackId: string): Promise<ZibalVerifyResult> {
  return post<ZibalVerifyResult>('/v1/verify', { trackId: Number(trackId) });
}

/** Step 4 — reads a session's current state without changing it. */
export async function inquiryPayment(trackId: string): Promise<ZibalInquiryResult> {
  return post<ZibalInquiryResult>('/v1/inquiry', { trackId: Number(trackId) });
}

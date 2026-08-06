// SMS delivery through sms.ir's RESTful "verify" (template) endpoint.
//
// Credentials come from the environment — never hardcode them, since this file
// is committed:
//   SMSIR_API_KEY      the private key from the sms.ir developer panel
//   SMSIR_TEMPLATE_ID  the verification template's code
//   SMSIR_CODE_PARAM   the parameter name *inside that template* (default CODE)
//
// With no API key configured the sender falls back to logging the code, so a
// local backend still works without spending credit or reaching the network.

const SMS_VERIFY_URL = 'https://api.sms.ir/v1/send/verify';
const REQUEST_TIMEOUT_MS = 10_000;

export class SmsError extends Error {}

/** True when real sending is configured; false means dev/log mode. */
export function smsConfigured(): boolean {
  return Boolean(process.env.SMSIR_API_KEY && process.env.SMSIR_TEMPLATE_ID);
}

/**
 * Sends `code` to `phone` using the configured verification template.
 * Throws SmsError when the provider rejects the request, so the caller can
 * tell the user the SMS did not go out instead of silently swallowing it.
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const apiKey = process.env.SMSIR_API_KEY;
  const templateId = Number(process.env.SMSIR_TEMPLATE_ID);
  const paramName = process.env.SMSIR_CODE_PARAM || 'CODE';

  if (!apiKey || !Number.isFinite(templateId)) {
    console.log(`[SMS] not configured — OTP for ${phone} is ${code}`);
    return;
  }

  let response: Response;
  let body: any;

  try {
    response = await fetch(SMS_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ACCEPT: 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        mobile: phone,
        templateId,
        parameters: [{ name: paramName, value: code }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await response.json().catch(() => null);
  } catch (error: any) {
    // Network failure or timeout — the provider never answered.
    console.error('[SMS] request failed:', error?.message || error);
    throw new SmsError('ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
  }

  // sms.ir answers 200 + status 1 on success; anything else is a real failure.
  if (!response.ok || body?.status !== 1) {
    console.error(
      `[SMS] provider rejected send to ${phone}: HTTP ${response.status}`,
      body?.message ?? body
    );
    throw new SmsError('ارسال پیامک انجام نشد. لطفاً دوباره تلاش کنید.');
  }
}

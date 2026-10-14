// Phones allowed into the admin dashboard. Checked at login and again on every
// admin request, so removing a phone from ADMIN_PHONES revokes its live tokens
// instead of leaving them valid for their remaining 7 days.
export function isAllowedAdmin(phone: unknown): boolean {
  if (typeof phone !== 'string') return false;
  const envPhones = process.env.ADMIN_PHONES || '09136441844,09135709925';
  const allowedList = envPhones.split(',').map((p) => p.trim()).filter(Boolean);
  return allowedList.includes(phone);
}

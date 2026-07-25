# Android Auth Integration — Phone + OTP Login

You are implementing phone-number authentication in an **Android app** (this is a
separate project from the backend). The backend is already built and running; your
job is only the Android client side. Follow this spec exactly — the backend
contract below is fixed and already tested.

## Goal / UX flow

1. **Phone screen** — user enters an Iranian mobile number in the format
   `09*********` (starts with `09`, exactly 11 digits). Validate this locally
   before calling the API.
2. **OTP screen** — user enters a **5-digit** code. For now the code is always
   `11111` (SMS is not wired up yet).
3. After OTP is verified:
   - If the phone is **already registered** → the user is logged in immediately.
   - If the phone is **new** → show a **name screen** (first name + last name),
     then finish registration and log in.
4. Persist the returned access token and keep the user logged in across app
   restarts. On launch, if a token exists, treat the user as logged in (optionally
   validate via `GET /api/user/me`).

## Backend API contract

- **Base URL:** configurable build field, e.g. `BASE_URL` (dev example:
  `http://10.0.2.2:5001` from the Android emulator, which maps to the host's
  `localhost:5001`). All endpoints below are under `${BASE_URL}/api/user`.
- **Content type:** `application/json` for all requests.
- **Auth:** protected endpoints require header `Authorization: Bearer <token>`.
- Error responses always have shape `{ "error": "<Persian message>" }`. Show the
  `error` string to the user on non-2xx responses.

### 1. Send OTP
`POST /api/user/send-otp`

Request:
```json
{ "phone": "09123456789" }
```
Success `200`:
```json
{ "message": "کد تایید ۵ رقمی به شماره شما ارسال شد.", "phone": "09123456789" }
```
Errors: `400` if the phone format is invalid.

### 2. Verify OTP
`POST /api/user/verify-otp`

Request:
```json
{ "phone": "09123456789", "otp": "11111" }
```

**Existing user — success `200` (logged in):**
```json
{
  "message": "ورود با موفقیت انجام شد.",
  "isNewUser": false,
  "token": "<JWT access token>",
  "user": { "id": 1, "phone": "09123456789", "firstName": "علی", "lastName": "رضایی" }
}
```

**New user — success `200` (registration required):**
```json
{
  "message": "شماره تایید شد. لطفا نام و نام خانوادگی خود را وارد کنید.",
  "isNewUser": true,
  "registrationToken": "<short-lived JWT, valid 15 minutes>"
}
```

Errors: `400` invalid phone, `401` wrong OTP.

> **Branch on `isNewUser`.** If `false`, save `token` + `user` and go to the app's
> home screen. If `true`, keep `registrationToken` in memory and navigate to the
> name screen.

### 3. Complete profile (new users only)
`POST /api/user/complete-profile`

Request:
```json
{ "registrationToken": "<from step 2>", "firstName": "علی", "lastName": "رضایی" }
```
Success `201` (registered + logged in):
```json
{
  "message": "ثبت‌نام و ورود با موفقیت انجام شد.",
  "token": "<JWT access token>",
  "user": { "id": 1, "phone": "09123456789", "firstName": "علی", "lastName": "رضایی" }
}
```
Errors: `400` missing first/last name, `401` invalid or expired registration token
(in that case, send the user back to the phone screen to restart).

### 4. Current user (optional, for session validation)
`GET /api/user/me` — header `Authorization: Bearer <token>`

Success `200`:
```json
{ "user": { "id": 1, "phone": "09123456789", "firstName": "علی", "lastName": "رضایی" } }
```
Errors: `401` if the token is missing/invalid/expired → log the user out and return
to the phone screen.

## Client requirements

- **Local phone validation:** regex `^09\d{9}$`. Trim whitespace before sending.
  Also accept the user pasting a number; strip spaces/dashes first.
- **OTP input:** 5 digits, numeric keyboard. Auto-submit when 5 digits are entered
  (optional). Show a "resend code" affordance that re-calls `send-otp`.
- **Token storage:** store the access token securely (EncryptedSharedPreferences or
  DataStore). The access token is a JWT valid for **7 days**. Do **not** store the
  `registrationToken` persistently — it is only for the in-flow name step.
- **Auto-login:** on app start, if an access token exists, go to home (optionally
  confirm with `GET /api/user/me`; on `401`, clear the token and show the phone
  screen).
- **Attach the token** to every authenticated request via an OkHttp interceptor
  (or equivalent): `Authorization: Bearer <token>`.
- **Logout:** clear the stored token and navigate back to the phone screen.
- **Error handling:** on any non-2xx response, display the `error` field from the
  JSON body. Handle network failures with a retry option.

## Suggested implementation (adjust to the project's stack)

- **Networking:** Retrofit + OkHttp + Kotlin coroutines (`suspend` functions).
- **Models:** data classes matching the JSON above (`SendOtpRequest`,
  `VerifyOtpRequest`/`VerifyOtpResponse` with nullable `token`/`user`/
  `registrationToken`, `CompleteProfileRequest`, `AuthResponse`, `User`).
- **Architecture:** an `AuthRepository` wrapping the Retrofit service + token
  storage, an `AuthViewModel` per screen, and Compose (or XML) screens: Phone →
  OTP → Name.
- **Navigation:** Phone → OTP. After OTP: if `isNewUser` → Name → Home; else →
  Home directly.

### Example Retrofit interface (Kotlin)
```kotlin
interface AuthApi {
    @POST("api/user/send-otp")
    suspend fun sendOtp(@Body body: SendOtpRequest): Response<SendOtpResponse>

    @POST("api/user/verify-otp")
    suspend fun verifyOtp(@Body body: VerifyOtpRequest): Response<VerifyOtpResponse>

    @POST("api/user/complete-profile")
    suspend fun completeProfile(@Body body: CompleteProfileRequest): Response<AuthResponse>

    @GET("api/user/me")
    suspend fun me(): Response<MeResponse>
}
```

## Notes

- The OTP is hardcoded to `11111` for now; do not build any SMS logic on the
  client. The backend will later swap in a real SMS provider without changing this
  contract.
- All user-facing messages from the backend are already in Persian; prefer showing
  the `message`/`error` strings directly.
- Cleartext HTTP (`http://10.0.2.2:5001`) is only for local development — add a
  `network_security_config` exception for it in debug builds, and use HTTPS in
  production.

# Android Task: Reading Progress Integration

Implement per-user reading progress against the MagicBook backend. The backend
tracks, for each logged-in user, **how far they've read in each chapter** (a page
count → a percentage) and **which chapters they've completed**, with book-level
rollups.

## Context

- **Base URL:** `https://api.magic-book.ir`
- **Auth:** All progress endpoints require the user access token (the same
  `Bearer` token returned by `/api/user/verify-otp` or `/api/user/complete-profile`,
  role `USER`). Send it as `Authorization: Bearer <token>`. See
  `ANDROID_AUTH_INTEGRATION.md` for how the token is obtained/stored.
- **Content type:** `application/json`.
- **Data model:** A Book has ordered Chapters; each Chapter has ordered Pages
  (`page_number` starts at 1). Progress is tracked **per chapter**.
- **Errors:** Non-2xx responses return `{ "error": "<Persian message>" }`.
  Status codes: `400` invalid input, `401` missing/expired token, `404` not found,
  `500` server error. On `401`, trigger the re-login flow.

## Endpoints

### 1. Report progress — `PUT /api/user/progress/chapters/{chapterId}`

Call this as the user reads. `lastPage` is the page number they're currently on
(or the furthest they've reached). The server only ever moves progress **forward**
and auto-marks the chapter complete when `lastPage` reaches the last page.

Request body:
```json
{ "lastPage": 12, "completed": false }
```
- `lastPage` (number, required): non-negative page number reached.
- `completed` (boolean, optional): force-mark complete (e.g. a "Mark as finished"
  button). Omit to let the server decide based on `lastPage`.

Response `200`:
```json
{
  "chapterId": 5,
  "totalPages": 12,
  "lastPage": 12,
  "percent": 100,
  "completed": true,
  "completedAt": "2026-07-25T13:40:00.000Z",
  "updatedAt": "2026-07-25T13:40:00.000Z"
}
```

**When to call:** on page turn (debounce/throttle, e.g. every few seconds or on
chapter exit — don't fire on every scroll frame), and on a manual "mark finished"
tap with `completed: true`.

### 2. Get one chapter's progress — `GET /api/user/progress/chapters/{chapterId}`

Same response shape as above. If the user has never opened the chapter, returns
`lastPage: 0`, `percent: 0`, `completed: false`, `completedAt: null`,
`updatedAt: null`. Use to restore the reader to where they left off.

### 3. Get a book's progress — `GET /api/user/progress/books/{bookId}`

Per-chapter progress plus a book summary. Use this on the book detail / table of
contents screen.

Response `200`:
```json
{
  "bookId": 3,
  "totalChapters": 8,
  "completedChapters": 3,
  "percentComplete": 38,
  "bookCompleted": false,
  "chapters": [
    {
      "chapterId": 5,
      "totalPages": 12,
      "lastPage": 12,
      "percent": 100,
      "completed": true,
      "completedAt": "2026-07-25T13:40:00.000Z",
      "updatedAt": "2026-07-25T13:40:00.000Z",
      "title": "فصل اول",
      "chapterOrder": 1
    }
  ]
}
```

### 4. Reading overview — `GET /api/user/progress`

Every book the user has started, with completion counts. Use for a "Continue
reading" / library progress screen.

Response `200`:
```json
{
  "books": [
    {
      "bookId": 3,
      "title": "...",
      "author": "...",
      "totalChapters": 8,
      "completedChapters": 3,
      "startedChapters": 5,
      "percentComplete": 38,
      "bookCompleted": false
    }
  ]
}
```

## Implementation requirements

1. Add a Retrofit/Ktor service with the four calls above; models mirror the JSON
   fields exactly (`chapterId`, `lastPage`, `percent`, `completed`,
   `completedAt`, `totalPages`, `chapterOrder`, etc.). Timestamps are ISO-8601
   UTC strings (nullable).
2. Attach the auth token via the existing auth interceptor; on `401` route to
   re-login.
3. **Reader screen:** on open, call endpoint (2) to resume at `lastPage`; while
   reading, throttle calls to endpoint (1) with the current page number; expose
   a "Mark as finished" action that sends `completed: true`.
4. **Book / TOC screen:** call endpoint (3); render a per-chapter percent bar and
   a check for `completed`, plus the book `percentComplete`.
5. **Library / home:** call endpoint (4) for a "Continue reading" section and
   overall book progress.
6. Treat a missing progress row as 0% (endpoint 2 already returns zeros — no
   special-casing needed).
7. Show percentages from the server's `percent` / `percentComplete` fields
   directly; do not recompute client-side.

## Notes

- `percent` = furthest page reached ÷ total pages; a completed chapter always
  reports `100`.
- Progress never regresses: sending a smaller `lastPage` than previously recorded
  will not lower the stored value.
- Endpoints (3) and (4) are read-only aggregations; safe to call on screen load.

# Android Task: Streaks, XP & Quizzes Integration

Implement the gamification and quiz features against the MagicBook backend. The
backend now tracks, for each logged-in user, a **daily streak**, **total XP**, a
**"continue where you left off"** pointer, and **quiz answers & scores** per
chapter. This builds directly on the existing reading-progress integration.

## Context

- **Base URL:** `https://magicapi.gerdoo.app`
- **Auth:** All user endpoints require the user access token (the same `Bearer`
  token returned by `/api/user/verify-otp` or `/api/user/complete-profile`, role
  `USER`). Send it as `Authorization: Bearer <token>`. See
  `ANDROID_AUTH_INTEGRATION.md` for how the token is obtained/stored.
- **Content type:** `application/json`.
- **Data model:** A Book has ordered Chapters (a Chapter = one "lesson"); each
  Chapter has ordered Pages (`page_number` starts at 1) and optionally **one
  quiz**. Progress, XP and streaks are per user.
- **Timezone:** Streaks and the activity calendar are computed on the server in
  **Iran time (UTC+3:30)**. A "day" is a Tehran calendar day; you don't need to
  compute anything client-side.
- **Errors:** Non-2xx responses return `{ "error": "<Persian message>" }`.
  Status codes: `400` invalid input, `401` missing/expired token, `404` not
  found, `500` server error. On `401`, trigger the re-login flow. The Persian
  `error` string is safe to show directly to the user.

---

## Part A — XP & Streaks

### A note on how XP is earned

The client does **not** send XP. The server awards it automatically:

- **Finishing a chapter** (first time): **+50 XP**.
- **Quiz:** **+10 XP per correct answer**, plus a **+25 XP** bonus if the quiz is
  passed.

Any reading-progress or quiz activity also **keeps the daily streak alive** for
that day. So you don't call a separate "record activity" endpoint — it happens as
a side effect of the calls below.

### A.1 — Progress reporting now returns stats

The existing endpoint `PUT /api/user/progress/chapters/{chapterId}` is unchanged
in how you call it, but its **response now includes** `xpAwarded` and `stats`.
Use these to fire a "+50 XP" / streak animation the moment a chapter is completed.

Response `200` (new fields shown):
```json
{
  "chapterId": 5,
  "totalPages": 12,
  "lastPage": 12,
  "percent": 100,
  "completed": true,
  "completedAt": "2026-07-27T13:40:00.000Z",
  "updatedAt": "2026-07-27T13:40:00.000Z",
  "xpAwarded": 50,
  "stats": {
    "totalXp": 350,
    "currentStreak": 4,
    "longestStreak": 9,
    "lastActivityDate": "2026-07-27T20:30:00.000Z"
  }
}
```
- `xpAwarded` (number): XP granted by **this** call (`0` if the chapter was
  already complete or not yet finished). Only animate when `> 0`.
- `stats`: the user's up-to-date totals after this call.

### A.2 — Get stats + activity calendar — `GET /api/user/progress/stats`

Use this to render the profile/home header (XP, current streak, longest streak)
and an activity heatmap.

Response `200`:
```json
{
  "totalXp": 350,
  "currentStreak": 4,
  "longestStreak": 9,
  "lastActivityDate": "2026-07-27T20:30:00.000Z",
  "activity": [
    { "date": "2026-07-24", "xpEarned": 50 },
    { "date": "2026-07-25", "xpEarned": 110 },
    { "date": "2026-07-27", "xpEarned": 60 }
  ]
}
```
- `currentStreak` is already the **live** value: if the user missed a day it
  reads `0` (the server handles the lapse — don't recompute it yourself).
- `activity` covers roughly the last **12 weeks**, one entry per active day, in
  ascending date order (`YYYY-MM-DD`, Tehran day). Days with no activity are
  omitted — treat missing dates as zero.

### A.3 — Continue where you left off — `GET /api/user/progress/continue`

Use this for a "Continue" / "Resume reading" card on the home screen. Returns the
most recently updated **incomplete** chapter with everything needed to deep-link
straight into the reader at the right page.

Response `200` (has progress):
```json
{
  "hasProgress": true,
  "book": { "id": 3, "title": "Dune", "author": "Frank Herbert", "coverImageUrl": "https://..." },
  "chapter": { "id": 5, "title": "The Desert Planet", "chapterOrder": 2 },
  "resumePage": 8,
  "chapterId": 5,
  "totalPages": 12,
  "lastPage": 7,
  "percent": 58,
  "completed": false,
  "completedAt": null,
  "updatedAt": "2026-07-27T20:30:00.000Z"
}
```
- `resumePage` is the page to open (furthest read + 1, clamped to the last page).
- When there's nothing to resume: `{ "hasProgress": false }` — hide the card.

---

## Part B — Quizzes

A chapter may have **at most one quiz**. Flow: fetch the quiz → user answers →
submit for grading → show results and XP. Multiple attempts are allowed.

### B.1 — Get a chapter's quiz — `GET /api/quiz/chapters/{chapterId}`

Returns the quiz **without** correct answers (safe for the client). Also returns
the user's best prior attempt for a "best score" badge.

Response `200` (quiz exists):
```json
{
  "hasQuiz": true,
  "quiz": {
    "id": 12,
    "chapterId": 5,
    "title": "Chapter 2 Quiz",
    "passRatio": 0.6,
    "questions": [
      { "id": 101, "prompt": "Who is the main character?", "options": ["Paul", "Leto", "Jessica"], "order": 0 },
      { "id": 102, "prompt": "What is the desert planet called?", "options": ["Caladan", "Arrakis", "Giedi Prime"], "order": 1 }
    ]
  },
  "bestAttempt": { "score": 2, "total": 2, "passed": true, "completedAt": "2026-07-26T10:00:00.000Z" }
}
```
- `options` is an ordered array; the answer a user picks is the **index** into
  this array (0-based).
- `passRatio` is the fraction of correct answers needed to pass (e.g. `0.6`).
- `bestAttempt` is `null` if the user has never attempted this quiz.
- When the chapter has no quiz: `{ "hasQuiz": false }`.

### B.2 — Submit answers — `POST /api/quiz/chapters/{chapterId}/attempts`

Grades the submission, stores it, awards XP, and returns the correct answer for
every question so you can highlight right/wrong choices.

Request body:
```json
{
  "answers": [
    { "questionId": 101, "selectedIndex": 0 },
    { "questionId": 102, "selectedIndex": 1 }
  ]
}
```
- Send one entry per question. Unanswered questions may be omitted (they count as
  wrong). `selectedIndex` is the 0-based index into that question's `options`.

Response `201`:
```json
{
  "attemptId": 55,
  "score": 2,
  "total": 2,
  "passed": true,
  "passRatio": 0.6,
  "xpAwarded": 45,
  "stats": { "totalXp": 395, "currentStreak": 4, "longestStreak": 9, "lastActivityDate": "2026-07-27T20:30:00.000Z" },
  "results": [
    { "questionId": 101, "selectedIndex": 0, "correctIndex": 0, "isCorrect": true },
    { "questionId": 102, "selectedIndex": 1, "correctIndex": 1, "isCorrect": true }
  ]
}
```
- `score` / `total` → show "2 / 2".
- `xpAwarded` = correct×10 + (passed ? 25 : 0). Use `stats` to refresh the XP/
  streak UI (same shape as `/progress/stats`).
- `results` gives the correct index per question for the review screen.
- `404` `{ "error": "آزمونی برای این فصل یافت نشد." }` if the chapter has no quiz.

### B.3 — Attempt history — `GET /api/quiz/chapters/{chapterId}/attempts`

The user's past attempts for this chapter's quiz, most recent first.

Response `200`:
```json
{
  "attempts": [
    { "attemptId": 55, "score": 2, "total": 2, "passed": true, "xpAwarded": 45, "completedAt": "2026-07-27T20:30:00.000Z" },
    { "attemptId": 40, "score": 1, "total": 2, "passed": false, "xpAwarded": 10, "completedAt": "2026-07-26T09:00:00.000Z" }
  ]
}
```
Empty array `{ "attempts": [] }` if none (or the chapter has no quiz).

---

## Suggested client models (Kotlin)

```kotlin
data class UserStats(
    val totalXp: Int,
    val currentStreak: Int,
    val longestStreak: Int,
    val lastActivityDate: String?
)

data class DayActivity(val date: String, val xpEarned: Int)

data class StatsResponse(
    val totalXp: Int,
    val currentStreak: Int,
    val longestStreak: Int,
    val lastActivityDate: String?,
    val activity: List<DayActivity>
)

data class ContinueResponse(
    val hasProgress: Boolean,
    val book: BookRef?,
    val chapter: ChapterRef?,
    val resumePage: Int?,
    val percent: Int?
)

data class QuizQuestion(val id: Int, val prompt: String, val options: List<String>, val order: Int)
data class Quiz(val id: Int, val chapterId: Int, val title: String?, val passRatio: Double, val questions: List<QuizQuestion>)
data class QuizResponse(val hasQuiz: Boolean, val quiz: Quiz?, val bestAttempt: BestAttempt?)

data class SubmittedAnswer(val questionId: Int, val selectedIndex: Int)
data class AttemptRequest(val answers: List<SubmittedAnswer>)
data class QuestionResult(val questionId: Int, val selectedIndex: Int, val correctIndex: Int, val isCorrect: Boolean)
data class AttemptResponse(
    val attemptId: Int,
    val score: Int,
    val total: Int,
    val passed: Boolean,
    val passRatio: Double,
    val xpAwarded: Int,
    val stats: UserStats,
    val results: List<QuestionResult>
)
```

## Acceptance criteria

- [ ] Home/profile shows total XP, current streak (0 when lapsed), and longest streak from `GET /api/user/progress/stats`.
- [ ] An activity heatmap/calendar renders from the `activity` array (missing days = 0).
- [ ] A "Continue" card deep-links to `book`/`chapter` at `resumePage`; hidden when `hasProgress` is false.
- [ ] Completing a chapter shows a "+50 XP" / streak animation using `xpAwarded` + `stats` from the progress PUT response (only when `xpAwarded > 0`).
- [ ] Chapters with a quiz show a quiz entry point; the quiz screen renders questions/options from `GET /api/quiz/chapters/{id}`.
- [ ] Submitting answers shows score, pass/fail, XP earned, and per-question correct/incorrect review from the attempt response.
- [ ] All calls send `Authorization: Bearer <token>`; a `401` triggers re-login.
- [ ] Backend Persian `error` messages are surfaced to the user on failures.
```

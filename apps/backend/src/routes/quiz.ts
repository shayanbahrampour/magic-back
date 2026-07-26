import { Router } from 'express';
import prisma from '../db';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';
import { requireAuth } from '../middleware/auth';
import { recordActivity, XP } from '../services/gamification';

const router = Router();

// Safely parse a QuizQuestion.options JSON blob into a string array.
function parseOptions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((o) => String(o)) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// USER ENDPOINTS (app) — taking quizzes and recording answers/scores.
// ---------------------------------------------------------------------------

// GET /api/user/quiz/chapters/:chapterId
// Fetch the quiz for a chapter, WITHOUT the correct answers (so it's safe to
// send to the client for taking). Returns { hasQuiz: false } if none exists.
router.get('/chapters/:chapterId', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  try {
    const quiz = await prisma.quiz.findUnique({
      where: { chapter_id: chapterId },
      include: { questions: { orderBy: { question_order: 'asc' } } },
    });

    if (!quiz) {
      return res.json({ hasQuiz: false });
    }

    // The user's best previous attempt, for showing "best score" in the UI.
    const best = await prisma.quizAttempt.findFirst({
      where: { user_id: userId, quiz_id: quiz.id },
      orderBy: [{ score: 'desc' }, { completed_at: 'desc' }],
    });

    res.json({
      hasQuiz: true,
      quiz: {
        id: quiz.id,
        chapterId: quiz.chapter_id,
        title: quiz.title,
        passRatio: quiz.pass_ratio,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: parseOptions(q.options),
          order: q.question_order,
        })),
      },
      bestAttempt: best
        ? { score: best.score, total: best.total, passed: best.passed, completedAt: best.completed_at }
        : null,
    });
  } catch (error) {
    console.error('[QUIZ] get quiz error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// POST /api/user/quiz/chapters/:chapterId/attempts
// Body: { answers: [{ questionId: number, selectedIndex: number }, ...] }
// Grades the submission, stores the attempt + per-question answers, awards XP,
// and returns the score plus the correct answer for each question.
router.post('/chapters/:chapterId/attempts', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  const rawAnswers = req.body?.answers;
  if (!Array.isArray(rawAnswers)) {
    return res.status(400).json({ error: 'پاسخ‌ها باید به صورت یک آرایه ارسال شوند.' });
  }

  try {
    const quiz = await prisma.quiz.findUnique({
      where: { chapter_id: chapterId },
      include: { questions: true },
    });
    if (!quiz || quiz.questions.length === 0) {
      return res.status(404).json({ error: 'آزمونی برای این فصل یافت نشد.' });
    }

    // Index the submitted answers by question id (last one wins on duplicates).
    const submitted = new Map<number, number>();
    for (const a of rawAnswers) {
      const qId = Number(a?.questionId);
      const sel = Number(a?.selectedIndex);
      if (Number.isInteger(qId) && Number.isInteger(sel)) {
        submitted.set(qId, sel);
      }
    }

    // Grade against every question in the quiz. Missing/unanswered questions
    // count as wrong (selected_index -1).
    const gradedAnswers = quiz.questions.map((q) => {
      const selectedIndex = submitted.has(q.id) ? (submitted.get(q.id) as number) : -1;
      const isCorrect = selectedIndex === q.correct_index;
      return { questionId: q.id, selectedIndex, isCorrect, correctIndex: q.correct_index };
    });

    const total = quiz.questions.length;
    const score = gradedAnswers.filter((a) => a.isCorrect).length;
    const passed = score / total >= quiz.pass_ratio;
    const xpAwarded = score * XP.QUIZ_PER_CORRECT + (passed ? XP.QUIZ_PASS_BONUS : 0);

    // Persist the attempt and its answers atomically.
    const attempt = await prisma.quizAttempt.create({
      data: {
        user_id: userId,
        quiz_id: quiz.id,
        score,
        total,
        passed,
        xp_awarded: xpAwarded,
        answers: {
          create: gradedAnswers.map((a) => ({
            question_id: a.questionId,
            selected_index: a.selectedIndex,
            is_correct: a.isCorrect,
          })),
        },
      },
    });

    const stats = await recordActivity(userId, xpAwarded);

    res.status(201).json({
      attemptId: attempt.id,
      score,
      total,
      passed,
      passRatio: quiz.pass_ratio,
      xpAwarded,
      stats,
      // Per-question breakdown so the client can highlight right/wrong answers.
      results: gradedAnswers.map((a) => ({
        questionId: a.questionId,
        selectedIndex: a.selectedIndex,
        correctIndex: a.correctIndex,
        isCorrect: a.isCorrect,
      })),
    });
  } catch (error) {
    console.error('[QUIZ] submit attempt error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/quiz/chapters/:chapterId/attempts
// The current user's attempt history for a chapter's quiz (most recent first).
router.get('/chapters/:chapterId/attempts', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  try {
    const quiz = await prisma.quiz.findUnique({ where: { chapter_id: chapterId } });
    if (!quiz) {
      return res.json({ attempts: [] });
    }

    const attempts = await prisma.quizAttempt.findMany({
      where: { user_id: userId, quiz_id: quiz.id },
      orderBy: { completed_at: 'desc' },
    });

    res.json({
      attempts: attempts.map((a) => ({
        attemptId: a.id,
        score: a.score,
        total: a.total,
        passed: a.passed,
        xpAwarded: a.xp_awarded,
        completedAt: a.completed_at,
      })),
    });
  } catch (error) {
    console.error('[QUIZ] attempts history error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ---------------------------------------------------------------------------
// ADMIN ENDPOINTS (CMS) — authoring a chapter's quiz.
// ---------------------------------------------------------------------------

// PUT /api/quiz/admin/chapters/:chapterId
// Create or replace the quiz for a chapter.
// Body: { title?: string, passRatio?: number,
//         questions: [{ prompt: string, options: string[], correctIndex: number }] }
router.put('/admin/chapters/:chapterId', requireAuth, async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  const { title, passRatio, questions } = req.body ?? {};
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'آزمون باید حداقل یک سوال داشته باشد.' });
  }

  // Validate every question up front so we never write a partial quiz.
  const normalized: { prompt: string; options: string[]; correctIndex: number }[] = [];
  for (const [i, q] of questions.entries()) {
    const prompt = typeof q?.prompt === 'string' ? q.prompt.trim() : '';
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o)) : [];
    const correctIndex = Number(q?.correctIndex);
    if (!prompt) {
      return res.status(400).json({ error: `متن سوال ${i + 1} الزامی است.` });
    }
    if (options.length < 2) {
      return res.status(400).json({ error: `سوال ${i + 1} باید حداقل دو گزینه داشته باشد.` });
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return res.status(400).json({ error: `گزینه صحیح سوال ${i + 1} نامعتبر است.` });
    }
    normalized.push({ prompt, options, correctIndex });
  }

  const ratio =
    typeof passRatio === 'number' && passRatio > 0 && passRatio <= 1 ? passRatio : undefined;

  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({ error: 'فصل یافت نشد.' });
    }

    // Replace any existing quiz for this chapter (questions cascade-delete).
    await prisma.quiz.deleteMany({ where: { chapter_id: chapterId } });

    const quiz = await prisma.quiz.create({
      data: {
        chapter_id: chapterId,
        title: typeof title === 'string' && title.trim() ? title.trim() : null,
        ...(ratio !== undefined ? { pass_ratio: ratio } : {}),
        questions: {
          create: normalized.map((q, idx) => ({
            prompt: q.prompt,
            options: JSON.stringify(q.options),
            correct_index: q.correctIndex,
            question_order: idx,
          })),
        },
      },
      include: { questions: { orderBy: { question_order: 'asc' } } },
    });

    res.status(201).json({
      id: quiz.id,
      chapterId: quiz.chapter_id,
      title: quiz.title,
      passRatio: quiz.pass_ratio,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: parseOptions(q.options),
        correctIndex: q.correct_index,
        order: q.question_order,
      })),
    });
  } catch (error) {
    console.error('[QUIZ] admin upsert error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;

import prisma from '../db';
import { tehranDayIndex, tehranDayStart } from '../utils/datetime';

// XP awarded for various in-app achievements. Tune freely — these are the single
// source of truth used by every route that grants XP.
export const XP = {
  CHAPTER_COMPLETE: 50, // finishing a chapter (lesson)
  QUIZ_PER_CORRECT: 10, // per correct quiz answer
  QUIZ_PASS_BONUS: 25, // extra XP when the quiz is passed
};

export type UserStatsShape = {
  /** Lifetime XP earned. Never decreases — spending does not rewrite history. */
  totalXp: number;
  /** XP already redeemed (e.g. books bought with points). */
  spentXp: number;
  /** What the user can actually spend right now: totalXp - spentXp. */
  availableXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
};

// Computes the streak the user should *see* right now. The stored streak keeps
// its value from the last active day; if that day is neither today nor yesterday
// (in Tehran time) the streak has lapsed and reads as 0 until the next activity.
export function liveStreak(
  currentStreak: number,
  lastActivityDate: Date | null,
  now: Date = new Date()
): number {
  if (!lastActivityDate) return 0;
  const diff = tehranDayIndex(now) - tehranDayIndex(lastActivityDate);
  if (diff <= 0) return currentStreak; // active today
  if (diff === 1) return currentStreak; // active yesterday, still alive if they act today
  return 0; // lapsed
}

function shapeStats(stats: {
  total_xp: number;
  spent_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: Date | null;
}): UserStatsShape {
  return {
    totalXp: stats.total_xp,
    spentXp: stats.spent_xp,
    availableXp: Math.max(0, stats.total_xp - stats.spent_xp),
    currentStreak: liveStreak(stats.current_streak, stats.last_activity_date),
    longestStreak: stats.longest_streak,
    lastActivityDate: stats.last_activity_date,
  };
}

// Records a unit of user activity: logs XP against today's DailyActivity row and
// advances (or resets) the streak. Call this whenever the user does something
// worth crediting — reading progress, completing a chapter, passing a quiz.
// `xpToAward` may be 0 to keep a streak alive without granting points.
export async function recordActivity(userId: number, xpToAward = 0): Promise<UserStatsShape> {
  const now = new Date();
  const todayStart = tehranDayStart(now);
  const todayIndex = tehranDayIndex(now);
  const xp = Math.max(0, Math.floor(xpToAward));

  // 1) Log the day's activity (idempotent per Tehran day; XP accumulates).
  await prisma.dailyActivity.upsert({
    where: { user_id_date: { user_id: userId, date: todayStart } },
    create: { user_id: userId, date: todayStart, xp_earned: xp },
    update: { xp_earned: { increment: xp } },
  });

  // 2) Recompute the streak relative to the previously recorded activity day.
  const existing = await prisma.userStats.findUnique({ where: { user_id: userId } });

  let currentStreak: number;
  if (!existing?.last_activity_date) {
    currentStreak = 1;
  } else {
    const lastIndex = tehranDayIndex(existing.last_activity_date);
    if (lastIndex === todayIndex) {
      currentStreak = existing.current_streak; // already counted today
    } else if (lastIndex === todayIndex - 1) {
      currentStreak = existing.current_streak + 1; // consecutive day
    } else {
      currentStreak = 1; // gap -> start over
    }
  }
  const longestStreak = Math.max(existing?.longest_streak ?? 0, currentStreak);

  const saved = await prisma.userStats.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      total_xp: xp,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_activity_date: todayStart,
    },
    update: {
      total_xp: { increment: xp },
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_activity_date: todayStart,
    },
  });

  return shapeStats(saved);
}

// Reads the user's current stats without recording new activity. Returns zeroed
// stats for a user who has never been active.
export async function getStats(userId: number): Promise<UserStatsShape> {
  const stats = await prisma.userStats.findUnique({ where: { user_id: userId } });
  if (!stats) {
    return {
      totalXp: 0,
      spentXp: 0,
      availableXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    };
  }
  return shapeStats(stats);
}

/**
 * Charges `amount` XP to the user's spendable balance.
 *
 * Returns false — changing nothing — when the balance is short, or when a
 * concurrent spend moved it between the read and the write (the update is
 * conditioned on the `spent_xp` value we read, so two racing purchases cannot
 * both succeed off the same balance).
 */
export async function spendXp(userId: number, amount: number): Promise<boolean> {
  const cost = Math.max(0, Math.floor(amount));
  if (cost === 0) return true;

  const stats = await prisma.userStats.findUnique({ where: { user_id: userId } });
  if (!stats) return false;

  const available = stats.total_xp - stats.spent_xp;
  if (available < cost) return false;

  const { count } = await prisma.userStats.updateMany({
    where: { user_id: userId, spent_xp: stats.spent_xp },
    data: { spent_xp: stats.spent_xp + cost },
  });

  return count === 1;
}

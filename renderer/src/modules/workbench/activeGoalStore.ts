/**
 * Goal / Project v1：单活跃轻目标（仅 localStorage，无后端）。
 */

export const GOAL_PROJECT_LS_KEY = "aics.goal.v1";

export type ActiveGoalV1 = {
  id: string;
  title: string;
  targetCount: number;
  currentCount: number;
  createdAt: number;
  /** 来自用户原句中的量词：篇 / 个 / 条 */
  unit: string;
};

export type GoalProjectStoreV1 = {
  activeGoal: ActiveGoalV1 | null;
};

const emptyStore: GoalProjectStoreV1 = { activeGoal: null };

export function readGoalProjectStore(): GoalProjectStoreV1 {
  if (typeof localStorage === "undefined") return { ...emptyStore };
  try {
    const raw = localStorage.getItem(GOAL_PROJECT_LS_KEY);
    if (!raw?.trim()) return { ...emptyStore };
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return { ...emptyStore };
    const g = (o as GoalProjectStoreV1).activeGoal;
    if (g == null) return { activeGoal: null };
    if (typeof g !== "object") return { ...emptyStore };
    const id = typeof g.id === "string" ? g.id : "";
    const title = typeof g.title === "string" ? g.title : "";
    const targetCount = typeof g.targetCount === "number" ? g.targetCount : 0;
    const currentCount = typeof g.currentCount === "number" ? g.currentCount : 0;
    const createdAt = typeof g.createdAt === "number" ? g.createdAt : Date.now();
    const unit = typeof g.unit === "string" && g.unit.trim() ? g.unit.trim() : "篇";
    if (!id || !title || targetCount < 1) return { activeGoal: null };
    return {
      activeGoal: {
        id,
        title,
        targetCount: Math.min(999, Math.floor(targetCount)),
        currentCount: Math.max(0, Math.floor(currentCount)),
        createdAt,
        unit
      }
    };
  } catch {
    return { ...emptyStore };
  }
}

export function writeGoalProjectStore(store: GoalProjectStoreV1): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(GOAL_PROJECT_LS_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

/**
 * 识别「写/做/生成/创作 + 数字 + 篇|个|条」类批量目标句。
 */
export function parseGoalIntentFromUserLine(line: string): ActiveGoalV1 | null {
  const t = line.trim();
  if (t.length < 4) return null;
  const m = t.match(/(?:写|做|生成|创作)\s*(\d{1,3})\s*(篇|个|条)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 999) return null;
  const unit = m[2] || "篇";
  return {
    id: `goal-${Date.now()}`,
    title: t,
    targetCount: n,
    currentCount: 0,
    createdAt: Date.now(),
    unit
  };
}

export function persistNewActiveGoal(goal: ActiveGoalV1): void {
  writeGoalProjectStore({ activeGoal: goal });
}

/**
 * 一次内容任务成功后：+1；若达标则清空目标并返回庆祝文案。
 */
export function bumpActiveGoalOnContentTaskSuccess(): {
  celebration: string | null;
  goalAssetizationNote: string | null;
} {
  const { activeGoal } = readGoalProjectStore();
  if (!activeGoal) return { celebration: null, goalAssetizationNote: null };

  const nextCount = activeGoal.currentCount + 1;
  const title = activeGoal.title;

  if (nextCount >= activeGoal.targetCount) {
    const targetCount = activeGoal.targetCount;
    writeGoalProjectStore({ activeGoal: null });
    return {
      celebration: `🎉 你已完成目标：${title}`,
      goalAssetizationNote: `本次目标共完成 ${targetCount} 条内容，可用于后续复用或扩展`
    };
  }

  writeGoalProjectStore({
    activeGoal: {
      ...activeGoal,
      currentCount: nextCount
    }
  });
  return { celebration: null, goalAssetizationNote: null };
}

/** 供 Next Suggestion 前缀（须在 bump 之后调用，依赖已更新的 currentCount） */
export function getNextGoalSuggestionPrefix(): string | null {
  const { activeGoal } = readGoalProjectStore();
  if (!activeGoal) return null;
  const { currentCount, targetCount, unit } = activeGoal;
  if (currentCount >= targetCount) return null;
  const u = unit || "篇";
  return `继续第 ${currentCount + 1}/${targetCount}${u}：`;
}

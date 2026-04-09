/**
 * Core 返回的 Controller ↔ analyze/plan 对拍（审计；不替代执行状态机）。
 */

export type ControllerAlignmentCoreDerived = {
  bucket: string;
  reason: string;
};

export type ControllerAlignmentDiff = Record<string, unknown>;

export type ControllerAlignmentAnalyze = {
  aligned: boolean;
  diffs: ControllerAlignmentDiff[];
  coreDerived: ControllerAlignmentCoreDerived;
  note?: string;
};

export type ControllerAlignmentPlan = {
  aligned: boolean;
  diffs: ControllerAlignmentDiff[];
  corePlanStepCount: number;
  note?: string;
};

export type ControllerAlignmentBundle = {
  analyze?: ControllerAlignmentAnalyze;
  plan?: ControllerAlignmentPlan;
};

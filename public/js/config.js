export const EXPERIMENT_VERSION = "numeric-audit-cue-validity-1.8.0";
export const MATERIAL_SEED = "numeric-audit-material-v2-fixed-for-all-participants";
export const SET_SIZES = [3, 5, 7];
export const MATRIX_GAP_MM = 1.5;
export const TRIALS_PER_CELL = 20;
export const TARGET_COUNTS_PER_CELL = { 0: 10, 1: 6, 2: 4 };
export const PILOT_TRIALS_PER_BLOCK = 2;
export const UPLOAD_BATCH_SIZE = 5;

export const BASELINE_CONDITION = {
  key: "baseline",
  label: "无 AI 基线",
  ai_present: false,
  deep_validity: null,
  light_validity: null
};

export const AI_CONDITIONS = {
  "90_90": { key: "90_90", deep_validity: 0.9, light_validity: 0.9, label: "深红 90% / 浅红 90%" },
  "90_70": { key: "90_70", deep_validity: 0.9, light_validity: 0.7, label: "深红 90% / 浅红 70%" },
  "70_90": { key: "70_90", deep_validity: 0.7, light_validity: 0.9, label: "深红 70% / 浅红 90%" },
  "70_70": { key: "70_70", deep_validity: 0.7, light_validity: 0.7, label: "深红 70% / 浅红 70%" }
};

export const DEFAULT_ASSIGNMENT = {
  assignment_group: 0,
  assignment_cycle: 1,
  allocation_method: "default_preview",
  phase_order_index: 1,
  condition_order_index: 1,
  set_size_order_index: 1,
  phase_order: ["baseline", "ai"],
  condition_order: ["90_90", "90_70", "70_70", "70_90"],
  set_size_order: [3, 5, 7],
  cue_mapping: { deep: "deep_red", light: "light_red" }
};

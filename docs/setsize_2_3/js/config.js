export const EXPERIMENT_VERSION = "numeric-audit-cue-validity-1.10.48-setsize-2-3-40trial";
export const MATERIAL_SEED = "numeric-audit-material-v5-relation-pair-optimized-fixed-for-all-participants";
export const CUE_VISUAL_STYLE = "cell_background_tint_v4_manual_b93f4a_e6a0a8";
export const SET_SIZES = [2, 3];
export const MATRIX_GAP_MM = 1.5;
export const MATRIX_MAX_WIDTH_MM = 135;
export const MATRIX_VIEWPORT_WIDTH_RATIO = 0.86;
export const MATRIX_VIEWPORT_HEIGHT_RATIO = 0.64;
export const TRIALS_PER_CELL = 40;
export const TARGET_COUNTS_PER_CELL_BY_CONDITION = {
  baseline: { 0: 2, 1: 12, 2: 26 },
  "90_90": { 0: 2, 1: 4, 2: 34 },
  "90_70": { 0: 2, 1: 12, 2: 26 },
  "70_90": { 0: 2, 1: 12, 2: 26 },
  "70_70": { 0: 2, 1: 20, 2: 18 }
};
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
  condition_order: ["90_90"],
  set_size_order: [2, 3],
  cue_mapping: { deep: "deep_red", light: "light_red" }
};

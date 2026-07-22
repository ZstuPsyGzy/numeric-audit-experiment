import {
  AI_CONDITIONS,
  BASELINE_CONDITION,
  DEFAULT_ASSIGNMENT,
  MATERIAL_SEED,
  PILOT_TRIALS_PER_BLOCK,
  SET_SIZES,
  TARGET_COUNTS_PER_CELL,
  TRIALS_PER_CELL
} from "./config.js";
import { createRng, shuffle } from "./rng.js";

const AI_PROFILES = {
  "90_90": {
    target1: [
      ...repeat("both_valid_overlap", 4),
      ...repeat("deep_valid_only", 1),
      ...repeat("light_valid_only", 1)
    ],
    target0: [...repeat("correct_rejection", 8), "deep_false_alarm", "light_false_alarm"]
  },
  "90_70": {
    target1: [
      ...repeat("both_valid_overlap", 2),
      "deep_valid_light_invalid",
      ...repeat("deep_valid_only", 2),
      "light_valid_only"
    ],
    target0: [...repeat("correct_rejection", 8), "both_false_alarm", "light_false_alarm"]
  },
  "70_90": {
    target1: [
      ...repeat("both_valid_overlap", 2),
      "deep_invalid_light_valid",
      ...repeat("light_valid_only", 2),
      "deep_valid_only"
    ],
    target0: [...repeat("correct_rejection", 8), "both_false_alarm", "deep_false_alarm"]
  },
  "70_70": {
    target1: [
      "deep_valid_light_invalid",
      ...repeat("deep_valid_only", 2),
      "deep_invalid_light_valid",
      ...repeat("light_valid_only", 2)
    ],
    target0: [...repeat("correct_rejection", 8), ...repeat("both_false_alarm", 2)]
  }
};

function repeat(value, count) {
  return Array.from({ length: count }, () => value);
}

function matrixId(conditionKey, setSize, index) {
  return `matrix-${conditionKey}-s${setSize}-m${String(index + 1).padStart(2, "0")}`;
}

function longestRun(items, getter) {
  let longest = 0;
  let current = 0;
  let previous = Symbol("initial");
  for (const item of items) {
    const value = getter(item);
    current = value === previous ? current + 1 : 1;
    previous = value;
    longest = Math.max(longest, current);
  }
  return longest;
}

function constrainedShuffle(items, rng) {
  let best = [...items];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const candidate = shuffle(items, rng);
    const targetRun = longestRun(candidate, item => item.target_count === 0 ? "absent" : "present");
    const errorRun = longestRun(candidate, item => item.system_event === "false_alarm" ? "error" : "other");
    const score = Math.max(0, targetRun - 3) * 10 + Math.max(0, errorRun - 1) * 20;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (score === 0) return candidate;
  }
  return best;
}

function cueOutcomes(profile, targetCount) {
  if (profile === "correct_rejection") return { deep: "absent", light: "absent" };
  if (profile === "deep_false_alarm") return { deep: "invalid", light: "absent" };
  if (profile === "light_false_alarm") return { deep: "absent", light: "invalid" };
  if (profile === "both_false_alarm") return { deep: "invalid", light: "invalid" };
  if (profile === "both_valid_overlap" || profile === "both_valid_split") return { deep: "valid", light: "valid" };
  if (profile === "deep_valid_only") return { deep: "valid", light: "absent" };
  if (profile === "light_valid_only") return { deep: "absent", light: "valid" };
  if (profile === "deep_valid_light_invalid") return { deep: "valid", light: "invalid" };
  if (profile === "deep_invalid_light_valid") return { deep: "invalid", light: "valid" };
  throw new Error(`未知 cue profile: ${profile}, target_count=${targetCount}`);
}

function systemEvent(targetCount, profile) {
  if (targetCount > 0) return "hit";
  return profile === "correct_rejection" ? "correct_rejection" : "false_alarm";
}

function makeBaselineCell(setSize) {
  const rng = createRng(`${MATERIAL_SEED}:plan:baseline:${setSize}`);
  const states = Object.entries(TARGET_COUNTS_PER_CELL).flatMap(([count, n]) =>
    repeat(Number(count), n).map(targetCount => ({ target_count: targetCount }))
  );
  return constrainedShuffle(states, rng).map((state, index) => ({
    canonical_id: `baseline-s${setSize}-t${String(index + 1).padStart(2, "0")}`,
    matrix_id: matrixId("baseline", setSize, index),
    phase: "baseline",
    condition_key: BASELINE_CONDITION.key,
    ai_present: false,
    deep_validity: null,
    light_validity: null,
    set_size: setSize,
    effective_positions: setSize * setSize,
    matrix_size: setSize + 2,
    target_count: state.target_count,
    target_present: state.target_count > 0,
    true_status: state.target_count > 0 ? "noncompliant" : "compliant",
    correct_judgment: state.target_count > 0 ? "noncompliant" : "compliant",
    cue_profile: "none",
    deep_outcome: "none",
    light_outcome: "none",
    system_event: "none",
    system_correct: null,
    material_seed: `${MATERIAL_SEED}:material:baseline:${setSize}:${index + 1}`
  }));
}

function makeAiCell(conditionKey, setSize) {
  const condition = AI_CONDITIONS[conditionKey];
  const rng = createRng(`${MATERIAL_SEED}:plan:${conditionKey}:${setSize}`);
  const profiles = AI_PROFILES[conditionKey];
  const states = [
    ...profiles.target0.map(cue_profile => ({ target_count: 0, cue_profile })),
    ...profiles.target1.map(cue_profile => ({ target_count: 1, cue_profile })),
    ...repeat("both_valid_split", TARGET_COUNTS_PER_CELL[2]).map(cue_profile => ({ target_count: 2, cue_profile }))
  ].map(state => {
    const outcomes = cueOutcomes(state.cue_profile, state.target_count);
    return {
      ...state,
      deep_outcome: outcomes.deep,
      light_outcome: outcomes.light,
      system_event: systemEvent(state.target_count, state.cue_profile)
    };
  });

  return constrainedShuffle(states, rng).map((state, index) => ({
    canonical_id: `${conditionKey}-s${setSize}-t${String(index + 1).padStart(2, "0")}`,
    matrix_id: matrixId(conditionKey, setSize, index),
    phase: "ai",
    condition_key: conditionKey,
    ai_present: true,
    deep_validity: condition.deep_validity,
    light_validity: condition.light_validity,
    set_size: setSize,
    effective_positions: setSize * setSize,
    matrix_size: setSize + 2,
    target_count: state.target_count,
    target_present: state.target_count > 0,
    true_status: state.target_count > 0 ? "noncompliant" : "compliant",
    correct_judgment: state.target_count > 0 ? "noncompliant" : "compliant",
    cue_profile: state.cue_profile,
    deep_outcome: state.deep_outcome,
    light_outcome: state.light_outcome,
    system_event: state.system_event,
    system_correct: state.system_event !== "false_alarm",
    material_seed: `${MATERIAL_SEED}:material:${conditionKey}:${setSize}:${index + 1}`
  }));
}

export function generateCanonicalPlan() {
  return [
    ...SET_SIZES.flatMap(makeBaselineCell),
    ...Object.keys(AI_CONDITIONS).flatMap(conditionKey =>
      SET_SIZES.flatMap(setSize => makeAiCell(conditionKey, setSize))
    )
  ];
}

function blockTrials(canonical, phase, conditionKey, setSize) {
  return canonical.filter(trial =>
    trial.phase === phase
    && trial.condition_key === conditionKey
    && trial.set_size === Number(setSize)
  );
}

export function buildParticipantPlan(assignment = DEFAULT_ASSIGNMENT, mode = "formal") {
  const canonical = generateCanonicalPlan();
  const ordered = [];
  let blockIndex = 0;
  for (const phase of assignment.phase_order) {
    const conditions = phase === "baseline" ? ["baseline"] : assignment.condition_order;
    for (const conditionKey of conditions) {
      for (const setSize of assignment.set_size_order) {
        blockIndex += 1;
        const block = blockTrials(canonical, phase, conditionKey, setSize);
        const selected = mode === "pilot" ? block.slice(0, PILOT_TRIALS_PER_BLOCK) : block;
        selected.forEach((trial, trialIndexBlock) => ordered.push({
          ...trial,
          block_index: blockIndex,
          trial_index_block: trialIndexBlock + 1
        }));
      }
    }
  }
  return ordered.map((trial, index) => ({ ...trial, trial_index_global: index + 1 }));
}

function count(items, predicate) {
  return items.filter(predicate).length;
}

export function validateTrialPlan(plan = generateCanonicalPlan()) {
  const errors = [];
  const summary = [];
  const expectedTotal = (1 + Object.keys(AI_CONDITIONS).length) * SET_SIZES.length * TRIALS_PER_CELL;
  if (plan.length !== expectedTotal) errors.push(`总 trial 数应为 ${expectedTotal}，实际为 ${plan.length}`);
  const matrixIds = plan.map(trial => trial.matrix_id);
  if (matrixIds.some(id => typeof id !== "string" || !id)) errors.push("存在缺失的 matrix_id");
  if (new Set(matrixIds).size !== plan.length) errors.push("正式 trial 的 matrix_id 不是全局唯一");

  for (const conditionKey of ["baseline", ...Object.keys(AI_CONDITIONS)]) {
    for (const setSize of SET_SIZES) {
      const cell = plan.filter(trial => trial.condition_key === conditionKey && trial.set_size === setSize);
      const target0 = count(cell, trial => trial.target_count === 0);
      const target1 = count(cell, trial => trial.target_count === 1);
      const target2 = count(cell, trial => trial.target_count === 2);
      const row = {
        condition: conditionKey,
        set_size: setSize,
        trials: cell.length,
        target_0: target0,
        target_1: target1,
        target_2: target2,
        hit: count(cell, trial => trial.system_event === "hit"),
        correct_rejection: count(cell, trial => trial.system_event === "correct_rejection"),
        false_alarm: count(cell, trial => trial.system_event === "false_alarm"),
        miss: count(cell, trial => trial.system_event === "miss"),
        deep_valid: count(cell, trial => trial.deep_outcome === "valid"),
        deep_invalid: count(cell, trial => trial.deep_outcome === "invalid"),
        light_valid: count(cell, trial => trial.light_outcome === "valid"),
        light_invalid: count(cell, trial => trial.light_outcome === "invalid")
      };
      row.deep_displayed = row.deep_valid + row.deep_invalid;
      row.light_displayed = row.light_valid + row.light_invalid;
      row.deep_cue_validity = row.deep_displayed ? row.deep_valid / row.deep_displayed : null;
      row.light_cue_validity = row.light_displayed ? row.light_valid / row.light_displayed : null;
      row.system_accuracy = conditionKey === "baseline"
        ? null
        : (row.hit + row.correct_rejection) / cell.length;
      summary.push(row);

      if (cell.length !== TRIALS_PER_CELL) errors.push(`${conditionKey}/S${setSize}: trial 数不是 20`);
      if (target0 !== 10 || target1 !== 6 || target2 !== 4) {
        errors.push(`${conditionKey}/S${setSize}: 目标数分布不是 10/6/4`);
      }
      if (conditionKey === "baseline") {
        if (cell.some(trial => trial.ai_present || trial.system_event !== "none")) {
          errors.push(`${conditionKey}/S${setSize}: 基线出现 AI 信息`);
        }
        continue;
      }
      const condition = AI_CONDITIONS[conditionKey];
      if (row.hit !== 10 || row.correct_rejection !== 8 || row.false_alarm !== 2 || row.miss !== 0) {
        errors.push(`${conditionKey}/S${setSize}: 系统事件不是 Hit10/CR8/FA2/Miss0`);
      }
      if (row.deep_displayed !== 10 || row.light_displayed !== 10) {
        errors.push(`${conditionKey}/S${setSize}: 每种 cue 应各出现 10 次`);
      }
      if (row.deep_valid !== condition.deep_validity * 10) {
        errors.push(`${conditionKey}/S${setSize}: 深红 cue 有效数错误`);
      }
      if (row.light_valid !== condition.light_validity * 10) {
        errors.push(`${conditionKey}/S${setSize}: 浅红 cue 有效数错误`);
      }
    }
  }
  return { valid: errors.length === 0, errors, summary };
}

if (typeof window === "undefined" && process.argv[1]?.endsWith("trial-plan.js")) {
  const validation = validateTrialPlan();
  console.table(validation.summary);
  if (!validation.valid) {
    console.error(validation.errors);
    process.exitCode = 1;
  } else {
    console.log("Trial plan valid: 300 formal trials; every AI cell has Hit10/CR8/FA2/Miss0.");
  }
}

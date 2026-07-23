export const CONDITION_ORDERS = [
  ["90_90"],
  ["90_70"],
  ["70_90"],
  ["70_70"]
];

export const CONDITION_PREFIXES = {
  A: "90_90",
  B: "90_70",
  C: "70_90",
  D: "70_70"
};

export const SET_SIZE_ORDERS = [
  [3, 5, 7],
  [5, 7, 3],
  [7, 3, 5],
  [3, 7, 5],
  [7, 5, 3],
  [5, 3, 7]
];

export const PHASE_ORDERS = [
  ["baseline", "ai"]
];

export const ASSIGNMENT_GROUPS_PER_CYCLE =
  PHASE_ORDERS.length * CONDITION_ORDERS.length * SET_SIZE_ORDERS.length;

export function parseFormalSubjectCode(subjectCode) {
  const code = String(subjectCode || "").trim().toUpperCase();
  const prefixed = code.match(/^([ABCD])(\d{3,})$/);
  if (prefixed) {
    const number = Number(prefixed[2]);
    if (!Number.isSafeInteger(number) || number < 1) return null;
    return { code, prefix: prefixed[1], number, condition_key: CONDITION_PREFIXES[prefixed[1]] };
  }
  const legacy = code.match(/^P(\d{3,})$/);
  if (legacy) {
    const number = Number(legacy[1]);
    if (!Number.isSafeInteger(number) || number < 1) return null;
    return { code, prefix: "P", number, condition_key: null };
  }
  return null;
}

export function parseFormalSubjectNumber(subjectCode) {
  return parseFormalSubjectCode(subjectCode)?.number ?? null;
}

function conditionOrderIndexForKey(conditionKey) {
  const index = CONDITION_ORDERS.findIndex(order => order[0] === conditionKey);
  if (index < 0) throw new Error(`unknown_condition_key:${conditionKey}`);
  return index;
}

export function assignmentForPrefixedSubjectCode(parsed, allocationMethod = "strict_subject_prefix") {
  const conditionOrderIndex = conditionOrderIndexForKey(parsed.condition_key);
  const setSizeOrderIndex = (parsed.number - 1) % SET_SIZE_ORDERS.length;
  const index = setSizeOrderIndex * CONDITION_ORDERS.length + conditionOrderIndex;

  return {
    assignment_group: index + 1,
    assignment_cycle: Math.floor((parsed.number - 1) / SET_SIZE_ORDERS.length) + 1,
    subject_sequence: parsed.number,
    allocation_method: allocationMethod,
    phase_order_index: 1,
    condition_order_index: conditionOrderIndex + 1,
    set_size_order_index: setSizeOrderIndex + 1,
    phase_order: [...PHASE_ORDERS[0]],
    condition_order: [...CONDITION_ORDERS[conditionOrderIndex]],
    set_size_order: [...SET_SIZE_ORDERS[setSizeOrderIndex]],
    cue_mapping: { deep: "deep_red", light: "light_red" }
  };
}

export function assignmentForSequence(subjectNumber, allocationMethod = "strict_subject_sequence") {
  if (!Number.isSafeInteger(subjectNumber) || subjectNumber < 1) {
    throw new Error("invalid_subject_sequence");
  }

  const index = (subjectNumber - 1) % ASSIGNMENT_GROUPS_PER_CYCLE;
  const phaseOrderIndex = index % PHASE_ORDERS.length;
  const conditionOrderIndex = Math.floor(index / PHASE_ORDERS.length) % CONDITION_ORDERS.length;
  const setSizeOrderIndex = Math.floor(
    index / (PHASE_ORDERS.length * CONDITION_ORDERS.length)
  ) % SET_SIZE_ORDERS.length;

  return {
    assignment_group: index + 1,
    assignment_cycle: Math.floor((subjectNumber - 1) / ASSIGNMENT_GROUPS_PER_CYCLE) + 1,
    subject_sequence: allocationMethod === "strict_subject_sequence" ? subjectNumber : null,
    allocation_method: allocationMethod,
    phase_order_index: phaseOrderIndex + 1,
    condition_order_index: conditionOrderIndex + 1,
    set_size_order_index: setSizeOrderIndex + 1,
    phase_order: [...PHASE_ORDERS[phaseOrderIndex]],
    condition_order: [...CONDITION_ORDERS[conditionOrderIndex]],
    set_size_order: [...SET_SIZE_ORDERS[setSizeOrderIndex]],
    cue_mapping: { deep: "deep_red", light: "light_red" }
  };
}

export function assignmentForSubjectCode(subjectCode, fallbackGroup = null) {
  const parsed = parseFormalSubjectCode(subjectCode);
  if (parsed?.condition_key) return assignmentForPrefixedSubjectCode(parsed);
  if (parsed?.prefix === "P") return assignmentForSequence(parsed.number, "legacy_subject_sequence");
  if (!Number.isInteger(fallbackGroup) || fallbackGroup < 1) return null;
  return assignmentForSequence(fallbackGroup, "pilot_hash_fallback");
}

export const CONDITION_ORDERS = [
  ["90_90", "90_70", "70_70", "70_90"],
  ["90_70", "70_90", "90_90", "70_70"],
  ["70_90", "70_70", "90_70", "90_90"],
  ["70_70", "90_90", "70_90", "90_70"]
];

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

export function parseFormalSubjectNumber(subjectCode) {
  const match = String(subjectCode || "").trim().match(/^P(\d{3,})$/i);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
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
  const subjectNumber = parseFormalSubjectNumber(subjectCode);
  if (subjectNumber !== null) return assignmentForSequence(subjectNumber);
  if (!Number.isInteger(fallbackGroup) || fallbackGroup < 1) return null;
  return assignmentForSequence(fallbackGroup, "pilot_hash_fallback");
}

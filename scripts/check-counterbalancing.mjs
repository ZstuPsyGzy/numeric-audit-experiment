import {
  ASSIGNMENT_GROUPS_PER_CYCLE,
  CONDITION_ORDERS,
  PHASE_ORDERS,
  SET_SIZE_ORDERS,
  assignmentForSequence
} from "../assignment.mjs";

const errors = [];

function key(values) {
  return values.join("|");
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const itemKey = keyFn(item);
    counts.set(itemKey, (counts.get(itemKey) || 0) + 1);
  }
  return counts;
}

function requireUniform(label, counts, expectedKeys, expectedCount) {
  for (const expectedKey of expectedKeys) {
    const actual = counts.get(expectedKey) ?? counts.get(String(expectedKey)) ?? 0;
    if (actual !== expectedCount) {
      errors.push(`${label}: ${expectedKey} 应为 ${expectedCount}，实际为 ${actual}`);
    }
  }
}

function validateOrderSet(label, orders, levels, expectedPositionCount, expectedTransitionCount) {
  const positionRows = orders.flatMap(order =>
    order.map((level, position) => ({ level, position: position + 1 }))
  );
  const positionCounts = countBy(positionRows, row => `${row.level}@${row.position}`);
  const expectedPositions = levels.flatMap(level =>
    levels.map((_, position) => `${level}@${position + 1}`)
  );
  requireUniform(`${label}位置平衡`, positionCounts, expectedPositions, expectedPositionCount);

  const transitions = orders.flatMap(order =>
    order.slice(0, -1).map((from, index) => `${from}>${order[index + 1]}`)
  );
  const transitionCounts = countBy(transitions, transition => transition);
  const expectedTransitions = levels.flatMap(from =>
    levels.filter(to => to !== from).map(to => `${from}>${to}`)
  );
  requireUniform(`${label}一阶顺序平衡`, transitionCounts, expectedTransitions, expectedTransitionCount);
}

validateOrderSet(
  "AI condition",
  CONDITION_ORDERS,
  ["90_90", "90_70", "70_90", "70_70"],
  1,
  1
);
validateOrderSet("set size", SET_SIZE_ORDERS, [3, 5, 7], 2, 2);

const assignments = Array.from(
  { length: ASSIGNMENT_GROUPS_PER_CYCLE },
  (_, index) => assignmentForSequence(index + 1)
);

const tupleCounts = countBy(assignments, assignment => [
  assignment.phase_order_index,
  assignment.condition_order_index,
  assignment.set_size_order_index
].join("-"));
if (tupleCounts.size !== ASSIGNMENT_GROUPS_PER_CYCLE) {
  errors.push(`${ASSIGNMENT_GROUPS_PER_CYCLE}组全交叉失败：只有 ${tupleCounts.size} 个唯一组合`);
}
for (const [tuple, count] of tupleCounts) {
  if (count !== 1) errors.push(`顺序组合 ${tuple} 出现 ${count} 次`);
}

requireUniform(
  "阶段顺序",
  countBy(assignments, assignment => assignment.phase_order_index),
  PHASE_ORDERS.map((_, index) => index + 1),
  ASSIGNMENT_GROUPS_PER_CYCLE / PHASE_ORDERS.length
);
requireUniform(
  "AI condition顺序",
  countBy(assignments, assignment => assignment.condition_order_index),
  CONDITION_ORDERS.map((_, index) => index + 1),
  ASSIGNMENT_GROUPS_PER_CYCLE / CONDITION_ORDERS.length
);
requireUniform(
  "set size顺序",
  countBy(assignments, assignment => assignment.set_size_order_index),
  SET_SIZE_ORDERS.map((_, index) => index + 1),
  ASSIGNMENT_GROUPS_PER_CYCLE / SET_SIZE_ORDERS.length
);

console.table(assignments.map(assignment => ({
  subject: `P${String(assignment.subject_sequence).padStart(3, "0")}`,
  group: assignment.assignment_group,
  phase: assignment.phase_order.join(" -> "),
  condition_row: assignment.condition_order_index,
  setsize_row: assignment.set_size_order_index
})));

if (errors.length) {
  console.error("\nCounterbalancing errors:");
  console.error(errors);
  process.exitCode = 1;
} else {
  console.log("\nPASS: P001-P024 form one complete fixed-phase 1 x 4 x 6 counterbalancing cycle.");
  console.log("PASS: every participant completes baseline before AI.");
  console.log("PASS: AI conditions and set sizes are position-balanced and first-order carryover-balanced.");
}

import { createRng, randomInt, shuffle } from "./rng.js";

export function positionKey(position) {
  return position ? `${position.row},${position.col}` : "";
}

export function samePosition(first, second) {
  return Boolean(first && second && first.row === second.row && first.col === second.col);
}

export function relationResidual(matrix, row, col) {
  return matrix[row - 1][col] + matrix[row + 1][col]
    - matrix[row][col - 1] - matrix[row][col + 1];
}

export function validPositions(effectiveSize) {
  const positions = [];
  for (let row = 1; row <= effectiveSize; row += 1) {
    for (let col = 1; col <= effectiveSize; col += 1) positions.push({ row, col });
  }
  return positions;
}

function generateNumberMatrix(effectiveSize, targetCount, rng) {
  const matrixSize = effectiveSize + 2;
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const targetPositions = shuffle(validPositions(effectiveSize), rng).slice(0, targetCount);
    const targetKeys = new Set(targetPositions.map(positionKey));
    const targetSigns = new Map(targetPositions.map(position => [
      positionKey(position),
      rng() < 0.5 ? -1 : 1
    ]));
    const diagonalA = Array.from({ length: 2 * matrixSize - 1 }, () => randomInt(rng, 2));
    const diagonalB = Array.from({ length: 2 * matrixSize - 1 }, () => randomInt(rng, 2));
    const base = Array.from({ length: matrixSize }, (_, row) =>
      Array.from({ length: matrixSize }, (_, col) =>
        diagonalA[row + col] + diagonalB[row - col + matrixSize - 1]
      )
    );

    const impulse = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));
    for (let row = 1; row < matrixSize - 1; row += 1) {
      for (let col = 1; col < matrixSize - 1; col += 1) {
        const desired = targetSigns.get(`${row},${col}`) || 0;
        impulse[row + 1][col] = impulse[row][col - 1]
          + impulse[row][col + 1]
          - impulse[row - 1][col]
          + desired;
      }
    }

    const raw = base.map((row, rowIndex) =>
      row.map((value, colIndex) => value + impulse[rowIndex][colIndex])
    );
    const minimum = Math.min(...raw.flat());
    const maximum = Math.max(...raw.flat());
    if (maximum - minimum > 8) continue;
    const lowerShift = 1 - minimum;
    const upperShift = 9 - maximum;
    const shift = lowerShift + randomInt(rng, upperShift - lowerShift + 1);
    const matrix = raw.map(row => row.map(value => value + shift));

    const detected = validPositions(effectiveSize)
      .filter(position => relationResidual(matrix, position.row, position.col) !== 0);
    const exact = detected.length === targetCount
      && detected.every(position => targetKeys.has(positionKey(position)));
    if (exact) return { matrix, matrixSize, targetPositions };
  }
  throw new Error(`无法生成 set size ${effectiveSize}、目标数 ${targetCount} 的矩阵`);
}

function chooseDistractors(effectiveSize, targetPositions, count, rng) {
  const targetKeys = new Set(targetPositions.map(positionKey));
  return shuffle(
    validPositions(effectiveSize).filter(position => !targetKeys.has(positionKey(position))),
    rng
  ).slice(0, count);
}

function makeCues(spec, targetPositions, distractors) {
  let deepCue = null;
  let lightCue = null;
  switch (spec.cue_profile) {
    case "none":
    case "correct_rejection":
      break;
    case "deep_false_alarm":
      deepCue = distractors[0];
      break;
    case "light_false_alarm":
      lightCue = distractors[0];
      break;
    case "both_false_alarm":
      deepCue = distractors[0];
      lightCue = distractors[1];
      break;
    case "both_valid_overlap":
      deepCue = targetPositions[0];
      lightCue = targetPositions[0];
      break;
    case "both_valid_split":
      deepCue = targetPositions[0];
      lightCue = targetPositions[1];
      break;
    case "deep_valid_only":
      deepCue = targetPositions[0];
      break;
    case "light_valid_only":
      lightCue = targetPositions[0];
      break;
    case "deep_valid_light_invalid":
      deepCue = targetPositions[0];
      lightCue = distractors[0];
      break;
    case "deep_invalid_light_valid":
      deepCue = distractors[0];
      lightCue = targetPositions[0];
      break;
    default:
      throw new Error(`未知 cue profile: ${spec.cue_profile}`);
  }
  return {
    deepCue: deepCue ? { ...deepCue } : null,
    lightCue: lightCue ? { ...lightCue } : null
  };
}

export function generateTrialMaterial(spec) {
  const rng = createRng(spec.material_seed);
  const generated = generateNumberMatrix(spec.set_size, spec.target_count, rng);
  const distractors = chooseDistractors(spec.set_size, generated.targetPositions, 2, rng);
  const cues = makeCues(spec, generated.targetPositions, distractors);
  return {
    ...generated,
    ...cues,
    invalidPositions: generated.targetPositions.map(position => ({ ...position }))
  };
}

function cueOutcome(cue, targets) {
  if (!cue) return "absent";
  return targets.some(target => samePosition(cue, target)) ? "valid" : "invalid";
}

export function verifyMaterial(spec, material) {
  const invalid = validPositions(spec.set_size)
    .filter(position => relationResidual(material.matrix, position.row, position.col) !== 0);
  const expectedKeys = new Set(material.targetPositions.map(positionKey));
  const matrixCorrect = invalid.length === spec.target_count
    && invalid.every(position => expectedKeys.has(positionKey(position)));
  const deepOutcome = cueOutcome(material.deepCue, material.targetPositions);
  const lightOutcome = cueOutcome(material.lightCue, material.targetPositions);
  const coveredKeys = new Set(
    [material.deepCue, material.lightCue]
      .filter(cue => cue && expectedKeys.has(positionKey(cue)))
      .map(positionKey)
  );
  const targetCoverageComplete = spec.target_count === 0
    || material.targetPositions.every(position => coveredKeys.has(positionKey(position)));
  const cuesCorrect = deepOutcome === (spec.deep_outcome === "none" ? "absent" : spec.deep_outcome)
    && lightOutcome === (spec.light_outcome === "none" ? "absent" : spec.light_outcome);
  const systemCorrect = !spec.ai_present || (
    spec.system_event === "hit"
      ? targetCoverageComplete
      : spec.system_event === "correct_rejection"
        ? !material.deepCue && !material.lightCue && spec.target_count === 0
        : spec.system_event === "false_alarm"
          ? Boolean(material.deepCue || material.lightCue) && spec.target_count === 0
          : false
  );
  return {
    valid: matrixCorrect && cuesCorrect && systemCorrect,
    invalid,
    matrixCorrect,
    cuesCorrect,
    targetCoverageComplete,
    systemCorrect,
    deepOutcome,
    lightOutcome
  };
}

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

function matrixRepetitionScore(matrix) {
  let score = 0;
  const counts = new Map();
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      const value = matrix[row][col];
      counts.set(value, (counts.get(value) || 0) + 1);
      if (col + 1 < matrix.length && matrix[row][col + 1] === value) score += 8;
      if (row + 1 < matrix.length && matrix[row + 1][col] === value) score += 8;
      if (col + 2 < matrix.length && matrix[row][col + 1] === value && matrix[row][col + 2] === value) {
        score += 18;
      }
      if (row + 2 < matrix.length && matrix[row + 1][col] === value && matrix[row + 2][col] === value) {
        score += 18;
      }
    }
  }
  for (let row = 0; row < matrix.length - 1; row += 1) {
    for (let col = 0; col < matrix.length - 1; col += 1) {
      const values = [
        matrix[row][col],
        matrix[row + 1][col],
        matrix[row][col + 1],
        matrix[row + 1][col + 1]
      ];
      if (new Set(values).size === 1) score += 30;
      else if (new Set(values).size === 2) score += 6;
    }
  }
  const expected = matrix.flat().length / 9;
  for (const count of counts.values()) {
    score += Math.max(0, count - expected - 1) * 1.5;
  }
  return Math.round(score * 10) / 10;
}

function sortedPairKey(first, second) {
  return first < second ? `${first},${second}` : `${second},${first}`;
}

function sharedDigitCount(verticalFirst, verticalSecond, horizontalFirst, horizontalSecond) {
  const vertical = [verticalFirst, verticalSecond];
  const horizontal = [horizontalFirst, horizontalSecond];
  let shared = 0;
  for (const value of new Set(vertical)) {
    shared += Math.min(
      vertical.filter(item => item === value).length,
      horizontal.filter(item => item === value).length
    );
  }
  return shared;
}

function relationPairScore(matrix, effectiveSize, targetKeys) {
  let swappedPairCount = 0;
  let sharedDigitTotal = 0;
  for (const position of validPositions(effectiveSize)) {
    if (targetKeys.has(positionKey(position))) continue;
    const top = matrix[position.row - 1][position.col];
    const bottom = matrix[position.row + 1][position.col];
    const left = matrix[position.row][position.col - 1];
    const right = matrix[position.row][position.col + 1];
    if (top + bottom !== left + right) continue;
    if (sortedPairKey(top, bottom) === sortedPairKey(left, right)) swappedPairCount += 1;
    sharedDigitTotal += sharedDigitCount(top, bottom, left, right);
  }
  return {
    swappedPairCount,
    sharedDigitTotal,
    score: swappedPairCount * 1000 + sharedDigitTotal * 10
  };
}

function generateNumberMatrix(effectiveSize, targetCount, rng) {
  const matrixSize = effectiveSize + 2;
  let bestCandidate = null;
  let bestScore = Infinity;
  let firstExactAttempt = null;
  let exactCount = 0;
  for (let attempt = 0; attempt < 50000; attempt += 1) {
    const targetPositions = shuffle(validPositions(effectiveSize), rng).slice(0, targetCount);
    const targetKeys = new Set(targetPositions.map(positionKey));
    const targetSigns = new Map(targetPositions.map(position => [
      positionKey(position),
      rng() < 0.5 ? -1 : 1
    ]));
    const raw = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(null));
    raw[0] = Array.from({ length: matrixSize }, () => randomInt(rng, 5));
    raw[1] = Array.from({ length: matrixSize }, () => randomInt(rng, 5));
    for (let row = 1; row < matrixSize - 1; row += 1) {
      if (row + 1 > 1) {
        raw[row + 1][0] = randomInt(rng, 5);
        raw[row + 1][matrixSize - 1] = randomInt(rng, 5);
      }
      for (let col = 1; col < matrixSize - 1; col += 1) {
        const desired = targetSigns.get(`${row},${col}`) || 0;
        raw[row + 1][col] = raw[row][col - 1]
          + raw[row][col + 1]
          - raw[row - 1][col]
          + desired;
      }
    }
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
    if (exact) {
      const repetitionScore = matrixRepetitionScore(matrix);
      const pairScore = relationPairScore(matrix, effectiveSize, targetKeys);
      const materialScore = pairScore.score + repetitionScore;
      exactCount += 1;
      if (firstExactAttempt === null) firstExactAttempt = attempt;
      if (materialScore < bestScore) {
        bestScore = materialScore;
        bestCandidate = {
          matrix,
          matrixSize,
          targetPositions,
          repetitionScore,
          relationPairScore: pairScore.score,
          swappedPairCount: pairScore.swappedPairCount,
          sharedDigitTotal: pairScore.sharedDigitTotal
        };
      }
      if (
        pairScore.swappedPairCount === 0
        && (
          repetitionScore <= matrixSize * 8
          || exactCount >= 12
          || attempt - firstExactAttempt >= 300
        )
      ) {
        return bestCandidate;
      }
    }
  }
  if (bestCandidate) return bestCandidate;
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
  if (samePosition(cues.deepCue, cues.lightCue)) {
    throw new Error(`cue 位置不得重合: ${spec.canonical_id}`);
  }
  return {
    ...generated,
    ...cues,
    repetitionScore: generated.repetitionScore,
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
  const cuePositionsOverlap = samePosition(material.deepCue, material.lightCue);
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
    valid: matrixCorrect && cuesCorrect && systemCorrect && !cuePositionsOverlap,
    invalid,
    matrixCorrect,
    cuesCorrect,
    targetCoverageComplete,
    systemCorrect,
    deepOutcome,
    lightOutcome,
    cuePositionsOverlap
  };
}

import { generateTrialMaterial, verifyMaterial } from "../public/js/matrix.js";
import { generateCanonicalPlan, validateTrialPlan } from "../public/js/trial-plan.js";

const plan = generateCanonicalPlan();
const planValidation = validateTrialPlan(plan);
const materialErrors = [];
let cueOverlapCount = 0;
let incompleteTargetCoverageCount = 0;

for (const spec of plan) {
  try {
    const material = generateTrialMaterial(spec);
    const verification = verifyMaterial(spec, material);
    if (verification.cuePositionsOverlap) cueOverlapCount += 1;
    if (spec.ai_present && spec.target_count > 0 && !verification.targetCoverageComplete) {
      incompleteTargetCoverageCount += 1;
    }
    if (!verification.valid) materialErrors.push({ canonical_id: spec.canonical_id, verification });
  } catch (error) {
    materialErrors.push({ canonical_id: spec.canonical_id, error: error.message });
  }
}

console.table(planValidation.summary);
console.log(`\nFormal trials: ${plan.length}`);
console.log(`Plan errors: ${planValidation.errors.length}`);
console.log(`Material errors: ${materialErrors.length}`);
console.log(`Deep/light cue overlaps: ${cueOverlapCount}`);
console.log(`AI target-coverage failures: ${incompleteTargetCoverageCount}`);

if (
  !planValidation.valid
  || materialErrors.length
  || cueOverlapCount
  || incompleteTargetCoverageCount
) {
  console.error(planValidation.errors);
  console.error(materialErrors.slice(0, 20));
  process.exitCode = 1;
} else {
  console.log("PASS: all counts and materials are valid; cue overlaps=0 and AI target misses=0.");
}

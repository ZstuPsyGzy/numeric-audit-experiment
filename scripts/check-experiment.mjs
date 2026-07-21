import { generateTrialMaterial, verifyMaterial } from "../public/js/matrix.js";
import { generateCanonicalPlan, validateTrialPlan } from "../public/js/trial-plan.js";

const plan = generateCanonicalPlan();
const planValidation = validateTrialPlan(plan);
const materialErrors = [];

for (const spec of plan) {
  try {
    const material = generateTrialMaterial(spec);
    const verification = verifyMaterial(spec, material);
    if (!verification.valid) materialErrors.push({ canonical_id: spec.canonical_id, verification });
  } catch (error) {
    materialErrors.push({ canonical_id: spec.canonical_id, error: error.message });
  }
}

console.table(planValidation.summary);
console.log(`\nFormal trials: ${plan.length}`);
console.log(`Plan errors: ${planValidation.errors.length}`);
console.log(`Material errors: ${materialErrors.length}`);

if (!planValidation.valid || materialErrors.length) {
  console.error(planValidation.errors);
  console.error(materialErrors.slice(0, 20));
  process.exitCode = 1;
} else {
  console.log("PASS: all trial counts, cue validities, AI events and matrices are valid.");
}

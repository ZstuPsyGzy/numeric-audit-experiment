import { chromium } from "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs";

const baseUrl = process.env.EXPERIMENT_URL
  || "http://127.0.0.1:8791/setsize_2_3/";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", message => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", error => consoleErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const resultPromise = page.evaluate(async () => {
    const { NumericAuditPlugin } = await import("./js/numeric-audit-plugin.js");
    const display = document.querySelector("#jspsych-target");
    display.hidden = false;
    document.querySelector("#consent-screen").hidden = true;
    document.querySelector("#info-screen").hidden = true;

    const result = new Promise(resolve => {
      const plugin = new NumericAuditPlugin({ finishTrial: resolve });
      plugin.trial(display, {
        spec: {
          ai_present: true,
          canonical_id: "mouse-test",
          matrix_id: "mouse-test",
          phase: "ai",
          condition_key: "90_70",
          set_size: 2,
          matrix_size: 4,
          effective_positions: 4,
          target_count: 1,
          target_present: true,
          true_status: "noncompliant",
          correct_judgment: "noncompliant",
          deep_validity: 0.9,
          light_validity: 0.7,
          deep_outcome: "valid",
          light_outcome: "invalid",
          cue_profile: "deep_valid_light_invalid",
          system_event: "hit",
          system_correct: true
        },
        material: {
          matrixSize: 4,
          matrix: [
            [1, 2, 3, 4],
            [2, 5, 4, 3],
            [3, 2, 6, 4],
            [4, 3, 2, 1]
          ],
          targetPositions: [{ row: 1, col: 1 }],
          deepCue: { row: 1, col: 1 },
          lightCue: { row: 2, col: 2 },
          repetitionScore: 0,
          relationPairScore: 0,
          swappedPairCount: 0,
          sharedDigitTotal: 0
        },
        practice: false,
        ask_ratings: true,
        instruction_html: "",
        progress_current: 1,
        progress_total: 1
      });
    });
    window.__mouseDataTestResult = result;
    return true;
  });
  if (!resultPromise) throw new Error("Plugin harness failed to initialize");

  const deep = page.locator(".number-cell.cue-deep");
  const light = page.locator(".number-cell.cue-light");
  await deep.hover();
  await page.waitForTimeout(80);
  await light.hover();
  await page.waitForTimeout(80);
  await deep.click();
  await page.locator('[data-judgment="noncompliant"]').click();
  for (const row of await page.locator(".rating-row").all()) {
    await row.locator("button").nth(3).click();
  }
  await page.locator(".submit-rating").click();
  const result = await page.evaluate(() => window.__mouseDataTestResult);
  const required = [
    "judgment_rt_ms",
    "last_click_rt_ms",
    "localization_rt_ms",
    "post_localization_judgment_rt_ms",
    "deep_cue_first_select_rt_ms",
    "mouse_sample_count",
    "mouse_distance_px",
    "mouse_deep_hover_duration_ms",
    "mouse_light_hover_duration_ms",
    "mouse_trace"
  ];
  const missing = required.filter(key => !(key in result));
  if (missing.length) throw new Error(`Missing data fields: ${missing.join(", ")}`);
  if (!Array.isArray(result.mouse_trace) || result.mouse_trace.length === 0) {
    throw new Error("Mouse trace was not recorded");
  }
  if (!(result.mouse_deep_hover_duration_ms > 0) || !(result.mouse_light_hover_duration_ms > 0)) {
    throw new Error("Cue hover durations were not recorded");
  }
  if (result.localization_rt_ms === result.judgment_rt_ms) {
    throw new Error("Localization and judgment RT are still duplicated");
  }
  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    status: "passed",
    mouse_samples: result.mouse_sample_count,
    deep_hover_ms: result.mouse_deep_hover_duration_ms,
    light_hover_ms: result.mouse_light_hover_duration_ms,
    localization_rt_ms: result.localization_rt_ms,
    judgment_rt_ms: result.judgment_rt_ms
  }, null, 2));
} finally {
  await browser.close();
}

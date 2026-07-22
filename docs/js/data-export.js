function safeFilenamePart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function timestampForFilename(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function serializeCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value) {
  const text = serializeCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows) {
  const preferred = [
    "subject_code", "session_id", "experiment_version", "mode", "phase",
    "condition_key", "matrix_id", "canonical_id", "material_seed",
    "calibration_method", "calibration_reference",
    "calibration_reference_width_mm", "calibration_reference_height_mm",
    "calibration_reference_width_px", "px_per_mm",
    "red_discrimination_correct", "gray_bands_distinguishable",
    "set_size", "target_count", "target_present",
    "trial_index_global", "trial_index_block", "trial_uuid",
    "participant_judgment", "correct_judgment", "judgment_correct", "fully_correct",
    "localization_rt_ms", "judgment_rt_ms", "judgment_confidence",
    "ai_output_trust", "deep_cue_trust", "light_cue_trust", "deep_validity", "light_validity",
    "deep_outcome", "light_outcome", "cue_positions_overlap", "selected_positions", "target_positions",
    "matrix_rendered_width_px", "matrix_rendered_height_px",
    "matrix_rendered_width_mm", "matrix_rendered_height_mm",
    "cell_rendered_width_px", "cell_rendered_height_px",
    "matrix_gap_requested_mm", "matrix_column_gap_px", "matrix_row_gap_px",
    "matrix_column_gap_mm", "matrix_row_gap_mm", "digit_font_size_px",
    "questionnaire_id", "scale_name", "scale_version", "questionnaire_order",
    "item_count", "missing_count", "responses",
    "bfi_01", "bfi_02", "bfi_03", "bfi_04", "bfi_05",
    "bfi_06", "bfi_07", "bfi_08", "bfi_09", "bfi_10",
    "bfi_extraversion_mean", "bfi_agreeableness_mean", "bfi_conscientiousness_mean",
    "bfi_neuroticism_mean", "bfi_openness_mean",
    "ail_01", "ail_02", "ail_03", "ail_04", "ail_05", "ail_06",
    "ail_07", "ail_08", "ail_09", "ail_10", "ail_11", "ail_12",
    "ai_literacy_awareness_mean", "ai_literacy_usage_mean", "ai_literacy_evaluation_mean",
    "ai_literacy_ethics_mean", "ai_literacy_total_mean"
  ];
  const allKeys = new Set(rows.flatMap(row => Object.keys(row)));
  const headers = [
    ...preferred.filter(key => allKeys.has(key)),
    ...[...allKeys].filter(key => !preferred.includes(key)).sort()
  ];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map(key => escapeCsv(row[key])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createExportBundle(jsPsych, session) {
  const rows = jsPsych?.data?.get().values() || [];
  const exportedAt = new Date();
  const baseName = [
    "numeric-audit",
    safeFilenamePart(session?.subject_code),
    timestampForFilename(exportedAt)
  ].join("_");
  const document = {
    export_schema_version: "github-pages-local-export-v1",
    exported_at: exportedAt.toISOString(),
    session,
    row_count: rows.length,
    rows
  };
  return {
    baseName,
    csvFilename: `${baseName}.csv`,
    jsonFilename: `${baseName}.json`,
    csvText: rowsToCsv(rows),
    jsonText: JSON.stringify(document, null, 2)
  };
}

export function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(bundle) {
  downloadText(bundle.jsonFilename, bundle.jsonText, "application/json;charset=utf-8");
}

export function downloadCsv(bundle) {
  downloadText(bundle.csvFilename, bundle.csvText, "text/csv;charset=utf-8");
}

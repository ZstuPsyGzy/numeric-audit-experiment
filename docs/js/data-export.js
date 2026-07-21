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
    "condition_key", "set_size", "target_count", "target_present",
    "trial_index_global", "trial_index_block", "trial_uuid",
    "judgment_response", "judgment_correct", "fully_correct",
    "localization_rt_ms", "judgment_rt_ms", "confidence_rating",
    "ai_trust_rating", "deep_validity", "light_validity",
    "deep_outcome", "light_outcome", "selected_positions", "target_positions"
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

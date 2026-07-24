import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  ASSIGNMENT_GROUPS_PER_CYCLE,
  assignmentForSubjectCode,
  parseFormalSubjectNumber
} from "./assignment.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8780);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "local-development-only";
const SUBJECT_CODE_SALT = process.env.SUBJECT_CODE_SALT || "local-development-salt";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "";
const MAX_BODY_BYTES = 1024 * 1024;
const EXPERIMENT_VERSION = "numeric-audit-cue-validity-1.10.15";

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, "experiment.sqlite3"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    subject_hash TEXT NOT NULL,
    experiment_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    assignment_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'started',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    user_agent TEXT,
    client_meta_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_subject_hash
    ON sessions(subject_hash, experiment_version);

  CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    trial_uuid TEXT NOT NULL,
    matrix_id TEXT,
    received_at TEXT NOT NULL,
    phase TEXT NOT NULL,
    trial_index_global INTEGER,
    condition_key TEXT,
    set_size INTEGER,
    target_present INTEGER,
    ai1_reliability REAL,
    ai2_reliability REAL,
    ai1_outcome TEXT,
    ai2_outcome TEXT,
    localization_correct INTEGER,
    judgment_correct INTEGER,
    fully_correct INTEGER,
    localization_rt_ms REAL,
    judgment_rt_ms REAL,
    payload_json TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id),
    UNIQUE(session_id, trial_uuid)
  );

  CREATE INDEX IF NOT EXISTS idx_trials_session ON trials(session_id);
  CREATE INDEX IF NOT EXISTS idx_trials_condition ON trials(condition_key, set_size);
`);

const trialColumns = db.prepare("PRAGMA table_info(trials)").all();
if (!trialColumns.some(column => column.name === "matrix_id")) {
  db.exec("ALTER TABLE trials ADD COLUMN matrix_id TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_trials_matrix_id ON trials(matrix_id)");

const insertSession = db.prepare(`
  INSERT INTO sessions (
    session_id, subject_hash, experiment_version, mode, assignment_json,
    status, started_at, user_agent, client_meta_json
  ) VALUES (?, ?, ?, ?, ?, 'started', ?, ?, ?)
`);

const insertTrial = db.prepare(`
  INSERT OR IGNORE INTO trials (
    session_id, trial_uuid, matrix_id, received_at, phase, trial_index_global,
    condition_key, set_size, target_present, ai1_reliability, ai2_reliability,
    ai1_outcome, ai2_outcome, localization_correct, judgment_correct,
    fully_correct, localization_rt_ms, judgment_rt_ms, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const sessionExists = db.prepare("SELECT session_id FROM sessions WHERE session_id = ?");
const completeSession = db.prepare(`
  UPDATE sessions SET status = 'completed', completed_at = ? WHERE session_id = ?
`);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function jsonResponse(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function subjectHash(subjectCode) {
  return createHash("sha256")
    .update(`${SUBJECT_CODE_SALT}:${subjectCode.trim()}`)
    .digest("hex");
}

function safeInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function safeBooleanInteger(value) {
  return typeof value === "boolean" ? Number(value) : null;
}

function sameToken(received) {
  const expectedBuffer = Buffer.from(ADMIN_TOKEN);
  const receivedBuffer = Buffer.from(received || "");
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv(res) {
  const rows = db.prepare(`
    SELECT
      s.session_id, s.subject_hash, s.experiment_version, s.mode,
      s.assignment_json, s.client_meta_json, s.user_agent,
      s.started_at, s.completed_at, s.status,
      t.trial_uuid, t.matrix_id, t.received_at, t.phase, t.trial_index_global,
      t.condition_key, t.set_size, t.target_present,
      t.ai1_reliability, t.ai2_reliability, t.ai1_outcome, t.ai2_outcome,
      t.localization_correct, t.judgment_correct, t.fully_correct,
      t.localization_rt_ms, t.judgment_rt_ms,
      json_extract(t.payload_json, '$.calibration_method') AS calibration_method,
      json_extract(t.payload_json, '$.calibration_reference_width_px') AS calibration_reference_width_px,
      json_extract(t.payload_json, '$.px_per_mm') AS px_per_mm,
      json_extract(t.payload_json, '$.red_discrimination_correct') AS red_discrimination_correct,
      json_extract(t.payload_json, '$.gray_bands_distinguishable') AS gray_bands_distinguishable,
      json_extract(t.payload_json, '$.matrix_rendered_width_px') AS matrix_rendered_width_px,
      json_extract(t.payload_json, '$.matrix_rendered_height_px') AS matrix_rendered_height_px,
      json_extract(t.payload_json, '$.matrix_rendered_width_mm') AS matrix_rendered_width_mm,
      json_extract(t.payload_json, '$.matrix_rendered_height_mm') AS matrix_rendered_height_mm,
      json_extract(t.payload_json, '$.cell_rendered_width_px') AS cell_rendered_width_px,
      json_extract(t.payload_json, '$.cell_rendered_height_px') AS cell_rendered_height_px,
      json_extract(t.payload_json, '$.digit_font_size_px') AS digit_font_size_px,
      t.payload_json
    FROM trials t
    JOIN sessions s ON s.session_id = t.session_id
    ORDER BY s.started_at, t.trial_index_global, t.id
  `).all();
  const headers = rows.length ? Object.keys(rows[0]) : ["session_id"];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map(header => csvEscape(row[header])).join(","));
  const body = `\uFEFF${lines.join("\n")}`;
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="experiment-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const sessionCount = db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n;
    const trialCount = db.prepare("SELECT COUNT(*) AS n FROM trials").get().n;
    jsonResponse(res, 200, {
      ok: true,
      experiment_version: EXPERIMENT_VERSION,
      sessions: sessionCount,
      trials: trialCount,
      time: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export.csv") {
    if (!sameToken(url.searchParams.get("token"))) {
      jsonResponse(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    exportCsv(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/start") {
    const body = await readJson(req);
    const code = String(body.subject_code || "").trim().toUpperCase();
    const mode = body.mode === "pilot" ? "pilot" : "formal";
    if (!body.consent || !/^[A-Za-z0-9_-]{2,40}$/.test(code)) {
      jsonResponse(res, 400, { ok: false, error: "invalid_subject_or_consent" });
      return;
    }
    if (mode === "formal" && parseFormalSubjectNumber(code) === null) {
      jsonResponse(res, 400, {
        ok: false,
        error: "formal_subject_code_required",
        expected_format: "A001",
        assignment_cycle_size: ASSIGNMENT_GROUPS_PER_CYCLE
      });
      return;
    }
    const hash = subjectHash(code);
    const fallbackGroup = (Number.parseInt(hash.slice(0, 8), 16) % ASSIGNMENT_GROUPS_PER_CYCLE) + 1;
    const assignment = assignmentForSubjectCode(code, mode === "pilot" ? fallbackGroup : null);
    const sessionId = randomUUID();
    insertSession.run(
      sessionId,
      hash,
      EXPERIMENT_VERSION,
      mode,
      JSON.stringify(assignment),
      new Date().toISOString(),
      req.headers["user-agent"] || "",
      JSON.stringify(body.client_meta || {})
    );
    jsonResponse(res, 201, {
      ok: true,
      session_id: sessionId,
      experiment_version: EXPERIMENT_VERSION,
      mode,
      assignment
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/trials/batch") {
    const body = await readJson(req);
    const sessionId = String(body.session_id || "");
    const trials = Array.isArray(body.trials) ? body.trials : [];
    if (!sessionExists.get(sessionId) || trials.length < 1 || trials.length > 50) {
      jsonResponse(res, 400, { ok: false, error: "invalid_session_or_batch" });
      return;
    }
    let inserted = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const trial of trials) {
        if (!trial || typeof trial !== "object" || typeof trial.trial_uuid !== "string") continue;
        const result = insertTrial.run(
          sessionId,
          trial.trial_uuid.slice(0, 80),
          String(trial.matrix_id || "").slice(0, 100),
          new Date().toISOString(),
          String(trial.phase || "formal").slice(0, 20),
          safeInteger(trial.trial_index_global),
          String(trial.condition_key || "").slice(0, 40),
          safeInteger(trial.set_size),
          safeBooleanInteger(trial.target_present),
          safeNumber(trial.ai1_reliability),
          safeNumber(trial.ai2_reliability),
          String(trial.ai1_outcome || "").slice(0, 40),
          String(trial.ai2_outcome || "").slice(0, 40),
          safeBooleanInteger(trial.localization_correct),
          safeBooleanInteger(trial.judgment_correct),
          safeBooleanInteger(trial.fully_correct),
          safeNumber(trial.localization_rt_ms),
          safeNumber(trial.judgment_rt_ms),
          JSON.stringify(trial)
        );
        inserted += Number(result.changes || 0);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    jsonResponse(res, 200, { ok: true, received: trials.length, inserted });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/complete") {
    const body = await readJson(req);
    const sessionId = String(body.session_id || "");
    if (!sessionExists.get(sessionId)) {
      jsonResponse(res, 404, { ok: false, error: "session_not_found" });
      return;
    }
    completeSession.run(new Date().toISOString(), sessionId);
    jsonResponse(res, 200, { ok: true });
    return;
  }

  jsonResponse(res, 404, { ok: false, error: "not_found" });
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    jsonResponse(res, 400, { ok: false, error: "bad_path" });
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  const filePath = resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${resolve(PUBLIC_DIR)}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    jsonResponse(res, 404, { ok: false, error: "not_found" });
    return;
  }
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": filePath.includes(`${PUBLIC_DIR}/vendor/`)
      ? "public, max-age=31536000, immutable"
      : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (PUBLIC_ORIGIN && req.headers.origin && req.headers.origin !== PUBLIC_ORIGIN) {
      jsonResponse(res, 403, { ok: false, error: "origin_not_allowed" });
      return;
    }
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else jsonResponse(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) jsonResponse(res, 500, { ok: false, error: "server_error" });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Experiment server: http://${HOST}:${PORT}`);
  console.log(`Database: ${join(DATA_DIR, "experiment.sqlite3")}`);
  if (ADMIN_TOKEN === "local-development-only" || SUBJECT_CODE_SALT === "local-development-salt") {
    console.warn("Warning: development secrets are active. Set ADMIN_TOKEN and SUBJECT_CODE_SALT before deployment.");
  }
});

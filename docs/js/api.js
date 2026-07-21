import {
  ASSIGNMENT_GROUPS_PER_CYCLE,
  assignmentForSubjectCode
} from "./assignment.js";

const QUEUE_PREFIX = "numeric-audit-github-pages-queue:";
const BACKUP_PREFIX = "numeric-audit-github-pages-data:";

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sessionId(subjectCode) {
  return `github-pages-${subjectCode}-${Date.now()}`;
}

export async function startSession(payload) {
  const fallbackGroup = (stableHash(payload.subject_code) % ASSIGNMENT_GROUPS_PER_CYCLE) + 1;
  const assignment = assignmentForSubjectCode(payload.subject_code, fallbackGroup);
  if (!assignment) throw new Error("assignment_failed");
  const session = {
    session_id: sessionId(payload.subject_code),
    subject_code: payload.subject_code,
    client_meta: payload.client_meta || {},
    assignment
  };
  localStorage.setItem(`${BACKUP_PREFIX}${session.session_id}:session`, JSON.stringify(session));
  window.__NAODAO_SESSION__ = session;
  return session;
}

function queueKey(sessionIdValue) {
  return `${QUEUE_PREFIX}${sessionIdValue}`;
}

function backupKey(sessionIdValue) {
  return `${BACKUP_PREFIX}${sessionIdValue}:trials`;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function enqueueTrial(sessionIdValue, trial) {
  const queue = readJson(queueKey(sessionIdValue));
  queue.push(trial);
  writeJson(queueKey(sessionIdValue), queue);
  return queue.length;
}

export function queuedTrialCount(sessionIdValue) {
  return readJson(queueKey(sessionIdValue)).length;
}

export async function flushTrialQueue(sessionIdValue) {
  const queue = readJson(queueKey(sessionIdValue));
  if (!queue.length) return 0;
  const existing = readJson(backupKey(sessionIdValue));
  const known = new Set(existing.map(trial => trial.trial_uuid));
  const merged = [...existing, ...queue.filter(trial => !known.has(trial.trial_uuid))];
  writeJson(backupKey(sessionIdValue), merged);
  writeJson(queueKey(sessionIdValue), []);
  window.__NAODAO_TRIAL_RECORDS__ = merged;
  return queue.length;
}

export async function finishSession(sessionIdValue) {
  await flushTrialQueue(sessionIdValue);
  return { ok: true, platform: "github_pages", session_id: sessionIdValue };
}

export function installUnloadUpload(sessionIdProvider) {
  window.addEventListener("beforeunload", () => {
    const currentSessionId = sessionIdProvider();
    if (currentSessionId) flushTrialQueue(currentSessionId).catch(() => {});
  });
}

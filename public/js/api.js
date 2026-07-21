const QUEUE_PREFIX = "numeric-audit-upload-queue:";

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function startSession(payload) {
  return request("/api/session/start", { method: "POST", body: JSON.stringify(payload) });
}

function queueKey(sessionId) {
  return `${QUEUE_PREFIX}${sessionId}`;
}

function readQueue(sessionId) {
  try {
    return JSON.parse(localStorage.getItem(queueKey(sessionId)) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(sessionId, trials) {
  localStorage.setItem(queueKey(sessionId), JSON.stringify(trials));
}

export function enqueueTrial(sessionId, trial) {
  const queue = readQueue(sessionId);
  queue.push(trial);
  writeQueue(sessionId, queue);
  return queue.length;
}

export function queuedTrialCount(sessionId) {
  return readQueue(sessionId).length;
}

export async function flushTrialQueue(sessionId, batchSize = 10) {
  let queue = readQueue(sessionId);
  let uploaded = 0;
  while (queue.length) {
    const batch = queue.slice(0, batchSize);
    await request("/api/trials/batch", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, trials: batch })
    });
    queue = queue.slice(batch.length);
    writeQueue(sessionId, queue);
    uploaded += batch.length;
  }
  return uploaded;
}

export async function finishSession(sessionId) {
  await flushTrialQueue(sessionId);
  return request("/api/session/complete", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId })
  });
}

export function installUnloadUpload(sessionIdProvider) {
  window.addEventListener("online", () => {
    const sessionId = sessionIdProvider();
    if (sessionId) flushTrialQueue(sessionId).catch(() => {});
  });
}


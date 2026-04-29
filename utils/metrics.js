const fs = require('fs');
const path = require('path');

if (!global.__app_metrics) global.__app_metrics = {};
const metrics = global.__app_metrics;

function increment(key, n = 1) {
  metrics[key] = (metrics[key] || 0) + n;
}

function getAll() {
  return Object.assign({}, metrics);
}

function persist(filePath) {
  try {
    const p = filePath || path.resolve(__dirname, '../backups/metrics.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(getAll(), null, 2), 'utf8');
  } catch (e) {
    // noop
  }
}

let __metrics_persist_timer = null;
function startAutoPersist(intervalMs = 5000, filePath) {
  try {
    if (__metrics_persist_timer) return;
    __metrics_persist_timer = setInterval(() => {
      persist(filePath);
    }, Number(intervalMs) || 5000);
    // ensure node doesn't keep process alive for this timer
    if (__metrics_persist_timer.unref) __metrics_persist_timer.unref();
  } catch (e) {
    // noop
  }
}

function stopAutoPersist() {
  if (__metrics_persist_timer) {
    clearInterval(__metrics_persist_timer);
    __metrics_persist_timer = null;
  }
}

module.exports = { increment, getAll, persist, startAutoPersist, stopAutoPersist };

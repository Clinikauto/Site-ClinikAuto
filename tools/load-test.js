const http = require('http');
const { URL } = require('url');

const args = require('minimist')(process.argv.slice(2));
const BASE = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:3000';
const rps = Number(args.rps || args._[0] || 50);
const duration = Number(args.duration || args._[1] || 60); // seconds
const endpoints = (args.endpoints || args.e || '/available-times/2026-04-28,/').split(',').map(s => s.trim()).filter(Boolean);

if (!Array.isArray(endpoints) || endpoints.length === 0) {
  console.error('No endpoints'); process.exit(1);
}

const stats = {
  total: 0,
  ok: 0,
  errors: 0,
  byStatus: {}
};

function sendRequest(pathname) {
  return new Promise((resolve) => {
    const url = new URL(pathname, BASE);
    const req = http.get(url, (res) => {
      const { statusCode } = res;
      res.resume();
      res.on('end', () => {
        stats.total++;
        stats.byStatus[statusCode] = (stats.byStatus[statusCode] || 0) + 1;
        if (statusCode >= 200 && statusCode < 400) stats.ok++;
        else stats.errors++;
        resolve();
      });
    });
    req.on('error', () => { stats.total++; stats.errors++; resolve(); });
    req.setTimeout(5000, () => { req.destroy(); stats.total++; stats.errors++; resolve(); });
  });
}

async function run() {
  console.log(`Load test: ${rps} rps for ${duration}s across ${endpoints.length} endpoints`);
  const intervalMs = 1000 / rps;
  const endAt = Date.now() + duration * 1000;

  let scheduled = 0;
  while (Date.now() < endAt) {
    const now = Date.now();
    const tasks = [];
    // send requests in this 1-second window
    const sendsThisSecond = Math.max(1, Math.round(rps));
    for (let i = 0; i < sendsThisSecond; i++) {
      const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      tasks.push(sendRequest(ep));
      scheduled++;
    }
    // await all in this batch to avoid flooding too much
    await Promise.all(tasks);
    const elapsed = Date.now() - now;
    const waitMs = Math.max(0, 1000 - elapsed);
    await new Promise(r => setTimeout(r, waitMs));
  }

  console.log('Load test complete');
  console.log(JSON.stringify(stats, null, 2));
}

run().catch(err => { console.error('Error load test', err); process.exit(1); });

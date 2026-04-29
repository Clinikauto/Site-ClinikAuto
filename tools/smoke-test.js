const http = require('http');
const { URL } = require('url');

const BASE = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:3000';
const endpoints = ['/', '/login'];

function check(path) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const req = http.get(url, (res) => {
      const { statusCode } = res;
      res.resume();
      res.on('end', () => resolve({ path, ok: statusCode >= 200 && statusCode < 400, statusCode }));
    });
    req.on('error', (err) => resolve({ path, ok: false, error: err.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ path, ok: false, error: 'timeout' }); });
  });
}

(async () => {
  console.log('Running smoke tests against', BASE);
  const results = [];
  for (const ep of endpoints) {
    process.stdout.write(`Checking ${ep} ... `);
    const r = await check(ep);
    results.push(r);
    if (r.ok) console.log(`OK (${r.statusCode})`);
    else console.log(`FAIL ${r.error || r.statusCode}`);
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.error('Smoke tests failed:', failed);
    process.exit(1);
  }
  console.log('All smoke tests passed');
  process.exit(0);
})();

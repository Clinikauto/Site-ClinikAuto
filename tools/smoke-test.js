const http = require('http');

function request(path, options = {}){
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'GET', timeout: 5000 }, (res) => {
      const bufs = [];
      res.on('data', (b) => bufs.push(b));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

(async () => {
  try{
    console.log('Checking / ...');
    const root = await request('/');
    if (root.status !== 200) throw new Error('/ returned ' + root.status);
    console.log('OK: / responded 200');

    console.log('Checking /login ...');
    const l = await request('/login');
    if (l.status !== 200) throw new Error('/login returned ' + l.status);
    console.log('OK: /login responded 200');

    console.log('Checking /api health (if exists) ...');
    try{
      const api = await request('/api/health');
      console.log('/api/health status', api.status);
    }catch(_e){ console.log('No /api/health endpoint — skipping'); }

    console.log('Smoke tests passed');
    process.exit(0);
  }catch(err){
    console.error('Smoke test failed:', err && err.message || err);
    process.exit(2);
  }
})();

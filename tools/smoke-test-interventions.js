const fetch = require('node-fetch');
const { execSync } = require('child_process');

async function run() {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
    // generate token via local script
    const token = execSync(`node "${__dirname.replace(/\\/g, '/')}/generate-jwt.js" admin ${jwtSecret}`, { encoding: 'utf8' }).trim();

    const base = process.env.BASE_URL || 'http://localhost:3000';
    console.log('Using base URL:', base);

    // POST
    let res = await fetch(base + '/api/interventions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ title: 'Smoke test', description: 'Automated smoke', status: 'open' })
    });
    console.log('POST status', res.status);
    const created = await res.json().catch(() => null);
    console.log('POST body', created);
    if (!created || !created.id) throw new Error('Create failed');

    const id = created.id;

    // GET
    res = await fetch(base + `/api/interventions/${id}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('GET status', res.status);
    console.log('GET body', await res.json().catch(() => null));

    // PUT
    res = await fetch(base + `/api/interventions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status: 'completed' })
    });
    console.log('PUT status', res.status);
    console.log('PUT body', await res.json().catch(() => null));

    // DELETE
    res = await fetch(base + `/api/interventions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('DELETE status', res.status);
    console.log('DELETE body', await res.json().catch(() => null));

    console.log('Smoke test completed successfully');
  } catch (err) {
    console.error('Smoke test failed:', err && err.message);
    process.exit(2);
  }
}

run();

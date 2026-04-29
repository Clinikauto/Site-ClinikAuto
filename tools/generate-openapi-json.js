const fs = require('fs');
const path = require('path');
try {
  const yaml = require('js-yaml');
  const src = path.join(__dirname, '..', 'docs', 'openapi', 'crm.yaml');
  const dest = path.join(__dirname, '..', 'frontend', 'openapi.json');
  const content = fs.readFileSync(src, 'utf8');
  const doc = yaml.load(content);
  fs.writeFileSync(dest, JSON.stringify(doc, null, 2), 'utf8');
  console.log('Wrote', dest);
} catch (e) {
  console.error('Failed to generate openapi.json:', e && e.message);
  process.exit(1);
}

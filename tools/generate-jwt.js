const jwt = require('jsonwebtoken');

// Usage: node tools/generate-jwt.js [role] [secret]
// Example: node tools/generate-jwt.js admin mysecret

const role = process.argv[2] || 'admin';
const secret = process.argv[3] || process.env.JWT_SECRET || 'change-me-in-production';
const payload = {
  sub: 'test-user',
  role,
  iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log(token);

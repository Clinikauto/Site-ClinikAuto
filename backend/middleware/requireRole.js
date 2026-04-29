const jwt = require('jsonwebtoken');

module.exports = function requireRole(allowedRoles = []) {
  // allowedRoles: array of role strings. If empty, just require a valid token.
  return function (req, res, next) {
    try {
      const protect = String(process.env.PROTECT_API || '').trim().toLowerCase();
      if (!protect || ['0', 'false', 'no', 'off'].includes(protect)) {
        return next();
      }

      const auth = String(req.headers.authorization || '');
      if (!auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = auth.slice(7).trim();
      const secret = process.env.JWT_SECRET || 'change-me-in-production';
      const payload = jwt.verify(token, secret);
      if (!payload) return res.status(401).json({ error: 'Invalid token' });
      if (!allowedRoles || !allowedRoles.length) {
        req.user = payload;
        return next();
      }
      const role = String(payload.role || '').trim();
      if (allowedRoles.includes(role)) {
        req.user = payload;
        return next();
      }
      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized', detail: String(err && err.message) });
    }
  };
};

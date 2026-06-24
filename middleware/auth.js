const jwt = require('jsonwebtoken');
const config = require('../config');
const { getError } = require('../utils/errorCodes');
const { fail } = require('../utils/response');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function authMiddleware(requiredRoles = []) {
  return function (req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return fail(res, getError('UNAUTHORIZED'), 401);
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = decoded;

      if (requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
        return fail(res, getError('FORBIDDEN'), 403);
      }

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return fail(res, getError('TOKEN_EXPIRED'), 401);
      }
      return fail(res, getError('UNAUTHORIZED'), 401);
    }
  };
}

module.exports = { generateToken, authMiddleware };

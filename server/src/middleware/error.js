const { validationResult } = require('express-validator');

// Return 400 with the first validation error.
function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const e = result.array()[0];
    return res.status(400).json({ message: `${e.path}: ${e.msg}`, errors: result.array() });
  }
  next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ message: 'Not found' });
}

// Centralized error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || (err.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? 'Internal server error' : err.message });
}

module.exports = { validate, wrap, notFound, errorHandler };

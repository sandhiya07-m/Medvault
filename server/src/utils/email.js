const { body } = require('express-validator');

// Emails are only trimmed + lowercased. (express-validator's normalizeEmail() strips dots and
// "+tags" from Gmail addresses, which made the stored address differ from what the user typed.)
const emailChain = (field = 'email') =>
  body(field).trim().toLowerCase().isEmail().withMessage('Valid email required');

module.exports = { emailChain };

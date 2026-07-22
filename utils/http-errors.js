function statusForDatabaseError(error) {
  const message = String(error.sqlMessage || error.message || "").toLowerCase();
  if (/not found|does not exist|no invitation|no event|no user/.test(message)) return 404;
  if (/not authorized|not the current host|not.*group member|only.*host|permission|forbidden/.test(message)) return 403;
  if (/already|started|cancelled|canceled|completed|conflict|same host/.test(message)) return 409;
  return 400;
}

function safeDatabaseMessage(error, fallback = "Unable to complete request") {
  const message = String(error.sqlMessage || error.message || fallback);
  if (/password|credential|api[_ -]?key|secret|token/i.test(message)) return fallback;
  return message.slice(0, 240);
}

function sendDatabaseError(res, error, fallback) {
  return res.status(statusForDatabaseError(error)).json({ success: false, message: safeDatabaseMessage(error, fallback) });
}

module.exports = { safeDatabaseMessage, sendDatabaseError, statusForDatabaseError };

// backend/utils/respondError.js
//
// Centralizes how 500s are reported to the client. In production this
// stays a generic message — never leak internals to end users. Outside
// production (NODE_ENV unset/'development'), the real error message is
// included as `details` so a failure is self-diagnosing from the browser
// response/network tab instead of requiring a trip back to the server
// terminal every time.
function sendServerError(res, err, fallbackMessage, errorKey = 'message') {
  console.error(`${fallbackMessage}:`, err);

  const isProd = process.env.NODE_ENV === 'production';
  const body = { [errorKey]: fallbackMessage };

  if (!isProd) {
    body.details = err?.message || String(err);
  }

  return res.status(500).json(body);
}

module.exports = { sendServerError };

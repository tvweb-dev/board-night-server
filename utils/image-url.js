function normalizeImageUrl(value, fieldName) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).trim();
  if (normalized.length > 500) throw new Error(`${fieldName} must be at most 500 characters`);
  let url;
  try { url = new URL(normalized); } catch (_) { throw new Error(`${fieldName} must be a valid HTTP(S) URL`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${fieldName} must be a valid HTTP(S) URL`);
  return normalized;
}

module.exports = { normalizeImageUrl };

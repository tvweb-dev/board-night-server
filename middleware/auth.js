const crypto = require("crypto");

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ sub: String(userId), iat: now, exp: now + 60 * 60 * 24 * 7 }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error("Invalid token");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return payload;
}

function requireAuth(req, res, next) {
  const match = String(req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const payload = verifyToken(match[1]);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1) throw new Error("Invalid user");
    req.auth = { userId };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token" });
  }
}

module.exports = { requireAuth, signToken, verifyToken };

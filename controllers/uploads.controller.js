const { v2: cloudinary } = require("cloudinary");

const FOLDERS = {
  profile: "board-night/profiles",
  group: "board-night/groups",
  event: "board-night/events"
};

function createUploadSignatureHandler(environment = process.env, now = () => Math.floor(Date.now() / 1000)) {
  return function createUploadSignature(req, res) {
    const type = String(req.body && req.body.type || "").toLowerCase();
    if (!FOLDERS[type]) return res.status(400).json({ success: false, message: "Image type must be profile, group, or event" });
    const cloudName = environment.CLOUDINARY_CLOUD_NAME;
    const apiKey = environment.CLOUDINARY_API_KEY;
    const apiSecret = environment.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ success: false, message: "Image uploads are not configured" });
    const timestamp = now();
    const folder = FOLDERS[type];
    const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret);
    return res.json({
      success: true,
      message: "Upload signature created",
      data: { cloudName, apiKey, timestamp, folder, signature }
    });
  };
}

module.exports = { createUploadSignatureHandler };

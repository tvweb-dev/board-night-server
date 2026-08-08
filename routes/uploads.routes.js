const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createUploadSignatureHandler } = require("../controllers/uploads.controller");

const router = express.Router();
router.post("/signature", requireAuth, createUploadSignatureHandler());

module.exports = router;

const express = require("express");
const profilesController = require("../controllers/profiles.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, profilesController.createUserProfile);
router.get("/:userId", requireAuth, profilesController.readUserProfile);
router.put("/:userId", requireAuth, profilesController.updateUserProfile);

module.exports = router;

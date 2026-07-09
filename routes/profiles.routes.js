const express = require("express");
const profilesController = require("../controllers/profiles.controller");

const router = express.Router();

router.post("/", profilesController.createUserProfile);
router.get("/:userId", profilesController.readUserProfile);
router.put("/:userId", profilesController.updateUserProfile);

module.exports = router;

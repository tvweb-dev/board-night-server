const { pool } = require("../config/database");

const FIELD_LIMITS = {
  firstName: 100, lastName: 100, nickname: 100, imageUrl: 500,
  favoriteFood: 100, favoriteDrink: 100, allergies: 255,
  city: 100, province: 100, country: 100
};

function userId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeProfile(body = {}) {
  const profile = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = body[field] == null ? "" : String(body[field]).trim();
    if (value.length > limit) throw new Error(`${field} must be at most ${limit} characters`);
    profile[field] = value || null;
  }
  if (profile.imageUrl) {
    let url;
    try { url = new URL(profile.imageUrl); } catch (_) { throw new Error("imageUrl must be a valid HTTP(S) URL"); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("imageUrl must be a valid HTTP(S) URL");
  }
  if (body.birthday) {
    const birthday = String(body.birthday);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(`${birthday}T00:00:00Z`))) {
      throw new Error("birthday must be a valid date");
    }
    profile.birthday = birthday;
  } else {
    profile.birthday = null;
  }
  return profile;
}

function databaseError(res, error) {
  const validation = !error.sqlMessage;
  return res.status(validation ? 400 : 500).json({
    success: false,
    message: validation ? error.message : "Unable to save profile"
  });
}

function createProfileHandlers(database = pool) {
  async function readProfile(id) {
    const [rows] = await database.query(
      `SELECT u.USER_ID, u.EMAIL, up.FIRST_NAME, up.LAST_NAME, up.NICKNAME,
              up.IMAGE_URL, up.BIRTHDAY, up.FAVORITE_FOOD, up.FAVORITE_DRINK,
              up.ALLERGIES, up.CITY, up.PROVINCE, up.COUNTRY
         FROM users u
         LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID
        WHERE u.USER_ID = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async function save(req, res) {
    const requestedId = req.params.userId ? userId(req.params.userId) : req.auth.userId;
    if (!requestedId) return res.status(400).json({ success: false, message: "A valid user ID is required" });
    if (requestedId !== req.auth.userId) {
      return res.status(403).json({ success: false, message: "You can only update your own profile" });
    }

    try {
      const profile = normalizeProfile(req.body);
      await database.query(
        `INSERT INTO user_profile
          (USER_ID, FIRST_NAME, LAST_NAME, NICKNAME, IMAGE_URL, BIRTHDAY,
           FAVORITE_FOOD, FAVORITE_DRINK, ALLERGIES, CITY, PROVINCE, COUNTRY)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           FIRST_NAME = VALUES(FIRST_NAME), LAST_NAME = VALUES(LAST_NAME),
           NICKNAME = VALUES(NICKNAME), IMAGE_URL = VALUES(IMAGE_URL),
           BIRTHDAY = VALUES(BIRTHDAY), FAVORITE_FOOD = VALUES(FAVORITE_FOOD),
           FAVORITE_DRINK = VALUES(FAVORITE_DRINK), ALLERGIES = VALUES(ALLERGIES),
           CITY = VALUES(CITY), PROVINCE = VALUES(PROVINCE), COUNTRY = VALUES(COUNTRY)`,
        [requestedId, profile.firstName, profile.lastName, profile.nickname, profile.imageUrl,
          profile.birthday, profile.favoriteFood, profile.favoriteDrink, profile.allergies,
          profile.city, profile.province, profile.country]
      );
      return res.json({ success: true, message: "Profile saved successfully", data: await readProfile(requestedId) });
    } catch (error) {
      return databaseError(res, error);
    }
  }

  return {
    save,
    async read(req, res) {
      const requestedId = userId(req.params.userId);
      if (!requestedId) return res.status(400).json({ success: false, message: "A valid user ID is required" });
      try {
        const profile = await readProfile(requestedId);
        if (!profile) return res.status(404).json({ success: false, message: "User not found" });
        return res.json({ success: true, message: "Profile loaded successfully", data: profile });
      } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to load profile" });
      }
    }
  };
}

const handlers = createProfileHandlers();
module.exports = {
  createUserProfile: handlers.save,
  readUserProfile: handlers.read,
  updateUserProfile: handlers.save,
  createProfileHandlers,
  normalizeProfile
};

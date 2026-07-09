require("dotenv").config();

const { pool } = require("../config/database");

const statements = [
  "DROP PROCEDURE IF EXISTS CreateUserProfile",
  "DROP PROCEDURE IF EXISTS ReadUserProfile",
  "DROP PROCEDURE IF EXISTS UpdateUserProfile",
  "DROP PROCEDURE IF EXISTS CreateGame",
  "DROP PROCEDURE IF EXISTS ReadGames",
  "DROP PROCEDURE IF EXISTS AddFavoriteGame",
  "DROP PROCEDURE IF EXISTS RemoveFavoriteGame",
  "DROP PROCEDURE IF EXISTS ReadUserFavoriteGames",
  `CREATE PROCEDURE CreateUserProfile(
    IN p_user_id INT,
    IN p_first_name VARCHAR(100),
    IN p_last_name VARCHAR(100),
    IN p_nickname VARCHAR(100),
    IN p_image_url VARCHAR(500),
    IN p_birthday DATE,
    IN p_favorite_food VARCHAR(100),
    IN p_favorite_drink VARCHAR(100),
    IN p_allergies VARCHAR(255),
    IN p_city VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_country VARCHAR(100)
  )
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE USER_ID = p_user_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User does not exist';
    END IF;

    IF EXISTS (SELECT 1 FROM user_profile WHERE USER_ID = p_user_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Profile already exists for this user';
    END IF;

    INSERT INTO user_profile (
      USER_ID, FIRST_NAME, LAST_NAME, NICKNAME, IMAGE_URL,
      BIRTHDAY, FAVORITE_FOOD, FAVORITE_DRINK, ALLERGIES,
      CITY, PROVINCE, COUNTRY
    )
    VALUES (
      p_user_id, p_first_name, p_last_name, p_nickname, p_image_url,
      p_birthday, p_favorite_food, p_favorite_drink, p_allergies,
      p_city, p_province, p_country
    );

    SELECT LAST_INSERT_ID() AS PROFILE_ID;
  END`,
  `CREATE PROCEDURE ReadUserProfile(
    IN p_user_id INT
  )
  BEGIN
    SELECT *
    FROM user_profile
    WHERE USER_ID = p_user_id;
  END`,
  `CREATE PROCEDURE UpdateUserProfile(
    IN p_user_id INT,
    IN p_first_name VARCHAR(100),
    IN p_last_name VARCHAR(100),
    IN p_nickname VARCHAR(100),
    IN p_image_url VARCHAR(500),
    IN p_birthday DATE,
    IN p_favorite_food VARCHAR(100),
    IN p_favorite_drink VARCHAR(100),
    IN p_allergies VARCHAR(255),
    IN p_city VARCHAR(100),
    IN p_province VARCHAR(100),
    IN p_country VARCHAR(100)
  )
  BEGIN
    UPDATE user_profile
    SET
      FIRST_NAME = p_first_name,
      LAST_NAME = p_last_name,
      NICKNAME = p_nickname,
      IMAGE_URL = p_image_url,
      BIRTHDAY = p_birthday,
      FAVORITE_FOOD = p_favorite_food,
      FAVORITE_DRINK = p_favorite_drink,
      ALLERGIES = p_allergies,
      CITY = p_city,
      PROVINCE = p_province,
      COUNTRY = p_country
    WHERE USER_ID = p_user_id;

    SELECT 'PROFILE_UPDATED' AS MESSAGE;
  END`,
  `CREATE PROCEDURE CreateGame(
    IN p_game_name VARCHAR(225),
    IN p_category VARCHAR(100)
  )
  BEGIN
    INSERT INTO games (GAME_NAME, CATEGORY)
    VALUES (p_game_name, p_category);

    SELECT LAST_INSERT_ID() AS GAME_ID;
  END`,
  `CREATE PROCEDURE ReadGames()
  BEGIN
    SELECT *
    FROM games
    ORDER BY GAME_NAME ASC;
  END`,
  `CREATE PROCEDURE AddFavoriteGame(
    IN p_user_id INT,
    IN p_game_id INT
  )
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE USER_ID = p_user_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User does not exist';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM games WHERE GAME_ID = p_game_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game does not exist';
    END IF;

    INSERT INTO user_favorite_games (USER_ID, GAME_ID)
    VALUES (p_user_id, p_game_id);

    SELECT 'FAVORITE_GAME_ADDED' AS MESSAGE;
  END`,
  `CREATE PROCEDURE RemoveFavoriteGame(
    IN p_user_id INT,
    IN p_game_id INT
  )
  BEGIN
    DELETE FROM user_favorite_games
    WHERE USER_ID = p_user_id
      AND GAME_ID = p_game_id;

    SELECT 'FAVORITE_GAME_REMOVED' AS MESSAGE;
  END`,
  `CREATE PROCEDURE ReadUserFavoriteGames(
    IN p_user_id INT
  )
  BEGIN
    SELECT
      ufg.USER_ID,
      g.GAME_ID,
      g.GAME_NAME,
      g.CATEGORY
    FROM user_favorite_games ufg
    JOIN games g ON ufg.GAME_ID = g.GAME_ID
    WHERE ufg.USER_ID = p_user_id
    ORDER BY g.GAME_NAME ASC;
  END`
];

async function install() {
  try {
    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log("Profile and game stored procedures installed.");
  } finally {
    await pool.end();
  }
}

install().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

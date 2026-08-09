require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const { pool } = require("../config/database");

const emailColumns = `
  ei.INVITE_ID,
  ei.EMAIL_STATUS,
  ei.EMAIL_SENT_AT,
  ei.EMAIL_MESSAGE_ID,
  ei.EMAIL_ERROR`;

const statements = [
  "ALTER TABLE event_invites MODIFY EMAIL_ERROR VARCHAR(500) NULL",
  "DROP PROCEDURE IF EXISTS ReadInviteEmailStatus",
  `CREATE PROCEDURE ReadInviteEmailStatus(
    IN p_invite_id INT,
    IN p_requesting_user_id INT
  )
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM event_invites ei
      JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id AND e.HOST_ID = p_requesting_user_id
    ) THEN
      IF EXISTS (SELECT 1 FROM event_invites WHERE INVITE_ID = p_invite_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requesting user is not the current host';
      END IF;
    ELSE
      SELECT ${emailColumns} FROM event_invites ei WHERE ei.INVITE_ID = p_invite_id;
    END IF;
  END`,
  "DROP PROCEDURE IF EXISTS UpdateInviteEmailDetails",
  `CREATE PROCEDURE UpdateInviteEmailDetails(
    IN p_invite_id INT,
    IN p_requesting_user_id INT,
    IN p_email_status VARCHAR(20),
    IN p_email_sent_at DATETIME,
    IN p_email_message_id VARCHAR(255),
    IN p_email_error VARCHAR(500)
  )
  BEGIN
    IF UPPER(p_email_status) NOT IN ('NOT_SENT', 'SENDING', 'SENT', 'FAILED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid email status';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM event_invites ei
      JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id AND e.HOST_ID = p_requesting_user_id
    ) THEN
      IF EXISTS (SELECT 1 FROM event_invites WHERE INVITE_ID = p_invite_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requesting user is not the current host';
      END IF;
    ELSE
      UPDATE event_invites
      SET EMAIL_STATUS = UPPER(p_email_status), EMAIL_SENT_AT = p_email_sent_at,
          EMAIL_MESSAGE_ID = p_email_message_id, EMAIL_ERROR = LEFT(p_email_error, 500), UPDATED_AT = NOW()
      WHERE INVITE_ID = p_invite_id;
      SELECT ${emailColumns} FROM event_invites ei WHERE ei.INVITE_ID = p_invite_id;
    END IF;
  END`,
  "DROP PROCEDURE IF EXISTS ReadInviteForEmail",
  `CREATE PROCEDURE ReadInviteForEmail(
    IN p_invite_id INT,
    IN p_requesting_user_id INT
  )
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM event_invites WHERE INVITE_ID = p_invite_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invitation does not exist';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM event_invites ei JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id AND e.HOST_ID = p_requesting_user_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the current event host can send this invitation';
    END IF;

    SELECT ei.INVITE_ID, ei.EVENT_ID, ei.USER_ID, ei.RSVP_STATUS, ei.EMAIL_STATUS,
           ei.EMAIL_SENT_AT, ei.EMAIL_MESSAGE_ID, ei.EMAIL_ERROR, ei.UPDATED_AT AS EMAIL_UPDATED_AT,
           e.EVENT_TITLE, e.EVENT_DESCRIPTION, e.EVENT_DATE, e.EVENT_TIME, e.EVENT_LOCATION,
           e.EVENT_STATUS, e.HOST_ID, game.GAME_NAME,
           u.EMAIL AS RECIPIENT_EMAIL, up.FIRST_NAME AS RECIPIENT_FIRST_NAME,
           up.LAST_NAME AS RECIPIENT_LAST_NAME, hu.EMAIL AS HOST_EMAIL,
           COALESCE(hp.NICKNAME, hp.FIRST_NAME, hu.EMAIL) AS HOST_NAME,
           hp.FIRST_NAME AS HOST_FIRST_NAME, hp.LAST_NAME AS HOST_LAST_NAME
      FROM event_invites ei
      JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      JOIN users u ON u.USER_ID = ei.USER_ID
      LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID
      JOIN users hu ON hu.USER_ID = e.HOST_ID
      LEFT JOIN user_profile hp ON hp.USER_ID = hu.USER_ID
      LEFT JOIN games game ON game.GAME_ID = e.GAME_ID
     WHERE ei.INVITE_ID = p_invite_id;
  END`,
  "DROP PROCEDURE IF EXISTS UpdateInviteEmailStatus",
  `CREATE PROCEDURE UpdateInviteEmailStatus(
    IN p_invite_id INT,
    IN p_requesting_user_id INT,
    IN p_email_status VARCHAR(20),
    IN p_email_message_id VARCHAR(255),
    IN p_email_error VARCHAR(500)
  )
  BEGIN
    DECLARE v_email_status VARCHAR(20);
    DECLARE v_email_sent_at DATETIME;
    DECLARE v_updated_at DATETIME;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;

    IF NOT EXISTS (
      SELECT 1 FROM event_invites ei JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id AND e.HOST_ID = p_requesting_user_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invitation not found or user is not the event host';
    END IF;
    IF UPPER(p_email_status) NOT IN ('NOT_SENT', 'SENDING', 'SENT', 'FAILED') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid email status';
    END IF;

    START TRANSACTION;
    SELECT EMAIL_STATUS, EMAIL_SENT_AT, UPDATED_AT
      INTO v_email_status, v_email_sent_at, v_updated_at
      FROM event_invites WHERE INVITE_ID = p_invite_id FOR UPDATE;

    IF UPPER(p_email_status) = 'SENDING'
       AND ((v_email_status = 'SENDING' AND v_updated_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE))
         OR (v_email_status = 'SENT' AND v_email_sent_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE))) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invitation email resend cooldown is active';
    END IF;

    UPDATE event_invites
       SET EMAIL_STATUS = UPPER(p_email_status),
           EMAIL_SENT_AT = CASE WHEN UPPER(p_email_status) = 'SENT' THEN NOW() ELSE EMAIL_SENT_AT END,
           EMAIL_MESSAGE_ID = CASE WHEN UPPER(p_email_status) = 'SENT' THEN p_email_message_id ELSE EMAIL_MESSAGE_ID END,
           EMAIL_ERROR = CASE WHEN UPPER(p_email_status) = 'FAILED' THEN LEFT(p_email_error, 500) ELSE NULL END,
           UPDATED_AT = NOW()
     WHERE INVITE_ID = p_invite_id;

    COMMIT;

    SELECT INVITE_ID, EVENT_ID, USER_ID, RSVP_STATUS, EMAIL_STATUS,
           EMAIL_SENT_AT, EMAIL_MESSAGE_ID, EMAIL_ERROR
      FROM event_invites WHERE INVITE_ID = p_invite_id;
  END`
];

async function install(database = pool) {
  for (const statement of statements) await database.query(statement);
}

if (require.main === module) {
  install()
    .then(() => console.log("Invitation email procedures installed."))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { emailColumns, install, statements };

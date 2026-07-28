require("dotenv").config();

const { pool } = require("../config/database");

const emailColumns = `
  ei.INVITE_ID,
  ei.EMAIL_STATUS,
  ei.EMAIL_SENT_AT,
  ei.EMAIL_MESSAGE_ID,
  ei.EMAIL_ERROR`;

const statements = [
  "DROP PROCEDURE IF EXISTS ReadInviteEmailStatus",
  `CREATE PROCEDURE ReadInviteEmailStatus(
    IN p_invite_id INT,
    IN p_requesting_user_id INT
  )
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM event_invites ei
      JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id
        AND e.HOST_ID = p_requesting_user_id
    ) THEN
      IF EXISTS (SELECT 1 FROM event_invites WHERE INVITE_ID = p_invite_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requesting user is not the current host';
      END IF;
    ELSE
      SELECT ${emailColumns}
      FROM event_invites ei
      WHERE ei.INVITE_ID = p_invite_id;
    END IF;
  END`,
  "DROP PROCEDURE IF EXISTS UpdateInviteEmailDetails",
  `CREATE PROCEDURE UpdateInviteEmailDetails(
    IN p_invite_id INT,
    IN p_requesting_user_id INT,
    IN p_email_status VARCHAR(20),
    IN p_email_sent_at DATETIME,
    IN p_email_message_id VARCHAR(255),
    IN p_email_error VARCHAR(2000)
  )
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM event_invites ei
      JOIN events e ON e.EVENT_ID = ei.EVENT_ID
      WHERE ei.INVITE_ID = p_invite_id
        AND e.HOST_ID = p_requesting_user_id
    ) THEN
      IF EXISTS (SELECT 1 FROM event_invites WHERE INVITE_ID = p_invite_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requesting user is not the current host';
      END IF;
    ELSE
      UPDATE event_invites
      SET EMAIL_STATUS = p_email_status,
          EMAIL_SENT_AT = p_email_sent_at,
          EMAIL_MESSAGE_ID = p_email_message_id,
          EMAIL_ERROR = p_email_error
      WHERE INVITE_ID = p_invite_id;

      SELECT ${emailColumns}
      FROM event_invites ei
      WHERE ei.INVITE_ID = p_invite_id;
    END IF;
  END`
];

async function install() {
  try {
    for (const statement of statements) await pool.query(statement);
    console.log("Invitation email status procedures installed.");
  } finally {
    await pool.end();
  }
}

install().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

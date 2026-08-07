require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const { pool } = require("../config/database");

const statements = [
  "DROP PROCEDURE IF EXISTS CreateEvent",
  `CREATE PROCEDURE CreateEvent(
    IN p_group_id INT,
    IN p_host_id INT,
    IN p_event_title VARCHAR(255),
    IN p_event_description VARCHAR(2000),
    IN p_event_date DATE,
    IN p_event_time TIME,
    IN p_event_location VARCHAR(255)
  )
  BEGIN
    DECLARE v_event_id INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
      ROLLBACK;
      RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO events (
      GROUP_ID, HOST_ID, EVENT_TITLE, EVENT_DESCRIPTION, EVENT_DATE, EVENT_TIME, EVENT_LOCATION
    ) VALUES (
      p_group_id, p_host_id, p_event_title, p_event_description, p_event_date, p_event_time, p_event_location
    );

    SET v_event_id = LAST_INSERT_ID();

    INSERT INTO event_invites (EVENT_ID, USER_ID, RSVP_STATUS, UPDATED_AT)
    VALUES (v_event_id, p_host_id, 'GOING', NOW());

    COMMIT;

    SELECT
      e.*,
      ei.RSVP_STATUS AS HOST_RSVP_STATUS
    FROM events e
    JOIN event_invites ei
      ON ei.EVENT_ID = e.EVENT_ID AND ei.USER_ID = e.HOST_ID
    WHERE e.EVENT_ID = v_event_id;
  END`
];

async function install() {
  try {
    for (const statement of statements) await pool.query(statement);
    console.log("CreateEvent host RSVP procedure installed.");
  } finally {
    await pool.end();
  }
}

install().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

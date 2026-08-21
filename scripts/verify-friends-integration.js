require("dotenv").config({
  path: process.env.BOARD_NIGHT_ENV_FILE || ".env",
  override: true
});

const { pool } = require("../config/database");
const { ensureFriendsSchema } = require("../data/friends.schema");
const { friendsHandlers } = require("../controllers/friends.controller");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function verify() {
  await ensureFriendsSchema(pool);
  const [tables] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'direct_friends'`
  );
  if (!tables.length) throw new Error("direct_friends table was not created");

  const [users] = await pool.query("SELECT USER_ID FROM users ORDER BY USER_ID LIMIT 2");
  if (users.length < 2) throw new Error("At least two existing users are required for the integration check");

  const firstId = Number(users[0].USER_ID);
  const secondId = Number(users[1].USER_ID);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "DELETE FROM direct_friends WHERE (USER_ID = ? AND FRIEND_USER_ID = ?) OR (USER_ID = ? AND FRIEND_USER_ID = ?)",
      [firstId, secondId, secondId, firstId]
    );

    const handlers = friendsHandlers(connection);
    const addResponse = response();
    await handlers.add({ auth: { userId: firstId }, body: { friendQuery: String(secondId) } }, addResponse);
    if (addResponse.statusCode !== 201) throw new Error(`Add friend returned HTTP ${addResponse.statusCode}: ${addResponse.body && addResponse.body.message}`);

    const [savedRows] = await connection.query(
      "SELECT USER_ID, FRIEND_USER_ID FROM direct_friends WHERE (USER_ID = ? AND FRIEND_USER_ID = ?) OR (USER_ID = ? AND FRIEND_USER_ID = ?)",
      [firstId, secondId, secondId, firstId]
    );
    if (savedRows.length !== 2) throw new Error("Mutual friendship rows were not stored");

    const listResponse = response();
    await handlers.list({ auth: { userId: firstId } }, listResponse);
    if (listResponse.statusCode !== 200 || !listResponse.body.data.some((friend) => Number(friend.USER_ID) === secondId)) {
      throw new Error("New friendship was not returned by the friends list");
    }

    console.log(JSON.stringify({
      schema: "present",
      addEndpoint: "passed",
      mutualRows: savedRows.length,
      listEndpoint: "passed",
      transaction: "rolled back"
    }));
  } finally {
    await connection.rollback();
    connection.release();
    await pool.end();
  }
}

verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

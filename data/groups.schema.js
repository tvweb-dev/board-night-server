async function ensureGroupLifecycleSchema(database) {
  const columns = [
    ["IS_ACTIVE", "TINYINT(1) NOT NULL DEFAULT 1"],
    ["INACTIVATED_AT", "DATETIME NULL"],
    ["REACTIVATED_FROM_GROUP_ID", "INT NULL"]
  ];

  for (const [column, definition] of columns) {
    const [rows] = await database.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = ?`,
      [column]
    );
    if (!rows.length) await database.query(`ALTER TABLE \`groups\` ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = { ensureGroupLifecycleSchema };

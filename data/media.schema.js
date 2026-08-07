async function ensureColumn(database, tableName, columnName) {
  const [rows] = await database.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (!rows.length) await database.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` VARCHAR(500) NULL`);
}

async function ensureMediaSchema(database) {
  await ensureColumn(database, "events", "EVENT_IMAGE_URL");
  await ensureColumn(database, "groups", "GROUP_IMAGE_URL");
}

module.exports = { ensureMediaSchema };

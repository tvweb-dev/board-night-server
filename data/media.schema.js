async function ensureColumn(database, tableName, columnName, definition = "VARCHAR(500) NULL") {
  const [rows] = await database.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (!rows.length) await database.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function ensureMediaSchema(database) {
  await ensureColumn(database, "events", "EVENT_IMAGE_URL");
  await ensureColumn(database, "groups", "GROUP_IMAGE_URL");
  await ensureColumn(database, "events", "REHOSTED_FROM_EVENT_ID", "INT NULL");
}

module.exports = { ensureMediaSchema };

async function removePlaceholderUsers(database) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query(
      "SELECT USER_ID FROM users WHERE EMAIL LIKE ? FOR UPDATE",
      ["%@board-night.local"]
    );
    if (users.length) {
      const ids = users.map((user) => user.USER_ID);
      await connection.query("DELETE FROM group_members WHERE USER_ID IN (?)", [ids]);
      await connection.query("DELETE FROM users WHERE USER_ID IN (?)", [ids]);
    }
    await connection.commit();
    return users.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { removePlaceholderUsers };

function displayName(row) {
  return row.NICKNAME || row.FIRST_NAME || row.EMAIL || `User ${row.USER_ID}`;
}

async function createNotification(db, { userId, type, title, message, groupId = null, eventId = null, actorUserId = null }) {
  await db.query(
    `INSERT INTO notifications
      (USER_ID, TYPE, TITLE, MESSAGE, GROUP_ID, EVENT_ID, ACTOR_USER_ID, IS_READ, CREATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
    [userId, type, title, message, groupId, eventId, actorUserId]
  );
}

async function notifyGroupMemberAdded(db, { userId, groupId, actorUserId }) {
  const [groups] = await db.query("SELECT GROUP_NAME FROM `groups` WHERE GROUP_ID = ?", [groupId]);
  const groupName = groups[0] && groups[0].GROUP_NAME || "a group";
  return createNotification(db, {
    userId, type: "GROUP_MEMBER_ADDED", title: "Added to a group",
    message: `You were added to ${groupName}.`, groupId, actorUserId
  });
}

async function notifyEventInvite(db, { userId, eventId, actorUserId }) {
  const [events] = await db.query("SELECT GROUP_ID, EVENT_TITLE FROM events WHERE EVENT_ID = ?", [eventId]);
  const event = events[0] || {};
  return createNotification(db, {
    userId, type: "EVENT_INVITE", title: "Event invitation",
    message: `You were invited to ${event.EVENT_TITLE || "an event"}.`,
    groupId: event.GROUP_ID || null, eventId, actorUserId
  });
}

async function notifyRsvpChanged(db, { inviteId, actorUserId, rsvpStatus }) {
  const [contextRows] = await db.query(
    `SELECT e.EVENT_ID, e.GROUP_ID, e.EVENT_TITLE, u.USER_ID, u.EMAIL,
            up.FIRST_NAME, up.NICKNAME
       FROM event_invites ei
       JOIN events e ON e.EVENT_ID = ei.EVENT_ID
       JOIN users u ON u.USER_ID = ei.USER_ID
       LEFT JOIN user_profile up ON up.USER_ID = u.USER_ID
      WHERE ei.INVITE_ID = ?`,
    [inviteId]
  );
  const context = contextRows[0];
  if (!context) return;

  const labels = { GOING: "going", MAYBE: "maybe going", NOT_GOING: "not going", PENDING: "pending" };
  const name = displayName(context);
  const eventTitle = context.EVENT_TITLE || "the event";
  const [members] = await db.query("SELECT USER_ID FROM group_members WHERE GROUP_ID = ?", [context.GROUP_ID]);
  const recipients = new Set(members.map((member) => Number(member.USER_ID)));
  recipients.add(Number(actorUserId));

  for (const userId of recipients) {
    const own = userId === Number(actorUserId);
    await createNotification(db, {
      userId,
      type: "RSVP_CHANGED",
      title: "RSVP updated",
      message: own
        ? `You are ${labels[rsvpStatus]} to ${eventTitle}.`
        : `${name} is ${labels[rsvpStatus]} to ${eventTitle}.`,
      groupId: context.GROUP_ID,
      eventId: context.EVENT_ID,
      actorUserId
    });
  }
}

module.exports = { createNotification, notifyGroupMemberAdded, notifyEventInvite, notifyRsvpChanged };

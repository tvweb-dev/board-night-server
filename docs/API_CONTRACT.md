# Board Night API Contract - MVP v1

Base URL:

```txt
http://localhost:3000
```

Response format:

Success:

```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": {}
}
```

## Game Catalogue

All catalogue read and favourite endpoints require `Authorization: Bearer <token>`.
`POST /api/games` is disabled for application clients and returns HTTP 403.

### Search Games

`GET /api/games/search?q=catan&limit=25`

`q` is required and is matched case-insensitively against partial game names. Exact
matches are returned first, followed by prefix and contains matches, then popularity
and name. `limit` defaults to 25 and must be between 1 and 50. Results include
`GAME_ID`, `GAME_NAME`, `CATEGORY`, `THUMBNAIL_URL`, player counts, playtimes,
`MIN_AGE`, `AVERAGE_RATING`, and `USERS_RATED`.

### Read Game Details

`GET /api/games/:gameId`

Returns the expanded catalogue record. `RULES_URL` and other imported metadata may
be `null`; the API does not synthesize missing values.

### Favourite Games

```text
GET    /api/games/favorites/:userId
POST   /api/games/favorites
DELETE /api/games/favorites
PUT    /api/games/favorites/:userId
```

Favourite reads remain visible to authenticated users and include catalogue images,
player counts, playtimes, age, and rating. Writes always use the authenticated user.
The legacy `userId` request field is accepted only when it matches the token owner.

`GET /api/games` remains available for existing clients, returns only `GAME_ID`,
`GAME_NAME`, and `CATEGORY`, and is deprecated for selectors in favor of `/search`.

Error:

```json
{
  "success": false,
  "message": "Error message here"
}
```

## Users

### Create User

POST /api/users

Body:

```json
{
  "email": "host@test.com",
  "password": "password123"
}
```

Uses procedure:
CreateUser

Success:

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "USER_ID": 1
  }
}
```

### Login User

POST /api/users/login

Body:

```json
{
  "email": "host@test.com",
  "password": "password123"
}
```

Uses procedure:
LoginUser

Success:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "USER_ID": 1,
    "EMAIL": "host@test.com",
    "LAST_LOGIN": "2026-07-08T00:00:00.000Z",
    "CREATED_AT": "2026-07-08T00:00:00.000Z"
  }
}
```

## Friends

All friend endpoints require a bearer token. Friends include both accepted group
members and users added directly, with duplicates merged in the list response.

### Add Friend

POST /api/friends

Body:

```json
{
  "friendQuery": "MeepleFan"
}
```

`friendQuery` must exactly match a user ID, full profile name, nickname, or email
(case-insensitive except for numeric IDs). If a name or nickname matches more than
one account, the API returns `409` and the user must enter an email or user ID.
Adding a friend makes the friendship visible to both users. Repeating the request
is safe and returns `200`; a new friendship returns `201`.

### List Friends

GET /api/friends

Returns direct friends and friends derived from shared groups. Each result includes
profile fields, `SHARED_GROUP_COUNT`, `FRIENDS_SINCE`, `IS_HIDDEN`, and
`FRIEND_NOTE`.

## Groups

### Create Group

POST /api/groups

Body:

```json
{
  "groupName": "Friday Board Night",
  "createdBy": 1
}
```

Uses procedure:
CreateGroup

Success:

```json
{
  "success": true,
  "message": "Group created successfully",
  "data": {
    "GROUP_ID": 1
  }
}
```

### Get User Groups

GET /api/groups/user/1

Uses procedure:
ReadUserGroups

### Add Group Member

POST /api/groups/members

Body:

```json
{
  "groupId": 1,
  "userId": 2,
  "memberRole": "MEMBER"
}
```

Uses procedure:
AddGroupMember

### Get Group Members

GET /api/groups/1/members

Uses procedure:
ReadGroupMembers

## Events

### Create Event

POST /api/events

Requires `Authorization: Bearer <token>`. The authenticated user becomes the host;
any `hostId` in the request body is ignored. An optional `Idempotency-Key` header can
be supplied by the frontend to safely retry the same creation request.

Body:

```json
{
  "groupId": 1,
  "eventTitle": "Friday Game Night",
  "eventDescription": "Bring your favourite strategy game.",
  "eventDate": "2026-08-14",
  "eventTime": "19:00",
  "eventLocation": "123 Main Street"
}
```

Uses procedure:
CreateEvent

An optional `gameId` may be omitted or set to `null`; those requests continue using
the original seven-parameter `CreateEvent`. A positive `gameId` uses
`CreateEventWithGame` after the game is validated. The host's RSVP remains `GOING`.
The verified procedure order is group, host, title, description, game ID, date, time,
and location.

### Read Event Details

`GET /api/events/:eventId` requires authentication. It preserves existing event
fields and adds nullable `GAME_ID` and `GAME`. `GAME` is `null` when no game is
selected; otherwise it contains the selected catalogue metadata. `RULES_URL` may be
`null`.

### Change Event Game

`PATCH /api/events/:eventId/game` requires authentication and accepts either:

```json
{ "gameId": 123 }
```

or `{ "gameId": null }` to remove the selection. Only the current event host may
change it, and cancelled, completed, or already-started events cannot be modified.

`eventDescription` is optional. Missing, null, or blank descriptions are stored as
`NULL`; nonblank descriptions are trimmed and may contain at most 2000 characters.
The procedure creates the event and the host's `GOING` RSVP atomically. The response
contains the created record in both `event` and the legacy `data` field, including
`EVENT_DESCRIPTION` and `HOST_RSVP_STATUS: "GOING"`. It does not send an invitation email.

### Get Group Events

GET /api/events/group/1

Uses procedure:
ReadGroupEvents

### Get Event RSVPs

GET /api/events/1/rsvps

Uses procedure:
ReadEventRSVPs

## Invites

### Create Invite

POST /api/invites

Body:

```json
{
  "eventId": 1,
  "userId": 2
}
```

Uses procedure:
CreateInvite

### Update RSVP

PUT /api/invites/rsvp

Allowed statuses:
GOING
MAYBE
NOT_GOING
PENDING

Body:

```json
{
  "inviteId": 1,
  "rsvpStatus": "GOING"
}
```

Uses procedure:
UpdateRSVP

Updating an RSVP creates an in-app notification for the responding user and every
other member of the event's group. Status text is rendered as going, maybe going,
not going, or pending.

## Notifications

All notification endpoints require a bearer token. Adding a group member notifies
that member, and creating a new event invite notifies the invitee.

```text
GET /api/notifications
GET /api/notifications?unread=true
PATCH /api/notifications/:notificationId/read
PATCH /api/notifications/read-all
```

Run `npm run db:install:notifications` once per database before using these endpoints.

### Read Invite Email Status

GET /api/invites/1/email-status

Requires `Authorization: Bearer <token>`. Only the event's current host may read it.

Uses procedure:
ReadInviteEmailStatus

Returns `INVITE_ID`, `EMAIL_STATUS`, `EMAIL_SENT_AT`, `EMAIL_MESSAGE_ID`, and
`EMAIL_ERROR`.

### Update Invite Email Status

PUT /api/invites/1/email-status

Requires `Authorization: Bearer <token>`. Only the event's current host may update it.

Body:

```json
{
  "emailStatus": "SENT",
  "emailSentAt": "2026-07-28T20:00:00Z",
  "emailMessageId": "provider-message-id",
  "emailError": null
}
```

Allowed statuses are `NOT_SENT`, `SENDING`, `SENT`, and `FAILED`. The other three
fields may be `null`.

Uses procedure:
UpdateInviteEmailDetails

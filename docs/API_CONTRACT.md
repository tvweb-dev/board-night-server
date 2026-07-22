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
  "eventTitle": "Catan Night",
  "eventDate": "2026-07-15",
  "eventTime": "19:00:00",
  "eventLocation": "Library Room A"
}
```

Uses procedure:
CreateEvent

The procedure creates the event and the host's `GOING` RSVP atomically. The response
contains the created record in both `event` and the legacy `data` field, including
`HOST_RSVP_STATUS: "GOING"`. It does not send an invitation email.

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

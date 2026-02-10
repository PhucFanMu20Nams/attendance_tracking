# API Specification — Attendance Web App (v2.5)

Base URL: /api  
Protocol: HTTP/HTTPS + JSON  
Auth: JWT (Header: Authorization: Bearer <token>)  
Timezone: Asia/Ho_Chi_Minh (GMT+7) — ALL dateKey computations must follow RULES.md

## Global Conventions

### Error format (all endpoints)
{ "message": "..." }

### Security rules (MUST)
- Never return raw DB objects.
- Never return sensitive fields (passwordHash, tokens, __v).
- Enforce RBAC + anti-IDOR on every route with :id.
- Whitelist request body fields (avoid mass assignment).
- Deny-by-default on authorization.

### Pagination convention (v2.3+)
For endpoints supporting pagination, the following query params and response format apply:

Query params:
- page: number (default 1, minimum 1)
- limit: number (default 20, maximum 100)

Response format:
```json
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

Pagination rules:
- `totalPages = 0` when `total = 0` (no items found)
- `page` is clamped to `[1, totalPages]` to prevent out-of-bounds requests
- If requested page exceeds totalPages, the clamped page is returned

Paginated endpoints:
- GET /admin/users (v2.3)
- GET /requests/me (v2.4)
- GET /requests/pending (v2.4)
- GET /attendance/today (v2.5)

---

# 1) Auth

## POST /auth/login
Login using email OR username.

Request body:
- identifier: string (email OR username)
- password: string

Response:
- token: string
- user: {
  _id,
  employeeCode,
  name,
  email,
  username,
  role,        // ADMIN | MANAGER | EMPLOYEE
  teamId,
  isActive,
  startDate
}

## GET /auth/me
Headers:
- Authorization: Bearer <token>

Response:
- user: {
  _id,
  employeeCode,
  name,
  email,
  username,
  role,
  teamId,
  isActive,
  startDate
}

---

# 2) Attendance

## POST /attendance/check-in
Roles: EMPLOYEE | MANAGER | ADMIN

Behavior:
- Compute today (GMT+7) => dateKey "YYYY-MM-DD"
- Upsert attendance by (userId, dateKey)
- If checkInAt already exists => 400 "Already checked in"

Response:
- attendance: {
  _id,
  userId,
  date,        // dateKey
  checkInAt,
  checkOutAt,  // null if not checked out
  otApproved   // boolean (NEW v2.6) - true if OT_REQUEST approved for this date
}

## POST /attendance/check-out
Roles: EMPLOYEE | MANAGER | ADMIN

Behavior:
- Compute today (GMT+7) => dateKey
- Find attendance (userId, dateKey)
- If no checkInAt => 400 "Must check in first"
- If checkOutAt already exists => 400 "Already checked out"
- Set checkOutAt = now

Response:
- attendance: { _id, userId, date, checkInAt, checkOutAt, otApproved }

## GET /attendance/me?month=YYYY-MM (UPDATED v2.6)
Roles: EMPLOYEE | MANAGER | ADMIN

Response:
- items: [
  {
    date,          // "YYYY-MM-DD"
    checkInAt,
    checkOutAt,
    otApproved,    // boolean (NEW v2.6) - from approved OT_REQUEST
    status,        // computed, can be null for "today/future not checked-in"
    lateMinutes,   // computed
    workMinutes,   // computed (capped at 17:30 if !otApproved, see §10.5)
    otMinutes      // computed (0 if !otApproved, see §10.5)
  }
]

## GET /attendance/today (UPDATED v2.5)
Today activity for Member Management (Admin/Manager) with pagination.

Roles:
- MANAGER: scope=team only (teamId ignored; use token.user.teamId)
- ADMIN:
  - scope=team requires teamId
  - scope=company returns all users

Query params:
- scope: "team" | "company" (required for ADMIN, forced to "team" for MANAGER)
- teamId: ObjectId (required for ADMIN when scope=team)
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)

Behavior:
- Always uses today computed in GMT+7.
- Count total users first, then clamp page to valid range.
- For each user in current page:
  - Find today's attendance record (userId + dateKey)
  - Compute status using RULES.md:
    - If today has no record => status = null (NOT ABSENT)
    - If checkInAt exists and checkOutAt is null => WORKING
    - etc.

Response:
```json
{
  "date": "YYYY-MM-DD",
  "items": [
    {
      "user": {
        "_id": "...",
        "employeeCode": "NV001",
        "name": "Nguyen Van A",
        "email": "a@company.com",
        "username": "nva",
        "startDate": "2025-01-01T00:00:00.000Z",
        "role": "EMPLOYEE",
        "teamId": "...",
        "isActive": true
      },
      "attendance": {
        "date": "YYYY-MM-DD",
        "checkInAt": "ISO",
        "checkOutAt": "ISO|null",
        "otApproved": true|false
      },
      "computed": {
        "status": "WORKING|ON_TIME|LATE|EARLY_LEAVE|LATE_AND_EARLY|MISSING_CHECKOUT|WEEKEND_OR_HOLIDAY|ABSENT|LEAVE|null",
        "lateMinutes": 0,
        "workMinutes": 0,
        "otMinutes": 0
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

# 3) Requests (Attendance Adjustment)

## POST /requests
Roles: EMPLOYEE | MANAGER | ADMIN

Request body:
- type: "ADJUST_TIME" | "LEAVE" | "OT_REQUEST" [optional, default "ADJUST_TIME"]
- date: "YYYY-MM-DD" [required if type=ADJUST_TIME or OT_REQUEST; ignored if type=LEAVE]
- requestedCheckInAt: ISO string (optional, for ADJUST_TIME only)
- requestedCheckOutAt: ISO string (optional, for ADJUST_TIME only)
- estimatedEndTime: ISO string (optional, for OT_REQUEST only)
- reason: string

Rules (ADJUST_TIME):
- If requestedCheckInAt exists, it must be on request.date in GMT+7 (same dateKey)
- If requestedCheckOutAt exists, it must be on request.date in GMT+7 (same dateKey)
- If both exist, requestedCheckOutAt must be > requestedCheckInAt
- If only requestedCheckOutAt exists, it must be > existing attendance.checkInAt
- If only requestedCheckInAt exists and attendance.checkOutAt exists, requestedCheckInAt must be < attendance.checkOutAt

Response:
- request: { ... }

### Leave Request (NEW v2.3)
If type = "LEAVE":
- leaveStartDate: "YYYY-MM-DD" [required]
- leaveEndDate: "YYYY-MM-DD" [required, >= leaveStartDate]
- leaveType: "ANNUAL" | "SICK" | "UNPAID" [optional]
- reason: string [required]

Rules:
- Max leave range: 30 days
- Cannot overlap with existing approved leave

### OT Request (NEW v2.6)
If type = "OT_REQUEST":
- date: "YYYY-MM-DD" [required] - Must be today or future date (NOT retroactive)
- estimatedEndTime: ISO string [optional] - If provided, must be on request.date in GMT+7
- reason: string [required] - Why OT is needed

Rules (see docs/rules.md §10):
- E1: Must be created today or future dates only (no retroactive OT requests)
- E2: If date already has APPROVED OT_REQUEST, new request extends estimatedEndTime instead of creating duplicate
- I1: Cross-midnight OT requires TWO separate requests (one per date)
- Validation: If estimatedEndTime provided, must be >= 17:30 + 30min = 18:00 (minimum 30min OT)
- Cannot create OT_REQUEST if date has approved LEAVE request

Example Request Body (Single-day OT):
```json
{
  "type": "OT_REQUEST",
  "date": "2025-01-15",
  "estimatedEndTime": "2025-01-15T19:00:00+07:00",
  "reason": "Need to complete sprint deployment"
}
```

Example Request Body (Cross-midnight OT - First Request):
```json
{
  "type": "OT_REQUEST",
  "date": "2025-01-15",
  "estimatedEndTime": "2025-01-15T23:59:59+07:00",
  "reason": "Cross-midnight deployment part 1"
}
```

Example Request Body (Cross-midnight OT - Second Request):
```json
{
  "type": "OT_REQUEST",
  "date": "2025-01-16",
  "estimatedEndTime": "2025-01-16T02:00:00+07:00",
  "reason": "Cross-midnight deployment part 2"
}
```

Response:
```json
{
  "request": {
    "_id": "...",
    "user": "userId",
    "type": "OT_REQUEST",
    "date": "2025-01-15",
    "estimatedEndTime": "2025-01-15T19:00:00.000Z",
    "reason": "Need to complete sprint deployment",
    "status": "PENDING",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

## DELETE /requests/:id (NEW v2.6)
Roles: EMPLOYEE | MANAGER | ADMIN

Behavior:
- EMPLOYEE: Can only delete their own PENDING requests (status must be PENDING)
- MANAGER/ADMIN: Can delete any PENDING requests from their team/company

Rules (see docs/rules.md §10.7):
- Only PENDING requests can be deleted (APPROVED/REJECTED cannot be deleted)
- H1: After check-in today, cannot delete today's OT_REQUEST (must wait until next day)
- H2: Can always cancel tomorrow/future OT_REQUEST (before check-in)

Response:
```json
{
  "message": "Request cancelled successfully",
  "request": {
    "_id": "...",
    "type": "OT_REQUEST",
    "date": "2025-01-16",
    "status": "PENDING"
  }
}
```

Error Cases:
- 400: Cannot cancel today's OT request after check-in (see §10.7 H1)
- 404: Request not found
- 403: Not authorized to delete this request
- 400: Cannot cancel APPROVED/REJECTED requests

## GET /requests/me (UPDATED v2.6)
Roles: EMPLOYEE | MANAGER | ADMIN

Query params:
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)
- status: string (optional, filter by PENDING|APPROVED|REJECTED)
- type: string (optional, filter by ADJUST_TIME|LEAVE|OT_REQUEST) [NEW v2.6]

Response:
```json
{
  "items": [
    {
      "_id": "...",
      "userId": "...",
      "date": "YYYY-MM-DD",
      "type": "ADJUST_TIME | LEAVE | OT_REQUEST",
      "requestedCheckInAt": "ISO string | null",
      "requestedCheckOutAt": "ISO string | null",
      "estimatedEndTime": "ISO string | null",
      "leaveStartDate": "YYYY-MM-DD | null",
      "leaveEndDate": "YYYY-MM-DD | null",
      "leaveType": "ANNUAL | SICK | UNPAID | null",
      "reason": "...",
      "status": "PENDING | APPROVED | REJECTED",
      "approvedBy": { "_id", "name", "employeeCode" },
      "approvedAt": "ISO string | null",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## GET /requests/pending (UPDATED v2.6)
Roles: MANAGER | ADMIN

Query params:
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)
- type: string (optional, filter by ADJUST_TIME|LEAVE|OT_REQUEST) [NEW v2.6]

Behavior:
- MANAGER: only requests from users in the same team
- ADMIN: all requests company-wide

Response:
```json
{
  "items": [
    {
      "_id": "...",
      "userId": {
        "_id": "...",
        "name": "...",
        "employeeCode": "...",
        "email": "...",
        "teamId": "..."
      },
      "date": "YYYY-MM-DD",
      "type": "ADJUST_TIME | LEAVE | OT_REQUEST",
      "requestedCheckInAt": "ISO string | null",
      "requestedCheckOutAt": "ISO string | null",
      "estimatedEndTime": "ISO string | null",
      "leaveStartDate": "YYYY-MM-DD | null",
      "leaveEndDate": "YYYY-MM-DD | null",
      "leaveType": "ANNUAL | SICK | UNPAID | null",
      "reason": "...",
      "status": "PENDING",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 25,
    "totalPages": 2
  }
}
```


## POST /requests/:id/approve
Roles: MANAGER | ADMIN

## POST /requests/:id/approve (UPDATED v2.6)
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: can only approve requests from users in same team (anti-IDOR)
- ADMIN: can approve any request
- ADJUST_TIME: Validate requested timestamps are on request.date (GMT+7), else 400
- ADJUST_TIME: Update attendance (create if missing, set checkInAt/checkOutAt)
- OT_REQUEST: Set attendance.otApproved = true (see §10.8 for auto-create logic)
- Update request status = APPROVED
- Set approvedBy and approvedAt

Response:
- request: { ...updated... }

## POST /requests/:id/reject
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: same-team only
- ADMIN: any request
- Update request status = REJECTED
- Set approvedBy and approvedAt

Response:
- request: { ...updated... }

---

# 4) Timesheet Matrix

## GET /timesheet/team?month=YYYY-MM&teamId?
Roles: MANAGER | ADMIN

Query params:
- month: YYYY-MM (optional, defaults to current month)
- teamId: ObjectId (REQUIRED for ADMIN, ignored for MANAGER)

Behavior:
- MANAGER: uses token.teamId (teamId param ignored)
- ADMIN: MUST specify teamId param, else 400

Response:
- days: [1..N]
- rows: [
  {
    user: { _id, name, employeeCode },
    cells: [ { date, status, colorKey } ]
  }
]

## GET /timesheet/company?month=YYYY-MM
Roles: ADMIN
Response shape same as /timesheet/team.

---

# 5) Reports

## GET /reports/monthly?month=YYYY-MM&scope=team|company&teamId?
Roles:
- MANAGER: scope=team only
- ADMIN: scope=team or company

## GET /reports/monthly?month=YYYY-MM&scope=team|company&teamId? (UPDATED v2.6)
Roles:
- MANAGER: scope=team only
- ADMIN: scope=team or company

Response:
- summary: [
  {
    user: { _id, name, employeeCode },
    totalWorkMinutes,
    totalLateCount,
    totalOtMinutes,        // Total OT worked (including unapproved)
    approvedOtMinutes,     // NEW v2.6: Only approved OT (otApproved=true)
    pendingOtRequests,     // NEW v2.6: Count of PENDING OT_REQUEST for this month
    approvedOtRequests,    // NEW v2.6: Count of APPROVED OT_REQUEST for this month
    rejectedOtRequests     // NEW v2.6: Count of REJECTED OT_REQUEST for this month
  }
]
- details (optional)

## GET /reports/monthly/export?month=YYYY-MM&scope=team|company&teamId?
Roles:
- MANAGER: team only
- ADMIN: team or company

Response:
- Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- Returns downloadable .xlsx

---

# 6) Directory (Teams + User Detail)

## GET /teams
Roles: EMPLOYEE | MANAGER | ADMIN
Response:
- items: [{ _id, name }]

## GET /users/:id
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: only users in same team (anti-IDOR)
- ADMIN: any user

Response:
- user: {
  _id,
  employeeCode,
  name,
  email,
  username,
  role,
  teamId,
  isActive,
  startDate,
  createdAt,
  updatedAt
}

## GET /attendance/user/:id?month=YYYY-MM
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: same-team only
- ADMIN: any user

Response:
- items: [
  {
    date,
    checkInAt,
    checkOutAt,
    status,
    lateMinutes,
    workMinutes,
    otMinutes
  }
]

---

# 7) Admin

## POST /admin/users
Roles: ADMIN

Request body:
- employeeCode: string
- name: string
- email: string
- username: string (optional)
- password: string
- role: "ADMIN" | "MANAGER" | "EMPLOYEE"
- teamId: string (optional)
- startDate: ISO string (optional)
- isActive: boolean (optional, default true)

Response:
- user: { ...sanitized user fields... }

## GET /admin/users (UPDATED v2.3)
Roles: ADMIN

Query params:
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)
- search: string (optional, search by name/email/employeeCode)
- includeDeleted: boolean (optional, default false)

Response:
{
  "items": [
    {
      "_id",
      "employeeCode",
      "name",
      "email",
      "username",
      "role",
      "teamId",
      "isActive",
      "startDate",
      "deletedAt",
      "createdAt",
      "updatedAt"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}

## PATCH /admin/users/:id
Roles: ADMIN

Allowed fields (whitelist only):
- name
- email
- username
- teamId
- isActive
- startDate

Response:
- user: { ...updated sanitized user fields... }

## POST /admin/users/:id/reset-password
Roles: ADMIN

Request body:
- newPassword: string

Rules:
- Validate newPassword length >= 8 (or your chosen policy)
- Hash with bcrypt
- Do NOT log passwords

Response:
- message: "Password updated"

## POST /admin/holidays
Roles: ADMIN
Request body:
- date: "YYYY-MM-DD"
- name: string

## GET /admin/holidays?year=YYYY
Roles: ADMIN
Response:
- items: [{ date, name }]

## POST /admin/holidays/range (NEW v2.3)
Roles: ADMIN

Request body:
- startDate: "YYYY-MM-DD" [required]
- endDate: "YYYY-MM-DD" [required, >= startDate]
- name: string [required]

Rules:
- Max range: 30 days
- Skip existing dates (no error)

Response:
{
  "created": 5,
  "skipped": 2,
  "dates": ["2026-01-01", "2026-01-02", ...]
}

---

# 8) Soft Delete (NEW v2.3)

## DELETE /admin/users/:id
Roles: ADMIN

Behavior:
- Sets deletedAt = now
- User will be purged after SOFT_DELETE_DAYS (configurable, default 15)
- Cannot delete yourself

Response:
{
  "message": "User deleted",
  "restoreDeadline": "2026-02-06T00:00:00.000Z"
}

## POST /admin/users/:id/restore
Roles: ADMIN

Behavior:
- Sets deletedAt = null
- Only works if user is soft-deleted and not yet purged

Response:
{
  "user": { ...restored user... }
}

Errors:
- 404 if user not found or already purged
- 400 if user not deleted

## POST /admin/users/purge
Roles: ADMIN

Behavior:
- Finds users where deletedAt < (now - SOFT_DELETE_DAYS)
- CASCADE: Hard deletes related attendances and requests
- Hard deletes the users
- Manual trigger (no cron job)

Response:
{
  "message": "Purged 3 users",
  "purged": 3,
  "cascadeDeleted": {
    "attendances": 45,
    "requests": 12
  },
  "details": [
    { "userId": "...", "employeeCode": "NV001", "name": "...", "email": "..." }
  ]
}

Errors:
- 403 if not ADMIN

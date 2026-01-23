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
  checkOutAt   // null if not checked out
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
- attendance: { _id, userId, date, checkInAt, checkOutAt }

## GET /attendance/me?month=YYYY-MM
Roles: EMPLOYEE | MANAGER | ADMIN

Response:
- items: [
  {
    date,          // "YYYY-MM-DD"
    checkInAt,
    checkOutAt,
    status,        // computed, can be null for "today/future not checked-in"
    lateMinutes,   // computed
    workMinutes,   // computed
    otMinutes      // computed
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
        "checkOutAt": "ISO|null"
      },
      "computed": {
        "status": "WORKING|ON_TIME|LATE|EARLY_LEAVE|LATE_AND_EARLY|MISSING_CHECKOUT|WEEKEND_OR_HOLIDAY|ABSENT|LEAVE|null",
        "lateMinutes": 0
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
- type: "ADJUST_TIME" | "LEAVE" [optional, default "ADJUST_TIME"]
- date: "YYYY-MM-DD" [required if type=ADJUST_TIME; ignored if type=LEAVE]
- requestedCheckInAt: ISO string (optional)
- requestedCheckOutAt: ISO string (optional)
- reason: string

Rules:
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

## GET /requests/me (UPDATED v2.4)
Roles: EMPLOYEE | MANAGER | ADMIN

Query params:
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)
- status: string (optional, filter by PENDING|APPROVED|REJECTED)

Response:
```json
{
  "items": [
    {
      "_id": "...",
      "userId": "...",
      "date": "YYYY-MM-DD",
      "type": "ADJUST_TIME",
      "requestedCheckInAt": "ISO string | null",
      "requestedCheckOutAt": "ISO string | null",
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

## GET /requests/pending (UPDATED v2.4)
Roles: MANAGER | ADMIN

Query params:
- page: number (optional, default 1)
- limit: number (optional, default 20, max 100)

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
      "type": "ADJUST_TIME",
      "requestedCheckInAt": "ISO string | null",
      "requestedCheckOutAt": "ISO string | null",
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

Behavior:
- MANAGER: can only approve requests from users in same team (anti-IDOR)
- ADMIN: can approve any request
- Validate requested timestamps are on request.date (GMT+7), else 400
- Update request status = APPROVED
- Update attendance:
  - If attendance does not exist => create it
  - If requestedCheckInAt exists => set checkInAt
  - If requestedCheckOutAt exists => set checkOutAt

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

Response:
- summary: [
  {
    user: { _id, name, employeeCode },
    totalWorkMinutes,
    totalLateCount,
    totalOtMinutes,
    approvedOtMinutes (optional)
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

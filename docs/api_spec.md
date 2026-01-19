# API Specification — Attendance Web App (v2.2)

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

## GET /attendance/today?scope=team|company&teamId?
NEW: Today activity for Member Management (Admin/Manager).

Roles:
- MANAGER: scope=team only (teamId ignored; use token.user.teamId)
- ADMIN:
  - scope=team requires teamId
  - scope=company returns all users

Behavior:
- Always uses today computed in GMT+7.
- For each user in scope:
  - Find today's attendance record (userId + dateKey)
  - Compute status using RULES.md:
    - If today has no record => status = null (NOT ABSENT)
    - If checkInAt exists and checkOutAt is null => WORKING
    - etc.

Response:
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
      } | null,
      "computed": {
        "status": "WORKING|ON_TIME|LATE|MISSING_CHECKOUT|WEEKEND_OR_HOLIDAY|ABSENT|null",
        "lateMinutes": 0
      }
    }
  ]
}

---

# 3) Requests (Attendance Adjustment)

## POST /requests
Roles: EMPLOYEE | MANAGER | ADMIN

Request body:
- date: "YYYY-MM-DD"
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

## GET /requests/me
Roles: EMPLOYEE | MANAGER | ADMIN
Response:
- items: [ request... ]

## GET /requests/pending
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: only requests from users in the same team
- ADMIN: all requests

Response:
- items: [ request... ]

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

## GET /admin/users
Roles: ADMIN
Response:
- items: [
  {
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
]

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

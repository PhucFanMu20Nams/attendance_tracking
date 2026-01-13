# API Specification — Attendance App (v2.1)

Base URL: /api  
Auth: JWT (Header: Authorization: Bearer <token>)

## 1) Auth

### POST /auth/login
Request body:
- identifier: string (email OR username)
- password: string

Response:
- token: string
- user: { _id, name, role, employeeCode, teamId }

### GET /auth/me
Headers:
- Authorization: Bearer <token>

Response:
- user: { _id, name, role, employeeCode, teamId }

## 2) Attendance

### POST /attendance/check-in
Roles: EMPLOYEE | MANAGER | ADMIN

Behavior:
- Compute today (GMT+7) → dateKey "YYYY-MM-DD"
- Upsert attendance by (userId, dateKey)
- If checkInAt already exists → 400 "Already checked in"

Response:
- attendance: { userId, date, checkInAt, checkOutAt }

### POST /attendance/check-out
Roles: EMPLOYEE | MANAGER | ADMIN

Behavior:
- Compute today (GMT+7) → dateKey
- Find attendance (userId, dateKey)
- If no checkInAt → 400 "Must check in first"
- If checkOutAt already exists → 400 "Already checked out"
- Set checkOutAt = now

Response:
- attendance: { userId, date, checkInAt, checkOutAt }

### GET /attendance/me?month=YYYY-MM
Roles: EMPLOYEE | MANAGER | ADMIN

Response:
- items: [
  {
    date,
    checkInAt,
    checkOutAt,
    status,        // computed
    lateMinutes,   // computed
    workMinutes,   // computed
    otMinutes      // computed
  }
]

## 3) Requests

### POST /requests
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

### GET /requests/me
Roles: EMPLOYEE | MANAGER | ADMIN

Response:
- items: [ request... ]

### GET /requests/pending
Roles: MANAGER | ADMIN

Behavior:
- Manager: only requests from users in the same team
- Admin: requests across the company

Response:
- items: [ request... ]

### POST /requests/:id/approve
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: Can only approve requests from users in the same team
- ADMIN: Can approve any request across the company
- Validate requested timestamps are on request.date (GMT+7). If invalid → 400
- Update request status = APPROVED
- Update attendance based on request:
  - If attendance does not exist → create
  - If requestedCheckInAt exists → set checkInAt
  - If requestedCheckOutAt exists → set checkOutAt

Response:
- request: { ...updated... }

### POST /requests/:id/reject
Roles: MANAGER | ADMIN

Behavior:
- MANAGER: Can only reject requests from users in the same team
- ADMIN: Can reject any request across the company
- Update request status = REJECTED
- Set approvedBy (rejector) and approvedAt

Response:
- request: { ...updated... }

## 4) Timesheet Matrix

### GET /timesheet/team?month=YYYY-MM
Roles: MANAGER | ADMIN

Response:
- days: [1..N]
- rows: [
  {
    user: { _id, name, employeeCode },
    cells: [
      { date, status, colorKey }
    ]
  }
]

### GET /timesheet/company?month=YYYY-MM
Roles: ADMIN

Response shape is the same as /timesheet/team.

## 5) Reports

### GET /reports/monthly?month=YYYY-MM&scope=team|company&teamId?
Roles:
- Manager: scope=team only
- Admin: scope=team or company

Response:
- summary: [
  {
    user: { _id, name, employeeCode },
    totalWorkMinutes,
    totalLateCount,      // count of days with lateMinutes > 0 (including WORKING/MISSING_CHECKOUT)
    totalOtMinutes,
    approvedOtMinutes (optional)
  }
]
- details (optional): per-day rows

### GET /reports/monthly/export?month=YYYY-MM&scope=team|company&teamId?
Roles:
- Manager: team only
- Admin: team or company

Response:
- Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- Returns downloadable .xlsx file

## 6) Admin

### POST /admin/users
Roles: ADMIN

Request body:
- employeeCode, name, email, password, role, teamId (optional)

### GET /admin/users
Roles: ADMIN

Response:
- items: [{...}]

### POST /admin/holidays
Roles: ADMIN

Request body:
- date: "YYYY-MM-DD"
- name: "Holiday name"

### GET /admin/holidays?year=YYYY
Roles: ADMIN

Response:
- items: [{ date, name }]

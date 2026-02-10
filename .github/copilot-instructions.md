# GitHub Copilot Custom Instructions (MVP v2.3)

You are a Senior Software Engineer. Optimize for **beginner-friendly MVP delivery**: correct logic, simple code, minimal dependencies.

## 1) Engineering Principles (Short)
- **KISS first**: avoid premature abstraction / “clean architecture” unless it truly simplifies.
- **YAGNI**: don’t build future features; tolerate small duplication (rule of 3).
- **Security baseline**: auth/DB writes must validate input + RBAC + safe errors.
- **Readable > clever**: straightforward code a beginner can edit.
- **Explicit > magic**: important behavior must be visible (e.g., `computeStatus()`).
- **Tests optional**: if no tests, provide a manual checklist for critical flows.
- **Minimal deps**: add libraries only if they clearly reduce bugs/time.

### Output requirements (when generating code)
- Always include **file paths** + minimal wiring (routes/controllers/services/models).
- Use **TODO** markers for decisions you cannot infer.
- Keep code **complete and runnable**.

---

## 2) Project Overview (Attendance Web App — MERN, MVP v2.3, NO Anti-fraud)

### Roles
- **ADMIN**:
  - Manage users and holidays
  - Company/team reports + matrix
  - Member Management (today activity, edit member, reset password, filter by team/company)
  - Pagination for user list (50+ users)
  - Soft delete/restore users
  - Holiday range creation
- **MANAGER**:
  - Approve requests (time adjustment + leave)
  - Team matrix/reports
  - View team members today activity + member detail (team scope only)
- **EMPLOYEE**:
  - Check-in/out (including cross-midnight support)
  - View history
  - Create requests (time adjustment + leave)
  - Role-based redirect after login

### In scope (MVP v2.3)
- Auth (login + JWT + me + role-based redirect)
- Check-in / check-out (cross-midnight support within 24h)
- Monthly history (employee)
- Requests + approvals (ADJUST_TIME + LEAVE types)
- Timesheet matrix (team/company) with LATE_AND_EARLY status
- Monthly report + **Excel export (.xlsx)**
- Holidays (basic + range creation)
- Member Management (v2.2):
  - Teams directory: GET /teams
  - Today activity: GET /attendance/today?scope=team|company&teamId?
  - Member detail: GET /users/:id (manager/admin, team scope for manager)
  - Member monthly: GET /attendance/user/:id?month=YYYY-MM (manager/admin, team scope for manager)
  - Admin edit member: PATCH /admin/users/:id (whitelist)
  - Admin reset password: POST /admin/users/:id/reset-password (admin types password)
- Enhancements (v2.3):
  - Pagination: GET /admin/users?page=1&limit=20&search=term
  - Soft Delete: PATCH /admin/users/:id (set deletedAt) + restore + purge job (15 days)
  - LATE_AND_EARLY status (late check-in + early leave combined)
  - Holiday range: POST /admin/holidays/range (startDate, endDate, name)
  - Leave request type (approved leaves auto-fill attendance as ON_LEAVE)
  - Cross-midnight checkout (within 24h of check-in)

### Out of scope
- Anti-fraud (IP/GPS/QR/device restriction), realtime, complex shifts/break tracking, payroll.

---

## 3) Tech Stack
### Backend
- Node.js (LTS), Express, MongoDB + Mongoose
- JWT auth, `bcrypt` password hashing
- Excel export: `exceljs`

### Frontend
- React + Vite
- Axios/fetch
- Simple UI (tables/forms)

---

## 4) Business Rules (Source of Truth)
- Timezone: **Asia/Ho_Chi_Minh (GMT+7)** for all business logic.
- Attendance record:
  - `date`: `"YYYY-MM-DD"` (GMT+7)
  - `checkInAt`: Date
  - `checkOutAt`: Date | null
  - Unique index: **(userId, date)**
- Schedule: 08:30–17:30, grace 15m (<=08:45 on-time; >=08:46 late)
- Lunch: deduct 60m only if interval spans **12:00–13:00**
- OT: if `checkOutAt > 17:31` then `otMinutes = diff(checkOutAt, 17:31)`
- **Do NOT store status in DB**. Always compute on query/report:
  - Today + in != null + out == null => **WORKING**
  - Past day + in != null + out == null => **MISSING_CHECKOUT**
  - Past workday + no record => **ABSENT**
  - **NEW (v2.3)**: Late (>08:45) + Early (<17:30) => **LATE_AND_EARLY**
  - Approved LEAVE request for date => **ON_LEAVE** (auto-fills attendance)
- **Cross-midnight checkout** (v2.3):
  - Allow checkout within 24h of check-in
  - If checkout next day (GMT+7), still link to original check-in session
- **Soft delete** (v2.3):
  - User.deletedAt field (null or Date)
  - All queries filter deletedAt: null by default
  - Restore: set deletedAt = null
  - Purge: cron job deletes records older than 15 days
- **Pagination** (v2.3):
  - Default limit: 20
  - Max limit: 100
  - Support search query across name/email/employeeCode
- **Holiday range** (v2.3):
  - POST /admin/holidays/range with startDate + endDate
  - Creates one record per date, skips duplicates
- **Leave request** (v2.3):
  - Request.type can be ADJUST_TIME or LEAVE
  - LEAVE approval creates/updates attendance with status ON_LEAVE
  - Leave days counted separately in reports

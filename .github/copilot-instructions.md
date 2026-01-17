# GitHub Copilot Custom Instructions (MVP v2.2)

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

## 2) Project Overview (Attendance Web App — MERN, MVP v2.2, NO Anti-fraud)

### Roles
- **ADMIN**:
  - Manage users and holidays
  - Company/team reports + matrix
  - NEW: Member Management (today activity, edit member, reset password, filter by team/company)
- **MANAGER**:
  - Approve requests
  - Team matrix/reports
  - NEW: View team members today activity + member detail (team scope only)
- **EMPLOYEE**:
  - Check-in/out
  - View history
  - Create requests

### In scope (MVP)
- Auth (login + JWT + me)
- Check-in / check-out
- Monthly history (employee)
- Requests + approvals (manager/admin)
- Timesheet matrix (team/company)
- Monthly report + **Excel export (.xlsx)**
- Holidays (basic)
- NEW (v2.2): Member Management
  - Teams directory: GET /teams
  - Today activity: GET /attendance/today?scope=team|company&teamId?
  - Member detail: GET /users/:id (manager/admin, team scope for manager)
  - Member monthly: GET /attendance/user/:id?month=YYYY-MM (manager/admin, team scope for manager)
  - Admin edit member: PATCH /admin/users/:id (whitelist)
  - Admin reset password: POST /admin/users/:id/reset-password (admin types password)

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
- OT: if `checkOutAt > 18:30` then `otMinutes = diff(checkOutAt, 18:30)`
- **Do NOT store status in DB**. Always compute on query/report:
  - Today + in != null + out == null => **WORKING**
  - Past day + in != null + out == null => **MISSING_CHECKOUT**
  - Past workday + no record => **ABSENT**
  - Week

# 5-Day Roadmap — Attendance Web App (MERN) (MVP v2.3)

> **Goal:** Ship a working MVP in **4 days** (beginner-friendly).  
> **Day 5:** Member Management enhancement (v2.2 features).  
> **Day 6:** v2.3 enhancements (pagination, soft delete, leave, etc.)  
> **Strategy:** Build **Backend + DB first**, then a minimal Frontend that consumes the API.  
> **Non-goals:** Pretty UI, realtime, anti-fraud, complex shifts.

---

## What you will deliver by Day 4
✅ Login (JWT)  
✅ Check-in / Check-out  
✅ Monthly “My Attendance” history  
✅ Requests (create) + Approvals (approve/reject)  
✅ Timesheet Matrix (team/company)  
✅ Monthly report + Excel export (.xlsx)  
✅ Seed data for quick testing

---

## Project Setup Assumptions
- Repo structure: `/server` (Express) + `/client` (React)
- MongoDB: Local or Atlas
- Timezone: **Asia/Ho_Chi_Minh (GMT+7)**
- Shift: **08:30–17:30**
- Lunch deduction: deduct 60 mins if span 12:00–13:00
- Status is **computed** (not stored)

---

# Day 1 — Backend Foundation (Setup + Auth + DB + Seed)

## Day 1 Goals
- Backend runs and connects to MongoDB
- JWT auth works (`/login`, `/me`)
- Seed accounts ready for testing

## Tasks (Server)
1) **Initialize server**
- Create Express app + `/api/health`
- Add middleware: `cors`, `express.json()`
- Connect MongoDB (`MONGO_URI`)

2) **Create User model**
- Fields: employeeCode, name, email, username(optional), passwordHash, role, teamId(optional), isActive
- Roles: `ADMIN`, `MANAGER`, `EMPLOYEE`

3) **Auth APIs**
- `POST /api/auth/login`
  - identifier (email/username) + password
  - return JWT + user profile
- `GET /api/auth/me`
  - verify token, return current user

4) **Auth middleware**
- `authMiddleware`: verify JWT
- `requireRole([...])`: block unauthorized roles

5) **Seed data**
- Create 1 team
- Create 3 users:
  - Admin (ADMIN)
  - Manager (MANAGER, teamId)
  - Employee (EMPLOYEE, teamId)

## Done Checklist (Day 1)
- [ ] `GET /api/health` returns OK
- [ ] DB connection works
- [ ] Login returns token
- [ ] `/auth/me` returns correct user
- [ ] Role guard blocks restricted routes
- [ ] Seed users exist in DB and you can login with them

## Commit Suggestion
- `feat(server): setup express + mongo + auth + seed`

---

# Day 2 — Attendance Core APIs (Check-in/out + History + Status/Minutes)

## Day 2 Goals
- Check-in/out flows work correctly
- Monthly history returns computed fields (status, minutes)

## Tasks (Server)
1) **Create Attendance model**
- Fields: userId, date("YYYY-MM-DD"), checkInAt(Date), checkOutAt(Date|null), otApproved(bool default false)
- Unique index: `(userId, date)`

2) **Create GMT+7 dateKey helper**
- Utility: `dateKey = YYYY-MM-DD` based on Asia/Ho_Chi_Minh

3) **Attendance APIs**
- `POST /api/attendance/check-in`
  - must be logged in
  - create/upsert today attendance
  - block if already checked in
- `POST /api/attendance/check-out`
  - must be logged in
  - block if no check-in
  - block if already checked out
- `GET /api/attendance/me?month=YYYY-MM`
  - returns list with computed: `status`, `lateMinutes`, `workMinutes`, `otMinutes`

4) **Implement compute logic (core)**
- Status rules:
  - today + in not null + out null => WORKING
  - past day + in not null + out null => MISSING_CHECKOUT
  - past day + no record => ABSENT (workdays only)
- Minutes rules:
  - lateMinutes if check-in after 08:45
  - early leave if check-out before 17:30
  - LATE_AND_EARLY if both late and early leave (v2.3)
  - otMinutes if check-out after 18:30
  - lunch deduction: -60 mins if span 12:00–13:00

## Done Checklist (Day 2)
- [ ] Check-in works and blocks duplicates
- [ ] Check-out works and blocks invalid states
- [ ] `/attendance/me` returns computed fields
- [ ] WORKING vs MISSING_CHECKOUT is correct
- [ ] Late / workMinutes / otMinutes calculations look correct for test data

## Quick Manual Tests (Postman)
- [ ] check-out before check-in => error
- [ ] check-in twice => error
- [ ] today check-in no check-out => WORKING
- [ ] insert past-day check-in only => MISSING_CHECKOUT

## Commit Suggestion
- `feat(server): attendance check-in/out + monthly history + compute logic`

---

# Day 3 — Requests + Approvals + Timesheet Matrix + Report JSON

## Day 3 Goals
- Employee can create request
- Manager/Admin can approve/reject request
- Timesheet matrix API works
- Monthly report (JSON) works

## Tasks (Server)
1) **Create Request model**
- Fields: userId, date, type("ADJUST_TIME"), requestedCheckInAt, requestedCheckOutAt, reason, status(PENDING/APPROVED/REJECTED), approvedBy, approvedAt

2) **Request APIs**
- `POST /api/requests` (employee creates)
- `GET /api/requests/me`
- `GET /api/requests/pending` (manager/admin)
  - Manager: only team users
  - Admin: company-wide
- `POST /api/requests/:id/approve`
  - set status APPROVED
  - update/create attendance for that date
- `POST /api/requests/:id/reject`
  - set status REJECTED

3) **Timesheet Matrix APIs**
- `GET /api/timesheet/team?month=YYYY-MM` (manager/admin)
- `GET /api/timesheet/company?month=YYYY-MM` (admin)
Return shape:
- days: [1..N]
- rows: [{ user, cells: [{date, status, colorKey}] }]

4) **Monthly Report (JSON)**
- `GET /api/reports/monthly?month=YYYY-MM&scope=team|company&teamId?`
Return summary per user:
- totalWorkMinutes
- totalLateCount
- totalOtMinutes

## Done Checklist (Day 3)
- [ ] Employee can create request
- [ ] Manager/Admin can approve and attendance updates correctly
- [ ] Pending list respects scope (team/company)
- [ ] Timesheet matrix returns correct shape for selected month
- [ ] Monthly report JSON is correct and matches attendance data

## Commit Suggestion
- `feat(server): requests + approvals + timesheet matrix + monthly report json`

---

# Day 4 — Excel Export + Minimal Frontend (Must-Have UI)

## Day 4 Goals
- Excel export works
- Minimal UI to demo end-to-end
- Final manual test pass

## Tasks (Server)
1) **Excel export endpoint**
- `GET /api/reports/monthly/export?month=YYYY-MM&scope=team|company&teamId?`
- Generate `.xlsx` (use `exceljs`)
- Include columns (simple):
  - employeeCode, name, totalWorkMinutes, totalLateCount, totalOtMinutes

## Tasks (Client)
> Keep UI very simple: tables + forms, minimal styling.

1) **Frontend skeleton**
- Routing + layout
- Auth context (store token, load `/auth/me`)
- Axios client (attach token)

2) **Pages (minimum)**
- `/login`
- `/dashboard` (check-in/out + today status)
- `/my-attendance` (monthly list table)
- `/requests` (create + list)
- `/approvals` (pending list + approve/reject) (manager/admin only)
- `/timesheet-matrix` (render matrix) (manager/admin)
- `/reports/monthly` (view summary + export button)

3) **Export Excel**
- Button triggers download from export endpoint

## Final Manual Tests (Day 4)
- [ ] Login works + route protected
- [ ] Check-in/out works from UI
- [ ] My Attendance shows correct computed fields
- [ ] Create request + approve updates attendance
- [ ] Matrix renders without crashing
- [ ] Report page loads + export downloads valid .xlsx
- [ ] Run through TEST_CHECKLIST.md and tick everything important

## Commit Suggestion
- `feat(client): minimal ui + integrate apis`
- `feat(server): excel export`

---

# Minimal “Cut Scope” Plan (If you’re behind schedule)
If time is tight on Day 4, cut in this order:
1) Admin Users page (skip UI, use seed only)
2) Holidays UI (skip, treat weekends only)
3) Company scope (admin) — keep team scope only
4) Make Matrix simple (status text only, colors later)

---

# Success Criteria (4-day MVP)
- Backend endpoints work and match API_SPEC.md
- Frontend can demonstrate:
  - login → check-in/out → history → request → approve → report export
- Most important: status logic WORKING vs MISSING_CHECKOUT is correct

---

# Day 5 — Member Management (Backend first → Frontend) (v2.2)

> **Assumption:** MVP v2.1 is already done (auth, attendance, requests, matrix, reports, export, admin users/holidays).
> **Goal:** Add Member Management (Admin + Manager) with "today activity" only.

---

## Part A — Backend (do first)

### A1) Teams directory
1) **GET /api/teams**
- Roles: EMPLOYEE | MANAGER | ADMIN
- Response: items: [{ _id, name }]

Done checklist:
- [ ] Returns all teams
- [ ] Works with JWT auth

Commit:
- `feat(server): teams directory api`

---

### A2) Today activity API (core)
2) **GET /api/attendance/today?scope=team|company&teamId?**
RBAC:
- MANAGER: scope=team only (ignore teamId, use token.user.teamId)
- ADMIN:
  - scope=company => all users
  - scope=team => require teamId

Rules:
- "Today" computed in GMT+7
- If user has no attendance record today => status must be **null** (NOT ABSENT)
- Return checkInAt/checkOutAt if present + computed status + lateMinutes

Done checklist:
- [ ] Admin company scope returns all users
- [ ] Admin team scope returns only that team
- [ ] Manager returns only same team
- [ ] No record today => status null (not ABSENT)
- [ ] No sensitive fields returned (passwordHash)

Commit:
- `feat(server): today activity api (team/company scope)`

---

### A3) Member detail + monthly history (manager/admin)
3) **GET /api/users/:id**
- Roles: MANAGER | ADMIN
- Anti-IDOR:
  - Manager can only access same-team users
  - Admin can access any user
- Response is sanitized (no passwordHash)

4) **GET /api/attendance/user/:id?month=YYYY-MM**
- Roles: MANAGER | ADMIN
- Anti-IDOR same as above
- Response shape matches /attendance/me (computed fields)

Done checklist:
- [ ] Manager cannot access other-team users (403)
- [ ] Admin can access any user
- [ ] Monthly attendance by user returns computed fields

Commit:
- `feat(server): user detail + attendance by user (rbac + anti-idor)`

---

### A4) Admin member management (edit + reset password)
5) **PATCH /api/admin/users/:id**
- Roles: ADMIN
- Whitelist only:
  - name, email, username, teamId, isActive, startDate

6) **POST /api/admin/users/:id/reset-password**
- Roles: ADMIN
- Body: { newPassword }
- newPassword length >= 8
- bcrypt hash
- do not log password

Done checklist:
- [ ] Admin can update member basic fields
- [ ] Admin can toggle isActive
- [ ] Reset password works; user can login with new password

Commit:
- `feat(server): admin edit member + reset password`

---

## Part B — Frontend (after backend is stable)

> Keep UI simple: tables + forms.

### B1) Admin pages
1) `/admin/members`
- Filters:
  - Scope: company or team
  - Team dropdown (only when scope=team)
- Table columns:
  - employeeCode, name, email, username, startDate, team, isActive
  - today status, checkInAt, checkOutAt
- Actions:
  - View detail
  - Edit member (modal/form)
  - Reset password (modal/form)

2) `/admin/members/:id`
- Member profile fields
- Monthly attendance table (month picker)

3) `/profile`
- Shows current user via /auth/me

Done checklist:
- [ ] Admin list loads and filters work
- [ ] Edit member + reset password flows work

Commit:
- `feat(client): admin member management pages`

---

### B2) Manager pages
4) `/team/members`
- No date picker (today only)
- Table same as admin (team-only, no company scope)

5) `/team/members/:id`
- Member detail + monthly attendance (same-team only)

Done checklist:
- [ ] Manager sees only same-team members
- [ ] Manager cannot open other-team member detail (handle 403)

Commit:
- `feat(client): manager team members pages`

---

## Final Manual Tests (must pass)
- [ ] Admin can view company today activity
- [ ] Admin can filter by team
- [ ] Admin can edit member fields and toggle isActive
- [ ] Admin reset password works; user can login with new password
- [ ] Manager sees only same-team members
- [ ] Manager cannot access other-team members (403)
- [ ] Today with no attendance record => status null (NOT ABSENT)

---

# Day 6 — Enhancements v2.3 (NEW)

> **Prerequisite:** MVP v2.2 complete and tested.  
> **Goal:** Implement 7 enhancement features (A-G).

---

## Part A — Quick Wins

### A1) Role-based Redirect
File: `client/src/pages/LoginPage.jsx`
- After login success, check user.role
- ADMIN → `/admin/members`
- MANAGER → `/team/members`  
- EMPLOYEE → `/dashboard`

Commit: `feat(client): role-based redirect after login`

### A2) Late + Early Leave Status
Files:
- `server/src/utils/attendanceCompute.js` - add LATE_AND_EARLY check
- `server/src/services/timesheetService.js` - add purple colorKey
- `client/src/components/ui/StatusBadge.jsx` - add case

Commit: `feat(server): LATE_AND_EARLY combined status`

### A3) Holiday Range Creation
Files:
- `server/src/controllers/holidayController.js` - add createHolidayRange
- `server/src/routes/adminRoutes.js` - add POST /admin/holidays/range
- `client/src/pages/AdminHolidaysPage.jsx` - add range inputs

Commit: `feat(server): holiday range creation endpoint`

---

## Part B — Medium Complexity

### B1) Pagination for Admin Users ✅ DONE
Files:
- `server/src/controllers/userController.js#getAllUsers` - add page/limit/search
- `client/src/pages/AdminMembersPage.jsx` - add Flowbite Pagination
- `client/src/hooks/usePagination.js` (NEW) - reusable pagination hook

Commit: `feat(server): pagination for admin users endpoint`

### B2) Soft Delete + Restore
Files:
- `server/src/models/User.js` - add deletedAt field
- `server/src/controllers/userController.js` - add softDelete, restore
- `server/src/jobs/purgeDeletedUsers.js` (NEW) - cron job for purge
- All user queries - filter by deletedAt: null

Commit: `feat(server): soft delete with configurable purge`

---

## Part C — Complex Features (Needs Design)

### C1) Leave Request (F)
Files:
- `server/src/models/Request.js` - add LEAVE type + fields
- `server/src/services/requestService.js` - handle LEAVE validation
- `server/src/utils/attendanceCompute.js` - check approved leaves
- `client/src/pages/RequestsPage.jsx` - leave request form

Commit: `feat(server): leave request type`

### C2) Cross-midnight OT (G)
Files:
- `server/src/services/attendanceService.js#checkOut` - find active session
- `server/src/utils/attendanceCompute.js` - cross-day OT calculation

Commit: `feat(server): cross-midnight checkout support`

### C3) Pagination for Requests + Approvals Pages (NEW v2.4)
Files:
- `server/src/utils/pagination.js` (NEW) - reusable pagination helper
- `server/src/services/requestService.js` - add options param (skip, limit, status)
- `server/src/controllers/requestController.js` - add pagination params
- `client/src/api/requestApi.js` (NEW) - API module for requests
- `client/src/components/requests/CreateRequestForm.jsx` (EXTRACTED)
- `client/src/components/requests/MyRequestsTable.jsx` (EXTRACTED)
- `client/src/pages/RequestsPage.jsx` - refactored with usePagination
- `client/src/components/approvals/PendingRequestsTable.jsx` (EXTRACTED)
- `client/src/components/approvals/ApprovalModal.jsx` (EXTRACTED)
- `client/src/pages/ApprovalsPage.jsx` - refactored with usePagination

Commit:
- `feat(server): pagination for requests endpoints`
- `refactor(client): extract request components + usePagination integration`

### C4) Today Activity Pagination (NEW v2.5)
Files:
- `server/src/controllers/attendanceController.js#getTodayAttendance` - add page/limit params
- `server/src/services/attendanceService.js#getTodayActivity` - count + clamp + skip/limit
- `client/src/components/members/TodayActivityTable.jsx` - add Flowbite Pagination
- `client/src/pages/AdminMembersPage.jsx` - usePagination for Today Activity mode

Commit:
- `feat(server): pagination for today activity endpoint`
- `feat(client): today activity table pagination`

---

## Done Checklist (Day 6)
- [ ] E) Role redirect works for all 3 roles
- [ ] C) LATE_AND_EARLY shows in matrix with purple color
- [ ] D) Holiday range creates multiple records, skips duplicates
- [x] A) Pagination works with 50+ users, has page controls
- [ ] B) Soft delete hides user, restore brings back, purge after 15 days
- [ ] F) Leave request can be created and approved (if implemented)
- [ ] G) Cross-midnight checkout works within 24h (if implemented)
- [ ] C3) Request/Approval pages load paginated data with controls
- [ ] C4) Today Activity loads paginated data with scope filter (v2.5)

# MVP Scope — Attendance Web App (MERN) (v2.2)

## Goal
Build a simple internal attendance MVP for an SME. Beginner-friendly but correct logic and extensible.

## In-scope (MVP Features)

### 1) Authentication
- Login with Email/Username + Password
- Backend returns JWT
- Frontend uses JWT for protected APIs
- Profile via /auth/me

### 2) Attendance (Check-in / Check-out)
- EMPLOYEE / MANAGER / ADMIN can check-in and check-out
- 1 attendance record per user per day (unique userId + dateKey)
- Dashboard shows today's state:
  - Not checked-in yet
  - WORKING (checked-in, not checked-out)
  - Checked-out (day completed)

### 3) My Attendance History
- View monthly attendance history (month filter YYYY-MM)
- Columns:
  - date, checkIn, checkOut, status (computed)
  - lateMinutes, workMinutes, otMinutes

### 4) Requests (Attendance Adjustment)
- Employee creates a request if they forgot or entered wrong time
- Manager/Admin approves or rejects
- On approval: backend updates attendance based on requested times

### 5) Timesheet Matrix
- Monthly matrix view:
  - Manager: team scope
  - Admin: team scope or company scope
- Cells show computed status + color key

### 6) Monthly Report + Excel Export
- Monthly report scope:
  - Manager: team
  - Admin: company or team
- Export to Excel (.xlsx)

### 7) Admin Basic Management
- Admin creates users
- Admin creates holidays

### 8) Member Management (NEW v2.2)
Admin:
- View today activity of employees (today only):
  - check-in/out times + computed status
- Filter by team or company scope
- Update member account fields (whitelist):
  - name, email, username, startDate, teamId, isActive
- Reset member password (admin manually inputs new password)
- View own profile (via /auth/me)

Manager:
- View today activity of members in the same team (today only)
- View member detail (profile fields)
- View member monthly attendance history (same-team only)

## Out-of-scope (NOT in MVP)
- Anti-fraud: GPS/QR/device/IP restriction
- Realtime notifications (WebSocket)
- Complex shifts / multiple shift types
- Break tracking
- Payroll/salary and complex OT payment rules
- Import employees from Excel/HR systems

## MVP Definition of Done
- Login works
- Attendance check-in/out logic works correctly
- Status computation matches RULES.md (especially today/future => null)
- Approving a request updates attendance correctly
- Matrix works for selected month
- Excel export works
- Member Management pages work with correct RBAC:
  - Admin company/team, Manager team-only
- Manual tests pass

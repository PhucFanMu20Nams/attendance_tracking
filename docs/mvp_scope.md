# MVP Scope — Attendance Web App (MERN) (v2.1)

## Goal
Build a simple internal attendance MVP for an SME. Beginner-friendly, but with correct logic and room to extend later.

## In-scope (MVP Features)

### 1) Authentication
- Login with Email/Username + Password
- Backend returns JWT
- Frontend uses JWT for all protected APIs
- "me" endpoint to fetch current user info

### 2) Attendance (Check-in / Check-out)
- EMPLOYEE / MANAGER / ADMIN can check-in and check-out
- 1 attendance record per user per day (unique userId + date)
- Dashboard shows today's state:
  - Not checked-in yet
  - WORKING (checked-in, not checked-out)
  - Checked-out (day completed)

### 3) My Attendance History (Employee)
- View monthly attendance history (month filter YYYY-MM)
- Columns: date, checkIn, checkOut, status (computed), lateMinutes, workMinutes, otMinutes

### 4) Requests (Attendance Adjustment)
- Employee creates a request if they forgot or entered wrong time
- Manager/Admin approves or rejects the request
- On approval: backend updates the attendance record based on requested times

### 5) Timesheet Matrix (Admin/Manager)
- Monthly matrix view:
  - Rows: employees (team scope or company scope)
  - Columns: day 1..N
  - Cells: computed status + color key

### 6) Monthly Report + Excel Export
- Monthly report with scope:
  - Manager: team
  - Admin: company or team
- Export to Excel (.xlsx)

### 7) Admin Basic Management
- Admin creates users (minimum)
- Admin creates holidays (minimum)

## Out-of-scope (NOT in MVP)
- Anti-fraud: IP whitelist / GPS / QR / device restriction
- Realtime notifications (WebSocket)
- Complex shifts (rotating shifts, multiple shift types)
- Break tracking during the day
- Payroll / salary calculation / complex OT payment rules
- Import employees from Excel / HR system

## MVP Definition of Done
- Users can login and perform check-in/out
- WORKING vs MISSING_CHECKOUT logic is correct
- Approving a request updates attendance correctly
- Timesheet matrix works for a selected month
- Excel export works
- All manual tests in TEST_CHECKLIST.md pass

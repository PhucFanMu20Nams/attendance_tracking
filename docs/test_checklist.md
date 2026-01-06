# Manual Test Checklist — Attendance App (v2.1)

## Auth
- [ ] Login with wrong password → error
- [ ] Login with correct credentials → token returned, redirect to dashboard
- [ ] GET /auth/me → returns correct user

## Attendance
- [ ] User not checked in → dashboard shows "Not checked in"
- [ ] POST /attendance/check-in → creates today's record (GMT+7 dateKey)
- [ ] Check-in twice → blocked with "Already checked in"
- [ ] POST /attendance/check-out before check-in → blocked
- [ ] POST /attendance/check-out → sets checkOutAt
- [ ] Check-out twice → blocked with "Already checked out"

## Status Logic (Critical)
- [ ] Today: checkInAt != null & checkOutAt == null → WORKING
- [ ] Past day: checkInAt != null & checkOutAt == null → MISSING_CHECKOUT
- [ ] Past workday, no record → ABSENT (excluding weekend/holiday)
- [ ] Weekend → WEEKEND/HOLIDAY
- [ ] Holiday created by admin → WEEKEND/HOLIDAY

## Rules
- [ ] Check-in <= 08:45 → ON_TIME
- [ ] Check-in >= 08:46 → LATE
- [ ] Check-out < 17:30 → EARLY_LEAVE
- [ ] Check-out > 18:30 → otMinutes > 0
- [ ] Lunch deduction:
  - [ ] checkIn < 12:00 and checkOut > 13:00 → workMinutes deduct 60
  - [ ] otherwise → no lunch deduction

## Requests
- [ ] Employee creates request (date + reason + times) → PENDING
- [ ] Manager/Admin sees pending list with correct scope
- [ ] Approve request → request APPROVED + attendance updated correctly
- [ ] Reject request → request REJECTED
- [ ] Employee sees their request status updated

## Timesheet Matrix
- [ ] Manager sees team matrix for a month → only team users
- [ ] Admin sees company matrix → all users
- [ ] Color mapping matches status

## Monthly Report + Export
- [ ] GET /reports/monthly returns correct monthly summary
- [ ] Export .xlsx downloads successfully
- [ ] File opens correctly in Excel/Google Sheets

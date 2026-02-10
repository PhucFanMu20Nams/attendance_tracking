# Manual Test Checklist — Attendance App (v2.5)

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
- [ ] Weekend → WEEKEND_OR_HOLIDAY
- [ ] Holiday created by admin → WEEKEND_OR_HOLIDAY

## Rules
- [ ] Check-in <= 08:45 → ON_TIME
- [ ] Check-in >= 08:46 → LATE
- [ ] Check-out < 17:30 → EARLY_LEAVE
- [ ] Check-out > 17:31 → otMinutes > 0
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

## Pagination Tests (NEW v2.4)

### Backend - Admin Users
- [x] GET /admin/users with no params returns default limit 20
- [x] GET /admin/users?page=2&limit=5 returns correct slice
- [x] GET /admin/users?search=john filters correctly
- [x] Response includes { items, pagination } structure

### Backend - Requests
- [ ] GET /requests/me with no params returns default limit 20
- [ ] GET /requests/me?page=2&limit=5 returns correct slice
- [ ] GET /requests/me?status=PENDING filters correctly
- [ ] Response includes { items, pagination } structure

### Backend - Approvals
- [ ] GET /requests/pending with no params returns default limit 20
- [ ] GET /requests/pending?page=2&limit=5 returns correct slice
- [ ] Pagination respects RBAC (Manager sees team only)
- [ ] Response includes { items, pagination } structure

### Frontend - RequestsPage
- [ ] Pagination controls visible when totalPages > 1
- [ ] Click page 2 → fetches page 2 data
- [ ] Create request → refetches and shows new item
- [ ] Status filter works (if implemented)

### Frontend - ApprovalsPage
- [ ] Pagination controls visible when totalPages > 1
- [ ] Click page 2 → fetches page 2 data
- [ ] Approve → refetches list, item removed
- [ ] Reject → refetches list, item removed

### Frontend - AdminMembersPage
- [x] All Users tab: Pagination controls visible when totalPages > 1
- [x] All Users tab: Click page 2 → fetches page 2 data
- [x] Search works with debounce
- [x] Total count displayed correctly

### Backend - Today Activity (NEW v2.5)
- [ ] GET /attendance/today?scope=company with no page/limit returns default limit 20
- [ ] GET /attendance/today?scope=company&page=2&limit=10 returns correct slice
- [ ] GET /attendance/today?scope=team&teamId=xxx returns team-only users
- [ ] Response includes { date, items, pagination } structure
- [ ] Manager scope forced to team (teamId from token)

### Frontend - Today Activity (NEW v2.5)
- [ ] Today Activity tab: Pagination controls visible when totalPages > 1
- [ ] Today Activity tab: Click page 2 → fetches page 2 data
- [ ] Scope filter change → resets to page 1
- [ ] Team filter change → resets to page 1
- [ ] Total count displayed correctly in header


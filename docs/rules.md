# Rules — Attendance Logic (v2.5)

Timezone: Asia/Ho_Chi_Minh (GMT+7)  
All dateKey calculations MUST use GMT+7.

## 0) Doc Priority (Conflict Resolution)
If docs conflict, resolve in this order:
1) RULES.md (this file) — logic truth
2) API_SPEC.md — endpoint shapes/behavior
3) DATA_DICTIONARY.md — DB fields/types/indexes

## 1) Workday Configuration (MVP)
- Work start: 08:30
- Work end: 17:30
- Grace: 15 minutes
  - Late starts at 08:46
- Lunch break: 60 minutes
  - Deduct lunch if a work span crosses 12:00–13:00
- OT starts after 18:30

## 2) Attendance Record Rules
- One attendance record per user per day:
  - Unique constraint: (userId + dateKey)
- No "ABSENT attendance record":
  - If user is absent, there is typically NO attendance record for that day.

Fields:
- checkInAt: required once checked in
- checkOutAt: may be null (still working or missing checkout)

## 3) Status Computation Rules (Core)
Given a dateKey and optional attendance record:

### 3.1 Weekend/Holiday
- If dateKey is weekend OR in holidays => status = WEEKEND_OR_HOLIDAY
  - This applies whether attendance exists or not (but if you allow working on holiday, you may still show checkIn/out times)

### 3.2 Today vs Future vs Past
Let "todayKey" = current date in GMT+7.

- If dateKey > todayKey (future):
  - status = null (always)
- If dateKey == todayKey (today):
  - If no attendance record => status = null (NOT ABSENT)
  - If checkInAt exists and checkOutAt is null => WORKING
  - If checkInAt and checkOutAt exist:
    - Determine late vs on time
- If dateKey < todayKey (past):
  - If no attendance record => ABSENT
  - If checkInAt exists and checkOutAt is null => MISSING_CHECKOUT
  - If checkInAt and checkOutAt exist:
    - Determine late vs on time

### 3.3 Late vs On-time vs Early Leave
Applies ONLY when both checkInAt AND checkOutAt exist (day complete):
- "On time" if checkInAt time <= 08:45 (GMT+7 local time)
- "Late" if checkInAt time >= 08:46
- "Early leave" if checkOutAt < 17:30 (GMT+7)

Status priority (current implementation):
1. LATE_AND_EARLY (NEW v2.3: if late AND early leave) — highest severity
2. LATE (if >= 08:46 but not early leave)
3. EARLY_LEAVE (if on time but left early)
4. ON_TIME (if on time and full day)

### 3.4 Missing Checkout
- Past date with checkInAt exists but checkOutAt is null => MISSING_CHECKOUT

### 3.5 Working (today)
- Today with checkInAt exists but checkOutAt is null => WORKING

## 4) Minutes Computation
### 4.1 lateMinutes
If status is LATE or WORKING (late so far):
- lateMinutes = max(0, checkInAt - 08:45)
Else 0.

### 4.2 workMinutes
If checkInAt exists:
- If checkOutAt exists:
  - raw = checkOutAt - checkInAt
  - If span crosses 12:00–13:00 => deduct 60 minutes
  - workMinutes = max(0, raw - lunchDeduct)
- If checkOutAt is null:
  - workMinutes may be 0 or computed "so far" depending on UI needs
  - For MVP reports, prefer computed only when checkOutAt exists
Else 0.

### 4.3 otMinutes
If checkOutAt exists:
- If checkOutAt time > 18:30:
  - otMinutes = minutes between 18:30 and checkOutAt (excluding lunch already handled in workMinutes if needed)
Else 0.

## 5) Requests Adjustment Rules
Requests must be on the same dateKey (GMT+7) as the request.date.
- requestedCheckInAt and/or requestedCheckOutAt must belong to that dateKey
- If both exist, out > in

On approve:
- Update or create attendance record for that dateKey
- Apply requested times (set checkInAt/checkOutAt)

## 6) Timesheet Matrix Rules
- Matrix cell status uses the same computed status rules above.
- colorKey is derived from status:
  - WEEKEND_OR_HOLIDAY => grey
  - ON_TIME => green
  - LATE => orange/red
  - EARLY_LEAVE => yellow
  - LATE_AND_EARLY => purple (NEW v2.3)
  - WORKING => blue
  - MISSING_CHECKOUT => yellow (darker)
  - ABSENT => grey (lighter shade, distinct from weekend)
  - LEAVE => cyan (NEW v2.3)
  - null => empty/neutral

## 7) Member Management Rules (NEW v2.2)
### 7.1 "Today Activity" View
- "Today activity" always refers to todayKey in GMT+7.
- If an employee has no attendance record today:
  - status must be null (NOT ABSENT)

### 7.4 Pagination Rules (NEW v2.5)
- Default limit: 20, max limit: 100
- Paginated endpoints: `/admin/users`, `/requests/me`, `/requests/pending`, `/attendance/today`
- Pattern: count total → clamp page → skip/limit
- Response format: `{ items, pagination: { page, limit, total, totalPages } }`
- Clamping: if requested page > totalPages, return last page with items

### 7.2 Scope & RBAC
- ADMIN:
  - can view company scope OR filter by team
  - can update basic member fields (whitelist)
  - can reset password (admin enters new password)
- MANAGER:
  - can only view members in the same team
  - can view member detail + monthly attendance of same-team only
- Anti-IDOR is mandatory on any endpoint that accepts userId:
  - Manager must be blocked from accessing other-team users (403).

### 7.3 Soft Delete Implementation (NEW v2.3)
- Query pattern: `{ deletedAt: null }` (requires one-time migration)
- Migration script (run once):
  ```js
  db.users.updateMany(
    { deletedAt: { $exists: false } },
    { $set: { deletedAt: null } }
  );
  ```
- Purge job: Cascade delete attendances + requests when purging users:
  ```js
  const userIds = usersToDelete.map(u => u._id);
  await Attendance.deleteMany({ userId: { $in: userIds } });
  await Request.deleteMany({ userId: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  ```

## 8) Leave Request Rules (NEW v2.3)
### 8.1 Leave Request Type
- Request can be type `ADJUST_TIME` or `LEAVE`
- LEAVE = full-day leave only (no attendance for that day)
- LEAVE request requires: leaveStartDate, leaveEndDate (YYYY-MM-DD)
- Optional: leaveType (ANNUAL | SICK | UNPAID)

### 8.2 Leave vs Attendance
- LEAVE is for days with **no attendance**
- If attendance already exists for a date:
  - Block LEAVE request => 400 "Already checked in for date X, use ADJUST_TIME instead"
- To request early leave (already checked in): use ADJUST_TIME with requestedCheckOutAt

### 8.3 Leave Status Priority
- Priority order (highest to lowest):
  1. WEEKEND_OR_HOLIDAY (always shows for weekends/holidays)
  2. LEAVE (if approved leave exists for workday)
  3. ABSENT (workday with no attendance and no leave)

### 8.4 Leave Spanning Weekends
- Leave CAN span weekends (e.g., Mon to next Mon)
- Status per day in range:
  - Weekend/holiday => WEEKEND_OR_HOLIDAY (not LEAVE)
  - Workday => LEAVE
- Leave days count = workdays only (exclude weekends/holidays)

### 8.5 Leave in Reports
- Leave days count separately from absent days
- Leave days should NOT count as late

### 8.6 Leave Implementation (Design Decision)
- Storage: Query `requests` collection (no fake attendance records)
- Status compute: Caller must fetch approved leaves and pass `leaveDates: Set<string>` to compute function
- Signature: `computeAttendance(record, holidayDates, leaveDates = new Set())`

## 9) Cross-midnight OT Rules (NEW v2.3 - PLANNED)
### 9.1 Definition
- Cross-midnight: checkOutAt is on the next calendar day (GMT+7)
- Example: checkIn 2026-01-23 08:00, checkOut 2026-01-24 02:00

### 9.2 Checkout Logic
- Find active session (checkInAt exists, checkOutAt null) instead of by dateKey
- Allow checkout within 24h of checkIn
- Configurable via env: `CHECKOUT_GRACE_HOURS` (default: 24)

### 9.3 OT Calculation
- OT = minutes from 18:30 to checkOut (even if next day)
- Example: 18:30 to 02:00 next day = 7.5 hours OT

### 9.4 Matrix Display
- Attendance record belongs to check-in date
- Cross-midnight shows "WORKING" until checked out

### 9.5 Month Filter Behavior
- `/attendance/me?month=YYYY-MM` returns records where `date` (check-in date) is in that month
- If checkIn = Jan 31, checkOut = Feb 1:
  - Appears in `month=2026-01` (by check-in date)
  - `checkOutAt` shows Feb 1 ISO as-is
  - Does NOT appear in `month=2026-02`

### 9.6 workMinutes / Lunch for Long Shifts
- workMinutes = checkOutAt - checkInAt
- Lunch: deduct 60 mins ONCE if shift spans 12:00–13:00 on check-in day
- No second lunch deduction for overnight shifts
- No workMinutes cap (MVP): 20h shift => 1140 mins

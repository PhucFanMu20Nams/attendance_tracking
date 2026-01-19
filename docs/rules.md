# Rules — Attendance Logic (v2.2)

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

### 3.3 Late vs On-time
- "On time" if checkInAt time <= 08:45 (GMT+7 local time)
- "Late" if checkInAt time >= 08:46

Return status:
- ON_TIME
- LATE

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
  - WORKING => blue
  - MISSING_CHECKOUT => yellow
  - ABSENT => grey (lighter shade, distinct from weekend)
  - null => empty/neutral

## 7) Member Management Rules (NEW v2.2)
### 7.1 "Today Activity" View
- "Today activity" always refers to todayKey in GMT+7.
- If an employee has no attendance record today:
  - status must be null (NOT ABSENT)

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

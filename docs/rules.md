# Business Rules — Attendance App (v2.1)

## Timezone
- Fixed timezone: Asia/Ho_Chi_Minh (GMT+7)
- "today" and "date key" are computed in GMT+7

## Working Schedule (Shift)
- Shift name: Office hours
- Start: 08:30
- End: 17:30
- Lunch window: 12:00 – 13:00
- Grace period: 15 minutes

## On-time / Late
- ON_TIME if checkInAt <= 08:45 (GMT+7)
- LATE if checkInAt >= 08:46 (GMT+7)

## Early Leave
- EARLY_LEAVE if checkOutAt < 17:30 (GMT+7)

## Overtime (OT)
- If checkOutAt > 18:30 → otMinutes = minutes(checkOutAt - 18:30)
- OT has a flag `otApproved` (Manager/Admin approves at month-end)
- MVP: otApproved defaults to false (or null). Report can still show otMinutes; “approved OT minutes” can be added later.

## Lunch Deduction (Beginner-friendly)
- Deduct 60 minutes if:
  - checkInAt < 12:00 AND checkOutAt > 13:00 (GMT+7)
- If the work interval does NOT span 12:00–13:00 → do not deduct lunch

## Date Key
- Each attendance record stores `date` as "YYYY-MM-DD" (computed in GMT+7)
- Unique constraint: (userId, date)

## Status Definitions
- WORKING: date == today AND checkInAt != null AND checkOutAt == null
- ON_TIME: checkInAt <= 08:45 (when checkInAt exists and checkOutAt exists)
- LATE: checkInAt >= 08:46 (when checkInAt exists and checkOutAt exists)
- EARLY_LEAVE: checkOutAt < 17:30 (when checkOutAt exists)
- MISSING_CHECKOUT: date < today AND checkInAt != null AND checkOutAt == null
- ABSENT: date < today AND no attendance record exists for that date (workday only)
- WEEKEND/HOLIDAY: non-working day (weekend or in holidays list)
- **null (no status)**: date >= today AND no attendance record exists (not yet checked in or future date)

## Status Computation Rule (Critical)
Assume "today" is computed in GMT+7.

1) If date is Weekend/Holiday → WEEKEND/HOLIDAY
2) If date > today (future):
   - No attendance record → status = **null** (blank cell, no status yet)
3) If date == today:
   - checkInAt != null & checkOutAt == null → WORKING
   - checkIn/out both exist → compute ON_TIME/LATE/EARLY_LEAVE/OT normally
   - not checked in yet → status = **null** (do NOT mark ABSENT, employee may still arrive)
4) If date < today (past):
   - no record → ABSENT
   - checkInAt exists but checkOutAt is null → MISSING_CHECKOUT
   - checkIn/out exist → compute normally

## UI Colors (Timesheet Matrix)
- Green: ON_TIME
- Red: LATE
- Yellow: EARLY_LEAVE or MISSING_CHECKOUT
- Gray: WEEKEND/HOLIDAY
- White: ABSENT (past workday, no record)
- White: WORKING (MVP) — may change to Blue later
- White: **null/blank** (today not checked in yet, or future date)

> **Note for Frontend:** When `status === null`, check if `date >= today` to distinguish:
> - `date > today` → future date (render blank)
> - `date === today` → pending/not yet checked in (may show subtle indicator)

## Requests (Attendance Adjustment)
- MVP does not support overnight shifts
- When adjusting times, requestedCheckInAt/requestedCheckOutAt (if provided) must be on the same `date` (dateKey) in GMT+7
- This prevents accidental cross-day timestamps that inflate workMinutes/otMinutes

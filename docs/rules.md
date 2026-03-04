# Rules — Attendance Logic (v2.8)

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
- OT starts after 17:31

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

### 3.6 Missing Check-in (NEW v2.6)
- checkOutAt exists but checkInAt is null => MISSING_CHECKIN
- This is an edge case (data corruption or manual entry error)

### 3.7 Unknown (NEW v2.6)
- Returned for invalid/corrupted data scenarios:
  - null or undefined attendance record
  - Empty or invalid dateKey
  - checkOutAt < checkInAt (reversed timestamps)
- Acts as a fail-safe to prevent misclassification

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
- If checkOutAt time > 17:31:
  - otMinutes = minutes between 17:31 and checkOutAt (excluding lunch already handled in workMinutes if needed)
- **Exception (Weekend/Holiday):**
  - otMinutes = total work time (checkOut - checkIn, minus lunch deduction)
  - No dependency on 17:31 threshold
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
  - MISSING_CHECKIN => red (darker) (NEW v2.6)
  - ABSENT => grey (lighter shade, distinct from weekend)
  - LEAVE => cyan (NEW v2.3)
  - UNKNOWN => grey (dashed border) (NEW v2.6)
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
- OT = minutes from 17:31 to checkOut (even if next day)
- Example: 17:31 to 02:00 next day = 8.5 hours OT

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

---

## 10) OT Request Rules (NEW v2.6)

### 10.1 Overview
**Core Change:** OT (overtime) is now **approval-based**, not automatic.

**Old Behavior (v2.5):**
- User checks out after 17:31 → OT automatically calculated
- No request/approval needed

**New Behavior (v2.6):**
- User must create `OT_REQUEST` BEFORE checkout
- Manager/Admin approves → OT calculated
- No approval → workMinutes capped at 17:30, OT = 0

---

### 10.2 OT Request Creation Rules

**Who:** EMPLOYEE | MANAGER | ADMIN (any role can request OT for themselves)

**When:**
- ✅ Must request BEFORE checkout (E2: no retroactive)
- ✅ Can request for today or future dates (E1: advance notice allowed)
- ❌ Cannot request for past dates

**Required Fields:**
- `date`: "YYYY-MM-DD" (today or future)
- `estimatedEndTime`: Date (ISO timestamp)
- `reason`: String (why OT is needed)

**Validation Rules:**

1. **Date Validation:**
   - `date >= todayKey` (no retroactive requests)
   - Must be valid YYYY-MM-DD format

2. **Time Validation:**
   - `estimatedEndTime` must be on same calendar day (GMT+7) as `date`
   - `estimatedEndTime` must be > 17:31 on that date
   - Minimum OT duration: 30 minutes (B1)
     - Calculated as: `estimatedEndTime - 17:31 >= 30 minutes`

3. **State Validation:**
   - Cannot create if user already checked out for that date
   - Error: "Cannot request OT after checkout"

4. **Quota Limits:**
   - Maximum 31 PENDING OT requests per month per user (D1)
   - Month calculated from `date` field

**Auto-Extend Feature (D2):**
- If PENDING OT request exists for same (userId, date):
  - UPDATE existing request instead of creating new one
  - Updates: `estimatedEndTime`, `reason`
  - Keeps same `_id`, `status`, `createdAt`
- Example:
  ```
  Request 1: date=2026-02-05, estimatedEndTime=20:00, status=PENDING
  Request 2: date=2026-02-05, estimatedEndTime=22:00 (same date)
  → Request 1 updated to estimatedEndTime=22:00
  → Only 1 request exists
  ```

---

### 10.3 Cross-Midnight OT (I1)

**Rule:** Cross-midnight OT uses **1 request** anchored by check-in date.

**Definition:**
- `date` remains the check-in date.
- `estimatedEndTime` may be:
  - same day as `date`, or
  - immediate next day (`date + 1`) only when time is in `00:00-07:59` (GMT+7).

**Example:**
```
Shift: 2026-02-05 08:30 → 2026-02-06 02:00

Request:
OT_REQUEST: date=2026-02-05, estimatedEndTime=2026-02-06T02:00:00+07:00

Result:
- Attendance (2/5): otApproved=true
- OT duration calculated from 17:31 (2/5) to 02:00 (2/6)
```

**Validation:**
- Reject if `estimatedEndTime` is not on `date` or `date + 1`.
- If `estimatedEndTime` is on `date + 1`, reject when time is `>= 08:00`.

---

### 10.3.1 OT Request Timing Policy (STRICT) 🚫

**Core Principle:** OT must be requested **BEFORE** the overtime work begins

**Policy Details:**
- ✅ **Future requests allowed:** Can request OT for today (future time) or any future date
- ❌ **Retroactive requests blocked:** Cannot request OT for time that has already passed
- ⏰ **Same-day rule:** For today's date, `estimatedEndTime` must be in the future

**Implementation (P1-2 Fix):**
```javascript
// Validation runs AFTER past date check, BEFORE OT period check
if (date === todayKey) {
  const now = Date.now();
  if (estimatedEndTime <= now) {
    throw Error('Cannot create OT request for past time');
  }
}
```

**Examples:**

| Current Time | Request Date | Estimated End Time | Result | Reason |
|--------------|--------------|-------------------|--------|---------|
| 16:00 | Today | 19:00 | ✅ ALLOW | Future time |
| 23:00 | Today | 18:00 | ❌ REJECT | Past time (5 hours ago) |
| 23:00 | Today | 23:00 | ❌ REJECT | Current time (not future) |
| 23:00 | Today | 23:30 | ✅ ALLOW | Future time (30 min ahead) |
| 10:00 | Tomorrow | 19:00 | ✅ ALLOW | Future date (any time OK) |
| 10:00 | Yesterday | 19:00 | ❌ REJECT | Past date |

**Rationale:**
1. **Data Integrity:** Prevent retroactive OT recording abuse
2. **Manager Approval:** Managers must approve OT **before** overtime work
3. **Audit Trail:** Clear timestamp showing OT was planned, not fabricated
4. **Fair Process:** All employees follow same "request first" rule

**Exception Handling:**
- If employee forgot to request: Contact manager for manual adjustment
- Emergency OT: Manager can create ADJUST_TIME request after the fact (admin override)
- System downtime: Manager can approve retroactive requests case-by-case

**Error Message:**
```
Cannot create OT request for past time.
OT must be requested before the estimated end time.
Current time: 2/10/2026, 11:00:00 PM (GMT+7)
Requested time: 2/10/2026, 6:00:00 PM (GMT+7)
If you forgot to request, please contact your manager.
```

**Business Impact:**
- Reduces OT fraud risk
- Improves planning and resource allocation
- Maintains clear audit trail for compliance
- Enforces proactive communication between employees and managers

---

### 10.4 OT Approval Workflow

**Who Can Approve:**
- **MANAGER:** Can approve OT requests from users in same team only (RBAC)
- **ADMIN:** Can approve any OT request company-wide

**Approval Effect:**
```javascript
// When OT_REQUEST approved:
attendance.otApproved = true  // for that date

// If attendance doesn't exist yet (user not checked in):
// - Flag stored in Request record
// - Applied automatically on check-in
```

**State Transitions:**
```
PENDING → APPROVED (manager/admin action)
PENDING → REJECTED (manager/admin action)
PENDING → DELETED (employee cancels via DELETE /api/requests/:id)
```

> **Note:** Cancellation deletes the request from the database entirely.
> There is no `CANCELLED` status in the enum. See §10.7 for details.

**No Rejection Reason Required (G2):**
- Rejection doesn't require explanation
- But recommended to communicate separately

---

### 10.5 OT Calculation Rules (STRICT - A1)

**Core Rule:** OT only calculated if `attendance.otApproved = true`

#### Scenario A: WITH OT Approval ✅
```
date: 2026-02-05
checkInAt: 08:30
checkOutAt: 20:00
otApproved: true

Calculation:
- workMinutes = 08:30 to 17:30 = 480 minutes (minus lunch 60)
- otMinutes = 17:31 to 20:00 = 149 minutes
- Total working time = 480 + 149 = 629 minutes
```

#### Scenario B: WITHOUT OT Approval ❌
```
date: 2026-02-05
checkInAt: 08:30
checkOutAt: 20:00
otApproved: false

Calculation:
- workMinutes = 08:30 to 17:30 = 480 minutes (CAPPED at 17:30)
- otMinutes = 0 (no approval)
- Time 17:30-20:00: LOST (not counted, not paid)
- Total working time = 480 minutes only
```

**Implementation:**
```javascript
// In computeWorkMinutes()
if (!otApproved) {
  const endOfShift = createTimeInGMT7(dateKey, 17, 30);
  effectiveCheckOut = min(checkOutAt, endOfShift);
  // Work capped at 17:30
}

// In computeOtMinutes()
if (!otApproved) {
  return 0;  // No OT without approval
}
```

#### Scenario C: Weekend/Holiday ✅
```
date: 2026-02-08 (Saturday)
checkInAt: 08:30
checkOutAt: 11:00
otApproved: false (irrelevant for weekend/holiday)

Calculation:
- workMinutes = 08:30 to 11:00 = 150 minutes
- otMinutes = 150 minutes (ALL work time = OT)
- Weekend/holiday rule: No approval needed, no 17:31 threshold
```

**Key Points:**
- A1 (STRICT): No grace period - về sau 17:30 phải có approval
- B2: Actual OT = calculated at checkout (not estimated time from request)
- C1: Automatic calculation based on actual checkout time
- F1 (Weekend/Holiday Exception): All work time = OT time

---

### 10.6 Weekend/Holiday Exception (F1)

**Special Case:** Weekend/holiday OT does NOT require OT_REQUEST.

**Rationale:**
- Working on weekend/holiday = exceptional case
- Usually pre-planned and manager-aware
- Simplified workflow for special circumstances

**Behavior:**
```javascript
// Weekend/Holiday logic (updated v2.8)
if (isWeekend(dateKey) || holidayDates.has(dateKey)) {
  // ALL work time = OT time (no 17:31 threshold)
  const totalWorkTime = computeWorkMinutes(dateKey, checkIn, checkOut, true);
  workMinutes = totalWorkTime;
  otMinutes = totalWorkTime;  // Same value: all work = OT
  // No OT_REQUEST needed
}
```

**Key Change from v2.7:**
- Weekend/holiday OT no longer uses 17:31 threshold
- ALL work time = OT time (including morning/afternoon shifts)
- Example: 08:00-11:00 Sunday = 180min work, 180min OT

**This applies to:**
- Saturday/Sunday
- Public holidays (from Holiday model)
- Company-specific holidays

---

### 10.7 OT Cancellation Rules (C2)

**Who Can Cancel:**
- Request owner (userId match) only
- Cannot cancel others' requests

**When Can Cancel:**
- Status = PENDING only
- Cannot cancel APPROVED or REJECTED requests

**Effect:**
- Request deleted from database
- If `otApproved` already set on attendance:
  - Flag remains (doesn't auto-revert)
  - Admin must manually adjust if needed

**Endpoint:**
```
DELETE /api/requests/:id
- Returns 200 if successful
- Returns 404 if not found or already processed
```

---

### 10.8 Check-In Integration

**Automatic otApproved Detection:**

When user checks in, system checks for approved OT request:
```javascript
// In checkIn()
const approvedOtRequest = await Request.findOne({
  userId,
  type: 'OT_REQUEST',
  date: todayKey,
  status: 'APPROVED'
});

if (approvedOtRequest) {
  attendance.otApproved = true;  // Auto-set on check-in
}
```

**Scenarios:**

1. **Request → Approve → Check-In:**
   - OT request created & approved
   - User checks in later
   - `otApproved` set automatically ✅

2. **Check-In → Request → Approve:**
   - User checks in first
   - Creates OT request
   - Manager approves
   - `otApproved` updated on attendance record ✅

3. **No Request:**
   - User checks in
   - No OT request exists
   - `otApproved` remains false
   - Checkout capped at 17:30 ❌

---

### 10.9 Reporting Metrics (H2)

**Monthly Report Enhancement:**

Users now have 3 OT metrics:

1. **totalOtMinutes:** All approved OT worked (paid OT)
2. **approvedOtMinutes:** Same as total (for clarity)
3. **unapprovedOtMinutes:** Time worked after 17:30 WITHOUT approval

**Calculation:**
```javascript
for (const record of records) {
  if (record.otApproved) {
    approvedOtMinutes += computeOtMinutes(record.date, record.checkOutAt, true);
  } else {
    // Calculate potential OT (what would have been)
    if (record.checkOutAt > endOfShift) {
      unapprovedOtMinutes += computePotentialOtMinutes(record.date, record.checkOutAt);
    }
  }
}
```

**Purpose:**
- Track compliance (unapproved OT = potential policy violation)
- Visibility for managers
- Audit trail for HR

**Example Report:**
```json
{
  "userId": "123",
  "name": "John Doe",
  "totalOtMinutes": 450,        // Approved OT (paid)
  "approvedOtMinutes": 450,     // Same as total
  "unapprovedOtMinutes": 120    // Worked without approval (not paid)
}
```

---

### 10.10 Validation Summary Table

| Rule | Field | Validation | Error Message |
|------|-------|------------|---------------|
| E2 | date | >= todayKey | "Cannot create OT request for past dates" |
| I1 | estimatedEndTime | same calendar day as date | "Cross-midnight OT requires separate requests" |
| - | estimatedEndTime | > 17:31 | "OT must start after 17:31" |
| B1 | estimatedEndTime | >= 17:31 + 30 mins | "Minimum OT duration is 30 minutes" |
| E2 | checkout | must not exist | "Cannot request OT after checkout" |
| D1 | quota | < 31 pending/month | "Maximum 31 pending OT requests per month" |

---

### 10.11 Edge Cases & FAQs

**Q: User works 17:30-18:30 without OT request. What happens?**
- Work capped at 17:30
- 17:30-18:30 time is LOST (not counted)
- User should have requested OT beforehand

**Q: OT request approved but user leaves at 18:00?**
- OT calculated 17:31-18:00 = 29 minutes (less than minimum but still counted)
- Request status remains APPROVED (no automatic update)

**Q: Can request OT for next week?**
- Yes (E1: advance notice allowed)
- Common for planned deployments, projects

**Q: What if 32nd OT request in a month?**
- Error 400: "Maximum 31 pending OT requests per month reached"
- Must wait for approval/rejection of existing requests

**Q: Can admin force-set otApproved without request?**
- No - must have OT_REQUEST record for audit trail
- Ensures all OT is documented and approved

**Q: User forgets to request OT, can request after checkout?**
- No (E2: no retroactive requests)
- Must be handled as exception by HR/manager manually

---

### 10.12 Priority & Conflict Resolution

**Document Hierarchy:**
1. This section (§10) - OT Request Rules (v2.6)
2. Section §4.3 - otMinutes computation (updated for otApproved)
3. Section §9 - Cross-midnight OT (existing rules)

**In Case of Conflict:**
- OT approval requirement (§10.5) OVERRIDES automatic calculation (§4.3)
- Weekend/holiday exception (§10.6) takes precedence over approval requirement
- Cross-midnight rules (§10.3) align with existing §9 structure

---

## 11) Auto-Close Scheduler Rules (NEW v2.7)

### 11.1 Overview
**Purpose:** Automatically close stale attendance sessions left open overnight.

**Problem:** Employees sometimes forget to check out, leaving `checkOutAt = null`. This creates data quality issues:
- Inaccurate work hours calculation
- Cannot detect late/early patterns
- Blocks next-day check-in until manually resolved

**Solution:** Midnight scheduler auto-closes overdue open sessions, flags them for reconciliation.

---

### 11.2 Scheduler Behavior

**Trigger:** Runs automatically at midnight (00:00 GMT+7) every day.

**Target Query:**
```javascript
// Find all open sessions from dates BEFORE today
{
  checkOutAt: null,
  date: { $lt: todayKey }  // e.g., if today=2026-02-06, finds 2026-02-05 and earlier
}
```

**Auto-Close Action:**
For each stale session:
1. Set `checkOutAt` to midnight of the **next day** after check-in date
   - Example: checkIn on 2026-02-05 08:30 → checkOut set to 2026-02-06 00:00:00
2. Set `closeSource = 'SYSTEM_AUTO_MIDNIGHT'`
3. Set `needsReconciliation = true`
4. Create AuditLog record (type: STALE_OPEN_SESSION)

**Catch-Up on Restart:**
- When server restarts, runs catch-up for any missed days
- Ensures no gaps even if server was offline at midnight

---

### 11.3 Grace Period Configuration

**Environment Variable:** `CHECKOUT_GRACE_HOURS`
- **Range:** 1-48 hours
- **Default:** 24 hours
- **Purpose:** Defines maximum time from check-in to auto-close

**Validation:**
```javascript
const graceHours = parseInt(process.env.CHECKOUT_GRACE_HOURS) || 24;
if (graceHours < 1 || graceHours > 48) {
  throw new Error('CHECKOUT_GRACE_HOURS must be 1-48');
}
```

**Example:**
- Grace = 24h
- CheckIn: 2026-02-05 08:30
- Auto-close triggers: 2026-02-06 00:00 (15.5h later, within grace)
- CheckOut set to: 2026-02-06 00:00

---

### 11.4 Reconciliation Workflow

**Step 1: Auto-Close (Midnight)**
```javascript
attendance = {
  date: "2026-02-05",
  checkInAt: 2026-02-05T08:30:00+07:00,
  checkOutAt: 2026-02-06T00:00:00+07:00,  // Set by system
  closeSource: "SYSTEM_AUTO_MIDNIGHT",
  needsReconciliation: true
}
```

**Step 2: Employee Action (Next Day)**
Employee has two options:
1. **Submit FORGOT_CHECKOUT request** with actual checkout time (see §12)
2. **Accept auto-close** (do nothing, becomes permanent after 7 days)

**Step 3: Manager Approval** (if FORGOT_CHECKOUT submitted)
- Approve → attendance updated with actual time, `needsReconciliation = false`
- Reject → auto-close time remains, `needsReconciliation = false` (locked)

**Step 4: Admin Escalation** (optional)
- If employee doesn't act within submission deadline (7 days)
- Admin can manually force-checkout via `POST /api/admin/attendance/:id/force-checkout`

---

### 11.5 API Endpoints (Employee-Facing)

**GET /api/attendance/open-session**

**Purpose:** Retrieve user's own open sessions and reconciliation items.

**Auth:** Any authenticated user

**Response:**
```json
{
  "openSessions": [
    {
      "_id": "...",
      "date": "2026-02-06",
      "checkInAt": "2026-02-06T08:30:00.000Z",
      "hoursOpen": 3.5
    }
  ],
  "reconciliationItems": [
    {
      "_id": "...",
      "date": "2026-02-05",
      "checkInAt": "2026-02-05T08:30:00.000Z",
      "checkOutAt": "2026-02-06T00:00:00.000Z",
      "closeSource": "SYSTEM_AUTO_MIDNIGHT",
      "submitDeadline": "2026-02-13T00:00:00.000Z",
      "hoursUntilDeadline": 156,
      "isOverdue": false,
      "hasPendingRequest": false
    }
  ]
}
```

**Use Case:**
- Dashboard displays "You have 1 session needing reconciliation"
- Employee clicks → opens FORGOT_CHECKOUT request form

---

### 11.6 Admin Queue (see §12.5)

Admins have dedicated endpoint to view all stale sessions company-wide:
- `GET /api/admin/attendance/open-sessions?status=all|open|reconciliation`
- Includes enriched data: queue status, deadlines, escalation flags

---

### 11.7 Edge Cases

**Q: What if employee checks in at 23:00 and forgets to check out?**
- Midnight scheduler runs at 00:00 (1 hour later)
- Session auto-closed with checkOut=00:00
- Work hours = 1 hour (23:00-00:00)
- Employee can submit FORGOT_CHECKOUT with actual time

**Q: What if server is offline at midnight?**
- Catch-up runs on next startup
- Processes all missed days in batch
- No sessions lost

**Q: Can employee check in again if auto-closed?**
- Yes, auto-close doesn't block next-day check-in
- New session created for new date

**Q: What if manager approves FORGOT_CHECKOUT for 2026-02-05 18:00?**
- Attendance updated: checkOut=18:00
- Work hours recalculated: 08:30-18:00 = 8.5h (minus lunch)
- `needsReconciliation = false`
- `closeSource = 'ADJUST_APPROVAL'`

---

## 12) FORGOT_CHECKOUT Workflow Rules (NEW v2.7)

### 12.1 Overview
**Purpose:** Allow employees to reconcile attendance sessions that were auto-closed at midnight.

**Use Case:**
Employee worked until 18:00 but forgot to check out. Next morning:
1. System auto-closed session at midnight (00:00)
2. Employee creates FORGOT_CHECKOUT request with actual time (18:00)
3. Manager reviews + approves
4. Attendance updated to reflect actual work hours

**Request Type:** `ADJUST_TIME` with `adjustMode = 'FORGOT_CHECKOUT'`

---

### 12.2 Creation Rules

**Required Fields:**
- `type`: "ADJUST_TIME"
- `adjustMode`: "FORGOT_CHECKOUT"
- `targetAttendanceId`: ObjectId of the auto-closed attendance
- `requestedCheckOutAt`: Date (actual checkout time)
- `date`: "YYYY-MM-DD" (must match target attendance date)
- `reason`: String (explanation)

**Forbidden Fields:**
- `requestedCheckInAt`: Must be null (cannot change check-in time)

**Validation Rules:**

1. **Target Validation:**
   ```javascript
   const target = await Attendance.findById(targetAttendanceId);
   if (!target) throw Error('Target attendance not found');
   if (target.userId.toString() !== req.userId) throw Error('Not your attendance');
   ```

2. **Auto-Close Check:**
   ```javascript
   if (target.closeSource !== 'SYSTEM_AUTO_MIDNIGHT') {
     throw Error('Target was not auto-closed');
   }
   if (!target.needsReconciliation) {
     throw Error('Target does not need reconciliation');
   }
   ```

3. **Time Validation:**
   - `requestedCheckOutAt` must be >= `target.checkInAt`
   - `requestedCheckOutAt` must be on same calendar day as `date` OR next day (cross-midnight)
   - `requestedCheckOutAt` must be < now (no future times)

4. **Duplicate Prevention:**
   - If PENDING FORGOT_CHECKOUT request exists for same targetAttendanceId → reject
   - Error: "You already have a pending request for this session"

5. **Bypass Weekend/Holiday Restriction:**
   - FORGOT_CHECKOUT requests bypass the "no weekend/holiday adjustment" rule
   - Rationale: Original check-in was legitimate, just forgot to check out

---

### 12.3 Approval Workflow

**Additional Validation at Approval Time:**

1. **Re-check Reconciliation Status:**
   ```javascript
   const target = await Attendance.findById(request.targetAttendanceId);
   if (!target.needsReconciliation) {
     // Session already reconciled by another request or admin
     await Request.findByIdAndUpdate(requestId, {
       status: 'REJECTED',
       rejectionReason: 'SESSION_ALREADY_RECONCILED',
       approvedBy: approverId,
       approvedAt: new Date()
     });
     return; // Auto-reject
   }
   ```

2. **Update Target Attendance:**
   ```javascript
   await Attendance.findByIdAndUpdate(target._id, {
     checkOutAt: request.requestedCheckOutAt,
     closeSource: 'ADJUST_APPROVAL',
     closedByRequestId: request._id,
     needsReconciliation: false
   });
   ```

3. **Mark Request Approved:**
   ```javascript
   request.status = 'APPROVED';
   request.approvedBy = approverId;
   request.approvedAt = new Date();
   await request.save();
   ```

**Result:**
- Attendance now has correct checkout time
- Work hours recalculated with actual time
- Audit trail preserved (closedByRequestId links to request)

---

### 12.4 Rejection Workflow

**Manager rejects FORGOT_CHECKOUT request:**

1. **Update Request:**
   ```javascript
   request.status = 'REJECTED';
   request.approvedBy = approverId;
   request.approvedAt = new Date();
   await request.save();
   ```

2. **Update Attendance:**
   ```javascript
   await Attendance.findByIdAndUpdate(request.targetAttendanceId, {
     needsReconciliation: false  // Lock the auto-close time
   });
   ```

**Result:**
- Auto-close time becomes permanent
- Employee cannot submit another FORGOT_CHECKOUT for same session
- Work hours calculated based on midnight checkout

---

### 12.5 Admin Queue & Escalation

**GET /api/admin/attendance/open-sessions**

**Query Params:**
- `status`: `all` | `open` | `reconciliation` (default: `all`)
- `limit`: Number (default: 100, max: 1000)

**Response Enrichment:**
```json
{
  "items": [
    {
      "_id": "...",
      "userId": "...",
      "userName": "John Doe",
      "employeeCode": "NV001",
      "date": "2026-02-05",
      "checkInAt": "2026-02-05T08:30:00.000Z",
      "checkOutAt": "2026-02-06T00:00:00.000Z",
      "closeSource": "SYSTEM_AUTO_MIDNIGHT",
      "needsReconciliation": true,
      "queueStatus": "ESCALATED",
      "submitDeadline": "2026-02-13T00:00:00.000Z",
      "hoursUntilDeadline": 12,
      "isOverdue": false,
      "isEscalated": true,
      "pendingRequestId": "...",
      "pendingRequestCreatedAt": "2026-02-05T10:00:00.000Z",
      "pendingRequestAge": 5
    }
  ],
  "summary": {
    "totalOpen": 3,
    "totalReconciliation": 12,
    "escalated": 2,
    "overdue": 1
  }
}
```

**Queue Status Logic:**
- `OPEN`: Open session (checkOutAt=null) from today or earlier
- `PENDING_RECONCILIATION`: needsReconciliation=true, no pending request, not overdue
- `ESCALATED`: needsReconciliation=true, pending request older than 4 hours
- `CLOSED`: checkOutAt exists, no reconciliation needed

**Escalation Trigger:**
- FORGOT_CHECKOUT request submitted but not approved/rejected within 4 hours
- Admin can intervene or follow up with manager

---

### 12.6 Admin Force Checkout

**POST /api/admin/attendance/:id/force-checkout**

**Purpose:** Manually close a session (alternative to FORGOT_CHECKOUT workflow).

**Request Body:**
```json
{
  "checkOutAt": "2026-02-05T18:30:00.000Z",
  "reason": "Manager confirmed via phone call"
}
```

**Validation:**
- `checkOutAt` must be >= attendance.checkInAt
- `checkOutAt` must be <= now
- Admin only (RBAC)

**Effect:**
```javascript
attendance.checkOutAt = req.body.checkOutAt;
attendance.closeSource = 'ADMIN_FORCE';
attendance.needsReconciliation = false;
```

**Use Case:**
- Employee on leave cannot submit request
- Manager confirmed actual time verbally
- Deadline passed, no request submitted

---

### 12.7 Submission Deadline

**Configuration:** `ADJUST_REQUEST_MAX_DAYS` (env variable)
- **Range:** 1-30 days
- **Default:** 7 days
- **Applies to:** FORGOT_CHECKOUT requests

**Calculation:**
```javascript
const maxDays = parseInt(process.env.ADJUST_REQUEST_MAX_DAYS) || 7;
const deadline = addDays(attendance.date, maxDays);
```

**Example:**
- Attendance date: 2026-02-05
- Max days: 7
- Deadline: 2026-02-12 23:59:59
- After deadline: Cannot submit FORGOT_CHECKOUT, admin intervention required

---

### 12.8 Edge Cases & FAQs

**Q: Can employee submit FORGOT_CHECKOUT for a session they manually checked out?**
- No. Target must have `closeSource = 'SYSTEM_AUTO_MIDNIGHT'`
- Manual checkout has `closeSource = 'USER_CHECKOUT'` or null

**Q: What if employee submits FORGOT_CHECKOUT with earlier time than auto-close?**
- Example: auto-closed at 00:00, requests 18:00
- Allowed. New checkout time is earlier, which is valid.
- Work hours reduced accordingly.

**Q: Can employee change check-in time via FORGOT_CHECKOUT?**
- No. `requestedCheckInAt` is forbidden.
- Check-in time cannot be changed (system recorded actual check-in, that's accurate).

**Q: What if admin force-closes while FORGOT_CHECKOUT is pending?**
- Admin force-close sets `needsReconciliation = false`
- Pending request auto-rejected at next approval attempt (validation fails)
- Error: "SESSION_ALREADY_RECONCILED"

**Q: What happens after rejection?**
- `needsReconciliation` set to false
- Auto-close time becomes permanent
- Employee **cannot** submit another FORGOT_CHECKOUT for same session
- Only admin can change it via force-checkout

**Q: Can manager approve FORGOT_CHECKOUT for other team member?**
- Yes, if in same team (RBAC enforced)
- Cross-team blocked (403 Forbidden)

---

### 12.9 Database Audit Trail

**Tracing a Reconciliation:**

1. **Initial State (after auto-close):**
   ```javascript
   attendance = {
     closeSource: 'SYSTEM_AUTO_MIDNIGHT',
     needsReconciliation: true,
     closedByRequestId: null
   }
   auditLog = {
     type: 'STALE_OPEN_SESSION',
     userId: '...',
     details: { sessionDate: '2026-02-05', ... }
   }
   ```

2. **After FORGOT_CHECKOUT Approval:**
   ```javascript
   attendance = {
     closeSource: 'ADJUST_APPROVAL',
     needsReconciliation: false,
     closedByRequestId: '<request_id>'
   }
   request = {
     type: 'ADJUST_TIME',
     adjustMode: 'FORGOT_CHECKOUT',
     targetAttendanceId: '<attendance_id>',
     status: 'APPROVED',
     approvedBy: '<manager_id>'
   }
   ```

**Query Examples:**
```javascript
// Find all auto-closed sessions still needing action
Attendance.find({
  closeSource: 'SYSTEM_AUTO_MIDNIGHT',
  needsReconciliation: true
});

// Find all reconciled sessions with audit trail
Attendance.find({
  closeSource: 'ADJUST_APPROVAL',
  closedByRequestId: { $ne: null }
}).populate('closedByRequestId');

// Find user's pending FORGOT_CHECKOUT requests
Request.find({
  userId: '...',
  type: 'ADJUST_TIME',
  adjustMode: 'FORGOT_CHECKOUT',
  status: 'PENDING'
});
```

---

### 12.10 Priority & Conflict Resolution

**Document Hierarchy:**
1. This section (§12) - FORGOT_CHECKOUT Rules (v2.7)
2. Section §11 - Auto-Close Scheduler (trigger for FORGOT_CHECKOUT)
3. Section §5 - Requests Adjustment Rules (general ADJUST_TIME rules)

**In Case of Conflict:**
- FORGOT_CHECKOUT rules (§12) OVERRIDE general ADJUST_TIME rules (§5) when applicable
- Weekend/holiday restriction bypassed for FORGOT_CHECKOUT (special case)
- Auto-close scheduler (§11) is prerequisite for FORGOT_CHECKOUT workflow

---

## 13) Dashboard Cross-Midnight Approved OT Checkout Rules (NEW v2.8)

### 13.1 Overview
**Purpose:** When a user has an open attendance session from the previous day with approved OT (`otApproved=true`), the Dashboard on the next day must display a **Check-out** button so the user can close their cross-midnight OT shift.

**Design Decision:** Option 1A + 2A
- **1A:** No new backend endpoint. Reuse `GET /attendance/open-session` + `GET /attendance/me` to determine `otApproved` status.
- **2A:** After cross-midnight checkout, main status resets to `Chưa check-in`. A success alert shows: `Đã check-out ca OT ngày trước`.

**Scope:**
- Frontend-only change (DashboardPage.jsx).
- No backend API, schema, or contract changes.
- Only affects sessions where `otApproved === true`.
- OT not approved (`otApproved=false`) retains existing behavior.

---

### 13.2 Data Flow

**Step 1: Fetch open session**
```
GET /api/attendance/open-session
→ openSessions[0] (if any open session with checkOutAt=null)
```

**Step 2: Determine effective attendance**
```javascript
const todayKey = getTodayKey(); // YYYY-MM-DD in GMT+7
const openSession = openSessions[0]; // from open-session API

if (todayAttendance) {
  // Normal flow: today has its own attendance record
  effectiveAttendance = todayAttendance;
  attendanceSource = 'NORMAL';
} else if (openSession && openSession.date < todayKey) {
  // Cross-midnight: open session from a previous day
  const record = findAttendanceRecord(openSession.date);
  if (record && record.otApproved === true) {
    effectiveAttendance = record; // or openSession data
    attendanceSource = 'CROSS_MIDNIGHT_APPROVED_OT';
  } else {
    // OT not approved — fall back to normal (Check-in)
    effectiveAttendance = null;
    attendanceSource = 'NORMAL';
  }
} else {
  // No open session or same-day session
  effectiveAttendance = todayAttendance; // may be null
  attendanceSource = 'NORMAL';
}
```

**Step 3: Validate otApproved across month boundary**
```javascript
function findAttendanceRecord(dateKey) {
  // 1. Try current month items (already fetched)
  const record = currentMonthItems.find(a => a.date === dateKey);
  if (record) return record;

  // 2. If dateKey is in a different month, fetch that month
  const openSessionMonth = dateKey.substring(0, 7); // YYYY-MM
  const currentMonth = todayKey.substring(0, 7);
  if (openSessionMonth !== currentMonth) {
    const prevMonthData = await fetchAttendance(openSessionMonth);
    return prevMonthData.items.find(a => a.date === dateKey);
  }
  return null;
}
```

---

### 13.3 UI Button Logic

| Condition | Button | Label |
|-----------|--------|-------|
| `effectiveAttendance.checkInAt && !effectiveAttendance.checkOutAt` && `attendanceSource === 'CROSS_MIDNIGHT_APPROVED_OT'` | Check-out | `Check-out` |
| `effectiveAttendance.checkInAt && !effectiveAttendance.checkOutAt` && `attendanceSource === 'NORMAL'` | Check-out | `Check-out` (same-day working) |
| `effectiveAttendance.checkInAt && effectiveAttendance.checkOutAt` | Done | `Đã check-out` |
| No valid effective attendance | Check-in | `Check-in` |

---

### 13.4 Checkout Handler

```javascript
async function handleCheckOut() {
  await api.post('/attendance/check-out');

  if (attendanceSource === 'CROSS_MIDNIGHT_APPROVED_OT') {
    setSuccessMessage('Đã check-out ca OT ngày trước');
  }

  // Refetch all data
  await refetchData();
  // After refetch: todayAttendance = null → status = 'Chưa check-in' (Option 2A)
  // Success message persists until next action or reload
}
```

---

### 13.5 Success Feedback Lifecycle

- **Display:** Alert success dismissible (same style as existing alerts).
- **Text:** `Đã check-out ca OT ngày trước` (Vietnamese).
- **Clear conditions:**
  - User performs another attendance action (check-in).
  - Page reload / re-mount.
  - Manual dismiss.
- **Does NOT block** the main status display (`Chưa check-in`).

---

### 13.6 Fail-Safe Rules

| Failure | Behavior |
|---------|----------|
| `GET /attendance/open-session` fails | Fall back to existing behavior (no cross-midnight check) |
| Cross-month `GET /attendance/me?month=...` fails | Fall back to existing behavior |
| `otApproved` field missing on record | Treat as `false` — no cross-midnight checkout UI |
| `POST /attendance/check-out` fails | Show error alert as usual; no state change |

**Principle:** No new blocking errors. All failures degrade gracefully to pre-v2.8 behavior.

---

### 13.7 Test Scenarios

| # | Scenario | Setup | Expected |
|---|----------|-------|----------|
| 1 | Approved cross-midnight shows Check-out | `openSession` from yesterday, `otApproved=true` | Check-out button visible |
| 2 | Checkout success message | Click Check-out from scenario 1 | `POST /check-out` called; after refetch: status=`Chưa check-in` + alert `Đã check-out ca OT ngày trước` |
| 3 | Unapproved OT unchanged | `openSession` from yesterday, `otApproved=false` | Check-in button (no Check-out) |
| 4 | Month boundary approved | `openSession.date` in prev month, fetch prev month returns `otApproved=true` | Check-out button visible |
| 5 | Same-day working (regression) | User checked in today, no checkout yet | Check-out button (normal flow) |
| 6 | Done state (regression) | User checked in + out today | `Đã check-out` status |
| 7 | Not checked-in (regression) | No attendance today, no open session | Check-in button |
| 8 | API error state (regression) | API call fails | Error alert, no crash |

---

### 13.8 Assumptions

1. `otApproved` on the attendance record is the single source-of-truth for OT approval.
2. Timezone for all date comparisons is `Asia/Ho_Chi_Minh` (GMT+7).
3. Success message uses Vietnamese text exactly: `Đã check-out ca OT ngày trước`.
4. No changes to existing copy/status text outside the scope of this feature.
5. `openSessions[0]` is sufficient (user can only have 1 open session at a time per business rule).

---

### 13.9 Priority & Conflict Resolution

**Document Hierarchy:**
1. This section (§13) - Dashboard Cross-Midnight Approved OT Checkout (v2.8)
2. Section §9 - Cross-midnight OT rules (checkout timing)
3. Section §10.5 - OT Strict Mode (`otApproved` gating)
4. Section §11 - Auto-Close Scheduler (may have already auto-closed the session)

**In Case of Conflict:**
- §13 rules are **UI-only** and do not override backend checkout logic (§9).
- If both auto-close (§11) and cross-midnight approved OT (§13) apply, auto-close takes precedence (session already closed by system).
- `otApproved` gating (§10.5) remains authoritative: without `otApproved=true`, cross-midnight checkout UI is **never** shown.

# Data Dictionary — MongoDB Collections (v2.6)

v2.3 adds soft delete, leave requests, and pagination support.
v2.5 adds Today Activity pagination.
v2.6 adds OT Request approval system (OT_REQUEST type), audit logging, and cross-midnight ADJUST_TIME support.

## 1) users
Purpose: accounts + roles + team assignment.

Fields:
- _id: ObjectId
- employeeCode: string [required, unique] (e.g., "NV001")
- name: string [required]
- email: string [required, unique]
- username: string [optional, unique]
- passwordHash: string [required] (NEVER returned by API)
- role: enum ["ADMIN", "MANAGER", "EMPLOYEE"] [required]
- teamId: ObjectId -> teams._id [optional]
- isActive: boolean [default true]
- startDate: Date [optional]
- deletedAt: Date | null [default null] (NEW v2.3 - soft delete)
- createdAt: Date
- updatedAt: Date

Indexes:
- unique(email)
- unique(employeeCode)
- optional unique(username)

Notes:
- API responses must NEVER include passwordHash.
- Team name is derived by joining teams via teamId.
- deletedAt != null means user is soft-deleted (hidden from normal queries).
- Soft-deleted users are purged after SOFT_DELETE_DAYS (configurable, default 15).
- Migration required: existing users need `deletedAt: null` set (see RULES.md §7.3).
- Cascade delete: purge job must delete related attendances + requests first.

## 2) teams
Purpose: grouping for manager scoping and UI filtering.

Fields:
- _id: ObjectId
- name: string [required, unique]
- createdAt: Date
- updatedAt: Date

## 3) holidays
Purpose: mark holidays/non-working days.

Fields:
- _id: ObjectId
- date: string "YYYY-MM-DD" (GMT+7) [required, unique]
- name: string [required]
- createdAt: Date
- updatedAt: Date

Indexes:
- unique(date)

## 4) attendances (UPDATED v2.6)
Purpose: 1 user / 1 day attendance.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required]
- checkInAt: Date [required once checked in]
- checkOutAt: Date | null [optional]
- otApproved: boolean [default false] (UPDATED v2.6 - set by approved OT_REQUEST)
- createdAt: Date
- updatedAt: Date

Constraints / Indexes:
- unique(userId + date)
- partial index: (userId + checkInAt DESC) where checkOutAt=null (cross-midnight open session optimization)

Notes:
- Do NOT store fixed status in DB.
- Computed fields returned by API/report:
  - status
  - lateMinutes
  - workMinutes (capped at 17:30 if otApproved=false, see rules.md §10.5)
  - otMinutes (0 if otApproved=false, see rules.md §10.5)
- otApproved=true: Set when manager approves OT_REQUEST, allows OT calculation beyond 17:30
- otApproved=false: OT calculation returns 0 regardless of checkOutAt time (STRICT mode)

## 5) requests (UPDATED v2.6)
Purpose: employee requests for attendance adjustment, leave, and OT approval.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required if type=ADJUST_TIME or OT_REQUEST; null/ignored if type=LEAVE]
- type: enum ["ADJUST_TIME", "LEAVE", "OT_REQUEST"] [optional, default "ADJUST_TIME"] (UPDATED v2.6)
- requestedCheckInAt: Date | null [for ADJUST_TIME only]
- requestedCheckOutAt: Date | null [for ADJUST_TIME only]
- checkInDate: string "YYYY-MM-DD" | null [for ADJUST_TIME cross-midnight] (NEW v2.6 - actual check-in date)
- checkOutDate: string "YYYY-MM-DD" | null [for ADJUST_TIME cross-midnight] (NEW v2.6 - actual check-out date)
- estimatedEndTime: Date | null [for OT_REQUEST only] (NEW v2.6)
- actualOtMinutes: Number | null [for OT_REQUEST only] (NEW v2.6 - filled after checkout for tracking)
- leaveStartDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveEndDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveType: enum ["ANNUAL", "SICK", "UNPAID"] | null [optional] (NEW v2.3)
- leaveDaysCount: Number | null [for LEAVE only] (NEW v2.6 - pre-computed workday count)
- reason: string [required for OT_REQUEST at model level; validated by controller for all types]
- status: enum ["PENDING", "APPROVED", "REJECTED"] [default "PENDING"]
- approvedBy: ObjectId -> users._id [optional]
- approvedAt: Date [optional]
- createdAt: Date
- updatedAt: Date

Indexes (NEW v2.6):
- compound(userId + status) for user request queries
- unique(userId + checkInDate + type) where status=PENDING, type=ADJUST_TIME (prevents duplicate pending ADJUST_TIME)
- compound(userId + type + status) for LEAVE overlap queries
- partial(userId + checkInDate + status) where type=ADJUST_TIME (cross-midnight query optimization)
- partial(userId + checkOutDate + status) where type=ADJUST_TIME (cross-midnight query optimization)
- unique(userId + date + type) where status=PENDING, type=OT_REQUEST (auto-extend feature, see rules.md §10.2 D2)

Notes:
- For ADJUST_TIME: approving updates attendance (create if not exist).
- For LEAVE: approving marks those dates as LEAVE status (not ABSENT).
- For OT_REQUEST: approving sets attendance.otApproved = true (NEW v2.6)
  - See rules.md §10 for complete OT Request rules
  - E1: OT_REQUEST cannot be retroactive (date >= today)
  - E2: Auto-extend feature prevents duplicate OT_REQUEST for same date
  - I1: Cross-midnight OT requires 2 separate requests
  - A1: STRICT mode - no grace period after 17:30
- Leave requests use leaveStartDate/EndDate, ignore date field.
- OT_REQUEST uses date field (single day), ignore leave fields.
- Overlap check: query by (userId, status: APPROVED, type: LEAVE) and compare date ranges.
  Consider compound index on (userId, type, status) for performance.
- Cross-midnight ADJUST_TIME: uses checkInDate/checkOutDate for date boundary detection.
  Pre-validate hook enforces: date === checkInDate for ADJUST_TIME (invariant).
  Pre-validate hook clears cross-type field contamination (e.g., OT fields on LEAVE requests).

## 6) auditLogs (NEW v2.6)
Purpose: track attendance anomalies for admin review.

Fields:
- _id: ObjectId
- type: enum ["MULTIPLE_ACTIVE_SESSIONS", "STALE_OPEN_SESSION"] [required]
- userId: ObjectId -> users._id [required]
- details: Mixed (structure validated by pre-save hook, see below) [required]
- createdAt: Date
- updatedAt: Date

Details structure by type:
- MULTIPLE_ACTIVE_SESSIONS:
  - sessionCount: Number (>= 2)
  - sessions: Array of { _id, date (YYYY-MM-DD), checkInAt (Date) } (max 100)
- STALE_OPEN_SESSION:
  - sessionDate: string (YYYY-MM-DD)
  - checkInAt: Date
  - detectedAt: enum ["checkIn", "checkOut"]

Indexes:
- compound(userId + createdAt DESC) for user audit log queries
- TTL(createdAt, 90 days) auto-delete after 90 days

Notes:
- Write-once pattern: use create() only, no updates.
- Pre-save hook validates details structure based on type.
- Auto-cleanup via TTL prevents database bloat.

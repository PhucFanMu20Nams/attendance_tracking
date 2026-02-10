# Data Dictionary — MongoDB Collections (v2.6)

v2.3 adds soft delete, leave requests, and pagination support.
v2.5 adds Today Activity pagination.
v2.6 adds OT Request approval system (OT_REQUEST type).

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
- estimatedEndTime: Date | null [for OT_REQUEST only] (NEW v2.6)
- leaveStartDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveEndDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveType: enum ["ANNUAL", "SICK", "UNPAID"] | null [optional] (NEW v2.3)
- reason: string [required]
- status: enum ["PENDING", "APPROVED", "REJECTED"] [default "PENDING"]
- approvedBy: ObjectId -> users._id [optional]
- approvedAt: Date [optional]
- createdAt: Date
- updatedAt: Date

Indexes (NEW v2.6):
- unique(userId + date + type) for OT_REQUEST auto-extend feature (see rules.md §10.2 E2)

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

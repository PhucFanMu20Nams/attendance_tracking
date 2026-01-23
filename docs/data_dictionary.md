# Data Dictionary — MongoDB Collections (v2.3)

v2.3 adds soft delete, leave requests, and pagination support.

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

## 4) attendances
Purpose: 1 user / 1 day attendance.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required]
- checkInAt: Date [required once checked in]
- checkOutAt: Date | null [optional]
- otApproved: boolean [default false]
- createdAt: Date
- updatedAt: Date

Constraints / Indexes:
- unique(userId + date)

Notes:
- Do NOT store fixed status in DB.
- Computed fields returned by API/report:
  - status
  - lateMinutes
  - workMinutes
  - otMinutes

## 5) requests
Purpose: employee requests for attendance adjustment.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required if type=ADJUST_TIME; null/ignored if type=LEAVE]
- type: enum ["ADJUST_TIME", "LEAVE"] [optional, default "ADJUST_TIME"] (UPDATED v2.3)
- requestedCheckInAt: Date | null [for ADJUST_TIME only]
- requestedCheckOutAt: Date | null [for ADJUST_TIME only]
- leaveStartDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveEndDate: string "YYYY-MM-DD" | null [for LEAVE only] (NEW v2.3)
- leaveType: enum ["ANNUAL", "SICK", "UNPAID"] | null [optional] (NEW v2.3)
- reason: string [required]
- status: enum ["PENDING", "APPROVED", "REJECTED"] [default "PENDING"]
- approvedBy: ObjectId -> users._id [optional]
- approvedAt: Date [optional]
- createdAt: Date
- updatedAt: Date

Notes:
- For ADJUST_TIME: approving updates attendance (create if not exist).
- For LEAVE: approving marks those dates as LEAVE status (not ABSENT).
- Leave requests use leaveStartDate/EndDate, ignore date field.
- Overlap check: query by (userId, status: APPROVED, type: LEAVE) and compare date ranges.
  Consider compound index on (userId, type, status) for performance.

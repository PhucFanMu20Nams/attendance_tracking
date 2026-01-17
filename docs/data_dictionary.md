# Data Dictionary — MongoDB Collections (v2.2)

v2.2 adds Member Management APIs but does NOT require DB migrations.

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
- createdAt: Date
- updatedAt: Date

Indexes:
- unique(email)
- unique(employeeCode)
- optional unique(username)

Notes:
- API responses must NEVER include passwordHash.
- Team name is derived by joining teams via teamId.

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
- date: string "YYYY-MM-DD" (GMT+7) [required]
- type: enum ["ADJUST_TIME"] [required]
- requestedCheckInAt: Date | null [optional]
- requestedCheckOutAt: Date | null [optional]
- reason: string [required]
- status: enum ["PENDING", "APPROVED", "REJECTED"] [default "PENDING"]
- approvedBy: ObjectId -> users._id [optional]
- approvedAt: Date [optional]
- createdAt: Date
- updatedAt: Date

Notes:
- Approving a request updates attendance (create if it does not exist).

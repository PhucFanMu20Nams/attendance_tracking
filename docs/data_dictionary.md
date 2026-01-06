# Data Dictionary — MongoDB Collections (v2.1)

## 1) users
Purpose: accounts + roles + team.

Fields:
- _id: ObjectId
- employeeCode: string (e.g., "NV001") [required, unique]
- name: string [required]
- email: string [required, unique]
- username: string [optional, unique] (if you want username login)
- passwordHash: string [required]
- role: enum ["ADMIN", "MANAGER", "EMPLOYEE"] [required]
- teamId: ObjectId -> teams._id [optional]
- isActive: boolean [default true]
- startDate: Date [optional]
- createdAt, updatedAt: Date (timestamps)

Indexes:
- unique(email)
- unique(employeeCode)
- optional unique(username)

## 2) teams
Purpose: grouping for manager team scoping.

Fields:
- _id: ObjectId
- name: string [required, unique]
- createdAt, updatedAt

## 3) holidays
Purpose: mark holidays/non-working days.

Fields:
- _id: ObjectId
- date: string "YYYY-MM-DD" (GMT+7) [required, unique]
- name: string [required]
- createdAt, updatedAt

Indexes:
- unique(date)

## 4) attendances
Purpose: 1 user / 1 day.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required]
- checkInAt: Date [optional] (null if not checked in)
- checkOutAt: Date | null [optional]
- otApproved: boolean [default false]
- createdAt, updatedAt

Constraints / Indexes:
- unique(userId + date)

Notes:
- Do NOT store fixed "status" in DB (compute on query/report)
- Computed fields returned by API/report:
  - status
  - lateMinutes
  - workMinutes
  - otMinutes

## 5) requests
Purpose: employee requests attendance adjustment.

Fields:
- _id: ObjectId
- userId: ObjectId -> users._id [required]
- date: string "YYYY-MM-DD" (GMT+7) [required]
- type: enum ["ADJUST_TIME"] [required] (MVP uses one type for simplicity)
- requestedCheckInAt: Date | null [optional]
- requestedCheckOutAt: Date | null [optional]
- reason: string [required]
- status: enum ["PENDING", "APPROVED", "REJECTED"] [default "PENDING"]
- approvedBy: ObjectId -> users._id [optional]
- approvedAt: Date [optional]
- createdAt, updatedAt

Notes:
- Approving a request updates attendance (create attendance if it does not exist)

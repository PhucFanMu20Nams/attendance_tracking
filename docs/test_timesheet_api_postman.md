# Test Cases — Timesheet Matrix APIs (Postman)

## Prerequisites

### Login Tokens
Get tokens for each role by calling `POST /api/auth/login`:

```json
// Admin
{ "identifier": "admin@company.com", "password": "Password123" }

// Manager
{ "identifier": "manager@company.com", "password": "Password123" }

// Employee
{ "identifier": "employee@company.com", "password": "Password123" }
```

Save tokens as environment variables:
- `{{admin_token}}`
- `{{manager_token}}`
- `{{employee_token}}`

---

## 1. GET /api/timesheet/team

### Test 1.1: Manager gets own team timesheet ✅
**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Status: `200 OK`
- Response contains `days` array and `rows` array
- `rows` only contains users from Manager's team

---

### Test 1.2: Admin gets team timesheet with teamId ✅
**Request:**
```
GET /api/timesheet/team?month=2026-01&teamId={{team_id}}
Authorization: Bearer {{admin_token}}
```

**Expected:**
- Status: `200 OK`
- Response contains users from specified team

---

### Test 1.3: Admin gets team timesheet WITHOUT teamId ❌
**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{admin_token}}
```

**Expected:**
- Status: `400 Bad Request`
- Message: `"Admin must specify teamId query parameter for team timesheet"`

---

### Test 1.4: Manager without assigned team ❌
**Setup:** Create a Manager user without teamId, get token

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_no_team_token}}
```

**Expected:**
- Status: `403 Forbidden`
- Message: `"Manager must be assigned to a team"`

---

### Test 1.5: Employee tries to access ❌
**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{employee_token}}
```

**Expected:**
- Status: `403 Forbidden`
- Message: `"Insufficient permissions"`

---

### Test 1.6: Invalid month format ❌
**Request:**
```
GET /api/timesheet/team?month=2026-1
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Status: `400 Bad Request`
- Message: `"Invalid month format. Expected YYYY-MM (e.g., 2026-01)"`

---

### Test 1.7: No month param (defaults to current month) ✅
**Request:**
```
GET /api/timesheet/team
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Status: `200 OK`
- Response contains data for current month (January 2026)

---

### Test 1.8: No authentication ❌
**Request:**
```
GET /api/timesheet/team?month=2026-01
(No Authorization header)
```

**Expected:**
- Status: `401 Unauthorized`
- Message: `"Authentication required"`

---

## 2. GET /api/timesheet/company

### Test 2.1: Admin gets company timesheet ✅
**Request:**
```
GET /api/timesheet/company?month=2026-01
Authorization: Bearer {{admin_token}}
```

**Expected:**
- Status: `200 OK`
- Response contains ALL active users in company
- `days` array: `[1, 2, 3, ..., 31]` (for January)
- Each row has `user` object and `cells` array

---

### Test 2.2: Manager tries to access ❌
**Request:**
```
GET /api/timesheet/company?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Status: `403 Forbidden`
- Message: `"Insufficient permissions"`

---

### Test 2.3: Employee tries to access ❌
**Request:**
```
GET /api/timesheet/company?month=2026-01
Authorization: Bearer {{employee_token}}
```

**Expected:**
- Status: `403 Forbidden`
- Message: `"Insufficient permissions"`

---

### Test 2.4: Invalid month format ❌
**Request:**
```
GET /api/timesheet/company?month=01-2026
Authorization: Bearer {{admin_token}}
```

**Expected:**
- Status: `400 Bad Request`
- Message: `"Invalid month format. Expected YYYY-MM (e.g., 2026-01)"`

---

### Test 2.5: No month param (defaults to current month) ✅
**Request:**
```
GET /api/timesheet/company
Authorization: Bearer {{admin_token}}
```

**Expected:**
- Status: `200 OK`
- Response contains data for current month

---

## 3. Status/Color Validation

### Test 3.1: Verify ON_TIME status (green)
**Setup:**
1. Employee check-in at 08:30 (on-time)
2. Employee check-out at 17:30

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for that date: `{ status: "ON_TIME", colorKey: "green" }`

---

### Test 3.2: Verify LATE status (red)
**Setup:**
1. Employee check-in at 09:00 (late)
2. Employee check-out at 17:30

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for that date: `{ status: "LATE", colorKey: "red" }`

---

### Test 3.3: Verify WORKING status (today, checked in, not checked out)
**Setup:**
1. Today: Employee check-in only, no check-out yet

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for today: `{ status: "WORKING", colorKey: "white" }`

---

### Test 3.4: Verify MISSING_CHECKOUT status (yellow)
**Setup:**
1. Insert past date attendance with checkIn but no checkOut

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for that past date: `{ status: "MISSING_CHECKOUT", colorKey: "yellow" }`

---

### Test 3.5: Verify ABSENT status (white)
**Setup:**
1. Past workday with NO attendance record

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for that past workday: `{ status: "ABSENT", colorKey: "white" }`

---

### Test 3.6: Verify WEEKEND_OR_HOLIDAY status (gray)
**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cells for Saturdays/Sundays: `{ status: "WEEKEND_OR_HOLIDAY", colorKey: "gray" }`
- January 2026:
  - Sat: 4, 11, 18, 25
  - Sun: 5, 12, 19, 26

---

### Test 3.7: Verify null status (today/future, not checked in)
**Setup:**
1. No attendance record for today or future dates

**Request:**
```
GET /api/timesheet/team?month=2026-01
Authorization: Bearer {{manager_token}}
```

**Expected:**
- Cell for today (if not checked in): `{ status: null, colorKey: "white" }`
- Cells for future dates: `{ status: null, colorKey: "white" }`

---

## Summary Checklist

| # | Test Case | Expected Status | Passed? |
|---|-----------|-----------------|---------|
| 1.1 | Manager gets own team | 200 | [ ] |
| 1.2 | Admin gets team with teamId | 200 | [ ] |
| 1.3 | Admin without teamId | 400 | [ ] |
| 1.4 | Manager without team | 403 | [ ] |
| 1.5 | Employee access team | 403 | [ ] |
| 1.6 | Invalid month format | 400 | [ ] |
| 1.7 | No month param | 200 | [ ] |
| 1.8 | No auth | 401 | [ ] |
| 2.1 | Admin gets company | 200 | [ ] |
| 2.2 | Manager access company | 403 | [ ] |
| 2.3 | Employee access company | 403 | [ ] |
| 2.4 | Invalid month format | 400 | [ ] |
| 2.5 | No month param | 200 | [ ] |
| 3.1 | ON_TIME status | green | [ ] |
| 3.2 | LATE status | red | [ ] |
| 3.3 | WORKING status | white | [ ] |
| 3.4 | MISSING_CHECKOUT | yellow | [ ] |
| 3.5 | ABSENT status | white | [ ] |
| 3.6 | WEEKEND_OR_HOLIDAY | gray | [ ] |
| 3.7 | null status (future) | white | [ ] |

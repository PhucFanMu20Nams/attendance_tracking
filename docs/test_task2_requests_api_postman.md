# Postman Test Guide — Task 2: Request APIs (Day 3)

**Test Date:** ___________  
**Tester:** ___________  
**Tool:** Postman

---

## 🚀 Quick Start

### 1. Postman Environment Setup
**Create Environment: "Attendance App - Local"**

Variables:
| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:3000` | `http://localhost:3000` |
| `EMPLOYEE_TOKEN` | | (auto-set after login) |
| `MANAGER_TOKEN` | | (auto-set after login) |
| `ADMIN_TOKEN` | | (auto-set after login) |

### 2. Collection Structure
```
📁 Day 3 - Request APIs
├── 📁 Prerequisites
│   ├── Login Employee
│   ├── Login Manager
│   └── Login Admin
├── 📁 Test Suite 1: Create Request
│   ├── 1.1 Happy Path - Full Request
│   ├── 1.2 Happy Path - CheckOut Only
│   ├── 1.3 Validation - Missing Date
│   ├── 1.4 Validation - Invalid Date Format
│   ├── 1.5 Validation - Missing Reason
│   ├── 1.6 Validation - Empty Reason
│   ├── 1.7 Validation - No Times
│   ├── 1.8 Validation - CheckOut Before CheckIn
│   ├── 1.9 Business Rule - CheckOut Only No Attendance
│   └── 1.10 Auth - No Token
├── 📁 Test Suite 2: Get My Requests
│   ├── 2.1 Happy Path
│   ├── 2.2 Empty Result
│   └── 2.3 Auth - No Token
├── 📁 Test Suite 3: Get Pending Requests
│   ├── 3.1 Manager - Team Only
│   ├── 3.2 Admin - Company Wide
│   ├── 3.3 Auth - Employee Forbidden
│   └── 3.4 Manager No TeamId
├── 📁 Test Suite 4: Approve Request
│   ├── 4.1 Happy Path - Manager Approve
│   ├── 4.2 Happy Path - Admin Approve
│   ├── 4.3 Validation - Invalid ID
│   ├── 4.4 Not Found
│   ├── 4.5 Conflict - Already Approved
│   ├── 4.6 Conflict - Already Rejected
│   ├── 4.7 Auth - Employee Forbidden
│   ├── 4.8 Verify - Update CheckOut Only
│   └── 4.9 Verify - Create New Attendance
└── 📁 Test Suite 5: Reject Request
    ├── 5.1 Happy Path - Manager Reject
    ├── 5.2 Validation - Invalid ID
    ├── 5.3 Conflict - Already Rejected
    ├── 5.4 Conflict - Already Approved
    └── 5.5 Auth - Employee Forbidden
```

---

## 📋 Prerequisites

### ✅ Server Running
```bash
cd server
npm run dev
```
- [ ] Server started on port 3000
- [ ] MongoDB connected

### ✅ Login Requests Setup

#### Login Employee
- **Method:** `POST`
- **URL:** `{{base_url}}/api/auth/login`
- **Body (raw JSON):**
```json
{
  "identifier": "employee@company.com",
  "password": "password123"
}
```
- **Tests Script:**
```javascript
pm.test("Status 200", function() {
    pm.response.to.have.status(200);
});

const response = pm.response.json();
pm.environment.set("EMPLOYEE_TOKEN", response.token);
console.log("Employee Token:", response.token);
```
- [ ] Run → Check `EMPLOYEE_TOKEN` in environment

#### Login Manager
- **Method:** `POST`
- **URL:** `{{base_url}}/api/auth/login`
- **Body (raw JSON):**
```json
{
  "identifier": "manager@company.com",
  "password": "password123"
}
```
- **Tests Script:**
```javascript
pm.test("Status 200", function() {
    pm.response.to.have.status(200);
});

const response = pm.response.json();
pm.environment.set("MANAGER_TOKEN", response.token);
console.log("Manager Token:", response.token);
```
- [ ] Run → Check `MANAGER_TOKEN` in environment

#### Login Admin
- **Method:** `POST`
- **URL:** `{{base_url}}/api/auth/login`
- **Body (raw JSON):**
```json
{
  "identifier": "admin@company.com",
  "password": "password123"
}
```
- **Tests Script:**
```javascript
pm.test("Status 200", function() {
    pm.response.to.have.status(200);
});

const response = pm.response.json();
pm.environment.set("ADMIN_TOKEN", response.token);
console.log("Admin Token:", response.token);
```
- [ ] Run → Check `ADMIN_TOKEN` in environment

---

## 📦 Test Suite 1: Create Request

### Collection Variable for Suite 1:
Set at folder level:
- Auth Type: `Bearer Token`
- Token: `{{EMPLOYEE_TOKEN}}`

---

### Test 1.1: Happy Path - Full Request ✅
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-07",
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z",
  "requestedCheckOutAt": "2026-01-07T17:30:00.000Z",
  "reason": "Quên check-in/out hôm qua"
}
```
- **Tests:**
```javascript
pm.test("Status 201 Created", () => {
    pm.response.to.have.status(201);
});

pm.test("Has request object", () => {
    const response = pm.response.json();
    pm.expect(response.request).to.exist;
});

pm.test("Status is PENDING", () => {
    const request = pm.response.json().request;
    pm.expect(request.status).to.equal("PENDING");
});

pm.test("Date is correct", () => {
    const request = pm.response.json().request;
    pm.expect(request.date).to.equal("2026-01-07");
});

pm.test("Reason is correct", () => {
    const request = pm.response.json().request;
    pm.expect(request.reason).to.equal("Quên check-in/out hôm qua");
});

// Save request ID for later tests
if (pm.response.code === 201) {
    pm.environment.set("TEST_REQUEST_ID", pm.response.json().request._id);
}
```
- [ ] All tests pass

---

### Test 1.2: Happy Path - CheckOut Only ✅
**Pre-requisite:** Employee đã check-in ngày 2026-01-06

- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-06",
  "requestedCheckOutAt": "2026-01-06T17:30:00.000Z",
  "reason": "Quên check-out"
}
```
- **Tests:**
```javascript
pm.test("Status 201 Created", () => {
    pm.response.to.have.status(201);
});

pm.test("requestedCheckInAt is null", () => {
    const request = pm.response.json().request;
    pm.expect(request.requestedCheckInAt).to.be.null;
});

pm.test("requestedCheckOutAt exists", () => {
    const request = pm.response.json().request;
    pm.expect(request.requestedCheckOutAt).to.exist;
});
```
- [ ] All tests pass

---

### Test 1.3: Validation - Missing Date ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z",
  "reason": "Test"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message correct", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.equal("Date is required");
});
```
- [ ] All tests pass

---

### Test 1.4: Validation - Invalid Date Format ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "07-01-2026",
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z",
  "reason": "Test"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message about format", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("Invalid date format");
});
```
- [ ] All tests pass

---

### Test 1.5: Validation - Missing Reason ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-07",
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message correct", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.equal("Reason is required");
});
```
- [ ] All tests pass

---

### Test 1.6: Validation - Empty Reason ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-07",
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z",
  "reason": "   "
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message correct", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.equal("Reason is required");
});
```
- [ ] All tests pass

---

### Test 1.7: Validation - No Times ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-07",
  "reason": "Test"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message about times", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("At least one");
});
```
- [ ] All tests pass

---

### Test 1.8: Validation - CheckOut Before CheckIn ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-07",
  "requestedCheckInAt": "2026-01-07T17:30:00.000Z",
  "requestedCheckOutAt": "2026-01-07T08:30:00.000Z",
  "reason": "Test"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message about order", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("must be after");
});
```
- [ ] All tests pass

---

### Test 1.9: Business Rule - CheckOut Only No Attendance ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Body:**
```json
{
  "date": "2026-01-05",
  "requestedCheckOutAt": "2026-01-05T17:30:00.000Z",
  "reason": "Test checkout only"
}
```
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message about check-in required", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("check-in time");
});
```
- [ ] All tests pass

---

### Test 1.10: Auth - No Token ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests`
- **Auth:** No Auth (remove Bearer Token)
- **Body:**
```json
{
  "date": "2026-01-07",
  "requestedCheckInAt": "2026-01-07T08:30:00.000Z",
  "reason": "Test"
}
```
- **Tests:**
```javascript
pm.test("Status 401 Unauthorized", () => {
    pm.response.to.have.status(401);
});

pm.test("Error message about auth", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("Authentication");
});
```
- [ ] All tests pass

---

## 📦 Test Suite 2: Get My Requests

### Test 2.1: Happy Path ✅
- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/me`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Has items array", () => {
    const response = pm.response.json();
    pm.expect(response.items).to.be.an('array');
});

pm.test("Items have correct fields", () => {
    const items = pm.response.json().items;
    if (items.length > 0) {
        const item = items[0];
        pm.expect(item).to.have.property('_id');
        pm.expect(item).to.have.property('userId');
        pm.expect(item).to.have.property('date');
        pm.expect(item).to.have.property('reason');
        pm.expect(item).to.have.property('status');
    }
});
```
- [ ] All tests pass

---

### Test 2.2: Empty Result ✅
**Note:** Use a user that hasn't created any requests

- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/me`
- **Auth:** Bearer Token (user chưa có requests)
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Items is empty array", () => {
    const response = pm.response.json();
    pm.expect(response.items).to.be.an('array').that.is.empty;
});
```
- [ ] All tests pass

---

### Test 2.3: Auth - No Token ❌
- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/me`
- **Auth:** No Auth
- **Tests:**
```javascript
pm.test("Status 401 Unauthorized", () => {
    pm.response.to.have.status(401);
});
```
- [ ] All tests pass

---

## 📦 Test Suite 3: Get Pending Requests

### Test 3.1: Manager - Team Only ✅
- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/pending`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("All items are PENDING", () => {
    const items = pm.response.json().items;
    items.forEach(item => {
        pm.expect(item.status).to.equal("PENDING");
    });
});

pm.test("userId is populated", () => {
    const items = pm.response.json().items;
    if (items.length > 0) {
        pm.expect(items[0].userId).to.have.property('name');
        pm.expect(items[0].userId).to.have.property('employeeCode');
    }
});
```
- [ ] All tests pass

---

### Test 3.2: Admin - Company Wide ✅
- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/pending`
- **Auth:** Bearer Token `{{ADMIN_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Has items array", () => {
    const response = pm.response.json();
    pm.expect(response.items).to.be.an('array');
});

pm.test("All items are PENDING", () => {
    const items = pm.response.json().items;
    items.forEach(item => {
        pm.expect(item.status).to.equal("PENDING");
    });
});
```
- [ ] All tests pass

---

### Test 3.3: Auth - Employee Forbidden ❌
- **Method:** `GET`
- **URL:** `{{base_url}}/api/requests/pending`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 403 Forbidden", () => {
    pm.response.to.have.status(403);
});

pm.test("Error message about permissions", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("permission");
});
```
- [ ] All tests pass

---

## 📦 Test Suite 4: Approve Request

### Test 4.1: Happy Path - Manager Approve ✅
**Pre-requisite:** Create a pending request first (Test 1.1)

- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/approve`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Status is APPROVED", () => {
    const request = pm.response.json().request;
    pm.expect(request.status).to.equal("APPROVED");
});

pm.test("approvedBy is set", () => {
    const request = pm.response.json().request;
    pm.expect(request.approvedBy).to.exist;
});

pm.test("approvedAt is set", () => {
    const request = pm.response.json().request;
    pm.expect(request.approvedAt).to.exist;
});
```
- [ ] All tests pass

---

### Test 4.2: Happy Path - Admin Approve ✅
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/approve`
- **Auth:** Bearer Token `{{ADMIN_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Request approved successfully", () => {
    const request = pm.response.json().request;
    pm.expect(request.status).to.equal("APPROVED");
});
```
- [ ] All tests pass

---

### Test 4.3: Validation - Invalid ID ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/invalid-id/approve`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});

pm.test("Error message about invalid ID", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("Invalid");
});
```
- [ ] All tests pass

---

### Test 4.4: Not Found ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/507f1f77bcf86cd799439011/approve`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 404 Not Found", () => {
    pm.response.to.have.status(404);
});

pm.test("Error message about not found", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("not found");
});
```
- [ ] All tests pass

---

### Test 4.5: Conflict - Already Approved ❌
**Pre-requisite:** Approve a request first, then try to approve again

- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/approve`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 409 Conflict", () => {
    pm.response.to.have.status(409);
});

pm.test("Error message about already approved", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("already");
});
```
- [ ] All tests pass

---

## 📦 Test Suite 5: Reject Request

### Test 5.1: Happy Path - Manager Reject ✅
**Pre-requisite:** Create a new pending request

- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/reject`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 200 OK", () => {
    pm.response.to.have.status(200);
});

pm.test("Status is REJECTED", () => {
    const request = pm.response.json().request;
    pm.expect(request.status).to.equal("REJECTED");
});

pm.test("approvedBy is set (rejector)", () => {
    const request = pm.response.json().request;
    pm.expect(request.approvedBy).to.exist;
});

pm.test("approvedAt is set", () => {
    const request = pm.response.json().request;
    pm.expect(request.approvedAt).to.exist;
});
```
- [ ] All tests pass

---

### Test 5.2: Validation - Invalid ID ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/invalid/reject`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 400 Bad Request", () => {
    pm.response.to.have.status(400);
});
```
- [ ] All tests pass

---

### Test 5.3: Conflict - Already Rejected ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/reject`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 409 Conflict", () => {
    pm.response.to.have.status(409);
});

pm.test("Error message about already rejected", () => {
    const response = pm.response.json();
    pm.expect(response.message).to.include("already");
});
```
- [ ] All tests pass

---

### Test 5.4: Conflict - Already Approved ❌
**Pre-requisite:** Approve a request first, then try to reject it

- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/reject`
- **Auth:** Bearer Token `{{MANAGER_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 409 Conflict", () => {
    pm.response.to.have.status(409);
});
```
- [ ] All tests pass

---

### Test 5.5: Auth - Employee Forbidden ❌
- **Method:** `POST`
- **URL:** `{{base_url}}/api/requests/{{TEST_REQUEST_ID}}/reject`
- **Auth:** Bearer Token `{{EMPLOYEE_TOKEN}}`
- **Tests:**
```javascript
pm.test("Status 403 Forbidden", () => {
    pm.response.to.have.status(403);
});
```
- [ ] All tests pass

---

## 📊 Test Summary

### Test Coverage Matrix

| Test Suite | Total Tests | Passed | Failed | Notes |
|------------|-------------|--------|--------|-------|
| Create Request | 10 | ___ | ___ | |
| Get My Requests | 3 | ___ | ___ | |
| Get Pending | 4 | ___ | ___ | |
| Approve Request | 9 | ___ | ___ | |
| Reject Request | 5 | ___ | ___ | |
| **TOTAL** | **31** | ___ | ___ | |

### Quality Metrics ✅

- [ ] **Functional Coverage**: 100% acceptance criteria validated
- [ ] **Error Handling**: All validation cases tested
- [ ] **RBAC**: All role permissions verified
- [ ] **Business Rules**: Edge cases covered
- [ ] **Data Integrity**: Attendance updates verified

### Critical Issues Found

| Issue | Severity | Endpoint | Description | Status |
|-------|----------|----------|-------------|--------|
| | | | | |

---

## 💡 Postman Tips

### Runner Usage:
1. Select collection folder
2. Click "Run" button
3. Select environment
4. Run all tests at once
5. View results summary

### Pre-request Scripts (Collection Level):
```javascript
// Auto-refresh tokens if expired
const token = pm.environment.get("EMPLOYEE_TOKEN");
if (!token) {
    console.log("Token missing - please run login requests first");
}
```

### Export Collection:
- Click "..." on collection → Export → Collection v2.1
- Share with team for consistent testing

---

**Test Completed:** ___________  
**Sign-off:** ___________

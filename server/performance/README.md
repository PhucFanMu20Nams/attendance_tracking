# Performance Testing Suite

Bộ test hiệu năng sử dụng **k6** để đánh giá khả năng chịu tải của hệ thống Attendance.

## Prerequisites

### 1. Cài đặt k6

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### 2. Seed Test Data

```bash
cd server
node performance/seed/seed-data.js
```

This creates:
- 1 Admin: `admin@test.com`
- 5 Managers: `manager1@test.com` ... `manager5@test.com`
- 200 Employees: `employee1@test.com` ... `employee200@test.com`
- Password: `Password123`

### 3. Start Server

```bash
npm run dev
# or
node src/server.js
```

---

## Test Cases

### Case 1: Morning Rush (Login Spike)

Simulates 100+ employees logging in during 8:55-9:05 AM.

```bash
k6 run performance/k6/morning-rush.js
```

**Expected Results:**
- Response Time (p95): < 300ms
- Error Rate: < 0.1%
- No timeouts

---

### Case 2: Standard Usage (Mixed Workload)

50 concurrent users performing Login → Get Requests → Get Attendance workflow.

```bash
k6 run performance/k6/standard-usage.js
```

**Expected Results:**
- Response Time (p95): < 500ms
- Error Rate: < 1%
- Stable throughput

---

### Case 3: Approval Flood (Manager Stress)

5 managers approving requests concurrently - tests for deadlocks.

```bash
k6 run performance/k6/approval-flood.js
```

**Expected Results:**
- No database deadlocks
- Response Time (p95): < 500ms
- 409 Conflicts are expected (race conditions)

---

### Case 4: Stress Spike (Traffic Shock)

Sudden traffic spike: 0 → 300 users in 10 seconds.

```bash
k6 run performance/k6/stress-spike.js
```

**Expected Results:**
- **No 502/503 errors** (server must not crash)
- System recovers after spike
- Error Rate: < 5%

---

## Metrics Interpretation

| Metric | Description | Target |
|--------|-------------|--------|
| `http_req_duration (p95)` | 95% requests faster than this | < 500ms |
| `http_req_failed` | Error rate | < 1% |
| `iterations` | Completed test iterations | Should complete all |

## Custom Environment

Override base URL:

```bash
k6 run -e BASE_URL=http://staging-server:3000 performance/k6/morning-rush.js
```

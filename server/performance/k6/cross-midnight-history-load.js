/**
 * k6 Performance Test - Cross-Midnight History Load
 * 
 * Scenario: 30 users viewing history page with cross-midnight records
 * Goal: Validate history page displays correct dates and OT for cross-midnight sessions
 * 
 * Prerequisites:
 * 1. Run seed script: node performance/seed/cross-midnight-seed.js
 * 2. Run midnight rush test first (creates cross-midnight checkouts)
 * 3. Start server: npm run dev
 * 
 * Run: k6 run server/performance/k6/cross-midnight-history-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL } from './config.js';

// Custom metrics
const historyQueries = new Counter('history_queries');
const historyErrors = new Counter('history_errors');
const historyQueryTime = new Trend('history_query_time');
const crossMidnightDisplayErrors = new Counter('cross_midnight_display_errors');
const recordsReturned = new Trend('records_returned');
const dateDuplicates = new Counter('date_duplicates');

// Test configuration - 30 concurrent users for 3 minutes
export const options = {
    scenarios: {
        history_load: {
            executor: 'constant-vus',
            vus: 30,
            duration: '3m',
        },
    },
    thresholds: {
        'history_query_time': ['p(95)<500'],        // 95% < 500ms
        'http_req_failed': ['rate<0.01'],           // Error rate < 1%
        'cross_midnight_display_errors': ['count<10'], // Max 10 display errors
    },
};

// Test user pool (first 30 employees)
const testUsers = [];
for (let i = 1; i <= 30; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123',
        employeeNum: i,
    });
}

// Helper: Login
function login(user) {
    const payload = JSON.stringify({
        identifier: user.identifier,
        password: user.password,
    });

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (res.status !== 200) {
        return null;
    }

    try {
        return res.json('token');
    } catch (e) {
        return null;
    }
}

// Helper: Validate cross-midnight record
function validateCrossMidnightRecord(record) {
    const errors = [];

    if (!record.checkInAt) {
        errors.push('Missing checkInAt');
        return errors;
    }

    if (!record.checkOutAt) {
        // OK - user hasn't checked out yet
        return errors;
    }

    // Parse dates
    const checkIn = new Date(record.checkInAt);
    const checkOut = new Date(record.checkOutAt);

    // Validate time order
    if (checkOut <= checkIn) {
        errors.push(`Invalid time order: checkOut <= checkIn`);
    }

    // Validate dates (cross-midnight should have different dates)
    const checkInDate = checkIn.toISOString().split('T')[0];
    const checkOutDate = checkOut.toISOString().split('T')[0];

    // Expected: checkOut date is next day (for cross-midnight)
    const expectedCheckOutDate = new Date(checkIn);
    expectedCheckOutDate.setDate(expectedCheckOutDate.getDate() + 1);
    const expectedDateStr = expectedCheckOutDate.toISOString().split('T')[0];

    // Cross-midnight: checkOut date should match check-in + 1 day OR be same day if within 24h
    if (checkInDate !== checkOutDate && checkOutDate !== expectedDateStr) {
        // Date mismatch (not same day, not next day)
        errors.push(`Date mismatch: checkIn ${checkInDate}, checkOut ${checkOutDate}`);
    }

    // Validate OT calculation
    if (record.otMinutes === undefined || record.otMinutes === null) {
        errors.push('Missing otMinutes');
    } else if (record.otMinutes < 0) {
        errors.push(`Invalid OT: ${record.otMinutes} (negative)`);
    }

    return errors;
}

// Main test function
export default function () {
    // Pick a random test user
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];

    // Step 1: Login
    const token = login(user);
    if (!token) {
        historyErrors.add(1);
        sleep(1);
        return;
    }

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    };

    // Step 2: GET history for current month (includes cross-midnight)
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/api/attendance/history?month=${month}`, authHeaders);
    const queryTime = Date.now() - startTime;

    historyQueryTime.add(queryTime);
    historyQueries.add(1);

    const checkOk = check(res, {
        'History status 200': (r) => r.status === 200,
        'History response is array': (r) => {
            try {
                const data = r.json('data');
                return Array.isArray(data);
            } catch (e) {
                return false;
            }
        },
        'History query time < 500ms': () => queryTime < 500,
    });

    if (!checkOk) {
        historyErrors.add(1);
        sleep(5);
        return;
    }

    // Step 3: Verify cross-midnight records
    const records = res.json('data');
    recordsReturned.add(records.length);

    if (records.length === 0) {
        console.warn(`⚠️  ${user.identifier}: No history records found`);
        sleep(5);
        return;
    }

    // Check for duplicate dates (same date should not appear twice)
    const dateMap = new Map();
    for (const record of records) {
        if (!record.date) continue;
        
        if (dateMap.has(record.date)) {
            console.error(`❌ ${user.identifier}: Duplicate date detected: ${record.date}`);
            dateDuplicates.add(1);
        } else {
            dateMap.set(record.date, record);
        }
    }

    // Validate cross-midnight records
    for (const record of records) {
        // Skip records without checkout (work in progress)
        if (!record.checkOutAt) continue;

        const errors = validateCrossMidnightRecord(record);
        
        if (errors.length > 0) {
            console.error(`❌ ${user.identifier}: Cross-midnight validation failed for ${record.date}:`);
            errors.forEach(err => console.error(`   - ${err}`));
            crossMidnightDisplayErrors.add(errors.length);
        }
    }

    // Step 4: Simulate user viewing table (5-10s)
    sleep(5 + Math.random() * 5);

    // Step 5: Repeat query (simulate pagination/filtering)
    const repeatRes = http.get(`${BASE_URL}/api/attendance/history?month=${month}`, authHeaders);
    check(repeatRes, {
        'Repeat query status 200': (r) => r.status === 200,
    });

    sleep(2);
}

// Summary report
export function handleSummary(data) {
    const totalQueries = data.metrics['history_queries']?.values?.count || 0;
    const errors = data.metrics['history_errors']?.values?.count || 0;
    const displayErrors = data.metrics['cross_midnight_display_errors']?.values?.count || 0;
    const duplicates = data.metrics['date_duplicates']?.values?.count || 0;

    const avgQueryTime = data.metrics['history_query_time']?.values?.avg || 0;
    const p95QueryTime = data.metrics['history_query_time']?.values?.['p(95)'] || 0;
    const avgRecords = data.metrics['records_returned']?.values?.avg || 0;

    console.log('\n========================================');
    console.log('📊 Cross-Midnight History Load Summary');
    console.log('========================================');
    console.log(`📈 Total history queries: ${totalQueries}`);
    console.log(`❌ Query errors: ${errors}`);
    console.log(`🐛 Cross-midnight display errors: ${displayErrors}`);
    console.log(`🐛 Date duplicates: ${duplicates}`);
    console.log(`📝 Avg records returned: ${avgRecords.toFixed(1)}`);
    console.log('');
    console.log('⏱️  Performance:');
    console.log(`   Avg query time: ${avgQueryTime.toFixed(2)}ms`);
    console.log(`   p95 query time: ${p95QueryTime.toFixed(2)}ms`);
    console.log('========================================\n');

    // Validation status
    const allPassed = (
        errors < 10 &&
        displayErrors < 10 &&
        duplicates === 0 &&
        p95QueryTime < 500
    );

    if (allPassed) {
        console.log('🎉 ✅ ALL VALIDATION PASSED!');
    } else {
        console.log('❌ VALIDATION FAILED - Check errors above');
    }

    return {
        'stdout': JSON.stringify(data, null, 2),
    };
}

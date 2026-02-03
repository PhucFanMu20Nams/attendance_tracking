/**
 * k6 Performance Test - Cross-Midnight Rush
 * 
 * Scenario: Midnight shift end - 50 employees checkout simultaneously at 00:00-01:00
 * Goal: Validate system handles concurrent cross-midnight checkouts without data corruption
 * 
 * Prerequisites:
 * 1. Run seed script: node performance/seed/cross-midnight-seed.js
 * 2. Start server: npm run dev
 * 
 * Run: k6 run server/performance/k6/cross-midnight-rush.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { BASE_URL, STANDARD_THRESHOLDS } from './config.js';

// Custom metrics
const checkoutSuccess = new Counter('checkout_success');
const checkoutFailed = new Counter('checkout_failed');
const checkoutDuration = new Trend('checkout_duration');
const otCalculationErrors = new Counter('ot_calculation_errors');
const concurrentConflicts = new Counter('concurrent_conflicts');
const midnightApiLatency = new Trend('midnight_api_latency');
const dataMismatch = new Counter('data_mismatch');

// Test configuration - Midnight Rush Pattern
export const options = {
    scenarios: {
        midnight_rush: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },   // Warm up
                { duration: '1m', target: 50 },    // Ramp to 50 users
                { duration: '3m', target: 50 },    // Hold at peak (midnight)
                { duration: '30s', target: 0 },    // Cool down
            ],
        },
    },
    thresholds: {
        ...STANDARD_THRESHOLDS,
        'checkout_duration': ['p(95)<500'],       // 95% checkout < 500ms
        'midnight_api_latency': ['p(95)<500'],    // 95% API < 500ms
        'checkout_failed': ['count<5'],           // Max 5 failures
        'concurrent_conflicts': ['count<10'],     // Max 10 conflicts (409)
    },
};

// Test user pool (100 employees)
const testUsers = [];
for (let i = 1; i <= 100; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123',
        employeeNum: i
    });
}

// Helper: Login and get token
function login(user) {
    const payload = JSON.stringify({
        identifier: user.identifier,
        password: user.password,
    });

    const params = {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'login' },
    };

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
    
    if (res.status !== 200) {
        console.error(`❌ Login failed for ${user.identifier}: ${res.status}`);
        return null;
    }

    try {
        const token = res.json('token');
        return token;
    } catch (e) {
        console.error(`❌ Failed to parse login response for ${user.identifier}`);
        return null;
    }
}

// Helper: Verify attendance data correctness
function verifyAttendance(attendance, user) {
    let errors = [];

    // Check checkInAt exists
    if (!attendance.checkInAt) {
        errors.push('Missing checkInAt');
    }

    // Check checkOutAt exists (after checkout)
    if (!attendance.checkOutAt) {
        errors.push('Missing checkOutAt after checkout');
    }

    // Check dates are correct (checkOutAt should be next day)
    if (attendance.checkInAt && attendance.checkOutAt) {
        const checkIn = new Date(attendance.checkInAt);
        const checkOut = new Date(attendance.checkOutAt);
        
        // checkOut should be after checkIn
        if (checkOut <= checkIn) {
            errors.push(`Invalid time order: checkOut (${checkOut}) <= checkIn (${checkIn})`);
        }

        // For cross-midnight: checkOut date should be different from checkIn date
        const checkInDate = checkIn.toISOString().split('T')[0];
        const checkOutDate = checkOut.toISOString().split('T')[0];
        
        // Expected: check-in yesterday, check-out today
        if (checkInDate === checkOutDate) {
            // This is OK if within same day, but for our test we expect cross-midnight
            console.warn(`⚠️  ${user.identifier}: Same-day checkout (checkIn: ${checkInDate}, checkOut: ${checkOutDate})`);
        }
    }

    // Check OT calculation (should be present)
    if (attendance.otMinutes === undefined || attendance.otMinutes === null) {
        errors.push('Missing otMinutes calculation');
    } else if (attendance.otMinutes < 0) {
        errors.push(`Invalid OT: ${attendance.otMinutes} (negative)`);
    }

    return errors;
}

// Main test function (per VU)
export default function () {
    // Pick a random test user
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];

    // Step 1: Login
    const token = login(user);
    if (!token) {
        checkoutFailed.add(1);
        sleep(1);
        return;
    }

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    };

    // Step 2: GET today's attendance (verify already checked in)
    const startGetToday = Date.now();
    const getTodayRes = http.get(`${BASE_URL}/api/attendance/today`, authHeaders);
    midnightApiLatency.add(Date.now() - startGetToday);

    const getTodayOk = check(getTodayRes, {
        'GET today status 200': (r) => r.status === 200,
        'Today response has data': (r) => {
            try {
                const data = r.json('data');
                return data !== null && data !== undefined;
            } catch (e) {
                return false;
            }
        },
    });

    if (!getTodayOk) {
        console.error(`❌ ${user.identifier}: Failed to get today's attendance`);
        checkoutFailed.add(1);
        sleep(1);
        return;
    }

    // Check if already checked in
    const todayData = getTodayRes.json('data');
    if (!todayData || !todayData.checkInAt) {
        console.warn(`⚠️  ${user.identifier}: Not checked in (skipping)`);
        sleep(1);
        return;
    }

    // Step 3: POST check-out (CROSS-MIDNIGHT)
    const startCheckout = Date.now();
    const checkOutRes = http.post(`${BASE_URL}/api/attendance/check-out`, null, authHeaders);
    const checkoutTime = Date.now() - startCheckout;
    checkoutDuration.add(checkoutTime);

    // Check for concurrent conflicts (409)
    if (checkOutRes.status === 409) {
        concurrentConflicts.add(1);
        console.log(`⚠️  ${user.identifier}: Conflict (409) - already checked out`);
        sleep(1);
        return;
    }

    const checkoutOk = check(checkOutRes, {
        'Checkout status 200 or 201': (r) => r.status === 200 || r.status === 201,
        'Checkout response has data': (r) => {
            try {
                const data = r.json('data');
                return data !== null && data !== undefined;
            } catch (e) {
                return false;
            }
        },
        'Checkout time < 500ms': () => checkoutTime < 500,
    });

    if (!checkoutOk) {
        console.error(`❌ ${user.identifier}: Checkout failed (${checkOutRes.status})`);
        checkoutFailed.add(1);
        sleep(1);
        return;
    }

    checkoutSuccess.add(1);

    // Step 4: Verify response data correctness
    const checkoutData = checkOutRes.json('data');
    const verifyErrors = verifyAttendance(checkoutData, user);

    if (verifyErrors.length > 0) {
        console.error(`❌ ${user.identifier}: Data validation failed:`);
        verifyErrors.forEach(err => console.error(`   - ${err}`));
        dataMismatch.add(verifyErrors.length);
        otCalculationErrors.add(1);
    }

    // Step 5: GET history (verify UI will display correctly)
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const startHistory = Date.now();
    const historyRes = http.get(`${BASE_URL}/api/attendance/history?month=${month}`, authHeaders);
    midnightApiLatency.add(Date.now() - startHistory);

    check(historyRes, {
        'History status 200': (r) => r.status === 200,
        'History has records': (r) => {
            try {
                const records = r.json('data');
                return Array.isArray(records) && records.length > 0;
            } catch (e) {
                return false;
            }
        },
    });

    // Simulate user viewing dashboard
    sleep(1 + Math.random());
}

// Summary report
export function handleSummary(data) {
    const checkoutSuccessCount = data.metrics['checkout_success']?.values?.count || 0;
    const checkoutFailedCount = data.metrics['checkout_failed']?.values?.count || 0;
    const otErrors = data.metrics['ot_calculation_errors']?.values?.count || 0;
    const conflicts = data.metrics['concurrent_conflicts']?.values?.count || 0;
    const dataMismatches = data.metrics['data_mismatch']?.values?.count || 0;

    const avgCheckoutTime = data.metrics['checkout_duration']?.values?.avg || 0;
    const p95CheckoutTime = data.metrics['checkout_duration']?.values?.['p(95)'] || 0;

    console.log('\n========================================');
    console.log('📊 Cross-Midnight Rush Test Summary');
    console.log('========================================');
    console.log(`✅ Successful checkouts: ${checkoutSuccessCount}`);
    console.log(`❌ Failed checkouts: ${checkoutFailedCount}`);
    console.log(`⚠️  Concurrent conflicts (409): ${conflicts}`);
    console.log(`🐛 OT calculation errors: ${otErrors}`);
    console.log(`🐛 Data mismatches: ${dataMismatches}`);
    console.log('');
    console.log('⏱️  Performance:');
    console.log(`   Avg checkout time: ${avgCheckoutTime.toFixed(2)}ms`);
    console.log(`   p95 checkout time: ${p95CheckoutTime.toFixed(2)}ms`);
    console.log('========================================\n');

    // Validation status
    const allPassed = (
        checkoutFailedCount < 5 &&
        otErrors === 0 &&
        dataMismatches === 0 &&
        p95CheckoutTime < 500
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

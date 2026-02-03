/**
 * k6 Performance Test - Cross-Midnight Dashboard Load
 * 
 * Scenario: 20 users working cross-midnight, polling dashboard every 5s
 * Goal: Validate dashboard shows correct WORKING status for cross-midnight sessions
 * 
 * Prerequisites:
 * 1. Run seed script: node performance/seed/cross-midnight-seed.js
 * 2. Start server: npm run dev
 * 
 * Run: k6 run server/performance/k6/cross-midnight-dashboard-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL } from './config.js';

// Custom metrics
const dashboardQueries = new Counter('dashboard_queries');
const dashboardErrors = new Counter('dashboard_errors');
const dashboardLoadTime = new Trend('dashboard_load_time');
const statusAccuracy = new Counter('status_accuracy_errors');
const uiDataFreshness = new Trend('ui_data_freshness');
const checkoutsPerformed = new Counter('checkouts_performed');

// Test configuration - Constant load for 5 minutes
export const options = {
    scenarios: {
        dashboard_polling: {
            executor: 'constant-vus',
            vus: 20,
            duration: '5m',
        },
    },
    thresholds: {
        'dashboard_load_time': ['p(95)<200'],    // 95% < 200ms
        'http_req_failed': ['rate<0.01'],        // Error rate < 1%
        'status_accuracy_errors': ['count<5'],   // Max 5 incorrect status
    },
};

// Test user pool (first 20 employees)
const testUsers = [];
for (let i = 1; i <= 20; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123',
        employeeNum: i,
        hasCheckedOut: false,
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

// Main test function
export default function () {
    // Pick a random test user
    const userIndex = Math.floor(Math.random() * testUsers.length);
    const user = testUsers[userIndex];

    // Step 1: Login
    const token = login(user);
    if (!token) {
        dashboardErrors.add(1);
        sleep(1);
        return;
    }

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    };

    // Step 2: Loop - Poll dashboard every 5s for 30s (simulate active monitoring)
    const iterations = 6; // 6 polls in 30s
    for (let i = 0; i < iterations; i++) {
        // GET today's attendance
        const startTime = Date.now();
        const res = http.get(`${BASE_URL}/api/attendance/today`, authHeaders);
        const loadTime = Date.now() - startTime;
        
        dashboardLoadTime.add(loadTime);
        dashboardQueries.add(1);

        const checkOk = check(res, {
            'Dashboard status 200': (r) => r.status === 200,
            'Dashboard response has data': (r) => {
                try {
                    return r.json('data') !== undefined;
                } catch (e) {
                    return false;
                }
            },
            'Dashboard load time < 200ms': () => loadTime < 200,
        });

        if (!checkOk) {
            dashboardErrors.add(1);
            sleep(5);
            continue;
        }

        // Verify status accuracy
        const data = res.json('data');
        
        if (data && data.checkInAt) {
            // User is checked in
            if (!user.hasCheckedOut) {
                // Should show WORKING status (checkOutAt null)
                if (data.checkOutAt !== null) {
                    console.error(`❌ ${user.identifier}: Expected WORKING but got checkOutAt: ${data.checkOutAt}`);
                    statusAccuracy.add(1);
                }

                // Verify checkInAt is yesterday (cross-midnight)
                const checkInDate = new Date(data.checkInAt);
                const today = new Date();
                const checkInDay = checkInDate.toISOString().split('T')[0];
                const todayDay = today.toISOString().split('T')[0];

                // Cross-midnight: checkIn should be before today
                if (checkInDay === todayDay) {
                    console.warn(`⚠️  ${user.identifier}: checkIn date is today (${checkInDay}), expected yesterday`);
                }

                // Verify OT starts accruing after 18:30
                const now = new Date();
                const endOfShift = new Date(checkInDate);
                endOfShift.setHours(18, 30, 0, 0);
                endOfShift.setDate(endOfShift.getDate() + 1); // Next day 18:30

                if (now > endOfShift && data.otMinutes !== undefined) {
                    if (data.otMinutes <= 0) {
                        console.warn(`⚠️  ${user.identifier}: OT should be positive after 18:30, got ${data.otMinutes}`);
                    }
                }

            } else {
                // User has checked out, should have checkOutAt
                if (data.checkOutAt === null) {
                    console.error(`❌ ${user.identifier}: Expected checkOutAt but got null`);
                    statusAccuracy.add(1);
                }
            }
        } else {
            // No check-in data (user hasn't checked in)
            console.warn(`⚠️  ${user.identifier}: No check-in data found (skipping validation)`);
        }

        // Step 3: Randomly checkout (50% chance on last iteration)
        if (i === iterations - 1 && !user.hasCheckedOut && Math.random() > 0.5) {
            const checkoutStart = Date.now();
            const checkOutRes = http.post(`${BASE_URL}/api/attendance/check-out`, null, authHeaders);
            
            if (checkOutRes.status === 200 || checkOutRes.status === 201) {
                user.hasCheckedOut = true;
                checkoutsPerformed.add(1);
                
                // Measure UI data freshness (time to checkout)
                const freshnessTime = Date.now() - checkoutStart;
                uiDataFreshness.add(freshnessTime);

                console.log(`✅ ${user.identifier}: Checked out successfully (${freshnessTime}ms)`);
            } else if (checkOutRes.status === 409) {
                // Already checked out
                user.hasCheckedOut = true;
                console.log(`⚠️  ${user.identifier}: Already checked out (409)`);
            } else {
                console.error(`❌ ${user.identifier}: Checkout failed (${checkOutRes.status})`);
            }
        }

        // Wait 5s before next poll (simulate user monitoring)
        sleep(5);
    }
}

// Summary report
export function handleSummary(data) {
    const totalQueries = data.metrics['dashboard_queries']?.values?.count || 0;
    const errors = data.metrics['dashboard_errors']?.values?.count || 0;
    const statusErrors = data.metrics['status_accuracy_errors']?.values?.count || 0;
    const checkouts = data.metrics['checkouts_performed']?.values?.count || 0;

    const avgLoadTime = data.metrics['dashboard_load_time']?.values?.avg || 0;
    const p95LoadTime = data.metrics['dashboard_load_time']?.values?.['p(95)'] || 0;
    const avgFreshness = data.metrics['ui_data_freshness']?.values?.avg || 0;

    console.log('\n========================================');
    console.log('📊 Cross-Midnight Dashboard Load Summary');
    console.log('========================================');
    console.log(`📈 Total dashboard queries: ${totalQueries}`);
    console.log(`❌ Query errors: ${errors}`);
    console.log(`🐛 Status accuracy errors: ${statusErrors}`);
    console.log(`✅ Checkouts performed: ${checkouts}`);
    console.log('');
    console.log('⏱️  Performance:');
    console.log(`   Avg load time: ${avgLoadTime.toFixed(2)}ms`);
    console.log(`   p95 load time: ${p95LoadTime.toFixed(2)}ms`);
    console.log(`   Avg UI freshness: ${avgFreshness.toFixed(2)}ms`);
    console.log('========================================\n');

    // Validation status
    const allPassed = (
        errors < 10 &&
        statusErrors < 5 &&
        p95LoadTime < 200
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

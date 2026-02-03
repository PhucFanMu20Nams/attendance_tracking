/**
 * k6 Performance Test - Cross-Midnight Spike Test
 * 
 * Scenario: Sudden midnight spike - 0 to 100 users in 10 seconds
 * Goal: Test system behavior under extreme traffic shock at midnight boundary
 * 
 * Prerequisites:
 * 1. Run seed script: node performance/seed/cross-midnight-seed.js
 * 2. Start server: npm run dev
 * 
 * Run: k6 run server/performance/k6/cross-midnight-spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { BASE_URL, STRESS_THRESHOLDS } from './config.js';

// Custom metrics
const spike502Errors = new Counter('spike_502_errors');
const spike503Errors = new Counter('spike_503_errors');
const recoveryTime = new Trend('recovery_time');
const deadlockErrors = new Counter('deadlock_errors');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const retryAttempts = new Counter('retry_attempts');

// Test configuration - Spike pattern
export const options = {
    scenarios: {
        midnight_spike: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },   // Baseline
                { duration: '10s', target: 100 },  // SPIKE at midnight
                { duration: '2m', target: 100 },   // Hold (stress test)
                { duration: '30s', target: 10 },   // Recover
                { duration: '30s', target: 0 },    // Cool down
            ],
        },
    },
    thresholds: {
        ...STRESS_THRESHOLDS,
        'spike_502_errors': ['count<20'],        // Allow some 502 errors
        'spike_503_errors': ['count<20'],        // Allow some 503 errors
    },
};

// Test user pool (100 employees)
const testUsers = [];
for (let i = 1; i <= 100; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123',
        employeeNum: i,
    });
}

// Helper: Login with retry
function loginWithRetry(user, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const payload = JSON.stringify({
            identifier: user.identifier,
            password: user.password,
        });

        const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: '10s',
        });

        if (res.status === 200) {
            try {
                return res.json('token');
            } catch (e) {
                console.error(`❌ ${user.identifier}: Failed to parse login response (attempt ${attempt})`);
            }
        } else if (res.status === 502) {
            spike502Errors.add(1);
            console.warn(`⚠️  ${user.identifier}: 502 Bad Gateway (attempt ${attempt})`);
        } else if (res.status === 503) {
            spike503Errors.add(1);
            console.warn(`⚠️  ${user.identifier}: 503 Service Unavailable (attempt ${attempt})`);
        }

        if (attempt < maxRetries) {
            retryAttempts.add(1);
            sleep(1); // Wait before retry
        }
    }

    return null;
}

// Helper: Checkout with retry
function checkoutWithRetry(token, user, maxRetries = 3) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        timeout: '10s',
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const startTime = Date.now();
        const res = http.post(`${BASE_URL}/api/attendance/check-out`, null, authHeaders);
        const duration = Date.now() - startTime;

        if (res.status === 200 || res.status === 201) {
            recoveryTime.add(duration);
            return { success: true, duration };
        } else if (res.status === 409) {
            // Already checked out - acceptable
            return { success: true, duration, conflict: true };
        } else if (res.status === 502) {
            spike502Errors.add(1);
            console.warn(`⚠️  ${user.identifier}: Checkout 502 (attempt ${attempt})`);
        } else if (res.status === 503) {
            spike503Errors.add(1);
            console.warn(`⚠️  ${user.identifier}: Checkout 503 (attempt ${attempt})`);
        } else if (res.status === 500) {
            // Check for deadlock errors
            try {
                const body = res.body;
                if (body && (body.includes('deadlock') || body.includes('lock'))) {
                    deadlockErrors.add(1);
                    console.error(`❌ ${user.identifier}: Deadlock detected!`);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        if (attempt < maxRetries) {
            retryAttempts.add(1);
            sleep(0.5); // Short retry delay
        }
    }

    return { success: false, duration: 0 };
}

// Main test function (per VU)
export default function () {
    // Pick a random test user
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];

    // Step 1: Rapid login (no delay)
    const token = loginWithRetry(user);
    if (!token) {
        failedRequests.add(1);
        return; // No sleep - rapid retry
    }

    // Step 2: Rapid checkout (no delay)
    const result = checkoutWithRetry(token, user);
    
    if (result.success) {
        successfulRequests.add(1);
        
        if (result.conflict) {
            console.log(`✅ ${user.identifier}: Already checked out (409)`);
        } else {
            console.log(`✅ ${user.identifier}: Checked out successfully (${result.duration}ms)`);
        }
    } else {
        failedRequests.add(1);
        console.error(`❌ ${user.identifier}: All checkout attempts failed`);
    }

    // Minimal delay (stress test)
    sleep(0.1 + Math.random() * 0.2);
}

// Summary report
export function handleSummary(data) {
    const successful = data.metrics['successful_requests']?.values?.count || 0;
    const failed = data.metrics['failed_requests']?.values?.count || 0;
    const retries = data.metrics['retry_attempts']?.values?.count || 0;
    const errors502 = data.metrics['spike_502_errors']?.values?.count || 0;
    const errors503 = data.metrics['spike_503_errors']?.values?.count || 0;
    const deadlocks = data.metrics['deadlock_errors']?.values?.count || 0;

    const avgRecovery = data.metrics['recovery_time']?.values?.avg || 0;
    const p95Recovery = data.metrics['recovery_time']?.values?.['p(95)'] || 0;
    const maxRecovery = data.metrics['recovery_time']?.values?.max || 0;

    const totalRequests = successful + failed;
    const errorRate = totalRequests > 0 ? (failed / totalRequests * 100) : 0;

    console.log('\n========================================');
    console.log('📊 Cross-Midnight Spike Test Summary');
    console.log('========================================');
    console.log(`✅ Successful requests: ${successful}`);
    console.log(`❌ Failed requests: ${failed}`);
    console.log(`🔁 Retry attempts: ${retries}`);
    console.log(`📊 Error rate: ${errorRate.toFixed(2)}%`);
    console.log('');
    console.log('🚨 Server Errors:');
    console.log(`   502 Bad Gateway: ${errors502}`);
    console.log(`   503 Service Unavailable: ${errors503}`);
    console.log(`   Deadlock errors: ${deadlocks}`);
    console.log('');
    console.log('⏱️  Recovery Time:');
    console.log(`   Avg: ${avgRecovery.toFixed(2)}ms`);
    console.log(`   p95: ${p95Recovery.toFixed(2)}ms`);
    console.log(`   Max: ${maxRecovery.toFixed(2)}ms`);
    console.log('========================================\n');

    // Validation status
    const systemDidNotCrash = errors502 < 20 && errors503 < 20;
    const acceptableErrorRate = errorRate < 5;
    const noDeadlocks = deadlocks === 0;
    const quickRecovery = maxRecovery < 30000; // 30 seconds

    const allPassed = (
        systemDidNotCrash &&
        acceptableErrorRate &&
        noDeadlocks &&
        quickRecovery
    );

    console.log('📋 Validation Results:');
    console.log(`   ${systemDidNotCrash ? '✅' : '❌'} System did not crash (502/503 < 20)`);
    console.log(`   ${acceptableErrorRate ? '✅' : '❌'} Error rate < 5%`);
    console.log(`   ${noDeadlocks ? '✅' : '❌'} No deadlocks detected`);
    console.log(`   ${quickRecovery ? '✅' : '❌'} Recovery time < 30s`);
    console.log('');

    if (allPassed) {
        console.log('🎉 ✅ ALL VALIDATION PASSED!');
    } else {
        console.log('❌ VALIDATION FAILED - Check errors above');
    }

    return {
        'stdout': JSON.stringify(data, null, 2),
    };
}

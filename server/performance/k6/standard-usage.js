/**
 * k6 Performance Test - Case 2: Standard Usage (Mixed Workload)
 * 
 * Scenario: Normal working hours with mixed API operations
 * Goal: 50 concurrent users performing typical workflows
 * 
 * Run: k6 run server/performance/k6/standard-usage.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, STANDARD_THRESHOLDS } from './config.js';
import { randomReason, randomPastDate, createCheckInTime, createCheckOutTime } from './helpers.js';

// Custom metrics
const workflowSuccess = new Counter('workflow_success');
const workflowFailed = new Counter('workflow_failed');

// Test configuration
export const options = {
    scenarios: {
        standard_usage: {
            executor: 'constant-vus',
            vus: 50,              // 50 concurrent users
            duration: '5m',       // Run for 5 minutes
        },
    },
    thresholds: STANDARD_THRESHOLDS,
};

// Test user pool
const testUsers = [];
for (let i = 1; i <= 50; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123'
    });
}

export default function () {
    const user = testUsers[__VU % testUsers.length]; // Each VU uses a specific user
    let token = null;

    // Step 1: Login
    group('1. Login', function () {
        const payload = JSON.stringify({
            identifier: user.identifier,
            password: user.password,
        });

        const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'login' },
        });

        const success = check(res, {
            'login OK': (r) => r.status === 200,
        });

        if (success) {
            token = res.json('token');
        } else {
            console.log(`Login failed: ${res.status}`);
            return;
        }
    });

    if (!token) {
        workflowFailed.add(1);
        return;
    }

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };

    sleep(1); // Think time

    // Step 2: Get My Requests
    group('2. Get My Requests', function () {
        const res = http.get(`${BASE_URL}/api/requests/me`, {
            ...authHeaders,
            tags: { name: 'get_requests' },
        });

        check(res, {
            'get requests OK': (r) => r.status === 200,
            'has items array': (r) => {
                try {
                    return Array.isArray(r.json('items'));
                } catch (e) {
                    return false;
                }
            },
        });
    });

    sleep(2); // Think time

    // Step 3: Get My Attendance
    group('3. Get My Attendance', function () {
        const res = http.get(`${BASE_URL}/api/attendance/me`, {
            ...authHeaders,
            tags: { name: 'get_attendance' },
        });

        check(res, {
            'get attendance OK': (r) => r.status === 200,
        });
    });

    sleep(1); // Think time

    // Step 4: Get Profile (Auth Me)
    group('4. Get Profile', function () {
        const res = http.get(`${BASE_URL}/api/auth/me`, {
            ...authHeaders,
            tags: { name: 'get_profile' },
        });

        check(res, {
            'get profile OK': (r) => r.status === 200,
            'has user data': (r) => {
                try {
                    return r.json('user') !== undefined;
                } catch (e) {
                    return false;
                }
            },
        });
    });

    workflowSuccess.add(1);

    // Cool down between iterations
    sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function handleSummary(data) {
    console.log('\n========== STANDARD USAGE TEST SUMMARY ==========');
    console.log(`Total HTTP Requests: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Successful Workflows: ${data.metrics.workflow_success?.values?.count || 0}`);
    console.log(`Failed Workflows: ${data.metrics.workflow_failed?.values?.count || 0}`);
    console.log(`Avg Duration: ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`P95 Duration: ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`Error Rate: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
    console.log('==================================================\n');

    return {
        stdout: JSON.stringify(data, null, 2),
    };
}

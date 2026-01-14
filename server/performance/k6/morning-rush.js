/**
 * k6 Performance Test - Case 1: Morning Rush (Login Spike)
 * 
 * Scenario: 8:55 AM - 9:05 AM employees arrive and login simultaneously
 * Goal: Test system handles 100-500 login requests in 5 minutes
 * 
 * Run: k6 run server/performance/k6/morning-rush.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, LOGIN_THRESHOLDS } from './config.js';

// Custom metrics
const loginSuccess = new Counter('login_success');
const loginFailed = new Counter('login_failed');
const loginDuration = new Trend('login_duration');

// Test configuration
export const options = {
    scenarios: {
        morning_rush: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },   // Ramp up to 50 users
                { duration: '2m', target: 100 },   // Stay at 100 users for 2 min
                { duration: '1m', target: 150 },   // Peak at 150 users
                { duration: '1m', target: 50 },    // Ramp down
                { duration: '30s', target: 0 },    // Cool down
            ],
        },
    },
    thresholds: LOGIN_THRESHOLDS,
};

// Test user pool (simulating different employees)
const testUsers = [];
for (let i = 1; i <= 100; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123'
    });
}

export default function () {
    // Pick a random test user
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];

    const payload = JSON.stringify({
        identifier: user.identifier,
        password: user.password,
    });

    const params = {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'login' },
    };

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);
    const duration = Date.now() - startTime;

    loginDuration.add(duration);

    const success = check(res, {
        'login status is 200': (r) => r.status === 200,
        'login response has token': (r) => {
            try {
                return r.json('token') !== undefined;
            } catch (e) {
                return false;
            }
        },
        'login response time < 300ms': (r) => r.timings.duration < 300,
    });

    if (success) {
        loginSuccess.add(1);
    } else {
        loginFailed.add(1);
        console.log(`Login failed for ${user.identifier}: ${res.status} - ${res.body}`);
    }

    // Simulate realistic think time between requests
    sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
    console.log('\n========== MORNING RUSH TEST SUMMARY ==========');
    console.log(`Total Requests: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Success Rate: ${((loginSuccess.name in data.metrics) ?
        (data.metrics.login_success.values.count / data.metrics.http_reqs.values.count * 100).toFixed(2) : 'N/A')}%`);
    console.log(`Avg Duration: ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`P95 Duration: ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log('================================================\n');

    return {
        stdout: JSON.stringify(data, null, 2),
    };
}

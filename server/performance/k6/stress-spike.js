/**
 * k6 Performance Test - Case 4: Stress Spike (Traffic Shock)
 * 
 * Scenario: Sudden spike in traffic (0 → 500 users in 10 seconds)
 * Goal: System should not crash (502), should recover after spike
 * 
 * Run: k6 run server/performance/k6/stress-spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, STRESS_THRESHOLDS } from './config.js';

// Custom metrics
const spikeSuccess = new Counter('spike_success');
const spikeFailed = new Counter('spike_failed');
const spike502 = new Counter('spike_502_errors');

// Test configuration - Spike pattern
export const options = {
    scenarios: {
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },   // Warm up
                { duration: '10s', target: 200 },  // SPIKE! 0 → 200 in 10s
                { duration: '1m', target: 200 },   // Hold at peak
                { duration: '10s', target: 300 },  // Push harder
                { duration: '30s', target: 300 },  // Hold at max
                { duration: '20s', target: 50 },   // Ramp down
                { duration: '1m', target: 50 },    // Recovery period
                { duration: '20s', target: 0 },    // Cool down
            ],
        },
    },
    thresholds: STRESS_THRESHOLDS,
};

// Test users pool
const testUsers = [];
for (let i = 1; i <= 200; i++) {
    testUsers.push({
        identifier: `employee${i}@test.com`,
        password: 'Password123'
    });
}

export default function () {
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];

    // Operation 1: Login
    const loginPayload = JSON.stringify({
        identifier: user.identifier,
        password: user.password,
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'spike_login' },
        timeout: '10s', // Allow longer timeout during spike
    });

    if (loginRes.status === 502 || loginRes.status === 503) {
        spike502.add(1);
        spikeFailed.add(1);
        console.log(`Server overloaded: ${loginRes.status}`);
        sleep(2); // Back off
        return;
    }

    const loginSuccess = check(loginRes, {
        'spike login OK': (r) => r.status === 200,
    });

    if (!loginSuccess) {
        spikeFailed.add(1);
        sleep(1);
        return;
    }

    const token = loginRes.json('token');

    // Operation 2: Quick API call
    const meRes = http.get(`${BASE_URL}/api/auth/me`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'spike_me' },
        timeout: '10s',
    });

    if (meRes.status === 502 || meRes.status === 503) {
        spike502.add(1);
        spikeFailed.add(1);
        return;
    }

    const meSuccess = check(meRes, {
        'spike me OK': (r) => r.status === 200,
    });

    if (loginSuccess && meSuccess) {
        spikeSuccess.add(1);
    } else {
        spikeFailed.add(1);
    }

    // Minimal sleep to maximize load
    sleep(Math.random() * 0.5);
}

export function handleSummary(data) {
    const total = data.metrics.http_reqs?.values?.count || 0;
    const failed = data.metrics.spike_failed?.values?.count || 0;
    const errors502 = data.metrics.spike_502_errors?.values?.count || 0;

    console.log('\n========== STRESS SPIKE TEST SUMMARY ==========');
    console.log(`Total Requests: ${total}`);
    console.log(`Successful Operations: ${data.metrics.spike_success?.values?.count || 0}`);
    console.log(`Failed Operations: ${failed}`);
    console.log(`502/503 Errors: ${errors502}`);
    console.log(`Avg Duration: ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`P95 Duration: ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log(`Max Duration: ${data.metrics.http_req_duration?.values?.max?.toFixed(2) || 'N/A'}ms`);
    console.log(`Error Rate: ${((failed / total) * 100).toFixed(2)}%`);
    console.log('');
    if (errors502 === 0) {
        console.log('✅ PASS: No 502/503 errors - Server survived the spike!');
    } else {
        console.log('❌ FAIL: Server crashed during spike - needs optimization');
    }
    console.log('================================================\n');

    return {
        stdout: JSON.stringify(data, null, 2),
    };
}

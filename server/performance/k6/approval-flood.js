/**
 * k6 Performance Test - Case 3: Approval Flood (Manager Stress)
 * 
 * Scenario: Multiple managers approving requests simultaneously
 * Goal: Test database doesn't deadlock under concurrent approval operations
 * 
 * Prerequisites: Need pending requests in database
 * Run: k6 run server/performance/k6/approval-flood.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { BASE_URL, STANDARD_THRESHOLDS } from './config.js';

// Custom metrics
const approveSuccess = new Counter('approve_success');
const approveFailed = new Counter('approve_failed');
const approveConflict = new Counter('approve_conflict'); // 409 expected in race conditions
const approveDuration = new Trend('approve_duration');

// Test configuration
export const options = {
    scenarios: {
        approval_flood: {
            executor: 'per-vu-iterations',
            vus: 5,              // 5 managers
            iterations: 20,      // Each approves 20 requests
            maxDuration: '5m',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'],  // Approval should be < 500ms
        http_req_failed: ['rate<0.1'],     // Allow some failures (409 conflicts)
    },
};

// Manager accounts
const managers = [
    { identifier: 'manager1@test.com', password: 'Password123' },
    { identifier: 'manager2@test.com', password: 'Password123' },
    { identifier: 'manager3@test.com', password: 'Password123' },
    { identifier: 'manager4@test.com', password: 'Password123' },
    { identifier: 'manager5@test.com', password: 'Password123' },
];

export function setup() {
    // Login as admin to get pending requests
    const adminPayload = JSON.stringify({
        identifier: 'admin@test.com',
        password: 'Password123',
    });

    const adminRes = http.post(`${BASE_URL}/api/auth/login`, adminPayload, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (adminRes.status !== 200) {
        console.log('Admin login failed - make sure admin user exists');
        return { pendingRequests: [], managerTokens: {} };
    }

    const adminToken = adminRes.json('token');

    // Get pending requests
    const pendingRes = http.get(`${BASE_URL}/api/requests/pending`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
        },
    });

    let pendingRequests = [];
    if (pendingRes.status === 200) {
        try {
            pendingRequests = pendingRes.json('items') || [];
        } catch (e) {
            console.log('Failed to parse pending requests');
        }
    }

    // Login all managers and store tokens
    const managerTokens = {};
    for (const mgr of managers) {
        const payload = JSON.stringify({
            identifier: mgr.identifier,
            password: mgr.password,
        });

        const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (res.status === 200) {
            managerTokens[mgr.identifier] = res.json('token');
        } else {
            console.log(`Manager ${mgr.identifier} login failed`);
        }
    }

    console.log(`Setup complete: ${pendingRequests.length} pending requests, ${Object.keys(managerTokens).length} managers logged in`);

    return {
        pendingRequests: pendingRequests.map(r => r._id),
        managerTokens,
    };
}

export default function (data) {
    const manager = managers[__VU % managers.length];
    const token = data.managerTokens[manager.identifier];

    if (!token) {
        console.log(`No token for ${manager.identifier}`);
        return;
    }

    if (data.pendingRequests.length === 0) {
        console.log('No pending requests to approve - skipping');
        sleep(1);
        return;
    }

    // Pick a random pending request
    const requestId = data.pendingRequests[Math.floor(Math.random() * data.pendingRequests.length)];

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/requests/${requestId}/approve`, null, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'approve' },
    });
    const duration = Date.now() - startTime;

    approveDuration.add(duration);

    if (res.status === 200) {
        approveSuccess.add(1);
        check(res, {
            'approve status is 200': (r) => r.status === 200,
            'approve response time < 500ms': (r) => r.timings.duration < 500,
        });
    } else if (res.status === 409) {
        // Expected: race condition - another manager approved first
        approveConflict.add(1);
        check(res, {
            'conflict is 409': (r) => r.status === 409,
        });
    } else if (res.status === 403) {
        // Expected: RBAC - manager not allowed for this team
        check(res, {
            'forbidden is 403': (r) => r.status === 403,
        });
    } else {
        approveFailed.add(1);
        console.log(`Unexpected error: ${res.status} - ${res.body}`);
    }

    sleep(Math.random() * 0.5 + 0.2); // Short delay between approvals
}

export function handleSummary(data) {
    console.log('\n========== APPROVAL FLOOD TEST SUMMARY ==========');
    console.log(`Total Approve Attempts: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Successful Approvals: ${data.metrics.approve_success?.values?.count || 0}`);
    console.log(`Race Condition Conflicts (409): ${data.metrics.approve_conflict?.values?.count || 0}`);
    console.log(`Unexpected Failures: ${data.metrics.approve_failed?.values?.count || 0}`);
    console.log(`Avg Duration: ${data.metrics.approve_duration?.values?.avg?.toFixed(2) || 'N/A'}ms`);
    console.log(`P95 Duration: ${data.metrics.approve_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms`);
    console.log('==================================================\n');

    return {
        stdout: JSON.stringify(data, null, 2),
    };
}

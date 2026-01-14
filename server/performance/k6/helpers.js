/**
 * k6 Performance Test - Helper Functions
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

/**
 * Login and get JWT token
 * @param {string} identifier - Email or employee code
 * @param {string} password - Password
 * @returns {string|null} JWT token or null if failed
 */
export function login(identifier, password) {
    const payload = JSON.stringify({ identifier, password });
    const params = {
        headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

    const success = check(res, {
        'login status is 200': (r) => r.status === 200,
        'login has token': (r) => r.json('token') !== undefined,
    });

    if (success) {
        return res.json('token');
    }
    return null;
}

/**
 * Create authorized headers with JWT token
 * @param {string} token - JWT token
 * @returns {object} Headers object
 */
export function authHeaders(token) {
    return {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    };
}

/**
 * Generate random date in YYYY-MM-DD format (within last 30 days)
 * @returns {string} Date string
 */
export function randomPastDate() {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 30) + 1;
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
}

/**
 * Generate random reason text
 * @param {number} length - Approximate length of reason
 * @returns {string} Random reason
 */
export function randomReason(length = 50) {
    const reasons = [
        'Forgot to check in due to urgent meeting',
        'System was down when I arrived',
        'Had to rush to client site',
        'Computer issue - could not access system',
        'Badge reader was not working',
        'Traffic delay - arrived late',
        'Doctor appointment in the morning',
        'Family emergency required attention',
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
}

/**
 * Get current date in YYYY-MM-DD format (GMT+7)
 * @returns {string} Date string
 */
export function getTodayDate() {
    const now = new Date();
    // Adjust for GMT+7
    const gmt7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return gmt7.toISOString().split('T')[0];
}

/**
 * Create a timestamp for check-in (8:30 AM GMT+7)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {string} ISO timestamp
 */
export function createCheckInTime(date) {
    return `${date}T08:30:00+07:00`;
}

/**
 * Create a timestamp for check-out (17:30 PM GMT+7)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {string} ISO timestamp
 */
export function createCheckOutTime(date) {
    return `${date}T17:30:00+07:00`;
}

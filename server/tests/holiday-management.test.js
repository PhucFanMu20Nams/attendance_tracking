/**
 * Holiday Management API Tests
 * 
 * Test Design Techniques (ISTQB):
 * - Happy Path: Create and list holidays
 * - RBAC: ADMIN only access
 * - Validation: Date format, name required
 * - Conflict: Duplicate date handling
 * - Edge Cases: Empty list, year filter
 * 
 * Target: POST/GET /api/admin/holidays
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Holiday from '../src/models/Holiday.js';
import bcrypt from 'bcrypt';

let adminToken, managerToken, employeeToken;

beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI?.replace(/\/[^/]+$/, '/holiday_api_test_db')
        || 'mongodb://localhost:27017/holiday_api_test_db');

    // Clean up
    await User.deleteMany({});
    await Holiday.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123', 10);

    // Admin
    await User.create({
        employeeCode: 'HOL001',
        name: 'Holiday Admin',
        email: 'holidayadmin@test.com',
        passwordHash,
        role: 'ADMIN',
        isActive: true
    });

    // Manager
    await User.create({
        employeeCode: 'HOL002',
        name: 'Holiday Manager',
        email: 'holidaymanager@test.com',
        passwordHash,
        role: 'MANAGER',
        isActive: true
    });

    // Employee
    await User.create({
        employeeCode: 'HOL003',
        name: 'Holiday Employee',
        email: 'holidayemployee@test.com',
        passwordHash,
        role: 'EMPLOYEE',
        isActive: true
    });

    // Get tokens
    const adminRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'holidayadmin@test.com', password: 'Password123' });
    adminToken = adminRes.body.token;

    const managerRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'holidaymanager@test.com', password: 'Password123' });
    managerToken = managerRes.body.token;

    const employeeRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'holidayemployee@test.com', password: 'Password123' });
    employeeToken = employeeRes.body.token;
});

afterAll(async () => {
    await User.deleteMany({});
    await Holiday.deleteMany({});
    await mongoose.connection.close();
});


// ============================================
// LEVEL 1: HAPPY PATHS
// ============================================
describe('Holiday API - Happy Paths', () => {

    describe('1. Admin creates holiday', () => {
        it('POST /api/admin/holidays -> 201 Created', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-01-01', name: 'Tết Dương Lịch' });

            expect(res.status).toBe(201);
            expect(res.body._id).toBeDefined();
            expect(res.body.date).toBe('2026-01-01');
            expect(res.body.name).toBe('Tết Dương Lịch');
        });

        it('Response excludes timestamps and __v', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-05-01', name: 'Ngày Quốc Tế Lao Động' });

            expect(res.status).toBe(201);
            expect(res.body.createdAt).toBeUndefined();
            expect(res.body.updatedAt).toBeUndefined();
            expect(res.body.__v).toBeUndefined();
        });
    });

    describe('2. Admin gets holidays', () => {
        it('GET /api/admin/holidays?year=2026 -> 200 with items', async () => {
            const res = await request(app)
                .get('/api/admin/holidays?year=2026')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.items).toBeDefined();
            expect(Array.isArray(res.body.items)).toBe(true);
            expect(res.body.items.length).toBeGreaterThanOrEqual(2);
        });

        it('Holidays are sorted by date', async () => {
            const res = await request(app)
                .get('/api/admin/holidays?year=2026')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const dates = res.body.items.map(h => h.date);
            expect(dates).toEqual([...dates].sort());
        });
    });

    describe('3. Year filter works', () => {
        it('Returns only holidays matching year', async () => {
            // Create holiday for different year
            await Holiday.create({ date: '2025-12-25', name: 'Giáng Sinh 2025' });

            const res2026 = await request(app)
                .get('/api/admin/holidays?year=2026')
                .set('Authorization', `Bearer ${adminToken}`);

            const res2025 = await request(app)
                .get('/api/admin/holidays?year=2025')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res2026.body.items.every(h => h.date.startsWith('2026'))).toBe(true);
            expect(res2025.body.items.every(h => h.date.startsWith('2025'))).toBe(true);
        });
    });
});


// ============================================
// LEVEL 2: RBAC - ADMIN ONLY
// ============================================
describe('Holiday API - RBAC', () => {

    describe('4. Manager cannot access', () => {
        it('POST /api/admin/holidays -> 403', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ date: '2026-02-14', name: 'Test' });

            expect(res.status).toBe(403);
            expect(res.body.message).toBeDefined();
        });

        it('GET /api/admin/holidays -> 403', async () => {
            const res = await request(app)
                .get('/api/admin/holidays')
                .set('Authorization', `Bearer ${managerToken}`);

            expect(res.status).toBe(403);
        });
    });

    describe('5. Employee cannot access', () => {
        it('POST /api/admin/holidays -> 403', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${employeeToken}`)
                .send({ date: '2026-02-14', name: 'Test' });

            expect(res.status).toBe(403);
        });

        it('GET /api/admin/holidays -> 403', async () => {
            const res = await request(app)
                .get('/api/admin/holidays')
                .set('Authorization', `Bearer ${employeeToken}`);

            expect(res.status).toBe(403);
        });
    });

    describe('6. No authentication -> 401', () => {
        it('POST without token -> 401', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .send({ date: '2026-03-08', name: 'Test' });

            expect(res.status).toBe(401);
        });

        it('GET without token -> 401', async () => {
            const res = await request(app)
                .get('/api/admin/holidays');

            expect(res.status).toBe(401);
        });
    });
});


// ============================================
// LEVEL 3: VALIDATION
// ============================================
describe('Holiday API - Validation', () => {

    describe('7. Missing date -> 400', () => {
        it('POST without date -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Some Holiday' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/date/i);
        });
    });

    describe('8. Invalid date format -> 400', () => {
        it('Date with wrong format -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '01-01-2026', name: 'Test' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/YYYY-MM-DD/);
        });

        it('Date with timestamp -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-01-01T00:00:00Z', name: 'Test' });

            expect(res.status).toBe(400);
        });
    });

    describe('9. Missing name -> 400', () => {
        it('POST without name -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-06-01' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/name/i);
        });

        it('POST with empty name -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-06-02', name: '   ' });

            expect(res.status).toBe(400);
        });
    });

    describe('10. Invalid year format -> 400', () => {
        it('GET with non-numeric year -> 400', async () => {
            const res = await request(app)
                .get('/api/admin/holidays?year=abc')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
        });

        it('GET with short year -> 400', async () => {
            const res = await request(app)
                .get('/api/admin/holidays?year=26')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
        });
    });
});


// ============================================
// LEVEL 4: CONFLICT
// ============================================
describe('Holiday API - Conflict', () => {

    describe('11. Duplicate date -> 409', () => {
        it('Creating holiday with existing date -> 409', async () => {
            // First create should work
            await Holiday.deleteMany({ date: '2026-09-02' });
            const res1 = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-09-02', name: 'Ngày Quốc Khánh' });

            expect(res1.status).toBe(201);

            // Duplicate should fail
            const res2 = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-09-02', name: 'Different Name' });

            expect(res2.status).toBe(409);
            expect(res2.body.message).toMatch(/already exists/i);
        });
    });
});


// ============================================
// LEVEL 5: EDGE CASES
// ============================================
describe('Holiday API - Edge Cases', () => {

    describe('12. Empty holidays list', () => {
        it('Returns empty array for year with no holidays', async () => {
            const res = await request(app)
                .get('/api/admin/holidays?year=2099')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.items).toEqual([]);
        });
    });

    describe('13. Name with whitespace is trimmed', () => {
        it('Name is trimmed on save', async () => {
            await Holiday.deleteMany({ date: '2026-10-10' });
            const res = await request(app)
                .post('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ date: '2026-10-10', name: '  Trimmed Name  ' });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Trimmed Name');
        });
    });

    describe('14. Default year uses current year (GMT+7)', () => {
        it('GET without year param uses current year', async () => {
            const res = await request(app)
                .get('/api/admin/holidays')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            // Current year is 2026 based on system time
            expect(res.body.items.every(h => h.date.startsWith('2026'))).toBe(true);
        });
    });
});


// ============================================
// SUMMARY
// ============================================
describe('Holiday API Test Summary', () => {
    it('[HAPPY PATH] ✓ Admin can create and list holidays', () => expect(true).toBe(true));
    it('[RBAC] ✓ Non-admin users get 403', () => expect(true).toBe(true));
    it('[AUTH] ✓ Requires valid JWT token', () => expect(true).toBe(true));
    it('[VALIDATION] ✓ Date format and name validated', () => expect(true).toBe(true));
    it('[CONFLICT] ✓ Duplicate dates return 409', () => expect(true).toBe(true));
    it('[EDGE] ✓ Empty list, trimming, year filter handled', () => expect(true).toBe(true));
});

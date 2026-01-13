import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Team from '../src/models/Team.js';
import Attendance from '../src/models/Attendance.js';
import bcrypt from 'bcrypt';

let adminToken, managerToken, employeeToken;
let teamId, adminId, managerId, employeeId;

beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_test_db');

    // Clean up
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});

    // Create test team
    const team = await Team.create({ name: 'Test Team' });
    teamId = team._id;

    // Create test users
    const passwordHash = await bcrypt.hash('Password123', 10);

    const admin = await User.create({
        employeeCode: 'TEST001',
        name: 'Test Admin',
        email: 'testadmin@test.com',
        passwordHash,
        role: 'ADMIN',
        isActive: true
    });
    adminId = admin._id;

    const manager = await User.create({
        employeeCode: 'TEST002',
        name: 'Test Manager',
        email: 'testmanager@test.com',
        passwordHash,
        role: 'MANAGER',
        teamId,
        isActive: true
    });
    managerId = manager._id;

    const employee = await User.create({
        employeeCode: 'TEST003',
        name: 'Test Employee',
        email: 'testemployee@test.com',
        passwordHash,
        role: 'EMPLOYEE',
        teamId,
        isActive: true
    });
    employeeId = employee._id;

    // Create test attendance data
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0]; // YYYY-MM-DD

    await Attendance.create({
        userId: employeeId,
        date: dateKey,
        checkInAt: new Date(`${dateKey}T08:30:00+07:00`),
        checkOutAt: new Date(`${dateKey}T17:30:00+07:00`)
    });

    // Get tokens
    const adminRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'testadmin@test.com', password: 'Password123' });
    adminToken = adminRes.body.token;

    const managerRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'testmanager@test.com', password: 'Password123' });
    managerToken = managerRes.body.token;

    const employeeRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'testemployee@test.com', password: 'Password123' });
    employeeToken = employeeRes.body.token;
});

afterAll(async () => {
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});
    await mongoose.connection.close();
});

// ===================
// TIMESHEET MATRIX TESTS
// ===================

describe('GET /api/timesheet/team', () => {
    it('should return 200 for Manager with team', async () => {
        const res = await request(app)
            .get('/api/timesheet/team')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('days');
        expect(res.body).toHaveProperty('rows');
        expect(Array.isArray(res.body.days)).toBe(true);
        expect(Array.isArray(res.body.rows)).toBe(true);
    });

    it('should return 200 for Admin with teamId', async () => {
        const res = await request(app)
            .get(`/api/timesheet/team?teamId=${teamId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('rows');
    });

    it('should return 400 for Admin without teamId', async () => {
        const res = await request(app)
            .get('/api/timesheet/team')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('teamId');
    });

    it('should return 403 for Employee', async () => {
        const res = await request(app)
            .get('/api/timesheet/team')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });

    it('should return 401 without auth', async () => {
        const res = await request(app).get('/api/timesheet/team');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/timesheet/company', () => {
    it('should return 200 for Admin', async () => {
        const res = await request(app)
            .get('/api/timesheet/company')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('days');
        expect(res.body).toHaveProperty('rows');
    });

    it('should return 403 for Manager', async () => {
        const res = await request(app)
            .get('/api/timesheet/company')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
    });

    it('should return 403 for Employee', async () => {
        const res = await request(app)
            .get('/api/timesheet/company')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});

// ===================
// MONTHLY REPORT TESTS
// ===================

describe('GET /api/reports/monthly', () => {
    it('should return 200 for Admin with company scope', async () => {
        const res = await request(app)
            .get('/api/reports/monthly?scope=company')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
        expect(Array.isArray(res.body.summary)).toBe(true);
    });

    it('should return 200 for Admin with team scope and teamId', async () => {
        const res = await request(app)
            .get(`/api/reports/monthly?scope=team&teamId=${teamId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
    });

    it('should return 400 for Admin with team scope but no teamId', async () => {
        const res = await request(app)
            .get('/api/reports/monthly?scope=team')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('teamId');
    });

    it('should return 200 for Manager with default team scope', async () => {
        const res = await request(app)
            .get('/api/reports/monthly')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
    });

    it('should return 403 for Manager with company scope', async () => {
        const res = await request(app)
            .get('/api/reports/monthly?scope=company')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('team');
    });

    it('should return 403 for Employee', async () => {
        const res = await request(app)
            .get('/api/reports/monthly')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });

    it('should validate month format', async () => {
        const res = await request(app)
            .get('/api/reports/monthly?month=invalid')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('month');
    });

    it('should return summary with correct fields', async () => {
        const res = await request(app)
            .get('/api/reports/monthly?scope=company')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        if (res.body.summary.length > 0) {
            const item = res.body.summary[0];
            expect(item).toHaveProperty('user');
            expect(item).toHaveProperty('totalWorkMinutes');
            expect(item).toHaveProperty('totalLateCount');
            expect(item).toHaveProperty('totalOtMinutes');
            expect(item.user).toHaveProperty('_id');
            expect(item.user).toHaveProperty('name');
            expect(item.user).toHaveProperty('employeeCode');
        }
    });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Team from '../src/models/Team.js';
import Attendance from '../src/models/Attendance.js';
import Request from '../src/models/Request.js';
import bcrypt from 'bcrypt';

let adminToken, managerToken, employeeToken;
let teamId, employeeId;

beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_test_db');

    // Clean up
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});
    await Request.deleteMany({});

    // Create team
    const team = await Team.create({ name: 'Request Test Team' });
    teamId = team._id;

    const passwordHash = await bcrypt.hash('Password123', 10);

    await User.create({
        employeeCode: 'REQ001',
        name: 'Request Admin',
        email: 'reqadmin@test.com',
        passwordHash,
        role: 'ADMIN',
        isActive: true
    });

    await User.create({
        employeeCode: 'REQ002',
        name: 'Request Manager',
        email: 'reqmanager@test.com',
        passwordHash,
        role: 'MANAGER',
        teamId,
        isActive: true
    });

    const employee = await User.create({
        employeeCode: 'REQ003',
        name: 'Request Employee',
        email: 'reqemployee@test.com',
        passwordHash,
        role: 'EMPLOYEE',
        teamId,
        isActive: true
    });
    employeeId = employee._id;

    // Create existing attendance for partial request tests
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0];

    await Attendance.create({
        userId: employeeId,
        date: dateKey,
        checkInAt: new Date(`${dateKey}T09:00:00+07:00`) // Late check-in
    });

    // Get tokens
    const adminRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'reqadmin@test.com', password: 'Password123' });
    adminToken = adminRes.body.token;

    const managerRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'reqmanager@test.com', password: 'Password123' });
    managerToken = managerRes.body.token;

    const employeeRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'reqemployee@test.com', password: 'Password123' });
    employeeToken = employeeRes.body.token;
});

afterAll(async () => {
    await User.deleteMany({});
    await Team.deleteMany({});
    await Attendance.deleteMany({});
    await Request.deleteMany({});
    await mongoose.connection.close();
});

describe('POST /api/requests', () => {
    const today = new Date().toISOString().split('T')[0];

    it('should create request with both checkIn and checkOut', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckInAt: `${today}T08:30:00+07:00`,
                requestedCheckOutAt: `${today}T17:30:00+07:00`,
                reason: 'Forgot to check in/out'
            });

        expect(res.status).toBe(201);
        expect(res.body.request).toHaveProperty('_id');
        expect(res.body.request.status).toBe('PENDING');
    });

    it('should reject when checkOut < checkIn', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckInAt: `${today}T17:30:00+07:00`,
                requestedCheckOutAt: `${today}T08:30:00+07:00`,
                reason: 'Test'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('after');
    });

    it('should reject cross-day timestamps', async () => {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckInAt: `${today}T08:30:00+07:00`,
                requestedCheckOutAt: `${tomorrow}T02:00:00+07:00`,
                reason: 'Test'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('same date');
    });

    it('should reject checkOut-only when checkOut <= existing checkIn', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckOutAt: `${today}T08:00:00+07:00`, // Before existing 09:00 checkIn
                reason: 'Test'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('after existing');
    });

    it('should accept checkOut-only when checkOut > existing checkIn', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckOutAt: `${today}T17:30:00+07:00`, // After existing 09:00 checkIn
                reason: 'Forgot to checkout'
            });

        expect(res.status).toBe(201);
    });

    it('should require reason', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                requestedCheckInAt: `${today}T08:30:00+07:00`
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Reason');
    });

    it('should require at least one time field', async () => {
        const res = await request(app)
            .post('/api/requests')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                date: today,
                reason: 'Test'
            });

        expect(res.status).toBe(400);
    });
});

describe('GET /api/requests/me', () => {
    it('should return user requests', async () => {
        const res = await request(app)
            .get('/api/requests/me')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(Array.isArray(res.body.items)).toBe(true);
    });
});

describe('GET /api/requests/pending', () => {
    it('should return 403 for Employee', async () => {
        const res = await request(app)
            .get('/api/requests/pending')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });

    it('should return pending requests for Manager', async () => {
        const res = await request(app)
            .get('/api/requests/pending')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
    });

    it('should return pending requests for Admin', async () => {
        const res = await request(app)
            .get('/api/requests/pending')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
    });
});

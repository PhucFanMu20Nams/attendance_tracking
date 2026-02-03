/**
 * Cross-Midnight Performance Test Data Seeder
 * 
 * Creates attendance records for cross-midnight checkout testing:
 * - 100 employees with check-in yesterday 22:00 (NOT checked out)
 * - Simulates night shift ending at midnight
 * 
 * Prerequisites: Users must be seeded first (run seed-data.js)
 * Run: node performance/seed/cross-midnight-seed.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Models
const userSchema = new mongoose.Schema({
    employeeCode: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'MANAGER', 'EMPLOYEE'], default: 'EMPLOYEE' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

const attendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
}, { timestamps: true });

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

async function seedCrossMidnightData() {
    try {
        const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_dev';

        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected!\n');

        // Calculate dates (Asia/Ho_Chi_Minh timezone)
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
        const checkInTime = new Date(`${yesterdayStr}T22:00:00+07:00`); // Yesterday 22:00 GMT+7

        console.log('📅 Test data parameters:');
        console.log(`   Yesterday: ${yesterdayStr}`);
        console.log(`   Check-in time: ${checkInTime.toISOString()}`);
        console.log('');

        // Clean up existing cross-midnight test data
        console.log('🧹 Cleaning up existing test data...');
        const deletedCount = await Attendance.deleteMany({
            date: yesterdayStr,
            checkInAt: checkInTime,
        });
        console.log(`   Deleted ${deletedCount.deletedCount} existing records\n`);

        // Find 100 employees
        console.log('🔍 Finding test users...');
        const employees = await User.find({
            email: { $regex: /^employee\d+@test\.com$/ },
            role: 'EMPLOYEE',
            isActive: true,
        }).limit(100);

        if (employees.length < 100) {
            console.warn(`⚠️  Warning: Only found ${employees.length} employees (expected 100)`);
            console.log('   Run "node performance/seed/seed-data.js" first to create users\n');
        }

        // Create attendance records (checked in, NOT checked out)
        console.log(`📝 Creating ${employees.length} cross-midnight attendance records...\n`);
        
        const attendanceRecords = [];
        for (const employee of employees) {
            attendanceRecords.push({
                userId: employee._id,
                date: yesterdayStr,
                checkInAt: checkInTime,
                checkOutAt: null, // NOT checked out yet
            });
        }

        const inserted = await Attendance.insertMany(attendanceRecords, { ordered: false });
        console.log(`✅ Created ${inserted.length} attendance records\n`);

        // Verification
        console.log('🔍 Verification:');
        const verifyCount = await Attendance.countDocuments({
            date: yesterdayStr,
            checkInAt: checkInTime,
            checkOutAt: null,
        });
        console.log(`   Records with check-in only: ${verifyCount}`);
        console.log(`   Status: ${verifyCount === employees.length ? '✅ PASS' : '❌ FAIL'}\n`);

        console.log('✨ Cross-midnight seed data created successfully!\n');
        console.log('📋 Next steps:');
        console.log('   1. Start server: npm run dev');
        console.log('   2. Run k6 tests: k6 run performance/k6/cross-midnight-rush.js');
        console.log('   3. Cleanup: node performance/seed/cleanup-cross-midnight.js\n');

    } catch (error) {
        console.error('❌ Error seeding cross-midnight data:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

seedCrossMidnightData();

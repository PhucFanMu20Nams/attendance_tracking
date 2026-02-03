/**
 * Cross-Midnight Test Data Cleanup Script
 * 
 * Deletes all attendance records created by cross-midnight load tests
 * Run: node performance/seed/cleanup-cross-midnight.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const attendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
}, { timestamps: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

async function cleanup() {
    try {
        const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_dev';

        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected!\n');

        // Calculate dates
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        console.log('🧹 Cleaning up cross-midnight test data...');
        console.log(`   Yesterday: ${yesterdayStr}`);
        console.log(`   Today: ${todayStr}\n`);

        // Delete yesterday's records (check-in at 22:00)
        const yesterdayResult = await Attendance.deleteMany({
            date: yesterdayStr,
            checkInAt: { $gte: new Date(`${yesterdayStr}T22:00:00+07:00`) },
        });
        console.log(`   Deleted ${yesterdayResult.deletedCount} records from ${yesterdayStr}`);

        // Delete today's records (cross-midnight checkout)
        const todayResult = await Attendance.deleteMany({
            date: todayStr,
            checkInAt: { $lt: new Date(`${todayStr}T08:00:00+07:00`) }, // Before 08:00 = likely cross-midnight
        });
        console.log(`   Deleted ${todayResult.deletedCount} records from ${todayStr}`);

        const totalDeleted = yesterdayResult.deletedCount + todayResult.deletedCount;
        console.log(`\n✅ Cleanup completed! Total deleted: ${totalDeleted} records\n`);

    } catch (error) {
        console.error('❌ Error cleaning up data:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

cleanup();

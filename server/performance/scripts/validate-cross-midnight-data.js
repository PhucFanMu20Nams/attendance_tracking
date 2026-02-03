/**
 * Cross-Midnight Data Validation Script
 * 
 * Validates database integrity after k6 load tests
 * Run: node performance/scripts/validate-cross-midnight-data.js
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

async function validateData() {
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

        console.log('📋 Cross-Midnight Data Validation Report');
        console.log('========================================\n');
        console.log(`📅 Date range: ${yesterdayStr} - ${todayStr}\n`);

        // Test 1: Check for duplicate records
        console.log('🔍 Test 1: Checking for duplicate records...');
        const duplicates = await Attendance.aggregate([
            { $match: { date: { $in: [yesterdayStr, todayStr] } } },
            { $group: {
                _id: { userId: '$userId', date: '$date' },
                count: { $sum: 1 }
            }},
            { $match: { count: { $gt: 1 } } }
        ]);

        if (duplicates.length === 0) {
            console.log('✅ PASS: No duplicate records found\n');
        } else {
            console.error(`❌ FAIL: Found ${duplicates.length} duplicate records:`);
            duplicates.forEach(dup => {
                console.error(`   - User: ${dup._id.userId}, Date: ${dup._id.date}, Count: ${dup.count}`);
            });
            console.log('');
        }

        // Test 2: Check for invalid time order (checkOut <= checkIn)
        console.log('🔍 Test 2: Checking time order consistency...');
        const invalidTimeOrder = await Attendance.find({
            date: { $in: [yesterdayStr, todayStr] },
            checkOutAt: { $ne: null },
            $expr: { $lte: ['$checkOutAt', '$checkInAt'] }
        });

        if (invalidTimeOrder.length === 0) {
            console.log('✅ PASS: All records have valid time order\n');
        } else {
            console.error(`❌ FAIL: Found ${invalidTimeOrder.length} records with invalid time order:`);
            invalidTimeOrder.forEach(record => {
                console.error(`   - Date: ${record.date}, CheckIn: ${record.checkInAt}, CheckOut: ${record.checkOutAt}`);
            });
            console.log('');
        }

        // Test 3: Check for negative OT minutes
        console.log('🔍 Test 3: Checking OT calculations...');
        const negativeOT = await Attendance.find({
            date: { $in: [yesterdayStr, todayStr] },
            checkOutAt: { $ne: null },
            otMinutes: { $lt: 0 }
        });

        if (negativeOT.length === 0) {
            console.log('✅ PASS: All OT calculations are valid\n');
        } else {
            console.error(`❌ FAIL: Found ${negativeOT.length} records with negative OT:`);
            negativeOT.forEach(record => {
                console.error(`   - Date: ${record.date}, OT: ${record.otMinutes} minutes`);
            });
            console.log('');
        }

        // Test 4: Check cross-midnight records (checkOut date != checkIn date)
        console.log('🔍 Test 4: Analyzing cross-midnight records...');
        const crossMidnightRecords = await Attendance.find({
            date: yesterdayStr,
            checkOutAt: { $ne: null }
        });

        let crossMidnightCount = 0;
        let sameDayCount = 0;
        const crossMidnightErrors = [];

        for (const record of crossMidnightRecords) {
            const checkInDate = new Date(record.checkInAt).toISOString().split('T')[0];
            const checkOutDate = new Date(record.checkOutAt).toISOString().split('T')[0];

            if (checkInDate !== checkOutDate) {
                crossMidnightCount++;
                
                // Verify checkOut is next day
                const expectedNextDay = new Date(record.checkInAt);
                expectedNextDay.setDate(expectedNextDay.getDate() + 1);
                const expectedDateStr = expectedNextDay.toISOString().split('T')[0];

                if (checkOutDate !== expectedDateStr) {
                    crossMidnightErrors.push({
                        date: record.date,
                        checkInDate,
                        checkOutDate,
                        expected: expectedDateStr
                    });
                }
            } else {
                sameDayCount++;
            }
        }

        console.log(`   Cross-midnight checkouts: ${crossMidnightCount}`);
        console.log(`   Same-day checkouts: ${sameDayCount}`);

        if (crossMidnightErrors.length === 0) {
            console.log('✅ PASS: All cross-midnight dates are correct\n');
        } else {
            console.error(`❌ FAIL: Found ${crossMidnightErrors.length} date mismatches:`);
            crossMidnightErrors.forEach(err => {
                console.error(`   - Date: ${err.date}, CheckIn: ${err.checkInDate}, CheckOut: ${err.checkOutDate}, Expected: ${err.expected}`);
            });
            console.log('');
        }

        // Test 5: Summary statistics
        console.log('📊 Summary Statistics:');
        const totalYesterday = await Attendance.countDocuments({ date: yesterdayStr });
        const totalToday = await Attendance.countDocuments({ date: todayStr });
        const completedYesterday = await Attendance.countDocuments({ date: yesterdayStr, checkOutAt: { $ne: null } });
        const completedToday = await Attendance.countDocuments({ date: todayStr, checkOutAt: { $ne: null } });

        console.log(`   ${yesterdayStr}: ${totalYesterday} records (${completedYesterday} completed)`);
        console.log(`   ${todayStr}: ${totalToday} records (${completedToday} completed)`);
        console.log('');

        // Final verdict
        const allTestsPassed = (
            duplicates.length === 0 &&
            invalidTimeOrder.length === 0 &&
            negativeOT.length === 0 &&
            crossMidnightErrors.length === 0
        );

        console.log('========================================');
        if (allTestsPassed) {
            console.log('🎉 ✅ ALL VALIDATION TESTS PASSED!');
        } else {
            console.log('❌ VALIDATION FAILED - Fix issues above');
        }
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Error validating data:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

validateData();

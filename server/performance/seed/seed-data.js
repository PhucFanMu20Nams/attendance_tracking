/**
 * Performance Test Data Seeder
 * 
 * Creates test users for k6 performance tests:
 * - 100 employees (employee1@test.com ... employee100@test.com)
 * - 5 managers (manager1@test.com ... manager5@test.com)
 * - 1 admin (admin@test.com)
 * 
 * Run: node performance/seed/seed-data.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// User schema (simplified)
const userSchema = new mongoose.Schema({
    employeeCode: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'MANAGER', 'EMPLOYEE'], default: 'EMPLOYEE' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);

async function seedData() {
    try {
        const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_dev';

        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected!');

        // Create teams
        console.log('Creating teams...');
        const teams = [];
        for (let i = 1; i <= 5; i++) {
            let team = await Team.findOne({ name: `Performance Team ${i}` });
            if (!team) {
                team = await Team.create({ name: `Performance Team ${i}` });
            }
            teams.push(team);
        }
        console.log(`Created/Found ${teams.length} teams`);

        // Hash password once
        const passwordHash = await bcrypt.hash('Password123', 10);

        // Create Admin
        console.log('Creating admin...');
        const adminExists = await User.findOne({ email: 'admin@test.com' });
        if (!adminExists) {
            await User.create({
                employeeCode: 'PERF_ADMIN',
                email: 'admin@test.com',
                name: 'Performance Admin',
                passwordHash,
                role: 'ADMIN',
                isActive: true,
            });
            console.log('Admin created');
        } else {
            console.log('Admin already exists');
        }

        // Create Managers (5)
        console.log('Creating managers...');
        for (let i = 1; i <= 5; i++) {
            const email = `manager${i}@test.com`;
            const exists = await User.findOne({ email });
            if (!exists) {
                await User.create({
                    employeeCode: `PERF_MGR_${i}`,
                    email,
                    name: `Performance Manager ${i}`,
                    passwordHash,
                    role: 'MANAGER',
                    teamId: teams[(i - 1) % teams.length]._id,
                    isActive: true,
                });
            }
        }
        console.log('5 Managers created/verified');

        // Create Employees (100)
        console.log('Creating 100 employees...');
        const batchSize = 20;
        for (let batch = 0; batch < 5; batch++) {
            const operations = [];
            for (let i = 1; i <= batchSize; i++) {
                const num = batch * batchSize + i;
                const email = `employee${num}@test.com`;

                operations.push({
                    updateOne: {
                        filter: { email },
                        update: {
                            $setOnInsert: {
                                employeeCode: `PERF_EMP_${num}`,
                                email,
                                name: `Performance Employee ${num}`,
                                passwordHash,
                                role: 'EMPLOYEE',
                                teamId: teams[(num - 1) % teams.length]._id,
                                isActive: true,
                            }
                        },
                        upsert: true,
                    }
                });
            }
            await User.bulkWrite(operations);
            console.log(`  Batch ${batch + 1}/5 complete (${(batch + 1) * batchSize} employees)`);
        }

        // Create more employees for stress test (200 total)
        console.log('Creating 100 more employees for stress test...');
        for (let batch = 0; batch < 5; batch++) {
            const operations = [];
            for (let i = 1; i <= batchSize; i++) {
                const num = 100 + batch * batchSize + i;
                const email = `employee${num}@test.com`;

                operations.push({
                    updateOne: {
                        filter: { email },
                        update: {
                            $setOnInsert: {
                                employeeCode: `PERF_EMP_${num}`,
                                email,
                                name: `Performance Employee ${num}`,
                                passwordHash,
                                role: 'EMPLOYEE',
                                teamId: teams[(num - 1) % teams.length]._id,
                                isActive: true,
                            }
                        },
                        upsert: true,
                    }
                });
            }
            await User.bulkWrite(operations);
            console.log(`  Batch ${batch + 1}/5 complete (${100 + (batch + 1) * batchSize} employees)`);
        }

        // Summary
        const totalUsers = await User.countDocuments({});
        const totalTeams = await Team.countDocuments({});

        console.log('\n========== SEED COMPLETE ==========');
        console.log(`Total Users: ${totalUsers}`);
        console.log(`Total Teams: ${totalTeams}`);
        console.log('\nTest Accounts:');
        console.log('  Admin: admin@test.com / Password123');
        console.log('  Managers: manager1@test.com ... manager5@test.com / Password123');
        console.log('  Employees: employee1@test.com ... employee200@test.com / Password123');
        console.log('====================================\n');

    } catch (error) {
        console.error('Seed error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

seedData();

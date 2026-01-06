import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Team from '../models/Team.js';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Password123';

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    await User.deleteMany({});
    await Team.deleteMany({});
    console.log('  Cleared existing users and teams');

    const team = await Team.create({ name: 'Engineering' });
    console.log(` Created team: ${team.name} (ID: ${team._id})`);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    const usersData = [
      {
        employeeCode: 'NV001',
        name: 'Admin User',
        email: 'admin@company.com',
        username: 'admin',
        passwordHash,
        role: 'ADMIN',
        isActive: true
      },
      {
        employeeCode: 'NV002',
        name: 'Manager User',
        email: 'manager@company.com',
        username: 'manager',
        passwordHash,
        role: 'MANAGER',
        teamId: team._id,
        isActive: true
      },
      {
        employeeCode: 'NV003',
        name: 'Employee User',
        email: 'employee@company.com',
        username: 'employee',
        passwordHash,
        role: 'EMPLOYEE',
        teamId: team._id,
        isActive: true
      }
    ];

    const users = await User.insertMany(usersData);
    console.log(' Created users:');
    users.forEach((user) => {
      console.log(`   - ${user.name} (${user.role}) - email: ${user.email}`);
    });

    console.log('\n========================================');
    console.log(' Seed completed successfully!');
    console.log('========================================');
    console.log('Login credentials (for all users):');
    console.log(`   Password: ${DEFAULT_PASSWORD}`);
    console.log('----------------------------------------');
    console.log('Admin:    admin@company.com    | admin');
    console.log('Manager:  manager@company.com  | manager');
    console.log('Employee: employee@company.com | employee');
    console.log('========================================\n');

    await mongoose.disconnect();
    console.log(' MongoDB Disconnected');
    process.exit(0);
  } catch (error) {
    console.error(' Seed failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedData();

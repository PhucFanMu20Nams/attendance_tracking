/**
 * Rollback: Normalize OT Request Date Fields (P1-1)
 * 
 * Purpose: Remove checkInDate field for OT_REQUEST if migration needs rollback
 * WARNING: Only use if migration causes issues
 * 
 * Run: node scripts/rollback-normalize-ot-date.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Request from '../src/models/Request.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_dev';

async function rollback() {
  console.log('⚠️  ROLLBACK: Removing checkInDate from OT_REQUEST\n');
  console.log('⏳ Waiting 5 seconds... Press Ctrl+C to cancel\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count records to rollback
    const count = await Request.countDocuments({
      type: 'OT_REQUEST',
      checkInDate: { $exists: true }
    });

    console.log(`📊 Found ${count} records to rollback\n`);

    // Perform rollback
    const result = await Request.updateMany(
      { 
        type: 'OT_REQUEST',
        checkInDate: { $exists: true }
      },
      {
        $unset: { checkInDate: '' }
      }
    );

    console.log(`✅ Rollback complete!`);
    console.log(`   - Matched: ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}\n`);

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
  }
}

rollback();

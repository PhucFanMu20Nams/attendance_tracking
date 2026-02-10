/**
 * Migration: Normalize OT Request Date Fields (P1-1)
 * 
 * Purpose: Backfill checkInDate field for legacy OT_REQUEST records
 * that only have date field.
 * 
 * Run: node scripts/migrate-normalize-ot-date.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Request from '../src/models/Request.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_dev';

async function migrate() {
  console.log('🚀 Starting OT Date Normalization Migration...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // STEP 1: Find records needing migration
    const needsMigration = await Request.find({
      type: 'OT_REQUEST',
      checkInDate: { $exists: false }
    }).select('_id date type').lean();

    console.log(`📊 Found ${needsMigration.length} records to migrate\n`);

    if (needsMigration.length === 0) {
      console.log('✅ No records need migration. Exiting...\n');
      return;
    }

    // Show sample before migration
    console.log('📋 Sample record BEFORE migration:');
    console.log(JSON.stringify(needsMigration[0], null, 2), '\n');

    // STEP 2: Perform migration (use aggregation pipeline for safety)
    const result = await Request.updateMany(
      { 
        type: 'OT_REQUEST',
        checkInDate: { $exists: false }
      },
      [
        {
          $set: { 
            checkInDate: '$date'  // Copy date → checkInDate
          }
        }
      ]
    );

    console.log(`✅ Migration complete!`);
    console.log(`   - Matched: ${result.matchedCount}`);
    console.log(`   - Modified: ${result.modifiedCount}\n`);

    // STEP 3: Verify migration
    const stillMissing = await Request.countDocuments({
      type: 'OT_REQUEST',
      checkInDate: { $exists: false }
    });

    if (stillMissing > 0) {
      console.error(`⚠️  WARNING: ${stillMissing} records still missing checkInDate!`);
      console.error('   Please investigate manually.\n');
      process.exit(1);
    }

    // Show sample after migration
    const sampleAfter = await Request.findById(needsMigration[0]._id)
      .select('_id date checkInDate type')
      .lean();
    console.log('📋 Sample record AFTER migration:');
    console.log(JSON.stringify(sampleAfter, null, 2), '\n');

    console.log('✅ Migration verified successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
  }
}

// Run migration
migrate();

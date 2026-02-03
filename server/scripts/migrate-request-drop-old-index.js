import mongoose from 'mongoose';
import Request from '../src/models/Request.js';
import { config } from 'dotenv';

config();

/**
 * Migration Script: Drop old unique index + check for duplicates
 * 
 * Purpose: 
 * 1. Drop deprecated unique index: { userId, date, type } 
 * 2. Check for duplicate PENDING requests before new index builds
 * 3. Auto-populate checkInDate/checkOutDate for existing ADJUST_TIME requests
 * 
 * Usage:
 *   node scripts/migrate-request-drop-old-index.js
 *   node scripts/migrate-request-drop-old-index.js --dry-run
 * 
 * Safety: Use --dry-run to preview changes before applying
 */

const DRY_RUN = process.argv.includes('--dry-run');
const AUTO_FIX = process.argv.includes('--auto-fix');

async function migrateRequestIndexes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: List all indexes on requests collection
    console.log('📊 Step 1: Checking existing indexes...');
    const indexes = await Request.collection.indexes();
    console.log('Current indexes:');
    indexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(idx.key)} ${idx.unique ? '[UNIQUE]' : ''} ${idx.partialFilterExpression ? '[PARTIAL]' : ''}`);
    });
    console.log('');

    // Step 2: Check for old deprecated index
    const oldIndexName = indexes.find(idx => 
      idx.key.userId === 1 && 
      idx.key.date === 1 && 
      idx.key.type === 1 &&
      idx.unique === true &&
      !idx.key.checkInDate  // Ensure it's the OLD index, not new one
    );

    if (oldIndexName) {
      console.log(`🔍 Found old deprecated index: ${oldIndexName.name}`);
      console.log(`   Key: { userId: 1, date: 1, type: 1 }`);
      
      if (!DRY_RUN) {
        console.log('🗑️  Dropping old index...');
        await Request.collection.dropIndex(oldIndexName.name);
        console.log(`✅ Successfully dropped index: ${oldIndexName.name}\n`);
      } else {
        console.log(`🔍 [DRY RUN] Would drop index: ${oldIndexName.name}\n`);
      }
    } else {
      console.log('✅ Old index not found (already dropped or never existed)\n');
    }

    // Step 3: Check for duplicate PENDING ADJUST_TIME requests
    console.log('🔍 Step 3: Checking for duplicate PENDING requests...');
    const duplicates = await Request.aggregate([
      { 
        $match: { 
          type: 'ADJUST_TIME', 
          status: 'PENDING',
          $or: [
            { checkInDate: { $type: 'string' } },  // Check by checkInDate if exists
            { date: { $type: 'string' } }          // Fallback to date for old docs
          ]
        } 
      },
      { 
        $group: { 
          _id: { 
            userId: '$userId', 
            // Use checkInDate if available, otherwise date
            date: { $ifNull: ['$checkInDate', '$date'] },
            type: '$type' 
          }, 
          count: { $sum: 1 }, 
          ids: { $push: '$_id' },
          docs: { $push: '$$ROOT' }
        } 
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} groups with duplicate PENDING requests:`);
      duplicates.forEach((dup, i) => {
        console.log(`\n  Group ${i + 1}:`);
        console.log(`    User ID: ${dup._id.userId}`);
        console.log(`    Date: ${dup._id.date}`);
        console.log(`    Count: ${dup.count} duplicates`);
        console.log(`    Request IDs: ${dup.ids.join(', ')}`);
      });

      if (AUTO_FIX && !DRY_RUN) {
        console.log('\n🔧 AUTO-FIX mode: Keeping oldest request, rejecting others...');
        let fixed = 0;
        for (const dup of duplicates) {
          // Sort by createdAt, keep oldest
          const sorted = dup.docs.sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
          );
          const toReject = sorted.slice(1); // Reject all except first (oldest)
          
          for (const doc of toReject) {
            await Request.updateOne(
              { _id: doc._id },
              { 
                $set: { 
                  status: 'REJECTED',
                  reason: `${doc.reason} [Auto-rejected: duplicate PENDING request during migration]`
                }
              }
            );
            fixed++;
            console.log(`  ✅ Rejected duplicate: ${doc._id}`);
          }
        }
        console.log(`\n✅ Auto-fixed ${fixed} duplicate requests\n`);
      } else if (DRY_RUN) {
        console.log('\n🔍 [DRY RUN] Would auto-reject duplicates if --auto-fix flag is used');
        console.log('💡 Run with --auto-fix flag to automatically reject duplicates (keeps oldest)\n');
      } else {
        console.log('\n⚠️  WARNING: Duplicates found! New unique index may fail to build.');
        console.log('💡 Options:');
        console.log('   1. Run with --auto-fix to automatically reject duplicates (keeps oldest)');
        console.log('   2. Manually resolve duplicates in database');
        console.log('   3. Check application logic for race conditions\n');
        process.exit(1);
      }
    } else {
      console.log('✅ No duplicate PENDING requests found\n');
    }

    // Step 4: Populate checkInDate/checkOutDate for existing ADJUST_TIME docs
    console.log('🔍 Step 4: Checking ADJUST_TIME requests without checkInDate/checkOutDate...');
    const needsPopulation = await Request.find({
      type: 'ADJUST_TIME',
      $or: [
        { checkInDate: null },
        { checkInDate: { $exists: false } },
        { checkOutDate: null },
        { checkOutDate: { $exists: false } }
      ]
    }).select('_id date checkInDate checkOutDate').lean();

    console.log(`📊 Found ${needsPopulation.length} requests needing checkInDate/checkOutDate`);

    if (needsPopulation.length > 0 && !DRY_RUN) {
      console.log('🔧 Populating checkInDate/checkOutDate from date field...');
      let populated = 0;
      for (const doc of needsPopulation) {
        const updates = {};
        if (!doc.checkInDate && doc.date) {
          updates.checkInDate = doc.date;
        }
        if (!doc.checkOutDate && doc.date) {
          updates.checkOutDate = doc.date;
        }
        
        if (Object.keys(updates).length > 0) {
          await Request.updateOne({ _id: doc._id }, { $set: updates });
          populated++;
        }
      }
      console.log(`✅ Populated ${populated} requests\n`);
    } else if (DRY_RUN && needsPopulation.length > 0) {
      console.log(`🔍 [DRY RUN] Would populate ${needsPopulation.length} requests\n`);
    } else {
      console.log('✅ All ADJUST_TIME requests already have checkInDate/checkOutDate\n');
    }

    // Step 5: Verify new index exists
    console.log('🔍 Step 5: Verifying new unique index exists...');
    const newIndexes = await Request.collection.indexes();
    const newIndex = newIndexes.find(idx => 
      idx.key.userId === 1 && 
      idx.key.checkInDate === 1 && 
      idx.key.type === 1 &&
      idx.unique === true
    );

    if (newIndex) {
      console.log(`✅ New unique index found: ${newIndex.name}`);
      console.log(`   Key: { userId: 1, checkInDate: 1, type: 1 }`);
      console.log(`   Partial filter: ${JSON.stringify(newIndex.partialFilterExpression)}\n`);
    } else {
      console.log('⚠️  New unique index not found yet');
      console.log('💡 It will be created automatically when server starts\n');
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📈 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes were made');
      console.log('💡 Run without --dry-run to apply changes\n');
    } else {
      console.log('✅ Migration completed successfully!\n');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
console.log('🚀 Starting Request Index Migration...\n');
if (DRY_RUN) {
  console.log('🔍 Running in DRY RUN mode (no changes will be made)\n');
}
if (AUTO_FIX) {
  console.log('🔧 AUTO-FIX mode enabled (will auto-reject duplicate requests)\n');
}
migrateRequestIndexes();

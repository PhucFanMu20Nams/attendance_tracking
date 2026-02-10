/**
 * Migration Script: Request Model Index Rebuild (v2.6)
 * 
 * Purpose: Remove $type: 'string' filters from partial indexes
 * 
 * Changes:
 * - ADJUST_TIME unique index: Remove checkInDate $type filter
 * - Cross-midnight indexes: Remove checkInDate/checkOutDate $type filters
 * - OT_REQUEST unique index: Remove date $type filter
 * 
 * Why: MongoDB naturally excludes null values from indexes, $type check is redundant
 * and adds unnecessary overhead. Field invariants in model ensure data integrity.
 * 
 * Safety: Backward compatible - no data changes, only index definition updates
 * 
 * Usage:
 *   node server/scripts/migrate-request-indexes-v2.6.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function migrate() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_db';
    console.log(`Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('requests');

    // Get current indexes
    console.log('\n📋 Current indexes:');
    const existingIndexes = await collection.indexes();
    existingIndexes.forEach(idx => {
      console.log(`  - ${idx.name}`);
      if (idx.partialFilterExpression) {
        console.log(`    Partial: ${JSON.stringify(idx.partialFilterExpression)}`);
      }
    });

    // Drop old indexes with $type filters
    console.log('\n🗑️  Dropping old indexes with $type filters...');
    
    const indexesToDrop = [
      'userId_1_checkInDate_1_type_1',
      'userId_1_checkInDate_1_status_1',
      'userId_1_checkOutDate_1_status_1',
      'userId_1_date_1_type_1',
      'status_1'  // Also remove unused status-only index
    ];

    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`  ✓ Dropped: ${indexName}`);
      } catch (err) {
        if (err.code === 27 || err.codeName === 'IndexNotFound') {
          console.log(`  ⊘ Not found: ${indexName} (skipping)`);
        } else {
          throw err;
        }
      }
    }

    // Note: New indexes will be created automatically when model is loaded
    console.log('\n✓ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Restart your application');
    console.log('  2. New indexes will be created automatically from model definition');
    console.log('  3. Verify with: db.requests.getIndexes()');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });

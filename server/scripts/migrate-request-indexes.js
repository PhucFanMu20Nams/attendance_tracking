import mongoose from 'mongoose';
import Request from '../src/models/Request.js';

/**
 * Migration script: Update Request model indexes
 * 
 * CRITICAL: Run this BEFORE deploying new code with LEAVE feature
 * 
 * Changes:
 * - Drop old unique index: { userId: 1, date: 1, type: 1 } with filter { status: 'PENDING' }
 * - Create new unique index: { userId: 1, date: 1, type: 1 } with filter { status: 'PENDING', type: 'ADJUST_TIME' }
 * - Create new performance index: { userId: 1, type: 1, status: 1 }
 * 
 * Why: Old index causes duplicate key errors for LEAVE requests (date: null)
 */

async function migrateRequestIndexes() {
    try {
        console.log('🔄 Starting Request index migration...\n');

        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB:', MONGODB_URI);

        // Get existing indexes
        const existingIndexes = await Request.collection.getIndexes();
        console.log('\n📋 Current indexes:');
        Object.keys(existingIndexes).forEach(name => {
            console.log(`  - ${name}`);
        });

        // Drop old unique index if it exists
        const oldIndexName = 'userId_1_date_1_type_1';
        if (existingIndexes[oldIndexName]) {
            console.log(`\n🗑️  Dropping old index: ${oldIndexName}`);
            await Request.collection.dropIndex(oldIndexName);
            console.log('✓ Old index dropped successfully');
        } else {
            console.log(`\n⚠️  Old index "${oldIndexName}" not found (may have been already dropped or never created)`);
        }

        // Sync all indexes from schema (Mongoose will create new ones)
        console.log('\n🔨 Syncing indexes from schema...');
        await Request.syncIndexes();
        console.log('✓ Indexes synced successfully');

        // Verify new indexes
        const newIndexes = await Request.collection.getIndexes();
        console.log('\n✅ Updated indexes:');
        Object.keys(newIndexes).forEach(name => {
            const index = newIndexes[name];
            console.log(`  - ${name}`);
            if (index.partialFilterExpression) {
                console.log(`    Filter: ${JSON.stringify(index.partialFilterExpression)}`);
            }
        });

        console.log('\n✅ Migration completed successfully!\n');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        console.error(err);
        process.exit(1);
    }
}

// Run migration
migrateRequestIndexes();

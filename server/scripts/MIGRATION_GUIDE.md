# Request Index Migration Guide

## Overview

This migration is **REQUIRED** before deploying the LEAVE feature (C1) to production.

**Why?** The unique index definition changed to prevent LEAVE requests (with `date: null`) from causing duplicate key errors.

---

## Changes

### Old Index (Before LEAVE feature)
```javascript
{ userId: 1, date: 1, type: 1 }
partialFilterExpression: { status: 'PENDING' }
```

### New Indexes (After LEAVE feature)
```javascript
// 1. Updated unique index (ADJUST_TIME only)
{ userId: 1, date: 1, type: 1 }
partialFilterExpression: { status: 'PENDING', type: 'ADJUST_TIME' }

// 2. New performance index (LEAVE queries)
{ userId: 1, type: 1, status: 1 }
```

---

## Migration Steps

### Development/Staging

```bash
cd server
node scripts/migrate-request-indexes.js
```

**Expected output:**
```
🔄 Starting Request index migration...
✓ Connected to MongoDB: mongodb://localhost:27017/attendance
📋 Current indexes:
  - _id_
  - userId_1_status_1
  - status_1
  - userId_1_date_1_type_1

🗑️  Dropping old index: userId_1_date_1_type_1
✓ Old index dropped successfully

🔨 Syncing indexes from schema...
✓ Indexes synced successfully

✅ Updated indexes:
  - _id_
  - userId_1_status_1
  - status_1
  - userId_1_date_1_type_1
    Filter: {"status":"PENDING","type":"ADJUST_TIME"}
  - userId_1_type_1_status_1

✅ Migration completed successfully!
```

---

### Production

**CRITICAL: Run migration BEFORE deploying new code**

```bash
# 1. SSH to production server
ssh production-server

# 2. Navigate to server directory
cd /path/to/attendance-system/server

# 3. Set environment variable
export MONGODB_URI="mongodb://production-host:27017/attendance"

# 4. Run migration
node scripts/migrate-request-indexes.js

# 5. Verify success (should see ✅ Migration completed)

# 6. Deploy new code
# ... your deployment process ...
```

---

## Rollback (If Needed)

If you need to rollback to the old code:

```bash
# Drop new indexes
mongo attendance --eval "db.requests.dropIndex('userId_1_date_1_type_1')"
mongo attendance --eval "db.requests.dropIndex('userId_1_type_1_status_1')"

# Recreate old index
mongo attendance --eval "db.requests.createIndex(
  { userId: 1, date: 1, type: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
)"
```

---

## Verification

After migration, verify indexes:

```bash
mongo attendance --eval "db.requests.getIndexes()"
```

Expected indexes:
- `_id_` (default)
- `userId_1_status_1`
- `status_1`
- `userId_1_date_1_type_1` with filter `{ status: 'PENDING', type: 'ADJUST_TIME' }`
- `userId_1_type_1_status_1` (new)

---

## Troubleshooting

### Error: "Index not found"
**Cause**: Old index doesn't exist (already dropped or never created)  
**Action**: Safe to ignore, proceed with deployment

### Error: "Duplicate key error"
**Cause**: Migration not run before deploying new code  
**Action**: Run migration script immediately

### Error: "Connection refused"
**Cause**: MongoDB not accessible  
**Action**: Check `MONGODB_URI` and network connectivity

---

## Impact

- **Downtime**: ~1-2 seconds (index drop + create)
- **Data loss**: None
- **Affected operations**: Request creation (brief lock during index rebuild)

---

## Notes

- Migration is **idempotent** - safe to run multiple times
- Script uses `Request.syncIndexes()` which automatically handles index creation
- Old data is **not modified** - only indexes change

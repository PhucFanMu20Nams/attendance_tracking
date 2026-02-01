import mongoose from 'mongoose';

// Define audit log types as constants (source of truth)
const AUDIT_LOG_TYPES = ['MULTIPLE_ACTIVE_SESSIONS', 'STALE_OPEN_SESSION'];

/**
 * AuditLog Model
 * Tracks audit events for attendance anomalies
 * 
 * Expected details structure by type (enforced by pre-save hook):
 * 
 * MULTIPLE_ACTIVE_SESSIONS:
 *   { 
 *     sessionCount: Number (>= 2), 
 *     sessions: [{ _id|id: ObjectId|string, date: string (YYYY-MM-DD), checkInAt: Date|string }]
 *   }
 * 
 * STALE_OPEN_SESSION:
 *   { 
 *     sessionDate: string (YYYY-MM-DD), 
 *     checkInAt: Date|string (ISO parseable), 
 *     detectedAt: 'checkIn' | 'checkOut' 
 *   }
 */
const auditLogSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            enum: AUDIT_LOG_TYPES
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            required: true  // Enforced as required by pre-save hook
        }
    },
    {
        timestamps: true // Auto-generate createdAt, updatedAt (consistent with other models)
    }
);

// Compound index for common query pattern: get audit logs by user, sorted by time
auditLogSchema.index({ userId: 1, createdAt: -1 });

// TTL index: Auto-delete logs older than 90 days to prevent DB bloat
// Business can adjust retention policy via this value
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

/**
 * Pre-save validation hook: Validate details structure based on type
 * Prevents saving invalid/incomplete audit log data
 * 
 * Note: Only runs on create()/save(), not on updateOne/findOneAndUpdate
 * AuditLog should only use create() pattern (write-once, no updates)
 */
auditLogSchema.pre('save', async function () {
    const doc = this;

    // Validate details exists
    if (!doc.details || typeof doc.details !== 'object') {
        throw new Error('AuditLog.details is required and must be an object');
    }

    // Date regex for YYYY-MM-DD validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Validate based on type
    switch (doc.type) {
        case 'MULTIPLE_ACTIVE_SESSIONS':
            if (typeof doc.details.sessionCount !== 'number' || doc.details.sessionCount < 2) {
                throw new Error('MULTIPLE_ACTIVE_SESSIONS requires details.sessionCount (number >= 2)');
            }
            if (!Array.isArray(doc.details.sessions) || doc.details.sessions.length === 0) {
                throw new Error('MULTIPLE_ACTIVE_SESSIONS requires details.sessions (non-empty array)');
            }
            // Validate sessions array structure and prevent bloat
            if (doc.details.sessions.length > 100) {
                throw new Error('MULTIPLE_ACTIVE_SESSIONS details.sessions exceeds max length (100)');
            }
            for (const session of doc.details.sessions) {
                // Flexible: accept both _id and id (handles different serialization)
                if (!session._id && !session.id) {
                    throw new Error('MULTIPLE_ACTIVE_SESSIONS sessions must have _id or id');
                }
                // Validate date format (YYYY-MM-DD)
                if (!session.date || !dateRegex.test(session.date)) {
                    throw new Error('MULTIPLE_ACTIVE_SESSIONS sessions must have date (YYYY-MM-DD format)');
                }
                // Validate checkInAt exists (Date object or parseable string)
                if (!session.checkInAt) {
                    throw new Error('MULTIPLE_ACTIVE_SESSIONS sessions must have checkInAt');
                }
                // Try to parse if string, validate if Date
                const checkInDate = session.checkInAt instanceof Date
                    ? session.checkInAt
                    : new Date(session.checkInAt);
                if (isNaN(checkInDate.getTime())) {
                    throw new Error('MULTIPLE_ACTIVE_SESSIONS sessions checkInAt must be valid Date or ISO string');
                }
                // Normalize to Date object for consistent storage (like STALE_OPEN_SESSION)
                session.checkInAt = checkInDate;
            }
            break;

        case 'STALE_OPEN_SESSION':
            // Validate sessionDate format (YYYY-MM-DD)
            if (!doc.details.sessionDate || !dateRegex.test(doc.details.sessionDate)) {
                throw new Error('STALE_OPEN_SESSION requires details.sessionDate (YYYY-MM-DD format)');
            }

            // Flexible Date validation: accept Date object or parseable string
            if (!doc.details.checkInAt) {
                throw new Error('STALE_OPEN_SESSION requires details.checkInAt');
            }
            const checkInDate = doc.details.checkInAt instanceof Date
                ? doc.details.checkInAt
                : new Date(doc.details.checkInAt);
            if (isNaN(checkInDate.getTime())) {
                throw new Error('STALE_OPEN_SESSION requires details.checkInAt (valid Date or ISO string)');
            }
            // Normalize to Date object for consistent storage
            doc.details.checkInAt = checkInDate;

            if (!['checkIn', 'checkOut'].includes(doc.details.detectedAt)) {
                throw new Error('STALE_OPEN_SESSION requires details.detectedAt ("checkIn" or "checkOut")');
            }
            break;

        default:
            throw new Error(`Unknown audit log type: ${doc.type}`);
    }
});

/**
 * Timezone Note:
 * - All Date fields (checkInAt, createdAt, updatedAt) are stored as UTC timestamps
 * - Display layer (client/reports) must convert to Asia/Ho_Chi_Minh (GMT+7)
 * - dateUtils.js handles timezone conversion for date displays
 */

export { AUDIT_LOG_TYPES };
export default mongoose.model('AuditLog', auditLogSchema);

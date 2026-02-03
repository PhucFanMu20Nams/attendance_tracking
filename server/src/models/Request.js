import mongoose from 'mongoose';

const REQUEST_TYPES = ['ADJUST_TIME', 'LEAVE'];
const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const requestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    date: {
      type: String,
      required: function () { return this.type === 'ADJUST_TIME'; },
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
      // Backward compatibility: Auto-populated from checkInDate via pre-validate hook
      // Will be deprecated in favor of checkInDate/checkOutDate
    },
    checkInDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
      // Actual date of check-in (can differ from checkOutDate for cross-midnight)
    },
    checkOutDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
      // Actual date of check-out (can be > checkInDate for overnight shifts)
    },
    type: {
      type: String,
      enum: REQUEST_TYPES,
      required: true,
      default: 'ADJUST_TIME'
    },
    requestedCheckInAt: {
      type: Date,
      default: null
    },
    requestedCheckOutAt: {
      type: Date,
      default: null
    },
    leaveStartDate: {
      type: String,
      required: function () { return this.type === 'LEAVE'; },
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    leaveEndDate: {
      type: String,
      required: function () { return this.type === 'LEAVE'; },
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    leaveType: {
      type: String,
      enum: ['ANNUAL', 'SICK', 'UNPAID'],
      default: null
    },
    leaveDaysCount: {
      type: Number,
      default: null
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: 'PENDING'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// P0 Fix: Auto-sync date <-> checkInDate for backward compatibility + validate cross-midnight
// Ensures invariant: date === checkInDate for ADJUST_TIME (prevents approve/update bugs)
// Mongoose 9.x: Use async function instead of callback-based next()
requestSchema.pre('validate', async function() {
  if (this.type === 'ADJUST_TIME') {
    // Sync date <-> checkInDate (bidirectional for safety)
    if (this.checkInDate && !this.date) {
      this.date = this.checkInDate;
    }
    if (this.date && !this.checkInDate) {
      this.checkInDate = this.date;
    }

    // P0: Strict invariant enforcement to prevent data inconsistency
    // Without this, approve/updateAttendance will lookup wrong date
    if (this.date && this.checkInDate && this.date !== this.checkInDate) {
      this.invalidate('date', 'date must equal checkInDate for ADJUST_TIME (invariant violation)');
    }

    // Cross-midnight validation: checkOutDate >= checkInDate (string comparison OK for YYYY-MM-DD)
    if (this.checkInDate && this.checkOutDate && this.checkOutDate < this.checkInDate) {
      this.invalidate('checkOutDate', 'checkOutDate must be >= checkInDate for cross-midnight requests');
    }
  }
});

// Efficient querying for user's requests and status filtering
requestSchema.index({ userId: 1, status: 1 });
requestSchema.index({ status: 1 });

// P2 Fix: Unique index now uses checkInDate (primary key for cross-midnight)
// Prevents duplicate PENDING requests for same (userId, checkInDate, type)
// Guards against race conditions + ensures data integrity with new schema
requestSchema.index(
  { userId: 1, checkInDate: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { 
      status: 'PENDING', 
      type: 'ADJUST_TIME',
      checkInDate: { $type: 'string' }  // Only enforce when checkInDate exists
    }
  }
);

// Performance index for LEAVE overlap queries (check by userId, type, status)
requestSchema.index({ userId: 1, type: 1, status: 1 });

// P2 Fix: Cross-midnight indexes with userId prefix + partial filter
// Most queries are user-scoped (GET /requests/me, manager approval by team)
// Partial filter prevents index bloat from LEAVE docs (checkInDate/checkOutDate = null)
requestSchema.index(
  { userId: 1, checkInDate: 1, status: 1 },
  { partialFilterExpression: { type: 'ADJUST_TIME', checkInDate: { $type: 'string' } } }
);
requestSchema.index(
  { userId: 1, checkOutDate: 1, status: 1 },
  { partialFilterExpression: { type: 'ADJUST_TIME', checkOutDate: { $type: 'string' } } }
);

export { REQUEST_TYPES, REQUEST_STATUSES };
export default mongoose.model('Request', requestSchema);

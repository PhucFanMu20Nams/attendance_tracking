import mongoose from 'mongoose';

const REQUEST_TYPES = ['ADJUST_TIME'];
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
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
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

// Efficient querying for user's requests and status filtering
requestSchema.index({ userId: 1, status: 1 });
requestSchema.index({ status: 1 });

// Partial unique index: Prevent duplicate PENDING requests for same (userId, date, type)
// This guards against race conditions in createRequest
requestSchema.index(
  { userId: 1, date: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' }
  }
);

export { REQUEST_TYPES, REQUEST_STATUSES };
export default mongoose.model('Request', requestSchema);

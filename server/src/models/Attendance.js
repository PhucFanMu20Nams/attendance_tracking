import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
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
    // Record only created on actual check-in (ABSENT = no record)
    checkInAt: {
      type: Date,
      required: true
    },
    checkOutAt: {
      type: Date,
      default: null 
    },
    otApproved: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Unique compound index: one attendance record per user per day MOST IMPORTANT
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;

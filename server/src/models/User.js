import mongoose from 'mongoose';

const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

const userSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ROLES,
      required: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    startDate: {
      type: Date
    }
  },
  {
    timestamps: true // Auto-generate createdAt, updatedAt
  }
);

// Remove passwordHash in convert to JSON (API response)
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

// Export ROLES constant for use in other files (e.g., validation, seed)
export { ROLES };
export default mongoose.model('User', userSchema);

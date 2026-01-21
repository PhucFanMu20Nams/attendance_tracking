import mongoose from 'mongoose';

/**
 * Holiday Model
 * Per DATA_DICTIONARY.md#L40-L52
 * 
 * Fields:
 * - date: string "YYYY-MM-DD" (GMT+7) [required, unique]
 * - name: string [required, trim]
 * - timestamps: true (auto createdAt/updatedAt)
 */
const holidaySchema = new mongoose.Schema(
    {
        date: {
            type: String,
            required: [true, 'Date is required'],
            unique: true,
            validate: {
                validator: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
                message: 'Date must be in YYYY-MM-DD format'
            }
        },
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true
        }
    },
    {
        timestamps: true
    }
);

// Index: unique(date) - already set via schema unique: true

export default mongoose.model('Holiday', holidaySchema);

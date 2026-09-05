import mongoose from 'mongoose';

const habitLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'],
    },
    log: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false, // Ensure empty object is retained
  }
);

// Compound unique index ensuring only 1 log document per user per date
habitLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const HabitLog = mongoose.model('HabitLog', habitLogSchema);

import mongoose from 'mongoose';

export const DEFAULT_HABITS = [
  { id: 'h-1', name: 'Wake up 4' },
  { id: 'h-2', name: 'Read 4min 8am' },
  { id: 'h-3', name: 'Minimum 10k steps' },
  { id: 'h-4', name: 'No Junk Food' },
  { id: 'h-5', name: 'Go to bed 10pm' },
];

const habitItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const habitSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    habits: {
      type: [habitItemSchema],
      validate: [
        (val) => Array.isArray(val) && val.length >= 1 && val.length <= 10,
        'Habits array must have between 1 and 10 items',
      ],
      default: DEFAULT_HABITS,
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Atomic find-or-create to prevent duplicate key race conditions
habitSettingsSchema.statics.findOrCreateForUser = function (userId) {
  return this.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, habits: DEFAULT_HABITS, longestStreak: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const HabitSettings = mongoose.model('HabitSettings', habitSettingsSchema);

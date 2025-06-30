import mongoose from "mongoose";

// Shared Journal Schema
const sharedJournalSchema = new mongoose.Schema(
  {
    shareKey: {
      type: String,
      required: true,
      unique: true,
      length: 8,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
    },
    createdBy: {
      id: String,
      username: String,
    },
    editableByAnyone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // This adds createdAt and updatedAt automatically
  }
);

// Journal Entry Schema
const journalEntrySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    shareKey: {
      type: String,
      required: true,
      ref: "SharedJournal",
    },
    content: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    createdBy: {
      id: String,
      username: String,
    },
    lastEditedBy: {
      id: String,
      username: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance (only add non-unique indexes)
journalEntrySchema.index({ shareKey: 1, date: -1 });

// Export models
export const SharedJournal =
  mongoose.models.SharedJournal ||
  mongoose.model("SharedJournal", sharedJournalSchema);
export const JournalEntry =
  mongoose.models.JournalEntry ||
  mongoose.model("JournalEntry", journalEntrySchema);

const express = require("express");
const cors = require("cors");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, "journal.json");
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, {});

// Initialize database
async function initDatabase() {
  try {
    await db.read();

    // Initialize default data structure if file is empty
    db.data = db.data || {
      shared_journals: [],
      journal_entries: [],
    };

    await db.write();
    console.log("Database initialized");
  } catch (err) {
    console.error("Error initializing database:", err);
    process.exit(1);
  }
}

// Utility function to generate 8-character share key
function generateShareKey() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Routes

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Create a shared journal
app.post("/journal/createShared", async (req, res) => {
  const { shareKey, title, createdBy } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Title is required",
    });
  }

  const finalShareKey = shareKey || generateShareKey();

  try {
    await db.read();

    // Check if share key already exists
    const existingJournal = db.data.shared_journals.find(
      (j) => j.share_key === finalShareKey
    );
    if (existingJournal) {
      return res.status(409).json({
        success: false,
        error: "Share key already exists",
      });
    }

    // Create new journal
    const newJournal = {
      share_key: finalShareKey,
      title: title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by_id: createdBy?.id || null,
      created_by_username: createdBy?.username || null,
      editable_by_anyone: false,
    };

    db.data.shared_journals.push(newJournal);
    await db.write();

    res.json({
      success: true,
      shareKey: finalShareKey,
      title: title,
      message: "Shared journal created successfully",
    });
  } catch (err) {
    console.error("Error creating shared journal:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create shared journal",
    });
  }
});

// Get journal info and entries by share key
app.get("/journal/:key/entries", async (req, res) => {
  const { key } = req.params;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  try {
    await db.read();

    // First check if journal exists
    const journal = db.data.shared_journals.find((j) => j.share_key === key);

    if (!journal) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    // Get all entries for this journal
    const entries = db.data.journal_entries
      .filter((entry) => entry.share_key === key)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      journal: {
        shareKey: journal.share_key,
        title: journal.title,
        createdAt: journal.created_at,
        updatedAt: journal.updated_at,
        createdBy: {
          id: journal.created_by_id,
          username: journal.created_by_username,
        },
        editableByAnyone: Boolean(journal.editable_by_anyone),
      },
      entries: entries || [],
    });
  } catch (err) {
    console.error("Error fetching journal:", err);
    return res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Sync entries to a shared journal
app.post("/journal/:key/entries/sync", async (req, res) => {
  const { key } = req.params;
  const { entries } = req.body;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({
      success: false,
      error: "Entries array is required",
    });
  }

  try {
    await db.read();

    // First verify journal exists
    const journal = db.data.shared_journals.find((j) => j.share_key === key);

    if (!journal) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    if (entries.length === 0) {
      return res.json({
        success: true,
        synced: [],
        failed: [],
        message: "No entries to sync",
      });
    }

    // Process each entry
    const syncedEntries = [];
    const failedEntries = [];

    for (const entry of entries) {
      const { id, content, date, updatedAt, createdBy, lastEditedBy } = entry;

      if (!id || !content || !date) {
        failedEntries.push({
          entry: entry,
          error: "Missing required fields (id, content, date)",
        });
        continue;
      }

      try {
        // Check if entry already exists
        const existingEntryIndex = db.data.journal_entries.findIndex(
          (e) => e.id === id
        );

        if (existingEntryIndex !== -1) {
          // Update existing entry - preserve original creator, update last editor
          const existingEntry = db.data.journal_entries[existingEntryIndex];
          db.data.journal_entries[existingEntryIndex] = {
            ...existingEntry,
            content: content,
            date: date,
            updated_at: updatedAt || new Date().toISOString(),
            last_edited_by_id: lastEditedBy?.id || existingEntry.created_by_id,
            last_edited_by_username:
              lastEditedBy?.username || existingEntry.created_by_username,
          };
        } else {
          // Insert new entry
          const newEntry = {
            id: id,
            share_key: key,
            content: content,
            date: date,
            updated_at: updatedAt || new Date().toISOString(),
            created_by_id: createdBy?.id || null,
            created_by_username: createdBy?.username || null,
            last_edited_by_id: lastEditedBy?.id || createdBy?.id || null,
            last_edited_by_username:
              lastEditedBy?.username || createdBy?.username || null,
          };
          db.data.journal_entries.push(newEntry);
        }

        syncedEntries.push({
          id: id,
          synced: true,
        });
      } catch (err) {
        console.error("Error syncing entry:", err);
        failedEntries.push({
          entry: entry,
          error: err.message,
        });
      }
    }

    // Update journal's updated_at timestamp
    const journalIndex = db.data.shared_journals.findIndex(
      (j) => j.share_key === key
    );
    if (journalIndex !== -1) {
      db.data.shared_journals[journalIndex].updated_at =
        new Date().toISOString();
    }

    await db.write();

    res.json({
      success: true,
      synced: syncedEntries,
      failed: failedEntries,
      message: `Synced ${syncedEntries.length} entries, ${failedEntries.length} failed`,
    });
  } catch (err) {
    console.error("Error in sync transaction:", err);
    return res.status(500).json({
      success: false,
      error: "Database error during sync",
    });
  }
});

// Toggle journal edit permissions
app.patch("/journal/:key/permissions", async (req, res) => {
  const { key } = req.params;
  const { editableByAnyone, userId } = req.body;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  if (typeof editableByAnyone !== "boolean") {
    return res.status(400).json({
      success: false,
      error: "editableByAnyone must be a boolean",
    });
  }

  try {
    await db.read();

    // First check if journal exists and if the user is the creator
    const journalIndex = db.data.shared_journals.findIndex(
      (j) => j.share_key === key
    );

    if (journalIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    const journal = db.data.shared_journals[journalIndex];

    // Check if the user is the creator (optional enforcement)
    if (userId && journal.created_by_id && userId !== journal.created_by_id) {
      return res.status(403).json({
        success: false,
        error: "Only the journal creator can change permissions",
      });
    }

    // Update the permissions
    db.data.shared_journals[journalIndex].editable_by_anyone = editableByAnyone;
    db.data.shared_journals[journalIndex].updated_at = new Date().toISOString();

    await db.write();

    res.json({
      success: true,
      editableByAnyone: editableByAnyone,
      message: `Journal permissions updated: ${
        editableByAnyone ? "anyone can edit" : "creator only"
      }`,
    });
  } catch (err) {
    console.error("Error updating permissions:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to update permissions",
    });
  }
});

// Get all shared journals (for admin/debugging)
app.get("/journals", async (req, res) => {
  try {
    await db.read();

    const journals = db.data.shared_journals
      .map((journal) => ({
        share_key: journal.share_key,
        title: journal.title,
        created_at: journal.created_at,
        updated_at: journal.updated_at,
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      journals: journals || [],
    });
  } catch (err) {
    console.error("Error fetching journals:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch journals",
    });
  }
});

// Delete a journal and all its entries (for cleanup)
app.delete("/journal/:key", async (req, res) => {
  const { key } = req.params;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  try {
    await db.read();

    // Check if journal exists
    const journalIndex = db.data.shared_journals.findIndex(
      (j) => j.share_key === key
    );

    if (journalIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    // Delete entries first
    db.data.journal_entries = db.data.journal_entries.filter(
      (entry) => entry.share_key !== key
    );

    // Then delete journal
    db.data.shared_journals.splice(journalIndex, 1);

    await db.write();

    res.json({
      success: true,
      message: "Journal and all entries deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting journal:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to delete journal",
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Start server function
async function startServer() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 Shared Journal Backend running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📝 Database: ${dbPath.replace(".db", ".json")}`);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...");
  try {
    await db.write(); // Save database before closing
    console.log("📦 Database saved");
  } catch (err) {
    console.error("Error saving database:", err);
  }
  process.exit(0);
});

// Start the server
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

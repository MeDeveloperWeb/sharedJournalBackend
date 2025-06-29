const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, "journal.db");
const db = new Database(dbPath);

// Initialize database tables
try {
  // Shared journals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_journals (
      share_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_id TEXT,
      created_by_username TEXT,
      editable_by_anyone BOOLEAN DEFAULT 0
    )
  `);

  // Journal entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      share_key TEXT NOT NULL,
      content TEXT NOT NULL,
      date DATETIME NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_id TEXT,
      created_by_username TEXT,
      last_edited_by_id TEXT,
      last_edited_by_username TEXT,
      FOREIGN KEY (share_key) REFERENCES shared_journals (share_key)
    )
  `);

  // Add new columns to existing tables if they don't exist
  try {
    db.exec(`ALTER TABLE shared_journals ADD COLUMN created_by_id TEXT`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(`ALTER TABLE shared_journals ADD COLUMN created_by_username TEXT`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(
      `ALTER TABLE shared_journals ADD COLUMN editable_by_anyone BOOLEAN DEFAULT 0`
    );
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(`ALTER TABLE journal_entries ADD COLUMN created_by_id TEXT`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(`ALTER TABLE journal_entries ADD COLUMN created_by_username TEXT`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(`ALTER TABLE journal_entries ADD COLUMN last_edited_by_id TEXT`);
  } catch (err) {
    // Ignore error if column already exists
  }

  try {
    db.exec(
      `ALTER TABLE journal_entries ADD COLUMN last_edited_by_username TEXT`
    );
  } catch (err) {
    // Ignore error if column already exists
  }

  console.log("Database tables initialized");
} catch (err) {
  console.error("Error initializing database:", err);
  process.exit(1);
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
app.post("/journal/createShared", (req, res) => {
  const { shareKey, title, createdBy } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Title is required",
    });
  }

  const finalShareKey = shareKey || generateShareKey();

  try {
    const stmt = db.prepare(`
      INSERT INTO shared_journals (share_key, title, created_by_id, created_by_username, editable_by_anyone) 
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      finalShareKey,
      title,
      createdBy?.id || null,
      createdBy?.username || null,
      0 // Default to false (not editable by anyone)
    );

    res.json({
      success: true,
      shareKey: finalShareKey,
      title: title,
      message: "Shared journal created successfully",
    });
  } catch (err) {
    console.error("Error creating shared journal:", err);
    if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return res.status(409).json({
        success: false,
        error: "Share key already exists",
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to create shared journal",
    });
  }
});

// Get journal info and entries by share key
app.get("/journal/:key/entries", (req, res) => {
  const { key } = req.params;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  try {
    // First check if journal exists
    const journal = db
      .prepare("SELECT * FROM shared_journals WHERE share_key = ?")
      .get(key);

    if (!journal) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    // Get all entries for this journal
    const entries = db
      .prepare(
        `
      SELECT id, content, date, updated_at, 
             created_by_id, created_by_username, 
             last_edited_by_id, last_edited_by_username
      FROM journal_entries 
      WHERE share_key = ? 
      ORDER BY date DESC
    `
      )
      .all(key);

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
app.post("/journal/:key/entries/sync", (req, res) => {
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
    // First verify journal exists
    const journal = db
      .prepare("SELECT share_key FROM shared_journals WHERE share_key = ?")
      .get(key);

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

    // Prepare statements
    const getExistingEntry = db.prepare(
      "SELECT id, created_by_id, created_by_username FROM journal_entries WHERE id = ?"
    );
    const updateEntry = db.prepare(`
      UPDATE journal_entries 
      SET content = ?, date = ?, updated_at = ?, 
          last_edited_by_id = ?, last_edited_by_username = ?
      WHERE id = ?
    `);
    const insertEntry = db.prepare(`
      INSERT INTO journal_entries 
      (id, share_key, content, date, updated_at, 
       created_by_id, created_by_username, 
       last_edited_by_id, last_edited_by_username) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateJournalTimestamp = db.prepare(
      "UPDATE shared_journals SET updated_at = CURRENT_TIMESTAMP WHERE share_key = ?"
    );

    // Use transaction for better performance and consistency
    const transaction = db.transaction((entries) => {
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
          const existingEntry = getExistingEntry.get(id);

          if (existingEntry) {
            // Update existing entry - preserve original creator, update last editor
            updateEntry.run(
              content,
              date,
              updatedAt || new Date().toISOString(),
              lastEditedBy?.id || existingEntry.created_by_id,
              lastEditedBy?.username || existingEntry.created_by_username,
              id
            );
          } else {
            // Insert new entry
            insertEntry.run(
              id,
              key,
              content,
              date,
              updatedAt || new Date().toISOString(),
              createdBy?.id || null,
              createdBy?.username || null,
              lastEditedBy?.id || createdBy?.id || null,
              lastEditedBy?.username || createdBy?.username || null
            );
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
      updateJournalTimestamp.run(key);
    });

    // Execute transaction
    transaction(entries);

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
app.patch("/journal/:key/permissions", (req, res) => {
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
    // First check if journal exists and if the user is the creator
    const journal = db
      .prepare("SELECT * FROM shared_journals WHERE share_key = ?")
      .get(key);

    if (!journal) {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }

    // Check if the user is the creator (optional enforcement)
    if (userId && journal.created_by_id && userId !== journal.created_by_id) {
      return res.status(403).json({
        success: false,
        error: "Only the journal creator can change permissions",
      });
    }

    // Update the permissions
    const updateStmt = db.prepare(
      "UPDATE shared_journals SET editable_by_anyone = ?, updated_at = CURRENT_TIMESTAMP WHERE share_key = ?"
    );
    updateStmt.run(editableByAnyone ? 1 : 0, key);

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
app.get("/journals", (req, res) => {
  try {
    const journals = db
      .prepare(
        "SELECT share_key, title, created_at, updated_at FROM shared_journals ORDER BY created_at DESC"
      )
      .all();

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
app.delete("/journal/:key", (req, res) => {
  const { key } = req.params;

  if (!key || key.length !== 8) {
    return res.status(400).json({
      success: false,
      error: "Invalid share key format",
    });
  }

  try {
    // Use transaction to ensure both deletes happen atomically
    const deleteTransaction = db.transaction(() => {
      // Delete entries first
      const deleteEntries = db.prepare(
        "DELETE FROM journal_entries WHERE share_key = ?"
      );
      deleteEntries.run(key);

      // Then delete journal
      const deleteJournal = db.prepare(
        "DELETE FROM shared_journals WHERE share_key = ?"
      );
      const result = deleteJournal.run(key);

      if (result.changes === 0) {
        throw new Error("Journal not found");
      }

      return result;
    });

    deleteTransaction();

    res.json({
      success: true,
      message: "Journal and all entries deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting journal:", err);
    if (err.message === "Journal not found") {
      return res.status(404).json({
        success: false,
        error: "Journal not found",
      });
    }
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Shared Journal Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 Database: ${dbPath}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");
  try {
    db.close();
    console.log("📦 Database connection closed");
  } catch (err) {
    console.error("Error closing database:", err);
  }
  process.exit(0);
});

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
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
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Shared journals table
  db.run(`
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
  db.run(`
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
  db.run(`ALTER TABLE shared_journals ADD COLUMN created_by_id TEXT`, (err) => {
    // Ignore error if column already exists
  });
  db.run(
    `ALTER TABLE shared_journals ADD COLUMN created_by_username TEXT`,
    (err) => {
      // Ignore error if column already exists
    }
  );
  db.run(
    `ALTER TABLE shared_journals ADD COLUMN editable_by_anyone BOOLEAN DEFAULT 0`,
    (err) => {
      // Ignore error if column already exists
    }
  );

  db.run(`ALTER TABLE journal_entries ADD COLUMN created_by_id TEXT`, (err) => {
    // Ignore error if column already exists
  });
  db.run(
    `ALTER TABLE journal_entries ADD COLUMN created_by_username TEXT`,
    (err) => {
      // Ignore error if column already exists
    }
  );
  db.run(
    `ALTER TABLE journal_entries ADD COLUMN last_edited_by_id TEXT`,
    (err) => {
      // Ignore error if column already exists
    }
  );
  db.run(
    `ALTER TABLE journal_entries ADD COLUMN last_edited_by_username TEXT`,
    (err) => {
      // Ignore error if column already exists
    }
  );

  console.log("Database tables initialized");
});

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

  const stmt = db.prepare(`
    INSERT INTO shared_journals (share_key, title, created_by_id, created_by_username, editable_by_anyone) 
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    [
      finalShareKey,
      title,
      createdBy?.id || null,
      createdBy?.username || null,
      0, // Default to false (not editable by anyone)
    ],
    function (err) {
      if (err) {
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

      res.json({
        success: true,
        shareKey: finalShareKey,
        title: title,
        message: "Shared journal created successfully",
      });
    }
  );

  stmt.finalize();
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

  // First check if journal exists
  db.get(
    "SELECT * FROM shared_journals WHERE share_key = ?",
    [key],
    (err, journal) => {
      if (err) {
        console.error("Error fetching journal:", err);
        return res.status(500).json({
          success: false,
          error: "Database error",
        });
      }

      if (!journal) {
        return res.status(404).json({
          success: false,
          error: "Journal not found",
        });
      }

      // Get all entries for this journal
      db.all(
        `SELECT id, content, date, updated_at, 
                created_by_id, created_by_username, 
                last_edited_by_id, last_edited_by_username
         FROM journal_entries 
         WHERE share_key = ? 
         ORDER BY date DESC`,
        [key],
        (err, entries) => {
          if (err) {
            console.error("Error fetching entries:", err);
            return res.status(500).json({
              success: false,
              error: "Failed to fetch entries",
            });
          }

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
        }
      );
    }
  );
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

  // First verify journal exists
  db.get(
    "SELECT share_key FROM shared_journals WHERE share_key = ?",
    [key],
    (err, journal) => {
      if (err) {
        console.error("Error checking journal:", err);
        return res.status(500).json({
          success: false,
          error: "Database error",
        });
      }

      if (!journal) {
        return res.status(404).json({
          success: false,
          error: "Journal not found",
        });
      }

      // Process each entry
      const syncedEntries = [];
      const failedEntries = [];
      let processed = 0;

      if (entries.length === 0) {
        return res.json({
          success: true,
          synced: [],
          failed: [],
          message: "No entries to sync",
        });
      }

      entries.forEach((entry) => {
        const { id, content, date, updatedAt, createdBy, lastEditedBy } = entry;

        if (!id || !content || !date) {
          failedEntries.push({
            entry: entry,
            error: "Missing required fields (id, content, date)",
          });
          processed++;
          if (processed === entries.length) {
            sendSyncResponse();
          }
          return;
        }

        // Check if entry already exists to determine if this is an update
        db.get(
          "SELECT id, created_by_id, created_by_username FROM journal_entries WHERE id = ?",
          [id],
          (err, existingEntry) => {
            if (err) {
              console.error("Error checking existing entry:", err);
              failedEntries.push({
                entry: entry,
                error: err.message,
              });
              processed++;
              if (processed === entries.length) {
                sendSyncResponse();
              }
              return;
            }

            let stmt;
            let params;

            if (existingEntry) {
              // Update existing entry - preserve original creator, update last editor
              stmt = db.prepare(`
                UPDATE journal_entries 
                SET content = ?, date = ?, updated_at = ?, 
                    last_edited_by_id = ?, last_edited_by_username = ?
                WHERE id = ?
              `);
              params = [
                content,
                date,
                updatedAt || new Date().toISOString(),
                lastEditedBy?.id || existingEntry.created_by_id,
                lastEditedBy?.username || existingEntry.created_by_username,
                id,
              ];
            } else {
              // Insert new entry
              stmt = db.prepare(`
                INSERT INTO journal_entries 
                (id, share_key, content, date, updated_at, 
                 created_by_id, created_by_username, 
                 last_edited_by_id, last_edited_by_username) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              params = [
                id,
                key,
                content,
                date,
                updatedAt || new Date().toISOString(),
                createdBy?.id || null,
                createdBy?.username || null,
                lastEditedBy?.id || createdBy?.id || null,
                lastEditedBy?.username || createdBy?.username || null,
              ];
            }

            stmt.run(params, function (err) {
              if (err) {
                console.error("Error syncing entry:", err);
                failedEntries.push({
                  entry: entry,
                  error: err.message,
                });
              } else {
                syncedEntries.push({
                  id: id,
                  synced: true,
                });
              }

              processed++;
              if (processed === entries.length) {
                sendSyncResponse();
              }
            });

            stmt.finalize();
          }
        );
      });

      function sendSyncResponse() {
        // Update journal's updated_at timestamp
        db.run(
          "UPDATE shared_journals SET updated_at = CURRENT_TIMESTAMP WHERE share_key = ?",
          [key]
        );

        res.json({
          success: true,
          synced: syncedEntries,
          failed: failedEntries,
          message: `Synced ${syncedEntries.length} entries, ${failedEntries.length} failed`,
        });
      }
    }
  );
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

  // First check if journal exists and if the user is the creator
  db.get(
    "SELECT * FROM shared_journals WHERE share_key = ?",
    [key],
    (err, journal) => {
      if (err) {
        console.error("Error fetching journal:", err);
        return res.status(500).json({
          success: false,
          error: "Database error",
        });
      }

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
      db.run(
        "UPDATE shared_journals SET editable_by_anyone = ?, updated_at = CURRENT_TIMESTAMP WHERE share_key = ?",
        [editableByAnyone ? 1 : 0, key],
        function (err) {
          if (err) {
            console.error("Error updating permissions:", err);
            return res.status(500).json({
              success: false,
              error: "Failed to update permissions",
            });
          }

          res.json({
            success: true,
            editableByAnyone: editableByAnyone,
            message: `Journal permissions updated: ${
              editableByAnyone ? "anyone can edit" : "creator only"
            }`,
          });
        }
      );
    }
  );
});

// Get all shared journals (for admin/debugging)
app.get("/journals", (req, res) => {
  db.all(
    "SELECT share_key, title, created_at, updated_at FROM shared_journals ORDER BY created_at DESC",
    (err, journals) => {
      if (err) {
        console.error("Error fetching journals:", err);
        return res.status(500).json({
          success: false,
          error: "Failed to fetch journals",
        });
      }

      res.json({
        success: true,
        journals: journals || [],
      });
    }
  );
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

  db.serialize(() => {
    // Delete entries first
    db.run("DELETE FROM journal_entries WHERE share_key = ?", [key]);

    // Then delete journal
    db.run(
      "DELETE FROM shared_journals WHERE share_key = ?",
      [key],
      function (err) {
        if (err) {
          console.error("Error deleting journal:", err);
          return res.status(500).json({
            success: false,
            error: "Failed to delete journal",
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({
            success: false,
            error: "Journal not found",
          });
        }

        res.json({
          success: true,
          message: "Journal and all entries deleted successfully",
        });
      }
    );
  });
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
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err);
    } else {
      console.log("📦 Database connection closed");
    }
    process.exit(0);
  });
});

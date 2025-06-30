import connectDB from "@/lib/mongodb";
import { SharedJournal, JournalEntry } from "@/lib/models";
import {
  isValidShareKey,
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

export async function POST(request, { params }) {
  try {
    await connectDB();

    const { key } = await params;
    const body = await request.json();
    const { entries } = body;

    if (!isValidShareKey(key)) {
      return createErrorResponse("Invalid share key format", 400);
    }

    if (!entries || !Array.isArray(entries)) {
      return createErrorResponse("Entries array is required", 400);
    }

    // First verify journal exists
    const journal = await SharedJournal.findOne({ shareKey: key });

    if (!journal) {
      return createErrorResponse("Journal not found", 404);
    }

    if (entries.length === 0) {
      return createSuccessResponse({
        synced: [],
        failed: [],
        message: "No entries to sync",
      });
    }

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
        const existingEntry = await JournalEntry.findOne({ id });

        if (existingEntry) {
          // Update existing entry
          existingEntry.content = content;
          existingEntry.date = new Date(date);
          existingEntry.lastEditedBy = {
            id: lastEditedBy?.id || existingEntry.createdBy?.id,
            username:
              lastEditedBy?.username || existingEntry.createdBy?.username,
          };
          if (updatedAt) {
            existingEntry.updatedAt = new Date(updatedAt);
          }

          await existingEntry.save();
        } else {
          // Create new entry
          const newEntry = new JournalEntry({
            id,
            shareKey: key,
            content,
            date: new Date(date),
            createdBy: {
              id: createdBy?.id || null,
              username: createdBy?.username || null,
            },
            lastEditedBy: {
              id: lastEditedBy?.id || createdBy?.id || null,
              username: lastEditedBy?.username || createdBy?.username || null,
            },
          });

          if (updatedAt) {
            newEntry.updatedAt = new Date(updatedAt);
          }

          await newEntry.save();
        }

        syncedEntries.push({
          id: id,
          synced: true,
        });
      } catch (entryError) {
        console.error("Error syncing entry:", entryError);
        failedEntries.push({
          entry: entry,
          error: entryError.message,
        });
      }
    }

    // Update journal's updated timestamp
    journal.updatedAt = new Date();
    await journal.save();

    return createSuccessResponse({
      synced: syncedEntries,
      failed: failedEntries,
      message: `Synced ${syncedEntries.length} entries, ${failedEntries.length} failed`,
    });
  } catch (error) {
    console.error("Error in sync transaction:", error);
    return createErrorResponse("Database error during sync", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

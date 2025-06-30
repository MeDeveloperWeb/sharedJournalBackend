import connectDB from "@/lib/mongodb";
import { SharedJournal, JournalEntry } from "@/lib/models";
import {
  isValidShareKey,
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

export async function GET(request, { params }) {
  try {
    await connectDB();

    const { key } = await params;

    if (!isValidShareKey(key)) {
      return createErrorResponse("Invalid share key format", 400);
    }

    // First check if journal exists
    const journal = await SharedJournal.findOne({ shareKey: key });

    if (!journal) {
      return createErrorResponse("Journal not found", 404);
    }

    // Get all entries for this journal
    const entries = await JournalEntry.find({ shareKey: key })
      .sort({ date: -1 })
      .lean();

    // Transform entries to match the expected format
    const transformedEntries = entries.map((entry) => ({
      id: entry.id,
      content: entry.content,
      date: entry.date,
      updated_at: entry.updatedAt,
      created_by_id: entry.createdBy?.id,
      created_by_username: entry.createdBy?.username,
      last_edited_by_id: entry.lastEditedBy?.id,
      last_edited_by_username: entry.lastEditedBy?.username,
    }));

    return createSuccessResponse({
      journal: {
        shareKey: journal.shareKey,
        title: journal.title,
        createdAt: journal.createdAt,
        updatedAt: journal.updatedAt,
        createdBy: {
          id: journal.createdBy?.id,
          username: journal.createdBy?.username,
        },
        editableByAnyone: journal.editableByAnyone,
      },
      entries: transformedEntries,
    });
  } catch (error) {
    console.error("Error fetching journal entries:", error);
    return createErrorResponse("Database error", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

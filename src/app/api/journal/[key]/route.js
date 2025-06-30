import connectDB from "@/lib/mongodb";
import { SharedJournal, JournalEntry } from "@/lib/models";
import {
  isValidShareKey,
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

// Delete a journal and all its entries
export async function DELETE(request, { params }) {
  try {
    await connectDB();

    const { key } = await params;

    if (!isValidShareKey(key)) {
      return createErrorResponse("Invalid share key format", 400);
    }

    // Delete entries first
    await JournalEntry.deleteMany({ shareKey: key });

    // Then delete journal
    const result = await SharedJournal.deleteOne({ shareKey: key });

    if (result.deletedCount === 0) {
      return createErrorResponse("Journal not found", 404);
    }

    return createSuccessResponse({
      message: "Journal and all entries deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting journal:", error);
    return createErrorResponse("Failed to delete journal", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

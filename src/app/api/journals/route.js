import connectDB from "@/lib/mongodb";
import { SharedJournal } from "@/lib/models";
import {
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

// Get all shared journals (for admin/debugging)
export async function GET() {
  try {
    await connectDB();

    const journals = await SharedJournal.find({})
      .select("shareKey title createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    const transformedJournals = journals.map((journal) => ({
      share_key: journal.shareKey,
      title: journal.title,
      created_at: journal.createdAt,
      updated_at: journal.updatedAt,
    }));

    return createSuccessResponse({
      journals: transformedJournals,
    });
  } catch (error) {
    console.error("Error fetching journals:", error);
    return createErrorResponse("Failed to fetch journals", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

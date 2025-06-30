import connectDB from "@/lib/mongodb";
import { SharedJournal } from "@/lib/models";
import {
  generateShareKey,
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

export async function POST(request) {
  try {
    await connectDB();

    const body = await request.json();
    const { shareKey, title, createdBy } = body;

    if (!title) {
      return createErrorResponse("Title is required", 400);
    }

    const finalShareKey = shareKey || generateShareKey();

    // Check if share key already exists
    const existingJournal = await SharedJournal.findOne({
      shareKey: finalShareKey,
    });
    if (existingJournal) {
      return createErrorResponse("Share key already exists", 409);
    }

    // Create new shared journal
    const journal = new SharedJournal({
      shareKey: finalShareKey,
      title,
      createdBy: {
        id: createdBy?.id || null,
        username: createdBy?.username || null,
      },
      editableByAnyone: false,
    });

    await journal.save();

    return createSuccessResponse({
      shareKey: finalShareKey,
      title: title,
      message: "Shared journal created successfully",
    });
  } catch (error) {
    console.error("Error creating shared journal:", error);
    return createErrorResponse("Failed to create shared journal", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

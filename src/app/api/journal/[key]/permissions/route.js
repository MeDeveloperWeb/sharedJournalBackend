import connectDB from "@/lib/mongodb";
import { SharedJournal } from "@/lib/models";
import {
  isValidShareKey,
  createErrorResponse,
  createSuccessResponse,
  corsHeaders,
} from "@/lib/utils";

export async function PATCH(request, { params }) {
  try {
    await connectDB();

    const { key } = await params;
    const body = await request.json();
    const { editableByAnyone, userId } = body;

    if (!isValidShareKey(key)) {
      return createErrorResponse("Invalid share key format", 400);
    }

    if (typeof editableByAnyone !== "boolean") {
      return createErrorResponse("editableByAnyone must be a boolean", 400);
    }

    // First check if journal exists
    const journal = await SharedJournal.findOne({ shareKey: key });

    if (!journal) {
      return createErrorResponse("Journal not found", 404);
    }

    // Check if the user is the creator (optional enforcement)
    if (userId && journal.createdBy?.id && userId !== journal.createdBy.id) {
      return createErrorResponse(
        "Only the journal creator can change permissions",
        403
      );
    }

    // Update the permissions
    journal.editableByAnyone = editableByAnyone;
    journal.updatedAt = new Date();
    await journal.save();

    return createSuccessResponse({
      editableByAnyone: editableByAnyone,
      message: `Journal permissions updated: ${
        editableByAnyone ? "anyone can edit" : "creator only"
      }`,
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    return createErrorResponse("Failed to update permissions", 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

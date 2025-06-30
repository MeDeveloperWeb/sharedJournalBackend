import { createSuccessResponse, corsHeaders } from "@/lib/utils";

export async function GET() {
  return createSuccessResponse(
    {
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "How's You Journal Backend",
      version: "2.0.0",
    },
    200
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

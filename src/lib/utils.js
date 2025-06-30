// Utility function to generate 8-character share key
export function generateShareKey() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Utility function to validate share key format
export function isValidShareKey(key) {
  return typeof key === "string" && key.length === 8 && /^[A-Z0-9]+$/.test(key);
}

// Utility function to handle API errors
export function createErrorResponse(message, status = 500) {
  return Response.json({ success: false, error: message }, { status });
}

// Utility function to handle API success responses
export function createSuccessResponse(data, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

// CORS headers for API responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          📔 How&apos;s You Backend API
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Journal sharing backend with MongoDB and Next.js
        </p>
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            🏥 Health Check:{" "}
            <a href="/api/health" className="text-blue-600 hover:underline">
              /api/health
            </a>
          </p>
          <p className="text-sm text-gray-500">
            📚 API Documentation: Available at the endpoints below
          </p>
        </div>
        <div className="mt-8 text-left max-w-md mx-auto">
          <h3 className="font-semibold mb-2">Available Endpoints:</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• POST /api/journal/createShared</li>
            <li>• GET /api/journal/[key]/entries</li>
            <li>• POST /api/journal/[key]/entries/sync</li>
            <li>• PATCH /api/journal/[key]/permissions</li>
            <li>• GET /api/journals</li>
            <li>• DELETE /api/journal/[key]</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

# 📔 How's You Backend API

Next.js App Router backend for the How's You mobile journaling app with MongoDB.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: MongoDB with Mongoose
- **Runtime**: Node.js
- **Additional**: UUID for share keys

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or cloud instance)
- npm

### Installation

1. Navigate to the backend directory

```bash
cd shared-journal-backend
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

Create a `.env.local` file:

```
MONGODB_URI=mongodb://localhost:27017/how-you-journal
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000
```

4. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### Health Check

- `GET /api/health` - Server health status

### Journal Management

- `POST /api/journal/createShared` - Create a new shared journal
- `GET /api/journal/[key]/entries` - Get journal and its entries
- `POST /api/journal/[key]/entries/sync` - Sync entries to journal
- `PATCH /api/journal/[key]/permissions` - Update journal permissions
- `DELETE /api/journal/[key]` - Delete journal and all entries
- `GET /api/journals` - Get all journals (admin)

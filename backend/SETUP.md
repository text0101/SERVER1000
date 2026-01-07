# AutoTallyAI Web Setup (Quick Start)

## Prerequisites
- Node.js 18+ and npm
- Git (optional)
- Tally Prime on Windows (optional, for live push)

## 1) Install
- Clone or copy this folder
- In the project root:
  - `npm install`

## 2) Environment
- Create a `.env` file in the project root and add as needed:
  - `VITE_API_BASE_URL=https://server1000-63i8.onrender.com`
  - `VITE_BACKEND_API_KEY=your-key` 
  - `VITE_TALLY_API_URL=http://127.0.0.1:9000`
- Notes:
  - `VITE_API_BASE_URL` defaults to a hosted backend if not set
  - `VITE_BACKEND_API_KEY` defaults to a test key if not set
  - In development, Tally requests go via Vite proxy at `/tally`

## 3) Run (Web)
- Start dev server: `npm run dev`
- Open: `http://localhost:5173/`
- Tally integration:
  - Start Tally Prime and enable ODBC/XML on port `9000`
  - The app will detect and show connection status

## 4) Build and Preview
- Build: `npm run build`
- Preview static build: `npm run preview`

## 5) Desktop (Optional)
- Dev: `npm run electron:dev`
- Windows installer: `npm run electron:dist`

## 6) Upload & Push Flow
- Upload invoices, bank statements, or Excel from Dashboard
- Processed invoices show as `Ready`
- Push:
  - Single: open in editor and click `Push`
  - Bulk: `Push All` when ready count > 0

## Troubleshooting
- Tally offline:
  - Ensure Tally Prime is running on `127.0.0.1:9000`
  - Set `VITE_TALLY_API_URL` or use the dev proxy `/tally`
- Build errors:
  - Delete `release_v*` artifacts if locked
  - Re-run `npm install` then `npm run build`
- Backend errors:
  - Confirm `VITE_API_BASE_URL` is reachable
  - Verify `VITE_BACKEND_API_KEY`


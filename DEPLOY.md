# AutoTally Backend - Deployment Guide

## Quick Deploy to Render.com

### Step 1: Push to GitHub

```bash
cd backend
git init
git add .
git commit -m "Add Gemini API key endpoint"
```

Create a new repository on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/autotally-backend.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to https://render.com and sign in
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect a repository"** → Select your GitHub repo
4. Configure the service:
   - **Name:** `autotally-backend`
   - **Region:** Choose closest to you
   - **Branch:** `main`
   - **Root Directory:** Leave empty (or `backend` if you pushed the whole project)
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. Add **Environment Variables:**
   - Click "Advanced" → "Add Environment Variable"
   - Add these two variables:
     ```
     BACKEND_API_KEY = test-backend-key-12345
     GEMINI_API_KEY = AIzaSyCWiqkPyxUNUxWRdBaLMlTO0u7SB7eXqk0
     ```

6. Click **"Create Web Service"**

### Step 3: Wait for Deployment

Render will:
- Install dependencies (takes ~2-3 minutes)
- Start your service
- Give you a URL like: `https://autotally-backend-xxxx.onrender.com`

### Step 4: Test Your Backend

Once deployed, test it:

```bash
curl https://your-backend-url.onrender.com/health
```

Should return:
```json
{"status":"healthy","message":"Backend is running"}
```

Test the Gemini key endpoint:
```bash
curl -H "Authorization: Bearer test-backend-key-12345" https://your-backend-url.onrender.com/ai/gemini-key
```

Should return:
```json
{
  "success": true,
  "geminiApiKey": "AIzaSy...",
  "message": "API key retrieved successfully"
}
```

### Step 5: Update React App

Update your React app's `.env.local`:

```env
VITE_BACKEND_API_URL=https://your-backend-url.onrender.com
VITE_BACKEND_API_KEY=test-backend-key-12345
```

Restart your React app and test!

## Alternative: Deploy to Existing Backend

If you already have a backend at `https://autotally-backend.onrender.com`:

1. Add the code from `main.py` to your existing backend
2. Add the environment variables on Render dashboard
3. Redeploy

## Troubleshooting

**Build fails:**
- Check that `requirements.txt` is in the root directory
- Verify Python version compatibility

**Service won't start:**
- Check logs on Render dashboard
- Verify `PORT` environment variable is being used

**API returns 401:**
- Check that `BACKEND_API_KEY` matches between frontend and backend
- Verify Authorization header format: `Bearer <key>`

**CORS errors:**
- Update `allow_origins` in `main.py` to include your frontend URL

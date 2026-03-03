# Deploying Jangkrik AI to Vercel

This project is prepared for Vercel deployment. Follow these steps to get it running.

## 1. Environment Variables

Set the following environment variables in your Vercel project settings:

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Your Google Gemini API Key |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase Service Role Key (Secret) |
| `SESSION_SECRET` | A random string for session encryption |
| `APP_URL` | Your Vercel deployment URL (e.g., `https://your-app.vercel.app`) |

## 2. Supabase Database Setup

To make this app work, you need to create three tables in your Supabase SQL Editor:

```sql
-- 1. Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT,
  text TEXT,
  image_data TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## 3. Persistent User Identification

This app uses a **Persistent Cookie** (`user_id`) that lasts for 1 year. 
- When a user visits, the server checks for this cookie.
- If it doesn't exist, it creates a new unique ID and saves it in the cookie and Supabase.
- This allows users to return to their chat history without ever needing to log in.

## 4. Serverless Timeout

Vercel's free tier has a **10-second timeout** for serverless functions. 
- AI responses (Gemini API) can sometimes take longer than 10 seconds.
- If you encounter "504 Gateway Timeout", consider upgrading to Vercel Pro or using a different hosting provider like **Railway** or **Render** which supports long-running processes.

## 5. Deployment

You can deploy by pushing this code to a GitHub repository and connecting it to Vercel, or by using the Vercel CLI:

```bash
vercel
```

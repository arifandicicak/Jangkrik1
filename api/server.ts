import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("jangkrik.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT,
    name TEXT,
    avatar TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    created_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT,
    text TEXT,
    image_data TEXT,
    timestamp INTEGER,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// Migration for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN name TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN created_at INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN image_data TEXT"); } catch (e) {}

// Passport Configuration
const getCallbackURL = () => {
  const baseUrl = process.env.APP_URL || "";
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}/auth/google/callback`;
  }
  return "/auth/google/callback";
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "dummy",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy",
      callbackURL: getCallbackURL(),
      proxy: true,
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      const googleId = profile.id;
      const name = profile.displayName;
      const avatar = profile.photos?.[0]?.value;

      let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId) as any;

      if (!user) {
        const id = uuidv4();
        db.prepare(
          "INSERT INTO users (id, google_id, email, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, googleId, email, name, avatar, Date.now());
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      } else {
        // Update user info if changed
        db.prepare("UPDATE users SET email = ?, name = ?, avatar = ? WHERE google_id = ?").run(
          email,
          name,
          avatar,
          googleId
        );
      }
      return done(null, user);
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  done(null, user);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "jangkrik-secret",
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Middleware to ensure a persistent anonymous user ID if not logged in
  app.use((req, res, next) => {
    if (!req.isAuthenticated() && !(req.session as any).userId) {
      const newUserId = uuidv4();
      (req.session as any).userId = newUserId;
      db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(newUserId, Date.now());
    }
    next();
  });

  const getUserId = (req: any) => {
    if (req.isAuthenticated()) {
      return (req.user as any).id;
    }
    return (req.session as any).userId;
  };

  // Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const callbackURL = getCallbackURL();
    console.log(`[Auth] Generating Google Auth URL with callback: ${callbackURL}`);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "dummy",
      redirect_uri: callbackURL,
      response_type: "code",
      scope: "profile email",
      access_type: "offline",
      prompt: "consent",
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  });

  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'AUTH_SUCCESS' }, '*');
              window.close();
            </script>
          </body>
        </html>
      `);
    }
  );

  app.get("/api/me", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ user: req.user });
    } else {
      res.json({ user: null });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  // Chat Routes
  app.get("/api/sessions", (req, res) => {
    const userId = getUserId(req);
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    const sessionsWithMessages = sessions.map((s: any) => {
      const messages = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC").all(s.id);
      return {
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        messages: messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          imageData: m.image_data,
          timestamp: m.timestamp
        }))
      };
    });
    res.json(sessionsWithMessages);
  });

  app.post("/api/sessions", (req, res) => {
    const userId = getUserId(req);
    const { id, title, createdAt } = req.body;
    db.prepare("INSERT INTO sessions (id, user_id, title, created_at) VALUES (?, ?, ?, ?)").run(id, userId, title, createdAt);
    res.json({ success: true });
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const userId = getUserId(req);
    const { id } = req.params;
    db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(id, userId);
    res.json({ success: true });
  });

  app.post("/api/messages", (req, res) => {
    const userId = getUserId(req);
    const { id, sessionId, role, text, timestamp, sessionTitle, imageData } = req.body;
    
    if (sessionTitle) {
      db.prepare("UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?").run(sessionTitle, sessionId, userId);
    }

    db.prepare("INSERT INTO messages (id, session_id, role, text, timestamp, image_data) VALUES (?, ?, ?, ?, ?, ?)").run(id, sessionId, role, text, timestamp, imageData || null);
    res.json({ success: true });
  });

  app.delete("/api/messages/:id", (req, res) => {
    const userId = getUserId(req);
    const { id } = req.params;
    db.prepare(`
      DELETE FROM messages 
      WHERE id = ? AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)
    `).run(id, userId);
    res.json({ success: true });
  });

  app.delete("/api/sessions/:sessionId/messages", (req, res) => {
    const userId = getUserId(req);
    const { sessionId } = req.params;
    db.prepare("DELETE FROM messages WHERE session_id = ? AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)").run(sessionId, userId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

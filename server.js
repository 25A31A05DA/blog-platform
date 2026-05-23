const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const now = new Date().toISOString();
    writeDb({
      users: [],
      sessions: [],
      posts: [
        {
          id: crypto.randomUUID(),
          title: "Designing a calmer writing workflow",
          excerpt: "A first look at how thoughtful tools can make publishing feel focused, fast, and polished.",
          content:
            "Great blogging software should stay out of the way while still giving writers confidence. This starter post shows how the platform presents long-form writing, comments, authorship, and editing in one clean space.",
          authorId: "system",
          authorName: "Editorial Team",
          createdAt: now,
          updatedAt: now,
          comments: [
            {
              id: crypto.randomUUID(),
              authorId: "system",
              authorName: "Editorial Team",
              content: "Create an account to add your own posts and join the discussion.",
              createdAt: now
            }
          ]
        }
      ]
    });
  }
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(originalHash, "hex"));
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function sanitizeUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } : null;
}

function getAuth(req, db) {
  const token = getBearerToken(req);
  if (!token) return null;
  const session = db.sessions.find(item => item.token === token);
  if (!session) return null;
  const user = db.users.find(item => item.id === session.userId);
  return user ? { token, session, user } : null;
}

function publicPost(post) {
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    authorId: post.authorId,
    authorName: post.authorName,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    comments: post.comments || []
  };
}

function validatePostInput(body) {
  const title = String(body.title || "").trim();
  const excerpt = String(body.excerpt || "").trim();
  const content = String(body.content || "").trim();
  if (title.length < 4) return "Title must be at least 4 characters.";
  if (excerpt.length < 12) return "Excerpt must be at least 12 characters.";
  if (content.length < 30) return "Post content must be at least 30 characters.";
  return null;
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (name.length < 2) return sendError(res, 400, "Name must be at least 2 characters.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return sendError(res, 400, "Enter a valid email address.");
    if (password.length < 6) return sendError(res, 400, "Password must be at least 6 characters.");
    if (db.users.some(user => user.email === email)) return sendError(res, 409, "Email is already registered.");

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };
    const token = crypto.randomBytes(32).toString("hex");
    db.users.push(user);
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    writeDb(db);
    return sendJson(res, 201, { token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendError(res, 401, "Invalid email or password.");
    }
    const token = crypto.randomBytes(32).toString("hex");
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    writeDb(db);
    return sendJson(res, 200, { token, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = getBearerToken(req);
    const nextDb = { ...db, sessions: db.sessions.filter(session => session.token !== token) };
    writeDb(nextDb);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const auth = getAuth(req, db);
    return sendJson(res, 200, { user: auth ? sanitizeUser(auth.user) : null });
  }

  if (req.method === "GET" && pathname === "/api/posts") {
    const posts = db.posts
      .map(publicPost)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return sendJson(res, 200, { posts });
  }

  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  const commentsMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);

  if (req.method === "POST" && pathname === "/api/posts") {
    const auth = getAuth(req, db);
    if (!auth) return sendError(res, 401, "You must be logged in to create a post.");
    const body = await parseBody(req);
    const validationError = validatePostInput(body);
    if (validationError) return sendError(res, 400, validationError);

    const now = new Date().toISOString();
    const post = {
      id: crypto.randomUUID(),
      title: String(body.title).trim(),
      excerpt: String(body.excerpt).trim(),
      content: String(body.content).trim(),
      authorId: auth.user.id,
      authorName: auth.user.name,
      createdAt: now,
      updatedAt: now,
      comments: []
    };
    db.posts.push(post);
    writeDb(db);
    return sendJson(res, 201, { post: publicPost(post) });
  }

  if (postMatch && ["PUT", "DELETE"].includes(req.method)) {
    const auth = getAuth(req, db);
    if (!auth) return sendError(res, 401, "You must be logged in to manage posts.");
    const post = db.posts.find(item => item.id === postMatch[1]);
    if (!post) return sendError(res, 404, "Post not found.");
    if (post.authorId !== auth.user.id) return sendError(res, 403, "Only the author can change this post.");

    if (req.method === "DELETE") {
      db.posts = db.posts.filter(item => item.id !== post.id);
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    }

    const body = await parseBody(req);
    const validationError = validatePostInput(body);
    if (validationError) return sendError(res, 400, validationError);
    post.title = String(body.title).trim();
    post.excerpt = String(body.excerpt).trim();
    post.content = String(body.content).trim();
    post.updatedAt = new Date().toISOString();
    writeDb(db);
    return sendJson(res, 200, { post: publicPost(post) });
  }

  if (commentsMatch && req.method === "POST") {
    const auth = getAuth(req, db);
    if (!auth) return sendError(res, 401, "You must be logged in to comment.");
    const post = db.posts.find(item => item.id === commentsMatch[1]);
    if (!post) return sendError(res, 404, "Post not found.");
    const body = await parseBody(req);
    const content = String(body.content || "").trim();
    if (content.length < 2) return sendError(res, 400, "Comment must be at least 2 characters.");
    const comment = {
      id: crypto.randomUUID(),
      authorId: auth.user.id,
      authorName: auth.user.name,
      content,
      createdAt: new Date().toISOString()
    };
    post.comments = post.comments || [];
    post.comments.push(comment);
    post.updatedAt = new Date().toISOString();
    writeDb(db);
    return sendJson(res, 201, { comment, post: publicPost(post) });
  }

  return sendError(res, 404, "API route not found.");
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(fallback);
      });
      return;
    }
    const extension = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(contents);
  });
}

ensureDatabase();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Unexpected server error.");
  }
});

server.listen(PORT, () => {
  console.log(`Blog platform running at http://localhost:${PORT}`);
});

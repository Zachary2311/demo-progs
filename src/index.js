const COOKIE_NAME = "session_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/") {
      return new Response(getFrontendHtml(), {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    }

    // Auth
    if (pathname === "/api/signup" && request.method === "POST") {
      return handleSignup(request, env);
    }
    if (pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (pathname === "/api/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }
    if (pathname === "/api/me" && request.method === "GET") {
      return handleMe(request, env);
    }

    // Speech-to-Text
    if (pathname === "/api/transcribe" && request.method === "POST") {
      return handleTranscription(request, env);
    }

    // Text-to-Speech
    if (pathname === "/api/tts" && request.method === "POST") {
      return handleTTS(request, env);
    }

    // History
    if (
      pathname === "/api/history/transcriptions" &&
      request.method === "GET"
    ) {
      return handleTranscriptionHistory(request, env);
    }
    if (pathname === "/api/history/tts" && request.method === "GET") {
      return handleTTSHistory(request, env);
    }

    // Chat
    if (pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }
    if (pathname === "/api/chat/history" && request.method === "GET") {
      return handleChatHistory(request, env);
    }
    if (pathname === "/api/chat/clear" && request.method === "POST") {
      return handleClearChat(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

/* ---------- Shared helpers ---------- */

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...headers,
    },
  });
}

function unauthorized() {
  return json({ ok: false, error: "Not authenticated" }, 401);
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = {};
  cookieHeader.split(";").forEach((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return;
    cookies[key] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

function makeCookie(name, value, { maxAge } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join("; ");
}

function randomId(size = 16) {
  const arr = new Uint8Array(size);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createSession(env, userId) {
  const sessionId = randomId(16);
  const now = Date.now();
  const expiresAt = now + COOKIE_MAX_AGE * 1000;

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(sessionId, userId, now, expiresAt)
    .run();

  return { sessionId, expiresAt };
}

async function getSessionUser(env, request) {
  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;

  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT users.id as id, users.email as email, sessions.id as session_id
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
  )
    .bind(sessionId, now)
    .all();

  if (!results || !results.length) return null;

  const row = results[0];
  return { id: row.id, email: row.email, sessionId: row.session_id };
}

/* ---------- Auth handlers ---------- */

async function handleSignup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password || password.length < 6) {
    return json(
      {
        ok: false,
        error: "Email and password (min 6 chars) are required.",
      },
      400,
    );
  }

  const passwordHash = await hashPassword(password);
  const now = Date.now();

  let userId;
  try {
    const result = await env.DB.prepare(
      "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
    )
      .bind(email, passwordHash, now)
      .run();
    userId = result.meta.last_row_id;
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return json({ ok: false, error: "Email already registered." }, 409);
    }
    console.error("Signup error:", err);
    return json({ ok: false, error: "Could not create account." }, 500);
  }

  const { sessionId } = await createSession(env, userId);
  const cookie = makeCookie(COOKIE_NAME, sessionId, {
    maxAge: COOKIE_MAX_AGE,
  });

  return json(
    { ok: true, user: { id: userId, email } },
    200,
    { "Set-Cookie": cookie },
  );
}

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return json(
      { ok: false, error: "Email and password are required." },
      400,
    );
  }

  const { results } = await env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE email = ?",
  )
    .bind(email)
    .all();

  if (!results || !results.length) {
    return json({ ok: false, error: "Invalid email or password." }, 401);
  }

  const user = results[0];
  const hash = await hashPassword(password);
  if (hash !== user.password_hash) {
    return json({ ok: false, error: "Invalid email or password." }, 401);
  }

  const { sessionId } = await createSession(env, user.id);
  const cookie = makeCookie(COOKIE_NAME, sessionId, {
    maxAge: COOKIE_MAX_AGE,
  });

  return json(
    { ok: true, user: { id: user.id, email } },
    200,
    { "Set-Cookie": cookie },
  );
}

async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAME];

  if (sessionId) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  const cookie = makeCookie(COOKIE_NAME, "", { maxAge: 0 });
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}

async function handleMe(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return json({ ok: false, user: null }, 200);
  return json({ ok: true, user: { id: user.id, email: user.email } }, 200);
}

/* ---------- Speech-to-Text handler (Whisper) ---------- */

async function handleTranscription(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Expected multipart/form-data" }, 400);
    }

    const formData = await request.formData();
    const file = formData.get("audio");

    if (!file || typeof file.arrayBuffer !== "function") {
      return json({ ok: false, error: "No audio file provided" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const input = { audio: [...uint8] };

    const aiResponse = await env.AI.run("@cf/openai/whisper", input);

    const text = aiResponse.text || "";
    const wc =
      aiResponse.word_count ??
      (text ? text.split(/\s+/).filter(Boolean).length : 0);

    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO transcriptions
       (user_id, filename, transcript_preview, word_count, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        user.id,
        file.name || null,
        text.slice(0, 500),
        wc,
        "@cf/openai/whisper",
        now,
      )
      .run();

    return json({
      ok: true,
      model: "@cf/openai/whisper",
      filename: file.name,
      transcription: text,
      word_count: wc,
      words: aiResponse.words,
      vtt: aiResponse.vtt,
    });
  } catch (err) {
    console.error("Transcription error:", err);
    return json(
      {
        ok: false,
        error:
          "Transcription failed. Check Worker logs and audio size/format.",
      },
      500,
    );
  }
}

/* ---------- Text-to-Speech handler (Deepgram Aura-2) ---------- */

async function handleTTS(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const text = String(body.text || "").trim();
  // Allow either `voice` or legacy `speaker` from the frontend.
  const speaker = String(body.voice || body.speaker || "luna");

  if (!text) {
    return json({ ok: false, error: "Text is required." }, 400);
  }

  const charCount = text.length;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO tts_history
     (user_id, text_preview, char_count, speaker, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      user.id,
      text.slice(0, 200),
      charCount,
      speaker,
      "@cf/deepgram/aura-2-en",
      now,
    )
    .run();

  try {
    const aiResp = await env.AI.run(
      "@cf/deepgram/aura-2-en",
      {
        text,
        voice: speaker,
        encoding: "mp3",
      },
      {
        returnRawResponse: true,
      },
    );

    if (!aiResp.ok) {
      let detail = "";
      try {
        detail = await aiResp.text();
      } catch (_) {
        /* noop */
      }
      console.error("TTS upstream error:", aiResp.status, detail);
      return json(
        {
          ok: false,
          error: "TTS provider rejected the request. Please try again.",
        },
        aiResp.status === 400 ? 400 : 502,
      );
    }

    const headers = new Headers(aiResp.headers);
    headers.set("Content-Type", "audio/mpeg");

    return new Response(aiResp.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("TTS error:", err);
    return new Response("TTS failed.", { status: 500 });
  }
}

/* ---------- History handlers ---------- */

async function handleTranscriptionHistory(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, filename, transcript_preview, word_count, model, created_at
     FROM transcriptions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
  )
    .bind(user.id)
    .all();

  return json({ ok: true, items: results || [] });
}

async function handleTTSHistory(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, text_preview, char_count, speaker, model, created_at
     FROM tts_history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
  )
    .bind(user.id)
    .all();

  return json({ ok: true, items: results || [] });
}

/* ---------- Chat handlers ---------- */

async function handleChat(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const message = String(body.message || "").trim();

  if (!message) {
    return json({ ok: false, error: "Message is required." }, 400);
  }

  const now = Date.now();

  // Get recent conversation history for context
  const { results: recentMessages } = await env.DB.prepare(
    `SELECT role, content
     FROM chat_messages
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
  )
    .bind(user.id)
    .all();

  // Reverse to get chronological order
  const history = (recentMessages || []).reverse();

  // Save user message
  await env.DB.prepare(
    `INSERT INTO chat_messages
     (user_id, role, content, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(user.id, "user", message, now)
    .run();

  try {
    // Build messages array with conversation context
    const messages = [
      {
        role: "system",
        content: "You are a helpful AI assistant for the Edge Voice Studio platform. You help users with speech recognition, text-to-speech, and general questions about AI and voice technology.",
      },
      // Include recent conversation history
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      // Add current message
      { role: "user", content: message },
    ];

    // Call GPT-OSS-120B model with conversation context
    const aiResponse = await env.AI.run("@cf/openai/gpt-oss-120b", {
      input: messages,
    });

    // Extract the response from the results array
    const assistantMessage = (aiResponse?.results?.[0]?.output || aiResponse?.response) || "I'm sorry, I couldn't generate a response.";

    // Save assistant response
    await env.DB.prepare(
      `INSERT INTO chat_messages
       (user_id, role, content, model, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(user.id, "assistant", assistantMessage, "@cf/openai/gpt-oss-120b", Date.now())
      .run();

    return json({
      ok: true,
      message: assistantMessage,
    });
  } catch (err) {
    console.error("Chat error:", err);
    return json(
      {
        ok: false,
        error: "Failed to generate response. Please try again.",
      },
      500,
    );
  }
}

async function handleChatHistory(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, role, content, model, created_at
     FROM chat_messages
     WHERE user_id = ?
     ORDER BY created_at ASC
     LIMIT 100`,
  )
    .bind(user.id)
    .all();

  return json({ ok: true, messages: results || [] });
}

async function handleClearChat(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  await env.DB.prepare("DELETE FROM chat_messages WHERE user_id = ?")
    .bind(user.id)
    .run();

  return json({ ok: true });
}

/* ---------- Frontend HTML / CSS / JS ---------- */


function getFrontendHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Edge Voice Studio · Whisper + Aura 2</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0a0f;
      --bg-gradient: radial-gradient(circle at top left, rgba(139, 92, 246, 0.08) 0%, transparent 50%), radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.05) 0%, transparent 50%);
      --card-bg: rgba(17, 17, 27, 0.95);
      --sidebar-bg: rgba(15, 15, 20, 0.98);
      --accent: #8b5cf6;
      --accent-hover: #a78bfa;
      --accent-soft: rgba(139, 92, 246, 0.12);
      --border-subtle: rgba(139, 92, 246, 0.15);
      --border: rgba(139, 92, 246, 0.25);
      --text: #e5e7eb;
      --text-muted: #94a3b8;
      --radius-xl: 20px;
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
      --shadow-soft: 0 20px 60px rgba(0, 0, 0, 0.5);
      --shadow-glow: 0 0 40px rgba(139, 92, 246, 0.15);
    }
    * { 
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      background-image: var(--bg-gradient);
      color: var(--text);
      display: flex;
      overflow: hidden;
    }
    .app-container {
      display: flex;
      width: 100%;
      height: 100vh;
      position: relative;
    }
    
    /* Sidebar Navigation */
    .sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      padding: 20px 0;
      backdrop-filter: blur(20px);
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .sidebar-header {
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 24px;
    }
    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .sidebar-logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, var(--accent), #6366f1);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
    }
    .sidebar-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .nav-menu {
      flex: 1;
      padding: 0 12px;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      margin-bottom: 4px;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }
    .nav-item:hover {
      background: var(--accent-soft);
      color: var(--text);
    }
    .nav-item.active {
      background: var(--accent-soft);
      color: var(--text);
      border-color: var(--border);
      box-shadow: var(--shadow-glow);
    }
    .nav-item-icon {
      font-size: 1.3rem;
      width: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sidebar-footer {
      padding: 20px;
      border-top: 1px solid var(--border-subtle);
      margin-top: auto;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      border: 1px solid var(--border);
      font-size: 0.85rem;
    }
    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .user-details {
      flex: 1;
      overflow: hidden;
    }
    .user-email {
      color: var(--text);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    
    /* Main Content */
    .main-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .page-wrapper {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px;
    }
    .page {
      display: none;
    }
    .page.active {
      display: block;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .page-header {
      margin-bottom: 32px;
    }
    .page-title {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      background: linear-gradient(135deg, var(--text), var(--text-muted));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .page-description {
      font-size: 1rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    
    /* Mobile Menu Toggle */
    .mobile-menu-toggle {
      display: none;
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 101;
      background: var(--sidebar-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px;
      cursor: pointer;
      backdrop-filter: blur(20px);
    }
    .mobile-menu-toggle span {
      font-size: 1.5rem;
    }
    
    @media (max-width: 880px) {
      .sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        transform: translateX(-100%);
      }
      .sidebar.mobile-open {
        transform: translateX(0);
      }
      .mobile-menu-toggle {
        display: block;
      }
      .page-wrapper {
        padding: 80px 20px 32px;
      }
      .page-title {
        font-size: 1.5rem;
      }
    }
    
    /* Cards */
    .card {
      background: var(--card-bg);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-soft);
      padding: 24px;
      backdrop-filter: blur(20px);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    .card:hover {
      border-color: var(--accent);
      box-shadow: var(--shadow-glow), var(--shadow-soft);
    }
    .card-header {
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-description {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .grid {
      display: grid;
      gap: 24px;
    }
    .grid-cols-2 {
      grid-template-columns: repeat(2, 1fr);
    }
    .grid-cols-1 {
      grid-template-columns: 1fr;
    }
    @media (max-width: 880px) {
      .grid-cols-2 { 
        grid-template-columns: 1fr;
      }
    }

    /* Badge and Pills */
    .badge {
      font-size: 0.7rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--accent-soft);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--accent-hover);
      font-weight: 600;
    }
    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 8px var(--accent);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    /* Buttons */
    .btn {
      border-radius: 999px;
      border: none;
      cursor: pointer;
      font: inherit;
      padding: 10px 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: linear-gradient(135deg, var(--accent), #6366f1);
      color: white;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(139, 92, 246, 0.4);
    }
    .btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      box-shadow: none;
    }
    .btn-ghost:hover:not(:disabled) {
      background: var(--accent-soft);
      border-color: var(--accent);
    }
    .btn-small {
      padding: 6px 14px;
      font-size: 0.8rem;
    }
    .btn-icon {
      font-size: 1.1rem;
    }

    /* Forms and Inputs */
    input[type="text"],
    input[type="email"],
    input[type="password"],
    textarea,
    select {
      width: 100%;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: rgba(17, 17, 27, 0.6);
      color: var(--text);
      font-size: 0.9rem;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    input:focus,
    textarea:focus,
    select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    textarea {
      min-height: 120px;
      resize: vertical;
      line-height: 1.5;
    }
    input[type="file"] {
      display: none;
    }
    
    /* Upload Area */
    .upload-area {
      border-radius: var(--radius-lg);
      border: 2px dashed var(--border);
      background: var(--accent-soft);
      padding: 32px 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .upload-area:hover,
    .upload-area.dragover {
      border-color: var(--accent);
      background: rgba(139, 92, 246, 0.2);
      transform: translateY(-2px);
    }
    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .upload-icon {
      font-size: 3rem;
      opacity: 0.8;
    }
    .upload-text h3 {
      font-size: 1.1rem;
      margin-bottom: 8px;
      color: var(--text);
    }
    .upload-text p {
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .file-info {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      background: rgba(17, 17, 27, 0.6);
      border: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 0.875rem;
    }
    .file-name {
      font-weight: 500;
      color: var(--text);
    }
    .file-size {
      color: var(--text-muted);
    }
    
    /* Status and Messages */
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      background: var(--accent-soft);
      border: 1px solid var(--border);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }
    .status-dot.live {
      animation: pulse 2s ease-in-out infinite;
      background: #22c55e;
      box-shadow: 0 0 10px #22c55e;
    }
    .error-message {
      padding: 12px 16px;
      border-radius: var(--radius-md);
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      font-size: 0.875rem;
      display: none;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
    }
    .error-message.show {
      display: flex;
    }
    .error-icon {
      font-size: 1.2rem;
    }

    /* History */
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 16px;
    }
    .history-item {
      padding: 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: rgba(17, 17, 27, 0.6);
      transition: all 0.2s ease;
      cursor: default;
    }
    .history-item:hover {
      border-color: var(--accent);
      background: rgba(17, 17, 27, 0.8);
    }
    .history-item-title {
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--text);
      font-size: 0.9rem;
    }
    .history-item-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--text-muted);
      gap: 12px;
      flex-wrap: wrap;
    }
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .empty-state-icon {
      font-size: 3rem;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    /* Auth Section */
    .auth-form {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .auth-form input {
      min-width: 180px;
      flex: 1;
    }
    
    /* Audio Player */
    audio {
      width: 100%;
      border-radius: var(--radius-md);
      outline: none;
    }
    audio::-webkit-media-controls-panel {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    
    /* Chat Styles */
    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 200px);
      max-height: 700px;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: rgba(17, 17, 27, 0.6);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .chat-message {
      display: flex;
      gap: 12px;
      animation: fadeIn 0.3s ease;
    }
    .chat-message.user {
      flex-direction: row-reverse;
    }
    .chat-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      flex-shrink: 0;
    }
    .chat-message.user .chat-avatar {
      background: linear-gradient(135deg, var(--accent), #6366f1);
    }
    .chat-message.assistant .chat-avatar {
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid var(--border);
    }
    .chat-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      line-height: 1.5;
      font-size: 0.9rem;
    }
    .chat-message.user .chat-bubble {
      background: linear-gradient(135deg, var(--accent), #6366f1);
      color: white;
      border-radius: var(--radius-md) var(--radius-md) 4px var(--radius-md);
    }
    .chat-message.assistant .chat-bubble {
      background: rgba(17, 17, 27, 0.8);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
    }
    .chat-input-container {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }
    .chat-input-wrapper {
      flex: 1;
      position: relative;
    }
    .chat-input {
      width: 100%;
      min-height: 48px;
      max-height: 120px;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: rgba(17, 17, 27, 0.6);
      color: var(--text);
      font-size: 0.9rem;
      resize: vertical;
      font-family: inherit;
    }
    .chat-input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .chat-empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .chat-empty-icon {
      font-size: 4rem;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .chat-loading {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
    }
    .chat-loading-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      animation: chatLoading 1.4s ease-in-out infinite;
    }
    .chat-loading-dot:nth-child(2) {
      animation-delay: 0.2s;
    }
    .chat-loading-dot:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes chatLoading {
      0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1); }
    }
    
    /* Utility Classes */
    .mb-2 { margin-bottom: 8px; }
    .mb-4 { margin-bottom: 16px; }
    .mb-6 { margin-bottom: 24px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mt-6 { margin-top: 24px; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .gap-2 { gap: 8px; }
    .gap-4 { gap: 16px; }
    .text-center { text-align: center; }
    .hidden { display: none; }

  </style>
</head>
<body>
  <!-- Mobile Menu Toggle -->
  <button class="mobile-menu-toggle" id="mobile-menu-btn">
    <span>☰</span>
  </button>

  <div class="app-container">
    <!-- Sidebar Navigation -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="sidebar-logo-icon">🎙️</div>
          <div>
            <div>Voice Studio</div>
            <div class="sidebar-subtitle">Edge AI Platform</div>
          </div>
        </div>
      </div>

      <nav class="nav-menu">
        <a class="nav-item active" data-page="home">
          <span class="nav-item-icon">🏠</span>
          <span>Home</span>
        </a>
        <a class="nav-item" data-page="transcribe">
          <span class="nav-item-icon">🎧</span>
          <span>Speech to Text</span>
        </a>
        <a class="nav-item" data-page="tts">
          <span class="nav-item-icon">🔊</span>
          <span>Text to Speech</span>
        </a>
        <a class="nav-item" data-page="history">
          <span class="nav-item-icon">📜</span>
          <span>History</span>
        </a>
        <a class="nav-item" data-page="chat">
          <span class="nav-item-icon">💬</span>
          <span>AI Chat</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <!-- User info when logged in -->
        <div id="sidebar-user" class="user-info hidden">
          <div class="user-avatar" id="user-avatar">U</div>
          <div class="user-details">
            <span class="user-email" id="user-email-display">user@example.com</span>
          </div>
        </div>
        <!-- Auth buttons when logged out -->
        <div id="sidebar-auth" class="flex flex-col gap-2">
          <button id="sidebar-login-btn" class="btn btn-small">Sign In</button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- Home Page -->
      <div id="page-home" class="page active">
        <div class="page-wrapper">
          <div class="page-header">
            <h1 class="page-title">Welcome to Edge Voice Studio</h1>
            <p class="page-description">
              Power your applications with AI-powered speech recognition and synthesis at the edge.
              Built on Cloudflare Workers AI with Whisper and Deepgram Aura 2.
            </p>
          </div>

          <!-- Auth Section -->
          <div class="card mb-6" id="home-auth-card">
            <div class="card-header">
              <h2 class="card-title">Get Started</h2>
              <p class="card-description">Sign in or create an account to access all features and save your history.</p>
            </div>
            <form id="auth-form" class="auth-form">
              <input id="auth-email" type="email" placeholder="you@example.com" required />
              <input id="auth-password" type="password" placeholder="Password (min 6 chars)" required />
              <button id="signup-btn" type="button" class="btn btn-ghost">Sign Up</button>
              <button id="login-btn" type="button" class="btn">Log In</button>
            </form>
            <div id="error-auth" class="error-message">
              <span class="error-icon">⚠️</span>
              <span id="error-auth-text"></span>
            </div>
          </div>

          <!-- Feature Cards -->
          <div class="grid grid-cols-2">
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">
                  <span>🎧</span>
                  <span>Speech to Text</span>
                </h2>
                <p class="card-description">
                  Convert audio files to text with OpenAI's Whisper model. Supports multiple languages
                  and formats including MP3, WAV, M4A, and OGG.
                </p>
              </div>
              <div class="mt-4">
                <span class="badge">
                  <span class="badge-dot"></span>
                  @cf/openai/whisper
                </span>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h2 class="card-title">
                  <span>🔊</span>
                  <span>Text to Speech</span>
                </h2>
                <p class="card-description">
                  Generate natural-sounding speech from text using Deepgram's Aura 2 model.
                  Choose from multiple voice options for different use cases.
                </p>
              </div>
              <div class="mt-4">
                <span class="badge">
                  <span class="badge-dot"></span>
                  @cf/deepgram/aura-2-en
                </span>
              </div>
            </div>
          </div>

          <!-- Logged-in Dashboard -->
          <div id="home-dashboard" class="hidden">
            <div class="card mt-6">
              <div class="card-header">
                <h2 class="card-title">Quick Stats</h2>
                <p class="card-description">Your recent activity at a glance</p>
              </div>
              <div class="grid grid-cols-2 mt-4">
                <div class="text-center">
                  <div style="font-size: 2rem; font-weight: 700; color: var(--accent);" id="stats-transcriptions">0</div>
                  <div style="color: var(--text-muted); font-size: 0.875rem;">Transcriptions</div>
                </div>
                <div class="text-center">
                  <div style="font-size: 2rem; font-weight: 700; color: var(--accent);" id="stats-tts">0</div>
                  <div style="color: var(--text-muted); font-size: 0.875rem;">Audio Generated</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Speech to Text Page -->
      <div id="page-transcribe" class="page">
        <div class="page-wrapper">
          <div class="page-header">
            <h1 class="page-title">Speech to Text</h1>
            <p class="page-description">
              Upload an audio file to transcribe with OpenAI's Whisper model
            </p>
          </div>

          <div class="grid grid-cols-1" style="gap: 24px;">
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">
                  Upload Audio
                  <span class="badge">
                    <span class="badge-dot"></span>
                    @cf/openai/whisper
                  </span>
                </h2>
                <p class="card-description">Supports MP3, WAV, M4A, OGG, and other audio formats</p>
              </div>

              <form id="upload-form">
                <label id="dropzone" class="upload-area">
                  <div class="upload-content">
                    <div class="upload-icon">🎵</div>
                    <div class="upload-text">
                      <h3>Drag & Drop Audio File</h3>
                      <p>or click to browse your files</p>
                    </div>
                    <button id="browse-btn" type="button" class="btn">
                      <span class="btn-icon">📁</span>
                      <span>Choose File</span>
                    </button>
                  </div>
                  <input id="audio-input" name="audio" type="file" accept="audio/*" />
                </label>

                <div id="file-info" class="file-info hidden">
                  <div class="file-name" id="file-name-display">No file selected</div>
                  <div class="file-size" id="file-size-display">0 KB</div>
                </div>

                <div id="error-transcribe" class="error-message">
                  <span class="error-icon">⚠️</span>
                  <span id="error-transcribe-text"></span>
                </div>

                <div class="flex justify-between items-center mt-4">
                  <div class="status-indicator">
                    <span id="status-dot" class="status-dot"></span>
                    <span id="status-text">Ready to transcribe</span>
                  </div>
                  <button id="submit-btn" type="submit" class="btn">
                    <span class="btn-icon">⚡</span>
                    <span>Transcribe Audio</span>
                  </button>
                </div>
              </form>
            </div>

            <!-- Transcript Output -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Transcript</h2>
                <p class="card-description" id="transcript-info">Your transcription will appear here</p>
              </div>
              <textarea id="transcript" placeholder="Transcription text will appear here after processing..."></textarea>
              <div class="flex justify-between items-center mt-2" style="font-size: 0.875rem; color: var(--text-muted);">
                <span id="word-count">0 words</span>
                <span id="filename-label">No file processed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Text to Speech Page -->
      <div id="page-tts" class="page">
        <div class="page-wrapper">
          <div class="page-header">
            <h1 class="page-title">Text to Speech</h1>
            <p class="page-description">
              Generate natural-sounding speech with Deepgram's Aura 2 model
            </p>
          </div>

          <div class="grid grid-cols-1">
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">
                  Generate Audio
                  <span class="badge">
                    <span class="badge-dot"></span>
                    @cf/deepgram/aura-2-en
                  </span>
                </h2>
                <p class="card-description">Enter text and choose a voice to create audio</p>
              </div>

              <div class="mb-4">
                <textarea id="tts-text" placeholder="Enter the text you want to convert to speech..."></textarea>
              </div>

              <div class="flex justify-between items-center gap-4 flex-wrap mb-4">
                <div class="flex items-center gap-2">
                  <label style="color: var(--text-muted); font-size: 0.9rem;">Voice:</label>
                  <select id="tts-speaker">
                    <option value="luna">Luna (Default)</option>
                    <option value="apollo">Apollo</option>
                    <option value="athena">Athena</option>
                    <option value="orion">Orion</option>
                    <option value="zeus">Zeus</option>
                  </select>
                </div>
                <button id="tts-btn" type="button" class="btn">
                  <span class="btn-icon">🔊</span>
                  <span>Generate Audio</span>
                </button>
              </div>

              <div id="error-tts" class="error-message">
                <span class="error-icon">⚠️</span>
                <span id="error-tts-text"></span>
              </div>

              <div class="mt-4">
                <audio id="tts-audio" controls style="width:100%;"></audio>
                <div id="tts-status" class="mt-2" style="font-size: 0.875rem; color: var(--text-muted);">
                  Ready to generate audio
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- History Page -->
      <div id="page-history" class="page">
        <div class="page-wrapper">
          <div class="page-header">
            <h1 class="page-title">History</h1>
            <p class="page-description" id="history-description">
              View your recent transcriptions and generated audio
            </p>
          </div>

          <div class="grid grid-cols-2">
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">📝 Transcriptions</h2>
                <p class="card-description">Recent speech-to-text conversions</p>
              </div>
              <div id="history-transcriptions" class="history-list">
                <div class="empty-state">
                  <div class="empty-state-icon">🎧</div>
                  <div>No transcriptions yet</div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h2 class="card-title">🔊 Generated Audio</h2>
                <p class="card-description">Recent text-to-speech conversions</p>
              </div>
              <div id="history-tts" class="history-list">
                <div class="empty-state">
                  <div class="empty-state-icon">🔊</div>
                  <div>No audio generated yet</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Chat Page -->
      <div id="page-chat" class="page">
        <div class="page-wrapper">
          <div class="page-header">
            <h1 class="page-title">AI Chat</h1>
            <p class="page-description">
              Chat with our AI assistant powered by GPT-OSS-120B
            </p>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="flex justify-between items-center">
                <div>
                  <h2 class="card-title">
                    💬 Chat Assistant
                    <span class="badge">
                      <span class="badge-dot"></span>
                      GPT-OSS-120B
                    </span>
                  </h2>
                  <p class="card-description">Ask questions about voice AI, transcription, or anything else</p>
                </div>
                <button id="clear-chat-btn" class="btn btn-ghost btn-small">
                  Clear Chat
                </button>
              </div>
            </div>

            <div class="chat-container">
              <div id="chat-messages" class="chat-messages">
                <div class="chat-empty">
                  <div class="chat-empty-icon">💬</div>
                  <div>Start a conversation with the AI assistant</div>
                  <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Ask about speech recognition, text-to-speech, or general AI topics
                  </div>
                </div>
              </div>

              <div id="error-chat" class="error-message">
                <span class="error-icon">⚠️</span>
                <span id="error-chat-text"></span>
              </div>

              <div class="chat-input-container">
                <div class="chat-input-wrapper">
                  <textarea
                    id="chat-input"
                    class="chat-input"
                    placeholder="Type your message here..."
                    rows="1"
                  ></textarea>
                </div>
                <button id="send-chat-btn" class="btn">
                  <span class="btn-icon">📤</span>
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    // ===== State Management =====
    let currentUser = null;
    let currentPage = 'home';
    let lastTtsUrl = null;

    // ===== DOM Elements =====
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    // Auth elements
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const signupBtn = document.getElementById('signup-btn');
    const loginBtn = document.getElementById('login-btn');
    const sidebarUser = document.getElementById('sidebar-user');
    const sidebarAuth = document.getElementById('sidebar-auth');
    const sidebarLoginBtn = document.getElementById('sidebar-login-btn');
    const userAvatar = document.getElementById('user-avatar');
    const userEmailDisplay = document.getElementById('user-email-display');
    const homeAuthCard = document.getElementById('home-auth-card');
    const homeDashboard = document.getElementById('home-dashboard');
    
    // Transcription elements
    const uploadForm = document.getElementById('upload-form');
    const dropzone = document.getElementById('dropzone');
    const audioInput = document.getElementById('audio-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name-display');
    const fileSizeDisplay = document.getElementById('file-size-display');
    const submitBtn = document.getElementById('submit-btn');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const transcript = document.getElementById('transcript');
    const wordCount = document.getElementById('word-count');
    const filenameLabel = document.getElementById('filename-label');
    
    // TTS elements
    const ttsText = document.getElementById('tts-text');
    const ttsSpeaker = document.getElementById('tts-speaker');
    const ttsBtn = document.getElementById('tts-btn');
    const ttsAudio = document.getElementById('tts-audio');
    const ttsStatus = document.getElementById('tts-status');
    
    // History elements
    const historyTranscriptions = document.getElementById('history-transcriptions');
    const historyTts = document.getElementById('history-tts');
    const historyDescription = document.getElementById('history-description');
    
    // Error elements
    const errorAuth = document.getElementById('error-auth');
    const errorAuthText = document.getElementById('error-auth-text');
    const errorTranscribe = document.getElementById('error-transcribe');
    const errorTranscribeText = document.getElementById('error-transcribe-text');
    const errorTts = document.getElementById('error-tts');
    const errorTtsText = document.getElementById('error-tts-text');
    
    // Chat elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const errorChat = document.getElementById('error-chat');
    const errorChatText = document.getElementById('error-chat-text');

    // ===== Navigation =====
    function navigateTo(pageName) {
      currentPage = pageName;
      
      // Update pages
      pages.forEach(page => {
        if (page.id === 'page-' + pageName) {
          page.classList.add('active');
        } else {
          page.classList.remove('active');
        }
      });
      
      // Update nav items
      navItems.forEach(item => {
        if (item.dataset.page === pageName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      
      // Close mobile menu
      sidebar.classList.remove('mobile-open');
      
      // Load page-specific data
      if (pageName === 'history' && currentUser) {
        refreshHistory();
      }
      if (pageName === 'chat' && currentUser) {
        loadChatHistory();
      }
    }

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(item.dataset.page);
      });
    });

    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 880 && 
          !sidebar.contains(e.target) && 
          !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });

    // ===== Utility Functions =====
    function humanFileSize(bytes) {
      if (!bytes && bytes !== 0) return "";
      const units = ["B", "KB", "MB", "GB"];
      let i = 0;
      let size = bytes;
      while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
      }
      return size.toFixed(size >= 10 || i === 0 ? 0 : 1) + " " + units[i];
    }

    function showError(errorEl, textEl, msg) {
      textEl.textContent = msg;
      errorEl.classList.add('show');
    }

    function clearError(errorEl) {
      errorEl.classList.remove('show');
    }

    function formatDateTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    }

    // ===== Auth Functions =====
    function setAuthState(user) {
      currentUser = user;
      
      if (user) {
        // Update sidebar
        sidebarUser.classList.remove('hidden');
        sidebarAuth.classList.add('hidden');
        const initial = user.email.charAt(0).toUpperCase();
        userAvatar.textContent = initial;
        userEmailDisplay.textContent = user.email;
        
        // Update home page
        homeAuthCard.classList.add('hidden');
        homeDashboard.classList.remove('hidden');
        
        // Update history description
        historyDescription.textContent = "Your recent transcriptions and generated audio";
        
        // Add logout button to sidebar
        if (!document.getElementById('sidebar-logout-btn')) {
          const logoutBtn = document.createElement('button');
          logoutBtn.id = 'sidebar-logout-btn';
          logoutBtn.className = 'btn btn-ghost btn-small mt-2';
          logoutBtn.textContent = 'Log Out';
          logoutBtn.addEventListener('click', handleLogout);
          sidebarUser.parentElement.appendChild(logoutBtn);
        }
        
        refreshHistory();
      } else {
        // Update sidebar
        sidebarUser.classList.add('hidden');
        sidebarAuth.classList.remove('hidden');
        
        // Update home page
        homeAuthCard.classList.remove('hidden');
        homeDashboard.classList.add('hidden');
        
        // Update history description
        historyDescription.textContent = "Sign in to view your history";
        
        // Remove logout button
        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) logoutBtn.remove();
        
        clearHistory();
      }
    }

    async function refreshSession() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setAuthState(null);
          return;
        }
        const data = await res.json();
        if (data && data.ok && data.user) {
          setAuthState(data.user);
        } else {
          setAuthState(null);
        }
      } catch (err) {
        console.error("Session check failed:", err);
        setAuthState(null);
      }
    }

    async function authAction(mode) {
      clearError(errorAuth);
      const email = authEmail.value.trim();
      const password = authPassword.value;

      if (!email || !password) {
        showError(errorAuth, errorAuthText, "Email and password are required.");
        return;
      }

      try {
        const res = await fetch("/api/" + (mode === "signup" ? "signup" : "login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showError(errorAuth, errorAuthText, data.error || "Authentication failed.");
          return;
        }
        authPassword.value = "";
        authEmail.value = "";
        setAuthState(data.user);
      } catch (err) {
        console.error("Auth error:", err);
        showError(errorAuth, errorAuthText, "Unable to reach auth endpoint.");
      }
    }

    async function handleLogout() {
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        setAuthState(null);
      }
    }

    authForm.addEventListener("submit", (e) => e.preventDefault());
    signupBtn.addEventListener("click", () => authAction("signup"));
    loginBtn.addEventListener("click", () => authAction("login"));
    sidebarLoginBtn.addEventListener("click", () => {
      navigateTo('home');
    });

    // ===== Transcription Functions =====
    browseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      audioInput.click();
    });

    audioInput.addEventListener("change", () => {
      const file = audioInput.files[0];
      if (!file) {
        fileInfo.classList.add('hidden');
        filenameLabel.textContent = "No file processed";
        return;
      }
      fileNameDisplay.textContent = file.name;
      fileSizeDisplay.textContent = humanFileSize(file.size);
      fileInfo.classList.remove('hidden');
      filenameLabel.textContent = file.name;
      clearError(errorTranscribe);
    });

    ["dragenter","dragover"].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });
    
    ["dragleave","drop"].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });
    
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        audioInput.files = e.dataTransfer.files;
        const evt = new Event("change");
        audioInput.dispatchEvent(evt);
      } else if (file) {
        showError(errorTranscribe, errorTranscribeText, "Please drop an audio file (mp3, wav, m4a…).");
      }
    });

    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError(errorTranscribe);

      if (!currentUser) {
        showError(errorTranscribe, errorTranscribeText, "Please sign in before transcribing audio.");
        return;
      }

      const file = audioInput.files[0];
      if (!file) {
        showError(errorTranscribe, errorTranscribeText, "Choose an audio file first.");
        return;
      }

      const formData = new FormData();
      formData.append("audio", file);

      submitBtn.disabled = true;
      statusDot.classList.add("live");
      statusText.textContent = "Transcribing with Whisper…";

      try {
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const isJson = response.headers.get("content-type")?.includes("application/json");
        const data = isJson ? await response.json() : null;

        if (response.status === 401) {
          showError(errorTranscribe, errorTranscribeText, "Please sign in before transcribing audio.");
          return;
        }

        if (!response.ok || !data || data.ok === false) {
          const errMsg = (data && (data.error || data.message)) || "Transcription failed.";
          showError(errorTranscribe, errorTranscribeText, errMsg);
          return;
        }

        transcript.value = data.transcription || "";
        const wc = data.word_count ?? (data.transcription ? data.transcription.split(/\s+/).filter(Boolean).length : 0);
        wordCount.textContent = wc + " word" + (wc === 1 ? "" : "s");
        filenameLabel.textContent = data.filename || file.name;
        statusText.textContent = "Transcription complete!";

        if (currentUser) {
          refreshHistory();
        }
      } catch (err) {
        console.error(err);
        showError(errorTranscribe, errorTranscribeText, "Unexpected error while calling the Worker.");
      } finally {
        submitBtn.disabled = false;
        statusDot.classList.remove("live");
      }
    });

    // ===== TTS Functions =====
    ttsBtn.addEventListener("click", async () => {
      clearError(errorTts);
      
      if (!currentUser) {
        showError(errorTts, errorTtsText, "Please sign in before generating audio.");
        return;
      }

      const text = ttsText.value.trim();
      if (!text) {
        showError(errorTts, errorTtsText, "Enter some text to synthesize.");
        return;
      }

      ttsBtn.disabled = true;
      ttsStatus.textContent = "Generating audio with Aura 2…";

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            speaker: ttsSpeaker.value,
            voice: ttsSpeaker.value,
          }),
        });

        if (res.status === 401) {
          showError(errorTts, errorTtsText, "Please sign in before generating audio.");
          return;
        }
        if (!res.ok) {
          showError(errorTts, errorTtsText, "TTS request failed.");
          return;
        }

        const blob = await res.blob();
        if (lastTtsUrl) {
          URL.revokeObjectURL(lastTtsUrl);
        }
        const url = URL.createObjectURL(blob);
        lastTtsUrl = url;
        ttsAudio.src = url;
        try {
          await ttsAudio.play();
        } catch (_) {}
        ttsStatus.textContent = "Audio generated – hit play or download from the player.";
        
        if (currentUser) {
          refreshHistory();
        }
      } catch (err) {
        console.error("TTS error:", err);
        showError(errorTts, errorTtsText, "Unexpected error while calling TTS.");
      } finally {
        ttsBtn.disabled = false;
      }
    });

    // ===== Chat Functions =====
    function renderChatMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message ' + role;
      
      const avatar = document.createElement('div');
      avatar.className = 'chat-avatar';
      avatar.textContent = role === 'user' ? (currentUser ? currentUser.email.charAt(0).toUpperCase() : 'U') : '🤖';
      
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = content;
      
      messageDiv.appendChild(avatar);
      messageDiv.appendChild(bubble);
      
      return messageDiv;
    }

    function clearChatEmpty() {
      const emptyState = chatMessages.querySelector('.chat-empty');
      if (emptyState) {
        emptyState.remove();
      }
    }

    function showChatLoading() {
      clearChatEmpty();
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'chat-message assistant';
      loadingDiv.id = 'chat-loading';
      
      const avatar = document.createElement('div');
      avatar.className = 'chat-avatar';
      avatar.textContent = '🤖';
      
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      
      const loading = document.createElement('div');
      loading.className = 'chat-loading';
      loading.innerHTML = '<div class="chat-loading-dot"></div><div class="chat-loading-dot"></div><div class="chat-loading-dot"></div>';
      
      bubble.appendChild(loading);
      loadingDiv.appendChild(avatar);
      loadingDiv.appendChild(bubble);
      
      chatMessages.appendChild(loadingDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeChatLoading() {
      const loading = document.getElementById('chat-loading');
      if (loading) {
        loading.remove();
      }
    }

    async function sendChatMessage() {
      clearError(errorChat);
      
      if (!currentUser) {
        showError(errorChat, errorChatText, "Please sign in to use the chat.");
        return;
      }

      const message = chatInput.value.trim();
      if (!message) {
        showError(errorChat, errorChatText, "Please enter a message.");
        return;
      }

      // Clear input and disable button
      chatInput.value = '';
      sendChatBtn.disabled = true;
      chatInput.disabled = true;

      // Add user message to UI
      clearChatEmpty();
      const userMessage = renderChatMessage('user', message);
      chatMessages.appendChild(userMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Show loading indicator
      showChatLoading();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });

        const data = await res.json();

        removeChatLoading();

        if (res.status === 401) {
          showError(errorChat, errorChatText, "Please sign in to use the chat.");
          return;
        }

        if (!res.ok || !data.ok) {
          showError(errorChat, errorChatText, data.error || "Failed to get response.");
          return;
        }

        // Add assistant message to UI
        const assistantMessage = renderChatMessage('assistant', data.message);
        chatMessages.appendChild(assistantMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;

      } catch (err) {
        console.error("Chat error:", err);
        removeChatLoading();
        showError(errorChat, errorChatText, "Unexpected error while sending message.");
      } finally {
        sendChatBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
      }
    }

    async function loadChatHistory() {
      if (!currentUser) return;

      try {
        const res = await fetch("/api/chat/history");
        if (!res.ok) return;

        const data = await res.json();
        if (!data.ok || !data.messages || data.messages.length === 0) return;

        // Clear empty state
        clearChatEmpty();

        // Render messages
        data.messages.forEach(msg => {
          const messageDiv = renderChatMessage(msg.role, msg.content);
          chatMessages.appendChild(messageDiv);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    }

    async function clearChat() {
      if (!currentUser) return;
      
      if (!confirm('Are you sure you want to clear the chat history?')) {
        return;
      }

      try {
        const res = await fetch("/api/chat/clear", {
          method: "POST",
        });

        if (res.ok) {
          chatMessages.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">💬</div><div>Start a conversation with the AI assistant</div><div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">Ask about speech recognition, text-to-speech, or general AI topics</div></div>';
        }
      } catch (err) {
        console.error("Failed to clear chat:", err);
      }
    }

    sendChatBtn.addEventListener('click', sendChatMessage);
    clearChatBtn.addEventListener('click', clearChat);
    
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // ===== History Functions =====
    function clearHistory() {
      historyTranscriptions.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎧</div><div>No transcriptions yet</div></div>';
      historyTts.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔊</div><div>No audio generated yet</div></div>';
    }

    function renderHistoryList(listEl, items, type) {
      if (!items || !items.length) {
        if (type === "transcriptions") {
          listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎧</div><div>No transcriptions yet</div></div>';
        } else {
          listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔊</div><div>No audio generated yet</div></div>';
        }
        return;
      }
      
      let html = '';
      for (const item of items) {
        let title, meta;
        if (type === "transcriptions") {
          title = item.filename || "(no filename)";
          const wc = item.word_count || 0;
          meta = '<span>' + wc + ' words</span><span>' + formatDateTime(item.created_at) + '</span>';
        } else {
          title = (item.text_preview || "").slice(0, 60) + (item.text_preview && item.text_preview.length > 60 ? "…" : "");
          const chars = item.char_count || 0;
          meta = '<span>' + chars + ' chars · ' + (item.speaker || "voice") + '</span><span>' + formatDateTime(item.created_at) + '</span>';
        }
        
        html += '<div class="history-item"><div class="history-item-title">' + title + '</div><div class="history-item-meta">' + meta + '</div></div>';
      }
      listEl.innerHTML = html;
    }

    async function refreshHistory() {
      if (!currentUser) return;
      try {
        const [sttRes, ttsRes] = await Promise.all([
          fetch("/api/history/transcriptions"),
          fetch("/api/history/tts"),
        ]);

        if (sttRes.status === 401 || ttsRes.status === 401) {
          setAuthState(null);
          return;
        }

        const sttData = await sttRes.json();
        const ttsData = await ttsRes.json();

        if (sttData.ok) {
          renderHistoryList(historyTranscriptions, sttData.items, "transcriptions");
          // Update stats as well
          const count = sttData.items ? sttData.items.length : 0;
          const statsEl = document.getElementById('stats-transcriptions');
          if (statsEl) statsEl.textContent = count;
        }
        if (ttsData.ok) {
          renderHistoryList(historyTts, ttsData.items, "tts");
          // Update stats as well
          const count = ttsData.items ? ttsData.items.length : 0;
          const statsEl = document.getElementById('stats-tts');
          if (statsEl) statsEl.textContent = count;
        }
      } catch (err) {
        console.error("History load failed:", err);
      }
    }

    // ===== Initialize =====
    refreshSession();
  </script>
</body>
</html>`;
}

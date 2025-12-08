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
      --bg: radial-gradient(circle at top, #1f2937 0, #020617 55%, #000 100%);
      --card-bg: rgba(15, 23, 42, 0.9);
      --accent: #38bdf8;
      --accent-soft: rgba(56, 189, 248, 0.15);
      --border-subtle: rgba(148,163,184,0.35);
      --text: #e5e7eb;
      --muted: #9ca3af;
      --radius-xl: 24px;
      --shadow-soft: 0 18px 60px rgba(15, 23, 42, 0.75);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 32px 16px;
    }
    .app-shell {
      max-width: 1100px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    @media (max-width: 880px) {
      body { padding-top: 20px; padding-bottom: 20px; }
    }
    .card {
      background: var(--card-bg);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-soft);
      padding: 22px 22px 20px;
      backdrop-filter: blur(22px);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: -120px;
      background:
        radial-gradient(circle at 0 0, rgba(56,189,248,0.16), transparent 60%),
        radial-gradient(circle at 100% 100%, rgba(99,102,241,0.16), transparent 55%);
      opacity: 0.65;
      mix-blend-mode: screen;
      pointer-events: none;
    }
    .card-inner {
      position: relative;
      z-index: 1;
    }
    .two-column {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: 24px;
    }
    @media (max-width: 880px) {
      .two-column { grid-template-columns: minmax(0, 1fr); }
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .title-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .title-main h1 {
      margin: 0;
      font-size: 1.2rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }
    .badge {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.5);
      background: rgba(15,23,42,0.85);
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 5px rgba(56,189,248,0.35);
    }
    .title-main p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--muted);
    }

    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .pill {
      font-size: 0.72rem;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.35);
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .pill strong {
      font-size: 0.76rem;
      color: var(--text);
    }

    .upload-area {
      margin-top: 6px;
      border-radius: 18px;
      border: 1px dashed rgba(148,163,184,0.6);
      background: radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 55%);
      padding: 18px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: border-color 160ms ease, background-color 160ms ease, transform 90ms ease;
    }
    .upload-area.dragover {
      border-color: var(--accent);
      background-color: rgba(15,23,42,0.96);
      transform: translateY(-1px);
    }
    .upload-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .upload-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .upload-main h2 {
      margin: 0;
      font-size: 0.96rem;
    }
    .upload-main p {
      margin: 0;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .upload-cta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .btn {
      border-radius: 999px;
      border: none;
      cursor: pointer;
      font: inherit;
      padding: 8px 16px;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #38bdf8, #6366f1);
      color: #0b1120;
      font-size: 0.86rem;
      font-weight: 600;
      box-shadow: 0 12px 30px rgba(15,23,42,0.85);
      transition: transform 90ms ease, box-shadow 90ms ease, filter 90ms ease, opacity 90ms ease;
      white-space: nowrap;
    }
    .btn span.icon {
      font-size: 1.05rem;
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: wait;
      box-shadow: none;
      transform: none;
    }
    .btn:not(:disabled):hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
      box-shadow: 0 16px 40px rgba(15,23,42,0.9);
    }
    .btn-ghost {
      background: transparent;
      border: 1px solid rgba(148,163,184,0.5);
      color: var(--text);
      box-shadow: none;
    }
    .btn-small {
      padding: 5px 12px;
      font-size: 0.78rem;
    }

    .file-meta {
      font-size: 0.76rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.45);
      padding: 6px 10px;
      background: rgba(15,23,42,0.9);
    }
    .file-meta strong {
      color: var(--text);
    }

    .hint-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      gap: 10px;
      flex-wrap: wrap;
    }
    .hint {
      font-size: 0.75rem;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hint-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.7);
      background: rgba(15,23,42,0.2);
    }

    .status-row {
      margin-top: 12px;
      font-size: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      flex-wrap: wrap;
    }
    .status-row .status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(56,189,248,0.3);
      box-shadow: 0 0 0 4px rgba(56,189,248,0.2);
    }
    .status-dot.live {
      background: #22c55e;
      box-shadow: 0 0 0 4px rgba(34,197,94,0.35);
    }
    .status-row .timer {
      font-variant-numeric: tabular-nums;
      opacity: 0.9;
    }

    .side-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .side-panel-header h2 {
      margin: 0;
      font-size: 0.98rem;
    }
    .side-panel-header span {
      font-size: 0.76rem;
      color: var(--muted);
    }

    .transcript-output {
      margin-top: 6px;
      border-radius: 16px;
      border: 1px solid rgba(148,163,184,0.5);
      background: rgba(15,23,42,0.95);
      padding: 10px 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 170px;
    }
    .transcript-output textarea {
      width: 100%;
      min-height: 130px;
      max-height: 260px;
      resize: vertical;
      border-radius: 10px;
      border: none;
      padding: 8px 9px;
      font: 0.86rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: radial-gradient(circle at top left, rgba(15,23,42,1), rgba(15,23,42,0.98));
      color: var(--text);
      outline: 1px solid rgba(30,64,175,0.9);
      box-shadow: inset 0 0 0 1px rgba(15,23,42,0.95);
    }
    .transcript-output textarea::placeholder {
      color: #6b7280;
    }
    .meta-row {
      font-size: 0.75rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .meta-row strong {
      color: var(--text);
    }

    .pill-mini {
      font-size: 0.74rem;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.45);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .pill-mini .dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: rgba(56,189,248,0.6);
    }

    .vtt-block {
      margin-top: 8px;
      border-radius: 10px;
      border: 1px dashed rgba(55,65,81,0.9);
      padding: 8px 8px 7px;
      font-size: 0.73rem;
      background: rgba(15,23,42,0.9);
    }
    .vtt-block summary {
      cursor: pointer;
      color: var(--muted);
      outline: none;
    }
    .vtt-block pre {
      margin: 6px 0 0;
      max-height: 140px;
      overflow: auto;
      font: 0.74rem/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      color: #e5e7eb;
    }

    .error-banner {
      border-radius: 999px;
      border: 1px solid rgba(248,113,113,0.85);
      background: radial-gradient(circle at top left, rgba(248,113,113,0.14), rgba(15,23,42,0.96));
      padding: 6px 9px;
      margin-top: 10px;
      font-size: 0.75rem;
      color: #fecaca;
      display: none;
      align-items: center;
      gap: 7px;
    }
    .error-icon {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid #fecaca;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
    }

    input[type="file"] {
      display: none;
    }

    /* Auth section */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand-title h1 {
      margin: 0;
      font-size: 1.1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .brand-title p {
      margin: 2px 0 0;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .auth {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
    }
    .auth-status {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .auth-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }
    .auth-form {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
      align-items: center;
    }
    .auth-form input {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.6);
      background: rgba(15,23,42,0.95);
      color: var(--text);
      font-size: 0.8rem;
      min-width: 150px;
    }

    /* TTS layout */
    .tts-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
      gap: 18px;
    }
    @media (max-width: 880px) {
      .tts-layout { grid-template-columns: minmax(0, 1fr); }
    }
    .tts-input textarea {
      width: 100%;
      min-height: 130px;
      resize: vertical;
      border-radius: 14px;
      border: 1px solid rgba(148,163,184,0.5);
      padding: 10px 10px;
      font-size: 0.86rem;
      background: rgba(15,23,42,0.9);
      color: var(--text);
    }
    .tts-input textarea::placeholder {
      color: #6b7280;
    }
    .tts-controls {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .tts-controls label {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tts-controls select {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.6);
      background: rgba(15,23,42,0.95);
      color: var(--text);
      font-size: 0.8rem;
    }
    .tts-output {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* History */
    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
    }
    .history-header h2 {
      margin: 0;
      font-size: 0.98rem;
    }
    .history-header span {
      font-size: 0.75rem;
      color: var(--muted);
    }
    .history-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 10px;
    }
    @media (max-width: 880px) {
      .history-grid { grid-template-columns: minmax(0, 1fr); }
    }
    .history-list {
      list-style: none;
      padding: 0;
      margin: 8px 0 0;
      font-size: 0.78rem;
      color: var(--muted);
    }
    .history-item {
      padding: 7px 9px;
      border-radius: 10px;
      border: 1px solid rgba(55,65,81,0.9);
      background: rgba(15,23,42,0.92);
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 6px;
    }
    .history-item-title {
      color: var(--text);
      font-size: 0.8rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .history-item-meta {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    .history-item-meta span {
      opacity: 0.8;
    }

  </style>
</head>
<body>
  <main class="app-shell">
    <!-- Top: brand + account -->
    <section class="card">
      <div class="card-inner top-bar">
        <div class="brand-title">
          <h1>Edge Voice Studio</h1>
          <p>Transcribe with Whisper, speak with Deepgram Aura 2 – all at the edge.</p>
        </div>
        <div class="auth">
          <div id="auth-logged" style="display:none">
            <div class="auth-status">
              Signed in as <strong id="auth-email-label"></strong>
            </div>
            <div class="auth-row">
              <button id="logout-btn" type="button" class="btn btn-ghost btn-small">Log out</button>
            </div>
          </div>
          <form id="auth-form" class="auth-form">
            <div id="auth-anon">
              <input id="auth-email" type="email" placeholder="you@example.com" required />
              <input id="auth-password" type="password" placeholder="Password (min 6 chars)" required />
              <button id="signup-btn" type="button" class="btn btn-ghost btn-small">Sign up</button>
              <button id="login-btn" type="button" class="btn btn-small">Log in</button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <!-- Middle: STT + transcript -->
    <section class="two-column">
      <section class="card">
        <div class="card-inner">
          <div class="title-row">
            <div class="title-main">
              <h1>
                <span>Whisper Transcriber</span>
                <span class="badge">
                  <span class="badge-dot"></span>
                  @cf/openai/whisper
                </span>
              </h1>
              <p>Drop an audio file, let Whisper handle transcription – history saved to your account.</p>
            </div>
          </div>

          <div class="pill-row">
            <div class="pill"><strong>Multilingual ASR</strong><span>Powered by Workers AI</span></div>
            <div class="pill"><strong>Edge-native</strong><span>No extra backend</span></div>
          </div>

          <form id="upload-form">
            <label id="dropzone" class="upload-area">
              <div class="upload-header">
                <div class="upload-main">
                  <h2>Upload or drag &amp; drop audio</h2>
                  <p>MP3, WAV, M4A, OGG… up to your Worker limits.</p>
                </div>
                <div class="upload-cta">
                  <button id="browse-btn" type="button" class="btn">
                    <span class="icon">🎧</span>
                    <span>Choose audio</span>
                  </button>
                </div>
              </div>
              <input id="audio-input" name="audio" type="file" accept="audio/*" />
              <div id="file-meta" class="file-meta" style="display:none">
                <span><strong id="file-name"></strong></span>
                <span id="file-size"></span>
              </div>
            </label>

            <div class="hint-row">
              <div class="hint">
                <span class="hint-dot"></span>
                <span>Sign in above to save transcriptions per account.</span>
              </div>
              <div class="hint">
                <span>We call <code>env.AI.run("@cf/openai/whisper")</code> from this Worker.</span>
              </div>
            </div>

            <div class="status-row">
              <div class="status">
                <span id="status-dot" class="status-dot"></span>
                <span id="status-text">Idle – ready when you are.</span>
              </div>
              <div class="timer">
                Last run: <span id="last-run">–</span>
              </div>
            </div>

            <div id="error-banner" class="error-banner">
              <span class="error-icon">!</span>
              <span id="error-text"></span>
            </div>

            <div style="margin-top:14px; display:flex; justify-content:flex-end;">
              <button id="submit-btn" type="submit" class="btn">
                <span class="icon">⚡️</span>
                <span>Transcribe with Whisper</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      <section class="card side-panel">
        <div class="card-inner">
          <div class="side-panel-header">
            <h2>Transcript</h2>
            <span id="model-label">@cf/openai/whisper</span>
          </div>
          <div class="transcript-output">
            <textarea id="transcript" placeholder="Your transcription will appear here…"></textarea>
            <div class="meta-row">
              <div>
                <span class="pill-mini">
                  <span class="dot"></span>
                  <span id="word-count-label">0 words</span>
                </span>
              </div>
              <div id="filename-label">No file yet.</div>
            </div>
          </div>

          <div id="vtt-block" class="vtt-block" style="display:none">
            <details>
              <summary>Show WebVTT captions from Whisper</summary>
              <pre id="vtt-text"></pre>
            </details>
          </div>
        </div>
      </section>
    </section>

    <!-- Text to Speech -->
    <section class="card">
      <div class="card-inner">
        <div class="title-row">
          <div class="title-main">
            <h1>
              <span>Text to Speech</span>
              <span class="badge">
                <span class="badge-dot"></span>
                @cf/deepgram/aura-2-en
              </span>
            </h1>
            <p>Turn text into expressive audio with Deepgram Aura 2 – playback inline and save to history.</p>
          </div>
        </div>

        <div class="tts-layout">
          <div class="tts-input">
            <textarea id="tts-text" placeholder="Paste any text here and hit “Generate audio” to hear it read aloud…"></textarea>
            <div class="tts-controls">
              <label>
                Voice
                <select id="tts-speaker">
                  <option value="luna">luna (default)</option>
                  <option value="apollo">apollo</option>
                  <option value="athena">athena</option>
                  <option value="orion">orion</option>
                  <option value="zeus">zeus</option>
                </select>
              </label>
              <button id="tts-btn" type="button" class="btn">
                <span class="icon">🔊</span>
                <span>Generate audio</span>
              </button>
            </div>
          </div>
          <div class="tts-output">
            <audio id="tts-audio" controls style="width:100%;"></audio>
            <div id="tts-status" class="hint">Ready – sign in to keep a history of your audio.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- History -->
    <section class="card">
      <div class="card-inner">
        <div class="history-header">
          <h2>History</h2>
          <span id="history-hint">Sign in to see your recent transcriptions and audio.</span>
        </div>
        <div class="history-grid">
          <div>
            <strong style="font-size:0.8rem;">Transcriptions</strong>
            <ul id="history-transcriptions" class="history-list"></ul>
          </div>
          <div>
            <strong style="font-size:0.8rem;">Text to Speech</strong>
            <ul id="history-tts" class="history-list"></ul>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("audio-input");
    const browseBtn = document.getElementById("browse-btn");
    const fileMeta = document.getElementById("file-meta");
    const fileNameEl = document.getElementById("file-name");
    const fileSizeEl = document.getElementById("file-size");
    const form = document.getElementById("upload-form");
    const submitBtn = document.getElementById("submit-btn");
    const statusText = document.getElementById("status-text");
    const statusDot = document.getElementById("status-dot");
    const lastRun = document.getElementById("last-run");
    const transcript = document.getElementById("transcript");
    const wordCountLabel = document.getElementById("word-count-label");
    const filenameLabel = document.getElementById("filename-label");
    const errorBanner = document.getElementById("error-banner");
    const errorText = document.getElementById("error-text");
    const vttBlock = document.getElementById("vtt-block");
    const vttText = document.getElementById("vtt-text");

    const authForm = document.getElementById("auth-form");
    const authAnon = document.getElementById("auth-anon");
    const authLogged = document.getElementById("auth-logged");
    const authEmailInput = document.getElementById("auth-email");
    const authPasswordInput = document.getElementById("auth-password");
    const authEmailLabel = document.getElementById("auth-email-label");
    const signupBtn = document.getElementById("signup-btn");
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");

    const ttsText = document.getElementById("tts-text");
    const ttsSpeaker = document.getElementById("tts-speaker");
    const ttsBtn = document.getElementById("tts-btn");
    const ttsAudio = document.getElementById("tts-audio");
    const ttsStatus = document.getElementById("tts-status");

    const historyHint = document.getElementById("history-hint");
    const historyTranscriptions = document.getElementById("history-transcriptions");
    const historyTts = document.getElementById("history-tts");

    let currentUser = null;
    let lastTtsUrl = null;

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

    function showError(msg) {
      errorText.textContent = msg;
      errorBanner.style.display = "flex";
    }

    function clearError() {
      errorBanner.style.display = "none";
      errorText.textContent = "";
    }

    function setBusy(isBusy) {
      submitBtn.disabled = isBusy;
      browseBtn.disabled = isBusy;
      statusDot.classList.toggle("live", isBusy);
      if (isBusy) {
        statusText.textContent = "Transcribing with Whisper…";
      } else {
        statusText.textContent = "Idle – ready when you are.";
      }
    }

    function formatDateTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    }

    function setAuthState(user) {
      currentUser = user;
      if (user) {
        authLogged.style.display = "flex";
        authAnon.style.display = "none";
        authEmailLabel.textContent = user.email;
        historyHint.textContent = "Showing your recent transcriptions and audio.";
        refreshHistory();
      } else {
        authLogged.style.display = "none";
        authAnon.style.display = "flex";
        authEmailLabel.textContent = "";
        historyHint.textContent = "Sign in to see your recent transcriptions and audio.";
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
      clearError();
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value;

      if (!email || !password) {
        showError("Email and password are required.");
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
          showError(data.error || "Authentication failed.");
          return;
        }
        authPasswordInput.value = "";
        setAuthState(data.user);
      } catch (err) {
        console.error("Auth error:", err);
        showError("Unable to reach auth endpoint.");
      }
    }

    async function handleLogout() {
      clearError();
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
    logoutBtn.addEventListener("click", handleLogout);

    browseBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) {
        fileMeta.style.display = "none";
        filenameLabel.textContent = "No file yet.";
        return;
      }
      fileNameEl.textContent = file.name;
      fileSizeEl.textContent = humanFileSize(file.size);
      fileMeta.style.display = "flex";
      filenameLabel.textContent = file.name;
      clearError();
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
        fileInput.files = e.dataTransfer.files;
        const evt = new Event("change");
        fileInput.dispatchEvent(evt);
      } else if (file) {
        showError("Please drop an audio file (mp3, wav, m4a…).");
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();

      const file = fileInput.files[0];
      if (!file) {
        showError("Choose an audio file first.");
        return;
      }

      const formData = new FormData();
      formData.append("audio", file);

      setBusy(true);
      vttBlock.style.display = "none";
      vttText.textContent = "";

      try {
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const isJson = response.headers.get("content-type")?.includes("application/json");
        const data = isJson ? await response.json() : null;

        if (response.status === 401) {
          showError("Please sign in before transcribing audio.");
          return;
        }

        if (!response.ok || !data || data.ok === false) {
          const errMsg = (data && (data.error || data.message)) || "Transcription failed.";
          showError(errMsg);
          return;
        }

        transcript.value = data.transcription || "";
        const wc = data.word_count ?? (data.transcription ? data.transcription.split(/\s+/).filter(Boolean).length : 0);
        wordCountLabel.textContent = wc + " word" + (wc === 1 ? "" : "s");
        filenameLabel.textContent = data.filename || file.name;

        if (data.vtt) {
          vttBlock.style.display = "block";
          vttText.textContent = data.vtt;
        } else {
          vttBlock.style.display = "none";
        }

        const now = new Date();
        lastRun.textContent = now.toLocaleTimeString();
        statusText.textContent = "Transcription complete.";

        if (currentUser) {
          refreshHistory();
        }
      } catch (err) {
        console.error(err);
        showError("Unexpected error while calling the Worker. Check the console/logs.");
      } finally {
        setBusy(false);
      }
    });

    ttsBtn.addEventListener("click", async () => {
      clearError();
      if (!currentUser) {
        showError("Please sign in before generating audio.");
        return;
      }

      const text = ttsText.value.trim();
      if (!text) {
        showError("Enter some text to synthesize.");
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
          showError("Please sign in before generating audio.");
          return;
        }
        if (!res.ok) {
          showError("TTS request failed.");
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
        } catch (_) {
        }
        ttsStatus.textContent = "Audio generated – hit play or download from the player.";
        if (currentUser) {
          refreshHistory();
        }
      } catch (err) {
        console.error("TTS error:", err);
        showError("Unexpected error while calling TTS.");
      } finally {
        ttsBtn.disabled = false;
      }
    });

    function clearHistory() {
      historyTranscriptions.innerHTML = "";
      historyTts.innerHTML = "";
    }

    function renderHistoryList(listEl, items, type) {
      listEl.innerHTML = "";
      if (!items || !items.length) {
        const li = document.createElement("li");
        li.textContent = "No recent " + type + " yet.";
        listEl.appendChild(li);
        return;
      }
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "history-item";

        const title = document.createElement("div");
        title.className = "history-item-title";

        if (type === "transcriptions") {
          const name = item.filename || "(no filename)";
          title.textContent = name;
        } else {
          title.textContent = (item.text_preview || "").slice(0, 60) + (item.text_preview && item.text_preview.length > 60 ? "…" : "");
        }

        const meta = document.createElement("div");
        meta.className = "history-item-meta";

        const left = document.createElement("span");
        if (type === "transcriptions") {
          const wc = item.word_count || 0;
          left.textContent = wc + " words";
        } else {
          const chars = item.char_count || 0;
          left.textContent = chars + " chars · " + (item.speaker || "voice");
        }

        const right = document.createElement("span");
        right.textContent = formatDateTime(item.created_at);

        meta.appendChild(left);
        meta.appendChild(right);

        li.appendChild(title);
        li.appendChild(meta);
        listEl.appendChild(li);
      }
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
        }
        if (ttsData.ok) {
          renderHistoryList(historyTts, ttsData.items, "tts");
        }
      } catch (err) {
        console.error("History load failed:", err);
      }
    }

    refreshSession();
  </script>
</body>
</html>`;
}

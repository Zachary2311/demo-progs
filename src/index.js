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
    if (pathname === "/api/chat/stream" && request.method === "POST") {
      return handleChatStream(request, env);
    }
    if (pathname === "/api/chat/history" && request.method === "GET") {
      return handleChatHistory(request, env);
    }
    if (pathname === "/api/chat/clear" && request.method === "POST") {
      return handleClearChat(request, env);
    }
    if (pathname === "/api/chat/regenerate" && request.method === "POST") {
      return handleChatRegenerate(request, env);
    }
    if (pathname === "/api/chat/siblings" && request.method === "GET") {
      return handleChatSiblings(request, env);
    }
    
    // User Preferences
    if (pathname === "/api/user/preferences" && request.method === "GET") {
      return handleGetPreferences(request, env);
    }
    if (pathname === "/api/user/preferences" && request.method === "POST") {
      return handleSavePreferences(request, env);
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
    "Secure",
  ];
  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join("; ");
}

// Constant-time comparison to prevent timing attacks
function secureCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
  if (!secureCompare(hash, user.password_hash)) {
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
    return json({ ok: false, error: "TTS failed. Please try again." }, 500);
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

/* ---------- Chat Constants ---------- */

const BASE_SYSTEM_PROMPT = `You are a helpful, knowledgeable AI assistant. You provide clear, accurate, and well-structured responses.

## Response Formatting Guidelines

### Use Markdown for Structure
- Use **bold** for emphasis and important terms
- Use *italics* for subtle emphasis or introducing concepts
- Use \`inline code\` for technical terms, function names, file paths, and commands
- Use headings (##, ###) to organize longer responses
- Use bullet points (-) or numbered lists (1.) for multiple items

### Code Blocks
When sharing code, ALWAYS use fenced code blocks with the appropriate language identifier:
\`\`\`javascript
// JavaScript example
const greeting = "Hello, World!";
\`\`\`

\`\`\`python
# Python example
greeting = "Hello, World!"
\`\`\`

### Response Style
- Be concise but thorough
- Start with a direct answer, then elaborate if needed
- Use examples to illustrate complex concepts
- Break down complex topics into digestible parts
- If you're unsure, acknowledge uncertainty

### Personality
- Be friendly and approachable
- Be patient and helpful
- Avoid unnecessary jargon unless the user is technical
- When appropriate, provide actionable next steps`;

async function getSystemPrompt(env, userId) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT custom_system_prompt FROM user_preferences WHERE user_id = ?"
    ).bind(userId).all();
    
    if (results && results.length > 0 && results[0].custom_system_prompt) {
      return BASE_SYSTEM_PROMPT + "\n\n## Custom Instructions\n" + results[0].custom_system_prompt;
    }
  } catch (err) {
    console.error("Failed to get user preferences:", err);
  }
  return BASE_SYSTEM_PROMPT;
}

// Helper function to extract text from content items
function extractTextFromContent(content) {
  if (!content) return "";
  const items = Array.isArray(content) ? content : [content];
  return items
    .map(item => {
      if (typeof item === 'string') return item;
      if (item.type === 'output_text' && item.text) return item.text;
      if (item.type === 'reasoning_text' && item.text) return item.text;
      if (item.text) return item.text;
      if (item.output_text) return item.output_text;
      if (item.reasoning_text) return item.reasoning_text;
      return null;
    })
    .filter(Boolean)
    .join('\n');
}

// Build context chain by following parent_message_id
async function buildContextChain(env, userId, excludeMessageId = null) {
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, parent_message_id
     FROM chat_messages
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 20`
  ).bind(userId).all();
  
  if (!results || results.length === 0) return [];
  
  // Filter out the excluded message (for regeneration)
  const messages = excludeMessageId 
    ? results.filter(m => m.id !== excludeMessageId)
    : results;
  
  // Reverse to chronological order and take last 10
  return messages.reverse().slice(-10);
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
  const parentMessageId = body.parentMessageId || null;

  if (!message) {
    return json({ ok: false, error: "Message is required." }, 400);
  }

  const now = Date.now();

  // Get conversation context
  const history = await buildContextChain(env, user.id);

  // Save user message with parent reference
  const userMsgResult = await env.DB.prepare(
    `INSERT INTO chat_messages
     (user_id, role, content, parent_message_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(user.id, "user", message, parentMessageId, now)
    .run();
  
  const userMessageId = userMsgResult.meta.last_row_id;

  try {
    const systemPrompt = await getSystemPrompt(env, user.id);
    
    // Build messages array with conversation context
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: message },
    ];

    // Call GPT-OSS-120B model with conversation context
    const aiResponse = await env.AI.run("@cf/openai/gpt-oss-120b", {
      input: messages,
    });

    console.log("AI Response structure:", JSON.stringify(aiResponse, null, 2));

    let assistantMessage = "";
    let reasoning = "";
    
    // Handle string response that might be JSONL
    if (typeof aiResponse === 'string') {
      const lines = aiResponse.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'reasoning') {
            reasoning = extractTextFromContent(parsed.content) || reasoning;
          } else if (parsed.type === 'message' && parsed.role === 'assistant') {
            assistantMessage = extractTextFromContent(parsed.content) || assistantMessage;
          }
        } catch {
          if (!assistantMessage) {
            assistantMessage = aiResponse;
          }
        }
      }
    }
    else if (Array.isArray(aiResponse)) {
      for (const item of aiResponse) {
        if (item.type === "reasoning") {
          reasoning = extractTextFromContent(item.content) || reasoning;
        } else if (item.type === "message" && item.role === "assistant") {
          assistantMessage = extractTextFromContent(item.content) || assistantMessage;
        }
      }
    }
    else if (aiResponse && typeof aiResponse === 'object') {
      if (Array.isArray(aiResponse.output)) {
        for (const item of aiResponse.output) {
          if (item.type === "reasoning") {
            reasoning = extractTextFromContent(item.content) || reasoning;
          } else if (item.type === "message" && item.role === "assistant") {
            assistantMessage = extractTextFromContent(item.content) || assistantMessage;
          }
        }
      }
      else if (aiResponse.type === 'message' && aiResponse.role === 'assistant') {
        assistantMessage = extractTextFromContent(aiResponse.content);
      }
      else if (aiResponse.results?.[0]) {
        const result = aiResponse.results[0];
        assistantMessage = result.output || result.response || result.text || "";
      }
      else if (aiResponse.response) {
        assistantMessage = typeof aiResponse.response === 'string' 
          ? aiResponse.response 
          : extractTextFromContent(aiResponse.response);
      } else if (typeof aiResponse.output === 'string') {
        assistantMessage = aiResponse.output;
      }
    }

    assistantMessage = String(assistantMessage || "").trim();
    reasoning = String(reasoning || "").trim();
    
    if (!assistantMessage) {
      console.error("Could not extract response from AI. Full response:", JSON.stringify(aiResponse));
      assistantMessage = "I'm sorry, I couldn't generate a response.";
    }

    // Save assistant response with parent reference to user message
    const assistantResult = await env.DB.prepare(
      `INSERT INTO chat_messages
       (user_id, role, content, model, thinking, parent_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(user.id, "assistant", String(assistantMessage), "@cf/openai/gpt-oss-120b", reasoning || null, userMessageId, Date.now())
      .run();

    return json({
      ok: true,
      message: assistantMessage,
      thinking: reasoning || null,
      messageId: assistantResult.meta.last_row_id,
      userMessageId: userMessageId,
    });
  } catch (err) {
    console.error("Chat error:", err);
    console.error("Error stack:", err.stack);
    return json(
      {
        ok: false,
        error: `Chat error: ${err.message || err.toString()}`,
      },
      500,
    );
  }
}

/* ---------- Streaming Chat Handler ---------- */

async function handleChatStream(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = String(body.message || "").trim();
  const parentMessageId = body.parentMessageId || null;

  if (!message) {
    return new Response(JSON.stringify({ ok: false, error: "Message is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();

  // Get conversation context
  const history = await buildContextChain(env, user.id);

  // Save user message
  const userMsgResult = await env.DB.prepare(
    `INSERT INTO chat_messages
     (user_id, role, content, parent_message_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(user.id, "user", message, parentMessageId, now)
    .run();
  
  const userMessageId = userMsgResult.meta.last_row_id;

  const systemPrompt = await getSystemPrompt(env, user.id);
  
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: message },
  ];

  try {
    // Call with stream: true
    const aiStream = await env.AI.run("@cf/openai/gpt-oss-120b", {
      messages: messages,
      stream: true,
    });

    let fullContent = "";
    let fullThinking = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Use ReadableStream with pull-based approach to keep connection alive
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = aiStream.getReader();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // value could be a string chunk or Uint8Array
            let chunk = value;
            if (typeof value !== 'string') {
              chunk = decoder.decode(value, { stream: true });
            }
            
            // Parse SSE data
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.response) {
                    fullContent += parsed.response;
                    // Forward to client
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: parsed.response })}\n\n`));
                  }
                  if (parsed.thinking) {
                    fullThinking += parsed.thinking;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: parsed.thinking })}\n\n`));
                  }
                } catch {
                  // Raw text chunk
                  fullContent += data;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: data })}\n\n`));
                }
              } else if (line.trim() && !line.startsWith(':')) {
                // Raw content without SSE prefix
                fullContent += line;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: line })}\n\n`));
              }
            }
          }
          
          // Save the complete message
          const assistantResult = await env.DB.prepare(
            `INSERT INTO chat_messages
             (user_id, role, content, model, thinking, parent_message_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(user.id, "assistant", fullContent.trim() || "I couldn't generate a response.", "@cf/openai/gpt-oss-120b", fullThinking || null, userMessageId, Date.now())
            .run();
          
          // Send completion event with message ID
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done', 
            messageId: assistantResult.meta.last_row_id,
            userMessageId: userMessageId
          })}\n\n`));
          
          controller.close();
        } catch (err) {
          console.error("Stream processing error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Stream setup error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/* ---------- Chat Regenerate Handler ---------- */

async function handleChatRegenerate(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const messageId = body.messageId;
  if (!messageId) {
    return json({ ok: false, error: "messageId is required." }, 400);
  }

  // Get the message to regenerate
  const { results: msgResults } = await env.DB.prepare(
    `SELECT id, role, content, parent_message_id
     FROM chat_messages
     WHERE id = ? AND user_id = ?`
  ).bind(messageId, user.id).all();

  if (!msgResults || msgResults.length === 0) {
    return json({ ok: false, error: "Message not found." }, 404);
  }

  const originalMsg = msgResults[0];
  
  // Get the parent user message to regenerate from
  let userMessage = "";
  let userMessageId = null;
  
  if (originalMsg.role === 'assistant' && originalMsg.parent_message_id) {
    const { results: parentResults } = await env.DB.prepare(
      `SELECT id, content FROM chat_messages WHERE id = ?`
    ).bind(originalMsg.parent_message_id).all();
    
    if (parentResults && parentResults.length > 0) {
      userMessage = parentResults[0].content;
      userMessageId = parentResults[0].id;
    }
  }

  if (!userMessage) {
    return json({ ok: false, error: "Could not find parent user message." }, 400);
  }

  // Build context excluding the message being regenerated
  const history = await buildContextChain(env, user.id, messageId);
  
  const systemPrompt = await getSystemPrompt(env, user.id);
  
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const aiResponse = await env.AI.run("@cf/openai/gpt-oss-120b", {
      input: messages,
    });

    let assistantMessage = "";
    let reasoning = "";
    
    if (typeof aiResponse === 'string') {
      const lines = aiResponse.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'reasoning') {
            reasoning = extractTextFromContent(parsed.content) || reasoning;
          } else if (parsed.type === 'message' && parsed.role === 'assistant') {
            assistantMessage = extractTextFromContent(parsed.content) || assistantMessage;
          }
        } catch {
          if (!assistantMessage) assistantMessage = aiResponse;
        }
      }
    } else if (Array.isArray(aiResponse)) {
      for (const item of aiResponse) {
        if (item.type === "reasoning") {
          reasoning = extractTextFromContent(item.content) || reasoning;
        } else if (item.type === "message" && item.role === "assistant") {
          assistantMessage = extractTextFromContent(item.content) || assistantMessage;
        }
      }
    } else if (aiResponse && typeof aiResponse === 'object') {
      if (Array.isArray(aiResponse.output)) {
        for (const item of aiResponse.output) {
          if (item.type === "reasoning") {
            reasoning = extractTextFromContent(item.content) || reasoning;
          } else if (item.type === "message" && item.role === "assistant") {
            assistantMessage = extractTextFromContent(item.content) || assistantMessage;
          }
        }
      } else if (aiResponse.response) {
        assistantMessage = typeof aiResponse.response === 'string' ? aiResponse.response : extractTextFromContent(aiResponse.response);
      } else if (typeof aiResponse.output === 'string') {
        assistantMessage = aiResponse.output;
      }
    }

    assistantMessage = String(assistantMessage || "").trim();
    reasoning = String(reasoning || "").trim();
    
    if (!assistantMessage) {
      assistantMessage = "I'm sorry, I couldn't generate a response.";
    }

    // Save as a sibling (same parent_message_id as the original)
    const newMsgResult = await env.DB.prepare(
      `INSERT INTO chat_messages
       (user_id, role, content, model, thinking, parent_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(user.id, "assistant", assistantMessage, "@cf/openai/gpt-oss-120b", reasoning || null, userMessageId, Date.now())
      .run();

    return json({
      ok: true,
      message: assistantMessage,
      thinking: reasoning || null,
      messageId: newMsgResult.meta.last_row_id,
      originalMessageId: messageId,
    });
  } catch (err) {
    console.error("Regenerate error:", err);
    return json({ ok: false, error: err.message }, 500);
  }
}

/* ---------- Chat Siblings Handler ---------- */

async function handleChatSiblings(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  
  if (!messageId) {
    return json({ ok: false, error: "messageId is required." }, 400);
  }

  // Get the message to find its parent
  const { results: msgResults } = await env.DB.prepare(
    `SELECT parent_message_id FROM chat_messages WHERE id = ? AND user_id = ?`
  ).bind(messageId, user.id).all();

  if (!msgResults || msgResults.length === 0) {
    return json({ ok: false, error: "Message not found." }, 404);
  }

  const parentId = msgResults[0].parent_message_id;
  
  if (!parentId) {
    return json({ ok: true, siblings: [{ id: parseInt(messageId) }], currentIndex: 0 });
  }

  // Get all siblings (messages with same parent)
  const { results: siblings } = await env.DB.prepare(
    `SELECT id, content, thinking, created_at
     FROM chat_messages
     WHERE parent_message_id = ? AND user_id = ? AND role = 'assistant'
     ORDER BY created_at ASC`
  ).bind(parentId, user.id).all();

  const currentIndex = siblings.findIndex(s => s.id === parseInt(messageId));

  return json({
    ok: true,
    siblings: siblings,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
  });
}

/* ---------- User Preferences Handlers ---------- */

async function handleGetPreferences(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    "SELECT custom_system_prompt FROM user_preferences WHERE user_id = ?"
  ).bind(user.id).all();

  return json({
    ok: true,
    preferences: {
      customSystemPrompt: results && results.length > 0 ? results[0].custom_system_prompt : "",
    },
  });
}

async function handleSavePreferences(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const customPrompt = String(body.customSystemPrompt || "").trim();
  const now = Date.now();

  // Upsert preferences
  await env.DB.prepare(
    `INSERT INTO user_preferences (user_id, custom_system_prompt, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       custom_system_prompt = excluded.custom_system_prompt,
       updated_at = excluded.updated_at`
  ).bind(user.id, customPrompt || null, now, now).run();

  return json({ ok: true });
}

async function handleChatHistory(request, env) {
  const user = await getSessionUser(env, request);
  if (!user) return unauthorized();

  const { results } = await env.DB.prepare(
    `SELECT id, role, content, model, thinking, parent_message_id, created_at
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
  <!-- Highlight.js for code syntax highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <!-- Marked.js for markdown rendering -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
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
    
    /* Thinking Toggle Styles */
    .thinking-toggle {
      margin-top: 8px;
      margin-bottom: -4px;
    }
    .thinking-toggle-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .thinking-toggle-btn:hover {
      background: rgba(139, 92, 246, 0.1);
      color: var(--accent);
    }
    .thinking-toggle-icon {
      transition: transform 0.2s;
      display: inline-block;
    }
    .thinking-toggle-btn.active .thinking-toggle-icon {
      transform: rotate(90deg);
    }
    .thinking-content {
      margin-top: 8px;
      padding: 12px;
      background: rgba(139, 92, 246, 0.05);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.6;
      display: none;
      white-space: pre-wrap;
    }
    .thinking-content.visible {
      display: block;
    }
    
    /* Markdown Styles in Chat */
    .chat-bubble.markdown {
      line-height: 1.6;
    }
    .chat-bubble.markdown h1,
    .chat-bubble.markdown h2,
    .chat-bubble.markdown h3,
    .chat-bubble.markdown h4 {
      margin: 16px 0 8px 0;
      font-weight: 600;
      line-height: 1.3;
    }
    .chat-bubble.markdown h1:first-child,
    .chat-bubble.markdown h2:first-child,
    .chat-bubble.markdown h3:first-child {
      margin-top: 0;
    }
    .chat-bubble.markdown h1 { font-size: 1.4rem; }
    .chat-bubble.markdown h2 { font-size: 1.2rem; }
    .chat-bubble.markdown h3 { font-size: 1.1rem; }
    .chat-bubble.markdown p {
      margin: 8px 0;
    }
    .chat-bubble.markdown p:first-child {
      margin-top: 0;
    }
    .chat-bubble.markdown p:last-child {
      margin-bottom: 0;
    }
    .chat-bubble.markdown ul,
    .chat-bubble.markdown ol {
      margin: 8px 0;
      padding-left: 24px;
    }
    .chat-bubble.markdown li {
      margin: 4px 0;
    }
    .chat-bubble.markdown code {
      background: rgba(139, 92, 246, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
      font-size: 0.85em;
    }
    .chat-bubble.markdown pre {
      background: #1e1e2e;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      margin: 12px 0;
      overflow-x: auto;
      position: relative;
    }
    .chat-bubble.markdown pre code {
      background: transparent;
      padding: 0;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    .chat-bubble.markdown blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 16px;
      margin: 12px 0;
      color: var(--text-muted);
      font-style: italic;
    }
    .chat-bubble.markdown a {
      color: var(--accent);
      text-decoration: none;
    }
    .chat-bubble.markdown a:hover {
      text-decoration: underline;
    }
    .chat-bubble.markdown table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    .chat-bubble.markdown th,
    .chat-bubble.markdown td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }
    .chat-bubble.markdown th {
      background: rgba(139, 92, 246, 0.1);
      font-weight: 600;
    }
    .chat-bubble.markdown strong {
      font-weight: 600;
      color: var(--text);
    }
    .chat-bubble.markdown em {
      font-style: italic;
    }
    .chat-bubble.markdown hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 16px 0;
    }
    
    /* Code block copy button */
    .code-block-wrapper {
      position: relative;
    }
    .code-copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(139, 92, 246, 0.3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
      opacity: 0;
    }
    .code-block-wrapper:hover .code-copy-btn {
      opacity: 1;
    }
    .code-copy-btn:hover {
      background: var(--accent);
      color: white;
    }
    .code-copy-btn.copied {
      background: #22c55e;
      color: white;
    }
    
    /* Message Actions */
    .message-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .chat-message:hover .message-actions {
      opacity: 1;
    }
    .message-action-btn {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-size: 0.75rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .message-action-btn:hover {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--text);
    }
    
    /* Branch Navigation */
    .branch-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 8px;
    }
    .branch-nav-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 8px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .branch-nav-btn:hover:not(:disabled) {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--text);
    }
    .branch-nav-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .branch-counter {
      min-width: 50px;
      text-align: center;
    }
    
    /* Streaming cursor animation */
    .streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: var(--accent);
      margin-left: 2px;
      animation: blink 1s infinite;
      vertical-align: text-bottom;
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    /* Chat Tabs */
    .chat-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .chat-tab {
      padding: 12px 20px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .chat-tab:hover {
      color: var(--text);
      background: var(--accent-soft);
    }
    .chat-tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .chat-tab-content {
      display: none;
    }
    .chat-tab-content.active {
      display: block;
    }
    
    /* Customization Panel */
    .customization-panel {
      padding: 20px;
    }
    .customization-panel h3 {
      margin-bottom: 8px;
      font-size: 1rem;
    }
    .customization-panel p {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .customization-textarea {
      width: 100%;
      min-height: 200px;
      padding: 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: rgba(17, 17, 27, 0.6);
      color: var(--text);
      font-size: 0.9rem;
      font-family: inherit;
      resize: vertical;
      line-height: 1.6;
    }
    .customization-textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .customization-actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .save-status {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .save-status.success {
      color: #22c55e;
    }
    .save-status.error {
      color: #ef4444;
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
            <!-- Chat Tabs -->
            <div class="chat-tabs">
              <button class="chat-tab active" data-tab="chat">💬 Chat</button>
              <button class="chat-tab" data-tab="customize">⚙️ Customize</button>
            </div>

            <!-- Chat Tab Content -->
            <div id="chat-tab-chat" class="chat-tab-content active">
              <div class="card-header">
                <div class="flex justify-between items-center">
                  <div>
                    <h2 class="card-title">
                      Chat Assistant
                      <span class="badge">
                        <span class="badge-dot"></span>
                        GPT-OSS-120B
                      </span>
                    </h2>
                    <p class="card-description">Ask questions and get markdown-formatted responses with code highlighting</p>
                  </div>
                  <div class="flex gap-2">
                    <button id="toggle-streaming-btn" class="btn btn-ghost btn-small" title="Toggle streaming mode">
                      ⚡ Streaming
                    </button>
                    <button id="clear-chat-btn" class="btn btn-ghost btn-small">
                      Clear Chat
                    </button>
                  </div>
                </div>
              </div>

              <div class="chat-container">
                <div id="chat-messages" class="chat-messages">
                  <div class="chat-empty">
                    <div class="chat-empty-icon">💬</div>
                    <div>Start a conversation with the AI assistant</div>
                    <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                      Responses support **markdown**, \`code\`, and syntax highlighting
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
                      placeholder="Type your message here... (Shift+Enter for new line)"
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

            <!-- Customize Tab Content -->
            <div id="chat-tab-customize" class="chat-tab-content">
              <div class="customization-panel">
                <h3>🎨 Customize AI Personality</h3>
                <p>
                  Add custom instructions to personalize how the AI responds to you. 
                  These instructions are added to the base system prompt and affect all future conversations.
                </p>
                <textarea 
                  id="custom-prompt-input" 
                  class="customization-textarea"
                  placeholder="Examples:
• Always respond in a casual, friendly tone
• Use more technical language and assume I'm an expert
• Include code examples whenever possible
• Keep responses brief and to the point
• Explain things as if I'm a beginner
• Always suggest next steps or follow-up questions"
                ></textarea>
                <div class="customization-actions">
                  <button id="save-preferences-btn" class="btn">
                    💾 Save Preferences
                  </button>
                  <button id="reset-preferences-btn" class="btn btn-ghost">
                    Reset to Default
                  </button>
                  <div id="save-status" class="save-status"></div>
                </div>
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
    let streamingEnabled = true;
    let messageIdMap = new Map(); // Maps DOM elements to message IDs

    // ===== Markdown Configuration =====
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {}
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
    });

    // Custom renderer for code blocks with copy button
    const renderer = new marked.Renderer();
    renderer.code = function(code, language) {
      const lang = language || '';
      const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value;
      return \`<div class="code-block-wrapper">
        <button class="code-copy-btn" onclick="copyCodeBlock(this)">📋 Copy</button>
        <pre><code class="hljs \${lang}">\${highlighted}</code></pre>
      </div>\`;
    };
    marked.use({ renderer });

    // Copy code block function
    window.copyCodeBlock = function(btn) {
      const codeEl = btn.parentElement.querySelector('code');
      const text = codeEl.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '📋 Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    };

    // Render markdown safely
    function renderMarkdown(text) {
      try {
        return marked.parse(text);
      } catch (e) {
        console.error('Markdown parsing error:', e);
        return escapeHtml(text);
      }
    }

    // Helper function to escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

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
    const toggleStreamingBtn = document.getElementById('toggle-streaming-btn');
    
    // Chat tabs
    const chatTabs = document.querySelectorAll('.chat-tab');
    const chatTabContents = document.querySelectorAll('.chat-tab-content');
    
    // Customization elements
    const customPromptInput = document.getElementById('custom-prompt-input');
    const savePreferencesBtn = document.getElementById('save-preferences-btn');
    const resetPreferencesBtn = document.getElementById('reset-preferences-btn');
    const saveStatus = document.getElementById('save-status');

    // ===== Chat Tab Navigation =====
    chatTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        
        chatTabs.forEach(t => t.classList.remove('active'));
        chatTabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById('chat-tab-' + tabId).classList.add('active');
        
        if (tabId === 'customize' && currentUser) {
          loadPreferences();
        }
      });
    });

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
    function renderChatMessage(role, content, thinking = null, messageId = null, showActions = true) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message ' + role;
      if (messageId) {
        messageDiv.dataset.messageId = messageId;
        messageIdMap.set(messageDiv, messageId);
      }
      
      const avatar = document.createElement('div');
      avatar.className = 'chat-avatar';
      avatar.textContent = role === 'user' ? (currentUser ? currentUser.email.charAt(0).toUpperCase() : 'U') : '🤖';
      
      const contentWrapper = document.createElement('div');
      contentWrapper.style.cssText = 'max-width: 70%; display: flex; flex-direction: column;';
      
      // Add thinking toggle for assistant messages with thinking content
      if (role === 'assistant' && thinking) {
        const thinkingToggle = document.createElement('div');
        thinkingToggle.className = 'thinking-toggle';
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'thinking-toggle-btn';
        toggleBtn.innerHTML = '<span class="thinking-toggle-icon">▶</span> Thinking';
        
        const thinkingContent = document.createElement('div');
        thinkingContent.className = 'thinking-content';
        thinkingContent.textContent = thinking;
        
        toggleBtn.addEventListener('click', () => {
          toggleBtn.classList.toggle('active');
          thinkingContent.classList.toggle('visible');
        });
        
        thinkingToggle.appendChild(toggleBtn);
        thinkingToggle.appendChild(thinkingContent);
        contentWrapper.appendChild(thinkingToggle);
      }
      
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      
      // Render markdown for assistant messages
      if (role === 'assistant') {
        bubble.classList.add('markdown');
        bubble.innerHTML = renderMarkdown(content);
      } else {
        bubble.textContent = content;
      }
      
      contentWrapper.appendChild(bubble);
      
      // Add action buttons for assistant messages
      if (role === 'assistant' && showActions && messageId) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(content).then(() => {
            copyBtn.innerHTML = '✓ Copied!';
            setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
          });
        };
        actions.appendChild(copyBtn);
        
        // Regenerate button
        const regenBtn = document.createElement('button');
        regenBtn.className = 'message-action-btn';
        regenBtn.innerHTML = '🔄 Redo';
        regenBtn.onclick = () => regenerateMessage(messageId, messageDiv);
        actions.appendChild(regenBtn);
        
        contentWrapper.appendChild(actions);
        
        // Branch navigation (will be populated if siblings exist)
        const branchNav = document.createElement('div');
        branchNav.className = 'branch-nav';
        branchNav.style.display = 'none';
        branchNav.dataset.messageId = messageId;
        contentWrapper.appendChild(branchNav);
        
        // Check for siblings
        checkSiblings(messageId, branchNav, bubble, contentWrapper);
      }
      
      messageDiv.appendChild(avatar);
      messageDiv.appendChild(contentWrapper);
      
      return messageDiv;
    }

    async function checkSiblings(messageId, branchNav, bubble, contentWrapper) {
      try {
        const res = await fetch('/api/chat/siblings?messageId=' + messageId);
        const data = await res.json();
        
        if (data.ok && data.siblings && data.siblings.length > 1) {
          branchNav.style.display = 'flex';
          updateBranchNav(branchNav, data.siblings, data.currentIndex, bubble, contentWrapper);
        }
      } catch (err) {
        console.error('Failed to check siblings:', err);
      }
    }

    function updateBranchNav(branchNav, siblings, currentIndex, bubble, contentWrapper) {
      branchNav.innerHTML = '';
      
      const prevBtn = document.createElement('button');
      prevBtn.className = 'branch-nav-btn';
      prevBtn.textContent = '◀';
      prevBtn.disabled = currentIndex <= 0;
      prevBtn.onclick = () => switchToSibling(siblings, currentIndex - 1, branchNav, bubble, contentWrapper);
      
      const counter = document.createElement('span');
      counter.className = 'branch-counter';
      counter.textContent = (currentIndex + 1) + ' / ' + siblings.length;
      
      const nextBtn = document.createElement('button');
      nextBtn.className = 'branch-nav-btn';
      nextBtn.textContent = '▶';
      nextBtn.disabled = currentIndex >= siblings.length - 1;
      nextBtn.onclick = () => switchToSibling(siblings, currentIndex + 1, branchNav, bubble, contentWrapper);
      
      branchNav.appendChild(prevBtn);
      branchNav.appendChild(counter);
      branchNav.appendChild(nextBtn);
    }

    function switchToSibling(siblings, newIndex, branchNav, bubble, contentWrapper) {
      const sibling = siblings[newIndex];
      if (!sibling) return;
      
      // Update bubble content
      bubble.innerHTML = renderMarkdown(sibling.content);
      
      // Update branch nav
      updateBranchNav(branchNav, siblings, newIndex, bubble, contentWrapper);
      
      // Update thinking if exists
      const thinkingContent = contentWrapper.querySelector('.thinking-content');
      if (thinkingContent) {
        if (sibling.thinking) {
          thinkingContent.textContent = sibling.thinking;
          thinkingContent.parentElement.style.display = 'block';
        } else {
          thinkingContent.parentElement.style.display = 'none';
        }
      }
      
      // Update data attribute
      branchNav.dataset.messageId = sibling.id;
    }

    async function regenerateMessage(messageId, messageDiv) {
      clearError(errorChat);
      
      try {
        sendChatBtn.disabled = true;
        chatInput.disabled = true;
        
        // Show loading in the message
        const bubble = messageDiv.querySelector('.chat-bubble');
        const originalContent = bubble.innerHTML;
        bubble.innerHTML = '<div class="chat-loading"><div class="chat-loading-dot"></div><div class="chat-loading-dot"></div><div class="chat-loading-dot"></div></div>';
        
        const res = await fetch('/api/chat/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        });
        
        const data = await res.json();
        
        if (!res.ok || !data.ok) {
          bubble.innerHTML = originalContent;
          showError(errorChat, errorChatText, data.error || 'Failed to regenerate.');
          return;
        }
        
        // Update with new content
        bubble.innerHTML = renderMarkdown(data.message);
        
        // Update thinking if exists
        const thinkingContent = messageDiv.querySelector('.thinking-content');
        if (thinkingContent && data.thinking) {
          thinkingContent.textContent = data.thinking;
        }
        
        // Refresh siblings
        const branchNav = messageDiv.querySelector('.branch-nav');
        if (branchNav) {
          checkSiblings(data.messageId, branchNav, bubble, messageDiv.querySelector('div[style*="flex-direction: column"]'));
        }
        
      } catch (err) {
        console.error('Regenerate error:', err);
        showError(errorChat, errorChatText, 'Failed to regenerate response.');
      } finally {
        sendChatBtn.disabled = false;
        chatInput.disabled = false;
      }
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
      
      return loadingDiv;
    }

    function removeChatLoading() {
      const loading = document.getElementById('chat-loading');
      if (loading) {
        loading.remove();
      }
    }

    // Streaming message handler
    async function sendChatMessageStreaming() {
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

      chatInput.value = '';
      sendChatBtn.disabled = true;
      chatInput.disabled = true;

      clearChatEmpty();
      const userMessage = renderChatMessage('user', message, null, null, false);
      chatMessages.appendChild(userMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Create streaming assistant message
      const assistantDiv = document.createElement('div');
      assistantDiv.className = 'chat-message assistant';
      
      const avatar = document.createElement('div');
      avatar.className = 'chat-avatar';
      avatar.textContent = '🤖';
      
      const contentWrapper = document.createElement('div');
      contentWrapper.style.cssText = 'max-width: 70%; display: flex; flex-direction: column;';
      
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble markdown';
      bubble.innerHTML = '<span class="streaming-cursor"></span>';
      
      contentWrapper.appendChild(bubble);
      assistantDiv.appendChild(avatar);
      assistantDiv.appendChild(contentWrapper);
      chatMessages.appendChild(assistantDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      let fullContent = '';
      let fullThinking = '';
      let messageId = null;

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Stream request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === 'content') {
                  fullContent += parsed.text;
                  bubble.innerHTML = renderMarkdown(fullContent) + '<span class="streaming-cursor"></span>';
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                else if (parsed.type === 'thinking') {
                  fullThinking += parsed.text;
                }
                else if (parsed.type === 'done') {
                  messageId = parsed.messageId;
                }
                else if (parsed.type === 'error') {
                  throw new Error(parsed.error);
                }
              } catch (e) {
                if (e.message !== 'Unexpected end of JSON input') {
                  console.error('Parse error:', e);
                }
              }
            }
          }
        }

        // Remove streaming cursor and finalize
        bubble.innerHTML = renderMarkdown(fullContent || "I couldn't generate a response.");
        
        // Add thinking toggle if we have thinking
        if (fullThinking) {
          const thinkingToggle = document.createElement('div');
          thinkingToggle.className = 'thinking-toggle';
          
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'thinking-toggle-btn';
          toggleBtn.innerHTML = '<span class="thinking-toggle-icon">▶</span> Thinking';
          
          const thinkingContent = document.createElement('div');
          thinkingContent.className = 'thinking-content';
          thinkingContent.textContent = fullThinking;
          
          toggleBtn.addEventListener('click', () => {
            toggleBtn.classList.toggle('active');
            thinkingContent.classList.toggle('visible');
          });
          
          thinkingToggle.appendChild(toggleBtn);
          thinkingToggle.appendChild(thinkingContent);
          contentWrapper.insertBefore(thinkingToggle, bubble);
        }
        
        // Add action buttons
        if (messageId) {
          assistantDiv.dataset.messageId = messageId;
          
          const actions = document.createElement('div');
          actions.className = 'message-actions';
          
          const copyBtn = document.createElement('button');
          copyBtn.className = 'message-action-btn';
          copyBtn.innerHTML = '📋 Copy';
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(fullContent).then(() => {
              copyBtn.innerHTML = '✓ Copied!';
              setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
            });
          };
          actions.appendChild(copyBtn);
          
          const regenBtn = document.createElement('button');
          regenBtn.className = 'message-action-btn';
          regenBtn.innerHTML = '🔄 Redo';
          regenBtn.onclick = () => regenerateMessage(messageId, assistantDiv);
          actions.appendChild(regenBtn);
          
          contentWrapper.appendChild(actions);
        }

      } catch (err) {
        console.error('Stream error:', err);
        bubble.innerHTML = '<span style="color: #ef4444;">Error: ' + escapeHtml(err.message) + '</span>';
        showError(errorChat, errorChatText, err.message);
      } finally {
        sendChatBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
      }
    }

    // Non-streaming message handler
    async function sendChatMessageNonStreaming() {
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

      chatInput.value = '';
      sendChatBtn.disabled = true;
      chatInput.disabled = true;

      clearChatEmpty();
      const userMessage = renderChatMessage('user', message, null, null, false);
      chatMessages.appendChild(userMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;

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

        const assistantMessage = renderChatMessage('assistant', data.message, data.thinking, data.messageId);
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

    // Main send function that routes to streaming or non-streaming
    async function sendChatMessage() {
      if (streamingEnabled) {
        await sendChatMessageStreaming();
      } else {
        await sendChatMessageNonStreaming();
      }
    }

    async function loadChatHistory() {
      if (!currentUser) return;

      try {
        const res = await fetch("/api/chat/history");
        if (!res.ok) return;

        const data = await res.json();
        if (!data.ok || !data.messages || data.messages.length === 0) return;

        chatMessages.innerHTML = '';

        data.messages.forEach(msg => {
          const messageDiv = renderChatMessage(msg.role, msg.content, msg.thinking, msg.id);
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
          chatMessages.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">💬</div><div>Start a conversation with the AI assistant</div><div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">Responses support **markdown**, \`code\`, and syntax highlighting</div></div>';
        }
      } catch (err) {
        console.error("Failed to clear chat:", err);
      }
    }

    // Toggle streaming mode
    toggleStreamingBtn.addEventListener('click', () => {
      streamingEnabled = !streamingEnabled;
      toggleStreamingBtn.innerHTML = streamingEnabled ? '⚡ Streaming' : '📝 Standard';
      toggleStreamingBtn.title = streamingEnabled ? 'Click to disable streaming' : 'Click to enable streaming';
    });

    sendChatBtn.addEventListener('click', sendChatMessage);
    clearChatBtn.addEventListener('click', clearChat);
    
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // ===== Preferences Functions =====
    async function loadPreferences() {
      if (!currentUser) return;
      
      try {
        const res = await fetch('/api/user/preferences');
        const data = await res.json();
        
        if (data.ok && data.preferences) {
          customPromptInput.value = data.preferences.customSystemPrompt || '';
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      }
    }

    async function savePreferences() {
      if (!currentUser) return;
      
      saveStatus.textContent = 'Saving...';
      saveStatus.className = 'save-status';
      
      try {
        const res = await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customSystemPrompt: customPromptInput.value.trim(),
          }),
        });
        
        const data = await res.json();
        
        if (data.ok) {
          saveStatus.textContent = '✓ Saved!';
          saveStatus.className = 'save-status success';
        } else {
          throw new Error(data.error || 'Failed to save');
        }
      } catch (err) {
        saveStatus.textContent = '✗ Error: ' + err.message;
        saveStatus.className = 'save-status error';
      }
      
      setTimeout(() => {
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
      }, 3000);
    }

    savePreferencesBtn.addEventListener('click', savePreferences);
    
    resetPreferencesBtn.addEventListener('click', () => {
      if (confirm('Reset customization to default? This will clear your custom instructions.')) {
        customPromptInput.value = '';
        savePreferences();
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
      
      // Helper function to escape HTML to prevent XSS
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
      
      let html = '';
      for (const item of items) {
        let title, meta;
        if (type === "transcriptions") {
          title = escapeHtml(item.filename || "(no filename)");
          const wc = item.word_count || 0;
          meta = '<span>' + wc + ' words</span><span>' + escapeHtml(formatDateTime(item.created_at)) + '</span>';
        } else {
          const preview = (item.text_preview || "").slice(0, 60) + (item.text_preview && item.text_preview.length > 60 ? "…" : "");
          title = escapeHtml(preview);
          const chars = item.char_count || 0;
          meta = '<span>' + chars + ' chars · ' + escapeHtml(item.speaker || "voice") + '</span><span>' + escapeHtml(formatDateTime(item.created_at)) + '</span>';
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

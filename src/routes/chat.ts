import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import type { Env, AuthPayload, Conversation, Message } from '../types';
import { createAIClient } from '../lib/ai';
import { generateId } from '../lib/auth';
import { checkRateLimit, addRateLimitHeaders } from '../lib/rateLimit';
import { getAppSettings } from '../lib/settings';

export const chatRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// Get user's conversations
chatRoutes.get('/conversations', async (c) => {
  const user = c.get('user');
  
  const result = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
  ).bind(user.userId).all<Conversation>();

  return c.json({
    success: true,
    data: result.results || [],
  });
});

// Get single conversation with messages
chatRoutes.get('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');

  const conversation = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
  ).bind(conversationId, user.userId).first<Conversation>();

  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  const messages = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).bind(conversationId).all<Message>();

  return c.json({
    success: true,
    data: {
      conversation,
      messages: messages.results || [],
    },
  });
});

// Create new conversation
chatRoutes.post('/conversations', async (c) => {
  const user = c.get('user');
  const { title } = await c.req.json<{ title?: string }>();

  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.userId, title || 'New Chat', now, now).run();

  return c.json({
    success: true,
    data: {
      id,
      user_id: user.userId,
      title: title || 'New Chat',
      created_at: now,
      updated_at: now,
    },
  });
});

// Delete conversation
chatRoutes.delete('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM conversations WHERE id = ? AND user_id = ?'
  ).bind(conversationId, user.userId).run();

  return c.json({ success: true });
});

// Send message and get AI response (streaming)
chatRoutes.post('/message', async (c) => {
  const user = c.get('user');
  
  // Check rate limit
  const settings = await getAppSettings(c.env);
  const rateLimit = await checkRateLimit(c.env, user.userId, settings.rate_limit_per_day);
  
  if (!rateLimit.allowed) {
    const response = c.json(
      { success: false, error: 'Rate limit exceeded. Try again tomorrow.' },
      429
    );
    return addRateLimitHeaders(response, rateLimit);
  }

  const { conversationId, message, model = 'default' } = await c.req.json<{
    conversationId?: string;
    message: string;
    model?: 'default' | 'deep-thinking';
  }>();

  if (!message) {
    return c.json({ success: false, error: 'Message is required' }, 400);
  }

  // Check if deep thinking is enabled
  if (model === 'deep-thinking' && !settings.enable_deep_thinking) {
    return c.json({ success: false, error: 'Deep thinking is currently disabled' }, 400);
  }

  // Get or create conversation
  let convId = conversationId;
  const now = Math.floor(Date.now() / 1000);

  if (!convId) {
    convId = generateId();
    await c.env.DB.prepare(
      'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(convId, user.userId, message.substring(0, 50), now, now).run();
  } else {
    // Verify ownership
    const conv = await c.env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(convId, user.userId).first();
    
    if (!conv) {
      return c.json({ success: false, error: 'Conversation not found' }, 404);
    }
  }

  // Save user message
  const userMsgId = generateId();
  await c.env.DB.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userMsgId, convId, 'user', message, now).run();

  // Get conversation history
  const history = await c.env.DB.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20'
  ).bind(convId).all<{ role: 'user' | 'assistant' | 'system'; content: string }>();

  const messages = [
    { role: 'system' as const, content: 'You are a helpful AI assistant. Provide clear, accurate, and well-formatted responses.' },
    ...(history.results || []).map((m) => ({ role: m.role, content: m.content })),
  ];

  // Create AI client
  const ai = createAIClient(c.env);

  // Stream response
  const assistantMsgId = generateId();
  let fullResponse = '';

  return streamText(c, async (stream) => {
    try {
      const responseStream = await ai.streamChatCompletion(model, {
        messages,
        temperature: settings.model_temperature,
        maxTokens: settings.max_tokens,
      });

      const reader = responseStream.getReader();
      const decoder = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        await stream.write(chunk);
      }

      // Save assistant message
      await c.env.DB.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        assistantMsgId,
        convId,
        'assistant',
        fullResponse,
        model === 'deep-thinking' ? '@cf/openai/gpt-oss-120b' : '@cf/openai/gpt-oss-20b',
        Math.floor(Date.now() / 1000)
      ).run();

      // Update conversation timestamp
      await c.env.DB.prepare(
        'UPDATE conversations SET updated_at = ? WHERE id = ?'
      ).bind(Math.floor(Date.now() / 1000), convId).run();

      // Log usage
      await c.env.DB.prepare(
        'INSERT INTO usage_logs (id, user_id, action, model, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        generateId(),
        user.userId,
        'chat',
        model === 'deep-thinking' ? '@cf/openai/gpt-oss-120b' : '@cf/openai/gpt-oss-20b',
        Math.floor(Date.now() / 1000)
      ).run();

    } catch (error) {
      console.error('Chat error:', error);
      await stream.write('\n\n[Error: Failed to generate response]');
    }
  }, async (error) => {
    console.error('Stream error:', error);
  });
});

// Generate image
chatRoutes.post('/image', async (c) => {
  const user = c.get('user');

  // Check rate limit
  const settings = await getAppSettings(c.env);
  const rateLimit = await checkRateLimit(c.env, user.userId, settings.rate_limit_per_day);

  if (!rateLimit.allowed) {
    return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
  }

  if (!settings.enable_image_generation) {
    return c.json({ success: false, error: 'Image generation is currently disabled' }, 400);
  }

  const { prompt } = await c.req.json<{
    prompt: string;
  }>();

  if (!prompt) {
    return c.json({ success: false, error: 'Prompt is required' }, 400);
  }

  try {
    const ai = createAIClient(c.env);
    const imageData = await ai.generateImage({ prompt });

    // Save to R2
    const imageId = generateId();
    const r2Key = `generated/${user.userId}/${imageId}.png`;
    
    await c.env.R2.put(r2Key, imageData, {
      httpMetadata: { contentType: 'image/png' },
    });

    // Save record to D1
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      'INSERT INTO generated_images (id, user_id, prompt, r2_key, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(imageId, user.userId, prompt, r2Key, now).run();

    // Log usage
    await c.env.DB.prepare(
      'INSERT INTO usage_logs (id, user_id, action, model, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), user.userId, 'image', '@cf/black-forest-labs/flux-1-schnell', now).run();

    return c.json({
      success: true,
      data: {
        id: imageId,
        url: `/api/files/generated/${user.userId}/${imageId}.png`,
      },
    });
  } catch (error) {
    console.error('Image generation error:', error);
    return c.json({ success: false, error: 'Failed to generate image' }, 500);
  }
});

// Text-to-speech
chatRoutes.post('/tts', async (c) => {
  const user = c.get('user');

  const { text } = await c.req.json<{
    text: string;
  }>();

  if (!text) {
    return c.json({ success: false, error: 'Text is required' }, 400);
  }

  try {
    const ai = createAIClient(c.env);
    const audioData = await ai.textToSpeech({ text });

    // Log usage
    await c.env.DB.prepare(
      'INSERT INTO usage_logs (id, user_id, action, model, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), user.userId, 'tts', '@cf/deepgram/aura-2-en', Math.floor(Date.now() / 1000)).run();

    // Return audio directly
    return new Response(audioData, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioData.byteLength),
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return c.json({ success: false, error: 'Failed to generate audio' }, 500);
  }
});

// Get settings (for client)
chatRoutes.get('/settings', async (c) => {
  const settings = await getAppSettings(c.env);
  
  return c.json({
    success: true,
    data: {
      enableImageGeneration: settings.enable_image_generation,
      enableDeepThinking: settings.enable_deep_thinking,
    },
  });
});

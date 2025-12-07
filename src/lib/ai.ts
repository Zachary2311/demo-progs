import type { Env } from '../types';

// AI Model identifiers
export const AI_MODELS = {
  DEFAULT: '@cf/openai/gpt-oss-20b',
  DEEP_THINKING: '@cf/openai/gpt-oss-120b',
  IMAGE: '@cf/black-forest-labs/flux-1-schnell',
  TTS: '@cf/deepgram/aura-2-en',
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface ImageGenerationOptions {
  prompt: string;
  width?: number;
  height?: number;
}

interface TTSOptions {
  text: string;
}

// Cloudflare AI client wrapper
export class AIClient {
  private ai: Ai;

  constructor(env: Env) {
    this.ai = env.AI;
  }

  // Chat completion with default model (gpt-oss-20b)
  async chatCompletion(options: ChatCompletionOptions): Promise<ReadableStream | string> {
    const { messages, temperature = 0.7, maxTokens = 4096, stream = false } = options;

    const response = await this.ai.run(AI_MODELS.DEFAULT, {
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    });

    if (stream && response instanceof ReadableStream) {
      return response;
    }

    // Handle non-streaming response
    if (typeof response === 'object' && 'response' in response) {
      return (response as { response: string }).response;
    }

    return String(response);
  }

  // Deep thinking chat completion (gpt-oss-120b)
  async deepThinkingCompletion(options: ChatCompletionOptions): Promise<ReadableStream | string> {
    const { messages, temperature = 0.7, maxTokens = 4096, stream = false } = options;

    const response = await this.ai.run(AI_MODELS.DEEP_THINKING, {
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    });

    if (stream && response instanceof ReadableStream) {
      return response;
    }

    if (typeof response === 'object' && 'response' in response) {
      return (response as { response: string }).response;
    }

    return String(response);
  }

  // Stream chat completion helper
  async streamChatCompletion(
    model: 'default' | 'deep-thinking',
    options: Omit<ChatCompletionOptions, 'stream'>
  ): Promise<ReadableStream> {
    const fullOptions = { ...options, stream: true };

    if (model === 'deep-thinking') {
      const result = await this.deepThinkingCompletion(fullOptions);
      if (result instanceof ReadableStream) {
        return result;
      }
      // Fallback: wrap string in stream
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(String(result)));
          controller.close();
        },
      });
    }

    const result = await this.chatCompletion(fullOptions);
    if (result instanceof ReadableStream) {
      return result;
    }
    // Fallback: wrap string in stream
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(String(result)));
        controller.close();
      },
    });
  }

  // Image generation with flux-1-schnell
  async generateImage(options: ImageGenerationOptions): Promise<ArrayBuffer> {
    const { prompt, width = 1024, height = 1024 } = options;

    const response = await this.ai.run(AI_MODELS.IMAGE, {
      prompt,
      width,
      height,
    });

    // flux-1-schnell returns image data
    if (response instanceof ArrayBuffer) {
      return response;
    }

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result.buffer;
    }

    throw new Error('Unexpected response format from image model');
  }

  // Text-to-speech with aura-2-en
  async textToSpeech(options: TTSOptions): Promise<ArrayBuffer> {
    const { text } = options;

    const response = await this.ai.run(AI_MODELS.TTS, {
      text,
    });

    // TTS returns audio data
    if (response instanceof ArrayBuffer) {
      return response;
    }

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result.buffer;
    }

    throw new Error('Unexpected response format from TTS model');
  }
}

// Helper to create AI client
export function createAIClient(env: Env): AIClient {
  return new AIClient(env);
}

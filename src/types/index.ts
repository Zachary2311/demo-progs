// Environment bindings type definitions
export interface Env {
  // D1 Database
  DB: D1Database;
  
  // R2 Bucket
  R2: R2Bucket;
  
  // KV Namespace (for rate limiting)
  KV: KVNamespace;
  
  // Workers AI
  AI: Ai;
  
  // Durable Objects
  CHAT_ROOM: DurableObjectNamespace;
  
  // Environment variables
  JWT_SECRET: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  APP_URL: string;
}

// User type
export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  is_admin: number;
  email_verified: number;
  verification_token: string | null;
  reset_token: string | null;
  reset_token_expires: number | null;
  created_at: number;
  updated_at: number;
}

// Session type
export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
  created_at: number;
}

// Conversation type
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

// Message type
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  tokens_used: number;
  created_at: number;
}

// File type
export interface FileRecord {
  id: string;
  user_id: string;
  message_id: string | null;
  filename: string;
  mime_type: string;
  size: number;
  r2_key: string;
  created_at: number;
}

// Generated image type
export interface GeneratedImage {
  id: string;
  user_id: string;
  message_id: string | null;
  prompt: string;
  r2_key: string;
  created_at: number;
}

// Usage log type
export interface UsageLog {
  id: string;
  user_id: string;
  action: string;
  model: string | null;
  tokens_used: number;
  created_at: number;
}

// App settings type
export interface AppSettings {
  enable_image_generation: boolean;
  enable_deep_thinking: boolean;
  model_temperature: number;
  max_tokens: number;
  rate_limit_per_day: number;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Auth types
export interface AuthPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
  exp: number;
}

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  model?: 'default' | 'deep-thinking';
}

export interface ImageRequest {
  prompt: string;
  conversationId?: string;
}

export interface TTSRequest {
  text: string;
  messageId: string;
}

// WebSocket message types
export interface WSMessage {
  type: 'message' | 'typing' | 'error' | 'connected';
  payload: unknown;
}

// Admin types
export interface AdminStats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalFiles: number;
  usageByDay: Array<{ date: string; count: number }>;
  topUsers: Array<{ userId: string; email: string; count: number }>;
}

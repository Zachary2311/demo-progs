import type { Env } from '../types';

interface WSMessage {
  type: 'message' | 'typing' | 'connected' | 'user_joined' | 'user_left' | 'error';
  payload: unknown;
  userId?: string;
  timestamp?: number;
}

interface Session {
  webSocket: WebSocket;
  userId: string;
  quit?: boolean;
}

// Durable Object for WebSocket chat rooms
export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<string, Session>;
  private lastTimestamp: number;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.lastTimestamp = 0;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
      }

      const userId = url.searchParams.get('userId');
      if (!userId) {
        return new Response('Missing userId', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server, userId);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleSession(webSocket: WebSocket, userId: string): Promise<void> {
    // Accept the WebSocket connection
    this.state.acceptWebSocket(webSocket);

    const session: Session = {
      webSocket,
      userId,
    };

    // Generate a unique session ID
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, session);

    // Send connected message
    this.sendToSocket(webSocket, {
      type: 'connected',
      payload: { sessionId, userId },
      timestamp: Date.now(),
    });

    // Notify others about new user
    this.broadcast({
      type: 'user_joined',
      payload: { userId },
      timestamp: Date.now(),
    }, sessionId);

    // Handle messages
    webSocket.addEventListener('message', async (event) => {
      try {
        if (session.quit) {
          webSocket.close(1011, 'WebSocket broken');
          return;
        }

        const data = JSON.parse(event.data as string) as WSMessage;
        await this.handleMessage(sessionId, data);
      } catch (error) {
        this.sendToSocket(webSocket, {
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: Date.now(),
        });
      }
    });

    // Handle close
    webSocket.addEventListener('close', () => {
      session.quit = true;
      this.sessions.delete(sessionId);
      
      this.broadcast({
        type: 'user_left',
        payload: { userId },
        timestamp: Date.now(),
      });
    });

    // Handle error
    webSocket.addEventListener('error', () => {
      session.quit = true;
      this.sessions.delete(sessionId);
    });
  }

  private async handleMessage(sessionId: string, message: WSMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const timestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    switch (message.type) {
      case 'message':
        // Broadcast message to all sessions
        this.broadcast({
          type: 'message',
          payload: message.payload,
          userId: session.userId,
          timestamp,
        });
        break;

      case 'typing':
        // Broadcast typing indicator
        this.broadcast({
          type: 'typing',
          payload: { userId: session.userId },
          timestamp,
        }, sessionId);
        break;

      default:
        this.sendToSocket(session.webSocket, {
          type: 'error',
          payload: { message: 'Unknown message type' },
          timestamp,
        });
    }
  }

  private broadcast(message: WSMessage, excludeSessionId?: string): void {
    const messageStr = JSON.stringify(message);
    
    for (const [sessionId, session] of this.sessions) {
      if (excludeSessionId && sessionId === excludeSessionId) continue;
      if (session.quit) continue;

      try {
        session.webSocket.send(messageStr);
      } catch {
        session.quit = true;
        this.sessions.delete(sessionId);
      }
    }
  }

  private sendToSocket(webSocket: WebSocket, message: WSMessage): void {
    try {
      webSocket.send(JSON.stringify(message));
    } catch {
      // Socket closed
    }
  }

  // Hibernation support
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Find session for this WebSocket
    for (const [sessionId, session] of this.sessions) {
      if (session.webSocket === ws) {
        try {
          const data = JSON.parse(message as string) as WSMessage;
          await this.handleMessage(sessionId, data);
        } catch {
          this.sendToSocket(ws, {
            type: 'error',
            payload: { message: 'Invalid message format' },
            timestamp: Date.now(),
          });
        }
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.webSocket === ws) {
        session.quit = true;
        this.sessions.delete(sessionId);
        
        this.broadcast({
          type: 'user_left',
          payload: { userId: session.userId },
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

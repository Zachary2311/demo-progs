import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, useToastStore } from '../store';
import { chatApi } from '../api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import FileUpload from '../components/FileUpload';
import {
  PaperAirplaneIcon,
  SparklesIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  PaperClipIcon,
  StopIcon,
} from '@heroicons/react/24/outline';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
}

export default function Chat() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const {
    currentConversation,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    isLoading,
    setIsLoading,
    settings,
    setCurrentConversation,
  } = useChatStore();
  const { addToast } = useToastStore();

  const [input, setInput] = useState('');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load conversation messages
  useEffect(() => {
    const loadConversation = async () => {
      if (conversationId) {
        const result = await chatApi.getConversation(conversationId);
        if (result.success && result.data) {
          setCurrentConversation(result.data.conversation);
          setMessages(result.data.messages);
        } else {
          navigate('/');
        }
      } else {
        setMessages([]);
        setCurrentConversation(null);
      }
    };

    loadConversation();
  }, [conversationId, setMessages, setCurrentConversation, navigate]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }, []);

  const sendMessage = async (model: 'default' | 'deep-thinking' = 'default') => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    };

    addMessage(userMessage);
    setInput('');
    setIsLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Create streaming assistant message
    const assistantMessageId = crypto.randomUUID();
    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    let fullContent = '';

    const result = await chatApi.sendMessage(
      userMessage.content,
      model,
      currentConversation?.id,
      (chunk) => {
        fullContent += chunk;
        updateMessage(assistantMessageId, fullContent);
      }
    );

    if (!result.success) {
      addToast(result.error || 'Failed to send message', 'error');
      updateMessage(assistantMessageId, 'Sorry, something went wrong. Please try again.');
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleGenerateImage = async () => {
    if (!input.trim() || isLoading) return;

    const prompt = input.trim();
    setInput('');
    setIsLoading(true);

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: `🎨 Generate image: ${prompt}`,
    });

    const result = await chatApi.generateImage(prompt, currentConversation?.id);

    if (result.success && result.data) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `![Generated Image](${result.data.url})\n\n*Generated from prompt: "${prompt}"*`,
      });
    } else {
      addToast('Failed to generate image', 'error');
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I couldn\'t generate the image. Please try again.',
      });
    }

    setIsLoading(false);
  };

  const handlePlayAudio = async (messageId: string, text: string) => {
    if (playingAudio === messageId) {
      setPlayingAudio(null);
      return;
    }

    setPlayingAudio(messageId);

    const audioData = await chatApi.textToSpeech(text);
    if (audioData) {
      const blob = new Blob([audioData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => {
        setPlayingAudio(null);
        URL.revokeObjectURL(url);
      };
      
      audio.play();
    } else {
      addToast('Failed to generate audio', 'error');
      setPlayingAudio(null);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4">
            <h1 className="text-3xl font-bold mb-2">CF Chat</h1>
            <p className="text-gray-400 text-center max-w-md">
              Start a conversation with our AI assistant. Use the buttons below for special features.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4 px-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`py-6 ${
                  message.role === 'assistant' ? 'bg-chat-assistant -mx-4 px-4' : ''
                }`}
              >
                <div className="flex gap-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user' ? 'bg-primary-500' : 'bg-green-600'
                    }`}
                  >
                    {message.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <MarkdownRenderer content={message.content} />
                    
                    {/* Streaming indicator */}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-white/50 ml-1 animate-pulse" />
                    )}
                    
                    {/* Audio button for assistant messages */}
                    {message.role === 'assistant' && !message.isStreaming && message.content && (
                      <button
                        onClick={() => handlePlayAudio(message.id, message.content)}
                        className={`mt-3 flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors ${
                          playingAudio === message.id ? 'text-primary-500' : ''
                        }`}
                      >
                        <SpeakerWaveIcon className="w-4 h-4" />
                        {playingAudio === message.id ? 'Playing...' : 'Listen'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* File upload area */}
      {showFileUpload && (
        <div className="border-t border-chat-border p-4">
          <div className="max-w-3xl mx-auto">
            <FileUpload
              onFileUploaded={(file) => {
                addToast(`File uploaded: ${file.filename}`, 'success');
              }}
            />
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-chat-border p-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-chat-sidebar rounded-xl p-3">
            {/* File upload toggle */}
            <button
              onClick={() => setShowFileUpload(!showFileUpload)}
              className={`p-2 rounded-lg transition-colors ${
                showFileUpload ? 'bg-primary-500 text-white' : 'hover:bg-white/10'
              }`}
              title="Attach files"
            >
              <PaperClipIcon className="w-5 h-5" />
            </button>

            {/* Text input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              className="flex-1 bg-transparent resize-none outline-none max-h-52 text-white placeholder-gray-400"
              rows={1}
              disabled={isLoading}
            />

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {/* Deep thinking button */}
              {settings.enableDeepThinking && (
                <button
                  onClick={() => sendMessage('deep-thinking')}
                  disabled={!input.trim() || isLoading}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Deep Thinking (Advanced reasoning)"
                >
                  <SparklesIcon className="w-5 h-5 text-purple-400" />
                </button>
              )}

              {/* Image generation button */}
              {settings.enableImageGeneration && (
                <button
                  onClick={handleGenerateImage}
                  disabled={!input.trim() || isLoading}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Create an Image"
                >
                  <PhotoIcon className="w-5 h-5 text-blue-400" />
                </button>
              )}

              {/* Send/Stop button */}
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="p-2 rounded-lg bg-red-500 hover:bg-red-600 transition-colors"
                  title="Stop generating"
                >
                  <StopIcon className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Send message"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center mt-2">
            CF Chat may produce inaccurate information. Verify important facts.
          </p>
        </div>
      </div>
    </div>
  );
}

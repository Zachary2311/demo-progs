-- Add branching support to chat messages
ALTER TABLE chat_messages ADD COLUMN parent_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Index for efficient parent chain traversal
CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_message_id);

-- User preferences table for chat customization
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    custom_system_prompt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

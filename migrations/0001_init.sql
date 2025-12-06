-- Transcription history (Whisper)
CREATE TABLE IF NOT EXISTS transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  transcript_preview TEXT,
  word_count INTEGER,
  model TEXT,
  created_at INTEGER NOT NULL
);

-- TTS history (Aura 2)
CREATE TABLE IF NOT EXISTS tts_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text_preview TEXT,
  char_count INTEGER,
  speaker TEXT,
  model TEXT,
  created_at INTEGER NOT NULL
);

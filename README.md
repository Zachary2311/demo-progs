# Food Classifier Worker

A Cloudflare Workers API that uses Workers AI (Llama 3.1) to classify food and drink requests into three categories: `preparable`, `unpreparable`, or `discretionary`.

This API is designed to be called by a Discord bot backend to help categorize user requests in a restaurant/food context.

## Features

- **Workers AI Integration**: Uses `@cf/meta/llama-3.1-8b-instruct-fast` model
- **Three-way Classification**: 
  - `preparable` - Standard food/drink items and basic serving extras
  - `unpreparable` - Items clearly outside restaurant scope
  - `discretionary` - Requests that depend on staff discretion
- **Handles Edge Cases**: Properly classifies cocktails with sexual/risky names (e.g., "sex on the beach") as normal drinks
- **Production Ready**: Includes error handling, input validation, and CORS support

## Getting Started

### Prerequisites

- Node.js 16+ installed
- A Cloudflare account
- Wrangler CLI

### Installation

1. **Clone this repository**:
   ```bash
   git clone <repository-url>
   cd demo-progs
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Local Development

Run the Worker locally using Wrangler:

```bash
npm run dev
# or
wrangler dev
```

This starts a local development server at `http://localhost:8787`.

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
# or
wrangler deploy
```

## API Usage

### Endpoint

**POST** `/classify`

### Request

```bash
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{
    "text": "can I get a sex on the beach and some fries please"
  }'
```

**Request Body Schema**:
```json
{
  "text": "string"
}
```

- `text` (required): The user's request to classify

### Response

**Success (200 OK)**:
```json
{
  "label": "preparable",
  "reason": "This request is for a standard cocktail and a common food item."
}
```

**Error (400 Bad Request)** - Missing or empty text:
```json
{
  "error": "Missing 'text' field"
}
```

**Error (500/502)** - Internal or AI errors:
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

### Classification Labels

- **`preparable`**: Standard food, drinks (including cocktails with sexual names), or basic serving extras (napkins, straws, etc.)
- **`unpreparable`**: Non-food items, people, abstract concepts, or clearly out-of-scope requests
- **`discretionary`**: Off-menu items, small favors, or requests that depend on staff discretion

### Example Requests

**Preparable requests**:
```bash
# Standard food
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "pepperoni pizza"}'

# Cocktail with sexual name (treated as normal drink)
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "orgasm shot"}'

# Basic serving extra
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "extra napkins please"}'
```

**Unpreparable requests**:
```bash
# Non-food item
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "a new iPhone"}'

# Abstract concept
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "happiness"}'
```

**Discretionary requests**:
```bash
# Off-menu item
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "custom keto dessert"}'

# Small favor
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "phone charger"}'
```

## Discord Bot Integration

This API is designed to be called from a Discord bot backend. Here's a simple example:

```javascript
// In your Discord bot
async function handleUserRequest(userMessage) {
  const response = await fetch('https://your-worker.workers.dev/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: userMessage })
  });
  
  const result = await response.json();
  
  if (result.label === 'preparable') {
    // Process the order
    return `✅ Got it! I'll prepare: ${userMessage}`;
  } else if (result.label === 'discretionary') {
    // Ask for confirmation or notify staff
    return `⚠️ This might be possible: ${result.reason}`;
  } else {
    // Politely decline
    return `❌ Sorry, I can't help with that: ${result.reason}`;
  }
}
```

## Project Structure

```
.
├── src/
│   └── index.ts          # Main Worker implementation
├── wrangler.toml         # Cloudflare Workers configuration
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
├── .gitignore           # Git ignore patterns
└── README.md            # This file
```

## Configuration

### wrangler.toml

The Worker is configured with:
- **Name**: `food-classifier-worker`
- **AI Binding**: `AI` (for Workers AI access)
- **Compatibility Date**: `2024-12-08`

### Environment Variables

No environment variables are required. Workers AI is accessed via the built-in binding.

## Technical Details

- **Runtime**: Cloudflare Workers (ES modules)
- **Language**: TypeScript
- **AI Model**: `@cf/meta/llama-3.1-8b-instruct-fast`
- **AI Interface**: Workers AI binding (`env.AI.run`)

## Error Handling

The API includes comprehensive error handling:
- Invalid JSON → 400 Bad Request
- Missing/empty text field → 400 Bad Request
- Workers AI failures → 502 Bad Gateway
- Invalid AI responses → 502 Bad Gateway
- Unexpected errors → 500 Internal Server Error

## CORS Support

CORS is enabled for all origins (`*`) to allow the API to be called from web-based Discord bot dashboards or other frontends.

## License

MIT

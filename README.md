# Food Classifier Worker

A Cloudflare Workers API that uses Workers AI (Llama 3.1) to classify food and drink requests into three categories: `preparable`, `unpreparable`, or `discretionary`.

This API is designed to be called by FoodExpress, a permissive roleplay Discord bot that accepts creative food/drink orders while filtering out prohibited content.

## Features

- **Workers AI Integration**: Uses `@cf/meta/llama-3.1-8b-instruct-fast` model
- **Three-way Classification**: 
  - `preparable` - Real food/drink items (including creative/custom requests)
  - `unpreparable` - Prohibited content (sexual food, meme food, non-real items, illegal/offensive content, non-food items, people/companies, abstract concepts)
  - `discretionary` - Unusual but plausible requests requiring chef approval
- **Permissive Approach**: Welcomes creative and custom food/drink orders
- **Handles Edge Cases**: Properly classifies cocktails with sexual names (e.g., "sex on the beach") as normal drinks while rejecting sexually-shaped food
- **Authorization**: Optional Bearer token authentication via `Authorization` header
- **Production Ready**: Includes error handling, input validation, CORS support, and auth

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

**Authorization** (optional):
- If `AUTH_TOKEN` environment variable is set, requests must include an `Authorization` header with the format: `Authorization: Bearer <token>`
- Without the correct header, the API returns 401 Unauthorized

### Response

**Success (200 OK)**:
```json
{
  "label": "preparable",
  "reason": "This request is for a standard cocktail and a common food item."
}
```

**Error (401 Unauthorized)** - Missing or invalid Authorization header (when AUTH_TOKEN is set):
```json
{
  "error": "Unauthorized: Missing or invalid Authorization header"
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

- **`preparable`**: Real-world food/drink that can be prepared, including creative and custom requests. Includes standard dishes, cocktails (even with sexual names like "sex on the beach"), customizations, and service extras (napkins, straws, etc.)

- **`unpreparable`**: Requests that violate FoodExpress's prohibited categories:
  - Sexual/NSFW food items (e.g., penis-shaped cake, sexually explicit food)
  - Meme/joke food (e.g., "Krabby Patty", obviously joking requests like "100 patty burger")
  - Non-real-life food (e.g., "unicorn meat", "dragon eggs")
  - Illegal items (drugs, weapons)
  - Offensive content or slurs
  - Non-food items (electronics, products)
  - People, companies, or characters (roleplay restriction)
  - Abstract concepts (happiness, advice)
  - Out-of-scope services or conversational messages

- **`discretionary`**: Unusual but plausible food/drink requests requiring chef approval (e.g., "keto dessert not on menu", "10-patty burger" if serious, creative fusion dishes)

### Example Requests

**Preparable requests**:
```bash
# Standard food
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "pepperoni pizza"}'

# Creative/custom food
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "gluten-free pizza with vegan cheese"}'

# Cocktail with sexual name (allowed)
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "sex on the beach and fries"}'

# Basic serving extra
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "extra napkins please"}'
```

**Unpreparable requests**:
```bash
# Sexual/NSFW food (prohibited)
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "penis-shaped cake"}'

# Meme food
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "Krabby Patty from SpongeBob"}'

# Non-real-life food
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "unicorn meat"}'

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
# Off-menu item requiring chef approval
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "custom keto dessert"}'

# Unusual but serious request
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "can you make a 10-patty burger"}'

# Creative fusion dish
curl -X POST http://localhost:8787/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "sushi pizza hybrid"}'
```

## Discord Bot Integration

This API is designed to be called from FoodExpress or similar roleplay Discord bots. Here's a simple example:

```javascript
// In your Discord bot (FoodExpress)
async function handleUserRequest(userMessage, authToken) {
  const response = await fetch('https://your-worker.workers.dev/classify', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      // Optional: Include Authorization header if AUTH_TOKEN is set
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    body: JSON.stringify({ text: userMessage })
  });
  
  const result = await response.json();
  
  if (result.label === 'preparable') {
    // Process the order - FoodExpress accepts creative requests!
    return `✅ Got it! I'll prepare: ${userMessage}`;
  } else if (result.label === 'discretionary') {
    // Ask chef for approval on unusual requests
    return `⚠️ This is unusual, but might be possible! Chef will decide: ${result.reason}`;
  } else {
    // Decline prohibited requests
    return `❌ Sorry, that's not allowed at FoodExpress: ${result.reason}`;
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

- **`AUTH_TOKEN`** (optional): Bearer token for authorization. If set, all requests must include the header `Authorization: Bearer <token>`. Set this secret in Cloudflare:
  ```bash
  wrangler secret put AUTH_TOKEN
  ```
  Then provide the token to clients for authentication.

If `AUTH_TOKEN` is not set, the API is publicly accessible without authentication.

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

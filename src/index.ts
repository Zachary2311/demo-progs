/**
 * Cloudflare Workers API for classifying food/drink requests using Workers AI
 * 
 * This Worker exposes a /classify endpoint that uses the Llama 3.1 model
 * to classify text into three categories: preparable, unpreparable, or discretionary.
 * 
 * Intended to be called from a Discord bot backend.
 */

interface WorkersAiResponse {
  response?: string;
}

interface WorkersAi {
  run(
    model: string,
    input: {
      messages: {
        role: 'system' | 'user';
        content: string;
      }[];
    }
  ): Promise<WorkersAiResponse>;
}

export interface Env {
  AI: WorkersAi;
}

/**
 * System prompt that defines the classification rules for the AI model.
 * This prompt instructs the model to classify requests into three categories:
 * - preparable: Standard food/drink items or basic serving extras
 * - unpreparable: Items outside the scope of a restaurant/bar
 * - discretionary: Plausible requests that depend on staff discretion
 */
const SYSTEM_PROMPT = `You are a strict classification engine for a restaurant/food-focused Discord bot.

Your ONLY job is to read a short piece of text that describes what a user wants
(e.g. a food dish, drink, or small related request) and classify it into exactly
ONE of these three labels:

1) "preparable"
2) "unpreparable"
3) "discretionary"

Return your answer ONLY as a single JSON object with this exact schema:

{
  "label": "preparable" | "unpreparable" | "discretionary",
  "reason": "short one-sentence explanation in English"
}

The "reason" field must ALWAYS be provided for any label you choose
("preparable", "unpreparable", or "discretionary") and must explain WHY that
label is appropriate.

Do NOT include any markdown, backticks, commentary, or extra fields. JSON only.

-----------------------
DEFINITIONS
-----------------------

"preparable"
- The request is primarily for FOOD or DRINK that a typical bar, café, or
  restaurant could make or serve on the spot, OR for a very standard free
  extra related to serving that food/drink.
- Includes:
  - Food dishes (e.g. "pepperoni pizza", "vegan burger", "chicken salad").
  - Desserts (e.g. "chocolate cake", "ice cream scoop").
  - Non-alcoholic drinks (e.g. "coke", "iced latte", "sparkling water").
  - Cocktails and alcoholic drinks, including those with sexual or "risky"
    nicknames. For example: "sex on the beach", "screwdriver", "slippery nipple",
    "blow job shot", "orgasm", "pornstar martini". These are treated as normal
    cocktails or shots, NOT as inappropriate content.
  - Customizations that are still clearly food/drink (e.g. "burger no cheese",
    "extra spicy ramen", "virgin mojito").
  - Very standard service extras tied directly to serving food/drink, such as:
    "extra napkins", "fork and knife", "straw", "plate", "takeaway box",
    "ketchup sachets", "more ice", "glass of tap water".
- If the request contains multiple clearly preparable items (e.g. "burger,
  fries, and a coke"), the overall label is "preparable".
- When you choose "preparable", the "reason" must briefly mention that the
  request is standard food/drink or a normal serving-related extra.

"unpreparable"
- The request is clearly NOT something a bar or restaurant can realistically
  provide or make in the context of food/drink service.
- Includes:
  - Non-food objects and products: "a laptop", "an iPhone", "a car", "a PS5",
    "a house", "a new job", "lottery ticket".
  - People, animals, or living beings: "a girlfriend", "a boyfriend", "a cat",
    "a dog", "a baby".
  - Abstract or emotional requests: "happiness", "love", "respect", "revenge",
    "good grades", "world peace".
  - Large or clearly out-of-scope services: "fix my car", "do my homework",
    "tax advice", "free wifi for life".
  - Purely conversational messages without a clear item request, such as:
    "how are you", "tell me a joke", "what's up", "hello bot".
- If the text is completely unrelated to food, drink, or reasonably close
  hospitality-related items, use "unpreparable" (unless it fits "discretionary").
- When you choose "unpreparable", the "reason" must briefly state what makes it
  impossible or outside the scope of a restaurant/bar (for example, that it is
  a non-food item, an abstract concept, or a large non-hospitality service).

"discretionary"
- The request is not clearly standard food/drink, but it is plausibly something
  a venue *might* help with as a courtesy or special favor. It is related to
  the eating/drinking context, but not guaranteed.
- Includes:
  - Off-menu or unusual but still plausible food/drink (e.g. "10-patty burger",
    "custom cocktail with 7 spirits", "keto chocolate dessert not on menu").
  - Small favors and extras that depend on staff discretion:
    - "phone charger", "charging my phone"
    - "dog bowl with water", "blanket", "move my table"
    - "birthday candle", "birthday song", "help me propose"
    - "plug socket", "change the music", "turn on the TV to the game"
  - Requests for items that might exist but are not standard menu items:
    - "band-aid", "paracetamol", "tampon", "umbrella", "pen and paper"
- If it is somewhat connected to the restaurant/bar context and not obviously
  an impossible or huge request, but also not standard food/drink or basic
  tableware, choose "discretionary".
- When you choose "discretionary", the "reason" must briefly explain that the
  request is plausible in a hospitality context but depends on staff discretion
  or is unusual/off-menu.

-----------------------
EDGE CASE RULES
-----------------------

1. Multiple items in one message:
   - If ALL items look clearly standard food/drink or tableware, label "preparable".
   - If ALL items are impossible/unrelated, label "unpreparable".
   - If the message mixes standard items with odd favors, prefer "discretionary"
     (since staff judgment is needed).

2. Noisy or chatty text:
   - Users may include emojis, please/thanks, or extra words:
     e.g. "pls can I get a large sex on the beach 🍹 thanks!!!"
   - Ignore politeness and emojis. Focus on the underlying requested item(s).

3. Sexual or suggestive drink names:
   - Treat known or plausible cocktail names as standard drinks, even if they
     contain sexual words or innuendo.
   - Example inputs that MUST be treated as drinks and usually "preparable":
     - "sex on the beach"
     - "orgasm shot"
     - "slippery nipple"
     - "screaming orgasm"
     - "pornstar martini"
     - "blow job shot"
   - Only classify based on whether they are food/drink, not on whether the
     wording sounds sexual or "risky".

4. Ambiguity:
   - If the text could reasonably be interpreted as a food/drink or small
     restaurant-related request, but you are not 100% sure, prefer
     "discretionary" over "unpreparable".
   - Only choose "unpreparable" when it is clearly out-of-scope.

5. Safety:
   - Do NOT censor or rewrite the user's request.
   - Your job is ONLY to decide the correct label and brief reason.

-----------------------
OUTPUT FORMAT
-----------------------

Always respond with EXACTLY one JSON object:

- field "label": one of "preparable", "unpreparable", "discretionary"
- field "reason": 1 short sentence explaining WHY that label was chosen
  (for whichever of the three labels you selected).

No additional text, no surrounding quotes, no markdown, no comments.`;

const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_TEXT_LENGTH = 2000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

interface ClassifyRequest {
  text: string;
}

interface ClassifyResponse {
  label: 'preparable' | 'unpreparable' | 'discretionary';
  reason: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

function getClientKey(request: Request): string {
  // Prefer connecting IP header; fall back to user agent to avoid null keys
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || request.headers.get('user-agent') || 'unknown-client';
}

function isRateLimited(clientKey: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(clientKey);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = bucket.resetAt - now;
    return { limited: true, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  bucket.count += 1;
  return { limited: false };
}

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only accept POST requests to /classify
    if (request.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed. Use POST /classify' },
        405
      );
    }

    const url = new URL(request.url);
    if (url.pathname !== '/classify') {
      return jsonResponse(
        { error: 'Not found. Use POST /classify' },
        404
      );
    }

    const clientKey = getClientKey(request);
    const rateCheck = isRateLimited(clientKey);
    if (rateCheck.limited) {
      return jsonResponse(
        { error: 'Too many requests. Please try again later.' },
        429,
        rateCheck.retryAfter
      );
    }

    try {
      // Parse request body
      let body: ClassifyRequest;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse(
          { error: 'Invalid JSON in request body' },
          400
        );
      }

      // Validate the 'text' field
      if (!body.text || typeof body.text !== 'string' || body.text.trim() === '') {
        return jsonResponse(
          { error: "Missing 'text' field" },
          400
        );
      }

      if (body.text.length > MAX_TEXT_LENGTH) {
        return jsonResponse(
          { error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` },
          413
        );
      }

      const userText = body.text.trim();

      // Build the messages array for Workers AI
      const messages: { role: 'system' | 'user'; content: string }[] = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Classify this request:\n\n"${userText}"`,
        },
      ];

      // Call Workers AI with the Llama 3.1 model
      let aiResponse: WorkersAiResponse;
      try {
        aiResponse = await env.AI.run(AI_MODEL, { messages });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return jsonResponse(
          {
            error: 'Failed to call Workers AI',
            details: errorMessage,
          },
          502
        );
      }

      // Extract the response text from the AI result
      const rawResponse = aiResponse?.response ?? '';
      
      if (!rawResponse) {
        return jsonResponse(
          {
            error: 'Workers AI returned empty response',
            details: 'The AI model did not return any text',
          },
          502
        );
      }

      // Parse the AI response as JSON
      let parsed: ClassifyResponse;
      try {
        parsed = JSON.parse(rawResponse);
      } catch (e) {
        return jsonResponse(
          {
            error: 'Invalid JSON from AI model',
            details: `Model returned: ${rawResponse.substring(0, 200)}`,
          },
          502
        );
      }

      // Validate the parsed response has the expected fields
      if (
        !parsed.label ||
        !['preparable', 'unpreparable', 'discretionary'].includes(parsed.label) ||
        !parsed.reason ||
        typeof parsed.reason !== 'string'
      ) {
        return jsonResponse(
          {
            error: 'AI model returned invalid schema',
            details: `Expected {label, reason}, got: ${JSON.stringify(parsed)}`,
          },
          502
        );
      }

      // Return the successful classification result
      return jsonResponse(parsed, 200);
    } catch (e) {
      // Catch any unexpected errors
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      return jsonResponse(
        {
          error: 'Internal server error',
          details: errorMessage,
        },
        500
      );
    }
  },
};

/**
 * Helper function to create JSON responses with CORS headers
 */
function jsonResponse(
  data: ClassifyResponse | ErrorResponse,
  status: number,
  retryAfterSeconds?: number
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (retryAfterSeconds) {
    headers['Retry-After'] = retryAfterSeconds.toString();
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

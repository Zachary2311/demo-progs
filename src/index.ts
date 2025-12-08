/**
 * Cloudflare Workers API for classifying food/drink requests using Workers AI
 * 
 * This Worker exposes two classification endpoints:
 * - /classify: Uses the Llama 3.1 8B model for fast classification
 * - /classify-heavy: Uses the GPT-OSS 120B model for more powerful classification
 * 
 * Both endpoints classify text into three categories: preparable, unpreparable, or discretionary.
 * 
 * Intended to be called from a Discord bot backend.
 */

interface WorkersAiResponse {
  response?: string;
}

interface WorkersAiChatInput {
  messages: {
    role: 'system' | 'user';
    content: string;
  }[];
}

interface WorkersAiTextInput {
  prompt: string;
}

interface WorkersAi {
  run(
    model: string,
    input: WorkersAiChatInput | { input: WorkersAiTextInput }
  ): Promise<WorkersAiResponse>;
}

export interface Env {
  AI: WorkersAi;
  AUTH_TOKEN?: string;
}

/**
 * System prompt that defines the classification rules for the AI model.
 * This prompt instructs the model to classify requests into three categories:
 * - preparable: Standard food/drink items and creative real-world requests
 * - unpreparable: Sexual/NSFW food, meme food, non-real items, illegal/offensive content, non-food items, people/companies, abstract concepts
 * - discretionary: Unusual but plausible food requests requiring chef approval
 */
const SYSTEM_PROMPT = `You are a classification engine for FoodExpress, a permissive roleplay Discord bot.

FoodExpress is VERY relaxed about food orders and welcomes creative, unusual, and custom
food/drink requests. However, there are specific categories that are prohibited.

Your ONLY job is to read a short piece of text that describes what a user wants
and classify it into exactly ONE of these three labels:

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
- The request is for real-world FOOD or DRINK that could plausibly be prepared,
  OR for standard service extras. FoodExpress is permissive and accepts creative
  requests as long as they involve real food/drink.
- Includes:
  - Standard food dishes (e.g. "pepperoni pizza", "vegan burger", "chicken salad").
  - Creative and custom food (e.g. "gluten-free pizza with vegan cheese",
    "fusion taco-burrito hybrid", "spicy ramen with extra toppings").
  - Desserts (e.g. "chocolate cake", "ice cream scoop", "custom layered dessert").
  - Non-alcoholic drinks (e.g. "coke", "iced latte", "sparkling water").
  - Cocktails and alcoholic drinks, INCLUDING those with sexual or "risky"
    names. These are ALLOWED and treated as normal drinks:
    - "sex on the beach", "screaming orgasm", "slippery nipple",
      "blow job shot", "orgasm shot", "pornstar martini"
  - Customizations (e.g. "burger no cheese", "extra spicy", "virgin mojito").
  - Standard service extras: "extra napkins", "fork and knife", "straw", "plate",
    "takeaway box", "ketchup sachets", "more ice", "glass of tap water".
- If the request is for real food/drink (even if unusual or creative) and
  doesn't fall into prohibited categories, choose "preparable".
- When you choose "preparable", the "reason" must mention it's real food/drink
  or a standard extra.

"unpreparable"
- The request violates FoodExpress's prohibited categories OR is clearly
  outside the scope of food service.

PROHIBITED CATEGORIES (always "unpreparable"):
  1. Sexual/NSFW food items (shaped sexually or explicitly sexual):
     - "penis-shaped cake", "breast-shaped cupcakes", "edible body parts"
     - "cum shot dessert", "pussy-flavored drink"
     - NOTE: Standard cocktail names like "sex on the beach" are ALLOWED
       and should be "preparable", not this category.

  2. Meme food / joke food (obvious internet memes or impossible exaggerations):
     - "Krabby Patty" (SpongeBob reference)
     - "burger with 100 patties" (when clearly a meme/joke, not serious)
     - "unicorn frappuccino" (if referencing the meme, not a real request)
     - Foods from fictional universes when meant literally

  3. Non-real-life food (fantasy/mythical ingredients):
     - "unicorn meat", "dragon eggs", "phoenix tears"
     - "mermaid sushi", "griffin steak"

  4. Illegal items:
     - Drugs: "weed brownie", "cocaine", "meth"
     - Weapons: "knife", "gun"
     - Contraband

  5. Offensive content / slurs:
     - Requests containing racial slurs, hate speech, or offensive language
     - Items named with derogatory terms

  6. Non-food items (objects, electronics, products):
     - "laptop", "iPhone", "car", "PS5", "house", "lottery ticket"

  7. People, companies, or characters (this is roleplay, no real entities):
     - "Taylor Swift", "a McDonald's employee", "Elon Musk"
     - "a girlfriend", "a boyfriend", "a baby"

  8. Abstract concepts:
     - "happiness", "love", "respect", "revenge", "good grades", "world peace"

  9. Large out-of-scope services:
     - "fix my car", "do my homework", "tax advice", "free wifi for life"

  10. Purely conversational (no food/drink request):
     - "how are you", "tell me a joke", "what's up", "hello bot"

- When you choose "unpreparable", the "reason" must state which prohibited
  category it falls into (e.g., "non-food item", "meme food", "sexual food item",
  "non-real ingredient", "illegal item", "offensive content").

"discretionary"
- The request is for real food/drink but is unusual, off-menu, or requires
  chef approval. It's not prohibited, but not standard either.
- Includes:
  - Off-menu or unusual but plausible food/drink:
    - "keto chocolate dessert not on menu"
    - "custom 10-patty burger" (if serious request, not a meme)
    - "gluten-free vegan fusion dish"
    - "custom cocktail with 7 different spirits"
  - Creative combinations that might be feasible:
    - "sushi pizza hybrid"
    - "burger with donut buns"
    - "ice cream with savory toppings"
  - Small favors that might be available but aren't guaranteed (NOTE: these
    are NOT food, but FoodExpress might help as courtesy):
    - "phone charger", "dog bowl with water", "blanket"
    - "birthday candle", "help me propose", "change the music"
- If it's creative/unusual but involves real food/drink and isn't prohibited,
  choose "discretionary".
- When you choose "discretionary", the "reason" must explain it's an unusual
  or off-menu request requiring chef approval.

-----------------------
EDGE CASE RULES
-----------------------

1. Distinguish serious requests from memes:
   - "10-patty burger" could be "discretionary" (serious custom order) OR
     "unpreparable" (obvious joke/meme). Use context:
     - If phrased seriously ("can you make a 10-patty burger?") → discretionary
     - If hyperbolic/joking ("gimme 100 patty burger lol") → unpreparable (meme)

2. Sexual drink names vs sexual food:
   - Standard cocktails with sexual names → "preparable" (allowed)
   - Food shaped sexually or explicitly NSFW → "unpreparable" (prohibited)

3. Multiple items in one message:
   - If ALL items are standard → "preparable"
   - If ALL items are prohibited → "unpreparable"
   - If mixed → use the most restrictive label (if any item is unpreparable,
     label the whole request "unpreparable")

4. Noisy or chatty text:
   - Ignore emojis, politeness, or extra words. Focus on the underlying item(s).

5. Ambiguity:
   - If unclear whether something is a serious creative request or a meme,
     prefer "discretionary" over "unpreparable".
   - Only choose "unpreparable" when clearly prohibited or out-of-scope.

6. Safety:
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

/**
 * System prompt for the heavy model - more watchful and stricter interpretation.
 * This prompt applies higher scrutiny to edge cases and ambiguous requests,
 * preferring "unpreparable" or "discretionary" over "preparable" when in doubt.
 */
const SYSTEM_PROMPT_HEAVY = `You are a strict classification engine for FoodExpress, a Discord bot platform.

Your ONLY job is to read a short piece of text and classify it into exactly ONE of these three labels:

1) "preparable"
2) "unpreparable"
3) "discretionary"

Return your answer ONLY as a single JSON object with this exact schema:

{
  "label": "preparable" | "unpreparable" | "discretionary",
  "reason": "short one-sentence explanation in English"
}

The "reason" field must ALWAYS be provided and must explain WHY that label was chosen.

Do NOT include any markdown, backticks, commentary, or extra fields. JSON only.

-----------------------
KEY DIFFERENCES FROM STANDARD MODE
-----------------------

This is STRICT mode. Apply heightened scrutiny to:
- Ambiguous or borderline requests
- Requests that could be interpreted as jokes or memes
- Requests with hidden or double meanings
- Requests that blur the line between categories

When in doubt, prefer the more restrictive label.

-----------------------
DEFINITIONS (STRICT INTERPRETATION)
-----------------------

"preparable"
- ONLY clear, unambiguous requests for real food/drink that is genuinely preparable.
- ONLY standard items or clearly serious custom food requests.
- ONLY if the request demonstrates zero ambiguity about being food/drink.
- Examples:
  - "pepperoni pizza", "iced coffee", "grilled chicken"
  - "gluten-free vegan pizza" (clear dietary need stated)
  - "water with ice" (simple, unambiguous)

"unpreparable"
- ANY request that violates prohibited categories.
- ANY request with sexual, offensive, or suggestive content (STRICTER than standard mode).
- ANY obvious memes, jokes, or non-serious requests.
- ANY requests that could be interpreted as double meanings or innuendo.
- ANY requests for non-food items.
- ANY requests for fictional/impossible items.
- ANY requests with illegal content.
- ANY requests containing slurs or hate speech.
- ANY purely conversational requests.

PROHIBITED CATEGORIES (STRICT):
  1. Sexual/NSFW content:
     - Explicitly sexual food descriptions or innuendo
     - NOTE: Even "harmless" sexual cocktail names should be treated with scrutiny
       in strict mode. If the name is purely descriptive of the drink, it's OK.
       If it seems designed to be provocative, flag it.
  2. Memes and jokes (including subtle ones)
  3. Fantasy/fictional items
  4. Illegal items
  5. Non-food items
  6. People, companies, or characters
  7. Abstract concepts
  8. Services outside food preparation
  9. Offensive content or slurs
  10. Conversational/non-food requests

"discretionary"
- Real food/drink that is genuinely unusual, custom, or off-menu.
- Requests that are clearly serious custom orders but require special handling.
- Examples:
  - "custom 10-patty burger" (if it seems like a serious request)
  - "sushi pizza hybrid" (creative but plausible)
  - "keto chocolate cake without sugar" (specialized diet)
  - "spicy beyond limits" (if genuinely meant as a serious request)

STRICT RULES FOR EDGE CASES:

1. When ambiguous between meme and serious request:
   - If there's ANY possibility it's a meme or joke → "unpreparable"
   - Serious custom orders use "discretionary", never "preparable"

2. Sexual/suggestive content:
   - In strict mode, err on the side of flagging as "unpreparable"
   - Only allow if it's a genuinely neutral drink name

3. Hyperbole and exaggeration:
   - "super spicy", "crazy hot", "extreme" → likely joke or meme → "unpreparable"
   - Unless it's clearly a serious dietary/flavor preference

4. Multiple items:
   - If ANY item is unpreparable → the entire request is "unpreparable"
   - Mixed clear items + ambiguous items → "unpreparable"

5. Ambiguity rule:
   - When unclear, choose "unpreparable" or "discretionary", NOT "preparable"
   - "preparable" requires near-certainty the request is genuine food/drink

-----------------------
OUTPUT FORMAT
-----------------------

Always respond with EXACTLY one JSON object:

- field "label": one of "preparable", "unpreparable", "discretionary"
- field "reason": 1 short sentence explaining the classification

No additional text, no surrounding quotes, no markdown, no comments.`;

const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const AI_MODEL_HEAVY = '@cf/openai/gpt-oss-120b';
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
    // Check Authorization header if AUTH_TOKEN is set
    if (env.AUTH_TOKEN) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.AUTH_TOKEN}`) {
        return jsonResponse(
          { error: 'Unauthorized: Missing or invalid Authorization header' },
          401
        );
      }
    }

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed. Use POST /classify or POST /classify-heavy' },
        405
      );
    }

    const url = new URL(request.url);
    
    // Determine which endpoint and AI model to use
    let aiModel: string;
    if (url.pathname === '/classify') {
      aiModel = AI_MODEL;
    } else if (url.pathname === '/classify-heavy') {
      aiModel = AI_MODEL_HEAVY;
    } else {
      return jsonResponse(
        { error: 'Not found. Use POST /classify or POST /classify-heavy' },
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

      // Select the appropriate system prompt based on the endpoint
      const systemPrompt = aiModel === AI_MODEL_HEAVY ? SYSTEM_PROMPT_HEAVY : SYSTEM_PROMPT;

      // Call Workers AI with the selected model
      let aiResponse: WorkersAiResponse;
      try {
        if (aiModel === AI_MODEL_HEAVY) {
          // GPT-OSS-120B uses text completion format with 'input.prompt'
          const prompt = `${systemPrompt}\n\nClassify this request:\n\n"${userText}"`;
          aiResponse = await env.AI.run(aiModel, { 
            input: { prompt } 
          });
        } else {
          // Llama 3.1 uses chat format with 'messages'
          const messages: { role: 'system' | 'user'; content: string }[] = [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `Classify this request:\n\n"${userText}"`,
            },
          ];
          aiResponse = await env.AI.run(aiModel, { messages });
        }
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

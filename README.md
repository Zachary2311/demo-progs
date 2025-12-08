# Discord AI FAQ Generator Bot

A Discord bot that exports server data (messages, users, and roles) and generates an AI-powered FAQ using OpenAI's latest models with FLEX processing.

## Features

- **Complete Data Export**: Fetches all messages, users, and roles from your Discord server
- **AI-Powered Role Analysis**: Uses OpenAI's o4-mini model with FLEX processing to rank roles by trustworthiness
- **Smart Message Prioritization**: Prioritizes messages from users with higher trustworthiness scores
- **Automated FAQ Generation**: Generates comprehensive FAQs using OpenAI's o4-mini with high reasoning capabilities
- **Slash Command Interface**: Simple `/beginexport` command to start the process

## Requirements

- Node.js 16.0.0 or higher
- Discord Bot Token with proper permissions
- OpenAI API Key with access to o4-mini model

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd demo-progs
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Fill in your credentials in the `.env` file:
   - `DISCORD_TOKEN`: Your Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)
   - `CLIENT_ID`: Your Discord application's client ID
   - `OPENAI_API_KEY`: Your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)

## Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Go to the "Bot" section and create a bot if you haven't already
4. Copy the bot token and add it to your `.env` file
5. Enable the following Privileged Gateway Intents:
   - **Server Members Intent** (required to fetch all members)
   - **Message Content Intent** (required to read message content)
6. Go to the "OAuth2" > "URL Generator" section
7. Select the following scopes:
   - `bot`
   - `applications.commands`
8. Select the following bot permissions:
   - Read Messages/View Channels
   - Read Message History
   - Send Messages
9. Copy the generated URL and use it to invite the bot to your server

## Usage

1. Start the bot:
```bash
npm start
```

2. In your Discord server, use the slash command:
```
/beginexport
```

3. The bot will:
   - Fetch all messages from all accessible channels
   - Fetch all users and their roles
   - Use OpenAI to rank roles by trustworthiness (using FLEX processing for cost efficiency)
   - Prioritize messages from users with higher trustworthiness
   - Generate a comprehensive FAQ based on the analyzed messages (using o4-mini with high reasoning)
   - Send the generated FAQ back to the channel

## How It Works

### 1. Data Collection
- Fetches messages from all text channels (paginated in batches of 100)
- Fetches all guild members and their roles
- Collects role information including permissions and hierarchy

### 2. Role Trustworthiness Analysis
- Sends role data to OpenAI's o4-mini model
- Uses FLEX processing (`service_tier: "flex"`) for cost-effective analysis
- Ranks roles based on:
  - Role position in hierarchy
  - Granted permissions
  - Role naming conventions
- Returns trustworthiness scores (1-10 scale)

### 3. Message Prioritization
- Assigns trustworthiness scores to users based on their highest-ranked role
- Filters out short or empty messages
- Sorts messages by user trustworthiness

### 4. FAQ Generation
- Takes top 500 messages from trustworthy users
- Sends to OpenAI's o4-mini model with FLEX processing
- Uses high reasoning mode to:
  - Identify common questions and topics
  - Group related discussions
  - Generate clear, concise answers
  - Format as a comprehensive FAQ document

## OpenAI FLEX Processing

This bot uses OpenAI's FLEX processing tier, which offers:
- **~50% cost reduction** compared to standard API rates
- Ideal for non-urgent, batch-style operations
- Automatic retries for timeouts
- Perfect for the asynchronous nature of Discord commands

FLEX is enabled by setting `service_tier: "flex"` in the API requests.

## Technical Details

- **Discord.js Version**: 14.x
- **OpenAI Model**: o4-mini (latest small reasoning model as of April 2025)
- **Service Tier**: FLEX (cost-effective processing)
- **Required Intents**: Guilds, GuildMessages, MessageContent, GuildMembers

## Limitations

- Message fetching is limited by Discord's API rate limits
- Very large servers may take several minutes to process
- OpenAI FLEX processing may have longer response times (acceptable for this use case)
- The bot needs proper permissions to access all channels

## Security Considerations

- Never commit your `.env` file (it's in `.gitignore`)
- Keep your Discord token and OpenAI API key secure
- The bot requires significant permissions - only add it to trusted servers
- Consider implementing rate limiting for production use

## Troubleshooting

**Bot doesn't respond to commands:**
- Ensure the bot is online and connected
- Verify slash commands are registered (check console on startup)
- Check bot permissions in your Discord server

**"Missing Access" errors:**
- Ensure the bot has permission to read the specific channels
- Verify the bot role is positioned correctly in the role hierarchy

**OpenAI API errors:**
- Verify your API key is correct
- Ensure you have access to the o4-mini model
- Check your OpenAI account has available credits

**"Missing Intents" errors:**
- Enable required privileged intents in the Discord Developer Portal
- Restart the bot after enabling intents

## Contributing

Feel free to submit issues or pull requests to improve the bot!

## License

ISC

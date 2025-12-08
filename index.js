const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');
require('dotenv').config();

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is not set in environment variables');
    console.error('Please create a .env file with your Discord bot token');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ Error: CLIENT_ID is not set in environment variables');
    console.error('Please add your Discord application client ID to the .env file');
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY is not set in environment variables');
    console.error('Please add your OpenAI API key to the .env file');
    process.exit(1);
}

// Initialize Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to fetch all messages from all text channels
async function fetchAllMessages(guild) {
    const allMessages = [];
    const channels = guild.channels.cache.filter(channel => channel.isTextBased());

    console.log(`Fetching messages from ${channels.size} channels...`);

    for (const [channelId, channel] of channels) {
        try {
            let lastId;
            let fetchedCount = 0;

            while (true) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const fetched = await channel.messages.fetch(options);
                if (fetched.size === 0) break;

                fetched.forEach(message => {
                    allMessages.push({
                        id: message.id,
                        content: message.content,
                        author: {
                            id: message.author.id,
                            username: message.author.username,
                            tag: message.author.tag,
                        },
                        channelId: channel.id,
                        channelName: channel.name,
                        createdAt: message.createdAt,
                    });
                });

                fetchedCount += fetched.size;
                lastId = fetched.last().id;

                if (fetched.size < 100) break;
            }

            console.log(`Fetched ${fetchedCount} messages from #${channel.name}`);
        } catch (error) {
            console.error(`Error fetching messages from channel ${channel.name}:`, error.message);
        }
    }

    return allMessages;
}

// Helper function to fetch all members and their roles
async function fetchAllMembersAndRoles(guild) {
    console.log('Fetching all guild members...');
    const members = await guild.members.fetch();

    const memberData = [];
    const roleData = [];

    // Collect all unique roles
    const rolesMap = new Map();
    guild.roles.cache.forEach(role => {
        if (role.name !== '@everyone') {
            rolesMap.set(role.id, {
                id: role.id,
                name: role.name,
                position: role.position,
                permissions: role.permissions.toArray(),
                color: role.hexColor,
            });
        }
    });

    // Collect member data with their roles
    members.forEach(member => {
        const userRoles = member.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => ({
                id: role.id,
                name: role.name,
                position: role.position,
            }));

        memberData.push({
            id: member.user.id,
            username: member.user.username,
            tag: member.user.tag,
            roles: userRoles,
            joinedAt: member.joinedAt,
        });
    });

    roleData.push(...rolesMap.values());

    console.log(`Fetched ${memberData.length} members and ${roleData.length} roles`);

    return { members: memberData, roles: roleData };
}

// Use OpenAI with FLEX processing to rank roles by trustworthiness
async function rankRolesByTrustworthiness(roles) {
    console.log('Ranking roles by trustworthiness using OpenAI (o4-mini with FLEX)...');

    const rolesList = roles.map(role => ({
        name: role.name,
        position: role.position,
        permissions: role.permissions,
    }));

    const prompt = `You are a Discord server security analyst. Given the following list of Discord roles with their positions and permissions, rank them in order of potential trustworthiness (from most trustworthy to least trustworthy). Consider factors like:
- Role position (higher positions typically indicate more trust)
- Permissions granted (administrative permissions indicate higher trust)
- Role name (moderator, admin, trusted member, etc.)

Roles:
${JSON.stringify(rolesList, null, 2)}

Provide a ranked list from most trustworthy to least trustworthy, with a brief explanation for each ranking. Format your response as a JSON array with objects containing "roleName" and "trustworthiness" (score 1-10, where 10 is most trustworthy).`;

    try {
        const response = await openai.chat.completions.create({
            model: 'o4-mini',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            service_tier: 'flex', // Using FLEX processing for cost efficiency
            response_format: { type: 'json_object' },
        });

        const ranking = JSON.parse(response.choices[0].message.content);
        console.log('Role trustworthiness ranking completed');
        return ranking;
    } catch (error) {
        console.error('Error ranking roles:', error.message);
        // Fallback: simple position-based ranking
        return roles
            .sort((a, b) => b.position - a.position)
            .map((role, index) => ({
                roleName: role.name,
                trustworthiness: 10 - Math.floor((index / roles.length) * 9),
            }));
    }
}

// Filter and prioritize messages from trustworthy users
function prioritizeMessages(messages, members, roleRanking) {
    console.log('Prioritizing messages from trustworthy users...');

    const userTrustworthiness = new Map();

    // Calculate trustworthiness score for each user
    members.forEach(member => {
        let maxTrust = 0;
        member.roles.forEach(role => {
            const ranking = roleRanking.rankings?.find(r => r.roleName === role.name) || 
                          roleRanking.find(r => r.roleName === role.name);
            if (ranking && ranking.trustworthiness > maxTrust) {
                maxTrust = ranking.trustworthiness;
            }
        });
        userTrustworthiness.set(member.id, maxTrust);
    });

    // Sort messages by user trustworthiness
    const prioritizedMessages = messages
        .filter(msg => msg.content && msg.content.length > 10) // Filter out short/empty messages
        .map(msg => ({
            ...msg,
            trustScore: userTrustworthiness.get(msg.author.id) || 0,
        }))
        .sort((a, b) => b.trustScore - a.trustScore);

    console.log(`Prioritized ${prioritizedMessages.length} messages`);
    return prioritizedMessages;
}

// Generate FAQ using OpenAI with high reasoning (o4-mini)
async function generateFAQ(messages) {
    console.log('Generating FAQ using OpenAI (o4-mini with high reasoning)...');

    // Take top messages (limit to avoid token limits)
    const topMessages = messages.slice(0, 500);
    const messageTexts = topMessages.map(msg => 
        `[${msg.author.username}]: ${msg.content}`
    ).join('\n');

    const prompt = `You are an expert FAQ generator. Analyze the following Discord messages from trusted community members and create a comprehensive FAQ (Frequently Asked Questions) document. 

Instructions:
1. Identify common questions, topics, and issues discussed
2. Group related questions together
3. Provide clear, concise answers based on the community discussions
4. Include at least 10-15 FAQ entries
5. Format the FAQ in a clear, readable markdown format

Messages:
${messageTexts}

Generate a well-structured FAQ document based on these messages.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'o4-mini',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            service_tier: 'flex', // Using FLEX processing
            max_completion_tokens: 4000,
        });

        const faq = response.choices[0].message.content;
        console.log('FAQ generation completed');
        return faq;
    } catch (error) {
        console.error('Error generating FAQ:', error.message);
        throw error;
    }
}

// Register slash command
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('beginexport')
            .setDescription('Export all server data and generate an AI-powered FAQ')
            .toJSON(),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Successfully registered slash commands');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Handle interaction events
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'beginexport') {
        await interaction.deferReply({ ephemeral: false });

        try {
            const guild = interaction.guild;

            // Step 1: Fetch all messages
            await interaction.editReply('📥 Fetching all messages from channels...');
            const messages = await fetchAllMessages(guild);

            // Step 2: Fetch all users and roles
            await interaction.editReply('👥 Fetching all users and roles...');
            const { members, roles } = await fetchAllMembersAndRoles(guild);

            // Step 3: Rank roles by trustworthiness using AI
            await interaction.editReply('🤖 Analyzing role trustworthiness with AI (FLEX processing)...');
            const roleRanking = await rankRolesByTrustworthiness(roles);

            // Step 4: Prioritize messages from trustworthy users
            await interaction.editReply('⚖️ Prioritizing messages from trustworthy users...');
            const prioritizedMessages = prioritizeMessages(messages, members, roleRanking);

            // Step 5: Generate FAQ using AI
            await interaction.editReply('📝 Generating FAQ with AI (high reasoning mode)...');
            const faq = await generateFAQ(prioritizedMessages);

            // Step 6: Send the FAQ (split if too long)
            const maxLength = 2000;
            if (faq.length > maxLength) {
                const parts = [];
                for (let i = 0; i < faq.length; i += maxLength) {
                    parts.push(faq.substring(i, i + maxLength));
                }

                await interaction.editReply('✅ **Export Complete!** Here is the generated FAQ:\n\n' + parts[0]);
                
                for (let i = 1; i < parts.length; i++) {
                    await interaction.followUp(parts[i]);
                }
            } else {
                await interaction.editReply('✅ **Export Complete!** Here is the generated FAQ:\n\n' + faq);
            }

            console.log('Export completed successfully');
            console.log(`Total messages: ${messages.length}`);
            console.log(`Total members: ${members.length}`);
            console.log(`Total roles: ${roles.length}`);
        } catch (error) {
            console.error('Error during export:', error);
            await interaction.editReply('❌ An error occurred during export: ' + error.message);
        }
    }
});

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    registerCommands();
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

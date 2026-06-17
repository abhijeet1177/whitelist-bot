require('dotenv').config(); // Load environment variables first
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const { QuickDB } = require('quick.db');
const config = require('./config.json');

const db = new QuickDB();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// Configure your whitelist questions here
const QUESTIONS = [
    "What is your In-Game ID and Age?",
    "Which servers have you played on before?",
    "What do you understand by Fail RP and Metagaming?"
];

// ==========================================
// 1. BOT READY & SLASH COMMAND REGISTRATION
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is now Online!`);
    
    const commands = [
        {
            name: 'setup-whitelist',
            description: 'Configure the whitelist system',
            options: [
                { name: 'role', description: 'Select the Whitelisted/Verified role', type: 8, required: true },
                { name: 'log_channel', description: 'Select the channel for logs and approvals', type: 7, required: true }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('⏳ Registering slash commands...');
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Slash Commands Successfully Registered!');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
});

// ==========================================
// 2. SETUP COMMANDS (SLASH & BACKUP PREFIX)
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-whitelist') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ Permission denied. Administrator access required.", ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const logChannel = interaction.options.getChannel('log_channel');

        await db.set(`guild_config_${interaction.guild.id}`, { roleId: role.id, logChannelId: logChannel.id });
        return interaction.reply({ content: `✅ **Setup Successful!**\n🔹 Role: <@&${role.id}>\n🔹 Channel: <#${logChannel.id}>`, ephemeral: true });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!setup')) {
        if (!message.member.permissions.has('Administrator')) return;

        const args = message.content.split(' ');
        const roleMention = args[1];
        const channelMention = args[2];

        if (!roleMention || !channelMention) {
            return message.reply("❌ **Correct Format:** \`!setup @RoleName #ChannelName\`");
        }

        const roleId = roleMention.replace(/[<@&>]/g, '');
        const logChannelId = channelMention.replace(/[<#>]/g, '');

        await db.set(`guild_config_${message.guild.id}`, { roleId, logChannelId });
        return message.reply(`✅ **Prefix Setup Complete!**\nRole ID: \`${roleId}\`\nChannel ID: \`${logChannelId}\``);
    }
});

// ==========================================
// 3. 4-DIGIT VERIFICATION & DM QUESTIONS
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const codeRegex = /^\d{4}$/; // Matches exactly 4 digits

    if (codeRegex.test(message.content)) {
        const userId = message.author.id;
        const guildId = message.guild.id;

        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig) return message.reply("⚠️ Bot is not configured yet. Ask an admin to run \`/setup-whitelist\` or \`!setup\`.");

        // GLITCH FIX 1: Already verified user handling
        const isVerified = await db.get(`verified_${guildId}_${userId}`);
        if (isVerified) return message.reply("❌ Put the code again");

        const activeApp = await db.get(`active_app_${userId}`);
        if (activeApp) return message.reply("⏳ Your application process is already running. Please check your DMs!");

        try {
            await db.set(`active_app_${userId}`, { guildId, currentStep: 0, answers: [] });
            await message.author.send(`✅ **Code [${message.content}] verified!**\n\n**Question 1:** ${QUESTIONS[0]}`);
            await message.reply("📥 I have sent the questions to your DM!");
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            await message.reply("❌ Your DMs are closed! Please open your privacy settings and try again.");
        }
    }
});

// ==========================================
// 4. DM QUESTIONNAIRE HANDLING
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild) return; // Process DM only

    const userId = message.author.id;
    const appData = await db.get(`active_app_${userId}`);
    if (!appData) return;

    let { guildId, currentStep, answers } = appData;
    answers.push(message.content);
    currentStep++;

    if (currentStep < QUESTIONS.length) {
        await db.set(`active_app_${userId}`, { guildId, currentStep, answers });
        await message.author.send(`**Question ${currentStep + 1}:** ${QUESTIONS[currentStep]}`);
    } else {
        await message.author.send("🎉 Your answers have been submitted! Please wait for staff verification.");
        
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const logChannel = await client.channels.fetch(serverConfig.logChannelId).catch(() => null);

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📝 New Whitelist Application")
                .setColor(0x3498DB)
                .setDescription(`**User:** <@${userId}> (\`${userId}\`)`)
                .setTimestamp();

            QUESTIONS.forEach((q, idx) => embed.addFields({ name: `❓ ${q}`, value: `➡️ ${answers[idx]}` }));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('Approve ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${userId}`).setLabel('Reject ❌').setStyle(ButtonStyle.Danger)
            );

            await logChannel.send({ embeds: [embed], components: [row] });
        }
        await db.delete(`active_app_${userId}`);
    }
});

// ==========================================
// 5. BUTTON ACTIONS & ROLE GLITCH FIX
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, targetUserId] = interaction.customId.split('_');
    const guildId = interaction.guild.id;
    const serverConfig = await db.get(`guild_config_${guildId}`);

    if (!interaction.member.permissions.has('ManageRoles')) {
        return interaction.reply({ content: "❌ You do not have permission to manage applications.", ephemeral: true });
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

    if (action === 'approve') {
        if (!targetMember) return interaction.reply({ content: "❌ User is no longer in the server.", ephemeral: true });

        try {
            // GLITCH FIX 2: Safe Role Hierarchy Assignment
            await targetMember.roles.add(serverConfig.roleId);
            await db.set(`verified_${guildId}_${targetUserId}`, true);

            const approvedEmbed = EmbedBuilder.from(interaction.message.embeds).setColor(0x2ECC71).setTitle("✅ Application Approved");
            await interaction.update({ embeds: [approvedEmbed], components: [] });
            await targetMember.send("🎉 Congratulations! Your whitelist application has been approved!").catch(() => null);
        } catch (error) {
            console.error("Role Error Logged:", error);
            return interaction.reply({ content: "❌ **Role Error!** Check Discord Server Settings -> Roles, and drag the bot role above the whitelisted role.", ephemeral: true });
        }
    }

    if (action === 'reject') {
        const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds).setColor(0xE74C3C).setTitle("❌ Application Rejected");
        await interaction.update({ embeds: [rejectedEmbed], components: [] });
        if (targetMember) await targetMember.send("❌ Sorry, your whitelist application has been rejected.").catch(() => null);
    }
});

client.login(process.env.DISCORD_TOKEN);

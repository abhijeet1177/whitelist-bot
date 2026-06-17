require('dotenv').config();
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

// The 4 Whitelist Questions for QUIL SMP
const QUESTIONS = [
    "What is your In-Game Name (IGN)?",
    "What is your Age?",
    "Have you played on any SMP before? (If yes, name it)",
    "Why do you want to join QUIL SMP?"
];

// REGISTER SLASH COMMAND
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is active and ready for QUIL SMP!`);
    
    const commands = [
        {
            name: 'setup-whitelist',
            description: 'Send the official Whitelist Access Terminal panel',
            options: [
                { name: 'role', description: 'Select the Whitelist Member role', type: 8, required: true },
                { name: 'log_channel', description: 'Select the Staff Log/Approval channel', type: 7, required: true }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Whitelist Setup Command Registered Successfully!');
    } catch (error) {
        console.error('Slash registration error:', error);
    }
});

// SETUP COMMAND & CREATING THE EMBED PANEL WITH BUTTON
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-whitelist') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ You need Administrator permissions to run this.", ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const logChannel = interaction.options.getChannel('log_channel');

        // Save server configuration
        await db.set(`guild_config_${interaction.guild.id}`, { roleId: role.id, logChannelId: logChannel.id });

        // Create the Access Terminal Embed for QUIL SMP
        const panelEmbed = new EmbedBuilder()
            .setTitle("🛑 QUIL SMP : ACCESS TERMINAL 🛑")
            .setColor(0xE74C3C)
            .setDescription(
                "Welcome to the official **QUIL SMP** Whitelist Portal.\n\n" +
                "**📋 Requirements:**\n" +
                "• Follow all server rules.\n" +
                "• Provide your exact Minecraft Username.\n" +
                "• Be respectful to the community.\n\n" +
                "Click the button below to submit your application to our staff."
            )
            .setFooter({ text: "QUIL SMP Security System" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_whitelist_app')
                .setLabel('Apply For Whitelist 📝')
                .setStyle(ButtonStyle.Success)
        );

        // Send to the channel where command was typed
        await interaction.reply({ content: "✅ Whitelist system setup successfully here!", ephemeral: true });
        return interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    }
});

// INTERACTION BUTTON HANDLER (APPLY BUTTON & APPROVALS)
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;

    // 1. WHEN USER CLICKS "APPLY FOR WHITELIST"
    if (interaction.isButton() && interaction.customId === 'start_whitelist_app') {
        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig) {
            return interaction.reply({ content: "❌ System error: Setup configuration is missing.", ephemeral: true });
        }

        // Check if user already has the whitelist role
        if (interaction.member.roles.cache.has(serverConfig.roleId)) {
            return interaction.reply({ content: "❌ You are already whitelisted on this server!", ephemeral: true });
        }

        // Check if application session is already active
        const activeApp = await db.get(`active_app_${userId}`);
        if (activeApp) {
            return interaction.reply({ content: "⏳ Your application is already active. Please complete it in your DMs!", ephemeral: true });
        }

        try {
            // Setup session state
            await db.set(`active_app_${userId}`, { guildId, currentStep: 0, answers: [] });
            
            await interaction.user.send(`👋 **Welcome to the QUIL SMP Whitelist Process!**\nPlease answer the following 4 questions.\n\n**Question 1:** ${QUESTIONS}`);
            return interaction.reply({ content: "📥 **Check your DMs!** The bot has sent you the first question.", ephemeral: true });
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            return interaction.reply({ content: "❌ **Failed to send DM!** Please open your Direct Messages (DMs) in Privacy Settings and try again.", ephemeral: true });
        }
    }

    // 2. STAFF APPROVAL AND DENIAL BUTTONS
    if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_'))) {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: "❌ You do not have permissions to review applications.", ephemeral: true });
        }

        const [action, targetUserId] = interaction.customId.split('_');
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

        if (action === 'approve') {
            if (!targetMember) return interaction.reply({ content: "❌ This player has left the server.", ephemeral: true });

            try {
                // Add Whitelist Role
                await targetMember.roles.add(serverConfig.roleId);

                const approvedEmbed = EmbedBuilder.from(interaction.message.embeds)
                    .setColor(0x2ECC71)
                    .setTitle("✅ Application Approved (Passed)");

                await interaction.update({ embeds: [approvedEmbed], components: [] });
                return targetMember.send("🎉 **Congratulations!** Your whitelist application has been approved for QUIL SMP. You can join the server now!").catch(() => null);
            } catch (error) {
                return interaction.reply({ content: "❌ **Role Hierarchy Error!** Open Server Settings -> Roles, and drag your Bot's role ABOVE the Whitelisted role.", ephemeral: true });
            }
        }

        if (action === 'reject') {
            const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds)
                .setColor(0xE74C3C)
                .setTitle("❌ Application Rejected (Failed)");

            await interaction.update({ embeds: [rejectedEmbed], components: [] });
            if (targetMember) {
                return targetMember.send("❌ **Sorry**, your whitelist application has been rejected by the QUIL SMP staff team.").catch(() => null);
            }
        }
    }
});

// DM QUESTIONNAIRE INTERACTION FOR DM RESPONSES
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild) return; // Process DMs only

    const userId = message.author.id;
    const appData = await db.get(`active_app_${userId}`);
    if (!appData) return;

    let { guildId, currentStep, answers } = appData;
    answers.push(message.content);
    currentStep++;

    if (currentStep < QUESTIONS.length) {
        await db.set(`active_app_${userId}`, { guildId, currentStep, answers });
        return message.author.send(`**Question ${currentStep + 1}:** ${QUESTIONS[currentStep]}`);
    } else {
        await message.author.send("🎉 **All answers submitted!** Our staff will review your application shortly.");
        
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const logChannel = await client.channels.fetch(serverConfig.logChannelId).catch(() => null);

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📝 New Whitelist Application")
                .setColor(0x3498DB)
                .setDescription(`**Applicant:** <@${userId}> (\`${userId}\`)`)
                .setTimestamp();

            QUESTIONS.forEach((q, idx) => embed.addFields({ name: `❓ ${q}`, value: `➡️ ${answers[idx]}` }));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('Approve ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${userId}`).setLabel('Reject ❌').setStyle(ButtonStyle.Danger)
            );

            await logChannel.send({ embeds: [embed], components: [row] });
        }
        return db.delete(`active_app_${userId}`);
    }
});

client.login(process.env.DISCORD_TOKEN);

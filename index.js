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
    console.log(`🤖 ${client.user.tag} is completely revamped and running for QUIL SMP!`);
    
    const commands = [
        {
            name: 'setup-whitelist',
            description: 'Setup the Whitelist system with role and logging channel',
            options: [
                { name: 'role', description: 'Select the role to be given upon approval', type: 8, required: true },
                { name: 'log_channel', description: 'Select the Staff Log/Approval channel', type: 7, required: true }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Advanced Whitelist Slash Command Registered Successfully!');
    } catch (error) {
        console.error('Slash registration error:', error);
    }
});

// SLASH SETUP COMMAND
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-whitelist') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ You need Administrator permissions to run this.", ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const logChannel = interaction.options.getChannel('log_channel');

        await db.set(`guild_config_${interaction.guild.id}`, { roleId: role.id, logChannelId: logChannel.id });

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

        await interaction.reply({ content: "✅ Whitelist system configuration completed successfully!", ephemeral: true });
        return interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    }
});

// INTERACTION BUTTON HANDLER (APPLY PANEL & COMPREHENSIVE APPROVAL SYSTEM)
client.on('interactionCreate', async (interaction) => {
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;

    if (!interaction.isButton()) return;

    // 1. WHEN USER CLICKS "APPLY FOR WHITELIST"
    if (interaction.customId === 'start_whitelist_app') {
        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig) {
            return interaction.reply({ content: "❌ System error: Setup configuration is missing.", ephemeral: true });
        }

        if (interaction.member.roles.cache.has(serverConfig.roleId)) {
            return interaction.reply({ content: "❌ You are already whitelisted on this server!", ephemeral: true });
        }

        const activeApp = await db.get(`active_app_${userId}`);
        if (activeApp) {
            return interaction.reply({ content: "⏳ Your application session is already active. Please complete it in your DMs!", ephemeral: true });
        }

        try {
            await db.set(`active_app_${userId}`, { guildId, currentStep: 0, answers: [] });
            await interaction.user.send(`👋 **Welcome to the QUIL SMP Whitelist Process!**\nPlease answer the following 4 questions accurately.\n\n**Question 1:** ${QUESTIONS}`);
            return interaction.reply({ content: "📥 **Check your DMs!** The first question has been sent to your inbox.", ephemeral: true });
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            return interaction.reply({ content: "❌ **Failed to send DM!** Please enable 'Allow Direct Messages from server members' in your Privacy Settings.", ephemeral: true });
        }
    }

    // 2. STAFF DECISION ACTION INTERACTION (APPROVE & REJECT LOGIC)
    if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('reject_')) {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: "❌ You do not have permissions to review applications.", ephemeral: true });
        }

        const [action, targetUserId] = interaction.customId.split('_');
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        const staffName = interaction.user.tag;

        if (action === 'approve') {
            if (!targetMember) return interaction.reply({ content: "❌ This player is no longer in the server.", ephemeral: true });

            try {
                // Give configured setup role dynamically
                await targetMember.roles.add(serverConfig.roleId);

                // Update Embed cleanly instead of deleting it
                const approvedEmbed = EmbedBuilder.from(interaction.message.embeds)
                    .setColor(0x2ECC71)
                    .setTitle("✅ Application Approved")
                    .addFields({ name: "🛡️ Action Taken By", value: `${interaction.user} (\`${staffName}\`)`, inline: false });

                await interaction.update({ embeds: [approvedEmbed], components: [] });
                
                return targetMember.send(`🎉 **Congratulations!** Your whitelist application has been approved by staff member **${staffName}**! You can access the server now.`).catch(() => null);
            } catch (error) {
                return interaction.reply({ content: "❌ **Role Hierarchy Error!** Open Server Settings -> Roles, and drag your Bot's role ABOVE the role you setup.", ephemeral: true });
            }
        }

        if (action === 'reject') {
            const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds)
                .setColor(0xE74C3C)
                .setTitle("❌ Application Rejected")
                .addFields({ name: "🛡️ Action Taken By", value: `${interaction.user} (\`${staffName}\`)`, inline: false });

            await interaction.update({ embeds: [rejectedEmbed], components: [] });
            
            if (targetMember) {
                return targetMember.send(`❌ **Sorry**, your whitelist application has been rejected by staff member **${staffName}**.`).catch(() => null);
            }
        }
    }
});

// DM QUESTIONNAIRE HANDLER WITH METRIC COMPILATION
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild) return;

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
        // APPLICATION COMPLETE - GENERATE EYE CATCHING INSTRUCTION BLOCK IN ENGLISH
        const finalInstructionsEmbed = new EmbedBuilder()
            .setTitle("✨ APPLICATION SUBMITTED SUCCESSFULLY ✨")
            .setColor(0x3498DB)
            .setDescription(
                "### 📥 Final Verification Required\n" +
                "Your entry request form has been safely forwarded to the **QUIL SMP** administration panel.\n\n" +
                "```📌 MANDATORY NEXT STEP```\n" +
                "To automatically map and complete your linking pipeline, please perform the following execution immediately:\n\n" +
                "1️⃣ Launch your Minecraft client and **Join the Server**.\n" +
                "2️⃣ Upon logging in, type your assigned **4-Digit Access Code** inside the server game-chat.\n" +
                "3️⃣ Your character data will sync automatically.\n\n" +
                "*Failure to execute the synchronization protocol will delay your final authorization process.*"
            )
            .setFooter({ text: "QUIL SMP Automation Gateway" })
            .setTimestamp();

        await message.author.send({ embeds: [finalInstructionsEmbed] });

        const serverConfig = await db.get(`guild_config_${guildId}`);
        const guildInstance = await client.guilds.fetch(guildId).catch(() => null);
        if (!guildInstance) return db.delete(`active_app_${userId}`);
        
        const targetMember = await guildInstance.members.fetch(userId).catch(() => null);

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL'] 
});

// Premium High-Tier English Questions
const interviewQuestions = [
    "What is your Minecraft In-Game Name (IGN)?",
    "How old are you? (Age)",
    "Explain 'Meta Gaming' or 'Fail RP' in your own words:",
    "Why do you want to join our premium SMP server?"
];

const activeInterviews = new Map();

client.on('ready', async () => {
    console.log("🤖 [SYSTEM] Premium Whitelist Code Active And Online!");
    const guildId = client.guilds.cache.first()?.id;
    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set([{
            name: 'setup-whitelist',
            description: 'Deploys the luxury network whitelisting panel.'
        }]);
    }
});
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'setup-whitelist') {
        const embed = new EmbedBuilder()
            .setTitle("🔒 ACCESS CONTROL SECURITY GATEWAY")
            .setDescription(
                "Welcome to the official application network portal.\n\n" +
                "**APPLICATION PROTOCOLS:**\n" +
                "• Click the initiation interface terminal below.\n" +
                "• The system will route an automated DM screening matrix.\n" +
                "• Ensure your Direct Messages (DMs) are configured to **PUBLIC**."
            )
            .setColor(0x00D2FF)
            .setFooter({ text: "SECURE AUDIT PIPELINE • PROTOCOL v1.2", iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_dm_interview')
                .setLabel('INITIATE APPLICANT VERIFICATION')
                .setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'start_dm_interview') {
        const userId = interaction.user.id;

        if (activeInterviews.has(userId)) {
            return interaction.reply({ content: "⚠️ `CRITICAL ERROR:` You have an ongoing interview session pending in your DMs.", ephemeral: true });
        }

        try {
            activeInterviews.set(userId, { currentStep: 0, answers: [] });
            
            const firstEmbed = new EmbedBuilder()
                .setTitle("📋 AUDIT SCRIPT INITIALIZED")
                .setDescription(`Please respond to all parameters sequentially.\n\n**PARAMETER ONE:**\n\`${interviewQuestions[0]}\``)
                .setColor(0x00D2FF);

            await interaction.user.send({ embeds: [firstEmbed] });
            await interaction.reply({ content: "✅ **ROUTING SUCCESS:** Automated screening forwarded to your Direct Messages.", ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "❌ **INTERFACE FAULT:** Direct Message access restricted. Navigate to `User Settings -> Privacy & Safety` and enable server text delivery.", ephemeral: true });
            activeInterviews.delete(userId);
        }
    }
});
client.on('messageCreate', async message => {
    if (message.author.bot || message.guild) return;

    const userId = message.author.id;
    if (!activeInterviews.has(userId)) return;

    const session = activeInterviews.get(userId);
    session.answers.push(message.content);
    session.currentStep++;

    if (session.currentStep < interviewQuestions.length) {
        const nextEmbed = new EmbedBuilder()
            .setTitle(`📊 MATRIX PROGRESS: TRACK ${session.currentStep + 1}/${interviewQuestions.length}`)
            .setDescription(`**PARAMETER ${session.currentStep + 1}:**\n\`${interviewQuestions[session.currentStep]}\``)
            .setColor(0x00D2FF);
            
        await message.author.send({ embeds: [nextEmbed] });
    } else {
        const finalEmbed = new EmbedBuilder()
            .setTitle("⚙️ TELEMETRY PROFILE SUBMITTED")
            .setDescription("Your validation request application has been completely synchronized to the Administration Hub.")
            .setColor(0x00FF7F);
            
        await message.author.send({ embeds: [finalEmbed] });
        
        const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
            const adminReviewEmbed = new EmbedBuilder()
                .setTitle("🚨 APPLICANT FILE PROFILE INCOMING")
                .setColor(0x1F1F1F)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 CANDIDATE ACCOUNT ID', value: `<@${userId}> (\`${userId}\`)`, inline: false },
                    { name: '🆔 REGISTERED TARGET IGN', value: `\`${session.answers[0] || "None"}\``, inline: true },
                    { name: '📅 CHRONO AGE METRIC', value: `\`${session.answers[1] || "None"}\``, inline: true },
                    { name: '🧠 ADVANCED TERMINOLOGY RULE CHECK', value: `\`\`\`text\n${session.answers[2] || "None"}\`\`\``, inline: false },
                    { name: '🚀 CLIENT CONNECTION FOCUS OBJECTIVE', value: `\`\`\`text\n${session.answers[3] || "None"}\`\`\``, inline: false }
                )
                .setFooter({ text: "ADMINISTRATIVE REVIEW LOGS REQUIRED" })
                .setTimestamp();

            const cleanIgn = (session.answers[0] || "Player").replace(/\s+/g, '');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`adm_accept_${userId}_${cleanIgn}`).setLabel('APPROVE FILE PROTOCOL').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`adm_deny_${userId}`).setLabel('REJECT INTERFACE DETECT').setStyle(ButtonStyle.Danger)
            );

            await staffChannel.send({ embeds: [adminReviewEmbed], components: [row] }).catch(console.error);
        }
        activeInterviews.delete(userId);
    }
});
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const tokens = interaction.customId.split('_');
    if (tokens[0] !== 'adm') return;

    const action = tokens[1];
    const targetUserId = tokens[2];
    const ign = tokens[3] || "Player";

    if (action === 'accept') {
        const modal = new ModalBuilder().setCustomId(`mdl_accept_${targetUserId}_${ign}`).setTitle('AUTHENTICATION APPROVAL LOGS');
        const reasonInput = new TextInputBuilder().setCustomId('accept_reason').setLabel("SPECIFY SYSTEM METRIC APPROVAL NOTES:").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }

    if (action === 'deny') {
        const modal = new ModalBuilder().setCustomId(`mdl_deny_${targetUserId}`).setTitle('REJECTION TERMINATION RECORD');
        const reasonInput = new TextInputBuilder().setCustomId('deny_reason').setLabel("ENTER SYSTEM DISMISSAL AUDIT REASONS:").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.type !== InteractionType.ModalSubmit) return;
    const tokens = interaction.customId.split('_');
    if (tokens[0] !== 'mdl') return;

    const action = tokens[1];
    const targetUserId = tokens[2];

    if (action === 'accept') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('accept_reason');

        const guild = interaction.guild;
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            await member.roles.add(process.env.WHITELIST_ROLE_ID).catch(() => null);
            
            const dmSuccess = new EmbedBuilder()
                .setTitle("🎉 RECRUITMENT NETWORK GRANTED")
                .setDescription(`Your verification profile parameters have been checked and approved onto the premium whitelist server network.\n\n**MANAGEMENT ATTACHMENT DETAILS:**\n\`${reason}\``)
                .setColor(0x00FF7F);
                
            await member.send({ embeds: [dmSuccess] }).catch(() => null);
        }

        await interaction.editReply({ content: "✅ **SYSTEM SECURITY SYNC:** File processed successfully. Client Whitelisted." });
        await interaction.message.delete().catch(() => null);
    }

    if (action === 'deny') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('deny_reason');

        const guild = interaction.guild;
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            const dmFail = new EmbedBuilder()
                .setTitle("❌ APPLICATION SYSTEM PURGED")
                .setDescription(`Your application telemetry parameters have been denied authentication clear access.\n\n**FEEDBACK PROTOCOLS INCIDENT NOTE:**\n\`${reason}\``)
                .setColor(0xFF0000);
                
            await member.send({ embeds: [dmFail] }).catch(() => null);
        }

        await interaction.editReply({ content: "❌ **SYSTEM SECURITY SYNC:** Applicant file terminated successfully." });
        await interaction.message.delete().catch(() => null);
    }
});

const http = require('http');
http.createServer((req, res) => { res.write("Premium Network Hub Active."); res.end(); }).listen(process.env.PORT || 3000);
client.login(process.env.DISCORD_TOKEN);

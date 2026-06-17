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

// Ekdum Normal aur Asaan English Questions
const interviewQuestions = [
    "What is your Minecraft In-Game Name (IGN)?",
    "How old are you?",
    "What do you know about server rules? (Explain briefly)",
    "Why do you want to join our SMP server?"
];

const activeInterviews = new Map();

client.on('ready', async () => {
    console.log("🤖 [SYSTEM] Whitelist Bot is Online and Ready!");
    const guildId = client.guilds.cache.first()?.id;
    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set([{
            name: 'setup-whitelist',
            description: 'Send the whitelist application panel.'
        }]);
    }
});
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'setup-whitelist') {
        const embed = new EmbedBuilder()
            .setTitle("🔒 SERVER WHITELIST PANEL")
            .setDescription(
                "Welcome to our server application portal!\n\n" +
                "**How to Apply:**\n" +
                "• Click the **Apply Now** button below.\n" +
                "• The bot will send you questions in your **DMs (Direct Messages)**.\n" +
                "• Make sure your Discord DMs are **turned ON** so the bot can message you."
            )
            .setColor(0x00A2FF) // Classic Gamer Blue
            .setFooter({ text: "Whitelist Verification System", iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_dm_interview')
                .setLabel('APPLY NOW 📝')
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
            return interaction.reply({ content: "⚠️ You already have an active application process in your DMs!", ephemeral: true });
        }

        try {
            activeInterviews.set(userId, { currentStep: 0, answers: [] });
            
            const firstEmbed = new EmbedBuilder()
                .setTitle("📝 Whitelist Application Started")
                .setDescription(`Please answer all questions one by one.\n\n**Question 1:**\n\`${interviewQuestions[0]}\``)
                .setColor(0x00A2FF);

            await interaction.user.send({ embeds: [firstEmbed] });
            await interaction.reply({ content: "✅ Check your DMs! I have sent you the first question.", ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "❌ I couldn't message you! Please go to `User Settings -> Privacy & Safety` and turn on server direct messages.", ephemeral: true });
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
            .setTitle(`📊 Application Progress: ${session.currentStep + 1}/${interviewQuestions.length}`)
            .setDescription(`**Question ${session.currentStep + 1}:**\n\`${interviewQuestions[session.currentStep]}\``)
            .setColor(0x00A2FF);
            
        await message.author.send({ embeds: [nextEmbed] });
    } else {
        const finalEmbed = new EmbedBuilder()
            .setTitle("✅ Application Submitted!")
            .setDescription("Thank you! Your answers have been successfully submitted to the server staff team. Please wait for the result.")
            .setColor(0x2ECC71);
            
        await message.author.send({ embeds: [finalEmbed] });
        
        const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
            const adminReviewEmbed = new EmbedBuilder()
                .setTitle("🚨 NEW WHITELIST APPLICATION")
                .setColor(0x2C2F33)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Applicant', value: `<@${userId}> (\`${userId}\`)`, inline: false },
                    { name: '🆔 Minecraft IGN', value: `\`${session.answers[0] || "None"}\``, inline: true },
                    { name: '📅 Age', value: `\`${session.answers[1] || "None"}\``, inline: true },
                    { name: '🧠 Rules Knowledge', value: `\`\`\`text\n${session.answers[2] || "None"}\`\`\``, inline: false },
                    { name: '🚀 Reason to Join', value: `\`\`\`text\n${session.answers[3] || "None"}\`\`\``, inline: false }
                )
                .setFooter({ text: "Staff Review Panel" })
                .setTimestamp();

            const cleanIgn = (session.answers[0] || "Player").replace(/\s+/g, '');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`adm_accept_${userId}_${cleanIgn}`).setLabel('APPROVE ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`adm_deny_${userId}`).setLabel('REJECT ❌').setStyle(ButtonStyle.Danger)
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
        const modal = new ModalBuilder().setCustomId(`mdl_accept_${targetUserId}_${ign}`).setTitle('Application Approval');
        const reasonInput = new TextInputBuilder().setCustomId('accept_reason').setLabel("Enter the reason for acceptance:").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }

    if (action === 'deny') {
        const modal = new ModalBuilder().setCustomId(`mdl_deny_${targetUserId}`).setTitle('Application Rejection');
        const reasonInput = new TextInputBuilder().setCustomId('deny_reason').setLabel("Enter the reason for rejection:").setStyle(TextInputStyle.Paragraph).setRequired(true);
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
                .setTitle("🎉 Application Status: Approved")
                .setDescription(`Congratulations! Your application has been accepted onto the whitelist server network.\n\n**Staff Notes:**\n\`${reason}\``)
                .setColor(0x2ECC71);
                
            await member.send({ embeds: [dmSuccess] }).catch(() => null);
        }

        await interaction.editReply({ content: "✅ **Success:** Player has been whitelisted and notified in DMs." });
        await interaction.message.delete().catch(() => null);
    }

    if (action === 'deny') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('deny_reason');

        const guild = interaction.guild;
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            const dmFail = new EmbedBuilder()
                .setTitle("❌ Application Status: Rejected")
                .setDescription(`Sorry, your whitelist application has been rejected by the staff team.\n\n**Reason:**\n\`${reason}\``)
                .setColor(0xE74C3C);
                
            await member.send({ embeds: [dmFail] }).catch(() => null);
        }

        await interaction.editReply({ content: "❌ **Success:** Application profile rejected and purged." });
        await interaction.message.delete().catch(() => null);
    }
});

const http = require('http');
http.createServer((req, res) => { res.write("Premium Whitelist Panel Active."); res.end(); }).listen(process.env.PORT || 3000);
client.login(process.env.DISCORD_TOKEN);

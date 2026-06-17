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

// Simple and Clean English Questions
const interviewQuestions = [
    "What is your Minecraft In-Game Name (IGN)?",
    "How old are you?",
    "What do you know about server rules? (Explain briefly)",
    "Why do you want to join our SMP server?"
];

const activeInterviews = new Map();

client.on('ready', async () => {
    console.log("🤖 [SYSTEM] Whitelist Core Architecture Active and Online!");
    const guildId = client.guilds.cache.first()?.id;
    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set([{
            name: 'setup-whitelist',
            description: 'Send the premium whitelist application panel.'
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
                "**CRITICAL REQUIREMENTS:**\n" +
                "• You **MUST link your account** first by joining the Minecraft Server.\n" +
                "• After linking, click the **Apply Now** button below.\n" +
                "• The bot will route the interview questions directly in your DMs."
            )
            .setColor(0x00A2FF)
            .setFooter({ text: "Gateway Verification System", iconURL: client.user.displayAvatarURL() })
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
        const guild = interaction.guild;

        if (activeInterviews.has(userId)) {
            return interaction.reply({ content: "⚠️ You already have an ongoing application session pending in your DMs!", ephemeral: true });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && member.roles.cache.has(process.env.WHITELIST_ROLE_ID)) {
            return interaction.reply({ content: "🎉 Access Verification Status: Already whitelisted on this network!", ephemeral: true });
        }

        try {
            activeInterviews.set(userId, { currentStep: 0, answers: [], isLinked: false });
            
            const initialCheckEmbed = new EmbedBuilder()
                .setTitle("🔑 LINK VERIFICATION PROTOCOL")
                .setDescription(
                    "Before we start the interview, please ensure your Minecraft account is linked.\n\n" +
                    "**How to link:**\n" +
                    "1. Join the Minecraft Server.\n" +
                    "2. Copy the code given on your screen (e.g., `!link 1234`).\n" +
                    "3. Type and send that exact command right here in this DM chat!\n\n" +
                    "*(Once linked, you will see a confirmation message, then type anything to start your interview questions)*"
                )
                .setColor(0xFFAA00);

            await interaction.user.send({ embeds: [initialCheckEmbed] });
            await interaction.reply({ content: "✅ **GATEWAY ROUTING:** Check your DMs to complete the linkage protocol.", ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "❌ **INTERFACE FAULT:** Direct Message access restricted. Turn on server DMs in your Privacy Settings.", ephemeral: true });
            activeInterviews.delete(userId);
        }
    }
});
client.on('messageCreate', async message => {
    if (message.author.bot || message.guild) return;

    const userId = message.author.id;
    if (!activeInterviews.has(userId)) return;

    const session = activeInterviews.get(userId);

    // Filter Logic: If player sends DiscordSRV linking command, let DiscordSRV handle it natively
    if (message.content.startsWith('!link') || message.content.toLowerCase().includes('account has been linked')) {
        session.isLinked = true; 
        return; 
    }

    // Step Lock: Block questions until player triggers linking validation sequence
    if (!session.isLinked) {
        await message.author.send("⚠️ **ACCESS DENIED:** You must enter the Minecraft server linking code here first before the interview questions can begin!");
        return;
    }

    session.answers.push(message.content);
    session.currentStep++;

    if (session.currentStep < interviewQuestions.length) {
        const nextEmbed = new EmbedBuilder()
            .setTitle(`📊 Application Tracker: ${session.currentStep + 1}/${interviewQuestions.length}`)
            .setDescription(`**Question ${session.currentStep + 1}:**\n\`${interviewQuestions[session.currentStep]}\``)
            .setColor(0x00A2FF);
            
        await message.author.send({ embeds: [nextEmbed] });
    } else {
        const finalEmbed = new EmbedBuilder()
            .setTitle("⚙️ SUBMISSION SECURED")
            .setDescription("Thank you! Your answers have been successfully forwarded to the Administration Hub. Please wait for evaluation.")
            .setColor(0x2ECC71);
            
        await message.author.send({ embeds: [finalEmbed] });
        
        const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
            const pIgn = session.answers[0] || "None";
            const pAge = session.answers[1] || "None";
            const pRules = session.answers[2] || "None";
            const pReason = session.answers[3] || "None";

            const adminReviewEmbed = new EmbedBuilder()
                .setTitle("🚨 NEW WHITELIST APPLICATION")
                .setDescription("A candidate profile submission requires administrative review parameters.")
                .setColor(0xFFAA00)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Applicant User', value: `<@${userId}>`, inline: true },
                    { name: '🆔 Account ID', value: `\`${userId}\``, inline: true },
                    { name: '\u200B', value: '\u200B', inline: false },
                    { name: '🎮 Minecraft IGN', value: `\`${pIgn}\``, inline: true },
                    { name: '📅 Player Age', value: `\`${pAge}\``, inline: true },
                    { name: '📜 Rules & Terms Knowledge', value: `\`\`\`text\n${pRules}\`\`\``, inline: false },
                    { name: '🚀 Reason For Joining', value: `\`\`\`text\n${pReason}\`\`\``, inline: false }
                )
                .setFooter({ text: "Staff Evaluation Console" })
                .setTimestamp();

            const cleanIgn = pIgn.replace(/\s+/g, '');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`adm_accept_${userId}_${cleanIgn}`).setLabel('APPROVE FILE PROTOCOL ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`adm_deny_${userId}`).setLabel('REJECT INTERFACE DETECT ❌').setStyle(ButtonStyle.Danger)
            );

            await staffChannel.send({ content: "🔔 **@here New application received! Online staff please verify.**", embeds: [adminReviewEmbed], components: [row] }).catch(console.error);
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
        const modal = new ModalBuilder().setCustomId(`mdl_accept_${targetUserId}_${ign}`).setTitle('Application Approval Core');
        const reasonInput = new TextInputBuilder().setCustomId('accept_reason').setLabel("Enter the reason for verification log:").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }

    if (action === 'deny') {
        const modal = new ModalBuilder().setCustomId(`mdl_deny_${targetUserId}`).setTitle('Application Rejection Archive');
        const reasonInput = new TextInputBuilder().setCustomId('deny_reason').setLabel("Specify explicit dismissal notes:").setStyle(TextInputStyle.Paragraph).setRequired(true);
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
        if (!guild) return interaction.editReply({ content: "❌ Server validation pipeline error." });

        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            const roleId = process.env.WHITELIST_ROLE_ID;
            if (roleId) {
                // Strict hierarchical enforcement execution sequence
                await member.roles.add(roleId).catch(err => console.error("Role Error logs mapping error:", err));
            }
            
            const dmSuccess = new EmbedBuilder()
                .setTitle("🎉 Application Status: Approved")
                .setDescription(`Congratulations! Your verification profile parameters have been checked and approved onto the premium network.\n\n**Staff Notes:**\n\`${reason}\``)
                .setColor(0x2ECC71);
                
            await member.send({ embeds: [dmSuccess] }).catch(() => null);
        }

        await interaction.editReply({ content: "✅ **SYSTEM SECURITY SYNC:** File processed successfully. Target Whitelisted." });
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
                .setDescription(`Sorry, your application parameters have been denied access clear authorization.\n\n**Reason:**\n\`${reason}\``)
                .setColor(0xE74C3C);
                
            await member.send({ embeds: [dmFail] }).catch(() => null);
        }

        await interaction.editReply({ content: "❌ **SYSTEM SECURITY SYNC:** Applicant credentials purged successfully." });
        await interaction.message.delete().catch(() => null);
    }
});

const http = require('http');
http.createServer((req, res) => { res.write("Premium Global Network Operational Engine."); res.end(); }).listen(process.env.PORT || 3000);
client.login(process.env.DISCORD_TOKEN);

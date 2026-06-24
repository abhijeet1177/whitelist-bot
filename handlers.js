const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Rcon } = require('rcon-client'); // Auto-whitelist processing library

// The 4 Whitelist Questions strictly defined as an array
const QUESTIONS = [
    "What is your In-Game Name (IGN)?", // Index 0: Iska use command query ke liye hoga
    "What is your Age?",
    "Have you played on any SMP before? (If yes, name it)",
    "Why do you want to join QUIL SMP?"
];

// Automatically pulls credentials injected directly via Render dashboard
const RCON_CONFIG = {
    host: process.env.RCON_HOST,
    port: parseInt(process.env.RCON_PORT) || 25575,
    password: process.env.RCON_PASSWORD
};

// Pure application architecture me safe execution pipeline create karne ke liye wrapper
async function runRconCommand(command) {
    try {
        if (!RCON_CONFIG.host || !RCON_CONFIG.password) {
            console.error("❌ System Error: Render platform environment configurations are missing!");
            return { success: false, error: "Environment variables not loaded" };
        }
        const rcon = await Rcon.connect(RCON_CONFIG);
        const response = await rcon.send(command);
        await rcon.end();
        return { success: true, response };
    } catch (err) {
        console.error("❌ Network Core Fault: Cannot reach Minecraft console instance:", err);
        return { success: false, error: err.message };
    }
}
// Handles Button Clicks (Apply, Approve, Reject)
async function handleInteractions(interaction, db) {
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;

    if (!interaction.isButton()) return;

    // A. APPLICANT REGISTRATION TRIGGER
    if (interaction.customId === 'start_whitelist_app') {
        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig || !serverConfig.roleId) {
            return interaction.reply({ content: "❌ System error: Setup configuration or Role is missing. Please run `/setup` first.", ephemeral: true });
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
            await interaction.user.send(`👋 **Welcome to the QUIL SMP Whitelist Process!**\n\n**Question 1:** ${QUESTIONS[0]}`);
            return interaction.reply({ content: "📥 **Check your DMs!** The first question has been sent to your inbox.", ephemeral: true });
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            return interaction.reply({ content: "❌ **Failed to send DM!** Please enable 'Allow Direct Messages' in your Privacy Settings.", ephemeral: true });
        }
    }

    // Handles Button Clicks (Apply, Approve, Reject)
async function handleInteractions(interaction, db) {
    const guildId = interaction.guild?.id;
    const userId = interaction.user.id;

    if (!interaction.isButton()) return;

    // A. APPLICANT REGISTRATION TRIGGER
    if (interaction.customId === 'start_whitelist_app') {
        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig || !serverConfig.roleId) {
            return interaction.reply({ content: "❌ System error: Setup configuration or Role is missing. Please run `/setup` first.", ephemeral: true });
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
            // FIXED: Now correctly references index [0] to send the first question text cleanly
            await interaction.user.send(`👋 **Welcome to the QUIL SMP Whitelist Process!**\n\n**Question 1:** ${QUESTIONS[0]}`);
            return interaction.reply({ content: "📥 **Check your DMs!** The first question has been sent to your inbox.", ephemeral: true });
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            return interaction.reply({ content: "❌ **Failed to send DM!** Please enable 'Allow Direct Messages' in your Privacy Settings.", ephemeral: true });
        }
    }

    // B. STAFF APPROVAL AND REJECTION SYSTEM
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

            const messageEmbeds = interaction.message.embeds;
            if (!messageEmbeds || messageEmbeds.length === 0) {
                return interaction.reply({ content: "❌ Application payload structure context lost.", ephemeral: true });
            }

            const targetEmbed = messageEmbeds[0];
            
            // FIXED: Target only the explicit first question string (IGN) for validation parsing
            const ignField = targetEmbed.fields.find(f => f.name.includes(QUESTIONS[0]));
            const minecraftIGN = ignField ? ignField.value.replace(/```/g, '').trim() : null;

            if (!minecraftIGN) {
                return interaction.reply({ content: "❌ Extraction Error: Could not parse a valid Minecraft IGN out of the application layout form.", ephemeral: true });
            }

            await interaction.deferUpdate();

            const rconTxOutput = await runRconCommand(`whitelist add ${minecraftIGN}`);

            if (!rconTxOutput.success) {
                return interaction.followUp({ content: `⚠️ Discord role process updated, but **RCON network tracking timed out!** Target \`${minecraftIGN}\` must be manual whitelisted via live server engine command lines.`, ephemeral: true });
            }

            try {
                await targetMember.roles.add(serverConfig.roleId);

                const approvedEmbed = EmbedBuilder.from(targetEmbed)
                    .setColor(0x2ECC71)
                    .setTitle("✅ Application Processed & Synced")
                    .addFields(
                        { name: "🛡️ Action Taken By", value: `${interaction.user} (\`${staffName}\`)`, inline: true },
                        { name: "🎮 RCON Auto-Link", value: `\`🟢 Whitelisted: ${minecraftIGN}\``, inline: true }
                    );

                await interaction.editReply({ embeds: [approvedEmbed], components: [] });
                return targetMember.send(`🎉 **Congratulations!** Your whitelist entry request has been accepted. Account **${minecraftIGN}** has been automatically linked to the live server system!`).catch(() => null);
            } catch (error) {
                return interaction.followUp({ content: "❌ **Role Hierarchy Conflict!** Open Discord Client settings, drag your Bot identity position index tag ABOVE the targets role configuration mapping layer.", ephemeral: true });
            }
        }

        if (action === 'reject') {
            const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0xE74C3C)
                .setTitle("❌ Application Rejected")
                .addFields({ name: "🛡️ Action Taken By", value: `${interaction.user} (\`${staffName}\`)`, inline: false });

            await interaction.update({ embeds: [rejectedEmbed], components: [] });
            
            if (targetMember) {
                return targetMember.send(`❌ **Sorry**, your whitelist application has been rejected by staff member **${staffName}**.`).catch(() => null);
            }
        }
    }
}

// Handles DM Questions Sequentially
async function handleMessages(message, client, db) {
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
        const finalInstructionsEmbed = new EmbedBuilder()
            .setTitle("✨ APPLICATION SUBMITTED SUCCESSFULLY ✨")
            .setColor(0x3498DB)
            .setDescription(
                "### 📥 Verification Pipeline Active\n" +
                "Your details form has been securely dispatched onto the **QUIL SMP** administration interface terminal channels.\n\n" +
                "When administrators activate the verification trigger button panel, your registration profile parameters will synchronize onto the network system cluster immediately!"
            )
            .setFooter({ text: "QUIL SMP Automation Gateway" })
            .setTimestamp();

        await message.author.send({ embeds: [finalInstructionsEmbed] });

        const serverConfig = await db.get(`guild_config_${guildId}`);
        const guildInstance = await client.guilds.fetch(guildId).catch(() => null);
        
        if (!guildInstance || !serverConfig || !serverConfig.logChannelId) {
            return await db.delete(`active_app_${userId}`);
        }
        
        const targetMember = await guildInstance.members.fetch(userId).catch(() => null);
        const logChannel = await client.channels.fetch(serverConfig.logChannelId).catch(() => null);

        if (logChannel && targetMember) {
            const accountAgeDays = Math.floor((Date.now() - targetMember.user.createdTimestamp) / (1000 * 60 * 60 * 24));
            const joinedServerDate = targetMember.joinedAt ? targetMember.joinedAt.toUTCString() : "Unknown";
            const applicationSubmittedDate = new Date().toUTCString();

            const staffFormEmbed = new EmbedBuilder()
                .setTitle("📝 New Whitelist Entry Submission")
                .setColor(0xF1C40F)
                .setDescription(
                    `**Applicant Account:** ${targetMember.user} (\`${userId}\`)\n` +
                    `**📅 Account Age:** \`${accountAgeDays} Days Old\`\n` +
                    `**📥 Server Join Date:** \`${joinedServerDate}\`\n` +
                    `**⏳ Form Submitted At:** \`${applicationSubmittedDate}\``
                )
                .setTimestamp();

            QUESTIONS.forEach((q, idx) => staffFormEmbed.addFields({ name: `❓ ${q}`, value: `\`\`\`${answers[idx]}\`\`\`` }));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('Approve & Whitelist ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${userId}`).setLabel('Reject Applicant ❌').setStyle(ButtonStyle.Danger)
            );

            await logChannel.send({ embeds: [staffFormEmbed], components: [row] });
        }

        await db.delete(`active_app_${userId}`);
    }
}

// Exporting both core functions cleanly
module.exports = { handleInteractions, handleMessages };

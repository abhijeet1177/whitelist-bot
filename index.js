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

// Whitelist Questions (Aap inko yahan badal sakte hain)
const QUESTIONS = [
    "Aapki In-Game ID aur Age kya hai?",
    "Aapne pehle kis server par Roleplay kiya hai?",
    "Fail RP aur Metagaming se aap kya samajhte hain?"
];

// ==========================================
// 1. BOT READY & SLASH COMMAND REGISTRATION
// ==========================================
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} Online ho gaya hai!`);
    
    const commands = [
        {
            name: 'setup-whitelist',
            description: 'Whitelist system ko configure karein',
            options: [
                { name: 'role', description: 'Verified/Whitelisted role select karein', type: 8, required: true },
                { name: 'log_channel', description: 'Logs aur Approval channel select karein', type: 7, required: true }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        console.log('⏳ Slash commands register ho rahe hain...');
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Slash Commands Successfully Registered!');
    } catch (error) {
        console.error('❌ Slash command register karne me error aaya:', error);
    }
});

// ==========================================
// 2. SETUP COMMANDS (SLASH & BACKUP PREFIX)
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-whitelist') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ Permission denied.", ephemeral: true });
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
            return message.reply("❌ **Sahi format:** `!setup @RoleName #ChannelName`");
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

    const codeRegex = /^\d{4}$/; // Strict 4-Digit match

    if (codeRegex.test(message.content)) {
        const userId = message.author.id;
        const guildId = message.guild.id;

        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig) return message.reply("⚠️ Bot setup nahi hua hai. Admin ko kahein `/setup-whitelist` chalayein.");

        // GLITCH FIX 1: Already verified user handling
        const isVerified = await db.get(`verified_${guildId}_${userId}`);
        if (isVerified) return message.reply("❌ Put the code again");

        const activeApp = await db.get(`active_app_${userId}`);
        if (activeApp) return message.reply("⏳ Aapka process pehle se chalu hai. DM check karein!");

        try {
            await db.set(`active_app_${userId}`, { guildId, currentStep: 0, answers: [] });
            await message.author.send(`✅ **Code [${message.content}] verified!**\n\n**Sawal 1:** ${QUESTIONS[0]}`);
            await message.reply("📥 Mene aapko DM me questions bhej diye hain!");
        } catch (err) {
            await db.delete(`active_app_${userId}`);
            await message.reply("❌ Aapka DM closed hai! Please Settings se DMs open karein.");
        }
    }
});

// ==========================================
// 4. DM QUESTIONNAIRE HANDLING
// ==========================================
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
        await message.author.send(`**Sawal ${currentStep + 1}:** ${QUESTIONS[currentStep]}`);
    } else {
        await message.author.send("🎉 Answers submit ho gaye hain! Staff verification ka wait karein.");
        
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const logChannel = await client.channels.fetch(serverConfig.logChannelId).catch(() => null);

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📝 Naya Whitelist Application")
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
        return interaction.reply({ content: "❌ Permissions missing.", ephemeral: true });
    }

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

    if (action === 'approve') {
        if (!targetMember) return interaction.reply({ content: "❌ Player server me nahi hai.", ephemeral: true });

        try {
            // GLITCH FIX 2: Safe Role Hierarchy Assignment
            await targetMember.roles.add(serverConfig.roleId);
            await db.set(`verified_${guildId}_${targetUserId}`, true);

            const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x2ECC71).setTitle("✅ Application Approved");
            await interaction.update({ embeds: [approvedEmbed], components: [] });
            await targetMember.send("🎉 Mubarak ho! Aapka Whitelist pass ho gaya hai!").catch(() => null);
        } catch (error) {
            return interaction.reply({ content: "❌ **Role error!** Discord Server Settings -> Roles me jaakar bot ke role ko sabse upar scroll karein.", ephemeral: true });
        }
    }

    if (action === 'reject') {
        const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xE74C3C).setTitle("❌ Application Rejected");
        await interaction.update({ embeds: [rejectedEmbed], components: [] });
        if (targetMember) await targetMember.send("❌ Aapka whitelist application reject ho gaya hai.").catch(() => null);
    }
});

client.login(config.token);

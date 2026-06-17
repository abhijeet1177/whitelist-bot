]const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
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

// Whitelist ke Sawal (Aap inko badal sakte hain)
const QUESTIONS = [
    "Aapki In-Game ID aur Age kya hai?",
    "Aapne pehle kis server par Roleplay kiya hai?",
    "Fail RP aur Metagaming se aap kya samajhte hain?"
];

client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} Online hai!`);
    
    // Slash Command Register karna
    const commands = [
        {
            name: 'setup-whitelist',
            description: 'Whitelist system ko setup karein',
            options: [
                { name: 'role', description: 'Verified role select karein', type: 8, required: true }, // ROLE
                { name: 'log_channel', description: 'Logs channel select karein', type: 7, required: true } // CHANNEL
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Setup Slash Command successfully registered!');
    } catch (error) {
        console.error(error);
    }
});

// 1. SETUP COMMAND HANDLER
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-whitelist') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ Aapke paas Permission nahi hai.", ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const logChannel = interaction.options.getChannel('log_channel');

        await db.set(`guild_config_${interaction.guildId}`, {
            roleId: role.id,
            logChannelId: logChannel.id
        });

        return interaction.reply({ content: `✅ **Setup Complete!**\nVerified Role: <@&${role.id}>\nLog Channel: <#${logChannel.id}>`, ephemeral: true });
    }
});

// 2. 4-DIGIT CODE & QUESTIONS GLITCH FIX
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Check agar message exact 4-digit number hai
    const codeRegex = /^\d{4}$/;

    if (codeRegex.test(message.content)) {
        const userId = message.author.id;
        const guildId = message.guild.id;

        // Check if bot setup is done
        const serverConfig = await db.get(`guild_config_${guildId}`);
        if (!serverConfig) return message.reply("⚠️ Pehle Admin ko `/setup-whitelist` command chalani hogi!");

        // Check kya user pehle se verified hai
        const isVerified = await db.get(`verified_${guildId}_${userId}`);
        if (isVerified) {
            return message.reply("❌ Put the code again");
        }

        // Check agar user pehle se application de raha hai
        const activeApp = await db.get(`active_app_${userId}`);
        if (activeApp) return message.reply("⏳ Aapka application process pehle se chalu hai. Dm check karein!");

        try {
            // User ko DM bhejna aur process shuru karna
            await message.author.send(`✅ **Code ${message.content} verified!** Chaliye aapka whitelist application shuru karte hain.\n\n**Sawal 1:** ${QUESTIONS[0]}`);
            
            // Database me user ka session save karna
            await db.set(`active_app_${userId}`, {
                guildId: guildId,
                currentStep: 0,
                answers: []
            });

            await message.reply("📥 Mene aapko DM me questions bhej diye hain, check karein!");
        } catch (err) {
            await message.reply("❌ Aapka DM closed hai! Please settings se DMs open karein.");
        }
    }
});

// 3. DM INTERACTION (Sawal-Jawab Handle Karna)
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.guild) return; // Sirf DMs ke liye

    const userId = message.author.id;
    const appData = await db.get(`active_app_${userId}`);
    if (!appData) return;

    let { guildId, currentStep, answers } = appData;
    answers.push(message.content);

    currentStep++;

    if (currentStep < QUESTIONS.length) {
        // Agla sawal bhein
        await db.set(`active_app_${userId}`, { guildId, currentStep, answers });
        await message.author.send(`**Sawal ${currentStep + 1}:** ${QUESTIONS[currentStep]}`);
    } else {
        // Saare sawal khatam, ab logs channel me bhejenge approval ke liye
        await message.author.send("🎉 Aapke saare answers submit ho gaye hain! Admin ke decision ka wait karein.");
        
        const serverConfig = await db.get(`guild_config_${guildId}`);
        const logChannel = await client.channels.fetch(serverConfig.logChannelId);

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📝 Naya Whitelist Application")
                .setColor(0x0099FF)
                .setDescription(`**User:** <@${userId}> (${userId})`)
                .setTimestamp();

            QUESTIONS.forEach((q, index) => {
                embed.addFields({ name: `Q: ${q}`, value: `A: ${answers[index]}` });
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('Approve ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${userId}`).setLabel('Reject ❌').setStyle(ButtonStyle.Danger)
            );

            await logChannel.send({ embeds: [embed], components: [row] });
        }

        // Session delete karein taaki wo pending me na rahe
        await db.delete(`active_app_${userId}`);
    }
});

// 4. ROLE GLITCH FIX (BUTTON HANDLER)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, targetUserId] = interaction.customId.split('_');
    const guildId = interaction.guild.id;

    const serverConfig = await db.get(`guild_config_${guildId}`);
    if (!serverConfig) return interaction.reply({ content: "Error: Setup config nahi mili.", ephemeral: true });

    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

    if (action === 'approve') {
        if (!targetMember) return interaction.reply({ content: "❌ User server chhod kar chala gaya.", ephemeral: true });

        try {
            // Role add karna
            await targetMember.roles.add(serverConfig.roleId);
            
            // Database me verified set karna
            await db.set(`verified_${guildId}_${targetUserId}`, true);

            // Embed update karna
            const oldEmbed = interaction.message.embeds[0];
            const approvedEmbed = EmbedBuilder.from(oldEmbed)
                .setColor(0x00FF00)
                .setTitle("✅ Application Approved");

            await interaction.update({ embeds: [approvedEmbed], components: [] });
            
            // User ko inform karna
            await targetMember.send("🎉 Mubarak ho! Aapka Whitelist pass ho gaya hai aur aapko Role mil gaya hai.").catch(() => null);

        } catch (error) {
            console.error(error);
            return interaction.reply({ content: "❌ Role dene me dikkat aayi! Check karein ki bot ka Role settings me sabse upar ho.", ephemeral: true });
        }
    }

    if (action === 'reject') {
        const oldEmbed = interaction.message.embeds[0];
        const rejectedEmbed = EmbedBuilder.from(oldEmbed)
            .setColor(0xFF0000)
            .setTitle("❌ Application Rejected");

        await interaction.update({ embeds: [rejectedEmbed], components: [] });

        if (targetMember) {
            await targetMember.send("❌ Sorry, aapka whitelist application reject ho gaya hai.").catch(() => null);
        }
    }
});

client.login(config.token);

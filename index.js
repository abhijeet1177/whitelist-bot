require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const { Rcon } = require('rcon-client');

// DM system ke liye Partials aur Intents zaroori hain
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ],
    partials: ['CHANNEL'] 
});

// Sawal jo bot DM me player se poochega (Aap badal sakte hain)
const interviewQuestions = [
    "Apna Minecraft In-Game Name (IGN) likhein:",
    "Aapki Age (Umar) kya hai?",
    "Fail RP ya Griffing se aap kya samajhte hain?",
    "Aap humare server ko kyun join karna chahte hain?"
];

// Players ke state save rakhne ke liye temporary storage
const activeInterviews = new Map();

client.on('ready', async () => {
    console.log(`🤖 Zeta-Style Whitelist Bot Online Hai!`);
    const guildId = client.guilds.cache.first()?.id;
    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        await guild.commands.set([{
            name: 'setup-whitelist',
            description: 'Whitelist Apply karne ka professional panel bhejein.'
        }]);
    }
});

// Slash Command chalne par Apply Button lagana
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'setup-whitelist') {
        const embed = new EmbedBuilder()
            .setTitle("🔒 SERVER WHITELIST APPLICATION")
            .setDescription("Humare server par khelne ke liye niche diye gaye button par click karein. Bot aapko **DM (Direct Message)** me interview ke sawal bhejega!")
            .setColor(0x2F3136)
            .setFooter({ text: "Zeta Whitelist System" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_dm_interview').setLabel('Apply Kaise Karein (Click Here)').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

// Button click karne par DM me interview shuru karna
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'start_dm_interview') {
        const userId = interaction.user.id;

        if (activeInterviews.has(userId)) {
            return interaction.reply({ content: "❌ Aapka interview pehle se hi aapke DM me chal raha hai!", ephemeral: true });
        }

        try {
            activeInterviews.set(userId, { currentStep: 0, answers: [] });
            await interaction.user.send(`👋 Hello! Humare server me entry ke liye aapka interview shuru ho chuka hai.\n\n**Sawal 1:** ${interviewQuestions[0]}`);
            await interaction.reply({ content: "✅ Check karein! Maine aapke DM (Inbox) me sawal bhej diya hai.", ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "❌ Aapka DM closed hai! Please settings me jaakar 'Allow Direct Messages from server members' on karein.", ephemeral: true });
            activeInterviews.delete(userId);
        }
    }
});

// DM me answers collect karne ka main logic
client.on('messageCreate', async message => {
    if (message.author.bot || message.guild) return; // Sirf user ke DM message read karega

    const userId = message.author.id;
    if (!activeInterviews.has(userId)) return;

    const session = activeInterviews.get(userId);
    session.answers.push(message.content);
    session.currentStep++;

    // Agar abhi aur sawal baaki hain
    if (session.currentStep < interviewQuestions.length) {
        await message.author.send(`**Sawal ${session.currentStep + 1}:** ${interviewQuestions[session.currentStep]}`);
    } else {
        // Saare sawal poore hone par code automatic staff channel me bhejega
        await message.author.send("⏳ Thank you! Aapke saare answers automatic submit ho chuke hain. Staff ke decision ka wait karein.");
        
        const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
            const embed = new EmbedBuilder()
                .setTitle("📝 Nayi Whitelist Application (Zeta System)")
                .setColor(0x36393F)
                .addFields(
                    { name: 'Discord User', value: `<@${userId}>`, inline: true },
                    { name: 'IGN', value: session.answers[0], inline: true },
                    { name: 'Age', value: session.answers[1], inline: true },
                    { name: 'Rules Knowledge', value: session.answers[2] },
                    { name: 'Reason to Join', value: session.answers[3] }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`staff_accept_${userId}_${session.answers[0]}`).setLabel('Accept with Reason ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`staff_deny_${userId}`).setLabel('Deny with Reason ❌').setStyle(ButtonStyle.Danger)
            );

            await staffChannel.send({ embeds: [embed], components: [row] });
        }
        activeInterviews.delete(userId);
    }
});

// Staff ke Accept/Deny dabane par Modal (Popup Box) kholna
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [type, action, targetUserId, ign] = interaction.customId.split('_');
    if (type !== 'staff') return;

    if (action === 'accept') {
        const modal = new ModalBuilder().setCustomId(`modal_accept_${targetUserId}_${ign}`).setTitle('Reason for Acceptance');
        const reasonInput = new TextInputBuilder().setCustomId('accept_reason').setLabel("Accept karne ka ek solid reason likhein:").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }

    if (action === 'deny') {
        const modal = new ModalBuilder().setCustomId(`modal_deny_${targetUserId}`).setTitle('Reason for Rejection');
        const reasonInput = new TextInputBuilder().setCustomId('deny_reason').setLabel("Application Reject karne ka reason dalein:").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
    }
});

// Modal submit hone par (Reason likhne ke baad ka action)
client.on('interactionCreate', async interaction => {
    if (interaction.type !== InteractionType.ModalSubmit) return;
    const [prefix, action, targetUserId, ign] = interaction.customId.split('_');

    if (action === 'accept') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('accept_reason');

        // Game Server command bypass (RCON standard query)
        try {
            const rcon = await Rcon.connect({
                host: process.env.RCON_HOST,
                port: parseInt(process.env.RCON_PORT),
                password: process.env.RCON_PASSWORD
            });
            await rcon.send(`whitelist add ${ign}`);
            await rcon.end();
        } catch(e) { /* DiscordSRV mode bypass fallback */ }

        // Discord user ko role dena aur DM me message ping karna
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            await member.roles.add(process.env.WHITELIST_ROLE_ID).catch(() => null);
            await member.send(`🎉 **Congratulations!** Aapki whitelist application **Accept** ho gayi hai!\n📌 **Reason:** ${reason}\nAb aap game server join kar sakte hain!`).catch(() => null);
        }

        await interaction.editReply({ content: "✅ Player ko accept kar diya gaya hai aur DM bhej diya gaya hai!" });
        await interaction.message.delete();
    }

    if (action === 'deny') {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.fields.getTextInputValue('deny_reason');

        const guild = interaction.guild;
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
            await member.send(`❌ **Sorry!** Aapki whitelist application **Reject** kar di gayi hai.\n📌 **Reason:** ${reason}`).catch(() => null);
        }

        await interaction.editReply({ content: "❌ Player ko reject kar diya gaya hai aur DM bhej diya gaya hai!" });
        await interaction.message.delete();
    }
});

// Keep alive monitoring web-server script
const http = require('http');
http.createServer((req, res) => { res.write("ZetaBot System Online!"); res.end(); }).listen(process.env.PORT || 3000);
client.login(process.env.DISCORD_TOKEN);

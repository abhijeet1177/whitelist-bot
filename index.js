require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
const { QuickDB } = require('quick.db');
const config = require('./config.json');
const { handleInteractions, handleMessages } = require('./handlers.js');

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

client.once('ready', async () => {
    console.log(`🤖 [SYSTEM] Premium Whitelist Code Active And Online!`);
    
    const commands = [
        {
            name: 'setup',
            description: 'Configure your QUIL SMP Whitelist System settings',
            options: [
                {
                    name: 'role',
                    description: 'The Whitelisted/Member role to give upon approval',
                    type: 8, 
                    required: true
                },
                {
                    name: 'log_channel',
                    description: 'The Staff channel where application embeds will be sent',
                    type: 7, 
                    required: true
                }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
        console.log('✅ Re-styled /setup Slash Command Registered Successfully!');
    } catch (error) {
        console.error('Slash registration error:', error);
    }
});

// CRASH-PROOFED SETUP HANDLING
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "❌ You need Administrator permissions to run this config.", ephemeral: true });
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

        // FIX: Using followUp or sending cleanly to prevent the 40060 Acknowledge Error
        await interaction.reply({ content: `✅ **Setup Complete!** Linked Role: <@&${role.id}>`, ephemeral: true });
        return interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    await handleInteractions(interaction, db);
});

client.on('messageCreate', async (message) => {
    await handleMessages(message, client, db);
});

client.login(process.env.DISCORD_TOKEN);

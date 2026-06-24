const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { QuickDB } = require('quick.db');

// Import the three parts we built in your handler file
const { handleInteractions, handleMessages } = require('./handler.js'); 

const db = new QuickDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel
    ]
});

// FIXED: Changed 'clientReady' to 'ready'
client.once('ready', async () => {
    console.log(`🤖 [SYSTEM] Premium Whitelist Code Active And Online!`);
    console.log(`✅ Logged in as ${client.user.tag}`);

    const commands = [
        {
            name: 'setup',
            description: 'Configure your QUIL SMP Whitelist System settings',
            options: [
                {
                    name: 'role',
                    description: 'The Whitelisted/Member role to give upon approval',
                    type: 8, // Role type
                    required: true
                },
                {
                    name: 'log_channel',
                    description: 'The Staff channel where application embeds will be sent',
                    type: 7, // Channel type
                    required: true
                }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        // FIXED: Dynamically fetches Client ID so you don't need a config file
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Global Slash Commands Registered Successfully');
    } catch (error) {
        console.error('Slash registration error:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'setup') {
                if (!interaction.member.permissions.has('Administrator')) {
                    return interaction.reply({
                        content: '❌ You need Administrator permissions.',
                        ephemeral: true
                    });
                }

                const role = interaction.options.getRole('role');
                const logChannel = interaction.options.getChannel('log_channel');

                await db.set(`guild_config_${interaction.guild.id}`, {
                    roleId: role.id,
                    logChannelId: logChannel.id
                });

                const panelEmbed = new EmbedBuilder()
                    .setTitle('🛑 QUIL SMP : ACCESS TERMINAL 🛑')
                    .setColor(0xE74C3C)
                    .setDescription(
                        'Welcome to the official **QUIL SMP** Whitelist Portal.\n\n' +
                        '**📋 Requirements:**\n' +
                        '• Follow all server rules.\n' +
                        '• Provide your exact Minecraft Username.\n' +
                        '• Be respectful to the community.\n\n' +
                        'Click the button below to submit your application.'
                    )
                    .setFooter({ text: 'QUIL SMP Security System' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('start_whitelist_app')
                        .setLabel('Apply For Whitelist 📝')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.reply({
                    content: `✅ Setup Complete! Linked Role: <@&${role.id}>`,
                    ephemeral: true
                });

                await interaction.channel.send({
                    embeds: [panelEmbed],
                    components: [row]
                });

                return;
            }
        }

        if (interaction.isButton()) {
            await handleInteractions(interaction, db);
        }

    } catch (err) {
        console.error('Interaction Error:', err);
    }
});

client.on('messageCreate', async (message) => {
    try {
        // Added check to prevent processing loops on bot's own DM/channel logs
        if (message.author.bot) return;

        console.log(
            `[MESSAGE] ${message.author.tag} | ${
                message.guild ? message.guild.id : 'DM'
            } | ${message.content}`
        );

        await handleMessages(message, client, db);

    } catch (err) {
        console.error('Message Error:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);

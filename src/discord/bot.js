const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActivityType,
  MessageFlags
} = require('discord.js');

const config = require('../config');
const Guild = require('../models/GuildConfig');
const Job = require('../models/MediaJob');
const { ALL, VIDEO, AUDIO, IMAGE, DOCUMENT, normalize, canConvert } = require('../utils/formats');
const { enqueueDownload, enqueueConvert } = require('../services/jobs');
const { downloadStream } = require('../services/gridfs');

const choices = ALL.map(format => ({
  name: format.toUpperCase(),
  value: format
}));

const commands = [
  new SlashCommandBuilder()
    .setName('media')
    .setDescription('MediaX controls')
    .addSubcommand(sub =>
      sub.setName('formats').setDescription('Show supported formats')
    )
    .addSubcommand(sub =>
      sub.setName('settings').setDescription('Show server settings')
    )
    .addSubcommand(sub =>
      sub.setName('history').setDescription('Show your recent MediaX jobs')
    )
    .addSubcommand(sub =>
      sub.setName('enable').setDescription('Enable MediaX')
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Disable MediaX')
    )
    .addSubcommand(sub =>
      sub
        .setName('format')
        .setDescription('Set the default download format')
        .addStringOption(option =>
          option
            .setName('value')
            .setDescription('Format')
            .setRequired(true)
            .addChoices(...choices)
        )
    ),

  new SlashCommandBuilder()
    .setName('media-download')
    .setDescription('Download media from an HTTP/HTTPS URL')
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('Media URL')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('format')
        .setDescription('Output format')
        .setRequired(false)
        .addChoices(...choices)
    ),

  new SlashCommandBuilder()
    .setName('media-convert')
    .setDescription('Convert a Discord attachment')
    .addAttachmentOption(option =>
      option
        .setName('file')
        .setDescription('File to convert')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('format')
        .setDescription('Output format')
        .setRequired(true)
        .addChoices(...choices)
    )
];

async function getGuildConfig(guildId) {
  return Guild.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function formatEmbed() {
  return new EmbedBuilder()
    .setTitle('MediaX Formats')
    .setDescription(
      [
        `**Video:** ${VIDEO.join(', ')}`,
        `**Audio:** ${AUDIO.join(', ')}`,
        `**Images:** ${IMAGE.join(', ')}`,
        `**Documents:** ${DOCUMENT.join(', ')}`
      ].join('\n')
    );
}

async function readGridFSFile(fileId) {
  const chunks = [];
  const stream = downloadStream(fileId);

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function sendCompletedJob(interaction, job) {
  if (!job || job.status !== 'completed' || !job.gridfsFileId) {
    throw new Error('The MediaX job completed without producing a file.');
  }

  const maxDiscordBytes = config.discordMaxFileMB * 1024 * 1024;

  if (job.sizeBytes > maxDiscordBytes) {
    return interaction.editReply({
      content:
        `✅ **${job.filename}** is ready, but it is ${config.discordMaxFileMB} MB Discord limit. ` +
        `The file is stored in MongoDB/GridFS. Use the MediaX API to retrieve it.`
    });
  }

  const buffer = await readGridFSFile(job.gridfsFileId);
  const attachment = new AttachmentBuilder(buffer, { name: job.filename });

  return interaction.editReply({
    content: `✅ **${job.filename}** is ready.`,
    files: [attachment]
  });
}

async function downloadDiscordAttachment(attachment, tempPath) {
  const response = await fetch(attachment.url, {
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw new Error(`Could not download the Discord attachment (${response.status}).`);
  }

  if (!response.body) {
    throw new Error('Discord returned an empty attachment response.');
  }

  await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
  await pipeline(
    Readable.fromWeb(response.body),
    fs.createWriteStream(tempPath)
  );
}

function hasManageGuild(interaction) {
  return Boolean(interaction.memberPermissions?.has('ManageGuild'));
}

async function start() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once('ready', async () => {
    console.log(`MediaX online as ${client.user.tag}`);
    console.log(`Connected to ${client.guilds.cache.size} server(s).`);

    client.user.setPresence({
      activities: [{
        name: '/media',
        type: ActivityType.Watching
      }],
      status: 'online'
    });

    try {
      const rest = new REST({ version: '10' }).setToken(config.discordToken);
      await rest.put(
        Routes.applicationCommands(config.discordClientId),
        { body: commands.map(command => command.toJSON()) }
      );
      console.log('MediaX slash commands registered globally.');
    } catch (error) {
      console.error('Could not register Discord slash commands:', error);
    }
  });

  client.on('guildCreate', guild => {
    getGuildConfig(guild.id).catch(error => {
      console.error(`Could not create config for guild ${guild.id}:`, error);
    });
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (!interaction.guildId) {
        return interaction.reply({
          content: 'MediaX can only be used inside a Discord server.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Acknowledge every command immediately. MongoDB, yt-dlp and FFmpeg can
      // all take longer than Discord's initial interaction response window.
      const privateResponse =
        interaction.commandName === 'media-convert' ||
        interaction.commandName === 'media-download' ||
        (interaction.commandName === 'media' &&
          ['settings', 'history', 'enable', 'disable', 'format'].includes(
            interaction.options.getSubcommand(false)
          ));

      await interaction.deferReply(
        privateResponse ? { flags: MessageFlags.Ephemeral } : undefined
      );

      const settings = await getGuildConfig(interaction.guildId);

      if (interaction.commandName === 'media') {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'formats') {
          return interaction.editReply({ embeds: [formatEmbed()] });
        }

        if (subcommand === 'settings') {
          return interaction.editReply(
            `Enabled: **${settings.enabled}**\nDefault format: **${settings.defaultFormat.toUpperCase()}**`
          );
        }

        if (subcommand === 'history') {
          const jobs = await Job.find({
            guildId: interaction.guildId,
            userId: interaction.user.id
          })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

          const content = jobs.length
            ? jobs
                .map(job => {
                  const filename = job.filename ? ` — ${job.filename}` : '';
                  return `\`${job.status}\` ${job.type} → **${job.outputFormat.toUpperCase()}**${filename}`;
                })
                .join('\n')
            : 'No MediaX jobs yet.';

          return interaction.editReply(content);
        }

        if (!hasManageGuild(interaction)) {
          return interaction.editReply('Manage Server permission is required for this setting.');
        }

        if (subcommand === 'enable' || subcommand === 'disable') {
          settings.enabled = subcommand === 'enable';
          await settings.save();
          return interaction.editReply(
            `MediaX is now **${settings.enabled ? 'enabled' : 'disabled'}**.`
          );
        }

        if (subcommand === 'format') {
          const format = normalize(interaction.options.getString('value', true));

          if (!ALL.includes(format)) {
            return interaction.editReply(`Unsupported format: **${format}**`);
          }

          settings.defaultFormat = format;
          await settings.save();

          return interaction.editReply(
            `Default download format is now **${format.toUpperCase()}**.`
          );
        }

        return interaction.editReply('Unknown MediaX command.');
      }

      if (interaction.commandName === 'media-download') {
        if (!settings.enabled) {
          return interaction.editReply('MediaX is disabled in this server.');
        }

        const url = interaction.options.getString('url', true).trim();

        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Only HTTP/HTTPS URLs are supported.');
          }
        } catch {
          return interaction.editReply('Please provide a valid HTTP/HTTPS URL.');
        }

        const format = normalize(
          interaction.options.getString('format') || settings.defaultFormat
        );

        if (!ALL.includes(format)) {
          return interaction.editReply(`Unsupported format: **${format}**`);
        }

        const job = await Job.create({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          type: 'download',
          source: url,
          outputFormat: format
        });

        const result = await enqueueDownload(job);
        return sendCompletedJob(interaction, result);
      }

      if (interaction.commandName === 'media-convert') {
        if (!settings.enabled) {
          return interaction.editReply('MediaX is disabled in this server.');
        }

        const attachment = interaction.options.getAttachment('file', true);
        const outputFormat = normalize(
          interaction.options.getString('format', true)
        );
        const inputFormat = normalize(path.extname(attachment.name));

        if (!inputFormat) {
          return interaction.editReply('The uploaded file does not have a recognizable extension.');
        }

        if (!ALL.includes(inputFormat)) {
          return interaction.editReply(
            `Input format **${inputFormat}** is not supported by MediaX.`
          );
        }

        if (!ALL.includes(outputFormat)) {
          return interaction.editReply(
            `Output format **${outputFormat}** is not supported by MediaX.`
          );
        }

        if (inputFormat === outputFormat) {
          return interaction.editReply('Choose a different output format.');
        }

        if (!canConvert(inputFormat, outputFormat)) {
          return interaction.editReply(
            `Conversion from **${inputFormat}** to **${outputFormat}** is not supported.`
          );
        }

        const maxUploadBytes = config.maxUploadMB * 1024 * 1024;
        if (attachment.size > maxUploadBytes) {
          return interaction.editReply(
            `That file exceeds the ${config.maxUploadMB} MB upload limit.`
          );
        }

        const tempPath = path.join(
          config.tempDir,
          `discord-${Date.now()}-${interaction.user.id}-${Math.random()
            .toString(16)
            .slice(2)}.${inputFormat}`
        );

        try {
          await downloadDiscordAttachment(attachment, tempPath);

          const job = await Job.create({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            type: 'convert',
            inputFormat,
            outputFormat
          });

          const result = await enqueueConvert(job, tempPath, inputFormat);
          return sendCompletedJob(interaction, result);
        } finally {
          try {
            await fs.promises.rm(tempPath, { force: true });
          } catch {}
        }
      }

      return interaction.editReply('Unknown MediaX command.');
    } catch (error) {
      console.error('MediaX interaction error:', error);

      const message = `❌ ${error?.message || 'An unexpected MediaX error occurred.'}`;

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(message);
        } else {
          await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (replyError) {
        console.error('Could not send Discord error response:', replyError);
      }
    }
  });

  await client.login(config.discordToken);
}

module.exports = { start };

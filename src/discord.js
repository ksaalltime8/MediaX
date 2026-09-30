const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const axios = require('axios');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');
const { download } = require('./services/downloader');
const { detect, optionsFor, runConversion } = require('./services/converter');
const { safeName } = require('./utils/fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

const sessions = new Map();

function bar(percent) {
  const n = 20, filled = Math.round((percent/100)*n);
  return '█'.repeat(filled) + '░'.repeat(n-filled);
}
function etaText(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return 'calculating…';
  seconds=Math.max(0,Math.round(seconds));
  const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=seconds%60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
function progressEmbed(title,p) {
  return new EmbedBuilder().setTitle(title).setDescription(
    `**${bar(p.percent||0)} ${Math.round(p.percent||0)}%**\n`+
    `Speed: \`${p.speed || 'calculating…'}\`\n`+
    `ETA: \`${p.eta || etaText(p.etaSeconds)}\``
  );
}

const commands = [
  new SlashCommandBuilder().setName('download').setDescription('Download media from a supported public URL.')
    .addStringOption(o=>o.setName('url').setDescription('Media URL').setRequired(true))
    .addStringOption(o=>o.setName('type').setDescription('Download type').setRequired(false)
      .addChoices({name:'Best available',value:'best'},{name:'Video',value:'video'},{name:'MP3 audio',value:'audio'})),
  new SlashCommandBuilder().setName('convert').setDescription('Upload a file and convert it to another format.')
].map(c=>c.toJSON());

async function registerCommands() {
  const rest=new REST({version:'10'}).setToken(config.discordToken);
  if(config.guildId) await rest.put(Routes.applicationGuildCommands(config.clientId,config.guildId),{body:commands});
  else await rest.put(Routes.applicationCommands(config.clientId),{body:commands});
}

client.on('ready',()=>console.log(`[Discord] Logged in as ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName==='download') {
      const url=interaction.options.getString('url',true);
      const type=interaction.options.getString('type') || 'best';
      await interaction.reply({embeds:[progressEmbed('MediaX • Starting',{percent:0})]});
      const message=await interaction.fetchReply();
      let last=0;
      try {
        const result=await download(url,type,p=>{
          const now=Date.now();
          if(now-last<1200 && p.percent<100) return;
          last=now;
          interaction.editReply({embeds:[progressEmbed('MediaX • Downloading',p)]}).catch(()=>{});
        });
        const stat=await fs.stat(result.output);
        if(stat.size > config.maxOutputMb*1024*1024) {
          return interaction.editReply({content:`Downloaded successfully, but the file is ${Math.round(stat.size/1024/1024)} MB and exceeds MediaX's configured ${config.maxOutputMb} MB attachment limit.`,embeds:[]});
        }
        await interaction.editReply({content:'**100% — Download complete.**',embeds:[],files:[new AttachmentBuilder(result.output)]});
      } catch(e) {
        await interaction.editReply({content:`❌ Download failed: ${e.message}`,embeds:[]});
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName==='convert') {
      sessions.set(interaction.user.id,{expires:Date.now()+10*60*1000});
      await interaction.reply({embeds:[new EmbedBuilder().setTitle('MediaX • Convert').setDescription(
        'Upload **one** image, video, GIF, or audio file in this channel.\n\n'+
        'I will detect its format automatically, then show you the compatible output formats.\n'+
        'Your original aspect ratio will be preserved — MediaX does not crop the source.'
      )]});
      return;
    }

    if(interaction.isStringSelectMenu() && interaction.customId.startsWith('mediax-target:')) {
      const [_, userId, uploadId]=interaction.customId.split(':');
      if(interaction.user.id!==userId) return interaction.reply({content:'This menu belongs to another user.',ephemeral:true});
      const target=interaction.values[0];
      const s=sessions.get(userId);
      if(!s || !s.file || s.uploadId!==uploadId) return interaction.reply({content:'This conversion session expired. Run /convert again.',ephemeral:true});
      s.target=target;
      await interaction.update({embeds:[new EmbedBuilder().setTitle('MediaX • Ready').setDescription(`Source: **${s.detected.ext.toUpperCase()}**\nTarget: **${target.toUpperCase()}**\n\nPress **Convert** to start.`)],
        components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mediax-go:${userId}:${uploadId}`).setLabel('Convert').setStyle(ButtonStyle.Primary))]});
      return;
    }

    if(interaction.isButton() && interaction.customId.startsWith('mediax-go:')) {
      const [_,userId,uploadId]=interaction.customId.split(':');
      if(interaction.user.id!==userId) return interaction.reply({content:'This button belongs to another user.',ephemeral:true});
      const s=sessions.get(userId);
      if(!s || s.uploadId!==uploadId || !s.target) return interaction.reply({content:'Session expired. Run /convert again.',ephemeral:true});
      await interaction.update({embeds:[progressEmbed('MediaX • Converting',{percent:0})],components:[]});
      let last=0;
      try {
        const result=await runConversion(s.file,s.originalName,s.target,p=>{
          const now=Date.now(); if(now-last<1000 && p.percent<100)return; last=now;
          interaction.editReply({embeds:[progressEmbed('MediaX • Converting',p)]}).catch(()=>{});
        });
        const stat=await fs.stat(result.output);
        if(stat.size > config.maxOutputMb*1024*1024) return interaction.editReply({content:`Conversion complete, but the output is ${Math.round(stat.size/1024/1024)} MB, over the ${config.maxOutputMb} MB attachment limit.`,embeds:[]});
        await interaction.editReply({content:`**100% — Conversion complete.**\n${s.detected.ext.toUpperCase()} → ${s.target.toUpperCase()}`,embeds:[],files:[new AttachmentBuilder(result.output)]});
        sessions.delete(userId);
      } catch(e) { await interaction.editReply({content:`❌ Conversion failed: ${e.message}`,embeds:[]}); }
    }
  } catch(e) { console.error(e); if(!interaction.replied) interaction.reply({content:'Something went wrong.',ephemeral:true}).catch(()=>{}); }
});

client.on('messageCreate', async message => {
  if(message.author.bot) return;
  const s=sessions.get(message.author.id);
  if(!s || Date.now()>s.expires || s.file) return;
  if(!message.attachments.size) return;
  const attachment=message.attachments.first();
  if(attachment.size > config.maxUploadMb*1024*1024) return message.reply(`❌ That file is too large. Maximum: ${config.maxUploadMb} MB.`);
  const ext=path.extname(attachment.name).slice(1).toLowerCase();
  const temp=path.join(config.dirs.temp,`${message.author.id}-${Date.now()}-${safeName(attachment.name)}`);
  try {
    await fs.mkdir(config.dirs.temp,{recursive:true});
    const response=await axios.get(attachment.url,{responseType:'arraybuffer',timeout:120000});
    await fs.writeFile(temp,response.data);
    const detected=await detect(temp);
    const formats=optionsFor(detected.group,detected.ext);
    if(!formats.length){ await fs.rm(temp,{force:true}); return message.reply(`❌ I detected **${detected.ext || ext || 'unknown'}**, but there are no compatible target formats configured.`); }
    s.file=temp; s.originalName=attachment.name; s.detected=detected; s.uploadId=path.basename(temp); s.expires=Date.now()+10*60*1000;
    const menu=new StringSelectMenuBuilder().setCustomId(`mediax-target:${message.author.id}:${s.uploadId}`).setPlaceholder(`Convert ${detected.ext.toUpperCase()} to…`)
      .addOptions(formats.slice(0,25).map(f=>({label:f.toUpperCase(),value:f,description:`Convert to ${f.toUpperCase()} without cropping`})));
    await message.reply({embeds:[new EmbedBuilder().setTitle('MediaX • File detected').setDescription(
      `Detected: **${detected.ext.toUpperCase()}**\nChoose your output format below.`
    )],components:[new ActionRowBuilder().addComponents(menu)]});
  } catch(e) { await fs.rm(temp,{force:true}).catch(()=>{}); await message.reply(`❌ I couldn't read that file: ${e.message}`); }
});

async function start() {
  if(!config.discordToken || !config.clientId) throw new Error('Set DISCORD_TOKEN and CLIENT_ID in .env');
  await require('node:fs/promises').mkdir(config.dirs.temp,{recursive:true});
  await registerCommands();
  await client.login(config.discordToken);
}
module.exports = { client, start };

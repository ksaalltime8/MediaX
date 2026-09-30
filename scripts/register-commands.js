require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

(async()=>{
  const token=process.env.DISCORD_TOKEN, clientId=process.env.CLIENT_ID, guildId=process.env.GUILD_ID;
  if(!token||!clientId) throw new Error('Set DISCORD_TOKEN and CLIENT_ID in .env');
  const commands=[
    new SlashCommandBuilder().setName('download').setDescription('Download media from a supported public URL.')
      .addStringOption(o=>o.setName('url').setDescription('Media URL').setRequired(true))
      .addStringOption(o=>o.setName('type').setDescription('Download type')
        .addChoices({name:'Best available',value:'best'},{name:'Video',value:'video'},{name:'MP3 audio',value:'audio'})),
    new SlashCommandBuilder().setName('convert').setDescription('Upload a file and convert it to another format.')
  ].map(x=>x.toJSON());
  const rest=new REST({version:'10'}).setToken(token);
  const route=guildId?Routes.applicationGuildCommands(clientId,guildId):Routes.applicationCommands(clientId);
  await rest.put(route,{body:commands});
  console.log('Slash commands registered.');
})().catch(e=>{console.error(e);process.exit(1);});

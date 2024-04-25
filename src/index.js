import WebSocket from 'ws';
import tls from 'tls';
import { request } from 'undici';
import config from '../config.js';

const guilds = new Map();
let ws, tlsSocket;

const handleMessage = async message => {
  try {
    const { t, d } = JSON.parse(message);
    if (t === 'READY') handleReady(d.guilds);
    if (['GUILD_UPDATE', 'GUILD_DELETE'].includes(t)) handleGuildUpdateOrDelete(t, d);
    if (t === 'HEARTBEAT') ws.send('{"op":0,"d":null}');
    if (t === 'INVALID_SESSION') setTimeout(connectWebSocket, 100);
  } catch (error) {
    console.error('Error parsing message:', error);
  }
};

const handleGuildUpdateOrDelete = async (type, { guild_id, id, vanity_url_code }) => {
  const previousVanity = guilds.get(type === 'GUILD_UPDATE' ? guild_id : id);
  if (previousVanity && previousVanity !== vanity_url_code) {
    try {
      await request(`https://canary.discord.com/api/v7/guilds/${config.sniperGuild}/vanity-url`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': config.sniperToken }, body: JSON.stringify({ code: previousVanity }) });
    } catch (error) {
      console.error(`${previousVanity}: ${error.message}`);
    }
  }
};

const handleReady = guildsData => {
  const startTime = Date.now();
  guildsData.forEach(async guild => {
    if (guild.vanity_url_code) {
      guilds.set(guild.id, guild.vanity_url_code);
      await handleGuildUpdateOrDelete('GUILD_UPDATE', guild);
    }
  });
  console.log(`All vanity URLs updated in ${Date.now() - startTime}ms`);
};

const connectWebSocket = () => {
  if (!tlsSocket) tlsSocket = tls.connect({ host: 'gateway.discord.gg', port: 443 });
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    ws = new WebSocket('wss://gateway.discord.gg', { server: tlsSocket });
    ws.on('open', () => ws.send(JSON.stringify({ op: 2, d: { token: config.listenerToken, intents: 1, properties: { os: 'IOS', browser: 'firefox', device: 'firefox' } } })));
    ws.on('message', handleMessage);
    ws.on('close', () => { console.log('WebSocket connection closed. Reconnecting...'); ws = null; setTimeout(connectWebSocket, 100); });
    ws.on('error', error => { console.error('WebSocket connection error:', error); console.log('Reconnecting...'); ws = null; setTimeout(connectWebSocket, 100); });
  }
};

connectWebSocket();

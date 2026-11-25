// © 2026 Q3yb - Wick studio.
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Render يحتاج بورت مفتوح
let webServer = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// الموقع يفتح فوراً (Render يحتاج بورت مفتوح)
try { webServer = require('./bank/admin/web').start(client, () => applyStatus()); } catch (e) { console.error('web:', e); require('http').createServer((_, r) => r.end('ok')).listen(process.env.PORT || 3000); }

let handleBankCommand = async () => false;
let handleBankInteraction = async () => {};
let BankUser = null;

try {
  const bankSystem = require('./bank/index.js');
  if (typeof bankSystem.handleBankCommand === 'function') handleBankCommand = bankSystem.handleBankCommand;
  if (typeof bankSystem.handleBankInteraction === 'function') handleBankInteraction = bankSystem.handleBankInteraction;
  if (bankSystem.bankCommands) client.bankCommands = bankSystem.bankCommands;
  BankUser = require('./bank/models/BankUser');
  console.log('✅ Bank system loaded successfully (' + (bankSystem.bankCommands?.size || 0) + ' commands)');
} catch (error) {
  console.error('❌ Failed to load Bank System:', error);
}

const readAdminSettings = () => {
  try {
    const filePath = path.join(__dirname, 'admin_settings.json');
    if (!fs.existsSync(filePath)) return { adminRoles: [], eventRoles: [] };
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return { adminRoles: [], eventRoles: [] }; }
};
const hasAdminPermission = (member) => {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const s = readAdminSettings();
  if (!s.adminRoles) return false;
  return member.roles.cache.some((r) => s.adminRoles.map(String).includes(r.id));
};
const hasEventPermission = (member) => {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const s = readAdminSettings();
  if (!s.eventRoles) return false;
  return member.roles.cache.some((r) => s.eventRoles.map(String).includes(r.id));
};

// ================= النسخ الاحتياطي + لوحة التحكم =================
const OWNER_ID = process.env.OWNER_ID;
let backup = null, dashboard = null, settingsUtil = null;
try {
  backup = require('./bank/utils/backup');
  dashboard = require('./bank/admin/dashboard');
  settingsUtil = require('./bank/utils/settings');
} catch (e) { console.error('❌ Failed to load dashboard/backup:', e); }

const isOwner = (id) => !!OWNER_ID && id === OWNER_ID;
const isAdminMember = (member) => !!member && (hasAdminPermission(member) || isOwner(member.id));

// حالة البوت من الإعدادات
function applyStatus() {
  const st = settingsUtil?.getSettings().status;
  try {
    if (st?.text) client.user.setPresence({ status: st.state || 'online', activities: [{ name: st.text, type: st.type ?? 0 }] });
    else client.user.setPresence({ status: 'online', activities: [{ name: 'Vanr Bank', type: 0 }] });
  } catch (e) { console.error('status:', e.message); }
}

client.on('clientReady', async () => {
  console.log(`${client.user.username} is Online`);
  if (dashboard) {
    dashboard.init({ client, isAdmin: isAdminMember, isOwner, applyStatus });
    dashboard.registerCommands(client).catch((e) => console.error('slash register:', e.message));
  }
  // نحذف أوامر السلاش العامة القديمة (مثل /daily) اللي ما لها معالج في هذا الكود
  client.application?.commands.set([]).catch((e) => console.error('clear global commands:', e.message));
  applyStatus();
  if (backup && BankUser) {
    await backup.autoRestore(client);
    applyStatus();
    BankUser.__setOnChange(() => backup.onDataChange(client));
    const hours = Number(process.env.AUTO_BACKUP_HOURS ?? 6);
    if (hours > 0) setInterval(() => backup.sendBackup(client, 'تلقائية').catch((e) => console.error('auto backup:', e.message)), hours * 3600000);
  }
});
client.on('guildCreate', () => { if (dashboard) dashboard.registerCommands(client).catch(() => {}); });

let warnedEmpty = false;
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content && !message.attachments.size && !message.embeds.length && !warnedEmpty) {
    warnedEmpty = true;
    console.warn('⚠️ وصلتني رسالة بدون نص: فعّل MESSAGE CONTENT INTENT من Developer Portal ← Bot ثم أعد التشغيل.');
  }

  // ---- فحص سريع: يشتغل بدون بريفكس وبأي روم ----
  if (['فحص', 'ping'].includes(message.content.trim().toLowerCase())) {
    const cfg = settingsUtil?.getSettings() || {};
    const chans = (cfg.bankChannels || []).map(String).filter((x) => x.trim());
    return message.reply([
      '✅ البوت يشوف رسائلك.',
      `نظام البنك: ${client.bankCommands ? `محمّل (${client.bankCommands.size} أمر/اسم)` : '❌ لم يتحمّل — شوف سجل التشغيل'}`,
      `البريفكس: ${cfg.prefix ? `\`${cfg.prefix}\`` : 'بدون'}`,
      `الروم الحالي: ${chans.length ? (chans.includes(message.channel.id) ? 'مسموح' : '❌ غير مسموح (محدد رومات للبنك)') : 'مسموح'}`,
    ].join('\n')).catch((e) => console.error('فحص reply failed:', e.message));
  }

  // البريفكس (فاضي = بدون)
  const prefix = settingsUtil?.getSettings().prefix || '';
  let content = message.content.trim();
  if (prefix) { if (!content.startsWith(prefix)) return; content = content.slice(prefix.length).trim(); }
  const parts = content.split(/ +/);
  const commandName = parts.shift()?.toLowerCase();
  const args = parts;
  if (!commandName) return;

  // ---- لوحة التحكم (نص): لوحة ----
  if (dashboard && ['لوحة', 'dashboard', 'داشبورد'].includes(commandName)) {
    if (!isAdminMember(message.member)) return message.reply('❌ للإدارة فقط.');
    try { return await message.reply(await dashboard.dashboardPayload(message.guild)); }
    catch (e) { console.error(e); return message.reply(`❌ ${e.message}`); }
  }

  // ---- أوامر المالك: نسخة / استرجاع ----
  if (backup && BankUser && ['!backup', 'backup', 'نسخة'].includes(commandName)) {
    if (!isOwner(message.author.id)) return message.reply('❌ للمالك فقط.');
    const ok = await backup.sendBackup(client, 'يدوية');
    return message.reply(ok ? '✅ أرسلت النسخة.' : '❌ ما قدرت أرسل النسخة (تأكد إن الخاص مفتوح أو البوت يشوف الروم).');
  }
  if (backup && BankUser && ['!restore', 'restore', 'استرجاع'].includes(commandName)) {
    if (!isOwner(message.author.id)) return message.reply('❌ للمالك فقط.');
    const att = message.attachments.first();
    if (!att) return message.reply('❌ أرفق ملف النسخة مع الأمر.');
    try {
      const n = backup.applyBackup(await (await fetch(att.url)).text());
      applyStatus();
      return message.reply(`✅ تم الاسترجاع: ${n} حساب مع الإعدادات والخلفية.`);
    } catch (e) { return message.reply(`❌ فشل الاسترجاع: ${e.message}`); }
  }

  // صلاحيات البوت في الروم: ردود البنك بطاقات صور/embeds، وبدون الصلاحيات ما يوصل أي رد
  if (client.bankCommands?.has(commandName)) {
    const perms = message.channel.permissionsFor?.(client.user);
    if (perms) {
      const need = { SendMessages: 'إرسال الرسائل', EmbedLinks: 'تضمين الروابط', AttachFiles: 'إرفاق الملفات', ReadMessageHistory: 'قراءة سجل الرسائل' };
      const missing = Object.entries(need).filter(([k]) => !perms.has(PermissionFlagsBits[k])).map(([, v]) => v);
      if (missing.length) {
        console.warn(`⚠️ ينقص البوت صلاحيات في #${message.channel.name}: ${missing.join('، ')}`);
        if (perms.has(PermissionFlagsBits.SendMessages)) return message.channel.send(`❌ ينقص البوت صلاحيات في هذا الروم: **${missing.join('، ')}**`).catch(() => {});
        return;
      }
    }
  }
  if (typeof handleBankCommand === 'function') {
    try { await handleBankCommand(message, commandName, args); }
    catch (error) { console.error('[Bank Command Error]:', error); }
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (dashboard && interaction.isChatInputCommand()) return await dashboard.handleSlash(interaction);
    if (dashboard && interaction.customId?.startsWith('dash_')) return await dashboard.handleComponent(interaction);
    if (typeof handleBankInteraction === 'function') await handleBankInteraction(interaction);
  } catch (error) { console.error('[Interaction Error]:', error); }
});

client.login(process.env.TOKEN).then(() => console.log('✅ Bot logged in successfully'))
  .catch((e) => console.error('❌ Startup error:', e));

module.exports = { client, hasAdminPermission, hasEventPermission, readAdminSettings };

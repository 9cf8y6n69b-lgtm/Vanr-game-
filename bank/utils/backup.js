// نسخ احتياطي موحّد: يرسل لـ BACKUP_TARGET_ID (قناة أو شخص) عند كل تغيير
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const BankUser = require('../models/BankUser');
const { getSettings, readConfig, writeConfig } = require('./settings');

const ROOT = path.join(__dirname, '..', '..');
const TEXT_FILES = ['bank/config/bank-config.json', 'bank/config/cars-config.json', 'admin_settings.json',
  'bank/data/auction.json', 'bank/data/harraj.json', 'bank/data/marketPrices.json'];
const BIN_FILES = ['bank/data/background.jpg'];
// لا يوجد هدف افتراضي: النسخ تروح فقط لـ BACKUP_TARGET_ID أو لمالك البوت OWNER_ID
const targetId = () => process.env.BACKUP_TARGET_ID || process.env.OWNER_ID || '';

function buildBackup() {
  const files = {}, binary = {};
  for (const f of TEXT_FILES) { try { files[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch {} }
  for (const f of BIN_FILES) { try { binary[f] = fs.readFileSync(path.join(ROOT, f)).toString('base64'); } catch {} }
  return JSON.stringify({ version: 2, createdAt: new Date().toISOString(), users: BankUser.__dump(), files, binary });
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// يكمّل أي مفتاح ناقص في النسخة القديمة من الإعدادات الحالية (عشان ما تضيع الأراضي/الخبرة/القروض...)
function fillDefaults(target, def) {
  for (const k of Object.keys(def)) {
    if (target[k] === undefined) target[k] = JSON.parse(JSON.stringify(def[k]));
    else if (isObj(def[k]) && isObj(target[k])) fillDefaults(target[k], def[k]);
  }
  return target;
}
// يقبل أكثر من شكل لملف النسخة
function extractUsers(data) {
  const cands = [data, data?.users, data?.accounts, data?.BankUser, data?.bankUsers, data?.data, data?.data?.users];
  for (const c of cands) {
    let arr = Array.isArray(c) ? c : (isObj(c) ? Object.values(c) : null);
    if (arr && arr.length && arr.every((u) => isObj(u))) {
      arr = arr.filter((u) => u.userId && u.guildId);
      if (arr.length) return arr;
    }
  }
  return Array.isArray(data?.users) ? data.users : null;
}
function applyBackup(text) {
  let data;
  try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new Error('الملف مو نسخة احتياطية صحيحة (JSON تالف)'); }
  const users = extractUsers(data);
  if (!users) throw new Error('ما لقيت حسابات داخل الملف — تأكد إنه ملف backup-....json من نفس البوت');
  const n = BankUser.__load(users);
  const files = (data && isObj(data.files)) ? data.files : {};
  const current = readConfig();
  for (const f of TEXT_FILES) {
    if (typeof files[f] !== 'string') continue;
    try {
      const parsed = JSON.parse(files[f]);
      let out = parsed;
      if (f === 'bank/config/bank-config.json') {
        out = fillDefaults(parsed, current);
        if (isObj(files['admin_settings.json'] && JSON.parse(files['admin_settings.json']))) {
          out.adminSettings = { ...JSON.parse(files['admin_settings.json']), ...(out.adminSettings || {}) };
        }
      }
      if (f === 'admin_settings.json') continue; // ملف قديم: ينضم لإعدادات bank-config فوق
      fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, f), JSON.stringify(out, null, 2));
    } catch (e) { console.error('restore file failed:', f, e.message); }
  }
  // لو النسخة قديمة وفيها admin_settings فقط
  if (typeof files['bank/config/bank-config.json'] !== 'string' && typeof files['admin_settings.json'] === 'string') {
    try { const cfg = readConfig(); cfg.adminSettings = { ...JSON.parse(files['admin_settings.json']), ...(cfg.adminSettings || {}) }; writeConfig(cfg); } catch {}
  }
  for (const f of BIN_FILES) {
    if (data.binary && typeof data.binary[f] === 'string') {
      try { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), Buffer.from(data.binary[f], 'base64')); } catch {}
    }
  }
  try { require('./helpers').loadMarketPrices?.(); } catch {}
  return n;
}
const makeAttachment = () => new AttachmentBuilder(Buffer.from(buildBackup()), { name: `backup-${new Date().toISOString().slice(0, 10)}.json` });

async function resolveTarget(client) {
  const id = targetId();
  if (!id) return null;
  try { const ch = await client.channels.fetch(id); if (ch?.isTextBased?.()) return ch; } catch {}
  try { return await client.users.fetch(id); } catch {}
  return null;
}

async function sendBackup(client, reason) {
  const content = `💾 نسخة احتياطية (${reason}) — ${BankUser.__count()} حساب`;
  const tries = [await resolveTarget(client)];
  if (process.env.OWNER_ID && process.env.OWNER_ID !== targetId()) tries.push(await client.users.fetch(process.env.OWNER_ID).catch(() => null));
  for (const t of tries) {
    if (!t) continue;
    try { await t.send({ content, files: [makeAttachment()] }); return true; } catch (e) { console.error('backup send failed:', e.message); }
  }
  return false;
}

// تأخير ذكي: لو فيه نسخة مجدولة أبكر نتركها، ولو الجديدة أبكر نقدّمها
let timer = null, dueAt = 0;
function requestBackup(client, reason, delayMs = 3000) {
  const due = Date.now() + delayMs;
  if (timer && dueAt <= due) return;
  if (timer) clearTimeout(timer);
  dueAt = due;
  timer = setTimeout(() => { timer = null; dueAt = 0; sendBackup(client, reason).catch(() => {}); }, delayMs);
}
// تغييرات البيانات العادية (فلوس، ألعاب...) — بفاصل يتحدد من اللوحة (0 = إيقاف)
function onDataChange(client) {
  const sec = Number.isFinite(getSettings().backupDelaySec) ? getSettings().backupDelaySec : 300;
  if (sec > 0) requestBackup(client, 'تغيير بيانات', sec * 1000);
}

// يرجّع آخر نسخة تلقائياً لو البيانات فاضية (بعد تحديث/إعادة تشغيل Render)
async function autoRestore(client) {
  if (BankUser.__count() > 0) return;
  try {
    const t = await resolveTarget(client);
    if (!t) return console.log('ℹ️ ما قدرت أوصل لمكان النسخ الاحتياطية');
    const box = t.messages ? t : await t.createDM();
    const msgs = await box.messages.fetch({ limit: 50 });
    const m = msgs.find((x) => x.author.id === client.user.id && x.attachments.some((a) => a.name?.startsWith('backup-')));
    if (!m) return console.log('ℹ️ ما لقيت نسخة سابقة');
    const att = m.attachments.find((a) => a.name?.startsWith('backup-'));
    const n = applyBackup(await (await fetch(att.url)).text());
    console.log(`✅ تم استرجاع آخر نسخة تلقائياً (${n} حساب)`);
  } catch (e) { console.error('autoRestore failed:', e.message); }
}
module.exports = { buildBackup, applyBackup, makeAttachment, sendBackup, requestBackup, onDataChange, autoRestore, targetId };

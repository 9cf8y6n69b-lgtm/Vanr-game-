// بطاقة السوق (تصميم Bank Market) بألوان Vanr Bank
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');
const { newCard, finishCard, drawAvatar, rr, FONT } = require('./cardKit');
const { getActiveBranding } = require('./canvas');
const { formatMoney, readConfig, getMaterialPrices } = require('./helpers');

const IMG_DIR = path.join(__dirname, '../../img/bank/market');
const LOGO = path.join(__dirname, '../../img/bank/logo.png');
const cache = new Map();
async function matImage(id) {
  if (cache.has(id)) return cache.get(id);
  let img = null;
  try { img = await loadImage(path.join(IMG_DIR, `${id}.png`)); } catch {}
  cache.set(id, img);
  return img;
}
function fitImage(ctx, img, cx, cy, box) {
  if (!img) return;
  const s = Math.min(box / img.width, box / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
function triangle(ctx, cx, cy, size, up, color) {
  ctx.beginPath();
  if (up) { ctx.moveTo(cx, cy - size); ctx.lineTo(cx + size, cy + size * 0.8); ctx.lineTo(cx - size, cy + size * 0.8); }
  else { ctx.moveTo(cx, cy + size); ctx.lineTo(cx + size, cy - size * 0.8); ctx.lineTo(cx - size, cy - size * 0.8); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function pill(ctx, x, y, w, h, fill = 'rgba(38,50,105,0.42)') { rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); }
function updatedAt() {
  try {
    return new Date(global.marketLastUpdate || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: process.env.TZ_DISPLAY || 'Asia/Riyadh' }).replace(' ', '');
  } catch { return ''; }
}

async function createMarketImage(user, discordUser, guildOrId) {
  const config = readConfig();
  const defs = config?.material_definitions || {};
  const ids = Object.keys(defs).slice(0, 6);
  const W = 1075, H = 560;
  const card = await newCard(W, H, guildOrId || user?.guildId, { noHeader: true });
  const { ctx, COLORS } = card;
  const stroke = COLORS.cardBorder || COLORS.line;

  // ---- العنوان ----
  const brand = getActiveBranding(guildOrId || user?.guildId);
  try { ctx.drawImage(await loadImage(brand.iconURL || LOGO), 235, 38, 40, 40); } catch {}
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = COLORS.text; ctx.font = FONT('bold', 30);
  ctx.fillText(`${brand.name} Market`, 288, 59);
  ctx.textBaseline = 'alphabetic';

  // ---- بطاقات الموارد (عمودين × ثلاثة صفوف) ----
  const tw = 325, th = 118, gx = 15, gy = 12, x0 = 45, y0 = 96;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], def = defs[id];
    const x = x0 + (i % 2) * (tw + gx), y = y0 + Math.floor(i / 2) * (th + gy);
    rr(ctx, x, y, tw, th, 26); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke();

    rr(ctx, x + 14, y + 12, 74, 62, 16); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    fitImage(ctx, await matImage(id), x + 51, y + 43, 78);
    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text; ctx.font = FONT('bold', 21);
    ctx.fillText(def.name, x + 51, y + 102);

    const p = getMaterialPrices(id) || { buyPrice: def.buyPrice || 0, sellPrice: def.sellPrice || 0 };
    const px = x + 104, pw = tw - 104 - 14;
    pill(ctx, px, y + 12, pw, 42); pill(ctx, px, y + 64, pw, 42);
    triangle(ctx, px + 24, y + 33, 8, true, COLORS.green);
    triangle(ctx, px + 24, y + 85, 8, false, COLORS.red);
    ctx.fillStyle = COLORS.text; ctx.font = FONT('bold', 24); ctx.textAlign = 'center';
    ctx.fillText(formatMoney(p.buyPrice), px + pw / 2 + 10, y + 42);
    ctx.fillText(formatMoney(p.sellPrice), px + pw / 2 + 10, y + 94);
  }

  // ---- مفتاح الألوان + آخر تحديث ----
  const ly = 505;
  ctx.font = FONT('', 16); ctx.fillStyle = COLORS.textMuted; ctx.textAlign = 'center';
  ctx.fillText('سعر البيع', 130, ly); triangle(ctx, 190, ly - 5, 6, false, COLORS.red);
  ctx.fillStyle = COLORS.textMuted; ctx.fillText('سعر الشراء', 290, ly); triangle(ctx, 350, ly - 5, 6, true, COLORS.green);
  ctx.fillStyle = COLORS.textMuted; ctx.beginPath(); ctx.arc(470, ly - 5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillText(`آخر تحديث ${updatedAt()}`, 555, ly);

  // ---- فاصل + لوحة اللاعب ----
  ctx.beginPath(); ctx.moveTo(738, 100); ctx.lineTo(738, 482);
  ctx.lineWidth = 2; ctx.strokeStyle = COLORS.line; ctx.stroke();

  const cx = 888;
  if (discordUser) await drawAvatar(ctx, discordUser, cx, 168, 56, COLORS);
  ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text;
  let nm = String(discordUser?.username || ''); let fs = 24; ctx.font = FONT('bold', fs);
  while (fs > 14 && ctx.measureText(nm).width > 260) { fs--; ctx.font = FONT('bold', fs); }
  ctx.fillText(nm, cx, 262);

  pill(ctx, 752, 282, 272, 46);
  ctx.beginPath(); ctx.arc(780, 305, 17, 0, Math.PI * 2); ctx.fillStyle = '#F5C542'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#C9972B'; ctx.stroke();
  ctx.fillStyle = '#8A6410'; ctx.font = FONT('bold', 20); ctx.fillText('$', 780, 312);
  ctx.fillStyle = COLORS.text; ctx.font = FONT('bold', 25); ctx.fillText(formatMoney(user?.balance || 0), 906, 314);

  rr(ctx, 752, 346, 272, 138, 22); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke();
  for (let i = 0; i < ids.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const ix = 790 + col * 118, iy = 378 + row * 42;
    fitImage(ctx, await matImage(ids[i]), ix, iy, 48);
    ctx.textAlign = 'left'; ctx.fillStyle = COLORS.text; ctx.font = FONT('bold', 19);
    ctx.fillText(`x${user?.materials?.[ids[i]] || 0}`, ix + 26, iy + 7);
  }
  return finishCard(card);
}
module.exports = { createMarketImage };

// بطاقات الأرض / المزاد / الكراج / الحراج / الهجولة بنفس ستايل Vanr Bank
// (الصور الناقصة للسيارات تتحول تلقائياً لبطاقة بأيموجي بدل ما يطيح الأمر)
const fs = require('fs');
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');
const { newCard, finishCard, drawAvatar, rr, FONT } = require('./cardKit');
const { formatMoney, readConfig, calculateLandIncome } = require('./helpers');

const EMOJI = (s) => `${s}px AppEmoji, AppFont, sans-serif`;
const CARS_CFG = path.join(__dirname, '../config/cars-config.json');
const LAND_IMG = path.join(__dirname, '../../img/bank/land');

const readCars = () => { try { return JSON.parse(fs.readFileSync(CARS_CFG, 'utf8')); } catch { return {}; } };
const imgCache = new Map();
async function safeImage(file) {
  if (!file) return null;
  if (imgCache.has(file)) return imgCache.get(file);
  let img = null;
  try { if (fs.existsSync(file)) img = await loadImage(file); } catch { img = null; }
  imgCache.set(file, img);
  return img;
}
const carImage = (car) => safeImage(car?.image ? path.join(__dirname, car.image) : null);

// يصغّر الخط لين يدخل النص في العرض المطلوب
function fit(ctx, text, maxW, size, weight = 'bold') {
  let s = size;
  ctx.font = FONT(weight, s);
  while (s > 12 && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = FONT(weight, s); }
  return s;
}
// يصغّر الخط شوي، وإذا النص لسا أطول من العرض يقصّه بـ …
function clip(ctx, text, maxW, size, weight = 'bold', min = 13) {
  text = String(text ?? '');
  let s = size; ctx.font = FONT(weight, s);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = FONT(weight, s); }
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW && ctx.measureText(text).width > maxW) text = text.slice(0, -1);
  return text === String(arguments[1] ?? '') ? text : text + '…';
}
function tile(ctx, COLORS, x, y, w, h, fill = 'rgba(255,255,255,0.10)', border = null) {
  rr(ctx, x, y, w, h, 22); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = border || COLORS.cardBorder || COLORS.line; ctx.stroke();
}
function drawEmoji(ctx, text, x, y, size) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = EMOJI(size); ctx.fillText(text, x, y); ctx.restore();
}
function containImage(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function rarityInfo(cfg, car) {
  return {
    color: cfg.rarityColors?.[car?.rarity] || '#E8EEFF',
    label: cfg.rarityLabels?.[car?.rarity] || car?.rarity || '',
  };
}
// صورة السيارة أو بديلها
async function drawCar(ctx, car, x, y, w, h, cfg) {
  const img = await carImage(car);
  if (img) containImage(ctx, img, x, y, w, h);
  else {
    ctx.fillStyle = rarityInfo(cfg, car).color;
    drawEmoji(ctx, '🚗', x + w / 2, y + h / 2, Math.min(w, h) * 0.55);
  }
}
function footer(ctx, COLORS, W, H, text) {
  ctx.textAlign = 'center'; ctx.fillStyle = COLORS.textMuted; ctx.font = FONT('', 20);
  ctx.fillText(text, W / 2, H - 40);
}

// ---------------- الأراضي ----------------
async function createLandImage(user, discordUser) {
  const config = readConfig() || {};
  const lands = config.lands || {};
  const ids = Object.keys(lands);
  const card = await newCard(900, 600, user?.guildId);
  const { ctx, COLORS } = card;

  const cols = 3, tw = 250, th = 205, gap = 20, x0 = 55, y0 = 112;
  for (let i = 0; i < ids.length && i < 6; i++) {
    const id = ids[i], def = lands[id];
    const owned = (user?.lands || []).find((l) => l.landId === id);
    const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + 15);
    tile(ctx, COLORS, x, y, tw, th, owned ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)');

    const img = await safeImage(path.join(LAND_IMG, `${id}.png`));
    if (img) containImage(ctx, img, x + tw / 2 - 45, y + 12, 90, 90);
    else { ctx.fillStyle = COLORS.text; drawEmoji(ctx, def.emoji || '🏠', x + tw / 2, y + 57, 70); }

    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text;
    fit(ctx, def.name, tw - 30, 26); ctx.fillText(def.name, x + tw / 2, y + 133);
    ctx.font = FONT('bold', 19);
    if (owned) {
      const lvl = def.levels?.[owned.level - 1];
      ctx.fillStyle = COLORS.green; ctx.fillText(`المستوى ${owned.level}`, x + tw / 2, y + 163);
      ctx.fillStyle = COLORS.textMuted; ctx.font = FONT('', 17);
      ctx.fillText(`${formatMoney(lvl?.incomePerMinute || 0)} / دقيقة`, x + tw / 2, y + 190);
    } else {
      ctx.fillStyle = COLORS.textMuted; ctx.fillText('غير مملوكة', x + tw / 2, y + 163);
      ctx.font = FONT('', 17); ctx.fillText(`السعر ${formatMoney(def.levels?.[0]?.price || 0)}`, x + tw / 2, y + 190);
    }
  }
  const pending = user ? calculateLandIncome(user) : 0;
  footer(ctx, COLORS, 900, 600, `${discordUser?.username || ''}  •  أرباح جاهزة ${formatMoney(pending)}`);
  return finishCard(card);
}

// ---------------- الكراج ----------------
async function createGarageImage(allCars, userCars, page, totalPages, discordUser) {
  const cfg = readCars();
  const PER = 9;
  const slice = (allCars || []).slice(page * PER, (page + 1) * PER);
  const card = await newCard(900, 620, null);
  const { ctx, COLORS } = card;

  const cols = 3, tw = 250, th = 130, gap = 20, x0 = 55, y0 = 108;
  for (let i = 0; i < slice.length; i++) {
    const car = slice[i];
    const own = (userCars || []).find((u) => u.carId === car.id && u.count > 0);
    const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + 12);
    const { color, label } = rarityInfo(cfg, car);
    tile(ctx, COLORS, x, y, tw, th, own ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.22)', own ? color : null);

    ctx.save();
    ctx.globalAlpha = own ? 1 : 0.35;
    await drawCar(ctx, car, x + 10, y + 8, 100, 80, cfg);
    ctx.restore();

    ctx.textAlign = 'left'; ctx.fillStyle = COLORS.text;
    ctx.fillText(clip(ctx, car.name, tw - 128, 17), x + 118, y + 36);
    ctx.font = FONT('bold', 16); ctx.fillStyle = color; ctx.fillText(label, x + 118, y + 62);
    ctx.font = FONT('', 15); ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`سرعة ${car.speed ?? '-'}`, x + 118, y + 86);
    ctx.textAlign = 'center';
    if (own) {
      ctx.font = FONT('bold', 17); ctx.fillStyle = COLORS.green; ctx.fillText(`x${own.count}`, x + 55, y + 112);
      if (own.damage > 0) { ctx.fillStyle = COLORS.red; ctx.fillText(`ضرر ${own.damage}%`, x + 160, y + 112); }
    } else { ctx.font = FONT('', 16); ctx.fillStyle = COLORS.textMuted; ctx.fillText('🔒 غير مملوكة', x + tw / 2, y + 112); }
  }
  if (!slice.length) { ctx.textAlign = 'center'; ctx.fillStyle = COLORS.textMuted; ctx.font = FONT('bold', 28); ctx.fillText('ما فيه سيارات', 450, 320); }
  const ownedCount = (userCars || []).reduce((a, u) => a + (u.count || 0), 0);
  footer(ctx, COLORS, 900, 620, `${discordUser?.username || ''}  •  سياراتك ${ownedCount}  •  صفحة ${page + 1}/${totalPages}`);
  return finishCard(card);
}

// ---------------- المزاد ----------------
async function createAuctionImage(cars, bids, guildActor, guildId) {
  const cfg = readCars();
  const list = (cars || []).slice(0, 3);
  const card = await newCard(900, 520, guildId);
  const { ctx, COLORS } = card;

  const tw = 250, th = 330, gap = 20, x0 = 55, y0 = 112;
  for (let i = 0; i < list.length; i++) {
    const car = list[i];
    const bid = (bids || {})[car.id];
    const { color, label } = rarityInfo(cfg, car);
    const x = x0 + i * (tw + gap);
    tile(ctx, COLORS, x, y0, tw, th, 'rgba(255,255,255,0.12)', color);
    await drawCar(ctx, car, x + 15, y0 + 14, tw - 30, 120, cfg);

    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text;
    ctx.fillText(clip(ctx, car.name, tw - 24, 22), x + tw / 2, y0 + 168);
    ctx.font = FONT('bold', 18); ctx.fillStyle = color; ctx.fillText(label, x + tw / 2, y0 + 196);
    ctx.font = FONT('', 17); ctx.fillStyle = COLORS.textMuted; ctx.fillText(`أقل سعر ${formatMoney(car.leastPrice || 0)}`, x + tw / 2, y0 + 226);

    if (bid) {
      ctx.font = FONT('bold', 26); ctx.fillStyle = COLORS.green; ctx.fillText(formatMoney(bid.amount), x + tw / 2, y0 + 268);
      ctx.font = FONT('', 16); ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(clip(ctx, bid.username || '', tw - 30, 16, ''), x + tw / 2, y0 + 300);
    } else { ctx.font = FONT('', 18); ctx.fillStyle = COLORS.textMuted; ctx.fillText('ما فيه مزايدات', x + tw / 2, y0 + 275); }
  }
  if (!list.length) { ctx.textAlign = 'center'; ctx.fillStyle = COLORS.textMuted; ctx.font = FONT('bold', 28); ctx.fillText('لا يوجد مزاد حالياً', 450, 280); }
  footer(ctx, COLORS, 900, 520, `🏎️ مزاد ${guildActor?.username || ''}`);
  return finishCard(card);
}

// ---------------- الحراج ----------------
async function createHarrajImage(listings, allCars, page, totalPages, guildId) {
  const cfg = readCars();
  const PER = 4;
  const slice = (listings || []).slice(page * PER, (page + 1) * PER);
  const card = await newCard(900, 540, guildId);
  const { ctx, COLORS } = card;

  const tw = 385, th = 160, gap = 20, x0 = 55, y0 = 112;
  for (let i = 0; i < slice.length; i++) {
    const l = slice[i];
    const car = (allCars || []).find((c) => c.id === l.carId) || { id: l.carId, name: l.carName };
    const { color, label } = rarityInfo(cfg, car);
    const x = x0 + (i % 2) * (tw + gap), y = y0 + Math.floor(i / 2) * (th + 15);
    tile(ctx, COLORS, x, y, tw, th, 'rgba(255,255,255,0.12)', color);
    await drawCar(ctx, car, x + 12, y + 14, 150, 100, cfg);

    ctx.textAlign = 'left'; ctx.fillStyle = COLORS.text;
    const name = l.carName || car.name || l.carId;
    ctx.fillText(clip(ctx, name, tw - 190, 20), x + 172, y + 38);
    ctx.font = FONT('bold', 16); ctx.fillStyle = color; ctx.fillText(label, x + 172, y + 64);
    ctx.font = FONT('bold', 24); ctx.fillStyle = COLORS.green; ctx.fillText(formatMoney(l.price || 0), x + 172, y + 98);
    ctx.font = FONT('', 15); ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(clip(ctx, `البائع: ${l.sellerName || '-'}`, tw - 190, 15, ''), x + 172, y + 124);
    ctx.textAlign = 'center'; ctx.font = FONT('', 14);
    ctx.fillText(`رقم الإعلان: ${l.listingId}`, x + tw / 2, y + th - 10);
  }
  if (!slice.length) { ctx.textAlign = 'center'; ctx.fillStyle = COLORS.textMuted; ctx.font = FONT('bold', 28); ctx.fillText('الحراج فاضي حالياً', 450, 290); }
  footer(ctx, COLORS, 900, 540, `🏷️ الحراج  •  صفحة ${page + 1}/${totalPages}`);
  return finishCard(card);
}

// ---------------- الهجولة ----------------
async function createHejolahImage(gameState, car) {
  const cfg = readCars();
  const { grid, rows, cols, lane, lives, distance } = gameState;
  const T = 74, W = Math.max(560, cols * T + 110), H = 90 + rows * T + 130;
  const card = await newCard(W, H, gameState.guildId);
  const { ctx, COLORS } = card;

  const gx = (W - cols * T) / 2, gy = 108;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gx + c * T, y = gy + r * T;
      rr(ctx, x + 2, y + 2, T - 4, T - 4, 12);
      ctx.fillStyle = (r + c) % 2 ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.30)'; ctx.fill();
      const ob = grid?.[r]?.[c];
      if (ob) { ctx.fillStyle = COLORS.text; drawEmoji(ctx, ob, x + T / 2, y + T / 2, 40); }
    }
  }
  // سيارة اللاعب في آخر صف
  const px = gx + lane * T, py = gy + (rows - 1) * T;
  rr(ctx, px + 2, py + 2, T - 4, T - 4, 12); ctx.lineWidth = 3; ctx.strokeStyle = COLORS.green; ctx.stroke();
  const img = await carImage(car);
  if (img) containImage(ctx, img, px + 4, py + 8, T - 8, T - 16);
  else { ctx.fillStyle = COLORS.text; drawEmoji(ctx, '🏎️', px + T / 2, py + T / 2, 42); }

  const hearts = '❤️'.repeat(Math.max(0, lives)) || '💀';
  ctx.fillStyle = COLORS.text; drawEmoji(ctx, hearts, W / 2, gy + rows * T + 32, 30);
  ctx.textAlign = 'center'; ctx.font = FONT('bold', 22); ctx.fillStyle = COLORS.text;
  ctx.fillText(`${car?.name || ''}  •  المسافة ${distance || 0}`, W / 2, gy + rows * T + 80);
  return finishCard(card);
}

module.exports = { createLandImage, createGarageImage, createAuctionImage, createHarrajImage, createHejolahImage };

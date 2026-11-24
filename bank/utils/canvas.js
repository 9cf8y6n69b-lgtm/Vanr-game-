// تسجيل الخطوط + الألوان والهوية (نسخة مستقلة)
const path = require('path');
const fs = require('fs');
const { GlobalFonts } = require('@napi-rs/canvas');
const CONFIG = require('./canvas-config');

const FONT_DIR = path.join(__dirname, '../../img/Fonts');
try { GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Bold.ttf'), 'AppFont'); } catch (e) { console.error('font:', e.message); }
try { GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Emoji.ttf'), 'AppEmoji'); } catch (e) { console.error('emoji font:', e.message); }

function readBankConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../config/bank-config.json'), 'utf8')); } catch { return null; }
}
async function getActiveColors() {
  const o = readBankConfig()?.adminSettings?.colorOverrides || {};
  return { ...CONFIG.colors, ...o };
}
function getActiveBranding() {
  return { name: readBankConfig()?.adminSettings?.brandName || 'Vanr Bank', iconURL: null };
}

// بطاقات الأرض/المزاد/الكراج/الحراج/الهجولة (تتحمل وقت الحاجة عشان ما يصير تعارض بين الملفات)
const lazy = (name) => (...args) => require('./legacyCards')[name](...args);
module.exports = {
  getActiveColors, getActiveBranding,
  createLandImage: lazy('createLandImage'),
  createGarageImage: lazy('createGarageImage'),
  createAuctionImage: lazy('createAuctionImage'),
  createHarrajImage: lazy('createHarrajImage'),
  createHejolahImage: lazy('createHejolahImage'),
};

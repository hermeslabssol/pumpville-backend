const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- AUTH ---
const nonces = new Map();
const tokens = new Map();

// Issue a JWT-SHAPED token. The frontend's isTokenValid() does
// JSON.parse(atob(token.split('.')[1])) and reads .exp — so the token MUST be
// 3 dot-separated segments with a base64 (NOT base64url — browser atob can't
// decode - or _) payload carrying a future `exp`. We don't verify the sig.
function generateToken(wallet) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    sub: wallet || 'anon',
    wallet: wallet || 'anon',
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 days
  });
  const sig = crypto.randomBytes(24).toString('hex');
  return `${header}.${payload}.${sig}`;
}

app.get('/auth/nonce', (req, res) => {
  const wallet = req.query.wallet || req.query.walletAddress;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  const nonce = crypto.randomUUID();
  nonces.set(wallet, { nonce, created: Date.now() });
  res.json({ nonce });
});

app.post('/auth/login', (req, res) => {
  const body = req.body || {};
  // Frontend sends `walletAddress`; accept `wallet` too for our own tooling.
  const wallet = body.walletAddress || body.wallet;
  if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' });
  const token = generateToken(wallet);
  tokens.set(token, { wallet, created: Date.now() });
  nonces.delete(wallet);
  res.json({ success: true, token, wallet });
});

app.post('/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  tokens.delete(token);
  res.json({ success: true });
});

app.get('/auth/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const data = tokens.get(token);
  if (data) {
    res.json({ valid: true, wallet: data.wallet });
  } else {
    // Token may be valid-but-not-in-memory after a server restart. Accept any
    // structurally-valid, unexpired JWT-shaped token so players aren't kicked.
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.exp && Date.now() / 1000 < payload.exp) {
        return res.json({ valid: true, wallet: payload.wallet || payload.sub });
      }
    } catch (_) {}
    res.json({ valid: false });
  }
});

const PORT = process.env.PORT || 3001;

// ===========================================================================
// GAME DATA
// ===========================================================================

const ZONES = ['main', 'arena', 'fishing', 'mining', 'crafting'];

const NPC_SPRITES = [
  'pepe', 'doge', 'bonk', 'popcat', 'pengu',
  'wojak', 'chillguy', 'frog', 'mog', 'fwog',
];

const NPC_NAMES = [
  'ShibaMaster', 'PepeLord', 'DogeKing', 'BonkWhale', 'PopcatSensei',
  'WojakFren', 'ChillDude', 'FrogVibes', 'MogHunter', 'FwogTrader',
];

const PET_TYPES = [
  'cat', 'dog', 'hamster', 'parrot', 'turtle', 'snake', 'rabbit',
  'goldfish', 'owl', 'penguin', 'fox', 'raccoon', 'frog', 'lizard',
  'bat', 'firefly', 'crab', 'butterfly', 'beetle',
];

// 36 fish: 12 common, 10 uncommon, 8 rare, 6 legendary
const FISH_SPECIES = [
  // Common (40% catch rate)
  { id: 'sardine', name: 'Sardine', rarity: 'common', value: 5 },
  { id: 'mackerel', name: 'Mackerel', rarity: 'common', value: 6 },
  { id: 'herring', name: 'Herring', rarity: 'common', value: 5 },
  { id: 'anchovy', name: 'Anchovy', rarity: 'common', value: 4 },
  { id: 'carp', name: 'Carp', rarity: 'common', value: 7 },
  { id: 'tilapia', name: 'Tilapia', rarity: 'common', value: 6 },
  { id: 'catfish', name: 'Catfish', rarity: 'common', value: 8 },
  { id: 'bass', name: 'Bass', rarity: 'common', value: 7 },
  { id: 'perch', name: 'Perch', rarity: 'common', value: 6 },
  { id: 'trout', name: 'Trout', rarity: 'common', value: 8 },
  { id: 'bluegill', name: 'Bluegill', rarity: 'common', value: 5 },
  { id: 'minnow', name: 'Minnow', rarity: 'common', value: 3 },
  // Uncommon (30% catch rate)
  { id: 'salmon', name: 'Salmon', rarity: 'uncommon', value: 15 },
  { id: 'tuna', name: 'Tuna', rarity: 'uncommon', value: 18 },
  { id: 'swordfish', name: 'Swordfish', rarity: 'uncommon', value: 20 },
  { id: 'cod', name: 'Cod', rarity: 'uncommon', value: 14 },
  { id: 'snapper', name: 'Red Snapper', rarity: 'uncommon', value: 16 },
  { id: 'grouper', name: 'Grouper', rarity: 'uncommon', value: 17 },
  { id: 'pike', name: 'Pike', rarity: 'uncommon', value: 15 },
  { id: 'walleye', name: 'Walleye', rarity: 'uncommon', value: 16 },
  { id: 'halibut', name: 'Halibut', rarity: 'uncommon', value: 19 },
  { id: 'flounder', name: 'Flounder', rarity: 'uncommon', value: 14 },
  // Rare (20% catch rate)
  { id: 'marlin', name: 'Blue Marlin', rarity: 'rare', value: 40 },
  { id: 'mahi', name: 'Mahi-Mahi', rarity: 'rare', value: 35 },
  { id: 'barracuda', name: 'Barracuda', rarity: 'rare', value: 38 },
  { id: 'sturgeon', name: 'Sturgeon', rarity: 'rare', value: 45 },
  { id: 'eel', name: 'Electric Eel', rarity: 'rare', value: 42 },
  { id: 'pufferfish', name: 'Pufferfish', rarity: 'rare', value: 36 },
  { id: 'anglerfish', name: 'Anglerfish', rarity: 'rare', value: 44 },
  { id: 'moonfish', name: 'Moonfish', rarity: 'rare', value: 40 },
  // Legendary (10% catch rate)
  { id: 'golden_koi', name: 'Golden Koi', rarity: 'legendary', value: 100 },
  { id: 'ghost_whale', name: 'Ghost Whale', rarity: 'legendary', value: 150 },
  { id: 'dragon_fish', name: 'Dragon Fish', rarity: 'legendary', value: 120 },
  { id: 'crystal_jellyfish', name: 'Crystal Jellyfish', rarity: 'legendary', value: 130 },
  { id: 'shadow_shark', name: 'Shadow Shark', rarity: 'legendary', value: 140 },
  { id: 'cosmic_ray', name: 'Cosmic Ray', rarity: 'legendary', value: 200 },
];

const ORE_TYPES = [
  { id: 'stone', name: 'Stone', rarity: 'common', value: 2 },
  { id: 'copper', name: 'Copper Ore', rarity: 'common', value: 5 },
  { id: 'iron', name: 'Iron Ore', rarity: 'uncommon', value: 10 },
  { id: 'silver', name: 'Silver Ore', rarity: 'uncommon', value: 18 },
  { id: 'gold', name: 'Gold Ore', rarity: 'rare', value: 30 },
  { id: 'diamond', name: 'Diamond', rarity: 'rare', value: 50 },
  { id: 'solarium', name: 'Solarium Crystal', rarity: 'legendary', value: 100 },
];

const ITEM_CATALOG = {
  // Weapons
  wooden_sword: { id: 'wooden_sword', name: 'Wooden Sword', type: 'weapon', price: 50, damage: 5 },
  iron_sword: { id: 'iron_sword', name: 'Iron Sword', type: 'weapon', price: 150, damage: 12 },
  golden_sword: { id: 'golden_sword', name: 'Golden Sword', type: 'weapon', price: 400, damage: 20 },
  crystal_blade: { id: 'crystal_blade', name: 'Crystal Blade', type: 'weapon', price: 800, damage: 35 },
  // Bows
  wooden_bow: { id: 'wooden_bow', name: 'Wooden Bow', type: 'weapon', price: 75, damage: 8 },
  iron_bow: { id: 'iron_bow', name: 'Iron Bow', type: 'weapon', price: 200, damage: 15 },
  // Pickaxes
  wooden_pickaxe: { id: 'wooden_pickaxe', name: 'Wooden Pickaxe', type: 'pickaxe', price: 30, miningSpeed: 1 },
  iron_pickaxe: { id: 'iron_pickaxe', name: 'Iron Pickaxe', type: 'pickaxe', price: 100, miningSpeed: 2 },
  golden_pickaxe: { id: 'golden_pickaxe', name: 'Golden Pickaxe', type: 'pickaxe', price: 300, miningSpeed: 3 },
  diamond_pickaxe: { id: 'diamond_pickaxe', name: 'Diamond Pickaxe', type: 'pickaxe', price: 600, miningSpeed: 5 },
  // Shovels
  wooden_shovel: { id: 'wooden_shovel', name: 'Wooden Shovel', type: 'shovel', price: 25, digSpeed: 1 },
  iron_shovel: { id: 'iron_shovel', name: 'Iron Shovel', type: 'shovel', price: 80, digSpeed: 2 },
  golden_shovel: { id: 'golden_shovel', name: 'Golden Shovel', type: 'shovel', price: 250, digSpeed: 3 },
  // Fishing rods
  basic_rod: { id: 'basic_rod', name: 'Basic Rod', type: 'rod', price: 40, fishBonus: 0 },
  silver_rod: { id: 'silver_rod', name: 'Silver Rod', type: 'rod', price: 200, fishBonus: 10 },
  golden_rod: { id: 'golden_rod', name: 'Golden Rod', type: 'rod', price: 500, fishBonus: 25 },
  // Bait
  worm: { id: 'worm', name: 'Worm Bait', type: 'bait', price: 5, fishBonus: 5 },
  shrimp: { id: 'shrimp', name: 'Shrimp Bait', type: 'bait', price: 15, fishBonus: 10 },
  golden_lure: { id: 'golden_lure', name: 'Golden Lure', type: 'bait', price: 50, fishBonus: 20 },
  // Nets
  basic_net: { id: 'basic_net', name: 'Basic Net', type: 'net', price: 60, catchBonus: 5 },
  fine_net: { id: 'fine_net', name: 'Fine Net', type: 'net', price: 200, catchBonus: 15 },
  // Shields
  wooden_shield: { id: 'wooden_shield', name: 'Wooden Shield', type: 'shield', price: 40, defense: 5 },
  iron_shield: { id: 'iron_shield', name: 'Iron Shield', type: 'shield', price: 150, defense: 12 },
  // Consumables
  health_potion: { id: 'health_potion', name: 'Health Potion', type: 'consumable', price: 20, heal: 25 },
  super_potion: { id: 'super_potion', name: 'Super Potion', type: 'consumable', price: 50, heal: 50 },
  mega_potion: { id: 'mega_potion', name: 'Mega Potion', type: 'consumable', price: 100, heal: 100 },
  cooked_fish: { id: 'cooked_fish', name: 'Cooked Fish', type: 'consumable', price: 15, heal: 15 },
  energy_drink: { id: 'energy_drink', name: 'Energy Drink', type: 'consumable', price: 30, heal: 30 },
  // Special
  lootbox: { id: 'lootbox', name: 'Lootbox', type: 'lootbox', price: 100 },
  arena_ticket: { id: 'arena_ticket', name: 'Arena Ticket', type: 'ticket', price: 50 },
  surfboard: { id: 'surfboard', name: 'Surfboard', type: 'surfboard', price: 200, speedBoost: 1.5 },
  recipe_card: { id: 'recipe_card', name: 'Recipe Card', type: 'recipe_card', price: 75 },
  message_bottle: { id: 'message_bottle', name: 'Message in a Bottle', type: 'bottle', price: 25 },
};

const CRAFTING_RECIPES = [
  { id: 'iron_sword', name: 'Iron Sword', ingredients: [{ id: 'iron', qty: 3 }, { id: 'stone', qty: 2 }], result: 'iron_sword', resultQty: 1 },
  { id: 'golden_sword', name: 'Golden Sword', ingredients: [{ id: 'gold', qty: 3 }, { id: 'iron', qty: 2 }], result: 'golden_sword', resultQty: 1 },
  { id: 'iron_pickaxe', name: 'Iron Pickaxe', ingredients: [{ id: 'iron', qty: 2 }, { id: 'stone', qty: 3 }], result: 'iron_pickaxe', resultQty: 1 },
  { id: 'iron_shield', name: 'Iron Shield', ingredients: [{ id: 'iron', qty: 4 }, { id: 'copper', qty: 2 }], result: 'iron_shield', resultQty: 1 },
  { id: 'health_potion', name: 'Health Potion', ingredients: [{ id: 'sardine', qty: 2 }, { id: 'worm', qty: 1 }], result: 'health_potion', resultQty: 2 },
  { id: 'super_potion', name: 'Super Potion', ingredients: [{ id: 'health_potion', qty: 2 }, { id: 'gold', qty: 1 }], result: 'super_potion', resultQty: 1 },
  { id: 'cooked_fish', name: 'Cooked Fish', ingredients: [{ id: 'sardine', qty: 1 }, { id: 'stone', qty: 1 }], result: 'cooked_fish', resultQty: 1 },
  { id: 'golden_lure', name: 'Golden Lure', ingredients: [{ id: 'gold', qty: 1 }, { id: 'worm', qty: 3 }], result: 'golden_lure', resultQty: 2 },
];

const DAILY_QUEST_POOL = [
  { id: 'catch_5_fish', name: 'Catch 5 Fish', description: 'Catch any 5 fish.', type: 'fishing', target: 5, reward: { coins: 50 } },
  { id: 'catch_rare_fish', name: 'Catch a Rare Fish', description: 'Catch a rare or better fish.', type: 'fishing_rare', target: 1, reward: { coins: 100 } },
  { id: 'mine_10_ore', name: 'Mine 10 Ore', description: 'Mine any 10 ore.', type: 'mining', target: 10, reward: { coins: 60 } },
  { id: 'mine_gold', name: 'Find Gold', description: 'Mine a gold ore.', type: 'mining_gold', target: 1, reward: { coins: 120 } },
  { id: 'chat_5', name: 'Social Butterfly', description: 'Send 5 chat messages.', type: 'chat', target: 5, reward: { coins: 30 } },
  { id: 'visit_3_zones', name: 'Explorer', description: 'Visit 3 different zones.', type: 'zone_visit', target: 3, reward: { coins: 40 } },
  { id: 'craft_item', name: 'Crafter', description: 'Craft any item.', type: 'craft', target: 1, reward: { coins: 50 } },
  { id: 'walk_1000', name: 'Walking Champion', description: 'Move 1000 units.', type: 'movement', target: 1000, reward: { coins: 35 } },
  { id: 'eat_3_food', name: 'Foodie', description: 'Eat 3 consumables.', type: 'eat', target: 3, reward: { coins: 25 } },
  { id: 'equip_3_items', name: 'Gear Up', description: 'Equip 3 different items.', type: 'equip', target: 3, reward: { coins: 30 } },
  { id: 'earn_100_coins', name: 'Coin Collector', description: 'Earn 100 coins total.', type: 'earn_coins', target: 100, reward: { coins: 50 } },
  { id: 'arena_fight', name: 'Arena Warrior', description: 'Enter the arena once.', type: 'arena', target: 1, reward: { coins: 75 } },
];

const BEGINNER_QUESTS = [
  { id: 'bq1', name: 'First Steps', description: 'Change your username.', type: 'username', target: 1, reward: { coins: 100 }, order: 1 },
  { id: 'bq2', name: 'Fashion Show', description: 'Change your sprite.', type: 'change_sprite', target: 1, reward: { coins: 50 }, order: 2 },
  { id: 'bq3', name: 'Explorer', description: 'Visit 3 different zones.', type: 'zone_visit', target: 3, reward: { coins: 150 }, order: 3 },
  { id: 'bq4', name: 'Angler Apprentice', description: 'Catch your first fish.', type: 'fishing', target: 1, reward: { coins: 100 }, order: 4 },
  { id: 'bq5', name: 'Social Starter', description: 'Send 3 chat messages.', type: 'chat', target: 3, reward: { coins: 200 }, order: 5 },
];

const DAILY_LOGIN_REWARDS = [
  { day: 1, reward: { coins: 50 } },
  { day: 2, reward: { coins: 75 } },
  { day: 3, reward: { coins: 100, item: 'health_potion' } },
  { day: 4, reward: { coins: 125 } },
  { day: 5, reward: { coins: 150, item: 'lootbox' } },
  { day: 6, reward: { coins: 200 } },
  { day: 7, reward: { coins: 500, item: 'golden_lure' } },
];

const LOOTBOX_TABLE = [
  { item: 'health_potion', qty: 3, weight: 25 },
  { item: 'super_potion', qty: 1, weight: 15 },
  { item: 'cooked_fish', qty: 5, weight: 20 },
  { item: 'worm', qty: 10, weight: 15 },
  { item: 'iron_sword', qty: 1, weight: 5 },
  { item: 'golden_lure', qty: 2, weight: 5 },
  { item: 'arena_ticket', qty: 3, weight: 10 },
  { item: 'recipe_card', qty: 1, weight: 5 },
];

const AVATAR_PARTS = ['hat', 'shirt', 'pants', 'shoes', 'accessory', 'back'];
const AVATAR_SETS = ['default', 'pirate', 'ninja', 'astronaut', 'wizard', 'knight', 'farmer', 'chef'];

const STAMP_CARDS = [
  { id: 'fisher_stamp', name: 'Master Fisher', target: 50, reward: { coins: 500, item: 'golden_rod' } },
  { id: 'miner_stamp', name: 'Master Miner', target: 50, reward: { coins: 500, item: 'diamond_pickaxe' } },
  { id: 'social_stamp', name: 'Social Star', target: 100, reward: { coins: 300 } },
  { id: 'explorer_stamp', name: 'World Explorer', target: 200, reward: { coins: 400, item: 'surfboard' } },
];

const BOTTLE_REWARDS = [
  { type: 'coins', amount: 10, message: 'A few coins washed ashore!' },
  { type: 'coins', amount: 25, message: 'A nice haul from the waves!' },
  { type: 'coins', amount: 50, message: 'Treasure from the deep!' },
  { type: 'coins', amount: 100, message: 'A legendary fortune!' },
  { type: 'item', item: 'health_potion', qty: 1, message: 'A potion floated by!' },
  { type: 'item', item: 'worm', qty: 5, message: 'Some bait from the sea!' },
  { type: 'item', item: 'golden_lure', qty: 1, message: 'A golden lure from the depths!' },
  { type: 'item', item: 'recipe_card', qty: 1, message: 'A mysterious recipe card!' },
];

// ===========================================================================
// IN-MEMORY STORAGE
// ===========================================================================

const players = new Map();           // wallet -> player object
const wsClients = new Map();         // wallet -> ws
const chatHistory = [];              // last 50 messages
const MAX_CHAT = 50;
const marketplace = new Map();       // listingId -> listing
const tradeHistory = [];             // trade records
let listingIdCounter = 1;
let broadcastMessage = null;         // current broadcast
let frenzyState = { active: false, type: null, multiplier: 1, endsAt: null };

// Per-player extended state (keyed by wallet)
const playerInventory = new Map();   // wallet -> { items: {itemId: qty}, fish: {fishId: qty}, ores: {oreId: qty} }
const playerQuests = new Map();      // wallet -> { daily: [...], beginner: [...], dailyDate: string }
const playerLogin = new Map();       // wallet -> { streak: n, lastClaim: date, lastLootbox: date }
const playerRecipes = new Map();     // wallet -> Set of recipe ids
const playerStamps = new Map();      // wallet -> { stampId: progress }
const playerFriends = new Map();     // wallet -> { friends: [], requests: [], notifications: [] }
const playerMessages = new Map();    // wallet -> [messages]
const playerClaims = new Map();      // wallet -> [claimed item ids]
const playerSurfboard = new Map();   // wallet -> { active: bool, expiresAt: timestamp }
const playerHotkeys = new Map();     // wallet -> { slot1: itemId, slot2: itemId, ... }
const playerAvatar = new Map();      // wallet -> { parts: {}, set: string }
const playerZonesVisited = new Map(); // wallet -> Set of zone names
const playerChatCount = new Map();   // wallet -> number (for quest tracking)
const playerMoveDistance = new Map(); // wallet -> number (for quest tracking)
const playerEquipCount = new Map();  // wallet -> number (for quest tracking)
const playerEatCount = new Map();    // wallet -> number (for quest tracking)
const playerCraftCount = new Map();  // wallet -> number (for quest tracking)
const playerFishCount = new Map();   // wallet -> number
const playerMineCount = new Map();   // wallet -> number
const playerCoinsEarned = new Map(); // wallet -> number
const playerArenaCount = new Map();  // wallet -> number

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

function makePlayer(wallet) {
  return {
    wallet,
    username: 'Player',
    x: 200 + Math.random() * 400,
    y: 150 + Math.random() * 300,
    direction: 'down',
    animation: 'idle',
    sprite: NPC_SPRITES[Math.floor(Math.random() * NPC_SPRITES.length)],
    pet: null,
    coins: 1000,
    zone: 'main',
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    equipped: {
      weapon: null,
      pickaxe: null,
      shovel: null,
      rod: null,
      bait: null,
      net: null,
      shield: null,
    },
    isNpc: false,
    isBanned: false,
    isAdmin: false,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
}

function ensureInventory(wallet) {
  if (!playerInventory.has(wallet)) {
    playerInventory.set(wallet, { items: {}, fish: {}, ores: {} });
  }
  return playerInventory.get(wallet);
}

function addItem(wallet, itemId, qty = 1) {
  const inv = ensureInventory(wallet);
  inv.items[itemId] = (inv.items[itemId] || 0) + qty;
}

function removeItem(wallet, itemId, qty = 1) {
  const inv = ensureInventory(wallet);
  if ((inv.items[itemId] || 0) < qty) return false;
  inv.items[itemId] -= qty;
  if (inv.items[itemId] <= 0) delete inv.items[itemId];
  return true;
}

function hasItem(wallet, itemId, qty = 1) {
  const inv = ensureInventory(wallet);
  return (inv.items[itemId] || 0) >= qty;
}

function addFish(wallet, fishId, qty = 1) {
  const inv = ensureInventory(wallet);
  inv.fish[fishId] = (inv.fish[fishId] || 0) + qty;
}

function addOre(wallet, oreId, qty = 1) {
  const inv = ensureInventory(wallet);
  inv.ores[oreId] = (inv.ores[oreId] || 0) + qty;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(table) {
  const totalWeight = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return table[table.length - 1];
}

function generateDailyQuests() {
  const shuffled = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(q => ({
    ...q,
    progress: 0,
    completed: false,
    claimed: false,
  }));
}

function ensureQuests(wallet) {
  const today = todayStr();
  let q = playerQuests.get(wallet);
  if (!q || q.dailyDate !== today) {
    const beginner = q ? q.beginner : BEGINNER_QUESTS.map(bq => ({
      ...bq,
      progress: 0,
      completed: false,
      claimed: false,
    }));
    q = {
      daily: generateDailyQuests(),
      dailyDate: today,
      beginner,
      beginnerFinalClaimed: q ? q.beginnerFinalClaimed || false : false,
    };
    playerQuests.set(wallet, q);
  }
  return q;
}

function ensureLogin(wallet) {
  if (!playerLogin.has(wallet)) {
    playerLogin.set(wallet, { streak: 0, lastClaim: null, lastLootbox: null });
  }
  return playerLogin.get(wallet);
}

function ensureRecipes(wallet) {
  if (!playerRecipes.has(wallet)) {
    // Everyone starts knowing cooked_fish
    playerRecipes.set(wallet, new Set(['cooked_fish']));
  }
  return playerRecipes.get(wallet);
}

function ensureStamps(wallet) {
  if (!playerStamps.has(wallet)) {
    const stamps = {};
    for (const sc of STAMP_CARDS) stamps[sc.id] = { progress: 0, claimed: false };
    playerStamps.set(wallet, stamps);
  }
  return playerStamps.get(wallet);
}

function broadcast(msg, zone) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [wallet, ws] of wsClients) {
    if (ws.readyState !== 1) continue;
    if (zone) {
      const p = players.get(wallet);
      if (!p || p.zone !== zone) continue;
    }
    ws.send(data);
  }
}

function broadcastAll(msg) {
  broadcast(msg, null);
}

function sendTo(wallet, msg) {
  const ws = wsClients.get(wallet);
  if (ws && ws.readyState === 1) {
    ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
}

function playerCount() {
  return players.size; // includes NPCs for lively feel
}

function realPlayerCount() {
  let c = 0;
  for (const p of players.values()) if (!p.isNpc) c++;
  return c;
}

function sendPlayerCount() {
  broadcastAll({ type: 'player_count', count: playerCount() });
}

function playerStateObj(p) {
  return {
    wallet: p.wallet,
    username: p.username,
    x: p.x,
    y: p.y,
    direction: p.direction || 'down',
    animation: p.animation || 'idle',
    sprite: p.sprite,
    pet: p.pet,
    hp: p.hp,
    maxHp: p.maxHp,
    level: p.level,
    equipped: p.equipped,
    isNpc: p.isNpc || false,
    avatar: playerAvatar.get(p.wallet) || null,
  };
}

function zonePlayerStates(zone) {
  const list = [];
  for (const p of players.values()) {
    if (p.zone === zone) list.push(playerStateObj(p));
  }
  return list;
}

function broadcastZoneStates(zone) {
  broadcast({ type: 'zone_player_states', players: zonePlayerStates(zone) }, zone);
}

function addCoins(wallet, amount) {
  const p = players.get(wallet);
  if (!p) return;
  p.coins += amount;
  playerCoinsEarned.set(wallet, (playerCoinsEarned.get(wallet) || 0) + amount);
}

function updateQuestProgress(wallet, questType, amount = 1) {
  const q = playerQuests.get(wallet);
  if (!q) return;
  let changed = false;
  const allQuests = [...q.daily, ...q.beginner];
  for (const quest of allQuests) {
    if (quest.completed || quest.type !== questType) continue;
    quest.progress = Math.min(quest.progress + amount, quest.target);
    changed = true;
    if (quest.progress >= quest.target) {
      quest.completed = true;
      sendTo(wallet, { type: 'quest_completed', questId: quest.id, reward: quest.reward });
      // Auto-grant reward
      const p = players.get(wallet);
      if (p && quest.reward.coins) addCoins(wallet, quest.reward.coins);
      if (quest.reward.item) addItem(wallet, quest.reward.item, quest.reward.qty || 1);
    }
  }
  if (changed) {
    sendTo(wallet, { type: 'quest_progress_update', daily: q.daily, beginner: q.beginner });
  }
}

function updateStampProgress(wallet, stampId, amount = 1) {
  const stamps = ensureStamps(wallet);
  if (!stamps[stampId] || stamps[stampId].claimed) return;
  stamps[stampId].progress += amount;
}

function getPlayer(wallet) {
  return players.get(wallet) || null;
}

function requirePlayer(wallet) {
  if (!wallet) return null;
  let p = players.get(wallet);
  if (!p) {
    p = makePlayer(wallet);
    players.set(wallet, p);
  }
  return p;
}

// ===========================================================================
// NPC BOTS
// ===========================================================================

function spawnNpcs() {
  const count = 5 + Math.floor(Math.random() * 6); // 5-10
  for (let i = 0; i < count; i++) {
    const wallet = 'NPC_' + Array.from({ length: 8 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const npc = makePlayer(wallet);
    npc.username = NPC_NAMES[i % NPC_NAMES.length];
    npc.sprite = NPC_SPRITES[i % NPC_SPRITES.length];
    npc.isNpc = true;
    npc.zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    players.set(wallet, npc);
  }
}

function wanderNpcs() {
  for (const p of players.values()) {
    if (!p.isNpc) continue;
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 60;
    p.x = Math.max(50, Math.min(750, p.x + dx));
    p.y = Math.max(50, Math.min(550, p.y + dy));
    // Set direction based on movement
    if (Math.abs(dx) > Math.abs(dy)) {
      p.direction = dx > 0 ? 'right' : 'left';
    } else {
      p.direction = dy > 0 ? 'down' : 'up';
    }
    p.animation = 'walk';
    // 10% chance to change zone
    if (Math.random() < 0.1) {
      p.zone = ZONES[Math.floor(Math.random() * ZONES.length)];
      p.x = 200 + Math.random() * 400;
      p.y = 150 + Math.random() * 300;
    }
  }
  // NPC chat (rare, 2% chance per tick)
  if (Math.random() < 0.02) {
    const npcMessages = [
      'gm frens', 'wen pump?', 'bullish vibes only', 'to the moon!', 'buying the dip',
      'HODL gang', 'nice sprite bro', 'anyone fishing?', 'just found gold ore!', 'LFG!',
    ];
    const npcs = [...players.values()].filter(p => p.isNpc);
    if (npcs.length > 0) {
      const npc = randomPick(npcs);
      const entry = {
        wallet: npc.wallet,
        username: npc.username,
        message: randomPick(npcMessages),
        zone: npc.zone,
        timestamp: Date.now(),
      };
      chatHistory.push(entry);
      if (chatHistory.length > MAX_CHAT) chatHistory.shift();
      broadcast({ type: 'chat_message', ...entry }, npc.zone);
    }
  }
  // Broadcast zone states for zones with NPCs
  const npcZones = new Set();
  for (const p of players.values()) if (p.isNpc) npcZones.add(p.zone);
  for (const z of npcZones) broadcastZoneStates(z);
}

spawnNpcs();
setInterval(wanderNpcs, 2000);

// ===========================================================================
// GAME EVENTS (random world events every 5 minutes)
// ===========================================================================

const GAME_EVENTS = [
  { id: 'double_coins', name: 'Double Coins!', description: 'All coin rewards are doubled for 2 minutes!', duration: 120000 },
  { id: 'fish_frenzy', name: 'Fish Frenzy!', description: 'Rare fish are more common for 2 minutes!', duration: 120000 },
  { id: 'mining_rush', name: 'Mining Rush!', description: 'Better ores spawn for 2 minutes!', duration: 120000 },
  { id: 'xp_boost', name: 'XP Boost!', description: 'Double XP for 2 minutes!', duration: 120000 },
  { id: 'meteor_shower', name: 'Meteor Shower!', description: 'Meteors rain coins across all zones!', duration: 60000 },
];

function triggerRandomEvent() {
  if (realPlayerCount() === 0) return;
  const event = randomPick(GAME_EVENTS);
  broadcastAll({
    type: 'game_event',
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      duration: event.duration,
      startedAt: Date.now(),
    },
  });
}

setInterval(triggerRandomEvent, 5 * 60 * 1000); // every 5 min

// ===========================================================================
// REST ENDPOINTS
// ===========================================================================

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', players: playerCount(), realPlayers: realPlayerCount(), uptime: process.uptime() });
});

// --- USER ---

// User info (create if new)
app.get('/user/info', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = requirePlayer(wallet);
  ensureQuests(wallet);
  ensureInventory(wallet);
  ensureLogin(wallet);
  p.lastSeen = Date.now();
  res.json({
    ...p,
    inventory: playerInventory.get(wallet),
    avatar: playerAvatar.get(wallet) || null,
    hotkeys: playerHotkeys.get(wallet) || {},
  });
});

// Change username
app.post('/user/change-username', (req, res) => {
  const { wallet, username } = req.body || {};
  if (!wallet || !username) return res.json({ error: 'wallet and username required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.username = username.slice(0, 20);
  updateQuestProgress(wallet, 'username', 1);
  res.json({ ok: true, username: p.username });
});

// Set initial username
app.post('/user/set-initial-username', (req, res) => {
  const { wallet, username } = req.body || {};
  if (!wallet || !username) return res.json({ error: 'wallet and username required' });
  const p = requirePlayer(wallet);
  if (p.username !== 'Player') return res.json({ error: 'username already set' });
  p.username = username.slice(0, 20);
  updateQuestProgress(wallet, 'username', 1);
  res.json({ ok: true, username: p.username });
});

// Equip hotkey
app.get('/user/equip-hotkey', (req, res) => {
  const { wallet, slot, item } = req.query;
  if (!wallet) return res.json({ error: 'wallet required' });
  const hk = playerHotkeys.get(wallet) || {};
  if (slot && item) {
    hk[slot] = item;
    playerHotkeys.set(wallet, hk);
  }
  res.json({ ok: true, hotkeys: hk });
});

app.post('/user/equip-hotkey', (req, res) => {
  const { wallet, slot, item } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const hk = playerHotkeys.get(wallet) || {};
  if (slot && item) {
    hk[slot] = item;
    playerHotkeys.set(wallet, hk);
  }
  res.json({ ok: true, hotkeys: hk });
});

// Unequip hotkey
app.get('/user/unequip-hotkey', (req, res) => {
  const { wallet, slot } = req.query;
  if (!wallet) return res.json({ error: 'wallet required' });
  const hk = playerHotkeys.get(wallet) || {};
  if (slot) delete hk[slot];
  playerHotkeys.set(wallet, hk);
  res.json({ ok: true, hotkeys: hk });
});

app.post('/user/unequip-hotkey', (req, res) => {
  const { wallet, slot } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const hk = playerHotkeys.get(wallet) || {};
  if (slot) delete hk[slot];
  playerHotkeys.set(wallet, hk);
  res.json({ ok: true, hotkeys: hk });
});

// Select pet
app.post('/user/select-pet', (req, res) => {
  const { wallet, pet } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  if (pet && !PET_TYPES.includes(pet)) return res.json({ error: 'invalid pet' });
  p.pet = pet || null;
  if (p.zone) broadcastZoneStates(p.zone);
  res.json({ ok: true, pet: p.pet });
});

// Equip rod
app.post('/user/equip-rod', (req, res) => {
  const { wallet, rod } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.rod = rod || null;
  playerEquipCount.set(wallet, (playerEquipCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'equip', 1);
  res.json({ ok: true, equipped: p.equipped });
});

// Equip bait
app.post('/user/equip-bait', (req, res) => {
  const { wallet, bait } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.bait = bait || null;
  res.json({ ok: true, equipped: p.equipped });
});

// Equip weapon
app.post('/user/equip-weapon', (req, res) => {
  const { wallet, weapon } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.weapon = weapon || null;
  playerEquipCount.set(wallet, (playerEquipCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'equip', 1);
  if (p.zone) broadcastZoneStates(p.zone);
  res.json({ ok: true, equipped: p.equipped });
});

// Equip pickaxe
app.post('/user/equip-pickaxe', (req, res) => {
  const { wallet, pickaxe } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.pickaxe = pickaxe || null;
  playerEquipCount.set(wallet, (playerEquipCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'equip', 1);
  if (p.zone) broadcastZoneStates(p.zone);
  res.json({ ok: true, equipped: p.equipped });
});

// Equip shovel
app.post('/user/equip-shovel', (req, res) => {
  const { wallet, shovel } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.shovel = shovel || null;
  playerEquipCount.set(wallet, (playerEquipCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'equip', 1);
  if (p.zone) broadcastZoneStates(p.zone);
  res.json({ ok: true, equipped: p.equipped });
});

// Equip net
app.post('/user/equip-net', (req, res) => {
  const { wallet, net } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.equipped.net = net || null;
  playerEquipCount.set(wallet, (playerEquipCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'equip', 1);
  if (p.zone) broadcastZoneStates(p.zone);
  res.json({ ok: true, equipped: p.equipped });
});

// --- ZONES ---

app.get('/zones/status', (req, res) => {
  const status = ZONES.map(z => {
    let count = 0;
    for (const p of players.values()) if (p.zone === z) count++;
    return { zone: z, players: count };
  });
  res.json(status);
});

// --- CHAT ---

app.get('/chat/recent', (req, res) => {
  res.json(chatHistory.slice(-MAX_CHAT));
});

// --- ARENA ---

app.get('/arena/state', (req, res) => {
  const arenaPlayers = [];
  for (const p of players.values()) {
    if (p.zone === 'arena') arenaPlayers.push(playerStateObj(p));
  }
  res.json({ active: arenaPlayers.length >= 2, players: arenaPlayers, minPlayers: 2 });
});

// --- SHOP ---

app.post('/shop/purchase', (req, res) => {
  const { wallet, item, quantity } = req.body || {};
  if (!wallet || !item) return res.json({ error: 'wallet and item required' });
  const p = getPlayer(wallet);
  if (!p) return res.json({ error: 'player not found' });
  const catalogItem = ITEM_CATALOG[item];
  if (!catalogItem) return res.json({ error: 'item not found' });
  const qty = quantity || 1;
  const totalCost = catalogItem.price * qty;
  if (p.coins < totalCost) return res.json({ error: 'not enough coins' });
  p.coins -= totalCost;
  addItem(wallet, item, qty);
  res.json({ ok: true, coins: p.coins, item, quantity: qty });
});

app.post('/shop/claim', (req, res) => {
  const { wallet, item } = req.body || {};
  if (!wallet || !item) return res.json({ error: 'wallet and item required' });
  const claims = playerClaims.get(wallet) || [];
  if (claims.includes(item)) return res.json({ error: 'already claimed' });
  claims.push(item);
  playerClaims.set(wallet, claims);
  addItem(wallet, item, 1);
  res.json({ ok: true, item });
});

app.get('/shop/claims', (req, res) => {
  const { wallet } = req.query;
  res.json(playerClaims.get(wallet) || []);
});

app.get('/shop/token-config', (req, res) => {
  res.json({
    tokens: [
      {
        symbol: 'PUMP',
        mint: '11111111111111111111111111111111',
        decimals: 9,
        name: 'Pumpville Token',
        icon: '/pump-token.png',
      },
    ],
  });
});

app.post('/shop/check-token-balance', (req, res) => {
  const { wallet, token } = req.body || {};
  // Placeholder: real implementation would check on-chain
  res.json({ wallet, token, balance: 0, hasEnough: false });
});

// --- MARKETPLACE ---

app.get('/marketplace/listings', (req, res) => {
  const listings = [];
  for (const [id, listing] of marketplace) {
    if (listing.status === 'active') listings.push({ id, ...listing });
  }
  res.json(listings);
});

app.post('/marketplace/list', (req, res) => {
  const { wallet, item, price, quantity } = req.body || {};
  if (!wallet || !item || !price) return res.json({ error: 'wallet, item, and price required' });
  const qty = quantity || 1;
  if (!hasItem(wallet, item, qty)) return res.json({ error: 'not enough items' });
  removeItem(wallet, item, qty);
  const id = listingIdCounter++;
  marketplace.set(id, {
    seller: wallet,
    item,
    quantity: qty,
    price,
    status: 'active',
    createdAt: Date.now(),
  });
  res.json({ ok: true, listingId: id });
});

app.post('/marketplace/buy', (req, res) => {
  const { wallet, listingId } = req.body || {};
  if (!wallet || !listingId) return res.json({ error: 'wallet and listingId required' });
  const listing = marketplace.get(Number(listingId));
  if (!listing || listing.status !== 'active') return res.json({ error: 'listing not found or sold' });
  if (listing.seller === wallet) return res.json({ error: 'cannot buy your own listing' });
  const buyer = getPlayer(wallet);
  if (!buyer) return res.json({ error: 'buyer not found' });
  if (buyer.coins < listing.price) return res.json({ error: 'not enough coins' });
  buyer.coins -= listing.price;
  addCoins(listing.seller, listing.price);
  addItem(wallet, listing.item, listing.quantity);
  listing.status = 'sold';
  tradeHistory.push({
    listingId: Number(listingId),
    seller: listing.seller,
    buyer: wallet,
    item: listing.item,
    quantity: listing.quantity,
    price: listing.price,
    soldAt: Date.now(),
  });
  res.json({ ok: true, item: listing.item, quantity: listing.quantity });
});

app.post('/marketplace/cancel', (req, res) => {
  const { wallet, listingId } = req.body || {};
  if (!wallet || !listingId) return res.json({ error: 'wallet and listingId required' });
  const listing = marketplace.get(Number(listingId));
  if (!listing) return res.json({ error: 'listing not found' });
  if (listing.seller !== wallet) return res.json({ error: 'not your listing' });
  if (listing.status !== 'active') return res.json({ error: 'listing not active' });
  listing.status = 'cancelled';
  addItem(wallet, listing.item, listing.quantity);
  res.json({ ok: true });
});

app.get('/marketplace/my-listings', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json([]);
  const mine = [];
  for (const [id, listing] of marketplace) {
    if (listing.seller === wallet) mine.push({ id, ...listing });
  }
  res.json(mine);
});

app.get('/marketplace/history', (req, res) => {
  const { wallet } = req.query;
  if (wallet) {
    res.json(tradeHistory.filter(t => t.seller === wallet || t.buyer === wallet).slice(-50));
  } else {
    res.json(tradeHistory.slice(-50));
  }
});

// --- CRAFTING ---

app.post('/crafting/craft', (req, res) => {
  const { wallet, recipeId } = req.body || {};
  if (!wallet || !recipeId) return res.json({ error: 'wallet and recipeId required' });
  const knownRecipes = ensureRecipes(wallet);
  if (!knownRecipes.has(recipeId)) return res.json({ error: 'recipe not learned' });
  const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.json({ error: 'recipe not found' });
  const inv = ensureInventory(wallet);
  // Check ingredients (items + ores + fish)
  for (const ing of recipe.ingredients) {
    const haveItems = inv.items[ing.id] || 0;
    const haveOres = inv.ores[ing.id] || 0;
    const haveFish = inv.fish[ing.id] || 0;
    if (haveItems + haveOres + haveFish < ing.qty) {
      return res.json({ error: `not enough ${ing.id}` });
    }
  }
  // Consume ingredients
  for (const ing of recipe.ingredients) {
    let needed = ing.qty;
    // Use items first, then ores, then fish
    if (inv.items[ing.id]) {
      const take = Math.min(inv.items[ing.id], needed);
      inv.items[ing.id] -= take;
      if (inv.items[ing.id] <= 0) delete inv.items[ing.id];
      needed -= take;
    }
    if (needed > 0 && inv.ores[ing.id]) {
      const take = Math.min(inv.ores[ing.id], needed);
      inv.ores[ing.id] -= take;
      if (inv.ores[ing.id] <= 0) delete inv.ores[ing.id];
      needed -= take;
    }
    if (needed > 0 && inv.fish[ing.id]) {
      const take = Math.min(inv.fish[ing.id], needed);
      inv.fish[ing.id] -= take;
      if (inv.fish[ing.id] <= 0) delete inv.fish[ing.id];
    }
  }
  addItem(wallet, recipe.result, recipe.resultQty);
  playerCraftCount.set(wallet, (playerCraftCount.get(wallet) || 0) + 1);
  updateQuestProgress(wallet, 'craft', 1);
  res.json({ ok: true, crafted: recipe.result, quantity: recipe.resultQty });
});

app.post('/crafting/learn-recipe', (req, res) => {
  const { wallet, recipeId } = req.body || {};
  if (!wallet || !recipeId) return res.json({ error: 'wallet and recipeId required' });
  const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return res.json({ error: 'recipe not found' });
  // Costs a recipe card
  if (!removeItem(wallet, 'recipe_card', 1)) return res.json({ error: 'no recipe card' });
  const known = ensureRecipes(wallet);
  known.add(recipeId);
  res.json({ ok: true, recipeId, recipeName: recipe.name });
});

// --- FISHING ---

app.get('/fishing/inventory', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json({ fish: {}, ores: {} });
  const inv = ensureInventory(wallet);
  res.json({ fish: inv.fish, ores: inv.ores });
});

app.post('/fishing-booth/special-bait-check', (req, res) => {
  const { wallet, bait } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const hasBait = hasItem(wallet, bait || 'golden_lure', 1);
  res.json({ hasBait, bait: bait || 'golden_lure' });
});

app.post('/fishing-booth/redeem', (req, res) => {
  const { wallet, fishId, quantity } = req.body || {};
  if (!wallet || !fishId) return res.json({ error: 'wallet and fishId required' });
  const inv = ensureInventory(wallet);
  const qty = quantity || 1;
  if ((inv.fish[fishId] || 0) < qty) return res.json({ error: 'not enough fish' });
  const fish = FISH_SPECIES.find(f => f.id === fishId);
  if (!fish) return res.json({ error: 'fish not found' });
  inv.fish[fishId] -= qty;
  if (inv.fish[fishId] <= 0) delete inv.fish[fishId];
  const coins = fish.value * qty;
  addCoins(wallet, coins);
  res.json({ ok: true, coins, total: getPlayer(wallet).coins });
});

// --- SURFBOARD ---

app.post('/surfboard/activate', (req, res) => {
  const { wallet } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  if (!hasItem(wallet, 'surfboard', 1)) return res.json({ error: 'no surfboard' });
  const duration = 5 * 60 * 1000; // 5 min
  playerSurfboard.set(wallet, { active: true, expiresAt: Date.now() + duration });
  res.json({ ok: true, expiresAt: Date.now() + duration });
});

// --- BROADCAST ---

app.get('/broadcast/current', (req, res) => {
  res.json(broadcastMessage);
});

// --- FRENZY ---

app.get('/frenzy/status', (req, res) => {
  if (frenzyState.active && frenzyState.endsAt < Date.now()) {
    frenzyState = { active: false, type: null, multiplier: 1, endsAt: null };
  }
  res.json(frenzyState);
});

// --- FRIENDS ---

app.get('/friends', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json([]);
  const f = playerFriends.get(wallet);
  res.json(f ? f.friends : []);
});

app.get('/friend-requests/incoming', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json([]);
  const f = playerFriends.get(wallet);
  res.json(f ? f.requests : []);
});

app.get('/friend-notifications', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json([]);
  const f = playerFriends.get(wallet);
  res.json(f ? f.notifications : []);
});

// --- MESSAGES ---

app.get('/messages', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json([]);
  res.json(playerMessages.get(wallet) || []);
});

// --- ADMIN ---

app.get('/admin/ban-status', (req, res) => {
  const { wallet } = req.query;
  const p = wallet ? getPlayer(wallet) : null;
  res.json({ banned: p ? p.isBanned : false });
});

app.post('/admin/verify', (req, res) => {
  const { wallet, adminKey } = req.body || {};
  // Simple admin check (placeholder)
  if (adminKey === 'pumpville_admin_2026') {
    const p = getPlayer(wallet);
    if (p) p.isAdmin = true;
    return res.json({ ok: true, isAdmin: true });
  }
  res.json({ ok: false, isAdmin: false });
});

// --- GIFTS ---

app.post('/gifts/coins', (req, res) => {
  const { wallet, targetWallet, amount } = req.body || {};
  if (!wallet || !targetWallet || !amount) return res.json({ error: 'wallet, targetWallet, and amount required' });
  const sender = getPlayer(wallet);
  const receiver = getPlayer(targetWallet);
  if (!sender || !receiver) return res.json({ error: 'player not found' });
  if (sender.coins < amount) return res.json({ error: 'not enough coins' });
  if (amount <= 0) return res.json({ error: 'invalid amount' });
  sender.coins -= amount;
  addCoins(targetWallet, amount);
  // Notify receiver
  const msgs = playerMessages.get(targetWallet) || [];
  msgs.push({ from: wallet, fromName: sender.username, type: 'gift_coins', amount, timestamp: Date.now() });
  playerMessages.set(targetWallet, msgs);
  sendTo(targetWallet, { type: 'game_event', event: { id: 'gift_received', name: `${sender.username} sent you ${amount} coins!` } });
  res.json({ ok: true, coins: sender.coins });
});

app.post('/gifts/items', (req, res) => {
  const { wallet, targetWallet, item, quantity } = req.body || {};
  if (!wallet || !targetWallet || !item) return res.json({ error: 'wallet, targetWallet, and item required' });
  const qty = quantity || 1;
  if (!removeItem(wallet, item, qty)) return res.json({ error: 'not enough items' });
  addItem(targetWallet, item, qty);
  const sender = getPlayer(wallet);
  const msgs = playerMessages.get(targetWallet) || [];
  msgs.push({ from: wallet, fromName: sender ? sender.username : 'Unknown', type: 'gift_item', item, quantity: qty, timestamp: Date.now() });
  playerMessages.set(targetWallet, msgs);
  sendTo(targetWallet, { type: 'game_event', event: { id: 'gift_received', name: `${sender ? sender.username : 'Someone'} sent you ${qty}x ${item}!` } });
  res.json({ ok: true });
});

// --- CONSUMABLES ---

app.get('/consumables/inventory', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json({});
  const inv = ensureInventory(wallet);
  const consumables = {};
  for (const [id, qty] of Object.entries(inv.items)) {
    const cat = ITEM_CATALOG[id];
    if (cat && cat.type === 'consumable') consumables[id] = qty;
  }
  res.json(consumables);
});

// --- Catch-all: return ok so game client doesn't choke ---
app.all('*', (req, res) => {
  res.json({ ok: true });
});

// ===========================================================================
// HTTP + WEBSOCKET SERVER
// ===========================================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Ping all clients every 30s
setInterval(() => {
  for (const ws of wsClients.values()) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// Send player count every 10s
setInterval(() => {
  sendPlayerCount();
}, 10000);

// ===========================================================================
// WEBSOCKET MESSAGE HANDLERS
// ===========================================================================

wss.on('connection', (ws) => {
  let playerWallet = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type } = msg;
    if (!type) return;

    // ---- wallet_connected ----
    if (type === 'wallet_connected') {
      playerWallet = msg.wallet;
      if (!playerWallet) return;

      let p = players.get(playerWallet);
      if (!p) {
        p = makePlayer(playerWallet);
        players.set(playerWallet, p);
      }
      p.lastSeen = Date.now();
      wsClients.set(playerWallet, ws);

      ensureQuests(playerWallet);
      ensureInventory(playerWallet);
      ensureLogin(playerWallet);
      ensureRecipes(playerWallet);
      ensureStamps(playerWallet);
      if (!playerZonesVisited.has(playerWallet)) playerZonesVisited.set(playerWallet, new Set());
      playerZonesVisited.get(playerWallet).add(p.zone);

      // Send full game state
      ws.send(JSON.stringify({
        type: 'game_state',
        player: {
          wallet: p.wallet,
          username: p.username,
          x: p.x,
          y: p.y,
          direction: p.direction,
          animation: p.animation,
          sprite: p.sprite,
          pet: p.pet,
          coins: p.coins,
          zone: p.zone,
          hp: p.hp,
          maxHp: p.maxHp,
          level: p.level,
          xp: p.xp,
          equipped: p.equipped,
          inventory: playerInventory.get(playerWallet),
          avatar: playerAvatar.get(playerWallet) || null,
          hotkeys: playerHotkeys.get(playerWallet) || {},
          recipes: [...(playerRecipes.get(playerWallet) || [])],
          stamps: playerStamps.get(playerWallet) || {},
        },
        players: zonePlayerStates(p.zone),
        zone: p.zone,
        zones: ZONES,
        npcs: NPC_SPRITES,
        pets: PET_TYPES,
        fishSpecies: FISH_SPECIES,
        oreTypes: ORE_TYPES,
        craftingRecipes: CRAFTING_RECIPES,
        itemCatalog: ITEM_CATALOG,
        stampCards: STAMP_CARDS,
        avatarParts: AVATAR_PARTS,
        avatarSets: AVATAR_SETS,
      }));

      // Notify zone
      broadcast({ type: 'zone_presence', wallet: playerWallet, username: p.username, action: 'joined', zone: p.zone }, p.zone);
      sendPlayerCount();
      broadcastZoneStates(p.zone);
      return;
    }

    // All further messages require a connected wallet
    if (!playerWallet) return;
    const player = players.get(playerWallet);
    if (!player) return;

    // ---- pong ----
    if (type === 'pong') {
      return;
    }

    // ---- chat_message ----
    if (type === 'chat_message') {
      const text = (msg.message || '').slice(0, 500);
      if (!text) return;
      const entry = {
        wallet: playerWallet,
        username: player.username,
        message: text,
        zone: player.zone,
        timestamp: Date.now(),
      };
      chatHistory.push(entry);
      if (chatHistory.length > MAX_CHAT) chatHistory.shift();
      broadcast({
        type: 'chat_message',
        wallet: entry.wallet,
        username: entry.username,
        message: entry.message,
        timestamp: entry.timestamp,
      }, player.zone);
      playerChatCount.set(playerWallet, (playerChatCount.get(playerWallet) || 0) + 1);
      updateQuestProgress(playerWallet, 'chat', 1);
      updateStampProgress(playerWallet, 'social_stamp', 1);
      return;
    }

    // ---- change_sprite ----
    if (type === 'change_sprite') {
      player.sprite = msg.sprite || player.sprite;
      broadcastZoneStates(player.zone);
      updateQuestProgress(playerWallet, 'change_sprite', 1);
      return;
    }

    // ---- change_pet ----
    if (type === 'change_pet') {
      const pet = msg.pet || null;
      if (pet && !PET_TYPES.includes(pet)) return;
      player.pet = pet;
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- player_move ----
    if (type === 'player_move') {
      const oldX = player.x;
      const oldY = player.y;
      if (typeof msg.x === 'number') player.x = msg.x;
      if (typeof msg.y === 'number') player.y = msg.y;
      if (msg.direction) player.direction = msg.direction;
      if (msg.animation) player.animation = msg.animation;
      // Track distance for quests
      const dist = Math.sqrt((player.x - oldX) ** 2 + (player.y - oldY) ** 2);
      if (dist > 0) {
        playerMoveDistance.set(playerWallet, (playerMoveDistance.get(playerWallet) || 0) + dist);
        updateQuestProgress(playerWallet, 'movement', dist);
        updateStampProgress(playerWallet, 'explorer_stamp', dist);
      }
      // Surfboard check
      const sb = playerSurfboard.get(playerWallet);
      if (sb && sb.active && sb.expiresAt < Date.now()) {
        playerSurfboard.delete(playerWallet);
      }
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- zone_change ----
    if (type === 'zone_change') {
      const newZone = msg.zone;
      if (!ZONES.includes(newZone)) return;
      const oldZone = player.zone;
      if (oldZone === newZone) return;
      player.zone = newZone;
      player.x = 400;
      player.y = 300;

      // Track zone visits for quests
      if (!playerZonesVisited.has(playerWallet)) playerZonesVisited.set(playerWallet, new Set());
      playerZonesVisited.get(playerWallet).add(newZone);
      updateQuestProgress(playerWallet, 'zone_visit', 1);

      // Arena quest tracking
      if (newZone === 'arena') {
        playerArenaCount.set(playerWallet, (playerArenaCount.get(playerWallet) || 0) + 1);
        updateQuestProgress(playerWallet, 'arena', 1);
      }

      // Notify old zone
      broadcast({ type: 'zone_presence', wallet: playerWallet, username: player.username, action: 'left', zone: oldZone }, oldZone);
      broadcast({ type: 'player_disconnected', wallet: playerWallet }, oldZone);
      broadcastZoneStates(oldZone);

      // Send new zone state to the player
      ws.send(JSON.stringify({
        type: 'zone_changed',
        zone: newZone,
        players: zonePlayerStates(newZone),
      }));

      // Notify new zone
      broadcast({ type: 'zone_presence', wallet: playerWallet, username: player.username, action: 'joined', zone: newZone }, newZone);
      broadcastZoneStates(newZone);
      return;
    }

    // ---- username_changed ----
    if (type === 'username_changed') {
      if (msg.username) {
        player.username = msg.username.slice(0, 20);
        broadcastZoneStates(player.zone);
        updateQuestProgress(playerWallet, 'username', 1);
      }
      return;
    }

    // ---- pickaxe_equipped ----
    if (type === 'pickaxe_equipped') {
      player.equipped.pickaxe = msg.pickaxe || msg.item || null;
      playerEquipCount.set(playerWallet, (playerEquipCount.get(playerWallet) || 0) + 1);
      updateQuestProgress(playerWallet, 'equip', 1);
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- shovel_equipped ----
    if (type === 'shovel_equipped') {
      player.equipped.shovel = msg.shovel || msg.item || null;
      playerEquipCount.set(playerWallet, (playerEquipCount.get(playerWallet) || 0) + 1);
      updateQuestProgress(playerWallet, 'equip', 1);
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- net_equipped ----
    if (type === 'net_equipped') {
      player.equipped.net = msg.net || msg.item || null;
      playerEquipCount.set(playerWallet, (playerEquipCount.get(playerWallet) || 0) + 1);
      updateQuestProgress(playerWallet, 'equip', 1);
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- avatar_part_equipped ----
    if (type === 'avatar_part_equipped') {
      const { part, item } = msg;
      if (!part || !AVATAR_PARTS.includes(part)) return;
      if (!playerAvatar.has(playerWallet)) {
        playerAvatar.set(playerWallet, { parts: {}, set: null });
      }
      const av = playerAvatar.get(playerWallet);
      av.parts[part] = item || null;
      av.set = null; // clear set when individual part equipped
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- avatar_set_equipped ----
    if (type === 'avatar_set_equipped') {
      const { set } = msg;
      if (!set || !AVATAR_SETS.includes(set)) return;
      if (!playerAvatar.has(playerWallet)) {
        playerAvatar.set(playerWallet, { parts: {}, set: null });
      }
      const av = playerAvatar.get(playerWallet);
      av.set = set;
      // Set overrides individual parts
      av.parts = {};
      for (const part of AVATAR_PARTS) av.parts[part] = `${set}_${part}`;
      broadcastZoneStates(player.zone);
      return;
    }

    // ---- eat_food ----
    if (type === 'eat_food') {
      const itemId = msg.item;
      if (!itemId) return;
      const cat = ITEM_CATALOG[itemId];
      if (!cat || cat.type !== 'consumable') return;
      if (!removeItem(playerWallet, itemId, 1)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Item not in inventory' }));
        return;
      }
      const healAmount = cat.heal || 0;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);
      playerEatCount.set(playerWallet, (playerEatCount.get(playerWallet) || 0) + 1);
      updateQuestProgress(playerWallet, 'eat', 1);
      ws.send(JSON.stringify({ type: 'player_hp_update', hp: player.hp, maxHp: player.maxHp, healed: healAmount }));
      return;
    }

    // ---- use_recipe_card ----
    if (type === 'use_recipe_card') {
      const recipeId = msg.recipe;
      if (!recipeId) return;
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      if (!recipe) {
        ws.send(JSON.stringify({ type: 'error', message: 'Recipe not found' }));
        return;
      }
      if (!removeItem(playerWallet, 'recipe_card', 1)) {
        ws.send(JSON.stringify({ type: 'error', message: 'No recipe card' }));
        return;
      }
      const known = ensureRecipes(playerWallet);
      known.add(recipeId);
      ws.send(JSON.stringify({ type: 'recipe_learned', recipeId, recipeName: recipe.name }));
      return;
    }

    // ---- open_message_in_bottle ----
    if (type === 'open_message_in_bottle') {
      if (!removeItem(playerWallet, 'message_bottle', 1)) {
        ws.send(JSON.stringify({ type: 'error', message: 'No message in a bottle' }));
        return;
      }
      const reward = randomPick(BOTTLE_REWARDS);
      if (reward.type === 'coins') {
        addCoins(playerWallet, reward.amount);
        ws.send(JSON.stringify({
          type: 'bottle_opened',
          rewardType: 'coins',
          amount: reward.amount,
          message: reward.message,
          coins: player.coins,
        }));
      } else {
        addItem(playerWallet, reward.item, reward.qty);
        ws.send(JSON.stringify({
          type: 'bottle_opened',
          rewardType: 'item',
          item: reward.item,
          quantity: reward.qty,
          message: reward.message,
        }));
      }
      return;
    }

    // ---- get_daily_quests ----
    if (type === 'get_daily_quests') {
      const q = ensureQuests(playerWallet);
      ws.send(JSON.stringify({ type: 'quest_data', questType: 'daily', quests: q.daily }));
      return;
    }

    // ---- get_all_beginner_quests_v2 ----
    if (type === 'get_all_beginner_quests_v2') {
      const q = ensureQuests(playerWallet);
      ws.send(JSON.stringify({
        type: 'quest_data',
        questType: 'beginner',
        quests: q.beginner,
        finalClaimed: q.beginnerFinalClaimed,
      }));
      return;
    }

    // ---- claim_stamp_card ----
    if (type === 'claim_stamp_card') {
      const { card } = msg;
      if (!card) return;
      const stamps = ensureStamps(playerWallet);
      if (!stamps[card]) return;
      const stampDef = STAMP_CARDS.find(s => s.id === card);
      if (!stampDef) return;
      if (stamps[card].claimed) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already claimed' }));
        return;
      }
      if (stamps[card].progress < stampDef.target) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not enough progress' }));
        return;
      }
      stamps[card].claimed = true;
      if (stampDef.reward.coins) addCoins(playerWallet, stampDef.reward.coins);
      if (stampDef.reward.item) addItem(playerWallet, stampDef.reward.item, 1);
      ws.send(JSON.stringify({ type: 'stamp_claimed', card, reward: stampDef.reward, coins: player.coins }));
      return;
    }

    // ---- claim_beginner_final_reward ----
    if (type === 'claim_beginner_final_reward') {
      const q = ensureQuests(playerWallet);
      if (q.beginnerFinalClaimed) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already claimed' }));
        return;
      }
      const allDone = q.beginner.every(bq => bq.completed);
      if (!allDone) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not all quests completed' }));
        return;
      }
      q.beginnerFinalClaimed = true;
      addCoins(playerWallet, 500);
      addItem(playerWallet, 'lootbox', 1);
      ws.send(JSON.stringify({
        type: 'beginner_final_claimed',
        reward: { coins: 500, item: 'lootbox', qty: 1 },
        coins: player.coins,
      }));
      return;
    }

    // ---- get_daily_login_state ----
    if (type === 'get_daily_login_state') {
      const login = ensureLogin(playerWallet);
      const today = todayStr();
      const canClaim = login.lastClaim !== today;
      const canLootbox = login.lastLootbox !== today;
      ws.send(JSON.stringify({
        type: 'daily_login_state',
        streak: login.streak,
        canClaim,
        canLootbox,
        rewards: DAILY_LOGIN_REWARDS,
        lastClaim: login.lastClaim,
      }));
      return;
    }

    // ---- claim_daily_login ----
    if (type === 'claim_daily_login') {
      const login = ensureLogin(playerWallet);
      const today = todayStr();
      if (login.lastClaim === today) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already claimed today' }));
        return;
      }
      // Check streak continuity
      if (login.lastClaim) {
        const lastDate = new Date(login.lastClaim);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / 86400000);
        if (diffDays === 1) {
          login.streak = (login.streak % 7) + 1;
        } else {
          login.streak = 1; // streak broken
        }
      } else {
        login.streak = 1;
      }
      login.lastClaim = today;
      const rewardDay = DAILY_LOGIN_REWARDS.find(r => r.day === login.streak) || DAILY_LOGIN_REWARDS[0];
      if (rewardDay.reward.coins) addCoins(playerWallet, rewardDay.reward.coins);
      if (rewardDay.reward.item) addItem(playerWallet, rewardDay.reward.item, 1);
      ws.send(JSON.stringify({
        type: 'daily_login_claimed',
        day: login.streak,
        reward: rewardDay.reward,
        coins: player.coins,
        streak: login.streak,
      }));
      return;
    }

    // ---- claim_daily_lootbox ----
    if (type === 'claim_daily_lootbox') {
      const login = ensureLogin(playerWallet);
      const today = todayStr();
      if (login.lastLootbox === today) {
        ws.send(JSON.stringify({ type: 'error', message: 'Already opened lootbox today' }));
        return;
      }
      login.lastLootbox = today;
      const roll = weightedPick(LOOTBOX_TABLE);
      addItem(playerWallet, roll.item, roll.qty);
      ws.send(JSON.stringify({
        type: 'daily_lootbox_claimed',
        item: roll.item,
        itemName: ITEM_CATALOG[roll.item] ? ITEM_CATALOG[roll.item].name : roll.item,
        quantity: roll.qty,
      }));
      return;
    }

    // ---- Unknown message type: log but don't crash ----
    // (Godot client may send messages we haven't implemented yet)
  });

  ws.on('close', () => {
    if (playerWallet) {
      const p = players.get(playerWallet);
      const zone = p ? p.zone : null;
      wsClients.delete(playerWallet);
      players.delete(playerWallet);
      // Clean up per-player state but keep persistent data (inventory etc.)
      broadcastAll({ type: 'player_disconnected', wallet: playerWallet });
      if (zone) {
        broadcast({ type: 'zone_presence', wallet: playerWallet, action: 'left', zone }, zone);
        broadcastZoneStates(zone);
      }
      sendPlayerCount();
    }
  });

  ws.on('error', () => {});
});

// ===========================================================================
// START SERVER
// ===========================================================================

server.listen(PORT, () => {
  const npcCount = [...players.values()].filter(p => p.isNpc).length;
  console.log(`Pumpville backend running on port ${PORT}`);
  console.log(`  NPCs spawned: ${npcCount}`);
  console.log(`  Zones: ${ZONES.join(', ')}`);
  console.log(`  Fish species: ${FISH_SPECIES.length}`);
  console.log(`  Ore types: ${ORE_TYPES.length}`);
  console.log(`  Pet types: ${PET_TYPES.length}`);
  console.log(`  Item catalog: ${Object.keys(ITEM_CATALOG).length} items`);
  console.log(`  Crafting recipes: ${CRAFTING_RECIPES.length}`);
  console.log(`  REST endpoints: 40+`);
  console.log(`  WS message types: 21+`);
});

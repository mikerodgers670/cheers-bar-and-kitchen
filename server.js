const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------------------------------------------------------------
   DATA LAYER — Postgres (e.g. a free Neon database), so data survives
   redeploys and restarts. Set DATABASE_URL in your host's environment
   variables (never commit it to GitHub).
--------------------------------------------------------------------- */
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable. Set it to your Postgres connection string (e.g. from Neon) before starting the server.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  return pool.query(text, params);
}

/* ---------------------------------------------------------------------
   SCHEMA + SEED DATA (runs once on startup; safe to run every startup —
   CREATE TABLE IF NOT EXISTS and the "only seed if empty" check make it
   idempotent, so it won't wipe or duplicate data on subsequent deploys)
--------------------------------------------------------------------- */
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      recovery_phone TEXT DEFAULT ''
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      unit TEXT,
      price NUMERIC NOT NULL,
      stock NUMERIC NOT NULL DEFAULT 0,
      threshold NUMERIC NOT NULL DEFAULT 5,
      image TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      item_id INTEGER,
      item_name TEXT,
      unit TEXT,
      qty NUMERIC,
      price NUMERIC,
      total NUMERIC,
      seller TEXT,
      time BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS restocks (
      id SERIAL PRIMARY KEY,
      item_id INTEGER,
      item_name TEXT,
      qty NUMERIC,
      time BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reconciliations (
      id SERIAL PRIMARY KEY,
      item_id INTEGER,
      item_name TEXT,
      system_stock NUMERIC,
      physical_count NUMERIC,
      variance NUMERIC,
      price NUMERIC,
      money_variance NUMERIC,
      counted_by TEXT,
      time BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS debts (
      id SERIAL PRIMARY KEY,
      customer_name TEXT,
      phone TEXT,
      amount NUMERIC,
      item_name TEXT,
      note TEXT,
      seller TEXT,
      time BIGINT,
      settled BOOLEAN DEFAULT FALSE,
      settled_time BIGINT
    );
  `);

  const { rows: userCountRows } = await query('SELECT COUNT(*)::int AS count FROM users');
  if (userCountRows[0].count === 0) {
    await query(
      `INSERT INTO users (username, password, role, display_name, recovery_phone) VALUES ($1,$2,$3,$4,$5)`,
      ['admin', 'admin2026', 'admin', 'Owner', '']
    );
  }

  const { rows: itemCountRows } = await query('SELECT COUNT(*)::int AS count FROM items');
  if (itemCountRows[0].count === 0) {
    const seedItems = [
      ['Tusker Lager', 'Tusker', 'Beer', 'bottle', 250],
      ['Tusker Malt', 'Tusker', 'Beer', 'bottle', 280],
      ['White Cap', 'White Cap', 'Beer', 'bottle', 250],
      ['Pilsner', 'Pilsner', 'Beer', 'bottle', 230],
      ['Guinness Foreign Extra Stout', 'Guinness', 'Beer', 'bottle', 280],
      ['Balozi', 'Balozi', 'Beer', 'bottle', 200],
      ['Heineken', 'Heineken', 'Beer', 'bottle', 300],
      ['Senator Keg', 'Senator', 'Beer', 'litre', 120],
      ['Johnnie Walker Black Label', 'Johnnie Walker', 'Spirits', 'bottle', 4500],
      ['Johnnie Walker Red Label', 'Johnnie Walker', 'Spirits', 'bottle', 2800],
      ['Chivas Regal 12yr', 'Chivas Regal', 'Spirits', 'bottle', 5200],
      ['VAT 69', 'VAT 69', 'Spirits', 'bottle', 1800],
      ['Smirnoff Vodka', 'Smirnoff', 'Spirits', 'bottle', 1500],
      ['County Vodka', 'County', 'Spirits', 'bottle', 900],
      ["Gilbey's Gin", "Gilbey's", 'Spirits', 'bottle', 1600],
      ['Captain Morgan Rum', 'Captain Morgan', 'Spirits', 'bottle', 2200],
      ['Kenya Cane', 'Kenya Cane', 'Spirits', 'bottle', 900],
      ['Viceroy Brandy', 'Viceroy', 'Spirits', 'bottle', 1400],
      ['Four Cousins Sweet Red', 'Four Cousins', 'Wine', 'bottle', 1200],
      ['Drostdy-Hof', 'Drostdy-Hof', 'Wine', 'bottle', 1100],
      ['Smirnoff Ice', 'Smirnoff Ice', 'RTD', 'bottle', 300],
      ["Redd's", "Redd's", 'RTD', 'bottle', 280],
      ['Snapp', 'Snapp', 'RTD', 'bottle', 250],
      ['Amarula', 'Amarula', 'Liqueurs', 'bottle', 2600],
      ['Baileys Irish Cream', 'Baileys', 'Liqueurs', 'bottle', 3200],
      ['Goat Meat', 'Butchery', 'Kitchen', 'kg', 700],
    ];
    for (const [name, brand, category, unit, price] of seedItems) {
      await query(
        `INSERT INTO items (name, brand, category, unit, price, stock, threshold, image) VALUES ($1,$2,$3,$4,$5,0,5,NULL)`,
        [name, brand, category, unit, price]
      );
    }
  }
}

/* ---------------------------------------------------------------------
   MAPPERS — convert Postgres's snake_case rows into the camelCase shape
   the frontend already expects, so public/index.html didn't need to change.
--------------------------------------------------------------------- */
function mapUser(r) { return { username: r.username, role: r.role, displayName: r.display_name, recoveryPhone: r.recovery_phone || '' }; }
function mapItem(r) { return { id: r.id, name: r.name, brand: r.brand, category: r.category, unit: r.unit, price: Number(r.price), stock: Number(r.stock), threshold: Number(r.threshold), image: r.image }; }
function mapSale(r) { return { id: r.id, itemId: r.item_id, itemName: r.item_name, unit: r.unit, qty: Number(r.qty), price: Number(r.price), total: Number(r.total), seller: r.seller, time: Number(r.time) }; }
function mapRestock(r) { return { id: r.id, itemId: r.item_id, itemName: r.item_name, qty: Number(r.qty), time: Number(r.time) }; }
function mapReconciliation(r) {
  return {
    id: r.id, itemId: r.item_id, itemName: r.item_name, systemStock: Number(r.system_stock),
    physicalCount: Number(r.physical_count), variance: Number(r.variance), price: Number(r.price),
    moneyVariance: Number(r.money_variance), countedBy: r.counted_by, time: Number(r.time),
  };
}
function mapDebt(r) {
  return {
    id: r.id, customerName: r.customer_name, phone: r.phone, amount: Number(r.amount), itemName: r.item_name,
    note: r.note, seller: r.seller, time: Number(r.time), settled: r.settled, settledTime: r.settled_time ? Number(r.settled_time) : null,
  };
}

/* ---------------------------------------------------------------------
   Lenient phone comparison: strips everything but digits, then compares
   the last 9 (so 0796703151, 796703151, +254796703151, 254796703151 all match).
--------------------------------------------------------------------- */
function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.slice(-9);
}

/* ---------------------------------------------------------------------
   AUTH
   Kept intentionally simple (no sessions/JWT): this is a small,
   single-location app. Every write endpoint just trusts the seller
   name sent by the client, same as the original offline version did.
--------------------------------------------------------------------- */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (!rows[0]) return res.status(401).json({ ok: false, error: 'Incorrect username or password.' });
    res.json({ ok: true, user: mapUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   STATE (polled by every connected device to stay in sync)
--------------------------------------------------------------------- */
app.get('/api/state', async (req, res) => {
  try {
    const [items, sales, restocks, reconciliations, debts, users] = await Promise.all([
      query('SELECT * FROM items ORDER BY id'),
      query('SELECT * FROM sales ORDER BY id'),
      query('SELECT * FROM restocks ORDER BY id'),
      query('SELECT * FROM reconciliations ORDER BY id'),
      query('SELECT * FROM debts ORDER BY id'),
      query('SELECT * FROM users ORDER BY username'),
    ]);
    res.json({
      items: items.rows.map(mapItem),
      sales: sales.rows.map(mapSale),
      restocks: restocks.rows.map(mapRestock),
      reconciliations: reconciliations.rows.map(mapReconciliation),
      debts: debts.rows.map(mapDebt),
      users: users.rows.map(u => ({ username: u.username, role: u.role, displayName: u.display_name })),
      serverTime: Date.now(),
    });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   ITEMS / INVENTORY
--------------------------------------------------------------------- */
app.post('/api/items', async (req, res) => {
  try {
    const { name, brand, category, unit, price, stock, threshold } = req.body || {};
    if (!name || !brand || isNaN(parseFloat(price)) || isNaN(parseFloat(stock))) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }
    const { rows } = await query(
      `INSERT INTO items (name, brand, category, unit, price, stock, threshold, image) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING *`,
      [name, brand, category || 'Beer', unit || 'bottle', parseFloat(price), parseFloat(stock), parseFloat(threshold) || 5]
    );
    res.json({ ok: true, item: mapItem(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/items/:id/restock', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const qty = parseFloat(req.body?.qty);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid quantity.' });
    const { rows: itemRows } = await query('SELECT * FROM items WHERE id = $1', [id]);
    if (!itemRows[0]) return res.status(404).json({ ok: false, error: 'Item not found.' });
    const { rows: updatedRows } = await query('UPDATE items SET stock = stock + $1 WHERE id = $2 RETURNING *', [qty, id]);
    const it = updatedRows[0];
    const { rows: restockRows } = await query(
      `INSERT INTO restocks (item_id, item_name, qty, time) VALUES ($1,$2,$3,$4) RETURNING *`,
      [it.id, it.name, qty, Date.now()]
    );
    res.json({ ok: true, item: mapItem(it), restock: mapRestock(restockRows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/items/:id/price', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const price = parseFloat(req.body?.price);
    if (isNaN(price) || price < 0) return res.status(400).json({ ok: false, error: 'Enter a valid price.' });
    const { rows } = await query('UPDATE items SET price = $1 WHERE id = $2 RETURNING *', [price, id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Item not found.' });
    res.json({ ok: true, item: mapItem(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* Butchery delivery is just a restock + optional price update on Goat Meat */
app.post('/api/butchery/delivery', async (req, res) => {
  try {
    const qty = parseFloat(req.body?.qty);
    const price = parseFloat(req.body?.price);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid delivery weight.' });
    const { rows: meatRows } = await query(`SELECT * FROM items WHERE category = 'Kitchen' AND name = 'Goat Meat'`);
    if (!meatRows[0]) return res.status(404).json({ ok: false, error: 'Goat Meat item missing.' });
    const meat = meatRows[0];
    let updated;
    if (!isNaN(price) && price > 0) {
      const { rows } = await query('UPDATE items SET stock = stock + $1, price = $2 WHERE id = $3 RETURNING *', [qty, price, meat.id]);
      updated = rows[0];
    } else {
      const { rows } = await query('UPDATE items SET stock = stock + $1 WHERE id = $2 RETURNING *', [qty, meat.id]);
      updated = rows[0];
    }
    const { rows: restockRows } = await query(
      `INSERT INTO restocks (item_id, item_name, qty, time) VALUES ($1,$2,$3,$4) RETURNING *`,
      [updated.id, updated.name, qty, Date.now()]
    );
    res.json({ ok: true, item: mapItem(updated), restock: mapRestock(restockRows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   SALES
--------------------------------------------------------------------- */
app.post('/api/sales', async (req, res) => {
  try {
    const { itemId, qty, seller } = req.body || {};
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid quantity.' });
    const { rows: itemRows } = await query('SELECT * FROM items WHERE id = $1', [Number(itemId)]);
    if (!itemRows[0]) return res.status(404).json({ ok: false, error: 'Item not found.' });
    const it = itemRows[0];
    if (q > Number(it.stock)) return res.status(400).json({ ok: false, error: `Only ${it.stock} ${it.unit} left — cannot oversell.` });
    const { rows: updatedRows } = await query('UPDATE items SET stock = stock - $1 WHERE id = $2 RETURNING *', [q, it.id]);
    const updatedItem = updatedRows[0];
    const total = q * Number(it.price);
    const { rows: saleRows } = await query(
      `INSERT INTO sales (item_id, item_name, unit, qty, price, total, seller, time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [it.id, it.name, it.unit, q, it.price, total, seller || 'Unknown', Date.now()]
    );
    res.json({ ok: true, sale: mapSale(saleRows[0]), item: mapItem(updatedItem) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   DEBTS  (seller records; admin sees + settles)
--------------------------------------------------------------------- */
app.post('/api/debts', async (req, res) => {
  try {
    const { customerName, phone, amount, itemName, seller, note } = req.body || {};
    const amt = parseFloat(amount);
    if (!customerName || !phone || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ ok: false, error: 'Customer name, phone, and a valid amount are required.' });
    }
    const { rows } = await query(
      `INSERT INTO debts (customer_name, phone, amount, item_name, note, seller, time, settled, settled_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,NULL) RETURNING *`,
      [customerName, phone, amt, itemName || '', note || '', seller || 'Unknown', Date.now()]
    );
    res.json({ ok: true, debt: mapDebt(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/debts/:id/settle', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('UPDATE debts SET settled = TRUE, settled_time = $1 WHERE id = $2 RETURNING *', [Date.now(), id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Debt not found.' });
    res.json({ ok: true, debt: mapDebt(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   RECONCILIATION
--------------------------------------------------------------------- */
app.post('/api/reconciliation', async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const countedBy = (req.body?.countedBy || '').trim() || 'Admin';
    let logged = 0;
    const now = Date.now();
    for (const { itemId, physicalCount } of entries) {
      const val = parseFloat(physicalCount);
      if (isNaN(val)) continue;
      const { rows: itemRows } = await query('SELECT * FROM items WHERE id = $1', [Number(itemId)]);
      const it = itemRows[0];
      if (!it) continue;
      const variance = +(val - Number(it.stock)).toFixed(2);
      const moneyVariance = +(variance * Number(it.price)).toFixed(2);
      await query(
        `INSERT INTO reconciliations (item_id, item_name, system_stock, physical_count, variance, price, money_variance, counted_by, time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [it.id, it.name, it.stock, val, variance, it.price, moneyVariance, countedBy, now]
      );
      logged++;
    }
    if (logged === 0) return res.status(400).json({ ok: false, error: 'Enter at least one physical count.' });
    res.json({ ok: true, logged });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   STAFF
--------------------------------------------------------------------- */
app.post('/api/staff', async (req, res) => {
  try {
    const { displayName, username, password } = req.body || {};
    if (!displayName || !username || !password) return res.status(400).json({ ok: false, error: 'Fill in all fields.' });
    const { rows: existing } = await query('SELECT username FROM users WHERE username = $1', [username]);
    if (existing[0]) return res.status(409).json({ ok: false, error: 'That username is already taken.' });
    await query(
      `INSERT INTO users (username, password, role, display_name, recovery_phone) VALUES ($1,$2,'seller',$3,'')`,
      [username, password, displayName]
    );
    res.json({ ok: true, user: { username, role: 'seller', displayName } });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.delete('/api/staff/:username', async (req, res) => {
  try {
    const { rowCount } = await query(`DELETE FROM users WHERE username = $1 AND role != 'admin'`, [req.params.username]);
    res.json({ ok: true, removed: rowCount });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/staff/:username/password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || !password.trim()) return res.status(400).json({ ok: false, error: 'Enter a new password.' });
    const { rows } = await query('UPDATE users SET password = $1 WHERE username = $2 RETURNING username', [password.trim(), req.params.username]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Seller not found.' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/staff/:username/recovery-phone', async (req, res) => {
  try {
    const recoveryPhone = String(req.body?.recoveryPhone || '').trim();
    const { rows } = await query('UPDATE users SET recovery_phone = $1 WHERE username = $2 RETURNING *', [recoveryPhone, req.params.username]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'User not found.' });
    res.json({ ok: true, recoveryPhone: rows[0].recovery_phone || '' });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

/* ---------------------------------------------------------------------
   FORGOT PASSWORD (free, no SMS needed — matches against a recovery
   phone number the account owner set up in advance from the Staff page)
--------------------------------------------------------------------- */
app.post('/api/forgot-password/verify', async (req, res) => {
  try {
    const { username, phone } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !user.recovery_phone) {
      return res.status(404).json({ ok: false, error: 'No recovery number is set up for that username yet.' });
    }
    if (normalizePhone(phone) !== normalizePhone(user.recovery_phone)) {
      return res.status(401).json({ ok: false, error: 'That phone number does not match our records.' });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

app.post('/api/forgot-password/reset', async (req, res) => {
  try {
    const { username, phone, newPassword } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !user.recovery_phone) {
      return res.status(404).json({ ok: false, error: 'No recovery number is set up for that username yet.' });
    }
    if (normalizePhone(phone) !== normalizePhone(user.recovery_phone)) {
      return res.status(401).json({ ok: false, error: 'That phone number does not match our records.' });
    }
    if (!newPassword || !newPassword.trim() || newPassword.trim().length < 4) {
      return res.status(400).json({ ok: false, error: 'Choose a password with at least 4 characters.' });
    }
    await query('UPDATE users SET password = $1 WHERE username = $2', [newPassword.trim(), username]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server error. Please try again.' }); }
});

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`CHEERS Bar and Kitchen server running on port ${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to initialize database schema:', e);
    process.exit(1);
  });

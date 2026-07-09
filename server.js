const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'data', 'db.json');

/* ---------------------------------------------------------------------
   DATA LAYER — a single JSON file on disk acts as the "database".
   Every write re-saves the whole file. Fine for a single-bar workload;
   swap this out for a real database later if you ever need heavier
   concurrent traffic across many locations.
--------------------------------------------------------------------- */
function seedData() {
  let uid = 1000;
  const nextId = () => uid++;
  const item = (name, brand, category, unit, price, threshold = 5) => ({
    id: nextId(), name, brand, category, unit, price, stock: 0, threshold, image: null
  });
  return {
    uid,
    users: [
      { username: 'admin', password: 'admin1234', role: 'admin', displayName: 'Owner' },
      { username: 'seller', password: 'seller1234', role: 'seller', displayName: 'Counter Staff' },
      { username: 'seller2', password: 'seller1234', role: 'seller', displayName: 'Evening Staff' },
    ],
    items: [
      item('Tusker Lager', 'Tusker', 'Beer', 'bottle', 250),
      item('Tusker Malt', 'Tusker', 'Beer', 'bottle', 280),
      item('White Cap', 'White Cap', 'Beer', 'bottle', 250),
      item('Pilsner', 'Pilsner', 'Beer', 'bottle', 230),
      item('Guinness Foreign Extra Stout', 'Guinness', 'Beer', 'bottle', 280),
      item('Balozi', 'Balozi', 'Beer', 'bottle', 200),
      item('Heineken', 'Heineken', 'Beer', 'bottle', 300),
      item('Senator Keg', 'Senator', 'Beer', 'litre', 120),
      item('Johnnie Walker Black Label', 'Johnnie Walker', 'Spirits', 'bottle', 4500),
      item('Johnnie Walker Red Label', 'Johnnie Walker', 'Spirits', 'bottle', 2800),
      item('Chivas Regal 12yr', 'Chivas Regal', 'Spirits', 'bottle', 5200),
      item('VAT 69', 'VAT 69', 'Spirits', 'bottle', 1800),
      item('Smirnoff Vodka', 'Smirnoff', 'Spirits', 'bottle', 1500),
      item('County Vodka', 'County', 'Spirits', 'bottle', 900),
      item("Gilbey's Gin", "Gilbey's", 'Spirits', 'bottle', 1600),
      item('Captain Morgan Rum', 'Captain Morgan', 'Spirits', 'bottle', 2200),
      item('Kenya Cane', 'Kenya Cane', 'Spirits', 'bottle', 900),
      item('Viceroy Brandy', 'Viceroy', 'Spirits', 'bottle', 1400),
      item('Four Cousins Sweet Red', 'Four Cousins', 'Wine', 'bottle', 1200),
      item('Drostdy-Hof', 'Drostdy-Hof', 'Wine', 'bottle', 1100),
      item('Smirnoff Ice', 'Smirnoff Ice', 'RTD', 'bottle', 300),
      item("Redd's", "Redd's", 'RTD', 'bottle', 280),
      item('Snapp', 'Snapp', 'RTD', 'bottle', 250),
      item('Amarula', 'Amarula', 'Liqueurs', 'bottle', 2600),
      item('Baileys Irish Cream', 'Baileys', 'Liqueurs', 'bottle', 3200),
      item('Goat Meat', 'Butchery', 'Kitchen', 'kg', 700),
    ],
    sales: [],
    restocks: [],
    reconciliations: [],
    debts: [],
  };
}

let db;
function load() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = seedData();
    save();
  }
}
function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function nextId() { return db.uid++; }
load();

/* ---------------------------------------------------------------------
   HELPERS
--------------------------------------------------------------------- */
function publicUsers() {
  return db.users.map(u => ({ username: u.username, role: u.role, displayName: u.displayName }));
}
function findItem(id) { return db.items.find(i => i.id === Number(id)); }

/* ---------------------------------------------------------------------
   AUTH
   Kept intentionally simple (no sessions/JWT): this is a small,
   single-location app. Every write endpoint just trusts the seller
   name sent by the client, same as the original offline version did.
--------------------------------------------------------------------- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ ok: false, error: 'Incorrect username or password.' });
  res.json({ ok: true, user: { username: user.username, role: user.role, displayName: user.displayName } });
});

/* ---------------------------------------------------------------------
   STATE (polled by every connected device to stay in sync)
--------------------------------------------------------------------- */
app.get('/api/state', (req, res) => {
  res.json({
    items: db.items,
    sales: db.sales,
    restocks: db.restocks,
    reconciliations: db.reconciliations,
    debts: db.debts,
    users: publicUsers(),
    serverTime: Date.now(),
  });
});

/* ---------------------------------------------------------------------
   ITEMS / INVENTORY
--------------------------------------------------------------------- */
app.post('/api/items', (req, res) => {
  const { name, brand, category, unit, price, stock, threshold } = req.body || {};
  if (!name || !brand || isNaN(parseFloat(price)) || isNaN(parseFloat(stock))) {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  const newItem = {
    id: nextId(), name, brand, category: category || 'Beer', unit: unit || 'bottle',
    price: parseFloat(price), stock: parseFloat(stock), threshold: parseFloat(threshold) || 5, image: null,
  };
  db.items.push(newItem);
  save();
  res.json({ ok: true, item: newItem });
});

app.post('/api/items/:id/restock', (req, res) => {
  const it = findItem(req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: 'Item not found.' });
  const qty = parseFloat(req.body?.qty);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid quantity.' });
  it.stock += qty;
  const restock = { id: nextId(), itemId: it.id, itemName: it.name, qty, time: Date.now() };
  db.restocks.push(restock);
  save();
  res.json({ ok: true, item: it, restock });
});

/* Butchery delivery is just a restock + optional price update on Goat Meat */
app.post('/api/butchery/delivery', (req, res) => {
  const meat = db.items.find(i => i.category === 'Kitchen' && i.name === 'Goat Meat');
  if (!meat) return res.status(404).json({ ok: false, error: 'Goat Meat item missing.' });
  const qty = parseFloat(req.body?.qty);
  const price = parseFloat(req.body?.price);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid delivery weight.' });
  meat.stock += qty;
  if (!isNaN(price) && price > 0) meat.price = price;
  const restock = { id: nextId(), itemId: meat.id, itemName: meat.name, qty, time: Date.now() };
  db.restocks.push(restock);
  save();
  res.json({ ok: true, item: meat, restock });
});

/* ---------------------------------------------------------------------
   SALES
--------------------------------------------------------------------- */
app.post('/api/sales', (req, res) => {
  const { itemId, qty, seller } = req.body || {};
  const it = findItem(itemId);
  if (!it) return res.status(404).json({ ok: false, error: 'Item not found.' });
  const q = parseFloat(qty);
  if (isNaN(q) || q <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid quantity.' });
  if (q > it.stock) return res.status(400).json({ ok: false, error: `Only ${it.stock} ${it.unit} left — cannot oversell.` });
  it.stock -= q;
  const sale = {
    id: nextId(), itemId: it.id, itemName: it.name, unit: it.unit,
    qty: q, price: it.price, total: q * it.price, seller: seller || 'Unknown', time: Date.now(),
  };
  db.sales.push(sale);
  save();
  res.json({ ok: true, sale, item: it });
});

/* ---------------------------------------------------------------------
   DEBTS  (seller records; admin sees + settles)
--------------------------------------------------------------------- */
app.post('/api/debts', (req, res) => {
  const { customerName, phone, amount, itemName, seller, note } = req.body || {};
  const amt = parseFloat(amount);
  if (!customerName || !phone || isNaN(amt) || amt <= 0) {
    return res.status(400).json({ ok: false, error: 'Customer name, phone, and a valid amount are required.' });
  }
  const debt = {
    id: nextId(), customerName, phone, amount: amt, itemName: itemName || '', note: note || '',
    seller: seller || 'Unknown', time: Date.now(), settled: false, settledTime: null,
  };
  db.debts.push(debt);
  save();
  res.json({ ok: true, debt });
});

app.post('/api/debts/:id/settle', (req, res) => {
  const debt = db.debts.find(d => d.id === Number(req.params.id));
  if (!debt) return res.status(404).json({ ok: false, error: 'Debt not found.' });
  debt.settled = true;
  debt.settledTime = Date.now();
  save();
  res.json({ ok: true, debt });
});

/* ---------------------------------------------------------------------
   RECONCILIATION
--------------------------------------------------------------------- */
app.post('/api/reconciliation', (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const countedBy = (req.body?.countedBy || '').trim() || 'Admin';
  let logged = 0;
  entries.forEach(({ itemId, physicalCount }) => {
    const it = findItem(itemId);
    const val = parseFloat(physicalCount);
    if (!it || isNaN(val)) return;
    const variance = +(val - it.stock).toFixed(2);
    const moneyVariance = +(variance * it.price).toFixed(2);
    db.reconciliations.push({
      id: nextId(), itemId: it.id, itemName: it.name,
      systemStock: it.stock, physicalCount: val, variance,
      price: it.price, moneyVariance, countedBy, time: Date.now(),
    });
    logged++;
  });
  if (logged === 0) return res.status(400).json({ ok: false, error: 'Enter at least one physical count.' });
  save();
  res.json({ ok: true, logged });
});

/* ---------------------------------------------------------------------
   STAFF
--------------------------------------------------------------------- */
app.post('/api/staff', (req, res) => {
  const { displayName, username, password } = req.body || {};
  if (!displayName || !username || !password) return res.status(400).json({ ok: false, error: 'Fill in all fields.' });
  if (db.users.some(u => u.username === username)) return res.status(409).json({ ok: false, error: 'That username is already taken.' });
  const user = { username, password, role: 'seller', displayName };
  db.users.push(user);
  save();
  res.json({ ok: true, user: { username, role: 'seller', displayName } });
});

app.delete('/api/staff/:username', (req, res) => {
  const before = db.users.length;
  db.users = db.users.filter(u => u.username !== req.params.username || u.role === 'admin');
  save();
  res.json({ ok: true, removed: before - db.users.length });
});

app.post('/api/staff/:username/password', (req, res) => {
  const user = db.users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ ok: false, error: 'Seller not found.' });
  const { password } = req.body || {};
  if (!password || !password.trim()) return res.status(400).json({ ok: false, error: 'Enter a new password.' });
  user.password = password.trim();
  save();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CHEERS Bar and Kitchen server running on port ${PORT}`));

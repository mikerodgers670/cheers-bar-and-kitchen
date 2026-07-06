# CHEERS Bar and Kitchen — Server Edition

A real Node.js server so the admin (owner) and sellers (staff) can be on
**different devices** — a laptop at the office, a phone at the counter — and
see the same stock, sales, and debts, live.

## What changed from the offline demo

- **Real backend.** Node + Express, with all data saved to `data/db.json` on
  disk. Every connected browser polls the server every 4 seconds, so a sale
  rung up on one phone shows up on the owner's laptop shortly after.
- **Renamed** to CHEERS Bar and Kitchen.
- **New theme** — Midnight Plum & Electric Gold, with a hot-pink accent for
  alerts/variance.
- **Real product photo** for Tusker Lager (a stable Wikimedia Commons file),
  plus a moody bar photo as a background on the login screen and page
  headers. The rest of the catalog uses themed icon art rather than
  hotlinked retailer photos, which tend to break or get blocked over time —
  happy to swap in more real photos for specific brands if you send me
  images to bundle locally instead of hotlinking.
- **Debts.** Sellers can record a customer's tab (name, phone, amount, what
  it was for) from their own "Debts" tab. The owner sees every debt from
  every seller in an admin "Debts" tab and can mark it settled.
- **Search bar fix.** Typing no longer knocks your cursor to the end of the
  box — the app now remembers focus and cursor position across re-renders
  and background syncs.
- **Low stock threshold** is now 5 for every item by default (still
  editable per item when you add it).

## Running it locally

```bash
cd cheers-server
npm install
npm start
```

Then open `http://localhost:3000` on the same computer, or
`http://<that-computer's-LAN-IP>:3000` from a phone on the same WiFi.

Default logins:
- Admin: `admin` / `admin1234`
- Seller: `seller` / `seller1234`

**Change these passwords** (via the Staff page, or by editing
`data/db.json`) before using this for real money.

## Deploying so it's reachable from anywhere (not just the same WiFi)

The easiest free option is **Render**:

1. Push this folder to a GitHub repo (or use Render's "Upload" option).
2. On [render.com](https://render.com), create a **New Web Service**,
   connect the repo.
3. Build command: `npm install`
   Start command: `npm start`
4. Deploy. Render gives you a public URL like
   `https://cheers-bar.onrender.com` — that's what every device (admin's
   laptop, staff phones) should open.

Any other Node host (Railway, Fly.io, a small VPS) works the same way —
`npm install && npm start`, expose port `3000` (or whatever `$PORT` the host
assigns).

## Important limitations to know about

- **Data persistence**: everything lives in `data/db.json` on the server's
  disk. On most free hosting tiers (including Render's free plan) the disk
  is wiped on redeploys/restarts — fine for testing, but for a permanent
  record you'll eventually want a real database or a paid plan with a
  persistent disk. Ask me and I can wire that up.
- **Security is intentionally minimal**: there's no encryption of
  passwords and no session tokens — same trust model as the offline demo,
  just now shared. Don't put anything highly sensitive in here without
  upgrading auth first.
- **Sync is polling-based** (every 4 seconds), not instant push — a sale
  on one device can take up to ~4 seconds to show elsewhere. Good enough
  for a bar counter; say the word if you want it truly instant
  (WebSockets).

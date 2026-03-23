const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join('/data', 'items.json');
const CHARS_FILE = path.join('/data', 'characters.json');
const IMG_CACHE_DIR = path.join('/data', 'imgcache');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/imgcache', express.static(IMG_CACHE_DIR));

const DEFAULT_CHARS = [
  { id: 1, name: 'Amazon', type: 'active', order: 1 },
  { id: 2, name: 'Necromancer', type: 'active', order: 2 },
  { id: 3, name: 'Paladin', type: 'active', order: 3 },
  { id: 4, name: 'Sorceress', type: 'active', order: 4 },
  { id: 5, name: 'Barbarian', type: 'active', order: 5 },
  { id: 6, name: 'Bank-01', type: 'bank', order: 6 },
  { id: 7, name: 'Bank-02', type: 'bank', order: 7 },
  { id: 8, name: 'Bank-03', type: 'bank', order: 8 },
  { id: 9, name: 'Bank-04', type: 'bank', order: 9 },
  { id: 10, name: 'Bank-05', type: 'bank', order: 10 },
  { id: 11, name: 'Bank-06', type: 'bank', order: 11 },
  { id: 12, name: 'Bank-07', type: 'bank', order: 12 },
  { id: 13, name: 'Bank-08', type: 'bank', order: 13 },
  { id: 14, name: 'Bank-09', type: 'bank', order: 14 },
  { id: 15, name: 'Bank-10', type: 'bank', order: 15 },
  { id: 16, name: 'Bank-11', type: 'bank', order: 16 },
  { id: 17, name: 'Bank-12', type: 'bank', order: 17 },
  { id: 18, name: 'Bank-13', type: 'bank', order: 18 },
  { id: 19, name: 'Bank-14', type: 'bank', order: 19 },
  { id: 20, name: 'Bank-15', type: 'bank', order: 20 },
  { id: 21, name: 'Bank-16', type: 'bank', order: 21 },
  { id: 22, name: 'Bank-17', type: 'bank', order: 22 },
  { id: 23, name: 'Bank-18', type: 'bank', order: 23 },
  { id: 24, name: 'Bank-19', type: 'bank', order: 24 },
  { id: 25, name: 'Bank-20', type: 'bank', order: 25 },
];

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function writeData(data) {
  fs.mkdirSync('/data', { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readChars() {
  try {
    if (!fs.existsSync(CHARS_FILE)) return DEFAULT_CHARS;
    const chars = JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8'));
    return chars.map((c, i) => ({ order: i + 1, ...c }));
  } catch { return DEFAULT_CHARS; }
}

function writeChars(data) {
  fs.mkdirSync('/data', { recursive: true });
  fs.writeFileSync(CHARS_FILE, JSON.stringify(data, null, 2));
}

function slugify(name) {
  return name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'D2R-Tracker/1.0' }, timeout: 8000 }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// Image sources to try in order
const IMG_SOURCES = [
  slug => `https://diablo2.io/items/images/unique/${slug}.png`,
  slug => `https://diablo2.io/items/images/set/${slug}.png`,
  slug => `https://diablo2.io/items/images/runeword/${slug}.png`,
  slug => `https://diablo2.io/items/images/normal/${slug}.png`,
  slug => `https://d2runewizard.com/images/item-icons/${slug}.png`,
];

// Image cache endpoint
app.get('/api/itemimg/:slug', async (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/g, '');
  fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
  const cachePath = path.join(IMG_CACHE_DIR, `${slug}.png`);

  if (fs.existsSync(cachePath)) {
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(cachePath);
  }

  for (const srcFn of IMG_SOURCES) {
    try {
      const result = await fetchUrl(srcFn(slug));
      if (result.status === 200 && result.body.length > 500) {
        fs.writeFileSync(cachePath, result.body);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Image-Source', srcFn(slug));
        return res.send(result.body);
      }
    } catch {}
  }

  res.status(404).json({ error: 'not found', slug });
});

// Items API
app.get('/api/items', (req, res) => res.json(readData()));

app.post('/api/items', (req, res) => {
  const items = readData();
  const item = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
  if (!item.char || !item.char.trim()) item.status = 'seeking';
  items.unshift(item);
  writeData(items);
  res.json(item);
});

app.put('/api/items/:id', (req, res) => {
  const items = readData();
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], ...req.body, id: req.params.id };
  writeData(items);
  res.json(items[idx]);
});

app.delete('/api/items/:id', (req, res) => {
  const items = readData().filter(i => i.id !== req.params.id);
  writeData(items);
  res.json({ ok: true });
});

// Characters API — sorted by order
app.get('/api/characters', (req, res) => {
  const chars = readChars();
  res.json([...chars].sort((a, b) => (a.order || 0) - (b.order || 0)));
});

app.put('/api/characters', (req, res) => {
  if (!req.body) {
    writeChars(DEFAULT_CHARS);
  } else {
    const chars = req.body.map((c, i) => ({ ...c, order: i + 1 }));
    writeChars(chars);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`D2R Tracker running on port ${PORT}`));

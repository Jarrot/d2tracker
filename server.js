const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join('/data', 'items.json');
const CHARS_FILE = path.join('/data', 'characters.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_CHARS = [
  { id: 1, name: 'Amazon', type: 'active' },
  { id: 2, name: 'Necromancer', type: 'active' },
  { id: 3, name: 'Paladin', type: 'active' },
  { id: 4, name: 'Sorceress', type: 'active' },
  { id: 5, name: 'Barbarian', type: 'active' },
  { id: 6, name: 'Bank-01', type: 'bank' },
  { id: 7, name: 'Bank-02', type: 'bank' },
  { id: 8, name: 'Bank-03', type: 'bank' },
  { id: 9, name: 'Bank-04', type: 'bank' },
  { id: 10, name: 'Bank-05', type: 'bank' },
  { id: 11, name: 'Bank-06', type: 'bank' },
  { id: 12, name: 'Bank-07', type: 'bank' },
  { id: 13, name: 'Bank-08', type: 'bank' },
  { id: 14, name: 'Bank-09', type: 'bank' },
  { id: 15, name: 'Bank-10', type: 'bank' },
  { id: 16, name: 'Bank-11', type: 'bank' },
  { id: 17, name: 'Bank-12', type: 'bank' },
  { id: 18, name: 'Bank-13', type: 'bank' },
  { id: 19, name: 'Bank-14', type: 'bank' },
  { id: 20, name: 'Bank-15', type: 'bank' },
  { id: 21, name: 'Bank-16', type: 'bank' },
  { id: 22, name: 'Bank-17', type: 'bank' },
  { id: 23, name: 'Bank-18', type: 'bank' },
  { id: 24, name: 'Bank-19', type: 'bank' },
  { id: 25, name: 'Bank-20', type: 'bank' },
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
    return JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8'));
  } catch { return DEFAULT_CHARS; }
}

function writeChars(data) {
  fs.mkdirSync('/data', { recursive: true });
  fs.writeFileSync(CHARS_FILE, JSON.stringify(data, null, 2));
}

// Items API
app.get('/api/items', (req, res) => res.json(readData()));

app.post('/api/items', (req, res) => {
  const items = readData();
  const item = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
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

// Characters API
app.get('/api/characters', (req, res) => res.json(readChars()));

app.put('/api/characters', (req, res) => {
  writeChars(req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`D2R Tracker running on port ${PORT}`));

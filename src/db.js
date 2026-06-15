const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      pseudo     TEXT NOT NULL,
      is_admin   BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      item_id    INTEGER,
      read       BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      price        NUMERIC(10,2),
      image        TEXT,
      url          TEXT,
      details      TEXT,
      options      TEXT,
      position     INTEGER DEFAULT 0,
      purchased    BOOLEAN DEFAULT false,
      purchased_by TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS participants (
      id         SERIAL PRIMARY KEY,
      item_id    INTEGER REFERENCES items(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(item_id, name)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      item_id    INTEGER REFERENCES items(id) ON DELETE CASCADE,
      author     TEXT NOT NULL,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE items ADD COLUMN IF NOT EXISTS details TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS options TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS purchased BOOLEAN DEFAULT false;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS purchased_by TEXT;
  `);

  // Generate invite token if not exists
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key='invite_token'`);
  if (!rows.length) {
    const token = require('crypto').randomBytes(24).toString('hex');
    await pool.query(`INSERT INTO settings (key,value) VALUES ('invite_token',$1)`, [token]);
  }

  console.log('✓ DB ready');
}

// ── Settings ──────────────────────────────────────────────────
async function getSetting(key) {
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key=$1`, [key]);
  return rows[0]?.value || null;
}
async function setSetting(key, value) {
  await pool.query(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [key, value]);
}

// ── Notifications ─────────────────────────────────────────────
async function addNotification(type, message, itemId = null) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (type, message, item_id) VALUES ($1,$2,$3) RETURNING *`,
    [type, message, itemId || null]
  );
  return rows[0];
}
async function getNotifications() {
  const { rows } = await pool.query(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`);
  return rows;
}
async function markAllRead() {
  await pool.query(`UPDATE notifications SET read=true WHERE read=false`);
}
async function getUnreadCount() {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM notifications WHERE read=false`);
  return parseInt(rows[0].count);
}

// ── Items ─────────────────────────────────────────────────────
const ITEM_SELECT = `
  SELECT
    i.*,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'id', p.id, 'name', p.name, 'user_id', p.user_id
      )) FILTER (WHERE p.id IS NOT NULL), '[]'
    ) AS participants,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'id', m.id, 'author', m.author, 'content', m.content,
        'created_at', m.created_at, 'user_id', m.user_id
      )) FILTER (WHERE m.id IS NOT NULL), '[]'
    ) AS messages
  FROM items i
  LEFT JOIN participants p ON p.item_id = i.id
  LEFT JOIN messages m ON m.item_id = i.id
`;

async function getItems(sort = 'position') {
  let orderBy = 'i.position ASC, i.created_at DESC';
  if (sort === 'price_asc')  orderBy = 'i.price ASC NULLS LAST, i.position ASC';
  if (sort === 'price_desc') orderBy = 'i.price DESC NULLS LAST, i.position ASC';

  const { rows } = await pool.query(`${ITEM_SELECT} GROUP BY i.id ORDER BY ${orderBy}`);
  return rows;
}

async function getItem(id) {
  const { rows } = await pool.query(`${ITEM_SELECT} WHERE i.id = $1 GROUP BY i.id`, [id]);
  return rows[0] || null;
}

async function createItem({ title, price, image, url, details, options }) {
  const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(position),0)+1 AS next FROM items`);
  const pos = maxRows[0].next;
  const { rows } = await pool.query(
    `INSERT INTO items (title,price,image,url,details,options,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title, price||null, image||null, url||null, details||null, options||null, pos]
  );
  return { ...rows[0], participants: [], messages: [] };
}

async function updateItem(id, { title, price, image, url, details, options }) {
  await pool.query(
    `UPDATE items SET title=$1,price=$2,image=$3,url=$4,details=$5,options=$6 WHERE id=$7`,
    [title, price||null, image||null, url||null, details||null, options||null, id]
  );
  return getItem(id);
}

async function setPurchased(id, purchased, purchasedBy) {
  await pool.query(
    `UPDATE items SET purchased=$1, purchased_by=$2 WHERE id=$3`,
    [purchased, purchased ? (purchasedBy || null) : null, id]
  );
  return getItem(id);
}

async function updatePositions(orderedIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(`UPDATE items SET position=$1 WHERE id=$2`, [i, orderedIds[i]]);
    }
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function deleteItem(id) {
  await pool.query('DELETE FROM items WHERE id=$1', [id]);
}

// ── Participants ──────────────────────────────────────────────
async function addParticipant(itemId, name, userId = null) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO participants (item_id, user_id, name) VALUES ($1,$2,$3)
       ON CONFLICT (item_id, name) DO NOTHING RETURNING *`,
      [itemId, userId||null, name]
    );
    return rows[0] || null;
  } catch { return null; }
}

async function removeParticipant(itemId, name, userId = null) {
  if (userId) {
    await pool.query(`DELETE FROM participants WHERE item_id=$1 AND user_id=$2`, [itemId, userId]);
  } else {
    await pool.query(`DELETE FROM participants WHERE item_id=$1 AND name=$2 AND user_id IS NULL`, [itemId, name]);
  }
}

// ── Messages ──────────────────────────────────────────────────
async function addMessage(itemId, author, content, userId = null) {
  await pool.query(
    `INSERT INTO messages (item_id, author, content, user_id) VALUES ($1,$2,$3,$4)`,
    [itemId, author, content, userId||null]
  );
}

async function deleteMessage(messageId) {
  await pool.query('DELETE FROM messages WHERE id=$1', [messageId]);
}

// ── Users ─────────────────────────────────────────────────────
async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  return rows[0] || null;
}

async function createUser({ email, password, pseudo, isAdmin = false }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email,password,pseudo,is_admin) VALUES ($1,$2,$3,$4) RETURNING *`,
    [email, password, pseudo, isAdmin]
  );
  return rows[0];
}

module.exports = {
  initDB, getSetting, setSetting,
  addNotification, getNotifications, markAllRead, getUnreadCount,
  getItems, getItem, createItem, updateItem, setPurchased, updatePositions, deleteItem,
  addParticipant, removeParticipant,
  addMessage, deleteMessage,
  getUserByEmail, createUser, pool
};

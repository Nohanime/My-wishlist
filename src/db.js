const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      email     TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      pseudo    TEXT NOT NULL,
      is_admin  BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      price      NUMERIC(10,2),
      image      TEXT,
      url        TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS participants (
      id         SERIAL PRIMARY KEY,
      item_id    INTEGER REFERENCES items(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(item_id, name)
    );
  `);
  console.log('✓ DB ready');
}

// Items avec leurs participants
async function getItems() {
  const { rows } = await pool.query(`
    SELECT
      i.*,
      COALESCE(
        json_agg(
          json_build_object('id', p.id, 'name', p.name, 'user_id', p.user_id)
          ORDER BY p.created_at
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS participants
    FROM items i
    LEFT JOIN participants p ON p.item_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `);
  return rows;
}

async function getItem(id) {
  const items = await getItems();
  return items.find(i => i.id === parseInt(id)) || null;
}

async function createItem({ title, price, image, url }) {
  const { rows } = await pool.query(
    `INSERT INTO items (title, price, image, url) VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, price || null, image || null, url || null]
  );
  return { ...rows[0], participants: [] };
}

async function deleteItem(id) {
  await pool.query('DELETE FROM items WHERE id = $1', [id]);
}

async function addParticipant(itemId, name, userId = null) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO participants (item_id, user_id, name) VALUES ($1, $2, $3)
       ON CONFLICT (item_id, name) DO NOTHING RETURNING *`,
      [itemId, userId || null, name]
    );
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

async function removeParticipant(itemId, name, userId = null) {
  if (userId) {
    await pool.query(
      `DELETE FROM participants WHERE item_id = $1 AND user_id = $2`,
      [itemId, userId]
    );
  } else {
    await pool.query(
      `DELETE FROM participants WHERE item_id = $1 AND name = $2 AND user_id IS NULL`,
      [itemId, name]
    );
  }
}

// Users
async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function createUser({ email, password, pseudo, isAdmin = false }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password, pseudo, is_admin) VALUES ($1, $2, $3, $4) RETURNING *`,
    [email, password, pseudo, isAdmin]
  );
  return rows[0];
}

module.exports = { initDB, getItems, getItem, createItem, deleteItem, addParticipant, removeParticipant, getUserByEmail, createUser, pool };

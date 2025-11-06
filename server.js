// ==============================
// 🔴 Red Roof Company – BattleID Backend
// ==============================
import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

// ==============================
// ⚙️ Express + CORS konfigurace
// ==============================
const app = express();

const allowedOrigins = [
  "https://redroofcomp.up.railway.app",
  "http://localhost:3000"
  "database4-production.up.railway.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("CORS blokován pro origin: " + origin));
  },
  credentials: true,
}));

app.use(express.json());

// ==============================
// 💾 PostgreSQL připojení
// ==============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==============================
// 🏗️ Inicializace tabulek
// ==============================
async function initTables() {
  try {
    // Hlavní tabulka pro operativce (BattleID)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS battle_ids (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        callsign TEXT,
        role TEXT,
        rank TEXT,
        specialty TEXT,
        ethnicity TEXT,
        dob DATE,
        strikes_level TEXT CHECK (strikes_level IN ('0','1','2','3','exterminato')) DEFAULT '0',
        commendations_count SMALLINT DEFAULT 0,
        notes TEXT,
        avatar TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Pochvaly
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commendations (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battle_ids(id) ON DELETE CASCADE,
        level SMALLINT NOT NULL CHECK (level IN (1,2,3)),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Log povýšení/degradací
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rank_changes (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battle_ids(id) ON DELETE CASCADE,
        change_type TEXT NOT NULL CHECK (change_type IN ('promotion','demotion')),
        from_rank TEXT,
        to_rank TEXT,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Katalog ocenění
    await pool.query(`
      CREATE TABLE IF NOT EXISTS awards_catalog (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        icon_url TEXT
      );
    `);

    // Udělená ocenění
    await pool.query(`
      CREATE TABLE IF NOT EXISTS awards (
        id SERIAL PRIMARY KEY,
        battle_id INTEGER NOT NULL REFERENCES battle_ids(id) ON DELETE CASCADE,
        award_id INTEGER NOT NULL REFERENCES awards_catalog(id) ON DELETE RESTRICT,
        notes TEXT,
        granted_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Všechny tabulky inicializovány.");
  } catch (err) {
    console.error("❌ Chyba při vytváření tabulek:", err.message);
  }
}
initTables();

// ==============================
// 🧭 Healthcheck
// ==============================
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "✅ RRC BattleID API běží", db: true, time: result.rows[0].now });
  } catch (err) {
    res.json({ status: "❌ DB not connected", db: false, error: err.message });
  }
});

// ==============================
// 👤 CRUD pro BattleID
// ==============================

// GET všechny
app.get("/api/battle", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM battle_ids ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET konkrétní ID
app.get("/api/battle/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM battle_ids WHERE id = $1", [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST – vytvoření nového BattleID
app.post("/api/battle", async (req, res) => {
  try {
    const { name, callsign, role, rank, specialty, ethnicity, dob, strikes_level, notes, avatar, status } = req.body;
    const result = await pool.query(`
      INSERT INTO battle_ids (name, callsign, role, rank, specialty, ethnicity, dob, strikes_level, notes, avatar, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [name, callsign, role, rank, specialty, ethnicity, dob, strikes_level || '0', notes, avatar, status || 'active']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT – úprava
app.put("/api/battle/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, callsign, role, rank, specialty, ethnicity, dob, strikes_level, notes, avatar, status } = req.body;
    const result = await pool.query(`
      UPDATE battle_ids SET
        name=$1, callsign=$2, role=$3, rank=$4, specialty=$5, ethnicity=$6,
        dob=$7, strikes_level=$8, notes=$9, avatar=$10, status=$11
      WHERE id=$12 RETURNING *;
    `, [name, callsign, role, rank, specialty, ethnicity, dob, strikes_level, notes, avatar, status, id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE – odstranění operativce
app.delete("/api/battle/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM battle_ids WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// 🏅 Ocenění
// ==============================

// GET katalog ocenění
app.get("/api/awards/catalog", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM awards_catalog ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST nové ocenění do katalogu
app.post("/api/awards/catalog", async (req, res) => {
  try {
    const { code, name, description, icon_url } = req.body;
    const result = await pool.query(`
      INSERT INTO awards_catalog (code, name, description, icon_url)
      VALUES ($1,$2,$3,$4) RETURNING *;
    `, [code, name, description, icon_url]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST – udělení ocenění konkrétnímu battle_id
app.post("/api/awards/:battle_id", async (req, res) => {
  try {
    const { battle_id } = req.params;
    const { award_id, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO awards (battle_id, award_id, notes)
      VALUES ($1,$2,$3) RETURNING *;
    `, [battle_id, award_id, notes]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET – ocenění jednoho operativce
app.get("/api/awards/:battle_id", async (req, res) => {
  try {
    const { battle_id } = req.params;
    const result = await pool.query(`
      SELECT a.*, c.name AS award_name, c.icon_url
      FROM awards a
      JOIN awards_catalog c ON a.award_id = c.id
      WHERE a.battle_id = $1
      ORDER BY granted_at DESC;
    `, [battle_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// 📈 Logy povýšení a pochval
// ==============================
app.post("/api/battle/:id/rank-change", async (req, res) => {
  try {
    const { id } = req.params;
    const { change_type, from_rank, to_rank, reason } = req.body;
    const result = await pool.query(`
      INSERT INTO rank_changes (battle_id, change_type, from_rank, to_rank, reason)
      VALUES ($1,$2,$3,$4,$5) RETURNING *;
    `, [id, change_type, from_rank, to_rank, reason]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/battle/:id/commendation", async (req, res) => {
  try {
    const { id } = req.params;
    const { level, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO commendations (battle_id, level, notes)
      VALUES ($1,$2,$3) RETURNING *;
    `, [id, level, notes]);
    await pool.query("UPDATE battle_ids SET commendations_count = commendations_count + 1 WHERE id=$1", [id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// 🚀 Server start
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ RRC BattleID backend běží na portu ${PORT}`);
});

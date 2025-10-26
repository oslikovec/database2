// ==============================
// 🔴 Red Roof Company – BattleIDs Backend
// ==============================

import express from "express";
import dotenv from "dotenv";
import pkg from "pg";
import cors from "cors";

dotenv.config();
const { Pool } = pkg;
const app = express();

// ====== PostgreSQL připojení ======
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================================
// 🧩 Automatická kontrola ID sekvence
// ============================================
async function ensureIdSequence() {
  try {
    console.log("🔍 Kontroluji ID sekvenci...");
    await pool.query(`
      DO $$
      DECLARE
        max_id integer;
      BEGIN
        SELECT COALESCE(MAX(id), 0) + 1 INTO max_id FROM battle_ids;
        -- vytvoř sekvenci, pokud ještě neexistuje
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'battle_ids_id_seq') THEN
          EXECUTE 'CREATE SEQUENCE battle_ids_id_seq START ' || max_id;
          EXECUTE 'ALTER TABLE battle_ids ALTER COLUMN id SET DEFAULT nextval(''battle_ids_id_seq'')';
        ELSE
          -- uprav sekvenci, pokud existuje
          EXECUTE 'ALTER SEQUENCE battle_ids_id_seq RESTART WITH ' || max_id;
        END IF;
      END
      $$;
    `);
    console.log("✅ ID sekvence ověřena nebo opravena");
  } catch (err) {
    console.error("⚠️ Nepodařilo se zkontrolovat sekvenci:", err);
  }
}

// Spustí kontrolu hned po připojení
ensureIdSequence();



// ====== Middleware ======
app.use(cors()); // aby frontend mohl komunikovat z jiné domény
app.use(express.json());

// ====== API ROUTES ======

// ✅ Test route
app.get("/", (req, res) => {
  res.json({ status: "✅ BattleIDs API running", db: !!process.env.DATABASE_URL });
});

// 📜 Načtení všech operativců
app.get("/api/battle", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM battle_ids ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Chyba SELECT:", err);
    res.status(500).json({ error: "Chyba při načítání dat" });
  }
});

// ➕ Vytvoření nového operativce
app.post("/api/battle", async (req, res) => {
  try {
    const { name, callsign, role, status, strikes, avatar, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO battle_ids (name, callsign, role, status, strikes, avatar, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, callsign, role, status, strikes || 0, avatar, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Chyba INSERT:", err);
    res.status(500).json({ error: "Chyba při ukládání operativce" });
  }
});

// ✏️ Úprava operativce
app.put("/api/battle/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, callsign, role, status, strikes, avatar, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE battle_ids
       SET name=$1, callsign=$2, role=$3, status=$4, strikes=$5, avatar=$6, notes=$7
       WHERE id=$8 RETURNING *`,
      [name, callsign, role, status, strikes, avatar, notes, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Chyba UPDATE:", err);
    res.status(500).json({ error: "Chyba při úpravě operativce" });
  }
});

// ❌ Smazání
app.delete("/api/battle/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM battle_ids WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Chyba DELETE:", err);
    res.status(500).json({ error: "Chyba při mazání operativce" });
  }
});

// ====== Start ======
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ RRC BattleIDs backend běží na portu ${PORT}`));

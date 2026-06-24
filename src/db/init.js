const fs   = require('fs');
const path = require('path');
const pool = require('../db');

async function init() {
  console.log('Initialisation du schéma PostgreSQL…');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Schéma créé avec succès.');
  } catch (err) {
    console.error('Erreur lors de la création du schéma :', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();

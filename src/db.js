const { Pool, types } = require('pg');
require('dotenv').config();

// Retourner les colonnes DATE comme chaînes 'YYYY-MM-DD' (évite la conversion UTC)
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'sirh_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.on('error', (err) => {
  console.error('Erreur inattendue sur le pool PostgreSQL', err);
  process.exit(-1);
});

module.exports = pool;
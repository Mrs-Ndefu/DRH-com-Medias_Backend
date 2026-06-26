const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

// ── Directions ────────────────────────────────────────────────

router.get('/directions', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM directions WHERE actif=TRUE ORDER BY libelle'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/directions', auth, async (req, res, next) => {
  try {
    const { code, libelle, description } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO directions (code,libelle,description) VALUES ($1,$2,$3) RETURNING *',
      [code, libelle, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/directions/:id', auth, async (req, res, next) => {
  try {
    const { libelle, description } = req.body;
    const { rows } = await pool.query(
      'UPDATE directions SET libelle=$1, description=$2 WHERE id=$3 RETURNING *',
      [libelle, description || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Direction introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/directions/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE directions SET actif=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Direction supprimée.' });
  } catch (err) { next(err); }
});

// ── Divisions ────────────────────────────────────────────────

router.get('/divisions', auth, async (req, res, next) => {
  try {
    const { direction_id } = req.query;
    const params = [];
    let where = 'WHERE dv.actif=TRUE';
    if (direction_id) { params.push(parseInt(direction_id)); where += ` AND dv.direction_id=$${params.length}`; }
    const { rows } = await pool.query(`
      SELECT dv.*, d.libelle AS direction_libelle
      FROM divisions dv
      LEFT JOIN directions d ON d.id = dv.direction_id
      ${where} ORDER BY dv.libelle
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/divisions', auth, async (req, res, next) => {
  try {
    const { code, libelle, direction_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO divisions (code,libelle,direction_id) VALUES ($1,$2,$3) RETURNING *',
      [code, libelle, direction_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/divisions/:id', auth, async (req, res, next) => {
  try {
    const { libelle, direction_id } = req.body;
    const { rows } = await pool.query(
      'UPDATE divisions SET libelle=$1, direction_id=$2 WHERE id=$3 RETURNING *',
      [libelle, direction_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Division introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/divisions/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE divisions SET actif=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Division supprimée.' });
  } catch (err) { next(err); }
});

// ── Bureaux ──────────────────────────────────────────────────

router.get('/bureaux', auth, async (req, res, next) => {
  try {
    const { division_id } = req.query;
    const params = [];
    let where = 'WHERE actif=TRUE';
    if (division_id) { params.push(parseInt(division_id)); where += ` AND division_id=$${params.length}`; }
    const { rows } = await pool.query(`SELECT * FROM bureaux ${where} ORDER BY libelle`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/bureaux', auth, async (req, res, next) => {
  try {
    const { code, libelle, division_id, direction_id, description } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO bureaux (code,libelle,division_id,direction_id,description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [code, libelle, division_id || null, direction_id || null, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── Grades ───────────────────────────────────────────────────

router.get('/grades', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM grades WHERE actif=TRUE ORDER BY categorie, libelle');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/grades', auth, async (req, res, next) => {
  try {
    const { libelle, categorie, corps } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO grades (libelle,categorie,corps) VALUES ($1,$2,$3) RETURNING *',
      [libelle, categorie, corps || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/grades/:id', auth, async (req, res, next) => {
  try {
    const { libelle, categorie, corps } = req.body;
    const { rows } = await pool.query(
      'UPDATE grades SET libelle=$1, categorie=$2, corps=$3 WHERE id=$4 RETURNING *',
      [libelle, categorie, corps || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Grade introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/grades/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE grades SET actif=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Grade supprimé.' });
  } catch (err) { next(err); }
});

// ── Fonctions ────────────────────────────────────────────────

router.get('/fonctions', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*, d.libelle AS direction_libelle
      FROM fonctions f
      LEFT JOIN directions d ON d.id = f.direction_id
      WHERE f.actif=TRUE ORDER BY f.libelle
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/fonctions', auth, async (req, res, next) => {
  try {
    const { libelle, direction_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO fonctions (libelle,direction_id) VALUES ($1,$2) RETURNING *',
      [libelle, direction_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/fonctions/:id', auth, async (req, res, next) => {
  try {
    const { libelle, direction_id } = req.body;
    const { rows } = await pool.query(
      'UPDATE fonctions SET libelle=$1, direction_id=$2 WHERE id=$3 RETURNING *',
      [libelle, direction_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Fonction introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/fonctions/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE fonctions SET actif=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Fonction supprimée.' });
  } catch (err) { next(err); }
});

module.exports = router;

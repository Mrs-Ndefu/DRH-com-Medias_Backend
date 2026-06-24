const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

const PAY_READ_ROLES  = ['ADMIN', 'DRH', 'SG'];
const PAY_WRITE_ROLES = ['ADMIN', 'DRH'];

function requireAccess(req, res, next) {
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const allowed = isWrite ? PAY_WRITE_ROLES : PAY_READ_ROLES;
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// ── Éléments de paie ─────────────────────────────────────────

router.get('/elements', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM elements_paie ORDER BY type, designation');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/elements', async (req, res, next) => {
  try {
    const { code, designation, type, base, taux, imposable } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO elements_paie (code,designation,type,base,taux,imposable) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [code, designation, type, base, taux || 0, imposable || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/elements/:id', async (req, res, next) => {
  try {
    const { designation, type, base, taux, imposable, actif } = req.body;
    const { rows } = await pool.query(
      'UPDATE elements_paie SET designation=$1,type=$2,base=$3,taux=$4,imposable=$5,actif=$6 WHERE id=$7 RETURNING *',
      [designation, type, base, taux || 0, imposable || false, actif !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Élément introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Bulletins de paie ─────────────────────────────────────────

router.get('/bulletins', async (req, res, next) => {
  try {
    const { mois, annee, statut, agent_id } = req.query;
    const params = [];
    const conditions = [];
    if (mois)     { params.push(parseInt(mois));     conditions.push(`b.mois=$${params.length}`); }
    if (annee)    { params.push(parseInt(annee));    conditions.push(`b.annee=$${params.length}`); }
    if (statut)   { params.push(statut);             conditions.push(`b.statut=$${params.length}`); }
    if (agent_id) { params.push(parseInt(agent_id)); conditions.push(`b.agent_id=$${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT b.*, a.nom_famille, a.prenom, a.matricule, a.grade, a.categorie,
             d.libelle AS direction_libelle
      FROM bulletins_paie b
      JOIN agents a ON a.id = b.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      ${where}
      ORDER BY a.nom_famille, b.annee DESC, b.mois DESC
    `, params);
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

router.get('/bulletins/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, a.nom_famille, a.prenom, a.matricule, a.grade, a.categorie,
             a.poste, a.nb_enfants, d.libelle AS direction_libelle
      FROM bulletins_paie b
      JOIN agents a ON a.id = b.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      WHERE b.id=$1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Bulletin introuvable.' });

    const { rows: lignes } = await pool.query(
      'SELECT * FROM bulletin_lignes WHERE bulletin_id=$1 ORDER BY type, designation',
      [req.params.id]
    );
    res.json({ ...rows[0], lignes });
  } catch (err) { next(err); }
});

// POST /api/payroll/bulletins/generer  — génère les bulletins pour un mois
router.post('/bulletins/generer', async (req, res, next) => {
  try {
    const { mois, annee } = req.body;
    const TAUX_INDICE = 2000, TAUX_INPS = 0.036, TAUX_CANAM = 0.015;

    const { rows: agents } = await pool.query(
      "SELECT * FROM agents WHERE actif=TRUE AND situation_admin='En activité'"
    );
    const client = await pool.connect();
    const created = [];
    try {
      await client.query('BEGIN');
      for (const a of agents) {
        const salaireBase  = (a.indice || 0) * TAUX_INDICE;
        const logement     = a.categorie === 'A' ? 150000 : a.categorie === 'B' ? 100000 : 80000;
        const famille      = (a.nb_enfants || 0) * 15000;
        const salaireBrut  = salaireBase + 40000 + logement + (famille > 0 ? famille : 0);
        const cotINPS      = Math.round(salaireBase * TAUX_INPS);
        const cotCANAM     = Math.round(salaireBase * TAUX_CANAM);
        const impot        = calculIR(salaireBase);
        const totalRet     = cotINPS + cotCANAM + impot;
        const salaireNet   = salaireBrut - totalRet;
        const reference    = `BUL-${annee}-${String(mois).padStart(2,'0')}-${a.matricule}`;
        const periode      = `${MOIS[mois-1]} ${annee}`;

        const { rows: bul } = await client.query(`
          INSERT INTO bulletins_paie
            (agent_id,mois,annee,periode,indice,salaire_base,salaire_brut,total_retenues,salaire_net,
             mode_paiement,banque,num_compte,statut,reference,date_generation)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CALCULE',$13,CURRENT_DATE)
          ON CONFLICT (agent_id,mois,annee) DO NOTHING
          RETURNING *
        `, [a.id, mois, annee, periode, a.indice, salaireBase, salaireBrut, totalRet, salaireNet,
            a.banque ? 'VIREMENT' : 'ESPECES', a.banque || null, a.rib || null, reference]);

        if (bul.length) {
          const bulId = bul[0].id;
          const lignes = [
            { code:'SB',   designation:'Salaire de base',         type:'PRIME',      montant: salaireBase },
            { code:'ILG',  designation:'Indemnité de logement',   type:'INDEMNITE',  montant: logement },
            { code:'ITR',  designation:'Indemnité de transport',  type:'INDEMNITE',  montant: 40000 },
            ...(famille > 0 ? [{ code:'IFA', designation:'Indemnité familiale', type:'INDEMNITE', montant: famille }] : []),
            { code:'INPS', designation:'Cotisation INPS (3,6%)',  type:'COTISATION', montant: cotINPS },
            { code:'CAN',  designation:'Cotisation CANAM (1,5%)', type:'COTISATION', montant: cotCANAM },
            { code:'IR',   designation:"Impôt sur le revenu",     type:'RETENUE',    montant: impot },
          ];
          for (const l of lignes) {
            await client.query(
              'INSERT INTO bulletin_lignes (bulletin_id,element_code,designation,type,montant) VALUES ($1,$2,$3,$4,$5)',
              [bulId, l.code, l.designation, l.type, l.montant]
            );
          }
          created.push(bul[0]);
        }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.status(201).json({ message: `${created.length} bulletin(s) généré(s).`, nb_bulletins_generes: created.length });
  } catch (err) { next(err); }
});

// PATCH /api/payroll/bulletins/:id/statut
router.patch('/bulletins/:id/statut', async (req, res, next) => {
  try {
    const { statut } = req.body;
    const allowed = ['CALCULE','VALIDE','VIRE','REJETE'];
    if (!allowed.includes(statut)) return res.status(400).json({ message: 'Statut invalide.' });
    const { rows } = await pool.query(
      'UPDATE bulletins_paie SET statut=$1, date_validation=CASE WHEN $1=\'VALIDE\' THEN CURRENT_DATE ELSE date_validation END, updated_at=NOW() WHERE id=$2 RETURNING *',
      [statut, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Bulletin introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Virements ─────────────────────────────────────────────────

router.get('/virements', async (req, res, next) => {
  try {
    const { mois, annee } = req.query;
    const params = [];
    const cond = [];
    if (mois)  { params.push(parseInt(mois));  cond.push(`mois=$${params.length}`); }
    if (annee) { params.push(parseInt(annee)); cond.push(`annee=$${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM virements ${where} ORDER BY created_at DESC`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/virements', async (req, res, next) => {
  try {
    const { reference, mois, annee, periode, date_virement, montant_total, nb_beneficiaires, banque } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO virements (reference,mois,annee,periode,date_virement,montant_total,nb_beneficiaires,banque)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [reference, mois, annee, periode || null, date_virement || null, montant_total, nb_beneficiaires, banque || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/virements/:id/statut', async (req, res, next) => {
  try {
    const { statut, fichier } = req.body;
    const { rows } = await pool.query(
      'UPDATE virements SET statut=$1, fichier=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [statut, fichier || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Virement introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Déclarations sociales ─────────────────────────────────────

router.get('/declarations', async (req, res, next) => {
  try {
    const { mois, annee, type } = req.query;
    const params = [];
    const cond = [];
    if (mois)  { params.push(parseInt(mois));  cond.push(`mois=$${params.length}`); }
    if (annee) { params.push(parseInt(annee)); cond.push(`annee=$${params.length}`); }
    if (type)  { params.push(type);            cond.push(`type=$${params.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM declarations_sociales ${where} ORDER BY annee DESC, mois DESC, type`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/declarations', async (req, res, next) => {
  try {
    const { type, libelle, periode, mois, annee, montant, cotisation_patronale, montant_total, date_limite } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO declarations_sociales (type,libelle,periode,mois,annee,montant,cotisation_patronale,montant_total,date_limite)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [type, libelle, periode || null, mois || null, annee || null, montant, cotisation_patronale || 0, montant_total, date_limite || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/declarations/:id/statut', async (req, res, next) => {
  try {
    const { statut, reference } = req.body;
    const { rows } = await pool.query(`
      UPDATE declarations_sociales SET
        statut=$1, reference=$2,
        date_declaration=CASE WHEN $1='SOUMISE' THEN CURRENT_DATE ELSE date_declaration END,
        updated_at=NOW()
      WHERE id=$3 RETURNING *
    `, [statut, reference || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Déclaration introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Dashboard paie ────────────────────────────────────────────

router.get('/dashboard', async (req, res, next) => {
  try {
    const { mois, annee } = req.query;
    const params = [parseInt(mois), parseInt(annee)];
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                              AS nb_bulletins,
        COUNT(*) FILTER (WHERE statut='VIRE')                AS nb_vires,
        COUNT(*) FILTER (WHERE statut='VALIDE')              AS nb_valides,
        COUNT(*) FILTER (WHERE statut='CALCULE')             AS nb_calcules,
        COALESCE(SUM(salaire_net) FILTER (WHERE statut IN ('VALIDE','VIRE')), 0) AS masse_salariale
      FROM bulletins_paie WHERE mois=$1 AND annee=$2
    `, params);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// helpers locaux
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function calculIR(revenu) {
  if (revenu <= 150000)  return 0;
  if (revenu <= 300000)  return Math.round((revenu - 150000) * 0.05);
  if (revenu <= 600000)  return Math.round(7500 + (revenu - 300000) * 0.10);
  if (revenu <= 1000000) return Math.round(37500 + (revenu - 600000) * 0.15);
  if (revenu <= 2000000) return Math.round(97500 + (revenu - 1000000) * 0.22);
  return Math.round(317500 + (revenu - 2000000) * 0.30);
}

module.exports = router;

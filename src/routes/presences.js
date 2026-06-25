const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

const PRES_ROLES = ['ADMIN', 'DRH', 'SUPER_USER', 'RH'];
function requireAccess(req, res, next) {
  if (!PRES_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// GET /api/presences?date=YYYY-MM-DD&agent_id=&direction_id=
router.get('/', async (req, res, next) => {
  try {
    const { date, agent_id, direction_id, mois, annee } = req.query;
    const params = [];
    const conditions = [];

    if (date)         { params.push(date);                   conditions.push(`p.date_presence=$${params.length}`); }
    if (agent_id)     { params.push(parseInt(agent_id));     conditions.push(`p.agent_id=$${params.length}`); }
    if (direction_id) { params.push(parseInt(direction_id)); conditions.push(`a.direction_id=$${params.length}`); }
    if (mois && annee) {
      params.push(parseInt(mois), parseInt(annee));
      conditions.push(`EXTRACT(MONTH FROM p.date_presence)=$${params.length-1} AND EXTRACT(YEAR FROM p.date_presence)=$${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT p.*, a.nom_famille, a.prenom, a.matricule, d.libelle AS direction_libelle
      FROM presences p
      JOIN agents a ON a.id = p.agent_id
      LEFT JOIN directions d ON d.id = a.direction_id
      ${where}
      ORDER BY p.date_presence DESC, a.nom_famille
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Règles horaires ──────────────────────────────────────────────────
const ENTREE_MIN    = '06:00'; // heure d'ouverture
const ENTREE_LIMITE = '09:45'; // après → RETARD
const SORTIE_MIN    = '15:45'; // avant → sortie anticipée

function heureToMin(h) {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

// POST /api/presences/pointer  (scan biométrique ou manuel)
router.post('/pointer', async (req, res, next) => {
  try {
    const { agent_id, type } = req.body; // type: 'IN' | 'OUT'
    if (!agent_id || !type) return res.status(400).json({ message: 'agent_id et type requis.' });

    const now = new Date();
    const datePresence = now.toISOString().split('T')[0];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const heureActuelle = `${hh}:${mm}:${ss}`;
    const heureHHMM     = `${hh}:${mm}`;

    const agentRes = await pool.query(
      'SELECT nom_famille, prenom, matricule, poste FROM agents WHERE id=$1',
      [agent_id]
    );
    if (!agentRes.rows.length) return res.status(404).json({ message: 'Agent introuvable.' });
    const agent = agentRes.rows[0];

    if (type === 'IN') {
      const enRetard = heureToMin(heureHHMM) > heureToMin(ENTREE_LIMITE);
      const trop_tot = heureToMin(heureHHMM) < heureToMin(ENTREE_MIN);
      if (trop_tot) {
        return res.status(400).json({ message: `Pointage refusé : heure d'ouverture à ${ENTREE_MIN}.` });
      }
      const statut = enRetard ? 'RETARD' : 'PRESENT';
      const obs    = enRetard ? `Arrivée tardive à ${heureHHMM} (limite ${ENTREE_LIMITE})` : null;

      const { rows } = await pool.query(`
        INSERT INTO presences (agent_id, date_presence, heure_entree, mode_pointage, statut, observation)
        VALUES ($1,$2,$3,'BIOMETRIQUE',$4,$5)
        ON CONFLICT (agent_id, date_presence)
        DO UPDATE SET heure_entree=$3, statut=$4, observation=$5, mode_pointage='BIOMETRIQUE'
        RETURNING *
      `, [agent_id, datePresence, heureActuelle, statut, obs]);

      return res.json({ ...rows[0], ...agent, retard: enRetard, sortie_anticipee: false });
    }

    if (type === 'OUT') {
      const avantLimite = heureToMin(heureHHMM) < heureToMin(SORTIE_MIN);
      const obs = avantLimite ? `Sortie anticipée à ${heureHHMM} (minimum ${SORTIE_MIN})` : null;

      const { rows } = await pool.query(`
        UPDATE presences SET heure_sortie=$1, observation=COALESCE($2, observation), mode_pointage='BIOMETRIQUE'
        WHERE agent_id=$3 AND date_presence=$4
        RETURNING *
      `, [heureActuelle, obs, agent_id, datePresence]);

      if (!rows.length) {
        return res.status(404).json({ message: "Aucune entrée enregistrée aujourd'hui pour cet agent." });
      }
      return res.json({ ...rows[0], ...agent, retard: false, sortie_anticipee: avantLimite });
    }

    res.status(400).json({ message: 'type doit être IN ou OUT.' });
  } catch (err) { next(err); }
});

// POST /api/presences  (pointage manuel ou import)
router.post('/', async (req, res, next) => {
  try {
    const { agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut, observation } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO presences (agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut, observation)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (agent_id, date_presence)
      DO UPDATE SET heure_entree=$3, heure_sortie=$4, mode_pointage=$5, statut=$6, observation=$7
      RETURNING *
    `, [agent_id, date_presence, heure_entree || null, heure_sortie || null,
        mode_pointage || 'MANUEL', statut || 'PRESENT', observation || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/presences/batch  (plusieurs pointages en une fois)
router.post('/batch', async (req, res, next) => {
  try {
    const { pointages } = req.body; // [{agent_id, date_presence, heure_entree, heure_sortie, statut}]
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const p of pointages) {
        const { rows } = await client.query(`
          INSERT INTO presences (agent_id, date_presence, heure_entree, heure_sortie, mode_pointage, statut)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (agent_id, date_presence)
          DO UPDATE SET heure_entree=$3, heure_sortie=$4, statut=$6
          RETURNING *
        `, [p.agent_id, p.date_presence, p.heure_entree || null, p.heure_sortie || null,
            p.mode_pointage || 'BIOMETRIQUE', p.statut || 'PRESENT']);
        results.push(rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ count: results.length, data: results });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

// GET /api/presences/rapport  — statistiques mensuelles
router.get('/rapport', async (req, res, next) => {
  try {
    const { mois, annee, direction_id } = req.query;
    const params = [parseInt(mois), parseInt(annee)];
    let dirCondition = '';
    if (direction_id) { params.push(parseInt(direction_id)); dirCondition = `AND a.direction_id=$${params.length}`; }

    const { rows } = await pool.query(`
      SELECT
        a.id AS agent_id, a.matricule, a.nom_famille, a.prenom,
        d.libelle AS direction,
        COUNT(*) FILTER (WHERE p.statut='PRESENT')  AS nb_presents,
        COUNT(*) FILTER (WHERE p.statut='ABSENT')   AS nb_absents,
        COUNT(*) FILTER (WHERE p.statut='RETARD')   AS nb_retards,
        COUNT(*) FILTER (WHERE p.statut='CONGE')    AS nb_conges
      FROM agents a
      LEFT JOIN presences p ON p.agent_id=a.id
        AND EXTRACT(MONTH FROM p.date_presence)=$1
        AND EXTRACT(YEAR  FROM p.date_presence)=$2
      LEFT JOIN directions d ON d.id=a.direction_id
      WHERE a.actif=TRUE ${dirCondition}
      GROUP BY a.id, a.matricule, a.nom_famille, a.prenom, d.libelle
      ORDER BY a.nom_famille
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Requête commune pour les exports ─────────────────────────────────────────
async function queryPresences(date, direction_id) {
  const params = [];
  const conditions = [];
  if (date)         { params.push(date);                  conditions.push(`p.date_presence=$${params.length}`); }
  if (direction_id) { params.push(parseInt(direction_id)); conditions.push(`a.direction_id=$${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`
    SELECT p.*, a.nom_famille, a.prenom, a.matricule, a.poste, d.libelle AS direction_libelle
    FROM presences p
    JOIN agents a ON a.id = p.agent_id
    LEFT JOIN directions d ON d.id = a.direction_id
    ${where}
    ORDER BY a.nom_famille, a.prenom
  `, params);
  return rows;
}

function calcDuree(entree, sortie) {
  if (!entree || !sortie) return '—';
  const [hE, mE] = entree.split(':').map(Number);
  const [hS, mS] = sortie.split(':').map(Number);
  const diff = hS * 60 + mS - (hE * 60 + mE);
  if (diff <= 0) return '—';
  return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
}

function fmtDateFR(dateStr) {
  if (!dateStr) return 'Toutes dates';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// GET /api/presences/export/excel
router.get('/export/excel', async (req, res, next) => {
  try {
    const { date, direction_id } = req.query;
    const rows = await queryPresences(date, direction_id);

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIRH MCM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Présences', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });

    // ── Titre ──
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = 'MINISTÈRE DE LA COMMUNICATION ET DES MÉDIAS — MALI';
    ws.getCell('A1').font  = { bold: true, size: 13, color: { argb: 'FF1565C0' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:I2');
    ws.getCell('A2').value = `Rapport de présences — ${fmtDateFR(date)}`;
    ws.getCell('A2').font  = { italic: true, size: 11 };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]);

    // ── En-têtes ──
    const hr = ws.addRow(['Matricule', 'Nom', 'Prénom', 'Direction/Service', "Heure d'entrée", 'Heure de sortie', 'Durée', 'Statut', 'Observation']);
    hr.height = 20;
    hr.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });

    // ── Données ──
    rows.forEach((p, i) => {
      const row = ws.addRow([
        p.matricule,
        p.nom_famille,
        p.prenom,
        p.direction_libelle || '—',
        p.heure_entree ? p.heure_entree.substring(0, 5) : '—',
        p.heure_sortie ? p.heure_sortie.substring(0, 5) : '—',
        calcDuree(p.heure_entree, p.heure_sortie),
        p.statut,
        p.observation || '',
      ]);

      const bg = p.statut === 'RETARD'
        ? { fgColor: { argb: 'FFFFF9C4' } }   // jaune pâle
        : i % 2 === 0
          ? { fgColor: { argb: 'FFF8F9FA' } }  // gris très clair
          : { fgColor: { argb: 'FFFFFFFF' } };

      row.eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', ...bg };
        cell.alignment = { vertical: 'middle' };
        cell.font      = { size: 10 };
      });

      if (p.statut === 'RETARD') {
        row.getCell(8).font = { bold: true, color: { argb: 'FFE65100' }, size: 10 };
      }
    });

    // ── Récapitulatif ──
    ws.addRow([]);
    const nbPresents = rows.filter(r => r.statut === 'PRESENT').length;
    const nbRetards  = rows.filter(r => r.statut === 'RETARD').length;
    const nbSortis   = rows.filter(r => r.heure_sortie).length;
    const sumRow = ws.addRow([
      `Total : ${rows.length}  |  À l'heure : ${nbPresents}  |  Retards : ${nbRetards}  |  Sorties enregistrées : ${nbSortis}`,
    ]);
    ws.mergeCells(`A${sumRow.number}:I${sumRow.number}`);
    sumRow.getCell(1).font      = { bold: true, italic: true, size: 10 };
    sumRow.getCell(1).alignment = { horizontal: 'right' };

    const genRow = ws.addRow([`Généré le ${new Date().toLocaleString('fr-FR')}`]);
    ws.mergeCells(`A${genRow.number}:I${genRow.number}`);
    genRow.getCell(1).font      = { italic: true, size: 9, color: { argb: 'FF888888' } };
    genRow.getCell(1).alignment = { horizontal: 'right' };

    // ── Largeurs de colonnes ──
    ws.columns = [
      { width: 12 }, { width: 20 }, { width: 18 }, { width: 28 },
      { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 45 },
    ];

    const filename = `presences_${date || new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /api/presences/export/pdf
router.get('/export/pdf', async (req, res, next) => {
  try {
    const { date, direction_id } = req.query;
    const rows = await queryPresences(date, direction_id);
    const dateLabel = fmtDateFR(date).toUpperCase();

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 35 });

    const filename = `presences_${date || new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W = doc.page.width  - 70;  // zone utile
    const L = 35;                    // marge gauche

    // ── En-tête ──
    doc.rect(L, 30, W, 52).fill('#1565C0').fillColor('white');
    doc.fontSize(13).font('Helvetica-Bold')
       .text('MINISTÈRE DE LA COMMUNICATION ET DES MÉDIAS — MALI', L + 8, 38, { width: W - 16, align: 'center' });
    doc.fontSize(10).font('Helvetica')
       .text(`Rapport de présences du ${dateLabel}`, L + 8, 56, { width: W - 16, align: 'center' });

    doc.fillColor('black');
    let y = 100;

    // ── Colonnes ──
    const cols = [
      { h: 'Matricule',    x: L,       w: 65  },
      { h: 'Nom',          x: L+65,    w: 100 },
      { h: 'Prénom',       x: L+165,   w: 90  },
      { h: 'Direction',    x: L+255,   w: 140 },
      { h: 'Entrée',       x: L+395,   w: 55  },
      { h: 'Sortie',       x: L+450,   w: 55  },
      { h: 'Durée',        x: L+505,   w: 50  },
      { h: 'Statut',       x: L+555,   w: 65  },
    ];

    // En-têtes de tableau
    doc.rect(L, y - 3, W, 18).fill('#1976D2').fillColor('white');
    doc.fontSize(9).font('Helvetica-Bold');
    cols.forEach(c => doc.text(c.h, c.x + 2, y, { width: c.w - 4, align: 'center' }));
    y += 18;
    doc.fillColor('black');

    // Lignes de données
    const rowH = 16;
    rows.forEach((p, i) => {
      if (y + rowH > doc.page.height - 60) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 35 });
        y = 50;
        // Re-draw header
        doc.rect(L, y - 3, W, 18).fill('#1976D2').fillColor('white');
        doc.fontSize(9).font('Helvetica-Bold');
        cols.forEach(c => doc.text(c.h, c.x + 2, y, { width: c.w - 4, align: 'center' }));
        y += 18;
        doc.fillColor('black');
      }

      const bg = p.statut === 'RETARD' ? '#FFF9C4' : i % 2 === 0 ? '#F5F5F5' : '#FFFFFF';
      doc.rect(L, y - 2, W, rowH).fill(bg);

      const entree = p.heure_entree ? p.heure_entree.substring(0, 5) : '—';
      const sortie = p.heure_sortie ? p.heure_sortie.substring(0, 5) : '—';
      const duree  = calcDuree(p.heure_entree, p.heure_sortie);

      doc.fillColor(p.statut === 'RETARD' ? '#BF360C' : '#212121').fontSize(9).font('Helvetica');
      doc.text(p.matricule      || '—', cols[0].x + 2, y, { width: cols[0].w - 4 });
      doc.text(p.nom_famille    || '—', cols[1].x + 2, y, { width: cols[1].w - 4 });
      doc.text(p.prenom         || '—', cols[2].x + 2, y, { width: cols[2].w - 4 });
      doc.text(p.direction_libelle || '—', cols[3].x + 2, y, { width: cols[3].w - 4 });
      doc.text(entree,              cols[4].x + 2, y, { width: cols[4].w - 4, align: 'center' });
      doc.text(sortie,              cols[5].x + 2, y, { width: cols[5].w - 4, align: 'center' });
      doc.text(duree,               cols[6].x + 2, y, { width: cols[6].w - 4, align: 'center' });

      if (p.statut === 'RETARD') {
        doc.fillColor('#BF360C').font('Helvetica-Bold');
      }
      doc.text(p.statut, cols[7].x + 2, y, { width: cols[7].w - 4, align: 'center' });

      doc.fillColor('black').font('Helvetica');
      y += rowH;
    });

    // ── Ligne de séparation ──
    y += 4;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).stroke('#CCCCCC');
    y += 8;

    // ── Récapitulatif ──
    const nbPresents = rows.filter(r => r.statut === 'PRESENT').length;
    const nbRetards  = rows.filter(r => r.statut === 'RETARD').length;
    const nbSortis   = rows.filter(r => r.heure_sortie).length;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
       .text(
         `Total : ${rows.length} agents  ·  À l'heure : ${nbPresents}  ·  Retards : ${nbRetards}  ·  Sorties : ${nbSortis}`,
         L, y, { width: W, align: 'right' }
       );

    // ── Pied de page ──
    const footerY = doc.page.height - 30;
    doc.fontSize(8).font('Helvetica').fillColor('#888888')
       .text(`Généré le ${new Date().toLocaleString('fr-FR')} par le SIRH du Ministère de la Communication et des Médias`, L, footerY, { width: W });

    doc.end();
  } catch (err) { next(err); }
});

module.exports = router;

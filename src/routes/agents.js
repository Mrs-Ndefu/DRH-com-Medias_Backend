const path   = require('path');
const fs     = require('fs');
const router = require('express').Router();
const multer = require('multer');
const pool   = require('../db');
const auth   = require('../middleware/auth');

const PHOTOS_DIR = path.join(__dirname, '../../uploads/agents');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `agent-${req.params.id}-${Date.now()}${ext}`);
  },
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images sont acceptées (JPEG, PNG, WEBP).'));
  },
});

const AGENTS_ROLES = ['ADMIN', 'DRH', 'RH'];
function requireAccess(req, res, next) {
  if (!AGENTS_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé.' });
  }
  next();
}
router.use(auth, requireAccess);

// GET /api/agents  — liste avec pagination et recherche
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', situation_admin, direction_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['a.actif = TRUE'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.nom_famille ILIKE $${params.length} OR a.prenom ILIKE $${params.length} OR a.matricule ILIKE $${params.length})`);
    }
    if (situation_admin) {
      params.push(situation_admin);
      conditions.push(`a.situation_admin = $${params.length}`);
    }
    if (direction_id) {
      params.push(parseInt(direction_id));
      conditions.push(`a.direction_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const { rows } = await pool.query(`
      SELECT a.id, a.matricule, a.nom_famille, a.prenom, a.sexe,
             a.grade, a.categorie, a.corps, a.indice, a.poste, a.situation_admin,
             a.date_recrutement, a.telephone_mobile, a.email_pro, a.photo_url,
             d.libelle AS direction_libelle
      FROM agents a
      LEFT JOIN directions d ON d.id = a.direction_id
      ${where}
      ORDER BY a.nom_famille, a.prenom
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM agents a ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({ data: rows, total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/agents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, d.libelle AS direction_libelle, d.code AS direction_code
      FROM agents a
      LEFT JOIN directions d ON d.id = a.direction_id
      WHERE a.id = $1 AND a.actif = TRUE
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Agent introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/agents
router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO agents (
        matricule, nom_famille, prenom, prenom_secondaire, nom_jeune_fille,
        sexe, date_naissance, lieu_naissance, region_naissance, pays_naissance,
        nationalite, situation_familiale, nb_enfants, groupe_sanguin,
        type_piece, numero_piece, date_expiration_piece,
        adresse_rue, adresse_ville, adresse_region, adresse_pays,
        telephone_fixe, telephone_mobile, email_pro, email_personnel,
        urgence_nom, urgence_relation, urgence_telephone,
        corps, grade, categorie, classe, echelon, indice,
        date_recrutement, date_prise_fonction, date_titularisation,
        mode_recrutement, numero_decision, date_decision, reference_jo, ministere_origine,
        type_contrat, situation_admin, numero_cnss, numero_retraite, rib, banque,
        ministere_affectation, direction_id, service, bureau, poste, lieu_affectation, region_affectation,
        niveau_etudes, diplome, specialite, etablissement, pays_formation, annee_obtention, mention,
        autre_nationalite, num_passeport, adresse_code_postal, direction, sous_direction
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
        $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
        $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,
        $63,$64,$65,$66,$67
      ) RETURNING *
    `, [
      b.matricule, b.nomFamille || b.nom_famille, b.prenom, b.prenomSecondaire || null, b.nomJeuneFile || null,
      b.sexe, b.dateNaissance || null, b.lieuNaissance || null, b.regionNaissance || null, b.paysNaissance || 'Mali',
      b.nationalite || 'Malienne', b.situationFamiliale || null, parseInt(b.nbEnfants || 0), b.groupeSanguin || null,
      b.typePiece || null, b.numeroPiece || null, b.dateExpiration || null,
      b.adresseRue || null, b.adresseVille || null, b.adresseRegion || null, b.adressePays || 'Mali',
      b.telephoneFixe || null, b.telephoneMobile || null, b.emailPro || null, b.emailPersonnel || null,
      b.urgenceNom || null, b.urgenceRelation || null, b.urgenceTelephone || null,
      b.corps || null, b.grade || null, b.categorie || null, b.classe || null, parseInt(b.echelon || 0) || null, parseInt(b.indice || 0) || null,
      b.dateRecrutement || null, b.datePriseFonction || null, b.dateTitularisation || null,
      b.modeRecrutement || null, b.numeroDecision || null, b.dateDecision || null, b.referenceJO || null, b.ministereDOrigine || null,
      b.typeContrat || null, b.situationAdmin || 'En activité', b.numeroCnss || null, b.numeroRetraite || null, b.rib || null, b.banque || null,
      b.ministereAffectation || null, b.direction_id || null, b.service || null, b.bureau || null, b.poste || null, b.lieuAffectation || null, b.regionAffectation || null,
      b.niveauEtudes || null, b.diplome || null, b.specialite || null, b.etablissement || null, b.paysFormation || null, parseInt(b.anneeObtention) || null, b.mention || null,
      b.autreNationalite || null, b.numPasseport || null, b.adresseCodePostal || null, b.direction || null, b.sousDirection || null,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE agents SET
        matricule=$1,
        nom_famille=$2, prenom=$3, prenom_secondaire=$4, nom_jeune_fille=$5,
        sexe=$6, date_naissance=$7, lieu_naissance=$8, region_naissance=$9, pays_naissance=$10,
        nationalite=$11, situation_familiale=$12, nb_enfants=$13, groupe_sanguin=$14,
        type_piece=$15, numero_piece=$16, date_expiration_piece=$17,
        adresse_rue=$18, adresse_ville=$19, adresse_region=$20, adresse_pays=$21, adresse_code_postal=$22,
        telephone_fixe=$23, telephone_mobile=$24, email_pro=$25, email_personnel=$26,
        urgence_nom=$27, urgence_relation=$28, urgence_telephone=$29,
        corps=$30, grade=$31, categorie=$32, classe=$33, echelon=$34, indice=$35,
        date_recrutement=$36, date_prise_fonction=$37, date_titularisation=$38,
        mode_recrutement=$39, numero_decision=$40, date_decision=$41, reference_jo=$42, ministere_origine=$43,
        type_contrat=$44, situation_admin=$45,
        numero_cnss=$46, numero_retraite=$47, rib=$48, banque=$49,
        ministere_affectation=$50, direction_id=$51, direction=$52, sous_direction=$53,
        service=$54, bureau=$55, poste=$56, lieu_affectation=$57, region_affectation=$58,
        niveau_etudes=$59, diplome=$60, specialite=$61, etablissement=$62,
        pays_formation=$63, annee_obtention=$64, mention=$65,
        autre_nationalite=$66, num_passeport=$67,
        updated_at=NOW()
      WHERE id=$68 AND actif=TRUE RETURNING *
    `, [
      b.matricule || null,
      b.nomFamille || b.nom_famille, b.prenom, b.prenomSecondaire || null, b.nomJeuneFile || null,
      b.sexe, b.dateNaissance || null, b.lieuNaissance || null, b.regionNaissance || null, b.paysNaissance || null,
      b.nationalite || null, b.situationFamiliale || null, parseInt(b.nbEnfants || 0), b.groupeSanguin || null,
      b.typePiece || null, b.numeroPiece || null, b.dateExpiration || null,
      b.adresseRue || null, b.adresseVille || null, b.adresseRegion || null, b.adressePays || null, b.adresseCodePostal || null,
      b.telephoneFixe || null, b.telephoneMobile || null, b.emailPro || null, b.emailPersonnel || null,
      b.urgenceNom || null, b.urgenceRelation || null, b.urgenceTelephone || null,
      b.corps || null, b.grade || null, b.categorie || null, b.classe || null,
      parseInt(b.echelon) || null, parseInt(b.indice) || null,
      b.dateRecrutement || null, b.datePriseFonction || null, b.dateTitularisation || null,
      b.modeRecrutement || null, b.numeroDecision || null, b.dateDecision || null, b.referenceJO || null, b.ministereDOrigine || null,
      b.typeContrat || null, b.situationAdmin || null,
      b.numeroCnss || null, b.numeroRetraite || null, b.rib || null, b.banque || null,
      b.ministereAffectation || null, b.direction_id || null, b.direction || null, b.sousDirection || null,
      b.service || null, b.bureau || null, b.poste || null, b.lieuAffectation || null, b.regionAffectation || null,
      b.niveauEtudes || null, b.diplome || null, b.specialite || null, b.etablissement || null,
      b.paysFormation || null, parseInt(b.anneeObtention) || null, b.mention || null,
      b.autreNationalite || null, b.numPasseport || null,
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: 'Agent introuvable.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/agents/:id/photo
router.patch('/:id/photo', uploadPhoto.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const filePath = `/uploads/agents/${req.file.filename}`;
    const { rows } = await pool.query(
      'UPDATE agents SET photo_url=$1, updated_at=NOW() WHERE id=$2 AND actif=TRUE RETURNING id, photo_url',
      [filePath, req.params.id]
    );
    if (!rows.length) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Agent introuvable.' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/agents/:id  (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE agents SET actif=FALSE, updated_at=NOW() WHERE id=$1 AND actif=TRUE',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Agent introuvable.' });
    res.json({ message: 'Agent supprimé.' });
  } catch (err) { next(err); }
});

// GET /api/agents/:id/evenements
router.get('/:id/evenements', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM agent_evenements WHERE agent_id=$1 ORDER BY date_effet DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/agents/:id/evenements
router.post('/:id/evenements', async (req, res, next) => {
  try {
    const { type, date_effet, description, reference } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO agent_evenements (agent_id,type,date_effet,description,reference) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, type, date_effet, description || null, reference || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;

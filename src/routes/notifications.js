const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

router.use(auth);

// Helper : créer une notification (appelé depuis d'autres routes)
async function createNotification(type, titre, message, roles_cibles) {
  await pool.query(
    'INSERT INTO notifications (type, titre, message, roles_cibles) VALUES ($1,$2,$3,$4)',
    [type, titre, message, roles_cibles]
  );
}
module.exports.createNotification = createNotification;

// GET /api/notifications — liste pour le rôle courant
router.get('/', async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;

    const { rows } = await pool.query(`
      SELECT n.id, n.type, n.titre, n.message, n.created_at,
             CASE WHEN nl.notification_id IS NOT NULL THEN TRUE ELSE FALSE END AS lu
      FROM notifications n
      LEFT JOIN notifications_lu nl ON nl.notification_id = n.id AND nl.user_id = $1
      WHERE n.roles_cibles ILIKE $2
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId, `%${role}%`]);

    const non_lues = rows.filter(r => !r.lu).length;
    res.json({ data: rows, non_lues });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/lire
router.patch('/:id/lire', async (req, res, next) => {
  try {
    await pool.query(
      'INSERT INTO notifications_lu (notification_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/lire-tout
router.patch('/lire-tout', async (req, res, next) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    await pool.query(`
      INSERT INTO notifications_lu (notification_id, user_id)
      SELECT n.id, $1 FROM notifications n
      WHERE n.roles_cibles ILIKE $2
        AND NOT EXISTS (SELECT 1 FROM notifications_lu nl WHERE nl.notification_id=n.id AND nl.user_id=$1)
    `, [userId, `%${role}%`]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports.router = router;

const express = require('express');
const requireRole = require('../middleware/requireRole');

module.exports = function registerInterventions(app, db) {
  const router = express.Router();

  // List with pagination
  router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page || '25', 10)));
    const offset = (page - 1) * perPage;
    try {
      const totalRow = await new Promise((r, rej) => db.get('SELECT COUNT(1) as c FROM interventions', (e, row) => e ? rej(e) : r(row)));
      const rows = await new Promise((r, rej) => db.all('SELECT * FROM interventions ORDER BY created_at DESC LIMIT ? OFFSET ?', [perPage, offset], (e, rows) => e ? rej(e) : r(rows)));
      res.json({ total: totalRow.c || 0, page, per_page: perPage, data: rows });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // Create (requires role when PROTECT_API is enabled)
  router.post('/', requireRole(['admin', 'mechanic', 'reception']), (req, res) => {
    const payload = req.body || {};
    const client_id = payload.client_id || null;
    const vehicle_id = payload.vehicle_id || null;
    const title = String(payload.title || '').trim();
    const description = String(payload.description || '').trim();
    const status = String(payload.status || 'open').trim();
    const price = Number(payload.price || 0) || 0;
    const scheduled_at = payload.scheduled_at || null;

    db.run(
      `INSERT INTO interventions (client_id, vehicle_id, title, description, status, price, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [client_id, vehicle_id, title, description, status, price, scheduled_at],
      function (err) {
        if (err) {
          console.error('Interventions INSERT error:', err && err.message);
          return res.status(500).json({ error: 'Erreur insertion', detail: String(err && err.message) });
        }
        db.get('SELECT * FROM interventions WHERE id = ?', [this.lastID], (e, row) => {
          if (e) {
            console.error('Interventions SELECT after insert error:', e && e.message);
            return res.status(500).json({ error: 'Erreur lecture', detail: String(e && e.message) });
          }
          res.status(201).json(row);
        });
      }
    );
  });

  // Get by id
  router.get('/:id', (req, res) => {
    const id = Number(req.params.id || 0);
    db.get('SELECT * FROM interventions WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Interventions GET error:', err && err.message);
        return res.status(500).json({ error: 'Erreur serveur', detail: String(err && err.message) });
      }
      if (!row) return res.status(404).json({ error: 'Non trouvé' });
      res.json(row);
    });
  });

  // Update (requires role when PROTECT_API is enabled)
  router.put('/:id', requireRole(['admin', 'mechanic', 'reception']), (req, res) => {
    const id = Number(req.params.id || 0);
    const payload = req.body || {};
    const title = payload.title || null;
    const description = payload.description || null;
    const status = payload.status || null;
    const price = typeof payload.price !== 'undefined' ? Number(payload.price) : null;
    const scheduled_at = typeof payload.scheduled_at !== 'undefined' ? payload.scheduled_at : null;

    const updates = [];
    const params = [];
    if (title !== null) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (description !== null) { updates.push('description = ?'); params.push(String(description).trim()); }
    if (status !== null) { updates.push('status = ?'); params.push(String(status).trim()); }
    if (price !== null) { updates.push('price = ?'); params.push(Number(price)); }
    if (scheduled_at !== null) { updates.push('scheduled_at = ?'); params.push(scheduled_at); }
    if (!updates.length) return res.status(400).json({ error: 'Aucune modification fournie' });
    params.push(id);

    db.run(`UPDATE interventions SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params, function (err) {
      if (err) {
        console.error('Interventions UPDATE error:', err && err.message);
        return res.status(500).json({ error: 'Erreur mise à jour', detail: String(err && err.message) });
      }
      db.get('SELECT * FROM interventions WHERE id = ?', [id], (e, row) => {
        if (e) {
          console.error('Interventions SELECT after update error:', e && e.message);
          return res.status(500).json({ error: 'Erreur lecture', detail: String(e && e.message) });
        }
        res.json(row);
      });
    });
  });

  // Delete (requires role when PROTECT_API is enabled)
  router.delete('/:id', requireRole(['admin', 'mechanic', 'reception']), (req, res) => {
    const id = Number(req.params.id || 0);
    db.run('DELETE FROM interventions WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('Interventions DELETE error:', err && err.message);
        return res.status(500).json({ error: 'Erreur suppression', detail: String(err && err.message) });
      }
      res.json({ deleted: this.changes });
    });
  });

  app.use('/api/interventions', router);
};

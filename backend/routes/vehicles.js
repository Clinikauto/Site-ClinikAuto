const express = require('express');

module.exports = function (app, db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    db.all('SELECT * FROM vehicles ORDER BY id DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  router.get('/:id', (req, res) => {
    db.get('SELECT * FROM vehicles WHERE id = ?', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    });
  });

  router.post('/', (req, res) => {
    const { client_id, marque, modele, annee, immatriculation, vin, km, notes } = req.body || {};
    db.run(
      `INSERT INTO vehicles (client_id, marque, modele, annee, immatriculation, vin, km, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [client_id || null, marque || '', modele || '', annee || '', immatriculation || '', vin || '', km || 0, notes || ''],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM vehicles WHERE id = ?', [this.lastID], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.status(201).json(row);
        });
      }
    );
  });

  router.put('/:id', (req, res) => {
    const { client_id, marque, modele, annee, immatriculation, vin, km, notes } = req.body || {};
    db.run(
      `UPDATE vehicles SET client_id = ?, marque = ?, modele = ?, annee = ?, immatriculation = ?, vin = ?, km = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [client_id || null, marque || '', modele || '', annee || '', immatriculation || '', vin || '', km || 0, notes || '', req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM vehicles WHERE id = ?', [req.params.id], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          if (!row) return res.status(404).json({ error: 'Not found' });
          res.json(row);
        });
      }
    );
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM vehicles WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes > 0 });
    });
  });

  app.use('/api/vehicles', router);
};

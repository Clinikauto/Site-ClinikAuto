const express = require('express');

module.exports = function (app, db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    db.all('SELECT * FROM clients ORDER BY id DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  router.get('/:id', (req, res) => {
    db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    });
  });

  router.post('/', (req, res) => {
    const { nom, prenom, email, tel, adresse, notes } = req.body || {};
    db.run(
      `INSERT INTO clients (nom, prenom, email, tel, adresse, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [nom || '', prenom || '', email || '', tel || '', adresse || '', notes || ''],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM clients WHERE id = ?', [this.lastID], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.status(201).json(row);
        });
      }
    );
  });

  router.put('/:id', (req, res) => {
    const { nom, prenom, email, tel, adresse, notes } = req.body || {};
    db.run(
      `UPDATE clients SET nom = ?, prenom = ?, email = ?, tel = ?, adresse = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nom || '', prenom || '', email || '', tel || '', adresse || '', notes || '', req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          if (!row) return res.status(404).json({ error: 'Not found' });
          res.json(row);
        });
      }
    );
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes > 0 });
    });
  });

  app.use('/api/clients', router);
};

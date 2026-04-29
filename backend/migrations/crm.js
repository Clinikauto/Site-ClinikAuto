module.exports = function runCrmMigrations(db) {
  function run(sql) {
    return new Promise((resolve, reject) => {
      db.run(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  const stmts = [
    `
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT DEFAULT '',
      prenom TEXT DEFAULT '',
      email TEXT UNIQUE DEFAULT '',
      tel TEXT DEFAULT '',
      adresse TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      marque TEXT DEFAULT '',
      modele TEXT DEFAULT '',
      annee TEXT DEFAULT '',
      immatriculation TEXT DEFAULT '',
      vin TEXT DEFAULT '',
      km INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL
    )
    `
  ];

  return (async () => {
    for (const s of stmts) {
      await run(s);
    }
  })();
};

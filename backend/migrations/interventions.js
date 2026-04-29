module.exports = function runInterventionsMigrations(db) {
  function run(sql) {
    return new Promise((resolve, reject) => {
      db.run(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  const stmts = [
    `
    CREATE TABLE IF NOT EXISTS interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      vehicle_id INTEGER,
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      price REAL DEFAULT 0,
      scheduled_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    )
    `
  ];

  return (async () => {
    for (const s of stmts) {
      await run(s);
    }
  })();
};

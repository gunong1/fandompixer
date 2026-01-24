const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

const db = new sqlite3.Database('database.db');

app.use(express.static(__dirname));

app.get('/api/pixels', (req, res) => {
  db.all('SELECT * FROM pixels', [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

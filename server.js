const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const port = process.env.PORT || 3000;

const db = new sqlite3.Database('database.db');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/api/pixels', (req, res) => {
  db.all('SELECT * FROM pixels', [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('new_pixel', (data) => {
    db.run(`INSERT INTO pixels (x, y, color, owner) VALUES (?, ?, ?, ?)`, [data.x, data.y, data.color, data.owner], function(err) {
      if (err) {
        return console.log(err.message);
      }
      // broadcast the new pixel to all clients
      io.emit('pixel_update', { id: this.lastID, x: data.x, y: data.y, color: data.color, owner: data.owner });
    });
  });
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

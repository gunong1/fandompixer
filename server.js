const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const port = process.env.PORT || 3000;

const db = new Database('database.db');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/api/pixels', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM pixels');
    const rows = stmt.all();
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('new_pixel', (data) => {
    try {
      const stmt = db.prepare(`INSERT INTO pixels (x, y, color, idol_group_name, owner_nickname) VALUES (?, ?, ?, ?, ?)`);
      const info = stmt.run(data.x, data.y, data.color, data.idol_group_name, data.owner_nickname);
      io.emit('pixel_update', { 
        id: info.lastInsertRowid, 
        x: data.x, 
        y: data.y, 
        color: data.color, 
        idol_group_name: data.idol_group_name, 
        owner_nickname: data.owner_nickname 
      });
    } catch (err) {
      console.log(err.message);
    }
  });
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

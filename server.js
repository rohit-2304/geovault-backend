const express = require('express');
const cors = require('cors');
const http = require('http'); // Required for Socket.io
const initSocket = require('./socket');

const vaultRoutes = require('./routes/vaultRoutes');
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Wrap Express in HTTP server

// Initialize Sockets
initSocket(server);

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true
}));

// Global request logger
app.use((req, res, next) => {
    console.log(`\n→ ${req.method} ${req.url}`);
    if (Object.keys(req.body || {}).length) console.log('  body:', req.body);
    next();
});

// Routes
app.use('/api/vaults', vaultRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GeoVault Server running on port ${PORT}`));
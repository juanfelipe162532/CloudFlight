import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;

// Estado del juego
const players = new Map();
const INTEREST_RADIUS = 50000; // 50km en metros

// Servidor WebSocket
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 Servidor de vuelo iniciado en puerto ${PORT}`);

wss.on('connection', (ws) => {
    const playerId = generatePlayerId();
    console.log(`✈️ Jugador ${playerId} conectado`);
    
    // Inicializar jugador
    const player = {
        id: playerId,
        position: { x: 0, y: 1000, z: 0 }, // Altura inicial 1000m
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        lastUpdate: Date.now()
    };
    
    players.set(playerId, player);
    
    // Enviar ID del jugador al cliente
    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId,
        position: player.position,
        playerCount: players.size
    }));
    
    // Notificar a otros jugadores
    broadcast({
        type: 'playerJoined',
        playerId: playerId,
        position: player.position,
        rotation: player.rotation,
        playerCount: players.size
    }, playerId);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handlePlayerMessage(playerId, message);
        } catch (error) {
            console.error('Error procesando mensaje:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`✈️ Jugador ${playerId} desconectado`);
        players.delete(playerId);
        
        // Notificar desconexión
        broadcast({
            type: 'playerLeft',
            playerId: playerId,
            playerCount: players.size
        });
    });
    
    // Almacenar referencia del socket
    player.socket = ws;
});

function handlePlayerMessage(playerId, message) {
    const player = players.get(playerId);
    if (!player) return;
    
    switch (message.type) {
        case 'input':
            // Procesar inputs del cliente y actualizar física
            updatePlayerFromInput(player, message.input);
            
            // Enviar posición actualizada a jugadores cercanos
            const nearbyPlayers = getNearbyPlayers(player, INTEREST_RADIUS);
            nearbyPlayers.forEach(nearbyPlayer => {
                if (nearbyPlayer.socket.readyState === 1) { // WebSocket.OPEN
                    nearbyPlayer.socket.send(JSON.stringify({
                        type: 'playerUpdate',
                        playerId: playerId,
                        position: player.position,
                        rotation: player.rotation,
                        velocity: player.velocity
                    }));
                }
            });
            break;
            
        case 'requestNearbyPlayers':
            // Enviar lista de jugadores cercanos
            const nearby = getNearbyPlayers(player, INTEREST_RADIUS);
            const nearbyData = nearby.map(p => ({
                id: p.id,
                position: p.position,
                rotation: p.rotation,
                velocity: p.velocity
            }));
            
            player.socket.send(JSON.stringify({
                type: 'nearbyPlayers',
                players: nearbyData
            }));
            break;
    }
}

function updatePlayerFromInput(player, input) {
    const deltaTime = 0.016; // ~60fps
    const speed = 100; // m/s velocidad base
    const rotationSpeed = 2; // rad/s
    
    // Actualizar rotación basada en inputs
    if (input.pitch) player.rotation.x += input.pitch * rotationSpeed * deltaTime;
    if (input.yaw) player.rotation.y += input.yaw * rotationSpeed * deltaTime;
    if (input.roll) player.rotation.z += input.roll * rotationSpeed * deltaTime;
    
    // Limitar pitch para evitar loops
    player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, player.rotation.x));
    
    // Calcular velocidad basada en rotación y throttle
    const throttle = input.throttle || 0;
    const forward = {
        x: Math.sin(player.rotation.y) * Math.cos(player.rotation.x),
        y: -Math.sin(player.rotation.x),
        z: Math.cos(player.rotation.y) * Math.cos(player.rotation.x)
    };
    
    player.velocity.x = forward.x * speed * throttle;
    player.velocity.y = forward.y * speed * throttle;
    player.velocity.z = forward.z * speed * throttle;
    
    // Actualizar posición
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;
    
    // Evitar que el avión se estrelle contra el suelo
    player.position.y = Math.max(10, player.position.y);
    
    player.lastUpdate = Date.now();
}

function getNearbyPlayers(centerPlayer, radius) {
    const nearby = [];
    
    for (const [id, player] of players) {
        if (id === centerPlayer.id) continue;
        
        const distance = getDistance3D(centerPlayer.position, player.position);
        if (distance <= radius) {
            nearby.push(player);
        }
    }
    
    return nearby;
}

function getDistance3D(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function broadcast(message, excludePlayerId = null) {
    const messageStr = JSON.stringify(message);
    
    for (const [id, player] of players) {
        if (id === excludePlayerId) continue;
        
        if (player.socket.readyState === 1) { // WebSocket.OPEN
            player.socket.send(messageStr);
        }
    }
}

function generatePlayerId() {
    return 'pilot_' + Math.random().toString(36).substr(2, 8);
}

// Heartbeat para mantener conexiones vivas
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.ping();
        }
    });
}, 30000);

console.log('🌍 Servidor listo para recibir pilotos...');
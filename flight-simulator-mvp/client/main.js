// CloudFlight - Simulador de Vuelo Multijugador

// Configuración inicial
const SERVER_URL = 'ws://localhost:8080'; // Cambiar para producción

// Variables globales del juego
let scene, camera, renderer, aircraft;
let ws = null;
let playerId = null;
let playerCount = 0;
let otherPlayers = new Map();

// Estado del jugador
let playerState = {
    position: { x: 0, y: 1000, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }
};

// Controles
let keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowDown: false,
    ArrowLeft: false, ArrowRight: false
};

// Elementos DOM
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const connectionStatus = document.getElementById('connectionStatus');
const ui = document.getElementById('ui');
const radar = document.getElementById('radar');
const controls = document.getElementById('controls');

// Inicializar el juego cuando main.js se carga (THREE.js ya está disponible)
console.log('🎮 Inicializando simulador de vuelo...');
init();

function init() {
    setupEventListeners();
    connectToServer();
}

function setupEventListeners() {
    startButton.addEventListener('click', startGame);
    
    // Controles del teclado
    document.addEventListener('keydown', (event) => {
        if (keys.hasOwnProperty(event.code)) {
            keys[event.code] = true;
        }
    });
    
    document.addEventListener('keyup', (event) => {
        if (keys.hasOwnProperty(event.code)) {
            keys[event.code] = false;
        }
    });
    
    // Prevenir scroll con flechas
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    });
}

function connectToServer() {
    try {
        connectionStatus.textContent = '🔄 Conectando al servidor...';
        connectionStatus.className = 'status-connecting';
        
        ws = new WebSocket(SERVER_URL);
        
        ws.onopen = () => {
            console.log('🌐 Conectado al servidor');
            connectionStatus.textContent = '✅ Conectado! Listo para volar';
            connectionStatus.className = 'status-connected';
            startButton.disabled = false;
            
            // Add a subtle success animation
            startButton.style.animation = 'pulse 2s ease-in-out infinite';
        };
        
        ws.onmessage = (event) => {
            handleServerMessage(JSON.parse(event.data));
        };
        
        ws.onclose = () => {
            console.log('🌐 Desconectado del servidor');
            connectionStatus.textContent = '❌ Desconectado. Recarga la página.';
            connectionStatus.className = 'status-error';
            startButton.disabled = true;
        };
        
        ws.onerror = (error) => {
            console.error('Error WebSocket:', error);
            connectionStatus.textContent = '❌ Error de conexión al servidor';
            connectionStatus.className = 'status-error';
            startButton.disabled = true;
        };
        
    } catch (error) {
        console.error('Error conectando:', error);
        connectionStatus.textContent = '❌ No se pudo conectar al servidor';
        connectionStatus.className = 'status-error';
        startButton.disabled = true;
    }
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'init':
            playerId = message.playerId;
            playerState.position = message.position;
            playerCount = message.playerCount;
            updateHUD();
            break;
            
        case 'playerJoined':
            if (message.playerId !== playerId) {
                addOtherPlayer(message.playerId, message.position, message.rotation);
            }
            playerCount = message.playerCount;
            updateHUD();
            break;
            
        case 'playerLeft':
            removeOtherPlayer(message.playerId);
            playerCount = message.playerCount;
            updateHUD();
            break;
            
        case 'playerUpdate':
            if (message.playerId !== playerId) {
                updateOtherPlayer(message.playerId, message.position, message.rotation, message.velocity);
            }
            break;
            
        case 'nearbyPlayers':
            message.players.forEach(player => {
                if (player.id !== playerId) {
                    addOtherPlayer(player.id, player.position, player.rotation);
                }
            });
            break;
    }
}

function startGame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Show better error message
        connectionStatus.textContent = '❌ Sin conexión al servidor';
        connectionStatus.className = 'status-error';
        startButton.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => startButton.style.animation = '', 500);
        return;
    }
    
    // Disable button and show loading
    startButton.disabled = true;
    startButton.textContent = '🚀 Iniciando...';
    
    // Smooth fade transition
    startScreen.style.transition = 'opacity 1s ease-out, transform 1s ease-out';
    startScreen.style.opacity = '0';
    startScreen.style.transform = 'scale(0.9)';
    
    setTimeout(() => {
        startScreen.classList.add('hidden');
        ui.classList.remove('hidden');
        radar.classList.remove('hidden');
        controls.classList.remove('hidden');
        
        // Fade in game UI
        ui.style.opacity = '0';
        radar.style.opacity = '0';
        controls.style.opacity = '0';
        
        setTimeout(() => {
            ui.style.transition = 'opacity 0.5s ease-in';
            radar.style.transition = 'opacity 0.5s ease-in';
            controls.style.transition = 'opacity 0.5s ease-in';
            ui.style.opacity = '1';
            radar.style.opacity = '1';
            controls.style.opacity = '1';
        }, 100);
        
        setupThreeJS();
        requestNearbyPlayers();
        gameLoop();
        
        console.log('🎮 ¡Juego iniciado! ¡Buen vuelo!');
    }, 1000);
}

function setupThreeJS() {
    // Crear escena
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87CEEB, 1000, 100000);
    
    // Configurar cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100000);
    
    // Configurar renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87CEEB); // Azul cielo
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('gameContainer').appendChild(renderer.domElement);
    
    // Crear terreno
    createTerrain();
    
    // Crear avión del jugador
    createAircraft();
    
    // Configurar luces
    setupLights();
    
    // Manejar redimensionamiento
    window.addEventListener('resize', onWindowResize);
}

function createTerrain() {
    // Terreno base (plano grande)
    const terrainGeometry = new THREE.PlaneGeometry(200000, 200000, 100, 100);
    const terrainMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x228B22,
        wireframe: false 
    });
    
    // Agregar algo de rugosidad al terreno
    const vertices = terrainGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = Math.random() * 200 - 100; // Altura aleatoria
    }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);
    
    // Agregar algunas "nubes" simples
    for (let i = 0; i < 50; i++) {
        const cloudGeometry = new THREE.SphereGeometry(Math.random() * 500 + 200, 8, 8);
        const cloudMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.6 
        });
        const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        
        cloud.position.set(
            (Math.random() - 0.5) * 100000,
            Math.random() * 3000 + 2000,
            (Math.random() - 0.5) * 100000
        );
        
        scene.add(cloud);
    }
}

function createAircraft() {
    // Crear avión simple (por ahora un cubo con forma de avión)
    const aircraftGroup = new THREE.Group();
    
    // Fuselaje principal
    const fuselageGeometry = new THREE.BoxGeometry(2, 1, 8);
    const fuselageMaterial = new THREE.MeshLambertMaterial({ color: 0xff4444 });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.castShadow = true;
    aircraftGroup.add(fuselage);
    
    // Alas
    const wingGeometry = new THREE.BoxGeometry(12, 0.2, 2);
    const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.set(0, 0, 1);
    wings.castShadow = true;
    aircraftGroup.add(wings);
    
    // Cola vertical
    const tailGeometry = new THREE.BoxGeometry(0.2, 3, 1);
    const tailMaterial = new THREE.MeshLambertMaterial({ color: 0xff4444 });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(0, 1, -3);
    tail.castShadow = true;
    aircraftGroup.add(tail);
    
    // Cola horizontal
    const htailGeometry = new THREE.BoxGeometry(4, 0.2, 1);
    const htail = new THREE.Mesh(htailGeometry, tailMaterial);
    htail.position.set(0, 0.5, -3.5);
    htail.castShadow = true;
    aircraftGroup.add(htail);
    
    aircraft = aircraftGroup;
    aircraft.position.copy(playerState.position);
    scene.add(aircraft);
    
    console.log('✈️ Avión creado');
}

function setupLights() {
    // Luz ambiente
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    // Luz direccional (sol)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1000, 5000, 1000);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 20000;
    directionalLight.shadow.camera.left = -5000;
    directionalLight.shadow.camera.right = 5000;
    directionalLight.shadow.camera.top = 5000;
    directionalLight.shadow.camera.bottom = -5000;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
}

function addOtherPlayer(id, position, rotation) {
    if (otherPlayers.has(id)) return;
    
    // Crear avión para otro jugador (color diferente)
    const otherAircraftGroup = new THREE.Group();
    
    const fuselageGeometry = new THREE.BoxGeometry(2, 1, 8);
    const fuselageMaterial = new THREE.MeshLambertMaterial({ color: 0x4444ff });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    otherAircraftGroup.add(fuselage);
    
    const wingGeometry = new THREE.BoxGeometry(12, 0.2, 2);
    const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.set(0, 0, 1);
    otherAircraftGroup.add(wings);
    
    otherAircraftGroup.position.copy(position);
    if (rotation) {
        otherAircraftGroup.rotation.set(rotation.x, rotation.y, rotation.z);
    }
    
    scene.add(otherAircraftGroup);
    otherPlayers.set(id, {
        mesh: otherAircraftGroup,
        position: { ...position },
        rotation: rotation ? { ...rotation } : { x: 0, y: 0, z: 0 },
        targetPosition: { ...position },
        targetRotation: rotation ? { ...rotation } : { x: 0, y: 0, z: 0 }
    });
    
    console.log(`🛩️ Jugador ${id} agregado`);
}

function updateOtherPlayer(id, position, rotation, velocity) {
    const player = otherPlayers.get(id);
    if (player) {
        player.targetPosition = { ...position };
        player.targetRotation = { ...rotation };
    }
}

function removeOtherPlayer(id) {
    const player = otherPlayers.get(id);
    if (player) {
        scene.remove(player.mesh);
        otherPlayers.delete(id);
        console.log(`🛩️ Jugador ${id} eliminado`);
    }
}

function gameLoop() {
    updateControls();
    updatePhysics();
    updateCamera();
    updateOtherPlayersSmooth();
    updateHUD();
    updateRadar();
    sendInputToServer();
    
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

function updateControls() {
    const input = {
        pitch: 0,
        yaw: 0,
        roll: 0,
        throttle: 0
    };
    
    // Controles WASD para rotación
    if (keys['KeyW']) input.pitch = -1; // Nariz arriba
    if (keys['KeyS']) input.pitch = 1;  // Nariz abajo
    if (keys['KeyA']) input.yaw = -1;   // Girar izquierda
    if (keys['KeyD']) input.yaw = 1;    // Girar derecha
    if (keys['KeyQ']) input.roll = -1;  // Roll izquierda
    if (keys['KeyE']) input.roll = 1;   // Roll derecha
    
    // Flechas para aceleración
    if (keys['ArrowUp']) input.throttle = 1;
    if (keys['ArrowDown']) input.throttle = -0.5;
    
    return input;
}

function updatePhysics() {
    // Esta lógica se maneja en el servidor, aquí solo predicción local
    const input = updateControls();
    const deltaTime = 0.016;
    const rotationSpeed = 2;
    const speed = 100;
    
    // Predicción local de rotación
    if (input.pitch) playerState.rotation.x += input.pitch * rotationSpeed * deltaTime;
    if (input.yaw) playerState.rotation.y += input.yaw * rotationSpeed * deltaTime;
    if (input.roll) playerState.rotation.z += input.roll * rotationSpeed * deltaTime;
    
    playerState.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, playerState.rotation.x));
    
    // Predicción local de movimiento
    const forward = {
        x: Math.sin(playerState.rotation.y) * Math.cos(playerState.rotation.x),
        y: -Math.sin(playerState.rotation.x),
        z: Math.cos(playerState.rotation.y) * Math.cos(playerState.rotation.x)
    };
    
    playerState.velocity.x = forward.x * speed * input.throttle;
    playerState.velocity.y = forward.y * speed * input.throttle;
    playerState.velocity.z = forward.z * speed * input.throttle;
    
    playerState.position.x += playerState.velocity.x * deltaTime;
    playerState.position.y += playerState.velocity.y * deltaTime;
    playerState.position.z += playerState.velocity.z * deltaTime;
    
    playerState.position.y = Math.max(10, playerState.position.y);
    
    // Actualizar posición del avión
    aircraft.position.copy(playerState.position);
    aircraft.rotation.set(playerState.rotation.x, playerState.rotation.y, playerState.rotation.z);
}

function updateCamera() {
    // Cámara en tercera persona detrás del avión
    const distance = 50;
    const height = 20;
    
    const behind = {
        x: playerState.position.x - Math.sin(playerState.rotation.y) * distance,
        y: playerState.position.y + height,
        z: playerState.position.z - Math.cos(playerState.rotation.y) * distance
    };
    
    camera.position.lerp(new THREE.Vector3(behind.x, behind.y, behind.z), 0.1);
    camera.lookAt(aircraft.position);
}

function updateOtherPlayersSmooth() {
    // Interpolación suave para otros jugadores
    otherPlayers.forEach((player, id) => {
        // Interpolar posición
        player.position.x += (player.targetPosition.x - player.position.x) * 0.2;
        player.position.y += (player.targetPosition.y - player.position.y) * 0.2;
        player.position.z += (player.targetPosition.z - player.position.z) * 0.2;
        
        // Interpolar rotación
        player.rotation.x += (player.targetRotation.x - player.rotation.x) * 0.2;
        player.rotation.y += (player.targetRotation.y - player.rotation.y) * 0.2;
        player.rotation.z += (player.targetRotation.z - player.rotation.z) * 0.2;
        
        // Aplicar a la malla
        player.mesh.position.copy(player.position);
        player.mesh.rotation.set(player.rotation.x, player.rotation.y, player.rotation.z);
    });
}

function updateHUD() {
    document.getElementById('playerId').textContent = playerId || '-';
    document.getElementById('playerCount').textContent = playerCount;
    document.getElementById('altitude').textContent = Math.round(playerState.position.y);
    
    const speed = Math.sqrt(
        playerState.velocity.x ** 2 + 
        playerState.velocity.y ** 2 + 
        playerState.velocity.z ** 2
    );
    document.getElementById('speed').textContent = Math.round(speed);
    
    const heading = ((playerState.rotation.y * 180 / Math.PI) + 360) % 360;
    document.getElementById('heading').textContent = Math.round(heading);
}

function updateRadar() {
    // Limpiar radar
    radar.innerHTML = '';
    
    const radarRadius = 100; // Radio del radar en píxeles
    const gameRadius = 25000; // 25km en el juego
    
    // Agregar punto propio (centro, amarillo)
    const selfDot = document.createElement('div');
    selfDot.className = 'radar-dot self';
    selfDot.style.left = '50%';
    selfDot.style.top = '50%';
    radar.appendChild(selfDot);
    
    // Agregar otros jugadores
    otherPlayers.forEach((player, id) => {
        const dx = player.position.x - playerState.position.x;
        const dz = player.position.z - playerState.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance <= gameRadius) {
            const radarX = (dx / gameRadius) * radarRadius + radarRadius;
            const radarY = (dz / gameRadius) * radarRadius + radarRadius;
            
            const dot = document.createElement('div');
            dot.className = 'radar-dot';
            dot.style.left = radarX + 'px';
            dot.style.top = radarY + 'px';
            radar.appendChild(dot);
        }
    });
}

function sendInputToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const input = updateControls();
        
        ws.send(JSON.stringify({
            type: 'input',
            input: input
        }));
    }
}

function requestNearbyPlayers() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'requestNearbyPlayers'
        }));
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Solicitar jugadores cercanos cada 5 segundos
setInterval(requestNearbyPlayers, 5000);
// CloudFlight - Simulador de Vuelo Multijugador

// Importar JSBSim Adapter
import jsbsim from './jsbsim-adapter.js';

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
    position: { x: 0, y: 50, z: 0 }, // Altitud mínima (50 pies)
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    currentThrottle: 0.7,  // Valor inicial más alto para mejor control
    throttleRate: 0.03,    // Tasa de cambio del acelerador más rápida
    minSpeedForControl: 30 // Velocidad mínima para mantener control
};

// Estado de la cámara orbital
let cameraOrbit = {
    enabled: false,
    distance: 80,        // Distancia inicial del avión (más lejos para F-16)
    minDistance: 20,     // Distancia mínima (más lejos para ver completo)
    maxDistance: 500,    // Distancia máxima
    azimuth: 0,          // Rotación horizontal (radianes)
    elevation: 0.3,      // Rotación vertical (radianes)
    minElevation: -Math.PI/2 + 0.1, // Evitar gimbal lock
    maxElevation: Math.PI/2 - 0.1,
    target: new THREE.Vector3(), // Punto alrededor del cual orbitar
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    sensitivity: 0.005   // Sensibilidad del mouse
};

// Controles
let keys = {
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
    KeyQ: false, KeyE: false, // Roll izquierda/derecha
    ArrowUp: false, ArrowDown: false, // Control de aceleración
    ArrowLeft: false, ArrowRight: false,
    Space: false, ShiftLeft: false, // Subir/Bajar directo
    KeyC: false // Cambiar modo de cámara
};

// Elementos DOM
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const connectionStatus = document.getElementById('connectionStatus');
const ui = document.getElementById('ui');
const radar = document.getElementById('radar');
const controls = document.getElementById('controls');
const debugInfo = document.getElementById('debugInfo');

// Inicializar el juego
console.log(' Inicializando simulador de vuelo...');
init();

async function init() {
    setupEventListeners();
    connectToServer();
    
    // Inicializar JSBSim
    console.log(' Inicializando motor de física JSBSim...');
    const physicsInitialized = await jsbsim.init();
    if (!physicsInitialized) {
        console.error(' No se pudo inicializar el motor de física');
        return;
    }
    console.log(' Motor de física JSBSim inicializado correctamente');
}

// Inicializar el juego cuando main.js se carga (THREE.js ya está disponible)
console.log(' Inicializando simulador de vuelo...');
init();

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
        
        // Alternar modo de cámara con C
        if (event.code === 'KeyC') {
            toggleCameraMode();
        }
    });
    
    // Prevenir scroll con flechas y otros controles
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
    });
    
    // Los controles de mouse se configuran después de crear el renderer
}

function setupMouseControls() {
    const canvas = renderer.domElement;
    
    // Mouse down - Iniciar arrastre
    canvas.addEventListener('mousedown', (event) => {
        if (event.button === 0) { // Click izquierdo
            cameraOrbit.isDragging = true;
            cameraOrbit.lastMouseX = event.clientX;
            cameraOrbit.lastMouseY = event.clientY;
            cameraOrbit.enabled = true;
            canvas.style.cursor = 'grabbing';
            event.preventDefault();
        }
    });
    
    // Mouse move - Actualizar cámara mientras arrastra
    canvas.addEventListener('mousemove', (event) => {
        if (cameraOrbit.isDragging) {
            const deltaX = event.clientX - cameraOrbit.lastMouseX;
            const deltaY = event.clientY - cameraOrbit.lastMouseY;
            
            // Actualizar azimuth (rotación horizontal)
            cameraOrbit.azimuth += deltaX * cameraOrbit.sensitivity;
            
            // Actualizar elevation (rotación vertical)
            cameraOrbit.elevation -= deltaY * cameraOrbit.sensitivity;
            cameraOrbit.elevation = Math.max(cameraOrbit.minElevation, 
                Math.min(cameraOrbit.maxElevation, cameraOrbit.elevation));
            
            cameraOrbit.lastMouseX = event.clientX;
            cameraOrbit.lastMouseY = event.clientY;
            
            event.preventDefault();
        }
    });
    
    // Mouse up - Terminar arrastre
    canvas.addEventListener('mouseup', (event) => {
        if (event.button === 0) {
            cameraOrbit.isDragging = false;
            canvas.style.cursor = 'default';
            event.preventDefault();
        }
    });
    
    // Mouse leave - Terminar arrastre si sale del canvas
    canvas.addEventListener('mouseleave', () => {
        cameraOrbit.isDragging = false;
        canvas.style.cursor = 'default';
    });
    
    // Wheel - Zoom in/out
    canvas.addEventListener('wheel', (event) => {
        const zoomSpeed = 5;
        cameraOrbit.distance += event.deltaY * 0.01 * zoomSpeed;
        cameraOrbit.distance = Math.max(cameraOrbit.minDistance, 
            Math.min(cameraOrbit.maxDistance, cameraOrbit.distance));
        
        cameraOrbit.enabled = true;
        event.preventDefault();
    });
    
    // Double click - Resetear cámara
    canvas.addEventListener('dblclick', () => {
        cameraOrbit.azimuth = 0;
        cameraOrbit.elevation = 0.3;
        cameraOrbit.distance = 80; // Distancia ajustada para F-16
        console.log('🎥 Cámara reseteada para F-16');
    });
    
    console.log('🖱️ Controles de mouse configurados:');
    console.log('   • Click izq + arrastrar = Orbitar cámara');
    console.log('   • Rueda del mouse = Zoom in/out');
    console.log('   • Doble click = Resetear cámara');
    console.log('   • Tecla C = Alternar modo cámara');
}

function toggleCameraMode() {
    cameraOrbit.enabled = !cameraOrbit.enabled;
    
    if (cameraOrbit.enabled) {
        console.log('🎥 Modo cámara orbital activado');
        console.log('   • Usa el mouse para orbitar alrededor del avión');
        console.log('   • Rueda del mouse para zoom');
        console.log('   • Doble click para resetear');
    } else {
        console.log('🎥 Modo cámara tradicional activado');
        console.log('   • Cámara fija detrás del avión');
    }
}

function connectToServer() {
    try {
        connectionStatus.textContent = ' Conectando al servidor...';
        connectionStatus.className = 'status-connecting';
        
        ws = new WebSocket(SERVER_URL);
        
        ws.onopen = () => {
            console.log(' Conectado al servidor');
            connectionStatus.textContent = ' Conectado! Listo para volar';
            connectionStatus.className = 'status-connected';
            startButton.disabled = false;
            
            // Add a subtle success animation
            startButton.style.animation = 'pulse 2s ease-in-out infinite';
        };
        
        ws.onmessage = (event) => {
            handleServerMessage(JSON.parse(event.data));
        };
        
        ws.onclose = () => {
            console.log(' Desconectado del servidor');
            connectionStatus.textContent = ' Desconectado. Recarga la página.';
            connectionStatus.className = 'status-error';
            startButton.disabled = true;
        };
        
        ws.onerror = (error) => {
            console.error('Error WebSocket:', error);
            connectionStatus.textContent = ' Error de conexión al servidor';
            connectionStatus.className = 'status-error';
            startButton.disabled = true;
        };
        
    } catch (error) {
        console.error('Error conectando:', error);
        connectionStatus.textContent = ' No se pudo conectar al servidor';
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
        connectionStatus.textContent = ' Sin conexión al servidor';
        connectionStatus.className = 'status-error';
        startButton.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => startButton.style.animation = '', 500);
        return;
    }
    
    // Disable button and show loading
    startButton.disabled = true;
    startButton.textContent = ' Iniciando...';
    
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
        setupMouseControls(); // Configurar controles de mouse después de crear el renderer
        requestNearbyPlayers();
        gameLoop();
        
        console.log(' ¡Juego iniciado! ¡Buen vuelo!');
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
    console.log('🌍 Creando terreno con textura satelital...');
    
    // Terreno base (plano grande)
    const terrainGeometry = new THREE.PlaneGeometry(200000, 200000, 100, 100);
    
    // Crear material con textura satelital
    const textureLoader = new THREE.TextureLoader();
    
    // Crear textura satelital real usando Google Maps
    console.log('🚀 Iniciando carga de textura satelital...');
    const satelliteTexture = createGoogleMapsSatelliteTexture();
    
    const terrainMaterial = new THREE.MeshLambertMaterial({ 
        map: satelliteTexture,
        transparent: false
    });
    
    // Generar elevaciones usando ruido Perlin simulado más realista
    const vertices = terrainGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 1];
        
        // Generar elevación con múltiples octavas de ruido
        let elevation = 0;
        elevation += Math.sin(x * 0.00005) * 400; // Montañas grandes
        elevation += Math.sin(z * 0.00005) * 400;
        elevation += Math.sin(x * 0.0002) * 150; // Colinas medianas
        elevation += Math.sin(z * 0.0002) * 150;
        elevation += Math.sin(x * 0.001) * 50; // Ondas pequeñas
        elevation += Math.sin(z * 0.001) * 50;
        elevation += (Math.random() - 0.5) * 30; // Ruido
        
        vertices[i + 2] = Math.max(elevation, -50); // Permitir algunas depresiones
    }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    
    // Función global para obtener elevación del terreno
    window.getTerrainElevation = function(x, z) {
        let elevation = 0;
        elevation += Math.sin(x * 0.00005) * 400;
        elevation += Math.sin(z * 0.00005) * 400;
        elevation += Math.sin(x * 0.0002) * 150;
        elevation += Math.sin(z * 0.0002) * 150;
        elevation += Math.sin(x * 0.001) * 50;
        elevation += Math.sin(z * 0.001) * 50;
        return Math.max(elevation, -50);
    };
    
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
    
    console.log('🛰️ Terreno con textura satelital creado');
}

function createSatelliteTexture() {
    // Crear canvas para generar textura satelital procedural
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 2048;
    canvas.height = 2048;
    
    // Crear un mapa satelital procedural realista
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            
            // Coordenadas normalizadas
            const nx = x / canvas.width;
            const ny = y / canvas.height;
            
            // Generar diferentes tipos de terreno
            const landType = getLandType(nx * 10, ny * 10);
            const color = getLandColor(landType, nx, ny);
            
            data[index] = color.r;     // Rojo
            data[index + 1] = color.g; // Verde  
            data[index + 2] = color.b; // Azul
            data[index + 3] = 255;     // Alpha
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Añadir detalles como carreteras, ciudades, etc.
    addMapDetails(ctx, canvas.width, canvas.height);
    
    // Crear textura de THREE.js
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    
    return texture;
}

function getLandType(x, y) {
    // Usar ruido para determinar tipo de terreno
    const noise1 = Math.sin(x * 0.1) * Math.cos(y * 0.1);
    const noise2 = Math.sin(x * 0.05) * Math.cos(y * 0.05);
    const combined = noise1 * 0.6 + noise2 * 0.4;
    
    if (combined > 0.3) return 'forest';      // Bosque
    if (combined > 0.1) return 'field';       // Campo
    if (combined > -0.1) return 'urban';      // Urbano
    if (combined > -0.3) return 'water';      // Agua
    return 'mountain';                        // Montaña
}

function getLandColor(landType, nx, ny) {
    const variation = (Math.sin(nx * 50) + Math.cos(ny * 50)) * 0.1;
    
    switch (landType) {
        case 'forest':
            return {
                r: Math.floor(34 + variation * 20),
                g: Math.floor(85 + variation * 30), 
                b: Math.floor(34 + variation * 20)
            };
        case 'field':
            return {
                r: Math.floor(124 + variation * 40),
                g: Math.floor(145 + variation * 30),
                b: Math.floor(50 + variation * 30)
            };
        case 'urban':
            return {
                r: Math.floor(140 + variation * 40),
                g: Math.floor(140 + variation * 40),
                b: Math.floor(140 + variation * 40)
            };
        case 'water':
            return {
                r: Math.floor(30 + variation * 20),
                g: Math.floor(90 + variation * 30),
                b: Math.floor(180 + variation * 40)
            };
        case 'mountain':
            return {
                r: Math.floor(101 + variation * 30),
                g: Math.floor(67 + variation * 20),
                b: Math.floor(33 + variation * 15)
            };
        default:
            return { r: 100, g: 100, b: 100 };
    }
}

function addMapDetails(ctx, width, height) {
    // Añadir carreteras
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    // Carreteras principales (líneas rectas y curvas)
    for (let i = 0; i < 20; i++) {
        const startX = Math.random() * width;
        const startY = Math.random() * height;
        const endX = Math.random() * width;
        const endY = Math.random() * height;
        
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
    }
    ctx.stroke();
    
    // Añadir ciudades/pueblos (puntos grises)
    ctx.fillStyle = '#999999';
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 30 + 10;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Añadir ríos (líneas azules serpenteantes)
    ctx.strokeStyle = '#4682b4';
    ctx.lineWidth = 8;
    ctx.beginPath();
    
    for (let i = 0; i < 5; i++) {
        let x = Math.random() * width;
        let y = Math.random() * height;
        ctx.moveTo(x, y);
        
        for (let j = 0; j < 50; j++) {
            x += (Math.random() - 0.5) * 40;
            y += Math.random() * 30 - 10;
            ctx.lineTo(Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y)));
        }
    }
    ctx.stroke();
}

// GOOGLE MAPS SATELLITE TEXTURE
function createGoogleMapsSatelliteTexture() {
    // Usar configuración global
    const gmapsConfig = window.FLIGHT_CONFIG?.GOOGLE_MAPS;
    
    if (!gmapsConfig) {
        console.error('❌ Config.js no cargado correctamente');
        return createSatelliteTexture();
    }
    
    const config = {
        apiKey: gmapsConfig.API_KEY,
        centerLat: gmapsConfig.DEFAULT_LAT,
        centerLng: gmapsConfig.DEFAULT_LNG,
        zoom: gmapsConfig.TERRAIN.ZOOM_LEVEL,
        imageSize: gmapsConfig.TERRAIN.IMAGE_SIZE,
        tilesPerSide: gmapsConfig.TERRAIN.COVERAGE_AREA
    };
    
    // Si no hay API key, usar fallback
    if (!config.apiKey || config.apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
        console.warn('⚠️ Google Maps API key no configurada en config.js, usando textura procedural');
        console.warn('📝 Edita el archivo config.js y añade tu API key de Google Maps');
        return createSatelliteTexture();
    }
    
    console.log('🛰️ Cargando satellite imagery de Google Maps...');
    console.log('📍 Ubicación:', config.centerLat, ',', config.centerLng, '(Miami, FL)');
    console.log('🔑 API Key:', config.apiKey.substring(0, 20) + '...');
    return createGoogleMapsStaticTexture(); // Usar método más simple y confiable
}

function loadGoogleMapsTextureAsync(config) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = config.imageSize;
    canvas.height = config.imageSize;
    
    // Crear textura temporal mientras carga
    const tempTexture = new THREE.CanvasTexture(canvas);
    
    // Función para convertir coordenadas a tiles
    function latLngToTile(lat, lng, zoom) {
        const latRad = lat * Math.PI / 180;
        const n = Math.pow(2, zoom);
        const tileX = Math.floor((lng + 180) / 360 * n);
        const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x: tileX, y: tileY };
    }
    
    // Calcular tiles necesarios
    const centerTile = latLngToTile(config.centerLat, config.centerLng, config.zoom);
    const halfTiles = Math.floor(config.tilesPerSide / 2);
    
    let loadedTiles = 0;
    const totalTiles = config.tilesPerSide * config.tilesPerSide;
    
    // Cargar tiles de Google Maps
    for (let y = 0; y < config.tilesPerSide; y++) {
        for (let x = 0; x < config.tilesPerSide; x++) {
            const tileX = centerTile.x - halfTiles + x;
            const tileY = centerTile.y - halfTiles + y;
            
            // URL de Google Maps Tile API
            const tileUrl = `https://maps.googleapis.com/maps/api/staticmap?` +
                `center=${config.centerLat},${config.centerLng}&` +
                `zoom=${config.zoom}&` +
                `size=256x256&` +
                `maptype=satellite&` +
                `key=${config.apiKey}&` +
                `scale=1&` +
                `format=png`;
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = function() {
                // Dibujar tile en el canvas
                const tileSize = config.imageSize / config.tilesPerSide;
                ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
                
                loadedTiles++;
                
                // Cuando todos los tiles estén cargados, actualizar textura
                if (loadedTiles === totalTiles) {
                    tempTexture.needsUpdate = true;
                    console.log('🛰️ Textura satelital de Google Maps cargada');
                }
            };
            
            img.onerror = function() {
                console.error('❌ Error cargando tile de Google Maps:', tileUrl);
                loadedTiles++;
                
                // Usar color de respaldo para este tile
                ctx.fillStyle = '#228B22';
                const tileSize = config.imageSize / config.tilesPerSide;
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                
                if (loadedTiles === totalTiles) {
                    tempTexture.needsUpdate = true;
                }
            };
            
            img.src = tileUrl;
        }
    }
    
    return tempTexture;
}

// Función alternativa usando Static Map API (más simple)
function createGoogleMapsStaticTexture() {
    const gmapsConfig = window.FLIGHT_CONFIG?.GOOGLE_MAPS;
    
    const config = {
        apiKey: gmapsConfig.API_KEY,
        centerLat: gmapsConfig.DEFAULT_LAT,
        centerLng: gmapsConfig.DEFAULT_LNG,
        zoom: gmapsConfig.TERRAIN.ZOOM_LEVEL,
        size: '640x640'
    };
    
    if (!config.apiKey || config.apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
        console.warn('⚠️ Google Maps API key no configurada');
        return createSatelliteTexture();
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 640;
    
    const texture = new THREE.CanvasTexture(canvas);
    
    // URL para Google Maps Static API
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?` +
        `center=${config.centerLat},${config.centerLng}&` +
        `zoom=${config.zoom}&` +
        `size=${config.size}&` +
        `maptype=satellite&` +
        `key=${config.apiKey}&` +
        `scale=2&` +
        `format=png`;
    
    console.log('📡 Google Maps URL generada:', staticMapUrl);
    console.log('⏳ Solicitando imagen satelital...');
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = function() {
        console.log('✅ Imagen satelital descargada exitosamente');
        console.log('📐 Tamaño de imagen:', img.width, 'x', img.height);
        ctx.drawImage(img, 0, 0);
        texture.needsUpdate = true;
        console.log('🛰️ Textura satelital de Google Maps aplicada al terreno');
    };
    
    img.onerror = function(error) {
        console.error('❌ Error cargando Google Maps Static API');
        console.error('🔍 Posibles causas:');
        console.error('   • API key inválida o sin permisos');
        console.error('   • Cuota de API agotada');
        console.error('   • Problema de CORS');
        console.error('   • URL malformada:', staticMapUrl);
        console.log('🎨 Usando textura procedural como respaldo');
        // El fallback ya está manejado en la función principal
    };
    
    img.src = staticMapUrl;
    
    return texture;
}

function createAircraft() {
    const aircraftGroup = new THREE.Group();
    
    // FIGHTER JET - F-16 Fighting Falcon (escala real)
    // Dimensiones reales: Longitud ~15m, Envergadura ~10m
    const scale = 1; // Escala 1:1 (tamaño real)
    
    // Fuselaje principal - más aerodinámico para fighter jet
    const fuselageGeometry = new THREE.CylinderGeometry(0.8 * scale, 0.3 * scale, 15 * scale, 12);
    fuselageGeometry.rotateX(Math.PI / 2);
    const fuselageMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2c3e50, // Gris militar
        transparent: false
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.castShadow = true;
    aircraftGroup.add(fuselage);
    
    // Nariz puntiaguda del F-16
    const noseGeometry = new THREE.ConeGeometry(0.3 * scale, 3 * scale, 12);
    noseGeometry.rotateX(-Math.PI / 2);
    const noseMaterial = new THREE.MeshLambertMaterial({ color: 0x34495e });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.set(0, 0, 9 * scale);
    nose.castShadow = true;
    aircraftGroup.add(nose);
    
    // Alas delta del F-16 - forma triangular característica
    const wingGeometry = createF16WingGeometry(scale);
    const wingMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x5d6d7e,
        side: THREE.DoubleSide 
    });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.set(0, -0.2 * scale, 1 * scale);
    wings.castShadow = true;
    aircraftGroup.add(wings);
    
    // Canard (aletas delanteras pequeñas del F-16)
    const canardGeometry = new THREE.BoxGeometry(3 * scale, 0.1 * scale, 0.8 * scale);
    const canards = new THREE.Mesh(canardGeometry, wingMaterial);
    canards.position.set(0, 0.1 * scale, 5 * scale);
    canards.castShadow = true;
    aircraftGroup.add(canards);
    
    // Cola vertical del F-16 (más grande y angular)
    const tailGeometry = createF16TailGeometry(scale);
    const tailMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(0, 0.5 * scale, -6 * scale);
    tail.castShadow = true;
    aircraftGroup.add(tail);
    
    // Intake de aire (característica distintiva del F-16)
    const intakeGeometry = new THREE.BoxGeometry(1.5 * scale, 1.2 * scale, 4 * scale);
    const intakeMaterial = new THREE.MeshLambertMaterial({ color: 0x1a252f });
    const intake = new THREE.Mesh(intakeGeometry, intakeMaterial);
    intake.position.set(0, -0.8 * scale, 2 * scale);
    intake.castShadow = true;
    aircraftGroup.add(intake);
    
    // Motor jet (escape del F-16)
    const engineGeometry = new THREE.CylinderGeometry(0.6 * scale, 0.8 * scale, 2 * scale, 12);
    engineGeometry.rotateX(Math.PI / 2);
    const engineMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8b4513,
        emissive: 0x220000 // Brillo rojizo del escape
    });
    const engine = new THREE.Mesh(engineGeometry, engineMaterial);
    engine.position.set(0, 0, -7.5 * scale);
    engine.castShadow = true;
    aircraftGroup.add(engine);
    
    // Misiles aire-aire (opcional - para realismo)
    createF16Missiles(aircraftGroup, scale, wingMaterial);
    
    // Cabina del piloto
    const cockpitGeometry = new THREE.SphereGeometry(0.8 * scale, 16, 8);
    const cockpitMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x001122,
        transparent: true,
        opacity: 0.3
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.5 * scale, 4 * scale);
    cockpit.castShadow = true;
    aircraftGroup.add(cockpit);
    
    aircraft = aircraftGroup;
    aircraft.position.copy(playerState.position);
    scene.add(aircraft);
    
    console.log('🚀 F-16 Fighting Falcon creado (tamaño real)');
}

// Crear alas delta del F-16 con forma triangular característica
function createF16WingGeometry(scale) {
    const shape = new THREE.Shape();
    
    // Forma delta característica del F-16
    shape.moveTo(0, 0);
    shape.lineTo(-5 * scale, -2 * scale);  // Punta izquierda del ala
    shape.lineTo(-1 * scale, -6 * scale);  // Raíz del ala izquierda
    shape.lineTo(1 * scale, -6 * scale);   // Raíz del ala derecha  
    shape.lineTo(5 * scale, -2 * scale);   // Punta derecha del ala
    shape.lineTo(0, 0);                    // Volver al centro
    
    const extrudeSettings = {
        depth: 0.3 * scale,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 2,
        bevelSize: 0.05 * scale,
        bevelThickness: 0.05 * scale
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

// Crear cola vertical del F-16
function createF16TailGeometry(scale) {
    const shape = new THREE.Shape();
    
    // Forma angular característica de la cola del F-16
    shape.moveTo(0, 0);
    shape.lineTo(-1.5 * scale, 0);
    shape.lineTo(-0.5 * scale, 4 * scale);
    shape.lineTo(0.5 * scale, 4 * scale);
    shape.lineTo(1.5 * scale, 0);
    shape.lineTo(0, 0);
    
    const extrudeSettings = {
        depth: 0.2 * scale,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.02 * scale,
        bevelThickness: 0.02 * scale
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

// Crear misiles aire-aire para el F-16
function createF16Missiles(aircraftGroup, scale, material) {
    // AIM-9 Sidewinder en las puntas de las alas
    for (let i = 0; i < 2; i++) {
        const missileGeometry = new THREE.CylinderGeometry(0.1 * scale, 0.08 * scale, 3 * scale, 8);
        missileGeometry.rotateX(Math.PI / 2);
        const missileMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const missile = new THREE.Mesh(missileGeometry, missileMaterial);
        
        // Posicionar misiles en las puntas de las alas
        missile.position.set(i === 0 ? -4 * scale : 4 * scale, -0.5 * scale, 0);
        missile.castShadow = true;
        aircraftGroup.add(missile);
        
        // Aletas del misil
        const finGeometry = new THREE.BoxGeometry(0.5 * scale, 0.05 * scale, 0.3 * scale);
        const fins = new THREE.Mesh(finGeometry, material);
        fins.position.copy(missile.position);
        fins.position.z -= 1 * scale;
        aircraftGroup.add(fins);
    }
    
    // AIM-120 AMRAAM bajo el fuselaje (opcional)
    const amraamGeometry = new THREE.CylinderGeometry(0.12 * scale, 0.10 * scale, 3.5 * scale, 8);
    amraamGeometry.rotateX(Math.PI / 2);
    const amraamMaterial = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const amraam = new THREE.Mesh(amraamGeometry, amraamMaterial);
    amraam.position.set(0, -1 * scale, 0);
    amraam.castShadow = true;
    aircraftGroup.add(amraam);
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
    
    // Verificar que la escena esté inicializada
    if (!scene) {
        console.log('Escena no inicializada, posponiendo agregar jugador', id);
        // Posponer hasta que la escena esté lista
        setTimeout(() => addOtherPlayer(id, position, rotation), 1000);
        return;
    }
    
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
    
    console.log(` Jugador ${id} agregado`);
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
    if (player && scene) {
        scene.remove(player.mesh);
        otherPlayers.delete(id);
        console.log(` Jugador ${id} eliminado`);
    }
}

function updateControls() {
    // Control de aceleración gradual con PageUp/PageDown
    if (keys.ArrowUp) {
        playerState.currentThrottle = Math.min(1, playerState.currentThrottle + playerState.throttleRate);
    }
    if (keys.ArrowDown) {
        playerState.currentThrottle = Math.max(0, playerState.currentThrottle - playerState.throttleRate);
    }

    // Determinar controles de vuelo
    const pitch = keys.KeyW ? -1 : (keys.KeyS ? 1 : 0);
    const roll = keys.KeyQ ? -1 : (keys.KeyE ? 1 : 0);
    const yaw = keys.KeyA ? -1 : (keys.KeyD ? 1 : 0);
    const vertical = keys.Space ? 1 : (keys.ShiftLeft ? -1 : 0);

    // Debug: mostrar controles activos
    const anyKeyPressed = Object.values(keys).some(k => k);
    if (anyKeyPressed) {
        console.log('🎮 Controles activos:', {
            W: keys.KeyW, S: keys.KeyS, A: keys.KeyA, D: keys.KeyD,
            Q: keys.KeyQ, E: keys.KeyE, UP: keys.ArrowUp, DOWN: keys.ArrowDown,
            SPACE: keys.Space, SHIFT: keys.ShiftLeft,
            pitch, roll, yaw, throttle: playerState.currentThrottle
        });
    }

    return {
        elevator: pitch,
        aileron: roll,
        rudder: yaw,
        throttle: playerState.currentThrottle,
        verticalInput: vertical
    };
}

function updatePhysics() {
    const input = updateControls();
    
    // Usar JSBSim para la simulación de física
    const state = jsbsim.update({
        elevator: input.elevator,
        aileron: input.aileron,
        rudder: input.rudder,
        throttle: input.throttle
    });

    if (state) {
        // Debug: mostrar estado recibido de JSBSim
        if (Math.random() < 0.01) { // Solo mostrar 1% de las veces para no saturar la consola
            console.log('🛩️ JSBSim state:', {
                pos: state.position,
                rot: state.rotation,
                vel: state.velocity
            });
        }
        
        // Actualizar estado del jugador con la simulación
        playerState.position = state.position;
        playerState.rotation = state.rotation;
        playerState.velocity = state.velocity;
        
        // Actualizar información de depuración
        updateDebugInfo();
    } else {
        console.warn('⚠️ JSBSim no devolvió estado válido');
    }
    
    // Actualizar modelo 3D
    if (aircraft) {
        aircraft.position.copy(playerState.position);
        aircraft.rotation.set(
            playerState.rotation.x,
            playerState.rotation.y,
            playerState.rotation.z
        );
    }
}

function updateDebugInfo() {
    if (!debugInfo) return;
    
    const debug = jsbsim.getDebugInfo();
    debugInfo.innerHTML = `
        <div>Altitud: ${debug.altitude ? debug.altitude.toFixed(1) : 0} ft</div>
        <div>Velocidad: ${debug.airspeed ? debug.airspeed.toFixed(1) : 0} kt</div>
        <div>Vel. Vertical: ${debug.verticalSpeed ? debug.verticalSpeed.toFixed(1) : 0} ft/min</div>
        <div>Acelerador: ${debug.throttle ? (debug.throttle * 100).toFixed(0) : 0}%</div>
    `;
}

function updateCamera() {
    if (!aircraft) return;
    
    // Actualizar posición objetivo (centro del avión)
    cameraOrbit.target.copy(aircraft.position);
    
    if (cameraOrbit.enabled) {
        // Modo orbital - cámara controlada por mouse
        updateOrbitalCamera();
    } else {
        // Modo tradicional - cámara fija detrás del avión
        updateTraditionalCamera();
    }
}

function updateOrbitalCamera() {
    // Calcular posición de cámara usando coordenadas esféricas
    const x = cameraOrbit.target.x + cameraOrbit.distance * 
        Math.cos(cameraOrbit.elevation) * Math.sin(cameraOrbit.azimuth);
    const y = cameraOrbit.target.y + cameraOrbit.distance * 
        Math.sin(cameraOrbit.elevation);
    const z = cameraOrbit.target.z + cameraOrbit.distance * 
        Math.cos(cameraOrbit.elevation) * Math.cos(cameraOrbit.azimuth);
    
    // Interpolar suavemente hacia la nueva posición
    const newPosition = new THREE.Vector3(x, y, z);
    camera.position.lerp(newPosition, 0.15);
    
    // Siempre mirar al avión
    camera.lookAt(cameraOrbit.target);
}

function updateTraditionalCamera() {
    // Cámara en tercera persona detrás del F-16 (ajustada para tamaño real)
    const distance = 100;  // Más lejos para ver el F-16 completo
    const height = 30;     // Más alto para mejor perspectiva
    
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

function gameLoop() {
    updatePhysics();
    updateCamera();
    updateOtherPlayersSmooth();
    updateHUD();
    updateRadar();
    sendInputToServer();
    renderer.render(scene, camera);
    
    requestAnimationFrame(gameLoop);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Solicitar jugadores cercanos cada 5 segundos
setInterval(requestNearbyPlayers, 5000);
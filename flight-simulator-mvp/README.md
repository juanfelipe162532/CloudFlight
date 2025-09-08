# ✈️ Simulador de Vuelo Multijugador - MVP

Un simulador de vuelo multijugador básico con baja latencia, construido con Three.js (cliente) y Node.js + WebSockets (servidor).

## 🎯 Características

- **Cliente 3D**: Avión controlable en entorno 3D con terreno y nubes
- **Controles realistas**: WASD para rotación, flechas para aceleración
- **Multijugador**: Hasta 100+ jugadores simultáneos con sincronización en tiempo real
- **Radar 2D**: Minimapa que muestra aviones cercanos (radio de 25km)
- **Baja latencia**: Predicción del lado del cliente con corrección del servidor
- **Radio de interés**: Solo sincroniza aviones cercanos para optimizar rendimiento

## 🛠️ Tecnologías

- **Cliente**: Three.js, JavaScript ESM, HTML5/CSS3
- **Servidor**: Node.js 18+, WebSockets (ws), ES Modules
- **Despliegue**: Vercel/Netlify (cliente), Railway/Render (servidor)

## 📦 Instalación Local

### Prerrequisitos
- Node.js 18 o superior
- npm o yarn

### 1. Clonar y configurar el proyecto

```bash
git clone <tu-repositorio>
cd flight-simulator-mvp
```

### 2. Instalar dependencias del servidor

```bash
cd server
npm install
```

### 3. Instalar dependencias del cliente

```bash
cd ../client
npm install
```

## 🚀 Ejecución Local

### 1. Iniciar el servidor (Terminal 1)

```bash
cd server
npm start
```

El servidor se iniciará en `http://localhost:8080`

### 2. Iniciar el cliente (Terminal 2)

```bash
cd client
npm run dev
```

El cliente se iniciará en `http://localhost:3000`

### 3. Abrir el juego

1. Ve a `http://localhost:3000` en tu navegador
2. Haz clic en "Entrar a Volar"
3. ¡Disfruta volando!

## 🎮 Controles

| Tecla | Acción |
|-------|--------|
| **W** | Nariz arriba (pitch up) |
| **S** | Nariz abajo (pitch down) |
| **A** | Girar izquierda (yaw left) |
| **D** | Girar derecha (yaw right) |
| **Q** | Roll izquierda |
| **E** | Roll derecha |
| **↑** | Acelerar (throttle up) |
| **↓** | Desacelerar/Retroceder |

## 🌐 Despliegue en la Nube

### Cliente (Vercel)

1. **Preparar el cliente**:
   ```bash
   cd client
   # Editar main.js línea 4: cambiar SERVER_URL a tu servidor de producción
   # const SERVER_URL = 'wss://tu-servidor.railway.app';
   ```

2. **Desplegar en Vercel**:
   ```bash
   npm i -g vercel
   vercel
   # Sigue las instrucciones para conectar tu cuenta
   ```

### Cliente (Netlify)

1. **Drag & Drop**: Arrastra la carpeta `client` a [netlify.com/drop](https://netlify.com/drop)
2. **Git**: Conecta tu repositorio en [netlify.com](https://netlify.com)
   - Build command: `npm run build`
   - Publish directory: `client`

### Servidor (Railway)

1. **Crear cuenta** en [railway.app](https://railway.app)
2. **Nuevo proyecto** → "Deploy from GitHub repo"
3. **Seleccionar** tu repositorio
4. Railway detectará automáticamente el `railway.json`
5. **Configurar variables**:
   - `NODE_ENV=production`
   - `PORT=8080` (automático)

### Servidor (Render)

1. **Crear cuenta** en [render.com](https://render.com)
2. **New → Web Service**
3. **Conectar** tu repositorio
4. **Configuración**:
   - Environment: `Node`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
   - Port: `8080`

### Servidor (Hetzner Cloud)

```bash
# 1. Crear servidor Ubuntu 22.04
# 2. SSH al servidor
ssh root@tu-ip

# 3. Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# 4. Clonar y configurar
git clone <tu-repo>
cd flight-simulator-mvp/server
npm install

# 5. Instalar PM2 para producción
npm install -g pm2
pm2 start server.js --name "flight-server"
pm2 startup
pm2 save

# 6. Configurar firewall
ufw allow 8080
ufw enable
```

## 🔧 Configuración de Producción

### Variables de Entorno

**Servidor**:
```bash
NODE_ENV=production
PORT=8080
```

**Cliente** (editar `main.js`):
```javascript
// Cambiar línea 4:
const SERVER_URL = 'wss://tu-servidor-de-produccion.com';
```

### Configuración CORS (si es necesario)

Si tienes problemas de CORS, agrega estas líneas al `server.js`:

```javascript
// Después de la línea 8
const cors = require('cors');
app.use(cors({
  origin: ['https://tu-cliente.vercel.app', 'https://tu-cliente.netlify.app'],
  credentials: true
}));
```

## 📊 Arquitectura del Sistema

### Cliente (Three.js)
- **Renderizado**: Scene, Camera, Renderer con shadows y fog
- **Física Local**: Predicción de movimiento para reducir latency
- **Interpolación**: Suaviza el movimiento de otros jugadores
- **Optimización**: Solo renderiza objetos visibles

### Servidor (Node.js + WebSockets)
- **Estado del Juego**: Map de jugadores con posición/rotación/velocidad
- **Autoridad**: El servidor valida toda la física y movimiento
- **Radio de Interés**: Solo envía datos de jugadores cercanos (50km)
- **Heartbeat**: Mantiene conexiones activas con ping/pong

### Protocolo de Comunicación

```javascript
// Cliente → Servidor
{
  type: 'input',
  input: { pitch: 0, yaw: 1, roll: 0, throttle: 0.5 }
}

// Servidor → Cliente
{
  type: 'playerUpdate',
  playerId: 'pilot_abc123',
  position: { x: 100, y: 1000, z: 200 },
  rotation: { x: 0.1, y: 0.5, z: 0 },
  velocity: { x: 50, y: 0, z: 30 }
}
```

## 🐛 Solución de Problemas

### Error: "No se pudo conectar al servidor"
- Verifica que el servidor esté ejecutándose
- Revisa la URL del WebSocket en `main.js`
- Comprueba que el puerto 8080 esté abierto

### Los aviones de otros jugadores no aparecen
- Verifica la conexión WebSocket en DevTools → Network
- Asegúrate de que múltiples clientes estén conectados
- Revisa que estén dentro del radio de interés (50km)

### Rendimiento bajo
- Reduce la calidad gráfica modificando `setupThreeJS()`
- Disminuye el número de nubes en `createTerrain()`
- Optimiza la distancia de renderizado en la cámara

### Problemas de WebSocket en producción
- Usa `wss://` (SSL) en producción, no `ws://`
- Configura certificados SSL en tu servidor
- Verifica que el firewall permita el puerto

## 🚀 Siguientes Pasos (Roadmap)

### Versión 1.1
- [ ] Modelos de avión 3D realistas
- [ ] Sistema de física más avanzado
- [ ] Efectos de sonido básicos
- [ ] Chat de texto entre jugadores

### Versión 1.2
- [ ] Salas privadas
- [ ] Sistema de combustible
- [ ] Condiciones climáticas
- [ ] Aeropuertos y pistas de aterrizaje

### Versión 2.0
- [ ] Cabina 3D interactiva
- [ ] Instrumentos de vuelo funcionales
- [ ] Sistema de misiones
- [ ] Ranking y estadísticas

## 🤝 Contribución

1. Fork el proyecto
2. Crea una branch (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'Agregar nueva característica'`)
4. Push a la branch (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - Ve el archivo `LICENSE` para más detalles.

## 🎮 Demo en Vivo

- **Cliente**: [https://tu-cliente.vercel.app](https://tu-cliente.vercel.app)
- **Servidor**: `wss://tu-servidor.railway.app`

## 📧 Soporte

¿Problemas o preguntas? Abre un [issue](https://github.com/tu-usuario/flight-simulator-mvp/issues) en GitHub.

---

**¡Desarrollado con ❤️ para la comunidad de simulación de vuelo!** ✈️
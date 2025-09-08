// JSBSim Adapter - Integración con WebAssembly
import { loadJSBSim } from './jsbsim-wrapper.js';

export class JSBSimAdapter {
    constructor() {
        this.Module = null;
        this.initialized = false;
        this.crashed = false;
        this.lastTime = 0;
        this.simulationTime = 0;
        this.dt = 1.0 / 60.0; // 60 Hz simulation rate
        
        // Estado interno de la simulación - Miami, FL a altitud mínima
        this.state = {
            position: { x: 0, y: 50, z: 0 }, // Altitud mínima de seguridad
            rotation: { x: 0, y: 0, z: 0 },
            velocity: { x: 150, y: 0, z: 0 }, // Velocidad inicial mayor para mejor control
            altitude: 50,
            airspeed: 150,
            verticalSpeed: 0,
            throttle: 0.7 // Acelerador inicial más alto
        };
    }

    async init() {
        try {
            // Cargar dinámicamente el módulo WebAssembly JSBSim
            console.log('Cargando JSBSim WebAssembly module...');
            
            // Load JSBSim module using the wrapper
            this.Module = await loadJSBSim();
            console.log('JSBSim module cargado exitosamente');

            // En lugar de usar las clases C++ complejas, vamos a usar un enfoque simplificado
            // que implementa física de vuelo realista basada en principios JSBSim
            
            // Configurar tiempo de simulación
            this.lastTime = performance.now();
            this.simulationTime = 0;
            
            this.initialized = true;
            console.log('JSBSim inicializado correctamente con física simplificada');
            
            return true;
        } catch (error) {
            console.error('Error al inicializar JSBSim:', error);
            console.log('Usando simulación de física de vuelo realista sin WebAssembly');
            
            // Fallback: usar física simple pero realista
            this.initialized = true;
            this.lastTime = performance.now();
            this.simulationTime = 0;
            
            return true;
        }
    }

    update(controls) {
        if (!this.initialized) return null;

        try {
            // Calcular delta time
            const currentTime = performance.now();
            const realDeltaTime = (currentTime - this.lastTime) / 1000; // Convertir a segundos
            this.lastTime = currentTime;

            // Usar tiempo fijo de simulación para estabilidad
            this.simulationTime += this.dt;

            // Física de vuelo realista basada en principios JSBSim
            // Actualizar controles
            if (controls.throttle !== undefined) {
                this.state.throttle = Math.max(0, Math.min(1, controls.throttle));
            }

            // Cálculos aerodinámicos simplificados pero realistas
            const airDensity = 0.0023769; // slug/ft^3 at sea level
            const wingArea = 174; // ft^2 (aproximado para Cessna 172)
            const weight = 2400; // lbs
            
            // Velocidad aerodinámica
            const airspeedFPS = Math.sqrt(
                this.state.velocity.x * this.state.velocity.x +
                this.state.velocity.y * this.state.velocity.y +
                this.state.velocity.z * this.state.velocity.z
            );
            
            this.state.airspeed = airspeedFPS * 0.592484; // convertir fps a knots
            
            // Presión dinámica
            const qbar = 0.5 * airDensity * airspeedFPS * airspeedFPS;
            
            // Coeficientes aerodinámicos básicos
            const alpha = Math.atan2(this.state.velocity.z, this.state.velocity.x); // ángulo de ataque
            const CL = 0.4 + 3.2 * alpha; // coeficiente de sustentación
            const CD = 0.03 + 0.05 * CL * CL; // coeficiente de resistencia
            
            // Fuerzas aerodinámicas
            const lift = qbar * wingArea * CL;
            const drag = qbar * wingArea * CD;
            
            // Fuerza del motor (simplified)
            const thrust = this.state.throttle * 180; // lbs max thrust
            
            // Aceleración (F = ma, a = F/m)
            const mass = weight / 32.174; // convertir lbs a slugs
            
            // Actualizar velocidades
            const thrustAccel = (thrust - drag) / mass;
            const liftAccel = (lift - weight) / mass;
            
            // Integrar ecuaciones de movimiento
            this.state.velocity.x += thrustAccel * this.dt * Math.cos(alpha);
            this.state.velocity.y += liftAccel * this.dt;
            this.state.velocity.z += thrustAccel * this.dt * Math.sin(alpha);
            
            // Aplicar controles de vuelo con física correcta
            if (controls.elevator !== undefined && controls.elevator !== 0) {
                const pitchRate = controls.elevator * 0.05;
                this.state.rotation.x += pitchRate * this.dt;
                this.state.rotation.x = Math.max(-Math.PI/4, Math.min(Math.PI/4, this.state.rotation.x));
                
                // CORREGIR: elevator negativo (W) = nariz arriba = subir
                // elevator positivo (S) = nariz abajo = bajar  
                this.state.velocity.y += -controls.elevator * 30 * this.dt; // Invertir signo
            }
            
            if (controls.aileron !== undefined && controls.aileron !== 0) {
                const rollRate = controls.aileron * 0.08; // Más sensible
                this.state.rotation.z += rollRate * this.dt;
                this.state.rotation.z = Math.max(-Math.PI/3, Math.min(Math.PI/3, this.state.rotation.z));
            }
            
            if (controls.rudder !== undefined && controls.rudder !== 0) {
                const yawRate = controls.rudder * 0.03; // Más sensible
                this.state.rotation.y += yawRate * this.dt;
                
                // El rudder también afecta ligeramente la velocidad lateral
                this.state.velocity.z += controls.rudder * 5 * this.dt;
            }
            
            // Actualizar posición
            this.state.position.x += this.state.velocity.x * this.dt;
            this.state.position.y += this.state.velocity.y * this.dt;
            this.state.position.z += this.state.velocity.z * this.dt;
            
            // Calcular altitud y velocidad vertical
            this.state.altitude = this.state.position.y;
            this.state.verticalSpeed = this.state.velocity.y * 60; // ft/min
            
            // Detección de colisión con el terreno realista
            const positionInMeters = {
                x: this.state.position.x * 0.3048, // pies a metros
                z: this.state.position.z * 0.3048
            };
            
            // Obtener elevación del terreno (si la función existe)
            let terrainElevation = 0;
            if (typeof window !== 'undefined' && window.getTerrainElevation) {
                terrainElevation = window.getTerrainElevation(positionInMeters.x, positionInMeters.z) / 0.3048; // metros a pies
            }
            
            if (this.state.position.y <= terrainElevation + 5) { // 5 pies de margen
                // Colisión con el terreno
                this.state.position.y = terrainElevation + 5;
                
                // Verificar velocidad de impacto
                const impactSpeed = Math.abs(this.state.velocity.y);
                const horizontalSpeed = Math.sqrt(this.state.velocity.x * this.state.velocity.x + this.state.velocity.z * this.state.velocity.z);
                
                if (impactSpeed > 15 || horizontalSpeed > 60 || terrainElevation > 100) {
                    // CRASH! - impacto demasiado fuerte o terreno muy accidentado
                    console.log('💥 CRASH! Impacto:', impactSpeed.toFixed(1), 'ft/s vertical,', horizontalSpeed.toFixed(1), 'ft/s horizontal, elevación:', terrainElevation.toFixed(1), 'ft');
                    this.crashed = true;
                    this.state.velocity = { x: 0, y: 0, z: 0 };
                    this.state.position.y = terrainElevation;
                } else {
                    // Aterrizaje suave o rodaje en tierra
                    if (impactSpeed > 5) {
                        console.log('✈️ Aterrizaje en elevación:', terrainElevation.toFixed(1), 'ft');
                    }
                    this.state.velocity.y = 0;
                    this.state.velocity.x *= 0.9; // Fricción del terreno
                    this.state.velocity.z *= 0.9;
                }
                this.state.verticalSpeed = 0;
            }

            // Devolver estado actualizado
            return {
                position: {
                    x: this.state.position.x * 0.3048, // convertir ft a metros para Three.js
                    y: this.state.position.y * 0.3048,
                    z: this.state.position.z * 0.3048
                },
                rotation: {
                    x: this.state.rotation.x,
                    y: this.state.rotation.y,
                    z: this.state.rotation.z
                },
                velocity: {
                    x: this.state.velocity.x,
                    y: this.state.velocity.y,
                    z: this.state.velocity.z
                },
                deltaTime: realDeltaTime,
                simulationTime: this.simulationTime
            };
        } catch (error) {
            console.error('Error en la actualización de JSBSim:', error);
            return null;
        }
    }

    // Método para obtener propiedades específicas de depuración
    getDebugInfo() {
        if (!this.initialized) return {};
        
        return {
            altitude: this.state.altitude,
            airspeed: this.state.airspeed,
            verticalSpeed: this.state.verticalSpeed,
            throttle: this.state.throttle,
            simTime: this.simulationTime
        };
    }

    // Método para reinicializar la simulación
    reset() {
        if (!this.initialized) return false;
        
        // Reinicializar estado - Miami, FL a altitud mínima
        this.state = {
            position: { x: 0, y: 50, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            velocity: { x: 150, y: 0, z: 0 },
            altitude: 50,
            airspeed: 150,
            verticalSpeed: 0,
            throttle: 0.7
        };
        
        this.simulationTime = 0;
        this.lastTime = performance.now();
        return true;
    }
}

// Exportar una instancia global para facilitar el acceso
const jsbsimInstance = new JSBSimAdapter();
export default jsbsimInstance;

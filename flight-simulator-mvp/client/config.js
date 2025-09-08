// CloudFlight Simulator - Configuration
// Configure your Google Maps API key here

const CONFIG = {
    // Google Maps Configuration
    GOOGLE_MAPS: {
        // ⚠️ IMPORTANT: Get your API key from: https://console.cloud.google.com/
        // Enable the following APIs:
        // 1. Maps Static API
        // 2. Maps JavaScript API  
        // 3. Map Tiles API (optional, for advanced usage)
        API_KEY: 'AIzaSyAEbtTWY0d0SbSpSJGh1SRWCyeNkb7Jq4o',
        
        // Default location - Miami, FL
        DEFAULT_LAT: 25.7861,    // 25°47'10"N 
        DEFAULT_LNG: -80.3103,   // 80°18'37"W
        
        // Terrain settings
        TERRAIN: {
            ZOOM_LEVEL: 14,       // Higher = more detail (10-18 recommended)
            IMAGE_SIZE: 2048,     // Texture resolution
            COVERAGE_AREA: 4      // How many tiles per side (more = larger area)
        }
    },
    
    // Aircraft settings
    AIRCRAFT: {
        STARTING_ALTITUDE: 50,    // feet - altitud mínima de seguridad
        STARTING_SPEED: 150,      // fps
        STARTING_THROTTLE: 0.7    // 0-1
    },
    
    // Network settings
    SERVER_URL: 'ws://localhost:8080'
};

// Make config globally available
window.FLIGHT_CONFIG = CONFIG;

// Instructions for getting Google Maps API key:
console.log(`
🛰️ GOOGLE MAPS SETUP INSTRUCTIONS:

1. Go to: https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable these APIs:
   - Maps Static API
   - Maps JavaScript API
4. Create credentials (API Key)
5. Replace 'YOUR_GOOGLE_MAPS_API_KEY' in config.js
6. Optional: Restrict API key to your domain

💡 Pricing: ~$2-7 per 1000 requests  
📍 Current location: Miami, FL (25°47'10"N 80°18'37"W)
✈️  Starting altitude: 50 feet (minimum safe altitude)
`);
// JSBSim WebAssembly Wrapper for ES6 modules
// This wrapper helps load the Emscripten-compiled JSBSim module

let JSBSimModule = null;
let isLoading = false;

export async function loadJSBSim() {
    if (JSBSimModule) {
        return JSBSimModule;
    }
    
    if (isLoading) {
        // Wait for loading to complete
        while (isLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return JSBSimModule;
    }
    
    isLoading = true;
    
    try {
        console.log('Loading JSBSim WebAssembly module...');
        
        // Configure Module before loading - simple approach
        window.Module = {
            preRun: [],
            postRun: [],
            print: function(text) {
                console.log('JSBSim:', text);
            },
            printErr: function(text) {
                console.error('JSBSim error:', text);
            },
            onRuntimeInitialized: function() {
                console.log('JSBSim WebAssembly runtime initialized');
            },
            arguments: ['--aircraft=ball', '--initfile=reset01', '--end=1'], // Argumentos por defecto
            noInitialRun: true, // No ejecutar main() automáticamente
        };
        
        // Load the Emscripten module
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './jsbsim/jsbsim.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        
        // Wait for the Module to be initialized
        if (typeof window.Module !== 'undefined') {
            console.log('JSBSim module found globally, waiting for initialization...');
            
            JSBSimModule = await new Promise((resolve, reject) => {
                const originalOnReady = window.Module.onRuntimeInitialized;
                window.Module.onRuntimeInitialized = () => {
                    if (originalOnReady) originalOnReady();
                    
                    try {
                        console.log('JSBSim ready - skipping filesystem setup');
                        resolve(window.Module);
                    } catch (error) {
                        console.error('Error in JSBSim initialization:', error);
                        reject(error);
                    }
                };
                
                // If already initialized
                if (window.Module.runtimeInitialized) {
                    window.Module.onRuntimeInitialized();
                }
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    reject(new Error('JSBSim initialization timeout'));
                }, 10000);
            });
        } else {
            throw new Error('JSBSim Module not found after loading script');
        }
        
        isLoading = false;
        return JSBSimModule;
        
    } catch (error) {
        isLoading = false;
        console.error('Failed to load JSBSim module:', error);
        throw error;
    }
}
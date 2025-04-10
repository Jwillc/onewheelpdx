// script.js
console.log('Script start');

// --- Keep Global Variables ---
let map;
let overlay;
let threeScene, threeCamera, threeRenderer;
let markerModel; // Reference to the loaded 3D model
let targetLatLng = null;
let loader; // GLTF loader

// --- Configuration ---
const TARGET_ADDRESS = "4975 NE 14th Pl, Portland, OR 97211";
const INITIAL_MAP_CENTER = { lat: 45.558, lng: -122.651 }; // Portland center
const INITIAL_MAP_ZOOM = 20;
const OBJECT_ALTITUDE = 15; // Lowered altitude to position marker closer to the ground
// 3D model URL - you can use Google's pin or your own GLTF model
const MODEL_URL = "assets/onewheel_pint.glb";

// Fetch map configuration from serverless function
async function fetchMapConfig() {
    try {
        const response = await fetch('/api/map-config.js');
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch map configuration:", error);
        return null;
    }
}

// Load Google Maps API dynamically
function loadGoogleMapsAPI(apiKey) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geocoding&v=beta&callback=googleMapsCallback`;
        script.async = true;
        script.defer = true;
        script.onerror = reject;
        document.head.appendChild(script);

        // Create a global callback function that Google Maps will call
        window.googleMapsCallback = () => {
            resolve();
        };
    });
}

// Initialize everything
async function initializeApp() {
    try {
        // Get map configuration
        const config = await fetchMapConfig();
        if (!config) {
            throw new Error("Could not load map configuration");
        }

        // Load Google Maps API
        await loadGoogleMapsAPI(config.apiKey);

        // Initialize map with the secure mapId
        initMap(config.mapId);
    } catch (error) {
        console.error("Failed to initialize:", error);
        alert("Failed to load map. Please check the console for details.");
    }
}

// Initialize the map (modified to accept mapId parameter)
function initMap(mapId) {
    console.log('initMap start');

    // Create the map with normal scroll behavior
    map = new google.maps.Map(document.getElementById("map"), {
        center: INITIAL_MAP_CENTER,
        zoom: INITIAL_MAP_ZOOM,
        mapId: mapId,
        tilt: 45,
        heading: 0,
        disableDefaultUI: false, // Enable default UI controls
        gestureHandling: "greedy" // This gives standard scroll wheel behavior
    });

    // Geocode the target address
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: TARGET_ADDRESS }, (results, status) => {
        if (status === "OK" && results[0]) {
            targetLatLng = results[0].geometry.location;
            console.log(`Geocoded Address: ${TARGET_ADDRESS}`, targetLatLng.lat(), targetLatLng.lng());
            map.setCenter(targetLatLng);
            map.setZoom(INITIAL_MAP_ZOOM);

            // Initialize the WebGL Overlay with 3D model
            initWebGLOverlay();
        } else {
            console.error(`Geocode was not successful for the following reason: ${status}`);
            alert(`Could not find coordinates for: ${TARGET_ADDRESS}`);
        }
    });
}

// Initialize WebGL overlay with GLTF model
function initWebGLOverlay() {
    if (!targetLatLng) {
        console.error("Target LatLng not available for WebGL Overlay.");
        return;
    }

    overlay = new google.maps.WebGLOverlayView();

    // --- WebGL Overlay Lifecycle Hooks ---
    overlay.onAdd = () => {
        console.log("WebGLOverlayView: onAdd");

        // Set up the THREE.js scene
        threeScene = new THREE.Scene();
        threeCamera = new THREE.PerspectiveCamera();

        // Set up lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
        threeScene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0.5, -1, 0.5);
        directionalLight.castShadow = true;
        threeScene.add(directionalLight);

        // Load the GLTF model
        loader = new THREE.GLTFLoader();

        loader.load(
            MODEL_URL,
            (gltf) => {
                console.log("GLTF model loaded successfully");

                // Scale and position the model
                gltf.scene.scale.set(20, 20, 20);

                // Rotate the model to point downward (like a pin)
                gltf.scene.rotation.x = 7.84;
                gltf.scene.rotation.z = -0.40;

                // Store reference to the model
                markerModel = gltf.scene;

                // Add the model to the scene
                threeScene.add(markerModel);
            },
            (progress) => {
                console.log("Loading progress:", (progress.loaded / progress.total * 100) + "%");
            },
            (error) => {
                console.error("Error loading GLTF model:", error);
            }
        );
    };

    overlay.onContextRestored = ({ gl }) => {
        console.log("WebGLOverlayView: onContextRestored");

        // Create renderer using the map's WebGL context
        threeRenderer = new THREE.WebGLRenderer({
            canvas: gl.canvas,
            context: gl,
            ...gl.getContextAttributes(),
            alpha: true,
            antialias: true,
        });

        threeRenderer.autoClear = false;
        threeRenderer.shadowMap.enabled = true;
        threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Optional: Add animation for camera movement
        if (loader) {
            loader.manager.onLoad = () => {
                // Start a simple animation loop
                let animationFrame;
                const animate = () => {
                    animationFrame = requestAnimationFrame(animate);

                    if (markerModel) {
                        // Rotate or animate the model if desired
                        markerModel.rotation.y += 0.01; // Gentle rotation around vertical axis
                    }

                    // Request redraw
                    overlay.requestRedraw();
                };

                animate();
            };
        }
    };

    overlay.onDraw = ({ gl, transformer }) => {
        if (!threeScene || !threeCamera || !threeRenderer || !targetLatLng) return;

        // Transform the marker to the correct lat/lng position at lower altitude
        const matrix = transformer.fromLatLngAltitude({
            lat: targetLatLng.lat(),
            lng: targetLatLng.lng(),
            altitude: OBJECT_ALTITUDE
        });

        // Update the camera
        threeCamera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);

        // Render the scene
        threeRenderer.render(threeScene, threeCamera);

        // Reset the WebGL state
        threeRenderer.resetState();
    };

    overlay.onRemove = () => {
        console.log("WebGLOverlayView: onRemove");

        // Clean up THREE.js resources
        if (threeScene) {
            threeScene.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }

        if (threeRenderer) {
            threeRenderer.dispose();
            threeRenderer = null;
        }

        threeScene = null;
        threeCamera = null;
        markerModel = null;
    };

    // Add the overlay to the map
    overlay.setMap(map);
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
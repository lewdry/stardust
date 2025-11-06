// Device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || ('ontouchstart' in window) 
    || (navigator.maxTouchPoints > 0);

// Configuration constants - optimized for device type
const particleCount = isMobile ? 3000 : 5000; // Further reduced particle count for mobile
const BASE_INTERACTION_RADIUS = isMobile ? 10 : 15; // Smaller interaction radius on mobile
const maxInteractionTime = 10000; // 10 seconds in milliseconds
const dragFactor = 0.98;
const flickSpeed = 5;
const EDGE_BUFFER = 1; // 1px buffer from edges
const ATTRACTION_SPEED = 0.1;
const PARTICLE_DRIFT_SPEED = isMobile ? 0.004 : 0.005; // Slightly reduced drift on mobile
const FLICK_DISTANCE_THRESHOLD = 5;
const VELOCITY_THRESHOLD = 0.1;
const VELOCITY_THRESHOLD_SQUARED = VELOCITY_THRESHOLD * VELOCITY_THRESHOLD;
const FAMILY_PARTICLE_SIZE = 4;
const REGULAR_PARTICLE_SIZE = 1;
const TOUCH_BUFFER = 5; // Extra tolerance for touch events
const ATTRACTION_PERCENTAGE = 0.001;

// Runtime variables
let interactionRadius = BASE_INTERACTION_RADIUS;
let mouse = { x: 0, y: 0 };
let prevMouse = { x: 0, y: 0 };
let isInteracting = false;
let interactionStartTime = 0;

// Adaptive frame rate control
let lastFrameTime = 0;
let frameCount = 0;
let performanceMonitorTime = 0;
let adaptiveFrameSkip = false;

// Start with full frame rate, adapt based on performance
const baseFrameInterval = 1000 / 60; // Target 60fps initially
let currentFrameInterval = baseFrameInterval;

let particles = [];
let familyParticles = []; // Array to store family particles separately
let canvas, ctx;
let bgCanvas, bgCtx; // background canvas and context for dithered gradient
let dpr, scale;  // Device pixel ratio and scale

// Define family members' colors with pre-parsed RGB values
const familyColors = [
    { name: 'Daisy', color: 'rgb(78, 237, 229)', r: 78, g: 237, b: 229 },
    { name: 'Elliot', color: 'rgb(93, 98, 245)', r: 93, g: 98, b: 245 },
    { name: 'Cassie', color: 'rgb(189, 109, 242)', r: 189, g: 109, b: 242 },
    { name: 'Lewis', color: 'rgb(250, 151, 75)', r: 250, g: 151, b: 75 }
];

function init() {
    canvas = document.getElementById('stardust');
    bgCanvas = document.getElementById('stardust-bg');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    ctx = canvas.getContext('2d');
    if (bgCanvas) {
        bgCtx = bgCanvas.getContext('2d');
    }
    if (!ctx) {
        console.error('Failed to get 2D context');
        return;
    }

    // Get the device pixel ratio and scale
    dpr = window.devicePixelRatio || 1;
    scale = 1 / dpr;

    resizeCanvas();

    // Create the dithered background once (resizeCanvas will also recreate on window resize)
    if (bgCtx) createDitheredBackground();

    // Clear the particles arrays first
    particles = [];
    familyParticles = [];

    // Create family member particles
    familyColors.forEach(member => {
        const particle = {
            x: Math.random() * (canvas.width / dpr),
            y: Math.random() * (canvas.height / dpr),
            state: 'free',
            velocity: { x: 0, y: 0 },
            brightness: 1,
            color: member.color,
            r: member.r,
            g: member.g,
            b: member.b,
            name: member.name,
            size: FAMILY_PARTICLE_SIZE
        };
        particles.push(particle);
        familyParticles.push(particle); // Add to family array
    });

    // Create remaining particles
    for (let i = 0; i < particleCount - familyColors.length; i++) {
        particles.push({
            x: Math.random() * (canvas.width / dpr),
            y: Math.random() * (canvas.height / dpr),
            state: 'free',
            velocity: { x: 0, y: 0 },
            brightness: Math.random(),
            color: 'white',
            size: REGULAR_PARTICLE_SIZE
        });
    }

    console.log(`Initialized ${particles.length} particles on canvas ${canvas.width}x${canvas.height} (logical: ${canvas.width/dpr}x${canvas.height/dpr})`);
    console.log(`Device: ${isMobile ? 'Mobile' : 'Desktop'}, Particles: ${particleCount}`);

    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousedown', onInteractionStart);
    canvas.addEventListener('mouseup', onInteractionEnd);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchstart', onInteractionStart);
    canvas.addEventListener('touchend', onInteractionEnd);
    canvas.addEventListener('touchmove', onTouchMove);

    // Start the animation loop
    requestAnimationFrame(updateAndRender);
}

function resizeCanvas() {
    if (!canvas || !ctx) return; // Safety check
    
    // Get the visible viewport dimensions
    const visibleWidth = document.documentElement.clientWidth;
    const visibleHeight = window.innerHeight;

    // Set canvas size accounting for device pixel ratio and visible area
    canvas.width = visibleWidth * dpr;
    canvas.height = visibleHeight * dpr;
    
    // Scale the canvas back down with CSS
    canvas.style.width = `${visibleWidth}px`;
    canvas.style.height = `${visibleHeight}px`;

    // Resize background canvas (physical pixels) and style
    if (bgCanvas && bgCtx) {
        bgCanvas.width = visibleWidth * dpr;
        bgCanvas.height = visibleHeight * dpr;
        bgCanvas.style.width = `${visibleWidth}px`;
        bgCanvas.style.height = `${visibleHeight}px`;
        // Clear any transforms for direct imageData writes
        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
        // Recreate the dithered background for the new size
        createDitheredBackground();
    }

    // Reset and scale the context to ensure correct drawing operations
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any previous transformations
    ctx.scale(dpr, dpr);

    // Adjust interaction radius for high DPI (but store it in logical pixels for consistency)
    interactionRadius = BASE_INTERACTION_RADIUS;

    // Reposition particles within the new logical canvas area
    particles.forEach(particle => {
        particle.x = Math.random() * visibleWidth;
        particle.y = Math.random() * visibleHeight;
        particle.state = 'free';
        particle.velocity = { x: 0, y: 0 };
    });
}

// Ordered Bayer 8x8 matrix (values 0..63)
const BAYER8 = [
    [0,48,12,60,3,51,15,63],
    [32,16,44,28,35,19,47,31],
    [8,56,4,52,11,59,7,55],
    [40,24,36,20,43,27,39,23],
    [2,50,14,62,1,49,13,61],
    [34,18,46,30,33,17,45,29],
    [10,58,6,54,9,57,5,53],
    [42,26,38,22,41,25,37,21]
];

// Create a dithered vertical gradient on the background canvas using ordered dithering.
function createDitheredBackground() {
    if (!bgCanvas || !bgCtx) return;

    const width = bgCanvas.width;   // physical pixels
    const height = bgCanvas.height; // physical pixels

    // Colors: darker at top -> lighter at bottom (t in [0,1])
    const top = { r: 3, g: 1, b: 21 };    // similar to existing background (#030115)
    const bottom = { r: 30, g: 35, b: 70 }; // lighter bluish at bottom

    // Number of quantization levels per channel (old-school look)
    const LEVELS = 8;

    const data = bgCtx.createImageData(width, height);
    const pixels = data.data;

    for (let y = 0; y < height; y++) {
        // Normalized vertical position: 0 at top, 1 at bottom
        const t = y / (height - 1 || 1);

        // Interpolate base color at this row
        const baseR = top.r * (1 - t) + bottom.r * t;
        const baseG = top.g * (1 - t) + bottom.g * t;
        const baseB = top.b * (1 - t) + bottom.b * t;

        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Ordered dither threshold from Bayer matrix normalized to [0,1)
            const threshold = BAYER8[y & 7][x & 7] / 64;

            // For each channel, quantize with ordered dither
            const qR = quantizeWithThreshold(baseR, LEVELS, threshold);
            const qG = quantizeWithThreshold(baseG, LEVELS, threshold);
            const qB = quantizeWithThreshold(baseB, LEVELS, threshold);

            pixels[idx] = qR;
            pixels[idx + 1] = qG;
            pixels[idx + 2] = qB;
            pixels[idx + 3] = 255;
        }
    }

    // Put the generated image (physical pixels) directly onto the bg canvas
    bgCtx.putImageData(data, 0, 0);
}

function quantizeWithThreshold(value, levels, threshold) {
    // value is in 0..255; convert to 0..1
    const norm = Math.max(0, Math.min(1, value / 255));
    const scaled = norm * (levels - 1);
    const base = Math.floor(scaled);
    const frac = scaled - base;
    const bumped = frac > threshold ? base + 1 : base;
    const out = Math.round((bumped / (levels - 1)) * 255);
    return out;
}

function onInteractionStart(event) {
    // Check if it's a touch event
    if (event.touches && event.touches.length > 0) {
        // For touch events, only prevent default if the touch is within bounds
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches[0];
        const rawX = (touch.clientX - rect.left) * dpr;
        const rawY = (touch.clientY - rect.top) * dpr;
        
        if (isPositionInBounds(rawX, rawY)) {
            event.preventDefault();
            isInteracting = true;
            interactionStartTime = Date.now();
            prevMouse = { ...mouse };
            updateTouchPosition(event);
            flickParticles();
        }
    } else if (event.clientX !== undefined && event.clientY !== undefined) {
        // For mouse events, keep the original behavior
        event.preventDefault();
        isInteracting = true;
        interactionStartTime = Date.now();
        prevMouse = { ...mouse };
        updateMousePosition(event);
        flickParticles();
    }
}

function onInteractionEnd(event) {
    event.preventDefault(); // Prevent default touch behavior
    isInteracting = false;
    interactionStartTime = 0;
    interactionRadius = BASE_INTERACTION_RADIUS; // Reset to initial radius in logical pixels
}

function onMouseMove(event) {
    prevMouse = { ...mouse };
    updateMousePosition(event);
    if (isInteracting) {
        flickParticles();
    }
}

function onTouchMove(event) {
    if (isInteracting && event.touches && event.touches.length > 0) {
        event.preventDefault();
        prevMouse = { ...mouse };
        updateTouchPosition(event);
        flickParticles();
    } else if (!event.touches || event.touches.length === 0) {
        // If touches array is empty or undefined, end interaction
        isInteracting = false;
        interactionStartTime = 0;
    }
}

function isPositionInBounds(x, y) {
    const buffer = EDGE_BUFFER * dpr;
    const touchBuffer = TOUCH_BUFFER * dpr; // Add extra tolerance for touch events
    
    return x >= (buffer - touchBuffer) && 
           x <= (canvas.width - buffer + touchBuffer) && 
           y >= (buffer - touchBuffer) && 
           y <= (canvas.height - buffer + touchBuffer);
}

function constrainToCanvas(value, max) {
    const buffer = EDGE_BUFFER;
    const maxLogical = max / dpr;
    return Math.max(buffer, Math.min(value, maxLogical - buffer));
}

function updateMousePosition(event) {
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    
    // Only update mouse position if it's within bounds
    if (rawX >= 0 && rawX <= rect.width && rawY >= 0 && rawY <= rect.height) {
        mouse.x = constrainToCanvas(rawX, canvas.width);
        mouse.y = constrainToCanvas(rawY, canvas.height);
    } else {
        // If mouse goes out of bounds, end the interaction
        isInteracting = false;
        interactionStartTime = 0;
    }
}

function updateTouchPosition(event) {
    if (event.touches && event.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches[0];
        
        // Calculate position in logical canvas space
        const rawX = touch.clientX - rect.left;
        const rawY = touch.clientY - rect.top;
        
        // Add some tolerance for touch events
        const touchBuffer = TOUCH_BUFFER;
        
        if (rawX >= -touchBuffer && 
            rawX <= rect.width + touchBuffer && 
            rawY >= -touchBuffer && 
            rawY <= rect.height + touchBuffer) {
            
            // Constrain the actual position to within the canvas
            mouse.x = constrainToCanvas(rawX, canvas.width);
            mouse.y = constrainToCanvas(rawY, canvas.height);
        } else {
            // Touch went out of bounds, end interaction
            isInteracting = false;
            interactionStartTime = 0;
        }
    }
}

function getDynamicInteractionRadius() {
    const elapsedTime = Math.min(Date.now() - interactionStartTime, maxInteractionTime);
    const progress = elapsedTime / maxInteractionTime;

    // Calculate the max radius using logical pixels
    const maxRadius = Math.min(canvas.width / dpr, canvas.height / dpr) / 2;

    // Return the radius in logical pixels
    return BASE_INTERACTION_RADIUS + (maxRadius - BASE_INTERACTION_RADIUS) * progress;
}

function attractParticles() {
    const currentRadius = getDynamicInteractionRadius();
    const maxParticlesToAttract = Math.floor(particleCount * ATTRACTION_PERCENTAGE);
    let attractedCount = 0;

    // Early exit if no particles should be attracted
    if (maxParticlesToAttract === 0) return;

    // Use squared radius for distance comparisons (avoids sqrt)
    const radiusSquared = currentRadius * currentRadius;
    const boundingBox = {
        left: mouse.x - currentRadius,
        right: mouse.x + currentRadius,
        top: mouse.y - currentRadius,
        bottom: mouse.y + currentRadius
    };

    for (let i = 0; i < particles.length && attractedCount < maxParticlesToAttract; i++) {
        const particle = particles[i];
        
        if (particle.state !== 'free') continue;

        // Quick bounding box check first
        if (particle.x < boundingBox.left || particle.x > boundingBox.right ||
            particle.y < boundingBox.top || particle.y > boundingBox.bottom) {
            continue;
        }

        // Squared distance calculation (no sqrt needed)
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
            particle.state = 'attracted';
            attractedCount++;
        }
    }
}

function flickParticles() {
    const mouseVelocity = {
        x: mouse.x - prevMouse.x,
        y: mouse.y - prevMouse.y
    };

    // Pre-calculate squared threshold
    const flickThreshold = FLICK_DISTANCE_THRESHOLD * FLICK_DISTANCE_THRESHOLD;

    particles.forEach(particle => {
        if (particle.state !== 'attracted') return;

        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= flickThreshold) {
            const angle = Math.atan2(mouseVelocity.y, mouseVelocity.x) + (Math.random() - 0.5) * Math.PI / 9;
            const speed = Math.sqrt(mouseVelocity.x * mouseVelocity.x + mouseVelocity.y * mouseVelocity.y) * flickSpeed;
            particle.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            particle.state = 'flicked';
        }
    });
}

function updateAndRender(currentTime) {
    // Adaptive frame rate control
    const deltaTime = currentTime - lastFrameTime;
    
    // Performance monitoring every 60 frames
    frameCount++;
    if (frameCount === 1) {
        performanceMonitorTime = currentTime;
    } else if (frameCount >= 60) {
        const avgFrameTime = (currentTime - performanceMonitorTime) / 60;
        
        // If we're consistently over 20ms per frame on mobile, enable frame skipping
        if (isMobile && avgFrameTime > 20) {
            adaptiveFrameSkip = true;
            currentFrameInterval = 1000 / 45; // Reduce to 45fps
        } else if (isMobile && avgFrameTime < 14) {
            adaptiveFrameSkip = false;
            currentFrameInterval = baseFrameInterval; // Back to 60fps
        }
        
        frameCount = 0;
    }
    
    // Apply frame limiting only if performance requires it
    if (adaptiveFrameSkip && deltaTime < currentFrameInterval) {
        requestAnimationFrame(updateAndRender);
        return;
    }
    
    lastFrameTime = currentTime;

    // Clear the entire logical canvas area
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw non-family particles first
    particles.forEach(particle => {
        if (!particle.name) {
            // Draw and update non-family particles
            updateParticle(particle);
            drawParticle(particle);
        }
    });

    // Draw family particles on top
    familyParticles.forEach(particle => {
        updateParticle(particle);
        drawParticle(particle);
    });

    if (isInteracting) {
        attractParticles();
    }

    // Continue the animation loop
    requestAnimationFrame(updateAndRender);
}

function updateParticle(particle) {
    const canvasLogicalWidth = canvas.width / dpr;
    const canvasLogicalHeight = canvas.height / dpr;
    
    if (particle.state === 'attracted') {
        particle.x += (mouse.x - particle.x) * ATTRACTION_SPEED;
        particle.y += (mouse.y - particle.y) * ATTRACTION_SPEED;
    } else if (particle.state === 'flicked') {
        // Update position
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;

        // Constrain to canvas with buffer (working in logical coordinates)
        particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
        particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));

        // Bounce off edges
        if (particle.x <= EDGE_BUFFER || particle.x >= canvasLogicalWidth - EDGE_BUFFER) {
            particle.velocity.x *= -1;
        }
        if (particle.y <= EDGE_BUFFER || particle.y >= canvasLogicalHeight - EDGE_BUFFER) {
            particle.velocity.y *= -1;
        }

        // Apply drag
        particle.velocity.x *= dragFactor;
        particle.velocity.y *= dragFactor;

        // If particle has slowed down significantly, set it free
        const velocityMagnitudeSquared = particle.velocity.x * particle.velocity.x + particle.velocity.y * particle.velocity.y;
        if (velocityMagnitudeSquared < VELOCITY_THRESHOLD_SQUARED) {
            particle.state = 'free';
            particle.velocity = { x: 0, y: 0 };
        }
    } else {
        // Free particles
        if (particle.name) {
            // Family particles - simple drift like regular particles
            particle.x += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            particle.y += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            // Constrain particles within the canvas with buffer (working in logical coordinates)
            particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
            particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));
        } else {
            // Regular star particles - keep original behavior
            particle.x += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            particle.y += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            // Constrain particles within the canvas with buffer (working in logical coordinates)
            particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
            particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));
        }
    }

    // Twinkling effect (only for non-family particles)
    if (!particle.name) {
        particle.brightness += (Math.random() - 0.5) * 0.1;
        particle.brightness = Math.max(0, Math.min(1, particle.brightness));
    }
}

function drawParticle(particle) {
    if (particle.name) {
        // Family member particle - simple colored circle with basic glow
        const r = particle.r;
        const g = particle.g;
        const b = particle.b;
        
        // Simple glow effect - just one gradient
        const glowRadius = particle.size + 5;
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, glowRadius
        );
        gradient.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.3)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        // Draw glow
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw solid core
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        
    } else {
        // Regular star particle - keep original simple rendering
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.brightness})`;
        ctx.fill();
    }
}

init();
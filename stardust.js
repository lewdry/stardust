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
const FAMILY_PARTICLE_SIZE = 3;
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
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Failed to get 2D context');
        return;
    }

    // Get the device pixel ratio and scale
    dpr = window.devicePixelRatio || 1;
    scale = 1 / dpr;

    resizeCanvas();

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
        const glowRadius = particle.size + 3;
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
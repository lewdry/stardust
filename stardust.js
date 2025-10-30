// Configuration constants
const particleCount = 5000;
const BASE_INTERACTION_RADIUS = 15;
const maxInteractionTime = 10000; // 10 seconds in milliseconds
const dragFactor = 0.98;
const flickSpeed = 5;
const EDGE_BUFFER = 1; // 1px buffer from edges
const BLOOM_RADIUS_OFFSET = 6; // Additional bloom radius for family particles
const ATTRACTION_SPEED = 0.1;
const PARTICLE_DRIFT_SPEED = 0.005;
const FLICK_DISTANCE_THRESHOLD = 5;
const VELOCITY_THRESHOLD = 0.1;
const FAMILY_PARTICLE_SIZE = 3;
const REGULAR_PARTICLE_SIZE = 1;
const TOUCH_BUFFER = 5; // Extra tolerance for touch events
const ATTRACTION_PERCENTAGE = 0.001; // Percentage of particles to attract

// Runtime variables
let interactionRadius = BASE_INTERACTION_RADIUS;
let mouse = { x: 0, y: 0 };
let prevMouse = { x: 0, y: 0 };
let isInteracting = false;
let interactionStartTime = 0;

let particles = [];
let familyParticles = []; // Array to store family particles separately
let canvas, ctx;
let dpr, scale;  // Device pixel ratio and scale

// Define family members' colors
const familyColors = [
    { name: 'Daisy', color: 'rgb(78, 237, 229)' },
    { name: 'Elliot', color: 'rgb(93, 98, 245)' },
    { name: 'Cassie', color: 'rgb(189, 109, 242)' },
    { name: 'Lewis', color: 'rgb(250, 151, 75)' }
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
            name: member.name,
            size: FAMILY_PARTICLE_SIZE,
            // Fancy planet properties
            baseGlowIntensity: 0.3 + Math.random() * 0.4, // 0.3 to 0.7
            pulseSpeed: 0.01 + Math.random() * 0.02, // 0.01 to 0.03
            pulsePhase: Math.random() * Math.PI * 2, // Random starting phase
            pulseAmplitude: 0.3 + Math.random() * 0.4, // How much the glow varies
            orbitSpeed: (Math.random() - 0.5) * 0.0002, // Very slow drift
            orbitRadius: 2 + Math.random() * 3, // Small orbital movement
            orbitPhase: Math.random() * Math.PI * 2,
            baseX: 0, // Will be set after positioning
            baseY: 0, // Will be set after positioning
            colorPulseSpeed: 0.005 + Math.random() * 0.01,
            colorPulsePhase: Math.random() * Math.PI * 2
        };
        
        // Set base position for orbital movement
        particle.baseX = particle.x;
        particle.baseY = particle.y;
        
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
        
        // Update base position for family particles
        if (particle.name) {
            particle.baseX = particle.x;
            particle.baseY = particle.y;
        }
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

    // Use a more efficient approach: only check particles within a rough bounding box first
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

        // More expensive distance calculation only for particles in bounding box
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

    particles.forEach(particle => {
        if (particle.state !== 'attracted') return;

        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distanceSquared = dx * dx + dy * dy;
        const flickThreshold = FLICK_DISTANCE_THRESHOLD * FLICK_DISTANCE_THRESHOLD;

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

function updateAndRender() {
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
        
        // Update base position for family particles when being moved
        if (particle.name) {
            particle.baseX = particle.x;
            particle.baseY = particle.y;
        }
    } else if (particle.state === 'flicked') {
        // Update position
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;

        // Constrain to canvas with buffer (working in logical coordinates)
        particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
        particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));

        // Update base position for family particles when being moved
        if (particle.name) {
            particle.baseX = particle.x;
            particle.baseY = particle.y;
        }

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
        if (Math.abs(particle.velocity.x) < VELOCITY_THRESHOLD && Math.abs(particle.velocity.y) < VELOCITY_THRESHOLD) {
            particle.state = 'free';
            particle.velocity = { x: 0, y: 0 };
        }
    } else {
        // Free particles
        if (particle.name) {
            // Family particles - fancy orbital movement and effects
            particle.orbitPhase += particle.orbitSpeed;
            particle.pulsePhase += particle.pulseSpeed;
            particle.colorPulsePhase += particle.colorPulseSpeed;
            
            // Gentle orbital drift around base position
            const orbitX = Math.cos(particle.orbitPhase) * particle.orbitRadius;
            const orbitY = Math.sin(particle.orbitPhase * 1.3) * particle.orbitRadius; // Different frequency for interesting patterns
            
            particle.x = particle.baseX + orbitX;
            particle.y = particle.baseY + orbitY;
            
            // Keep within canvas bounds
            particle.x = Math.max(EDGE_BUFFER + particle.orbitRadius, 
                                Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER - particle.orbitRadius));
            particle.y = Math.max(EDGE_BUFFER + particle.orbitRadius, 
                                Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER - particle.orbitRadius));
            
            // Update base position if we hit boundaries
            particle.baseX = particle.x - orbitX;
            particle.baseY = particle.y - orbitY;
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
        // Family member particle with fancy effects
        
        // Calculate pulsing glow intensity
        const pulseValue = Math.sin(particle.pulsePhase);
        const currentGlowIntensity = particle.baseGlowIntensity + (pulseValue * particle.pulseAmplitude);
        
        // Calculate pulsing size
        const sizePulse = 1 + (pulseValue * 0.15); // 15% size variation
        const currentSize = particle.size * sizePulse;
        const bloomRadius = currentSize + BLOOM_RADIUS_OFFSET * currentGlowIntensity;
        
        // Calculate color breathing effect
        const colorPulse = Math.sin(particle.colorPulsePhase);
        const saturationMultiplier = 0.85 + (colorPulse * 0.15); // Subtle color breathing
        
        // Parse and enhance the RGB values with error handling
        let r = 255, g = 255, b = 255; // Default to white if parsing fails
        try {
            const rgbMatch = particle.color.match(/\d+/g);
            if (rgbMatch && rgbMatch.length >= 3) {
                r = Math.floor(parseInt(rgbMatch[0]) * saturationMultiplier);
                g = Math.floor(parseInt(rgbMatch[1]) * saturationMultiplier);
                b = Math.floor(parseInt(rgbMatch[2]) * saturationMultiplier);
            }
        } catch (error) {
            console.warn('Failed to parse particle color:', particle.color, error);
        }
        
        const enhancedColor = `rgb(${r}, ${g}, ${b})`;
        
        // Create pulsing gradient with multiple layers for more depth
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, bloomRadius
        );
        
        // Inner bright core
        gradient.addColorStop(0, enhancedColor);
        gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${0.9 * currentGlowIntensity})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.4 * currentGlowIntensity})`);
        gradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${0.1 * currentGlowIntensity})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        // Draw the outer glow
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, bloomRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Add a second, smaller intense glow for extra sparkle
        const innerGlow = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, currentSize * 1.5
        );
        innerGlow.addColorStop(0, `rgba(${r + 20}, ${g + 20}, ${b + 20}, ${0.8 * currentGlowIntensity})`);
        innerGlow.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${0.3 * currentGlowIntensity})`);
        innerGlow.addColorStop(1, 'transparent');
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, currentSize * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = innerGlow;
        ctx.fill();

        // Draw the solid core with slight transparency for depth
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, currentSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
        ctx.fill();
        
        // Add a bright center highlight
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, currentSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 0.6)`;
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
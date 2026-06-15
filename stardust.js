// Quick check: treat this as "mobile" when touch is available or UA looks mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || ('ontouchstart' in window) 
    || (navigator.maxTouchPoints > 0);

// Config — tweak these values depending on mobile vs desktop
const particleCount = isMobile ? 3000 : 5000; // keep particle count lower on phones
const BASE_INTERACTION_RADIUS = isMobile ? 10 : 15; // smaller reach for touch devices
const maxInteractionTime = 10000; // max interaction length (ms)
const dragFactor = 0.98;
const flickSpeed = 5;
const EDGE_BUFFER = 1; // tiny buffer so particles don't hug the exact edge (px)
const ATTRACTION_SPEED = 0.1;
const PARTICLE_DRIFT_SPEED = isMobile ? 0.004 : 0.005; // subtle drift; a touch lower on mobile
const FLICK_DISTANCE_THRESHOLD = 5;
const VELOCITY_THRESHOLD = 0.1;
const VELOCITY_THRESHOLD_SQUARED = VELOCITY_THRESHOLD * VELOCITY_THRESHOLD;
const FAMILY_PARTICLE_SIZE = 4;
const REGULAR_PARTICLE_SIZE = 1;
const TOUCH_BUFFER = 5; // extra leeway when dealing with touch input
const ATTRACTION_PERCENTAGE = 0.001;

// Runtime state (mutable)
let interactionRadius = BASE_INTERACTION_RADIUS;
let resizeTimer;
let mouse = { x: 0, y: 0 };
let prevMouse = { x: 0, y: 0 };
let isInteracting = false;
let interactionStartTime = 0;

// Simple performance-based frame adaptation
let lastFrameTime = 0;
let frameCount = 0;
let performanceMonitorTime = 0;
let adaptiveFrameSkip = false;

// Start at 60fps and relax if device can't keep up
const baseFrameInterval = 1000 / 60; // Target 60fps initially
let currentFrameInterval = baseFrameInterval;

// Pre-allocated brightness buckets (indices 0..10 map to brightness 0.0..1.0 in 0.1 steps).
// Reused every frame to avoid per-frame Map allocation and GC pressure.
const brightnessBuckets = Array.from({ length: 11 }, () => []);

let particles = [];
let attractedParticles = new Set(); // only the currently-attracted subset — keeps flickParticles O(attracted)
let familyParticles = []; // family members kept in a small separate list
let canvas, ctx;
let bgCanvas, bgCtx; // separate background canvas used for a dithered gradient
let dpr, scale;  // devicePixelRatio and derived scale

// My family colours — each defined as a single rgb() string
const familyColors = [
    { name: 'Daisy',  color: 'rgb(78, 237, 216)' },
    { name: 'Elliot', color: 'rgb(93, 98, 245)' },
    { name: 'Cassie', color: 'rgb(187, 109, 242)' },
    { name: 'Lewis',  color: 'rgb(250, 151, 75)' },
    { name: 'Jude',   color: 'rgb(96, 237, 115)' }
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

    // Figure out device pixel ratio and scale (for crisp drawing)
    dpr = window.devicePixelRatio || 1;
    scale = 1 / dpr;

    resizeCanvas();

    // Build the dithered background now (resize will also rebuild)
    if (bgCtx) createDitheredBackground();

    // Reset particle arrays before creating new ones
    particles = [];
    familyParticles = [];

    // Spawn one particle per family member (kept on top)
    familyColors.forEach(member => {
        const [r, g, b] = member.color.match(/\d+/g).map(Number);
        const particle = {
            x: Math.random() * (canvas.width / dpr),
            y: Math.random() * (canvas.height / dpr),
            state: 'free',
            velocity: { x: 0, y: 0 },
            brightness: 1,
            r, g, b,
            name: member.name,
            size: FAMILY_PARTICLE_SIZE
        };
        particles.push(particle);
    familyParticles.push(particle); // keep a separate handle for family particles
    });

    // Fill the rest of the system with regular (white) stars
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

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeCanvas, 150);
    });
    canvas.addEventListener('mousedown', onInteractionStart);
    canvas.addEventListener('mouseup', onInteractionEnd);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchstart', onInteractionStart);
    canvas.addEventListener('touchend', onInteractionEnd);
    canvas.addEventListener('touchmove', onTouchMove);

    // Kick off the animation loop
    requestAnimationFrame(updateAndRender);
}

function resizeCanvas() {
    if (!canvas || !ctx) return; // bail if canvas/context missing

    // Capture previous logical dimensions before resizing (for proportional remap)
    const prevW = canvas.width / dpr;
    const prevH = canvas.height / dpr;

    // Measure the visible viewport for sizing the canvases
    const visibleWidth = document.documentElement.clientWidth;
    const visibleHeight = window.innerHeight;

    // Size the canvas in physical pixels, based on DPR
    canvas.width = visibleWidth * dpr;
    canvas.height = visibleHeight * dpr;
    
    // Use CSS to preserve logical pixel size while using a high-res backing
    canvas.style.width = `${visibleWidth}px`;
    canvas.style.height = `${visibleHeight}px`;

    // Resize the background canvas and redraw its dithered image
    if (bgCanvas && bgCtx) {
        bgCanvas.width = visibleWidth * dpr;
        bgCanvas.height = visibleHeight * dpr;
        bgCanvas.style.width = `${visibleWidth}px`;
        bgCanvas.style.height = `${visibleHeight}px`;
    // Ensure no transforms are active before writing pixel data
        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    // Recreate the dithered background for the new dimensions
        createDitheredBackground();
    }

    // Reset transform and scale the drawing context for DPR
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any previous transformations
    ctx.scale(dpr, dpr);

    // Keep the interaction radius in logical pixels (reset after resize)
    interactionRadius = BASE_INTERACTION_RADIUS;

    // Remap particles proportionally to the new canvas size (or scatter on first init)
    particles.forEach(particle => {
        if (prevW > 0 && prevH > 0) {
            particle.x = (particle.x / prevW) * visibleWidth;
            particle.y = (particle.y / prevH) * visibleHeight;
        } else {
            particle.x = Math.random() * visibleWidth;
            particle.y = Math.random() * visibleHeight;
        }
        particle.state = 'free';
        particle.velocity = { x: 0, y: 0 };
    });
    attractedParticles.clear(); // particles were force-reset to 'free', so the set must be emptied too
}

// Ordered Bayer 8x8 matrix for cheap ordered dithering (values 0..63)
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

// Make a dithered vertical gradient texture using the ordered Bayer matrix.
function createDitheredBackground() {
    if (!bgCanvas || !bgCtx) return;

    const width = bgCanvas.width;   // physical pixels (backing)
    const height = bgCanvas.height; // physical pixels (backing)

    // Gradient base colours — dark at the top, lighter down below
    const topColor    = 'rgb(3, 1, 21)';    // similar to existing background (#030115)
    const bottomColor = 'rgb(35, 42, 95)';  // noticeably lighter bluish at bottom

    const [topR, topG, topB]       = topColor.match(/\d+/g).map(Number);
    const [bottomR, bottomG, bottomB] = bottomColor.match(/\d+/g).map(Number);

    // Fewer levels = bigger steps = more visible dithering pattern
    const LEVELS = 4;

    const data = bgCtx.createImageData(width, height);
    const pixels = data.data;

    for (let y = 0; y < height; y++) {
    // t: 0 at top, 1 at bottom for vertical interpolation
        const t = y / (height - 1 || 1);

    // Compute the base RGB for this scanline
        const baseR = topR * (1 - t) + bottomR * t;
        const baseG = topG * (1 - t) + bottomG * t;
        const baseB = topB * (1 - t) + bottomB * t;

        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            // Threshold from Bayer matrix (0..1)
            const threshold = BAYER8[y & 7][x & 7] / 64;

            // Quantize each channel using the threshold
            const qR = quantizeWithThreshold(baseR, LEVELS, threshold);
            const qG = quantizeWithThreshold(baseG, LEVELS, threshold);
            const qB = quantizeWithThreshold(baseB, LEVELS, threshold);

            pixels[idx] = qR;
            pixels[idx + 1] = qG;
            pixels[idx + 2] = qB;
            pixels[idx + 3] = 255;
        }
    }

    // Copy the generated pixel data to the background canvas
    bgCtx.putImageData(data, 0, 0);
}

function quantizeWithThreshold(value, levels, threshold) {
    // Input is 0..255; normalize to 0..1 for quantization math
    const norm = Math.max(0, Math.min(1, value / 255));
    const scaled = norm * (levels - 1);
    const base = Math.floor(scaled);
    const frac = scaled - base;
    const bumped = frac > threshold ? base + 1 : base;
    const out = Math.round((bumped / (levels - 1)) * 255);
    return out;
}

function onInteractionStart(event) {
    // Is this a touch event? Handle touches a bit differently
    if (event.touches && event.touches.length > 0) {
    // For touches: only steal the event if the touch was over the canvas
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
    // For mouse: behave similarly but using clientX/Y
        event.preventDefault();
        isInteracting = true;
        interactionStartTime = Date.now();
        prevMouse = { ...mouse };
        updateMousePosition(event);
        flickParticles();
    }
}

function onInteractionEnd(event) {
    event.preventDefault(); // prevent native scroll/selection while interacting
    isInteracting = false;
    interactionStartTime = 0;
    interactionRadius = BASE_INTERACTION_RADIUS; // reset any expanded radius
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
    // If no touches, stop interacting
        isInteracting = false;
        interactionStartTime = 0;
    }
}

function isPositionInBounds(x, y) {
    const buffer = EDGE_BUFFER * dpr;
    const touchBuffer = TOUCH_BUFFER * dpr; // add a little slack for touch precision
    
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
    
    // Update mouse only if it's inside the canvas area
    if (rawX >= 0 && rawX <= rect.width && rawY >= 0 && rawY <= rect.height) {
        mouse.x = constrainToCanvas(rawX, canvas.width);
        mouse.y = constrainToCanvas(rawY, canvas.height);
    } else {
    // If the pointer leaves the canvas, cancel the interaction
        isInteracting = false;
        interactionStartTime = 0;
    }
}

function updateTouchPosition(event) {
    if (event.touches && event.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches[0];
        
    // Map touch coords into logical canvas space
        const rawX = touch.clientX - rect.left;
        const rawY = touch.clientY - rect.top;
        
    // Allow a small buffer so quick swipes near edges still register
        const touchBuffer = TOUCH_BUFFER;
        
        if (rawX >= -touchBuffer && 
            rawX <= rect.width + touchBuffer && 
            rawY >= -touchBuffer && 
            rawY <= rect.height + touchBuffer) {
            
            // Clamp the pointer into the canvas' logical bounds
            mouse.x = constrainToCanvas(rawX, canvas.width);
            mouse.y = constrainToCanvas(rawY, canvas.height);
        } else {
            // Touch moved away — stop interacting
            isInteracting = false;
            interactionStartTime = 0;
        }
    }
}

function getDynamicInteractionRadius() {
    const elapsedTime = Math.min(Date.now() - interactionStartTime, maxInteractionTime);
    const progress = elapsedTime / maxInteractionTime;

    // Compute a maximum interaction radius based on canvas size
    const maxRadius = Math.min(canvas.width / dpr, canvas.height / dpr) / 2;

    // Ease-out cubic: snaps open quickly on first click/tap, then settles gradually
    const eased = 1 - Math.pow(1 - progress, 3);
    return BASE_INTERACTION_RADIUS + (maxRadius - BASE_INTERACTION_RADIUS) * eased;
}

function attractParticles() {
    const currentRadius = getDynamicInteractionRadius();
    const maxParticlesToAttract = Math.floor(particleCount * ATTRACTION_PERCENTAGE);
    let attractedCount = 0;

    // Nothing to do if attraction percentage is effectively zero
    if (maxParticlesToAttract === 0) return;

    // Compare squared distances to avoid costly sqrt
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

    // Cheap bounding-box reject before exact distance check
        if (particle.x < boundingBox.left || particle.x > boundingBox.right ||
            particle.y < boundingBox.top || particle.y > boundingBox.bottom) {
            continue;
        }

    // Compute squared distance (still no sqrt)
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
            particle.state = 'attracted';
            attractedParticles.add(particle); // register in the fast-lookup set
            attractedCount++;
        }
    }
}

function flickParticles() {
    const mouseVelocity = {
        x: mouse.x - prevMouse.x,
        y: mouse.y - prevMouse.y
    };

    // Precompute a squared flick threshold
    const flickThreshold = FLICK_DISTANCE_THRESHOLD * FLICK_DISTANCE_THRESHOLD;

    // Iterate only the attracted subset — O(attracted) instead of O(all particles)
    attractedParticles.forEach(particle => {
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
            attractedParticles.delete(particle); // no longer attracted — remove from set
        }
    });
}

function updateAndRender(currentTime) {
    // Adjust frame timing based on recent frame times
    const deltaTime = currentTime - lastFrameTime;
    
    // Check average frame time every 60 frames to detect slow devices
    frameCount++;
    if (frameCount === 1) {
        performanceMonitorTime = currentTime;
    } else if (frameCount >= 60) {
        const avgFrameTime = (currentTime - performanceMonitorTime) / 60;
        
    // If it's struggling (mobile & >20ms/frame), reduce target fps
        if (isMobile && avgFrameTime > 20) {
            adaptiveFrameSkip = true;
            currentFrameInterval = 1000 / 45; // Reduce to 45fps
        } else if (isMobile && avgFrameTime < 14) {
            adaptiveFrameSkip = false;
            currentFrameInterval = baseFrameInterval; // Back to 60fps
        }
        
        frameCount = 0;
    }
    
    // Skip drawing this frame if we're throttled and it's too soon
    if (adaptiveFrameSkip && deltaTime < currentFrameInterval) {
        requestAnimationFrame(updateAndRender);
        return;
    }
    
    lastFrameTime = currentTime;

    // Clear the logical canvas for this frame
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Update regular particles and batch-draw them grouped by brightness.
    // Clear pre-allocated buckets (reuse arrays, no allocations).
    for (let i = 0; i < brightnessBuckets.length; i++) brightnessBuckets[i].length = 0;
    particles.forEach(particle => {
        if (particle.name) return;
        updateParticle(particle);
        const bucketIndex = Math.round(particle.brightness * 10); // 0..10
        brightnessBuckets[bucketIndex].push(particle);
    });
    for (let i = 0; i < brightnessBuckets.length; i++) {
        const group = brightnessBuckets[i];
        if (group.length === 0) continue;
        const alpha = i / 10;
        ctx.beginPath();
        for (let j = 0; j < group.length; j++) {
            const p = group[j];
            ctx.moveTo(p.x + p.size, p.y);
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        }
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
    }

    // Draw family members last so they appear above the rest
    familyParticles.forEach(particle => {
        updateParticle(particle);
        drawParticle(particle);
    });

    if (isInteracting) {
        attractParticles();
    }

    // Loop
    requestAnimationFrame(updateAndRender);
}

function updateParticle(particle) {
    const canvasLogicalWidth = canvas.width / dpr;
    const canvasLogicalHeight = canvas.height / dpr;
    
    if (particle.state === 'attracted') {
        particle.x += (mouse.x - particle.x) * ATTRACTION_SPEED;
        particle.y += (mouse.y - particle.y) * ATTRACTION_SPEED;
    } else if (particle.state === 'flicked') {
    // Apply position update for flicked particles
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;

    // Clamp position to logical canvas (with a small buffer)
        particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
        particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));

    // Bounce if it hits the edge
        if (particle.x <= EDGE_BUFFER || particle.x >= canvasLogicalWidth - EDGE_BUFFER) {
            particle.velocity.x *= -1;
        }
        if (particle.y <= EDGE_BUFFER || particle.y >= canvasLogicalHeight - EDGE_BUFFER) {
            particle.velocity.y *= -1;
        }

    // Gradually slow the particle
        particle.velocity.x *= dragFactor;
        particle.velocity.y *= dragFactor;

    // If it's nearly stopped, mark it free again
        const velocityMagnitudeSquared = particle.velocity.x * particle.velocity.x + particle.velocity.y * particle.velocity.y;
        if (velocityMagnitudeSquared < VELOCITY_THRESHOLD_SQUARED) {
            particle.state = 'free';
            particle.velocity = { x: 0, y: 0 };
        }
    } else {
    // Behavior for free (idle) particles
        if (particle.name) {
            // Family members drift gently
            particle.x += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            particle.y += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            // Keep them inside the visible area
            particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
            particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));
        } else {
            // Regular stars: the original subtle random drift
            particle.x += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            particle.y += (Math.random() - 0.5) * PARTICLE_DRIFT_SPEED;
            // Clamp regular stars inside the visible area
            particle.x = Math.max(EDGE_BUFFER, Math.min(particle.x, canvasLogicalWidth - EDGE_BUFFER));
            particle.y = Math.max(EDGE_BUFFER, Math.min(particle.y, canvasLogicalHeight - EDGE_BUFFER));
        }
    }

    // Tiny brightness wiggle for twinkle (only non-family)
    if (!particle.name) {
        particle.brightness += (Math.random() - 0.5) * 0.1;
        particle.brightness = Math.max(0, Math.min(1, particle.brightness));
    }
}

function drawParticle(particle) {
    if (particle.name) {
    // Draw a family member: colored core plus soft glow
        const r = particle.r;
        const g = particle.g;
        const b = particle.b;
        
    // One radial gradient gives a simple glow
        const glowRadius = particle.size + 5;
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, glowRadius
        );
        gradient.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.3)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    // Fill the glow
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
    // Draw the solid centre
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        
    } else {
    // Regular star: small white dot with varying brightness
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.brightness})`;
        ctx.fill();
    }
}

init();
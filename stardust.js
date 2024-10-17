const particleCount = 5000;
let interactionRadius = 15;
const maxInteractionTime = 10000; // 10 seconds in milliseconds
let mouse = { x: 0, y: 0 };
let prevMouse = { x: 0, y: 0 };
let isInteracting = false;
let interactionStartTime = 0;
const dragFactor = 0.98;
const flickSpeed = 5;

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
    ctx = canvas.getContext('2d');

    // Get the device pixel ratio and scale
    dpr = window.devicePixelRatio || 1;
    scale = 1 / dpr;

    resizeCanvas();

    // Create family member particles
    familyColors.forEach(member => {
        const particle = {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            state: 'free',
            velocity: { x: 0, y: 0 },
            brightness: 1,
            color: member.color,
            name: member.name,
            size: 3 * dpr // Adjust size for high DPI
        };
        particles.push(particle);
        familyParticles.push(particle); // Add to family array
    });

    // Create remaining particles
    for (let i = 0; i < particleCount - familyColors.length; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            state: 'free',
            velocity: { x: 0, y: 0 },
            brightness: Math.random(),
            color: 'white',
            size: 1 * dpr // Adjust size for high DPI
        });
    }

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
    // Get the visible viewport dimensions
    const visibleWidth = document.documentElement.clientWidth;
    const visibleHeight = window.innerHeight;

    // Set canvas size accounting for device pixel ratio and visible area
    canvas.width = visibleWidth * dpr;
    canvas.height = visibleHeight * dpr;
    
    // Scale the canvas back down with CSS
    canvas.style.width = `${visibleWidth}px`;
    canvas.style.height = `${visibleHeight}px`;

    // Scale the context to ensure correct drawing operations
    ctx.scale(dpr, dpr);

    // Adjust interaction radius for high DPI
    interactionRadius = 15 * dpr;

    // Reposition particles within the new visible area
    particles.forEach(particle => {
        particle.x = Math.random() * canvas.width;
        particle.y = Math.random() * canvas.height;
        particle.state = 'free';
        particle.velocity = { x: 0, y: 0 };
    });
}

function onInteractionStart(event) {
    event.preventDefault(); // Prevent default touch behavior
    isInteracting = true;
    interactionStartTime = Date.now();
    prevMouse = { ...mouse };
    updateMousePosition(event);
    flickParticles();
}

function onInteractionEnd(event) {
    event.preventDefault(); // Prevent default touch behavior
    isInteracting = false;
    interactionStartTime = 0;
    interactionRadius = 10 * dpr; // Reset to initial radius, adjusted for DPI
}

function onMouseMove(event) {
    prevMouse = { ...mouse };
    updateMousePosition(event);
    if (isInteracting) {
        flickParticles();
    }
}

function onTouchMove(event) {
    event.preventDefault(); // Prevent default touch behavior
    prevMouse = { ...mouse };
    updateTouchPosition(event);
    if (isInteracting) {
        flickParticles();
    }
}

function updateMousePosition(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * dpr;
    mouse.y = (event.clientY - rect.top) * dpr;
}

function updateTouchPosition(event) {
    if (event.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (event.touches[0].clientX - rect.left) * dpr;
        mouse.y = (event.touches[0].clientY - rect.top) * dpr;
    }
}

function getDynamicInteractionRadius() {
    const elapsedTime = Math.min(Date.now() - interactionStartTime, maxInteractionTime);
    const progress = elapsedTime / maxInteractionTime;

    // Correctly calculate the max radius using logical pixels
    const maxRadius = Math.min(canvas.width / dpr, canvas.height / dpr) / 2; // Divide by dpr here

    // Return the radius adjusted for DPR
    return (15 + (maxRadius - 15) * progress) * dpr;
}

function attractParticles() {
    const currentRadius = getDynamicInteractionRadius();
    const particlesToAttract = Math.floor(particleCount * 0.001);
    let attractedCount = 0;

    particles.forEach(particle => {
        if (particle.state !== 'free') return;

        const distance = Math.sqrt(Math.pow(particle.x - mouse.x, 2) + Math.pow(particle.y - mouse.y, 2));

        if (distance <= currentRadius) {
            if (attractedCount < particlesToAttract) {
                particle.state = 'attracted';
                attractedCount++;
            }
        }
    });
}

function flickParticles() {
    const mouseVelocity = {
        x: mouse.x - prevMouse.x,
        y: mouse.y - prevMouse.y
    };

    particles.forEach(particle => {
        if (particle.state !== 'attracted') return;

        const distance = Math.sqrt(Math.pow(particle.x - mouse.x, 2) + Math.pow(particle.y - mouse.y, 2));

        if (distance <= 5 * dpr) {
            const angle = Math.atan2(mouseVelocity.y, mouseVelocity.x) + (Math.random() - 0.5) * Math.PI / 9;
            const speed = Math.sqrt(Math.pow(mouseVelocity.x, 2) + Math.pow(mouseVelocity.y, 2)) * flickSpeed;
            particle.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            particle.state = 'flicked';
        }
    });
}

function updateAndRender() {
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
    if (particle.state === 'attracted') {
        particle.x += (mouse.x - particle.x) * 0.1;
        particle.y += (mouse.y - particle.y) * 0.1;
    } else if (particle.state === 'flicked') {
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;

        // Bounce off edges, accounting for particle size
        if (particle.x - particle.size < 0 || particle.x + particle.size > canvas.width) {
            particle.velocity.x *= -1;
            particle.x = Math.max(particle.size, Math.min(particle.x, canvas.width - particle.size));
        }
        if (particle.y - particle.size < 0 || particle.y + particle.size > canvas.height) {
            particle.velocity.y *= -1;
            particle.y = Math.max(particle.size, Math.min(particle.y, canvas.height - particle.size));
        }

        // Apply drag
        particle.velocity.x *= dragFactor;
        particle.velocity.y *= dragFactor;

        // If particle has slowed down significantly, set it free
        if (Math.abs(particle.velocity.x) < 0.1 * dpr && Math.abs(particle.velocity.y) < 0.1 * dpr) {
            particle.state = 'free';
            particle.velocity = { x: 0, y: 0 };
        }
    } else {
        // Free particles
        particle.x += (Math.random() - 0.5) * 0.005 * dpr;
        particle.y += (Math.random() - 0.5) * 0.005 * dpr;
        // Constrain particles within the canvas, accounting for particle size
        particle.x = Math.max(particle.size, Math.min(particle.x, canvas.width - particle.size));
        particle.y = Math.max(particle.size, Math.min(particle.y, canvas.height - particle.size));
    }

    // Twinkling effect (only for non-family particles)
    if (!particle.name) {
        particle.brightness += (Math.random() - 0.5) * 0.1;
        particle.brightness = Math.max(0, Math.min(1, particle.brightness));
    }
}

function drawParticle(particle) {
    if (particle.name) {
        // Family member particle with bloom effect
        const bloomRadius = particle.size / dpr + 6; // 4 pixels total bloom
        const gradient = ctx.createRadialGradient(
            particle.x / dpr, particle.y / dpr, 0,
            particle.x / dpr, particle.y / dpr, bloomRadius
        );
        
        // Parse the RGB values from the particle color
        const rgbMatch = particle.color.match(/\d+/g);
        const r = parseInt(rgbMatch[0]);
        const g = parseInt(rgbMatch[1]);
        const b = parseInt(rgbMatch[2]);
        
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.3)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.beginPath();
        ctx.arc(particle.x / dpr, particle.y / dpr, bloomRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw the core of the particle
        ctx.beginPath();
        ctx.arc(particle.x / dpr, particle.y / dpr, particle.size / dpr, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
    } else {
        // Regular particle
        ctx.beginPath();
        ctx.arc(particle.x / dpr, particle.y / dpr, particle.size / dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.brightness})`;
        ctx.fill();
    }
}

init();
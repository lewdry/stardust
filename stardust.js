import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let scene, camera, renderer, particles;
let composer, bloomPass;
const particleCount = 3000;
let interactionRadius = 10;
const maxInteractionTime = 10000; // 10 seconds in milliseconds
let mouse = new THREE.Vector2();
let prevMouse = new THREE.Vector2();
let isInteracting = false;
let interactionStartTime = 0;
let particleStates = [];
let particleVelocities = [];
let particleBrightness = [];
const dragFactor = 0.98;
const flickSpeed = 5;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(
        window.innerWidth / -2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        window.innerHeight / -2,
        0.1,
        1000
    );
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Set up post-processing
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        3,  // bloom strength
        0.5,  // bloom radius
        0.85  // bloom threshold
    );
    composer.addPass(bloomPass);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = originalPositions[i3] = Math.random() * window.innerWidth - window.innerWidth / 2;
        positions[i3 + 1] = originalPositions[i3 + 1] = Math.random() * window.innerHeight - window.innerHeight / 2;
        positions[i3 + 2] = originalPositions[i3 + 2] = 0;

        const brightness = Math.random();
        colors[i3] = colors[i3 + 1] = colors[i3 + 2] = brightness;

        particleStates.push('free');
        particleVelocities.push(new THREE.Vector2(0, 0));
        particleBrightness.push(brightness);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3));

    const material = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('mousedown', onInteractionStart, false);
    document.addEventListener('mouseup', onInteractionEnd, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('touchstart', onInteractionStart, false);
    document.addEventListener('touchend', onInteractionEnd, false);
    document.addEventListener('touchmove', onTouchMove, false);
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumHeight = camera.top - camera.bottom;
    const frustumWidth = frustumHeight * aspect;

    camera.left = frustumWidth / -2;
    camera.right = frustumWidth / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = frustumHeight / -2;

    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);

    const positions = particles.geometry.attributes.position.array;
    const originalPositions = particles.geometry.attributes.originalPosition.array;
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = originalPositions[i3] = Math.random() * window.innerWidth - window.innerWidth / 2;
        positions[i3 + 1] = originalPositions[i3 + 1] = Math.random() * window.innerHeight - window.innerHeight / 2;
        particleStates[i] = 'free';
        particleVelocities[i].set(0, 0);
    }
    particles.geometry.attributes.position.needsUpdate = true;
}

function onInteractionStart(event) {
    isInteracting = true;
    interactionStartTime = Date.now();
    prevMouse.copy(mouse);
    if (event.type === 'mousedown') {
        updateMousePosition(event);
    } else if (event.type === 'touchstart') {
        updateTouchPosition(event);
    }
    flickParticles();
}

function onInteractionEnd() {
    isInteracting = false;
    interactionStartTime = 0;
    interactionRadius = 15; // Reset to initial radius
}

function onMouseMove(event) {
    prevMouse.copy(mouse);
    updateMousePosition(event);
    if (isInteracting) {
        flickParticles();
    }
}

function onTouchMove(event) {
    prevMouse.copy(mouse);
    updateTouchPosition(event);
    if (isInteracting) {
        flickParticles();
    }
}

function updateMousePosition(event) {
    mouse.x = event.clientX - window.innerWidth / 2;
    mouse.y = -(event.clientY - window.innerHeight / 2);
}

function updateTouchPosition(event) {
    if (event.touches.length > 0) {
        mouse.x = event.touches[0].clientX - window.innerWidth / 2;
        mouse.y = -(event.touches[0].clientY - window.innerHeight / 2);
    }
}

function getDynamicInteractionRadius() {
    const elapsedTime = Math.min(Date.now() - interactionStartTime, maxInteractionTime);
    const progress = elapsedTime / maxInteractionTime;
    const maxRadius = Math.min(window.innerWidth, window.innerHeight) / 2;
    return 15 + (maxRadius - 15) * progress;
}

function attractParticles() {
    const positions = particles.geometry.attributes.position.array;
    const currentRadius = getDynamicInteractionRadius();
    const particlesToAttract = Math.floor(particleCount * 0.001);
    let attractedCount = 0;

    for (let i = 0; i < particleCount; i++) {
        if (particleStates[i] !== 'free') continue;

        const i3 = i * 3;
        const particlePosition = new THREE.Vector2(positions[i3], positions[i3 + 1]);

        if (particlePosition.distanceTo(mouse) <= currentRadius) {
            if (attractedCount < particlesToAttract) {
                particleStates[i] = 'attracted';
                attractedCount++;
            }
        }
    }

    particles.geometry.attributes.position.needsUpdate = true;
}

function flickParticles() {
    const positions = particles.geometry.attributes.position.array;
    const mouseVelocity = mouse.clone().sub(prevMouse);

    for (let i = 0; i < particleCount; i++) {
        if (particleStates[i] !== 'attracted') continue;

        const i3 = i * 3;
        const particlePosition = new THREE.Vector2(positions[i3], positions[i3 + 1]);

        if (particlePosition.distanceTo(mouse) <= 5) {
            const angle = Math.atan2(mouseVelocity.y, mouseVelocity.x) + (Math.random() - 0.5) * Math.PI / 9;
            const speed = mouseVelocity.length() * flickSpeed;
            particleVelocities[i].set(Math.cos(angle) * speed, Math.sin(angle) * speed);
            particleStates[i] = 'flicked';
        }
    }
}

function updateParticles() {
    const positions = particles.geometry.attributes.position.array;
    const colors = particles.geometry.attributes.color.array;
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        if (particleStates[i] === 'attracted') {
            positions[i3] += (mouse.x - positions[i3]) * 0.1;
            positions[i3 + 1] += (mouse.y - positions[i3 + 1]) * 0.1;
        } else if (particleStates[i] === 'flicked') {
            positions[i3] += particleVelocities[i].x;
            positions[i3 + 1] += particleVelocities[i].y;

            // Bounce off edges
            if (Math.abs(positions[i3]) > halfWidth) {
                positions[i3] = Math.sign(positions[i3]) * halfWidth;
                particleVelocities[i].x *= -1;
            }
            if (Math.abs(positions[i3 + 1]) > halfHeight) {
                positions[i3 + 1] = Math.sign(positions[i3 + 1]) * halfHeight;
                particleVelocities[i].y *= -1;
            }

            // Apply drag
            particleVelocities[i].multiplyScalar(dragFactor);

            // If particle has slowed down significantly, set it free
            if (particleVelocities[i].length() < 0.1) {
                particleStates[i] = 'free';
                particleVelocities[i].set(0, 0);
            }
        } else {
            // Free particles
            positions[i3] += (Math.random() - 0.5) * 0.005;
            positions[i3 + 1] += (Math.random() - 0.5) * 0.005;
            positions[i3] = Math.max(Math.min(positions[i3], halfWidth), -halfWidth);
            positions[i3 + 1] = Math.max(Math.min(positions[i3 + 1], halfHeight), -halfHeight);
        }

        // Twinkling effect
        particleBrightness[i] += (Math.random() - 0.5) * 0.1;
        particleBrightness[i] = Math.max(0, Math.min(1, particleBrightness[i]));
        colors[i3] = colors[i3 + 1] = colors[i3 + 2] = particleBrightness[i];
    }

    particles.geometry.attributes.position.needsUpdate = true;
    particles.geometry.attributes.color.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);

    if (isInteracting) {
        attractParticles();
    }

    updateParticles();

    composer.render();
}

init();
animate();
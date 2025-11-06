# Stardust ✨
**Twinkling, magnetic stars with family constellations**

An interactive starfield where you can attract and fling thousands of twinkling stars across the galaxy, featuring special planetoids with unique colors and cosmic behaviors.

## ✨ Features

### Core Interaction
* **Magnetic Attraction**: Tap or click to create an expanding attraction field that draws in nearby stars
* **Cosmic Flinging**: Drag through attracted stars to launch them across the galaxy with realistic physics
* **5,000 Stars**: Experience a rich starfield with thousands of twinkling particles

### Visual Polish
* **High DPI Support**: Crisp rendering on retina and high-resolution displays
* **Responsive Design**: Adapts to any screen size and orientation
* **Smooth Physics**: Realistic velocity, drag, and bouncing with edge constraints
* **Dynamic Attraction**: Interaction radius grows over time for increasingly powerful attraction

## 🎮 Controls
* **Desktop**: Click and drag to attract and fling stars
* **Mobile**: Touch and drag with optimized touch handling
* **Physics**: Stars slow down naturally and return to free-floating state

## 🎯 Use Cases
* **Relaxation**: Meditative interaction with a cosmic environment
* **Stress Relief**: Satisfying physics-based star manipulation  
* **Digital Art**: Create temporary constellations and star patterns
* **Family Connection**: Spot and interact with the special family member stars

## 🛠 Technical Implementation
* **Pure JavaScript**: No frameworks, just vanilla JS with HTML5 Canvas
* **Canvas 2D API**: Hardware-accelerated rendering with proper scaling
* **Device Pixel Ratio**: Crisp visuals on all display types
* **Performance Optimized**: Efficient particle system handling 5,000+ objects
* **Touch-First**: Mobile-optimized with proper event handling
* **Edge Constraints**: Smart boundary detection and particle containment

## 🌐 Live Demo
**Play with the stars**: [stardust.playpip.games](https://stardust.playpip.games)
* **Zero Dependencies**: Runs entirely in the browser
* **Fast Loading**: Minimal assets for instant cosmic immersion

---

## 🖼️ Background: Dithered Gradient (new)

This project now renders an old-school dithered vertical gradient behind the particle canvas to give the sky an authentic retro look.

Key points:
- The background is generated into a separate canvas (`#stardust-bg`) and sits behind the interactive `#stardust` canvas.
- An 8×8 ordered (Bayer) matrix is used to apply ordered dithering, producing a pleasing banded/texture effect.
- The background is rendered at physical pixels (canvas width/height × devicePixelRatio) so it remains crisp on Retina/HiDPI displays.

Where to tweak it
- Colors: open `stardust.js` and edit the `top` and `bottom` color objects inside `createDitheredBackground()` to change the gradient endpoints.
- Dither density: change the `LEVELS` constant in `createDitheredBackground()` (currently 16). Fewer levels = stronger retro banding; more levels = smoother gradient.
- Dither algorithm: the code uses an ordered Bayer matrix for speed and a classic look. If you'd like error-diffusion (Floyd–Steinberg) instead, that can be added — it produces a different, softer dithering at higher CPU cost.

How to test locally
1. Serve the folder and open it in a browser (from the project root):
```bash
python3 -m http.server 8000
```
2. Visit `http://localhost:8000` and inspect the background. Resize the window to see the background regenerated.

Notes
- The starfield and interactions are unchanged and still render on the top canvas. The background canvas uses `pointer-events: none` so it won't block clicks or touches.
- The dither is generated on resize to keep CPU usage low during animation; if you prefer continuously-recomputed backgrounds (animated gradients), I can add that option.

---

*Created by [@lewdry](https://github.com/lewdry) - A digital playground among the stars* 🌟
// --- Game Config & Constants ---
const TILE_SIZE = 4;
const MAP_SIZE = 10;

// Map Grid: 1 = Brick Wall, 2 = Toxic Acid Floor (empty space), 3 = Computer Terminal Wall, 0 = Empty Floor
const MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 3, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 2, 2, 0, 1],
    [1, 0, 1, 0, 0, 0, 2, 2, 0, 1],
    [1, 0, 1, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

// Player State
const player = {
    x: 1.5 * TILE_SIZE, // grid index 1.5
    z: 1.5 * TILE_SIZE, // grid index 1.5
    yaw: -Math.PI / 2,            // face positive X down the main corridor
    pitch: 0,          // vertical angle (radians)
    eyeHeight: 1.8,    // camera height off the ground
    speed: 6.5,        // movement speed (units/sec)
    radius: 0.6,       // collision bounding radius
    health: 100,
    armor: 50,
    ammo: 50
};

// Input State
const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

let isPaused = true;
let audioCtx = null;
let lastTime = performance.now();

// Three.js Core Variables
let scene, camera, renderer;
let playerLight, muzzleFlashLight;
let weaponCanvas, weaponCtx;
let targetMesh;
let targetHitTime = 0;
const enemies = [];
let hitNotificationTimer = null;
const hitNotification = document.getElementById('hit-notification');
let acidMaterial; // animation reference
const items = [];

// HUD Elements
const hudHealth = document.getElementById('hud-health');
const hudArmor = document.getElementById('hud-armor');
const hudAmmo = document.getElementById('hud-ammo');
const hudFace = document.getElementById('hud-face');
const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const screenDiv = document.getElementById('screen');

// Damage overlay flashing
let damageFlash;

// Face Expression Manager
let faceOverride = '';
let faceOverrideTimer = 0;

// Bobbing & Shooting Timers
let bobTimer = 0;
let isFiring = false;
let fireTimer = 0;
const fireDuration = 0.35; // shot cooldown in seconds

// --- Procedural Sound Generator (Web Audio API) ---
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playShootSound() {
    if (!audioCtx) return;
    initAudio();
    
    const bufferSize = audioCtx.sampleRate * 0.15;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate white noise with quadratic decay
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, audioCtx.currentTime);
    filter.Q.value = 1.2;
    
    noiseNode.connect(filter);
    filter.connect(audioCtx.destination);
    
    noiseNode.start();
}

function playDamageSound() {
    if (!audioCtx) return;
    initAudio();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.25);
    
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
}

function playPickupSound() {
    if (!audioCtx) return;
    initAudio();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    // Arpeggio sound effect
    osc.frequency.setValueAtTime(250, audioCtx.currentTime);
    osc.frequency.setValueAtTime(500, audioCtx.currentTime + 0.08);
    osc.frequency.setValueAtTime(750, audioCtx.currentTime + 0.16);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
}

function playClickSound() {
    if (!audioCtx) return;
    initAudio();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.06);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
}

function playHitSound() {
    if (!audioCtx) return;
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.08); // G5
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
}

function playEnemyDeathSound() {
    if (!audioCtx) return;
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.7);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);
}

// --- Procedural 8-Bit Pixel Art Texture Generators ---
function createPixelNoise(ctx, width, height, opacity = 0.15) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * opacity * 255;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise)); // G
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise)); // B
    }
    ctx.putImageData(imgData, 0, 0);
}

function generateWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Brick base
    ctx.fillStyle = '#652323';
    ctx.fillRect(0, 0, 64, 64);
    
    // Mortar horizontal lines
    ctx.fillStyle = '#220f0f';
    for (let y = 0; y < 64; y += 16) {
        ctx.fillRect(0, y, 64, 2);
    }
    
    // Staggered mortar vertical joints
    for (let row = 0; row < 4; row++) {
        const y = row * 16;
        const offset = (row % 2) * 32;
        ctx.fillRect(offset, y, 2, 16);
        ctx.fillRect((offset + 32) % 64, y, 2, 16);
    }
    
    // Highlight lines on top/left of each brick for faux extrusion
    ctx.fillStyle = '#8f3c3c';
    for (let row = 0; row < 4; row++) {
        const y = row * 16;
        const offset = (row % 2) * 32;
        ctx.fillRect(offset + 2, y + 2, 30, 1);
        ctx.fillRect(offset + 2, y + 2, 1, 14);
        ctx.fillRect((offset + 32) % 64 + 2, y + 2, 30, 1);
        ctx.fillRect((offset + 32) % 64 + 2, y + 2, 1, 14);
    }
    
    createPixelNoise(ctx, 64, 64, 0.12);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function generateTerminalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Steel panels frame
    ctx.fillStyle = '#2d3035';
    ctx.fillRect(0, 0, 64, 64);
    
    // Screen background
    ctx.fillStyle = '#061609';
    ctx.fillRect(8, 8, 48, 48);
    
    // Panel borders
    ctx.fillStyle = '#4c525b';
    ctx.fillRect(0, 0, 64, 3);
    ctx.fillRect(0, 0, 3, 64);
    ctx.fillStyle = '#15171a';
    ctx.fillRect(0, 61, 64, 3);
    ctx.fillRect(61, 0, 3, 64);
    
    // Glowing oscilliscope grids on screen
    ctx.strokeStyle = '#12411e';
    ctx.lineWidth = 1;
    for (let x = 12; x < 54; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, 56);
        ctx.stroke();
    }
    for (let y = 12; y < 54; y += 8) {
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(56, y);
        ctx.stroke();
    }
    
    // Active waveforms
    ctx.beginPath();
    ctx.moveTo(10, 32);
    for (let x = 10; x <= 54; x += 4) {
        const y = 32 + Math.sin((x - 10) * 0.4) * 12;
        ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#00ff3c';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Neon status lights
    ctx.fillStyle = '#ff1133'; // alert light
    ctx.fillRect(12, 12, 8, 4);
    ctx.fillStyle = '#ffff22'; // caution light
    ctx.fillRect(24, 12, 6, 4);
    ctx.fillStyle = '#33aaff'; // progress light
    ctx.fillRect(34, 12, 10, 4);
    
    createPixelNoise(ctx, 64, 64, 0.08);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function generateFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Heavy concrete tile
    ctx.fillStyle = '#42424a';
    ctx.fillRect(0, 0, 64, 64);
    
    // Industrial grooved tile boundaries
    ctx.fillStyle = '#242429';
    ctx.fillRect(0, 0, 64, 4);
    ctx.fillRect(0, 0, 4, 64);
    ctx.fillRect(0, 60, 64, 4);
    ctx.fillRect(60, 0, 4, 64);
    
    // Diagonal metal scuff marks
    ctx.strokeStyle = '#5a5a65';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 8); ctx.lineTo(18, 18);
    ctx.moveTo(42, 14); ctx.lineTo(54, 26);
    ctx.moveTo(14, 44); ctx.lineTo(26, 56);
    ctx.stroke();
    
    createPixelNoise(ctx, 64, 64, 0.16);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function generateCeilingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Rust-metal paneling
    ctx.fillStyle = '#222327';
    ctx.fillRect(0, 0, 64, 64);
    
    // Grid frames
    ctx.fillStyle = '#101113';
    ctx.fillRect(0, 0, 64, 2);
    ctx.fillRect(0, 0, 2, 64);
    ctx.fillRect(0, 32, 64, 2);
    ctx.fillRect(32, 0, 2, 64);
    
    // Corner rivets
    ctx.fillStyle = '#3a3d45';
    const rivets = [
        [4, 4], [28, 4], [4, 28], [28, 28],
        [36, 4], [60, 4], [36, 28], [60, 28],
        [4, 36], [28, 36], [4, 60], [28, 60],
        [36, 36], [60, 36], [36, 60], [60, 60]
    ];
    rivets.forEach(([rx, ry]) => {
        ctx.fillRect(rx, ry, 2, 2);
    });
    
    createPixelNoise(ctx, 64, 64, 0.1);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function generateAcidTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Deep slime green
    ctx.fillStyle = '#0a350c';
    ctx.fillRect(0, 0, 64, 64);
    
    // Flowing neon slime streaks
    ctx.fillStyle = '#25802b';
    ctx.fillRect(6, 10, 16, 4);
    ctx.fillRect(8, 14, 12, 4);
    ctx.fillRect(36, 22, 22, 6);
    ctx.fillRect(38, 28, 16, 4);
    ctx.fillRect(14, 42, 24, 8);
    ctx.fillRect(16, 50, 18, 4);
    
    // Neon bubbles/glow
    ctx.fillStyle = '#5eff67';
    ctx.fillRect(10, 12, 4, 2);
    ctx.fillRect(44, 24, 6, 2);
    ctx.fillRect(20, 44, 8, 2);
    
    createPixelNoise(ctx, 64, 64, 0.05);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function generateTargetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Red base background
    ctx.fillStyle = '#b32727';
    ctx.fillRect(0, 0, 64, 64);
    
    // White outer stripes
    ctx.fillStyle = '#e8e8ea';
    ctx.fillRect(0, 10, 64, 8);
    ctx.fillRect(0, 46, 64, 8);
    
    // Bullseye white circle
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fill();
    
    // Red inner ring
    ctx.fillStyle = '#b32727';
    ctx.beginPath();
    ctx.arc(32, 32, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // White center dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 3, 0, Math.PI * 2);
    ctx.fill();
    
    createPixelNoise(ctx, 64, 64, 0.12);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function generateEnemyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Transparent background
    ctx.clearRect(0, 0, 64, 64);
    
    // Head shape
    ctx.fillStyle = '#cc2a2a'; // vibrant demon red
    ctx.beginPath();
    ctx.arc(32, 28, 14, 0, Math.PI * 2);
    ctx.fill();
    
    // Shoulders
    ctx.fillStyle = '#941c1c'; // darker shaded red
    ctx.fillRect(18, 42, 28, 22);
    
    // Horns
    ctx.fillStyle = '#cc2a2a';
    // Left horn
    ctx.beginPath();
    ctx.moveTo(19, 20);
    ctx.lineTo(25, 20);
    ctx.lineTo(15, 8);
    ctx.closePath();
    ctx.fill();
    
    // Right horn
    ctx.beginPath();
    ctx.moveTo(45, 20);
    ctx.lineTo(39, 20);
    ctx.lineTo(49, 8);
    ctx.closePath();
    ctx.fill();
    
    // Glowing radioactive neon green eyes
    ctx.fillStyle = '#39ff14';
    ctx.fillRect(24, 24, 4, 3);
    ctx.fillRect(36, 24, 4, 3);
    
    // Dark open mouth
    ctx.fillStyle = '#100a0a';
    ctx.fillRect(26, 33, 12, 4);
    
    // White fangs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(27, 33, 2, 2);
    ctx.fillRect(35, 33, 2, 2);
    
    createPixelNoise(ctx, 64, 64, 0.15);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function generatePinkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 64, 64);
    
    // Head shape - aggressive, diamond-like pink shape
    ctx.fillStyle = '#ff66a3'; // hot pink base
    ctx.beginPath();
    ctx.moveTo(32, 12); // top head
    ctx.lineTo(48, 28); // right cheek
    ctx.lineTo(44, 46); // jaw lower right
    ctx.lineTo(20, 46); // jaw lower left
    ctx.lineTo(16, 28); // left cheek
    ctx.closePath();
    ctx.fill();
    
    // Shoulders - darker shaded magenta pink
    ctx.fillStyle = '#b30047';
    ctx.fillRect(16, 46, 32, 18);
    
    // Horns pointing forward/outward
    ctx.fillStyle = '#ff66a3';
    // Left outward horn
    ctx.beginPath();
    ctx.moveTo(22, 18);
    ctx.lineTo(26, 22);
    ctx.lineTo(10, 14);
    ctx.closePath();
    ctx.fill();
    // Right outward horn
    ctx.beginPath();
    ctx.moveTo(42, 18);
    ctx.lineTo(38, 22);
    ctx.lineTo(54, 14);
    ctx.closePath();
    ctx.fill();
    
    // Glowing radioactive yellow eyes
    ctx.fillStyle = '#ffff33';
    ctx.fillRect(24, 26, 4, 3);
    ctx.fillRect(36, 26, 4, 3);
    
    // Huge underbite open jaw
    ctx.fillStyle = '#1a000a';
    ctx.fillRect(22, 35, 20, 8);
    
    // Massive white teeth lining the top and bottom of the jaw
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(23, 35, 2, 2);
    ctx.fillRect(27, 35, 2, 2);
    ctx.fillRect(31, 35, 2, 2);
    ctx.fillRect(35, 35, 2, 2);
    ctx.fillRect(39, 35, 2, 2);
    
    ctx.fillRect(25, 41, 2, 2);
    ctx.fillRect(31, 41, 2, 2);
    ctx.fillRect(37, 41, 2, 2);
    
    createPixelNoise(ctx, 64, 64, 0.16);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function generateGorillaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 64, 64);
    
    // Bulky shoulder outline
    ctx.fillStyle = '#2b2b2b'; // dark charcoal fur
    ctx.beginPath();
    ctx.arc(32, 45, 22, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    
    // Bulky Head shape
    ctx.fillStyle = '#3a3a3a'; // lighter charcoal skin
    ctx.beginPath();
    ctx.arc(32, 24, 16, 0, Math.PI * 2);
    ctx.fill();
    
    // Broad dark brown chest plate
    ctx.fillStyle = '#4a3525';
    ctx.fillRect(20, 44, 24, 20);
    
    // Severe angry brow ridge
    ctx.fillStyle = '#202020';
    ctx.fillRect(20, 20, 24, 4);
    
    // Glowing red eyes under brow
    ctx.fillStyle = '#ff1111';
    ctx.fillRect(23, 22, 5, 3);
    ctx.fillRect(36, 22, 5, 3);
    
    // Flaring nostrils
    ctx.fillStyle = '#151515';
    ctx.fillRect(29, 29, 2, 2);
    ctx.fillRect(33, 29, 2, 2);
    
    // Grinning mouth
    ctx.fillStyle = '#101010';
    ctx.fillRect(26, 34, 12, 3);
    
    createPixelNoise(ctx, 64, 64, 0.18);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return texture;
}

function draw2DWeapon(frame) {
    if (!weaponCtx) return;
    weaponCtx.clearRect(0, 0, 64, 64);
    
    let offsetY = 0;
    let muzzleFlash = false;
    
    if (frame === 1) { // Muzzle flash
        offsetY = 5;
        muzzleFlash = true;
    } else if (frame === 2) { // Full recoil
        offsetY = 12;
    } else if (frame === 3) { // Recovering
        offsetY = 6;
    }
    
    // Bobbing calculations when moving
    let bobY = 0;
    let bobX = 0;
    const isMoving = keys.w || keys.s || keys.a || keys.d;
    if (isMoving && frame === 0) {
        bobY = Math.abs(Math.sin(bobTimer * 1.5)) * 2.5;
        bobX = Math.sin(bobTimer * 0.75) * 2.0;
    }
    
    const y = 32 + offsetY + bobY;
    const x = 32 + bobX;
    
    // 1. Draw double barrels
    weaponCtx.fillStyle = '#262930'; // gun metal
    weaponCtx.fillRect(x - 5, y, 4, 32);
    weaponCtx.fillRect(x + 1, y, 4, 32);
    
    // Highlights
    weaponCtx.fillStyle = '#4c525f';
    weaponCtx.fillRect(x - 5, y, 1, 32);
    weaponCtx.fillRect(x + 1, y, 1, 32);
    
    // Dark barrel bores
    weaponCtx.fillStyle = '#060608';
    weaponCtx.fillRect(x - 4, y, 2, 2);
    weaponCtx.fillRect(x + 2, y, 2, 2);
    
    // 2. Wooden forend
    weaponCtx.fillStyle = '#4e2d1d'; // brown
    weaponCtx.fillRect(x - 7, y + 10, 14, 12);
    weaponCtx.fillStyle = '#6d3f29'; // lighter wood grain
    weaponCtx.fillRect(x - 7, y + 10, 14, 2);
    weaponCtx.fillRect(x - 7, y + 12, 2, 8);
    
    // 3. Hands (black leather gloves)
    weaponCtx.fillStyle = '#101012';
    // Left hand holding forend
    weaponCtx.fillRect(x - 10, y + 16, 4, 10);
    // Right hand supporting
    weaponCtx.fillRect(x + 6, y + 16, 4, 10);
    
    // 4. Marine green armor sleeves
    weaponCtx.fillStyle = '#395727';
    weaponCtx.fillRect(x - 13, y + 23, 4, 9);
    weaponCtx.fillRect(x + 9, y + 23, 4, 9);
    
    // 5. Drawing muzzle flash
    if (muzzleFlash) {
        // Red-orange outer bloom
        weaponCtx.fillStyle = '#ff3f00';
        weaponCtx.fillRect(x - 14, y - 8, 28, 8);
        weaponCtx.fillRect(x - 8, y - 14, 16, 6);
        
        // Yellow core
        weaponCtx.fillStyle = '#ffaa00';
        weaponCtx.fillRect(x - 9, y - 6, 18, 6);
        weaponCtx.fillRect(x - 5, y - 11, 10, 5);
        
        // White-hot center
        weaponCtx.fillStyle = '#ffffff';
        weaponCtx.fillRect(x - 4, y - 3, 8, 3);
        weaponCtx.fillRect(x - 2, y - 7, 4, 4);
    }
}

// --- Dynamic Damage Flash DOM Component ---
function createDamageFlash() {
    damageFlash = document.createElement('div');
    damageFlash.id = 'damage-flash';
    damageFlash.style.position = 'absolute';
    damageFlash.style.top = '0';
    damageFlash.style.left = '0';
    damageFlash.style.width = '100%';
    damageFlash.style.height = '100%';
    damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0)';
    damageFlash.style.pointerEvents = 'none';
    damageFlash.style.zIndex = '15';
    damageFlash.style.transition = 'background-color 0.15s ease';
    screenDiv.appendChild(damageFlash);
}

function triggerDamageFlash() {
    damageFlash.style.transition = 'none';
    damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.45)';
    damageFlash.offsetHeight; // Force DOM reflow
    damageFlash.style.transition = 'background-color 0.22s ease';
    damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0)';
}

// --- Player Damage & Mechanics ---
function takeDamage(amount) {
    if (player.health <= 0) return;
    
    let absorbed = 0;
    if (player.armor > 0) {
        // Armor absorbs 60% of damage
        absorbed = Math.round(amount * 0.6);
        player.armor = Math.max(0, player.armor - absorbed);
    }
    
    const healthDamage = amount - absorbed;
    player.health = Math.max(0, player.health - healthDamage);
    
    triggerDamageFlash();
    playDamageSound();
    
    // Change HUD Face expression to hurt/crying
    faceOverride = player.health <= 35 ? '😭' : '🤕';
    faceOverrideTimer = 0.5; // override face for 0.5s
    
    updateHUD();
    
    if (player.health <= 0) {
        die();
    }
}

function die() {
    player.health = 0;
    updateHUD();
    
    // Play dark death noise
    if (audioCtx) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(10, audioCtx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
    }
    
    // Build fullscreen Death screen overlay
    const deathOverlay = document.createElement('div');
    deathOverlay.id = 'death-overlay';
    deathOverlay.style.position = 'absolute';
    deathOverlay.style.top = '0';
    deathOverlay.style.left = '0';
    deathOverlay.style.width = '100%';
    deathOverlay.style.height = '100%';
    deathOverlay.style.backgroundColor = 'rgba(110, 0, 0, 0.75)';
    deathOverlay.style.display = 'flex';
    deathOverlay.style.flexDirection = 'column';
    deathOverlay.style.justifyContent = 'center';
    deathOverlay.style.alignItems = 'center';
    deathOverlay.style.zIndex = '25';
    deathOverlay.style.color = '#ffffff';
    deathOverlay.style.fontFamily = "'Press Start 2P', monospace";
    
    const title = document.createElement('h2');
    title.innerText = 'YOU DIED';
    title.style.color = '#ff3333';
    title.style.fontSize = '24px';
    title.style.marginBottom = '20px';
    title.style.textShadow = '0 0 10px #000';
    deathOverlay.appendChild(title);
    
    const sub = document.createElement('p');
    sub.innerText = 'RESPAWNING...';
    sub.style.fontSize = '10px';
    deathOverlay.appendChild(sub);
    
    screenDiv.appendChild(deathOverlay);
    isPaused = true;
    
    // Release pointer lock
    document.exitPointerLock();
    
    setTimeout(() => {
        // Reset state
        player.health = 100;
        player.armor = 50;
        player.ammo = 50;
        player.x = 1.5 * TILE_SIZE;
        player.z = 1.5 * TILE_SIZE;
        player.yaw = -Math.PI / 2;
        player.pitch = 0;
        
        deathOverlay.remove();
        isPaused = false;
        
        updateHUD();
    }, 2200);
}

// --- Shoot Weapon Action ---
function triggerHitNotification(text, type) {
    if (type === 'target') {
        playHitSound();
        targetHitTime = 0.5;
    }
    
    if (hitNotification) {
        hitNotification.innerText = text;
        hitNotification.classList.add('visible');
        
        if (hitNotificationTimer) {
            clearTimeout(hitNotificationTimer);
        }
        
        hitNotificationTimer = setTimeout(() => {
            hitNotification.classList.remove('visible');
        }, 850);
    }
}

function damageEnemy(enemyObj) {
    if (!enemyObj || !enemyObj.active || enemyObj.dying) return;
    
    enemyObj.health--;
    
    faceOverride = '😈';
    faceOverrideTimer = 0.75;
    updateHUD();
    
    if (enemyObj.health <= 0) {
        enemyObj.dying = true;
        enemyObj.deathTimer = 1.2; // 1.2 seconds death animation
        playEnemyDeathSound();
        triggerHitNotification(`${enemyObj.displayName} SLAIN!`, 'enemy-death');
    } else {
        playHitSound();
        triggerHitNotification(`${enemyObj.displayName} HIT!`, 'enemy-hit');
    }
}

function shoot() {
    if (isPaused || isFiring || player.health <= 0) return;
    
    if (player.ammo <= 0) {
        playClickSound();
        return;
    }
    
    player.ammo--;
    isFiring = true;
    fireTimer = 0;
    
    playShootSound();
    
    // Muzzle flash light trigger (realtime dynamic lighting on brick walls)
    muzzleFlashLight.intensity = 5.0;
    
    faceOverride = '😈';
    faceOverrideTimer = 0.35;
    
    updateHUD();
    
    // --- FORWARD RAYCASTING ---
    const raycaster = new THREE.Raycaster();
    const screenCenter = new THREE.Vector2(0, 0); // center of camera view
    raycaster.setFromCamera(screenCenter, camera);
    
    const shootables = [];
    if (targetMesh) shootables.push(targetMesh);
    enemies.forEach(e => {
        if (e.active && !e.dying) {
            shootables.push(e.mesh);
        }
    });
    
    const intersects = raycaster.intersectObjects(shootables);
    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance < 35) {
            if (hit.object === targetMesh) {
                console.log("HIT TARGET! Distance:", hit.distance);
                triggerHitNotification('TARGET HIT!', 'target');
            } else {
                const hitEnemy = enemies.find(e => e.mesh === hit.object);
                if (hitEnemy) {
                    console.log("HIT ENEMY! Type:", hitEnemy.type, "Distance:", hit.distance);
                    damageEnemy(hitEnemy);
                }
            }
        }
    }
}

// --- Pickable Items Spawners (Rotating Ammo/Armor Crates) ---
function createAmmoCrate(gridCol, gridRow) {
    const group = new THREE.Group();
    const matGreen = new THREE.MeshLambertMaterial({ color: 0x0c6d24 });
    const matYellow = new THREE.MeshBasicMaterial({ color: 0xddcc11 });
    
    // Container box
    const mainBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.42), matGreen);
    group.add(mainBox);
    
    // Ammo stripe banding
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.12, 0.44), matYellow);
    group.add(stripe);
    
    const x = (gridCol + 0.5) * TILE_SIZE;
    const z = (gridRow + 0.5) * TILE_SIZE;
    group.position.set(x, 0.4, z);
    
    scene.add(group);
    
    items.push({
        type: 'ammo',
        x: x,
        z: z,
        mesh: group,
        active: true,
        value: 20
    });
}

function createArmorCrate(gridCol, gridRow) {
    const group = new THREE.Group();
    const matBlue = new THREE.MeshLambertMaterial({ color: 0x0f4fb7 });
    const matCyan = new THREE.MeshBasicMaterial({ color: 0x22eeee });
    
    // Armor container box
    const mainBox = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.38, 0.42), matBlue);
    group.add(mainBox);
    
    // Shield banding
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.44), matCyan);
    group.add(stripe);
    
    const x = (gridCol + 0.5) * TILE_SIZE;
    const z = (gridRow + 0.5) * TILE_SIZE;
    group.position.set(x, 0.4, z);
    
    scene.add(group);
    
    items.push({
        type: 'armor',
        x: x,
        z: z,
        mesh: group,
        active: true,
        value: 25
    });
}

// --- HUD State Sync ---
function updateHUD() {
    hudHealth.innerText = player.health + "%";
    hudArmor.innerText = player.armor + "%";
    hudAmmo.innerText = player.ammo;
    
    // Handle coloring alerts
    if (player.health <= 35) {
        hudHealth.className = 'hud-value'; // red alert
    } else {
        hudHealth.className = 'hud-value green';
    }
    
    if (player.armor <= 20) {
        hudArmor.className = 'hud-value';
    } else {
        hudArmor.className = 'hud-value green';
    }
    
    // Handle faces expression based on health/overrides
    if (faceOverride) {
        hudFace.innerText = faceOverride;
    } else {
        if (player.health > 70) {
            hudFace.innerText = '😎';
        } else if (player.health > 35) {
            hudFace.innerText = '🤕';
        } else if (player.health > 0) {
            hudFace.innerText = '😭';
        } else {
            hudFace.innerText = '😵';
        }
    }
}

// --- Collision Resolution & Sliding ---
function checkCollision(x, z) {
    const radius = player.radius;
    
    // Determine checking bounds inside the grid map
    const minCol = Math.max(0, Math.floor((x - radius) / TILE_SIZE));
    const maxCol = Math.min(MAP_SIZE - 1, Math.floor((x + radius) / TILE_SIZE));
    const minRow = Math.max(0, Math.floor((z - radius) / TILE_SIZE));
    const maxRow = Math.min(MAP_SIZE - 1, Math.floor((z + radius) / TILE_SIZE));
    
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = MAP[r][c];
            if (cell === 1 || cell === 3) { // Wall blocks
                const left = c * TILE_SIZE;
                const right = (c + 1) * TILE_SIZE;
                const top = r * TILE_SIZE;
                const bottom = (r + 1) * TILE_SIZE;
                
                // Find closest point on wall box to player center
                const closestX = Math.max(left, Math.min(x, right));
                const closestZ = Math.max(top, Math.min(z, bottom));
                
                // Calculate distance
                const dx = x - closestX;
                const dz = z - closestZ;
                const distSq = dx * dx + dz * dz;
                
                if (distSq < radius * radius) {
                    return true; // Collision detected
                }
            }
        }
    }
    return false;
}

function spawnEnemy(type, gridCol, gridRow) {
    let texture, speed, health, damage, scale, yOffset, displayName;
    
    if (type === 'demon') {
        texture = generateEnemyTexture();
        speed = 1.2;
        health = 2;
        damage = 12;
        scale = 1.8;
        yOffset = 0.9;
        displayName = 'DEMON';
    } else if (type === 'pinky') {
        texture = generatePinkyTexture();
        speed = 2.1;
        health = 3;
        damage = 8;
        scale = 1.6;
        yOffset = 0.8;
        displayName = 'PINKY';
    } else if (type === 'gorilla') {
        texture = generateGorillaTexture();
        speed = 0.8;
        health = 5;
        damage = 25;
        scale = 2.4;
        yOffset = 1.2;
        displayName = 'GORILLA';
    } else {
        return;
    }
    
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    
    const enemyX = gridCol * TILE_SIZE;
    const enemyZ = gridRow * TILE_SIZE;
    sprite.position.set(enemyX, yOffset, enemyZ);
    scene.add(sprite);
    
    const enemyObj = {
        type: type,
        displayName: displayName,
        mesh: sprite,
        x: enemyX,
        z: enemyZ,
        speed: speed,
        health: health,
        maxHealth: health,
        damage: damage,
        maxScale: scale,
        yOffset: yOffset,
        active: true,
        dying: false,
        deathTimer: 0,
        startX: enemyX,
        startZ: enemyZ,
        damageTimer: 0,
        respawnTimer: type === 'demon' ? 10000 : (type === 'pinky' ? 12000 : 15000)
    };
    
    enemies.push(enemyObj);
    return enemyObj;
}

// --- Game Engine Setup & Initialization ---
function init() {
    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0e0e13, 0.05);
    
    // 2. Setup Camera
    const width = screenDiv.clientWidth;
    const height = screenDiv.clientHeight;
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.rotation.order = 'YXZ'; // FPS standard rotation order
    
    // Attach Camera to Scene
    scene.add(camera);
    
    // 3. Setup WebGL Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0e0e13, 1.0);
    
    // Create UI overlays
    createDamageFlash();
    
    // 4. Generate Materials & Textures
    const wallTexture = generateWallTexture();
    const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture });
    
    const terminalTexture = generateTerminalTexture();
    const terminalMaterial = new THREE.MeshLambertMaterial({ 
        map: terminalTexture,
        emissive: new THREE.Color(0x00cc44),
        emissiveIntensity: 0.25
    });
    
    const floorTexture = generateFloorTexture();
    const floorMaterial = new THREE.MeshLambertMaterial({ map: floorTexture });
    
    const ceilingTexture = generateCeilingTexture();
    const ceilingMaterial = new THREE.MeshLambertMaterial({ map: ceilingTexture });
    
    const acidTexture = generateAcidTexture();
    acidMaterial = new THREE.MeshLambertMaterial({ 
        map: acidTexture,
        emissive: new THREE.Color(0x11ff22),
        emissiveIntensity: 0.2
    });
    
    // 5. Build Map Maze
    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const floorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const ceilingGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    
    for (let r = 0; r < MAP_SIZE; r++) {
        for (let c = 0; c < MAP_SIZE; c++) {
            const cell = MAP[r][c];
            
            // Render Wall blocks
            if (cell === 1 || cell === 3) {
                const mat = cell === 1 ? wallMaterial : terminalMaterial;
                const wallMesh = new THREE.Mesh(wallGeo, mat);
                wallMesh.position.set(
                    (c + 0.5) * TILE_SIZE,
                    TILE_SIZE / 2,
                    (r + 0.5) * TILE_SIZE
                );
                scene.add(wallMesh);
            }
            
            // Render Floors cell-by-cell
            const isAcid = (cell === 2);
            const fMat = isAcid ? acidMaterial : floorMaterial;
            const floorMesh = new THREE.Mesh(floorGeo, fMat);
            floorMesh.rotation.x = -Math.PI / 2;
            floorMesh.position.set(
                (c + 0.5) * TILE_SIZE,
                0,
                (r + 0.5) * TILE_SIZE
            );
            scene.add(floorMesh);
            
            // Render Ceilings cell-by-cell (only where empty space exists)
            if (cell !== 1 && cell !== 3) {
                const ceilMesh = new THREE.Mesh(ceilingGeo, ceilingMaterial);
                ceilMesh.rotation.x = Math.PI / 2;
                ceilMesh.position.set(
                    (c + 0.5) * TILE_SIZE,
                    TILE_SIZE,
                    (r + 0.5) * TILE_SIZE
                );
                scene.add(ceilMesh);
            }
        }
    }
    
    // 6. Spawn pickup items (rotate / float)
    createAmmoCrate(3, 4);
    createAmmoCrate(7, 2);
    createArmorCrate(1, 8);
    createArmorCrate(8, 7);
    
    // 7. Lighting setup
    const ambientLight = new THREE.AmbientLight(0x202028, 0.4);
    scene.add(ambientLight);
    
    // Flashlight (PointLight attached to player camera)
    playerLight = new THREE.PointLight(0xffddaa, 2.0, 14);
    camera.add(playerLight);
    
    // Gun fire Muzzle Flash light
    muzzleFlashLight = new THREE.PointLight(0xffaa22, 0, 18);
    camera.add(muzzleFlashLight);
    
    // 8. Initialize 2D weapon canvas overlay
    weaponCanvas = document.getElementById('weapon-canvas');
    if (weaponCanvas) {
        weaponCtx = weaponCanvas.getContext('2d');
        weaponCanvas.width = 64;
        weaponCanvas.height = 64;
        draw2DWeapon(0);
    }
    
    // 9. Construct and spawn 3D target cylinder
    const targetTex = generateTargetTexture();
    const targetGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12);
    const targetMat = new THREE.MeshLambertMaterial({ 
        map: targetTex,
        emissive: new THREE.Color(0xff2222),
        emissiveIntensity: 0.1
    });
    targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(5.5 * TILE_SIZE, 0.8, 1.5 * TILE_SIZE);
    scene.add(targetMesh);
    
    // 10. Construct and spawn tracking 2D enemy demon sprite billboards
    spawnEnemy('demon', 8.5, 1.5);
    spawnEnemy('pinky', 1.5, 8.5);
    spawnEnemy('gorilla', 8.5, 8.5);
    
    // 9. Sync HUD UI
    updateHUD();
    
    // 10. Start Animation render Loop
    requestAnimationFrame(gameLoop);
}

// --- Input Handlers ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === 'w' || e.key === 'ArrowUp') keys.w = true;
    if (key === 's' || e.key === 'ArrowDown') keys.s = true;
    if (key === 'a') keys.a = true;
    if (key === 'd') keys.d = true;
    
    if (e.key === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.key === 'ArrowRight') keys.ArrowRight = false; // Note: correct assignments
    if (e.key === 'ArrowRight') keys.ArrowRight = true;
    if (e.key === 'ArrowLeft') keys.ArrowLeft = true;
    
    // Space or Click to shoot
    if (e.key === ' ' || e.key === 'Spacebar') {
        shoot();
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === 'w' || e.key === 'ArrowUp') keys.w = false;
    if (key === 's' || e.key === 'ArrowDown') keys.s = false;
    if (key === 'a') keys.a = false;
    if (key === 'd') keys.d = false;
    
    if (e.key === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.key === 'ArrowRight') keys.ArrowRight = false;
});

// Pointer Lock Controls (Mouse Rotation)
window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    
    const sensitivity = 0.0022;
    player.yaw -= e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    
    // Cap vertical angle
    const limit = Math.PI / 3.2;
    player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

// Pointer Lock UI bindings
startBtn.addEventListener('click', () => {
    canvas.requestPointerLock();
    initAudio();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        overlay.classList.add('hidden');
        isPaused = false;
        lastTime = performance.now(); // reset delta timer
    } else {
        overlay.classList.remove('hidden');
        isPaused = true;
        // Reset keys state when pausing
        Object.keys(keys).forEach(k => keys[k] = false);
    }
});

// Mouse click to shoot (in game)
canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement === canvas && e.button === 0) {
        shoot();
    }
});

// Windows resize adaptation
window.addEventListener('resize', () => {
    if (!renderer) return;
    const width = screenDiv.clientWidth;
    const height = screenDiv.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

// --- Dynamic Simulation Update Loop ---
let acidDmgTimer = 0;

function gameLoop(time) {
    requestAnimationFrame(gameLoop);
    
    const dt = Math.min((time - lastTime) / 1000, 0.1); // cap max step at 100ms
    lastTime = time;
    
    if (isPaused || player.health <= 0) {
        // Still render but skip game physics updates
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
        return;
    }
    
    // 1. Update Player Yaw (left/right manual rotation using keys)
    const keyboardRotateSpeed = 2.2;
    if (keys.ArrowLeft) {
        player.yaw += keyboardRotateSpeed * dt;
    }
    if (keys.ArrowRight) {
        player.yaw -= keyboardRotateSpeed * dt;
    }
    
    // 2. Translate direction angles to translation step vectors (corrected mathematics)
    let dx = 0;
    let dz = 0;
    
    if (keys.w) {
        dx += -Math.sin(player.yaw);
        dz += -Math.cos(player.yaw);
    }
    if (keys.s) {
        dx += Math.sin(player.yaw);
        dz += Math.cos(player.yaw);
    }
    if (keys.a) {
        dx += -Math.cos(player.yaw);
        dz += Math.sin(player.yaw);
    }
    if (keys.d) {
        dx += Math.cos(player.yaw);
        dz += -Math.sin(player.yaw);
    }
    
    // Normalize moving translation vector
    const moveLen = Math.sqrt(dx * dx + dz * dz);
    let moving = false;
    if (moveLen > 0) {
        dx = (dx / moveLen) * player.speed * dt;
        dz = (dz / moveLen) * player.speed * dt;
        moving = true;
    }
    
    // 3. Collision Check & Resolution (Sliding along walls)
    const nextX = player.x + dx;
    const nextZ = player.z + dz;
    
    if (!checkCollision(nextX, player.z)) {
        player.x = nextX;
    }
    if (!checkCollision(player.x, nextZ)) {
        player.z = nextZ;
    }
    
    // 4. Update camera matrix and rotation orientation
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    
    // 5. Update items float animation & spin
    items.forEach(item => {
        if (!item.active) return;
        
        item.mesh.rotation.y += 1.8 * dt;
        item.mesh.position.y = 0.4 + Math.sin(time * 0.0035 + item.x) * 0.08;
        
        // Item collision detection
        const itemDist = Math.sqrt((player.x - item.x) ** 2 + (player.z - item.z) ** 2);
        if (itemDist < 1.0) {
            if (item.type === 'ammo') {
                player.ammo = Math.min(99, player.ammo + item.value);
                playPickupSound();
                deactivateItem(item);
            } else if (item.type === 'armor') {
                if (player.armor < 100) {
                    player.armor = Math.min(100, player.armor + item.value);
                    playPickupSound();
                    deactivateItem(item);
                }
            }
        }
    });
    
    // 6. Hazard/Acid Damage check
    const gridX = Math.floor(player.x / TILE_SIZE);
    const gridZ = Math.floor(player.z / TILE_SIZE);
    if (gridX >= 0 && gridX < MAP_SIZE && gridZ >= 0 && gridZ < MAP_SIZE && MAP[gridZ][gridX] === 2) {
        acidDmgTimer += dt;
        if (acidDmgTimer >= 0.5) { // damage ticks every 0.5 seconds
            acidDmgTimer = 0;
            takeDamage(10);
        }
    } else {
        acidDmgTimer = 0.45; // trigger almost immediately upon stepping
    }
    
    // 7. Update target cylinder floating & hit reaction
    if (targetMesh) {
        targetMesh.position.y = 0.8 + Math.sin(time * 0.003) * 0.1;
        if (targetHitTime > 0) {
            targetMesh.rotation.y += 18.0 * dt; // spin rapidly
            targetHitTime -= dt;
            targetMesh.material.emissiveIntensity = 0.8; // intense red emission glow
        } else {
            targetMesh.rotation.y += 1.5 * dt; // normal rotation
            targetMesh.material.emissiveIntensity = 0.1;
        }
    }
    
    // 8. Update tracking enemy demon AI & death animation
    enemies.forEach(e => {
        if (!e.active) return;
        
        if (e.dying) {
            e.deathTimer -= dt;
            // Death animation: spin/tilt sideways, sink down, and shrink scale to 0
            const t = Math.max(0, e.deathTimer / 1.2);
            e.mesh.material.rotation += 3.5 * dt; // tilt sideways
            e.mesh.position.y = (e.yOffset || 0.9) - (1.0 - t) * 1.2; // sink
            e.mesh.scale.set(e.maxScale * t, e.maxScale * t, 1.0); // shrink
            
            if (e.deathTimer <= 0) {
                e.active = false;
                scene.remove(e.mesh);
                // Respawn enemy after specified timer
                setTimeout(() => {
                    respawnEnemy(e);
                }, e.respawnTimer || 10000);
            }
        } else {
            // Normal tracking AI
            const toPlayerX = player.x - e.x;
            const toPlayerZ = player.z - e.z;
            const dist = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
            
            if (dist > 0.8) {
                // Track player slowly
                const edx = (toPlayerX / dist) * e.speed * dt;
                const edz = (toPlayerZ / dist) * e.speed * dt;
                
                const nextEnemyX = e.x + edx;
                const nextEnemyZ = e.z + edz;
                
                // Collision checks for sliding along walls
                if (!checkCollision(nextEnemyX, e.z)) {
                    e.x = nextEnemyX;
                }
                if (!checkCollision(e.x, nextEnemyZ)) {
                    e.z = nextEnemyZ;
                }
                
                e.mesh.position.set(e.x, e.yOffset || 0.9, e.z);
            } else {
                // If touching player, damage the player!
                e.damageTimer += dt;
                if (e.damageTimer >= 0.8) {
                    e.damageTimer = 0;
                    takeDamage(e.damage);
                }
            }
        }
    });
    
    // 9. Weapon Animations & Muzzle Flash decays
    let weaponFrame = 0;
    if (isFiring) {
        fireTimer += dt;
        if (fireTimer < fireDuration) {
            const progress = fireTimer / fireDuration;
            if (progress < 0.2) {
                weaponFrame = 1; // firing flash
            } else if (progress < 0.55) {
                weaponFrame = 2; // recoil
            } else {
                weaponFrame = 3; // recover
            }
        } else {
            isFiring = false;
        }
    }
    
    // Bobbing timer ticks when player is moving and not firing
    if (moving && !isFiring) {
        bobTimer += dt * player.speed * 2.2;
    }
    
    // Draw updated 2D weapon frame on overlay canvas
    draw2DWeapon(weaponFrame);
    
    // Decaying muzzle light intensity
    if (muzzleFlashLight.intensity > 0) {
        muzzleFlashLight.intensity = Math.max(0, muzzleFlashLight.intensity - dt * 45);
    }
    
    // 10. Timers overrides for face expression
    if (faceOverrideTimer > 0) {
        faceOverrideTimer -= dt;
        if (faceOverrideTimer <= 0) {
            faceOverride = '';
            updateHUD();
        }
    }
    
    // 11. Position camera & dynamic lighting
    camera.position.set(player.x, player.eyeHeight, player.z);
    
    // Animate glowing radioactive slime texture offset for liquid movement
    if (acidMaterial && acidMaterial.map) {
        acidMaterial.map.offset.y += 0.15 * dt;
        acidMaterial.map.offset.x = Math.sin(time * 0.001) * 0.04;
    }
    
    // Render the scene!
    renderer.render(scene, camera);
}

function deactivateItem(item) {
    item.active = false;
    item.mesh.visible = false;
    setTimeout(() => {
        item.active = true;
        item.mesh.visible = true;
    }, 10000);
    updateHUD();
}

function respawnEnemy(enemyObj) {
    if (!enemyObj) return;
    enemyObj.active = true;
    enemyObj.dying = false;
    enemyObj.health = enemyObj.maxHealth;
    enemyObj.x = enemyObj.startX;
    enemyObj.z = enemyObj.startZ;
    enemyObj.mesh.position.set(enemyObj.startX, enemyObj.yOffset || 0.9, enemyObj.startZ);
    enemyObj.mesh.scale.set(enemyObj.maxScale, enemyObj.maxScale, 1.0);
    enemyObj.mesh.material.rotation = 0;
    scene.add(enemyObj.mesh);
    triggerHitNotification(`${enemyObj.displayName} RESPAWNED!`, 'enemy-spawn');
}

// --- Initialize Engine on DOM Load ---
window.addEventListener('DOMContentLoaded', () => {
    init();
});

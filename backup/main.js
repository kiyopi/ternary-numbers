import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// --- CONSTANTS ---
const CONSTANTS = {
    CYCLE_DURATION: 1000,
    KUN_CYCLES: 12,
    ON_CYCLES: 16,
    HAI_TENGU_INTENSITY: 0.03,
    PARTICLE_RADIUS: 3,
    KUN_AMBIENT_GAIN: 0.02,
    ON_AMBIENT_GAIN: 0.025,
    AUDIO_FADE_DURATION: 0.5,
};

// --- INITIAL CHECK ---
if (!window.WebGLRenderingContext) {
    document.getElementById('webgl-warning').style.display = 'block';
    throw new Error('WebGL is not supported');
}

// --- UI ELEMENTS ---
const ui = {
    guidePanel: document.getElementById('guide-panel'),
    guideText: document.getElementById('guide-text'),
    guideButton: document.getElementById('guide-button'),
    hudContainer: document.getElementById('hud-container'),
    emotionInfo: document.getElementById('emotion-info'),
    kunBtn: document.getElementById('kun-btn'),
    onBtn: document.getElementById('on-btn'),
    modeInfo: document.getElementById('mode-info'),
    cycleInfo: document.getElementById('cycle-info'),
    flashOverlay: document.getElementById('flash-overlay'),
    commentaryTitle: document.getElementById('commentary-title'),
    commentaryText: document.getElementById('commentary-text'),
    angleInfo: document.getElementById('angle-info'),
    colorInfo: document.getElementById('color-info')
};

for (const key in ui) {
    if (!ui[key]) {
        throw new Error(`UI element with id '${key}' not found.`);
    }
}

// --- GLOBAL VARIABLES ---
let audioCtx;
const sounds = {};
let currentGuideStep = 0;
let simState = {
    mode: 'kun',
    cycles: CONSTANTS.KUN_CYCLES,
    currentCycle: 0,
    lastCycleTime: 0,
    currentEmotion: '喜',
    activeParticle: null
};
const guideSteps = [
    { text: "ようこそ。これは世界の法則を観測するシミュレーターです。", button: "始める" },
    { text: "中央の核は、あなたの『視点』で意味（色）を変えます。マウスでドラッグして、世界を観測してください。", button: "理解した" },
    { text: "素晴らしい。世界には二つの認識法があります。UIを有効化し、『訓読み』モードを起動します。", button: "次へ" },
    { text: "これが『片脳モード』です。世界は12の周期で流れています。特定のサイクルで起こる『共鳴』を探してください。", button: "観測を続ける" },
    { text: "『音読み』モードに切り替えて、より高次の16サイクルと、世界の基盤『灰tengu』の振動を体感してください。", button: "完了" }
];

// --- 3D SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- POST-PROCESSING (Hai-tengu) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const HaiTenguShader = {
    uniforms: { 'tDiffuse': { value: null }, 'time': { value: 0.0 }, 'intensity': { value: 0.0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float intensity; varying vec2 vUv;
        float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float noise = (random(vUv * (1.0 + time * 0.01)) - 0.5) * intensity;
            gl_FragColor = vec4(color.rgb + noise, color.a);
        }`
};
const haiTenguPass = new ShaderPass(HaiTenguShader);
composer.addPass(haiTenguPass);

// --- 3D OBJECTS & LIGHTING ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(8, 10, 5);
scene.add(dirLight);
const crystal = new THREE.Mesh( new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.3 }) );
scene.add(crystal);
const particleGroup = new THREE.Group();
scene.add(particleGroup);
const planeMaterial = (color) => new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.1, depthWrite: false });
const planeSize = 12;
const kokeTengu = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), planeMaterial(0x00ff00));
kokeTengu.rotation.x = -Math.PI / 2;
const shuTengu = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), planeMaterial(0xff8800));
const kuuTengu = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), planeMaterial(0x00aaff));
kuuTengu.rotation.y = Math.PI / 2;
const tenguGroup = new THREE.Group();
tenguGroup.add(kokeTengu, shuTengu, kuuTengu);
scene.add(tenguGroup);

// --- DATA ---
const emotions = {
    '喜': { color: '#282800', number: 15, front: new THREE.Color("#f5a623"), side: new THREE.Color("#50e3c2") },
    '怒': { color: '#280000', number: 5,  front: new THREE.Color("#d0021b"), side: new THREE.Color("#bd10e0") },
    '哀': { color: '#000028', number: 3,  front: new THREE.Color("#4a90e2"), side: new THREE.Color("#ffffff") },
    '楽': { color: '#002800', number: 9,  front: new THREE.Color("#7ed321"), side: new THREE.Color("#4a4a4a") }
};
const emotionOrder = ['喜', '怒', '哀', '楽'];
const commentaries = {
    kun: { title: "片脳モード (訓読み)", text: "世界を12のサイクルで認識します。主に左脳が活動し、基本的な物質世界の法則を捉えるモードです。" },
    on: { title: "両脳モード (音読み)", text: "世界を16のサイクルで認識。左右の脳が共鳴し、潜在意識『灰tengu』が活性化。空間全体の微細なゆらぎとして観測されます。" }
};

// --- FUNCTIONS ---
function updateGuide() {
    if (currentGuideStep >= guideSteps.length) { ui.guidePanel.classList.remove('visible'); return; }
    ui.guidePanel.classList.add('visible');
    ui.guideText.innerText = guideSteps[currentGuideStep].text;
    ui.guideButton.innerText = guideSteps[currentGuideStep].button;
}

function setMode(newMode) {
    simState.mode = newMode;
    simState.cycles = (newMode === 'kun') ? CONSTANTS.KUN_CYCLES : CONSTANTS.ON_CYCLES;
    ui.kunBtn.classList.toggle('active', newMode === 'kun');
    ui.onBtn.classList.toggle('active', newMode !== 'kun');
    ui.modeInfo.innerText = `モード: ${newMode === 'kun' ? '訓読み' : '音読み'}`;
    ui.commentaryTitle.innerText = commentaries[newMode].title;
    ui.commentaryText.innerText = commentaries[newMode].text;
    haiTenguPass.uniforms.intensity.value = (newMode === 'on') ? CONSTANTS.HAI_TENGU_INTENSITY : 0.0;
    kokeTengu.material.opacity = (newMode === 'kun') ? 0.25 : 0.15;
    shuTengu.material.opacity = (newMode === 'on') ? 0.25 : 0.1;
    kuuTengu.material.opacity = (newMode === 'on') ? 0.25 : 0.1;
    simState.currentCycle = 0;
    updateParticles();
    
    if(audioCtx) {
        const now = audioCtx.currentTime;
        const fadeTime = now + CONSTANTS.AUDIO_FADE_DURATION;
        const kunGainParam = sounds.kunAmbient.gain.gain;
        const onGainParam = sounds.onAmbient.gain.gain;
        
        kunGainParam.cancelScheduledValues(now);
        onGainParam.cancelScheduledValues(now);
        
        if (newMode === 'kun') {
            sounds.kunSelect();
            kunGainParam.linearRampToValueAtTime(CONSTANTS.KUN_AMBIENT_GAIN, fadeTime);
            onGainParam.linearRampToValueAtTime(0, fadeTime);
        } else {
            sounds.onSelect();
            kunGainParam.linearRampToValueAtTime(0, fadeTime);
            onGainParam.linearRampToValueAtTime(CONSTANTS.ON_AMBIENT_GAIN, fadeTime);
        }
    }
}

function triggerResonance() {
    ui.flashOverlay.style.opacity = 1;
    setTimeout(() => { ui.flashOverlay.style.opacity = 0; }, 250);
    if(audioCtx && sounds.resonance) sounds.resonance();
}

function updateParticles() {
    particleGroup.clear();
    const radius = CONSTANTS.PARTICLE_RADIUS;
    for (let i = 0; i < simState.cycles; i++) {
        const angle = (i / simState.cycles) * Math.PI * 2;
        const p = new THREE.Mesh( new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }) );
        p.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        particleGroup.add(p);
    }
    simState.activeParticle = null;
}

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') { audioCtx.resume(); }
    } catch(e) {
        console.error("Web Audio API not supported.", e);
        audioCtx = null;
        return;
    }
    sounds.kunSelect = createSoundEffect(220, 0.1, 'square');
    sounds.onSelect = createSoundEffect(440, 0.3, 'sine');
    sounds.resonance = createHarmonicSound(523.25, 0.5);
    sounds.kunAmbient = createAmbientSound(55, 'sine');
    sounds.onAmbient = createAmbientSound(65.41, 'sine');
    sounds.onAmbient.detune.value = 5;
}

function createSoundEffect(freq, duration, type) {
    return () => {
        if(!audioCtx) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + duration);
    };
}
function createHarmonicSound(baseFreq, duration) {
    return () => {
        if(!audioCtx) return;
        [baseFreq, baseFreq * 1.5, baseFreq * 2].forEach(freq => {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + duration);
        });
    };
}
function createAmbientSound(freq, type) {
    if(!audioCtx) return { gain: null, detune: null, start: () => {} };
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = 0;
    osc.connect(gain); gain.connect(audioCtx.destination);
    return { gain: gain, detune: osc.detune, start: () => osc.start(0) };
}

// --- EVENT LISTENERS ---
ui.guideButton.addEventListener('click', () => {
    if (!audioCtx) {
        initAudio();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    currentGuideStep++;
    updateGuide();
    if (currentGuideStep === 3) {
        ui.hudContainer.classList.add('visible');
        ui.emotionInfo.classList.add('visible');
        setMode('kun');
        if(audioCtx) {
            sounds.kunAmbient.start();
            sounds.onAmbient.start();
        }
    }
});
const handleBtnKeyPress = (e, mode) => { if(e.key === 'Enter') setMode(mode); };
ui.kunBtn.addEventListener('keydown', (e) => handleBtnKeyPress(e, 'kun'));
ui.onBtn.addEventListener('keydown', (e) => handleBtnKeyPress(e, 'on'));
ui.kunBtn.addEventListener('click', () => setMode('kun'));
ui.onBtn.addEventListener('click', () => setMode('on'));
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();
    const elapsedTime = clock.getElapsedTime();
    haiTenguPass.uniforms.time.value = elapsedTime;
    
    if (now - simState.lastCycleTime > CONSTANTS.CYCLE_DURATION && currentGuideStep >= 3) {
        simState.lastCycleTime = now;
        simState.currentCycle = (simState.currentCycle + 1) % simState.cycles;
        const emotionIndex = simState.currentCycle % 4;
        simState.currentEmotion = emotionOrder[emotionIndex];
        
        ui.emotionInfo.innerText = simState.currentEmotion;
        document.body.style.backgroundColor = emotions[simState.currentEmotion].color;
        ui.cycleInfo.innerText = `サイクル: ${simState.currentCycle + 1}/${simState.cycles}`;

        if (simState.activeParticle) {
            simState.activeParticle.material.color.set(0xffffff);
            simState.activeParticle.scale.setScalar(1);
        }
        const newActiveParticle = particleGroup.children[simState.currentCycle];
        if (newActiveParticle) {
            newActiveParticle.material.color.set('#00aaff');
            newActiveParticle.scale.setScalar(2);
            simState.activeParticle = newActiveParticle;
        }

        if ((simState.currentCycle + 1) === emotions[simState.currentEmotion].number) {
            triggerResonance();
        }
    }
    
    const emotionData = emotions[simState.currentEmotion];
    if(emotionData) {
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const angleFactor = (cameraDirection.x + 1) / 2;
        crystal.material.color.lerpColors(emotionData.front, emotionData.side, angleFactor);
        const angle = new THREE.Vector3(0,0,-1).angleTo(cameraDirection);
        ui.angleInfo.innerText = `視点角度: ${angle.toFixed(2)}`;
        const c = crystal.material.color;
        ui.colorInfo.innerText = `色(RGB): ${c.r.toFixed(2)},${c.g.toFixed(2)},${c.b.toFixed(2)}`;
    }

    crystal.rotation.y += 0.005;
    particleGroup.rotation.y += 0.002;
    controls.update();
    composer.render();
}

// --- STARTUP ---
updateGuide();
animate();
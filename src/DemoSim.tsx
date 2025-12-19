import { useEffect, useRef, useState } from "preact/hooks";
import * as THREE from "three";

import "./DemoSim.css";

// Constants
const FFT_SIZE = 2048;
const FREQ_BINS = FFT_SIZE / 2;
const HISTORY_SIZE = 512; // Number of history frames to keep
const MIN_NOTE_DURATION = 50; // ms
const NOTE_THRESHOLD = 100; // Amplitude threshold (0-255)
const NOTES_TO_SHOW = 5;
const MAX_FREQ_SCALE = 0.125; // 0.5 = Half of Nyquist (e.g. 0-11kHz if 44.1kHz)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteFromFrequency(frequency: number): string {
    if (frequency === 0) return '';
    // A4 = 440Hz = MIDI 69
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;
    // MIDI range 0-127
    if (midi < 0 || midi > 127) return '';
    const noteName = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}${octave}`;
}

export const DemoSim = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvas3DRef = useRef<HTMLCanvasElement>(null);
    const notesContainerRef = useRef<HTMLDivElement>(null);
    const notesScrollRef = useRef<HTMLDivElement>(null);
    const [started, setStarted] = useState(false);

    // Audio refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    // Visualization refs
    const textureDataRef = useRef<Uint8Array | null>(null);
    const textureRef = useRef<THREE.DataTexture | null>(null);

    // Note detection refs
    const activeNotesRef = useRef<Map<string, number>>(new Map()); // Note -> StartTime (ms)

    // Lane Logic Refs
    const lanesRef = useRef<(string | null)[]>(new Array(NOTES_TO_SHOW).fill(null));
    const scrollPosRef = useRef<number>(0);

    const startAudio = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = 0.5; // Smooth out the FFT

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

            // Initialize texture data
            // Width = FREQ_BINS, Height = HISTORY_SIZE
            // We use RedFormat, so 1 byte per pixel
            textureDataRef.current = new Uint8Array(FREQ_BINS * HISTORY_SIZE).fill(0);

            setStarted(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please ensure you have granted permission.");
        }
    };

    useEffect(() => {
        if (!started || !canvas3DRef.current || !notesScrollRef.current || !notesContainerRef.current) return;

        const canvas = canvas3DRef.current;
        const notesScroll = notesScrollRef.current;
        const notesContainer = notesContainerRef.current;

        // Three.js Setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);

        // Texture
        const texture = new THREE.DataTexture(
            textureDataRef.current!,
            FREQ_BINS,
            HISTORY_SIZE,
            THREE.RedFormat,
            THREE.UnsignedByteType
        );
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        textureRef.current = texture;

        // Shader Material to swap axes
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uMaxFreqScale: { value: MAX_FREQ_SCALE }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform float uMaxFreqScale;
                varying vec2 vUv;
                void main() {
                    // vUv.x (0..1) -> Screen X (Left to Right)
                    // vUv.y (0..1) -> Screen Y (Bottom to Top)

                    // We want Screen X to map to Time (Texture Y)
                    // We want Screen Y to map to Frequency (Texture X)

                    // Texture Y=0 is Oldest, Y=1 is Newest.
                    // We want Oldest on Left (Screen X=0), Newest on Right (Screen X=1).
                    // So Texture Y = vUv.x

                    // Texture X=0 is Low Freq, X=1 is High Freq.
                    // We want Low Freq on Bottom (Screen Y=0), High Freq on Top (Screen Y=1).
                    // So Texture X = vUv.y * uMaxFreqScale (to zoom in)

                    float amp = texture2D(uTexture, vec2(vUv.y * uMaxFreqScale, vUv.x)).r;
                    gl_FragColor = vec4(vec3(amp), 1.0);
                }
            `
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);

        // Animation Loop
        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            if (!analyserRef.current || !dataArrayRef.current || !textureDataRef.current || !textureRef.current) return;

            const analyser = analyserRef.current;
            const dataArray = dataArrayRef.current;
            const textureData = textureDataRef.current;

            // Get frequency data
            analyser.getByteFrequencyData(dataArray);

            // Update Texture Data
            // Shift rows down (towards index 0).
            // Row 0 is oldest. Row N is newest.
            // We want to discard Row 0, move Row 1 to Row 0, etc.
            const rowSize = FREQ_BINS;
            textureData.copyWithin(0, rowSize);

            // Fill last row with new data
            const lastRowOffset = (HISTORY_SIZE - 1) * rowSize;
            textureData.set(dataArray, lastRowOffset);

            textureRef.current.needsUpdate = true;

            renderer.render(scene, camera);

            // --- Note Detection ---
            const now = audioContextRef.current!.currentTime * 1000; // ms
            const sampleRate = audioContextRef.current!.sampleRate;

            // Find top NOTES_TO_SHOW frequencies
            const peaks: { freq: number, amp: number }[] = [];
            // Only scan up to MAX_FREQ_SCALE portion of the array
            const maxBin = Math.floor(dataArray.length * MAX_FREQ_SCALE);

            for (let i = 0; i < maxBin; i++) {
                if (dataArray[i] > NOTE_THRESHOLD) {
                    peaks.push({
                        freq: i * sampleRate / FFT_SIZE,
                        amp: dataArray[i]
                    });
                }
            }
            peaks.sort((a, b) => b.amp - a.amp);
            const topPeaks = peaks.slice(0, NOTES_TO_SHOW);

            const currentNotes = new Set<string>();
            topPeaks.forEach(p => {
                const note = getNoteFromFrequency(p.freq);
                if (note) currentNotes.add(note);
            });

            // Update active notes (Debouncing)
            const confirmedNotes = new Set<string>();

            // Check existing active notes
            for (const [note, startTime] of activeNotesRef.current.entries()) {
                if (currentNotes.has(note)) {
                    // Still active
                    if (now - startTime > MIN_NOTE_DURATION) {
                        confirmedNotes.add(note);
                    }
                } else {
                    // Note stopped
                    activeNotesRef.current.delete(note);
                }
            }

            // Add new notes
            for (const note of currentNotes) {
                if (!activeNotesRef.current.has(note)) {
                    activeNotesRef.current.set(note, now);
                }
            }

            // --- Lane Logic & HTML Rendering ---

            // Calculate scroll step
            const containerWidth = notesContainer.clientWidth;
            const stepPixels = containerWidth / HISTORY_SIZE;

            // Update scroll position
            scrollPosRef.current += stepPixels;
            notesScroll.style.transform = `translateX(-${scrollPosRef.current}px)`;

            // Clean up old nodes (simple optimization)
            // In a real app, we might use a virtual list or more aggressive culling
            if (notesScroll.childElementCount > 200) {
                // Remove first child if it's very old
                const firstChild = notesScroll.firstElementChild as HTMLElement;
                if (firstChild) {
                    const left = parseFloat(firstChild.style.left || "0");
                    if (left < scrollPosRef.current - 100) { // 100px buffer
                        notesScroll.removeChild(firstChild);
                    }
                }
            }

            const lanes = lanesRef.current;
            const nextLanes = [...lanes];
            const matchedNotes = new Set<string>();

            // 1. Keep existing notes in their lanes
            for (let i = 0; i < NOTES_TO_SHOW; i++) {
                const laneNote = lanes[i];
                if (laneNote && confirmedNotes.has(laneNote)) {
                    matchedNotes.add(laneNote);
                    // Note continues in this lane
                } else {
                    // Note stopped in this lane
                    nextLanes[i] = null;
                }
            }

            // 2. Assign new notes to empty lanes
            for (const note of confirmedNotes) {
                if (!matchedNotes.has(note)) {
                    // Find empty lane
                    const emptyIndex = nextLanes.indexOf(null);
                    if (emptyIndex !== -1) {
                        nextLanes[emptyIndex] = note;

                        // Create HTML Element
                        const el = document.createElement('div');
                        el.textContent = note;
                        el.className = 'note-label';
                        el.style.position = 'absolute';
                        el.style.left = `${scrollPosRef.current + containerWidth}px`;
                        el.style.top = `${emptyIndex * 25}px`; // 25px per lane
                        el.style.color = 'white';
                        el.style.fontFamily = 'monospace';
                        el.style.fontSize = '12px';
                        el.style.fontWeight = 'bold';
                        el.style.whiteSpace = 'nowrap';

                        notesScroll.appendChild(el);
                    }
                    // If no empty lane, note is dropped (priority to existing notes)
                }
            }

            lanesRef.current = nextLanes;
        };

        animate();

        // Handle resize
        const handleResize = () => {
            if (containerRef.current && canvas3DRef.current && notesContainerRef.current) {
                const width = containerRef.current.clientWidth;

                // Update 3D Canvas
                canvas3DRef.current.width = width;
                canvas3DRef.current.height = 400;
                renderer.setSize(width, 400);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Initial size

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            texture.dispose();
            material.dispose();
            plane.geometry.dispose();
            // Clear notes
            if (notesScrollRef.current) notesScrollRef.current.innerHTML = '';
        };
    }, [started]);

    return (
        <div className="demo-sim-container" ref={containerRef} style={{ width: '100%', maxWidth: '100%' }}>
            {!started && (
                <div className="start-overlay" style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10
                }}>
                    <button onClick={startAudio} style={{ padding: '10px 20px', fontSize: '16px' }}>
                        Start Microphone
                    </button>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <canvas ref={canvas3DRef} style={{ display: 'block', width: '100%', height: '400px' }} />
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    color: 'white',
                    pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '5px'
                }}>
                    Frequency (Y) vs Time (X)
                </div>
            </div>

            <div className="notes-container" ref={notesContainerRef} style={{
                background: '#222',
                width: '100%',
                height: '150px',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <div ref={notesScrollRef} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: '100%', // Will expand as we add items, but we translate it
                    willChange: 'transform'
                }}>

                </div>
            </div>
        </div>
    );
}

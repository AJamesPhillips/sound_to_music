import { useEffect, useRef, useState } from "preact/hooks";
import * as THREE from "three";

import "./DemoSim.css";

// Constants
const FFT_SIZE = 2048;
const FREQ_BINS = FFT_SIZE / 2;
const HISTORY_SIZE = 512; // Number of history frames to keep
const MIN_NOTE_DURATION = 50; // ms
const NOTE_THRESHOLD = 100; // Amplitude threshold (0-255)

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
    const canvasNotesRef = useRef<HTMLCanvasElement>(null);
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
    const noteHistoryRef = useRef<string[][]>(new Array(HISTORY_SIZE).fill([]));

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
        if (!started || !canvas3DRef.current || !canvasNotesRef.current) return;

        const canvas = canvas3DRef.current;
        const notesCanvas = canvasNotesRef.current;

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
                uTexture: { value: texture }
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
                    // So Texture X = vUv.y

                    float amp = texture2D(uTexture, vec2(vUv.y, vUv.x)).r;
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

            // Find top 5 frequencies
            const peaks: { freq: number, amp: number }[] = [];
            for (let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] > NOTE_THRESHOLD) {
                    peaks.push({
                        freq: i * sampleRate / FFT_SIZE,
                        amp: dataArray[i]
                    });
                }
            }
            peaks.sort((a, b) => b.amp - a.amp);
            const topPeaks = peaks.slice(0, 5);

            const currentNotes = new Set<string>();
            topPeaks.forEach(p => {
                const note = getNoteFromFrequency(p.freq);
                if (note) currentNotes.add(note);
            });

            // Update active notes
            const confirmedNotes: string[] = [];

            // Check existing active notes
            for (const [note, startTime] of activeNotesRef.current.entries()) {
                if (currentNotes.has(note)) {
                    // Still active
                    if (now - startTime > MIN_NOTE_DURATION) {
                        confirmedNotes.push(note);
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

            // Update Note History
            noteHistoryRef.current.shift();
            noteHistoryRef.current.push(confirmedNotes);

            // --- Render Notes ---
            const ctx = notesCanvas.getContext('2d');
            if (ctx) {
                const width = notesCanvas.width;
                const height = notesCanvas.height;
                ctx.clearRect(0, 0, width, height);

                ctx.fillStyle = 'white';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';

                // Draw history
                // Index 0 is oldest (Left), Index N is newest (Right)
                const colWidth = width / HISTORY_SIZE;

                // Optimization: Don't draw every single column if they are too dense
                // But we need to draw them to show the "bar".
                // We can skip if empty.

                for (let i = 0; i < HISTORY_SIZE; i++) {
                    const notes = noteHistoryRef.current[i];
                    if (notes && notes.length > 0) {
                        const x = i * colWidth + colWidth / 2;

                        // Draw notes vertically
                        notes.forEach((note, idx) => {
                            // Stagger or stack?
                            // "Column of text"
                            const y = 15 + idx * 12;
                            if (y < height) {
                                ctx.fillText(note, x, y);
                            }
                        });
                    }
                }
            }
        };

        animate();

        // Handle resize
        const handleResize = () => {
            if (containerRef.current && canvas3DRef.current && canvasNotesRef.current) {
                const width = containerRef.current.clientWidth;

                // Update 3D Canvas
                canvas3DRef.current.width = width;
                canvas3DRef.current.height = 400;
                renderer.setSize(width, 400);

                // Update Notes Canvas
                canvasNotesRef.current.width = width;
                canvasNotesRef.current.height = 150;
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

            <div className="notes-container" style={{ background: '#222', width: '100%', overflow: 'hidden' }}>
                <canvas ref={canvasNotesRef} style={{ display: 'block', width: '100%', height: '150px' }} />
            </div>
        </div>
    );
}

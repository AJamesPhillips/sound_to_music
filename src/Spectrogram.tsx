// Mostly from an LLM

import { useEffect, useRef } from "preact/hooks";
import * as THREE from "three";
import { AMPLITUDE_LOG_SCALE, FREQ_BINS, HISTORY_SIZE, MAX_FREQ_SCALE } from "./Constants";

interface SpectrogramProps {
    dataArray: Uint8Array | null;
}

export const Spectrogram = ({ dataArray }: SpectrogramProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textureDataRef = useRef<Uint8Array | null>(null);
    const textureRef = useRef<THREE.DataTexture | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const planeRef = useRef<THREE.Mesh | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;

        // Initialize texture data
        textureDataRef.current = new Uint8Array(FREQ_BINS * HISTORY_SIZE).fill(0);

        // Three.js Setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        sceneRef.current = scene;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        rendererRef.current = renderer;

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

        // Shader Material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uMaxFreqScale: { value: MAX_FREQ_SCALE },
                uAmplitudeLogScale: { value: AMPLITUDE_LOG_SCALE },
                uLogOfAmplitudeLogScale: { value: Math.log(1.0 + AMPLITUDE_LOG_SCALE) },
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
                uniform float uAmplitudeLogScale;
                uniform float uLogOfAmplitudeLogScale;
                varying vec2 vUv;
                void main() {
                    float amp = texture2D(uTexture, vec2(vUv.y * uMaxFreqScale, vUv.x)).r;
                    float scaled_amp = log(1.0 + amp * uAmplitudeLogScale) / uLogOfAmplitudeLogScale;
                    gl_FragColor = vec4(vec3(scaled_amp), 1.0);
                }
            `
        });
        materialRef.current = material;

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);
        planeRef.current = plane;

        const handleResize = () => {
            if (canvasRef.current && rendererRef.current) {
                const width = canvasRef.current.parentElement?.clientWidth || 400;
                canvasRef.current.width = width;
                canvasRef.current.height = 400;
                rendererRef.current.setSize(width, 400);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            texture.dispose();
            material.dispose();
            plane.geometry.dispose();
        };
    }, []);

    // Update loop
    useEffect(() => {
        if (!dataArray || !textureDataRef.current || !textureRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;

        const textureData = textureDataRef.current;
        const rowSize = FREQ_BINS;

        // Shift rows
        textureData.copyWithin(0, rowSize);

        // Fill last row
        const lastRowOffset = (HISTORY_SIZE - 1) * rowSize;
        textureData.set(dataArray, lastRowOffset);

        textureRef.current.needsUpdate = true;
        rendererRef.current.render(sceneRef.current, cameraRef.current);

    }, [dataArray]); // This might be too frequent if dataArray changes every frame.
                     // Ideally, we call an update method from the parent loop.
                     // But for React/Preact, passing the dataArray as a prop is standard.
                     // However, dataArray is a reference to a typed array that is mutated in place by the AudioEngine.
                     // So 'dataArray' prop might not change reference.
                     // We need a trigger.

    // Actually, the parent loop drives the animation.
    // We should expose an update method or use useImperativeHandle.
    // Or simpler: just have a `ref` passed in that we can call `update(data)` on.
    // But let's stick to the prop pattern for now, assuming the parent forces a re-render or we use a ref for the update.

    // Wait, the parent `DemoSim` has a `requestAnimationFrame` loop.
    // It's better if `Spectrogram` exposes an `update()` function.

    return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '400px' }} />;
};

// Refactoring Spectrogram to be imperative for performance
export class SpectrogramController {
    private canvas: HTMLCanvasElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private texture: THREE.DataTexture;
    private textureData: Uint8Array;
    private material: THREE.ShaderMaterial;
    private plane: THREE.Mesh;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.textureData = new Uint8Array(FREQ_BINS * HISTORY_SIZE).fill(0);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.z = 1;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

        this.texture = new THREE.DataTexture(
            this.textureData,
            FREQ_BINS,
            HISTORY_SIZE,
            THREE.RedFormat,
            THREE.UnsignedByteType
        );
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.needsUpdate = true;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: this.texture },
                uMaxFreqScale: { value: MAX_FREQ_SCALE },
                uAmplitudeLogScale: { value: AMPLITUDE_LOG_SCALE },
                uLogOfAmplitudeLogScale: { value: Math.log(1.0 + AMPLITUDE_LOG_SCALE) },
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
                uniform float uAmplitudeLogScale;
                uniform float uLogOfAmplitudeLogScale;
                varying vec2 vUv;
                void main() {
                    float amp = texture2D(uTexture, vec2(vUv.y * uMaxFreqScale, vUv.x)).r;
                    float scaled_amp = log(1.0 + amp * uAmplitudeLogScale) / uLogOfAmplitudeLogScale;
                    gl_FragColor = vec4(vec3(scaled_amp), 1.0);
                }
            `
        });

        this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.plane);
    }

    update(dataArray: Uint8Array) {
        const rowSize = FREQ_BINS;
        this.textureData.copyWithin(0, rowSize);
        const lastRowOffset = (HISTORY_SIZE - 1) * rowSize;
        this.textureData.set(dataArray, lastRowOffset);
        this.texture.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }

    resize(width: number, height: number) {
        this.renderer.setSize(width, height);
        this.canvas.width = width;
        this.canvas.height = height;
    }

    dispose() {
        this.renderer.dispose();
        this.texture.dispose();
        this.material.dispose();
        this.plane.geometry.dispose();
    }
}

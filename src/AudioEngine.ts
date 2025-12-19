// Mostly from an LLM

import { FFT_SIZE } from "./Constants";

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private stream: MediaStream | null = null;
    private dataArray: Uint8Array | null = null;

    async start(): Promise<void> {
        if (this.audioContext) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = FFT_SIZE;
            this.analyser.smoothingTimeConstant = 0.5;

            const source = this.audioContext.createMediaStreamSource(this.stream);
            source.connect(this.analyser);

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            throw err;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
        this.dataArray = null;
    }

    getFrequencyData(): Uint8Array | null {
        if (!this.analyser || !this.dataArray) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    getSampleRate(): number {
        return this.audioContext?.sampleRate || 44100;
    }

    getCurrentTime(): number {
        return this.audioContext?.currentTime || 0;
    }
}

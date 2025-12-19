// Mostly from an LLM

import { NOTE_NAMES } from "./Constants";
import { RecordedNote } from "./Recorder";

function getFrequencyFromNote(note: string): number {
    const match = note.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 0;

    const name = match[1];
    const octave = parseInt(match[2], 10);

    const noteIndex = NOTE_NAMES.indexOf(name);
    if (noteIndex === -1) return 0;

    // MIDI note number
    // C-1 is 0. A4 is 69.
    // C4 is 60.
    // Formula: freq = 440 * 2^((midi - 69) / 12)
    // midi = (octave + 1) * 12 + noteIndex

    const midi = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Player {
    private audioContext: AudioContext | null = null;

    constructor() {}

    private getContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return this.audioContext;
    }

    async play(recording: RecordedNote[]) {
        const ctx = this.getContext();
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        const now = ctx.currentTime;

        recording.forEach(item => {
            const freq = getFrequencyFromNote(item.note);
            if (freq <= 0) return;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            osc.connect(gain);
            gain.connect(ctx.destination);

            const startTime = now + (item.startTime / 1000);
            const duration = item.duration / 1000;

            // Simple envelope
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
            gain.gain.setValueAtTime(0.1, startTime + duration - 0.05);
            gain.gain.linearRampToValueAtTime(0, startTime + duration);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }
}

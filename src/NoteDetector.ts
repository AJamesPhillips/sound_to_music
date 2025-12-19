// Mostly from an LLM

import { FFT_SIZE, MAX_FREQ_SCALE, MIN_NOTE_DURATION, NOTE_NAMES, NOTE_THRESHOLD, NOTES_TO_SHOW } from "./Constants";

export class NoteDetector {
    private activeNotes = new Map<string, number>(); // Note -> StartTime (ms)

    getNoteFromFrequency(frequency: number): string {
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

    detect(dataArray: Uint8Array, sampleRate: number, currentTimeMs: number): Set<string> {
        // Find top frequencies
        const peaks: { freq: number, amp: number }[] = [];
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
            const note = this.getNoteFromFrequency(p.freq);
            if (note) currentNotes.add(note);
        });

        // Debouncing logic
        const confirmedNotes = new Set<string>();

        // Check existing active notes
        for (const [note, startTime] of this.activeNotes.entries()) {
            if (currentNotes.has(note)) {
                // Still active
                if (currentTimeMs - startTime > MIN_NOTE_DURATION) {
                    confirmedNotes.add(note);
                }
            } else {
                // Note stopped
                this.activeNotes.delete(note);
            }
        }

        // Add new notes
        for (const note of currentNotes) {
            if (!this.activeNotes.has(note)) {
                this.activeNotes.set(note, currentTimeMs);
            }
        }

        return confirmedNotes;
    }
}

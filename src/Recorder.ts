export interface RecordedNote {
    note: string;
    startTime: number; // ms from start of recording
    duration: number; // ms
}

export class Recorder {
    private isRecording = false;
    private startTime = 0;
    private recordedNotes: RecordedNote[] = [];
    private activeNotes = new Map<string, number>();
    private maxDuration: number;
    private maxNotes: number;

    constructor(maxDurationMs: number, maxNotes: number) {
        this.maxDuration = maxDurationMs;
        this.maxNotes = maxNotes;
    }

    start() {
        this.isRecording = true;
        this.startTime = Date.now();
        this.recordedNotes = [];
        this.activeNotes.clear();
    }

    stop() {
        if (!this.isRecording) return;
        this.finalizeActiveNotes();
        this.isRecording = false;
    }

    update(currentNotes: Set<string>) {
        if (!this.isRecording) return;

        const now = Date.now();
        if (now - this.startTime >= this.maxDuration) {
            this.stop();
            return;
        }

        // Check for notes that stopped
        for (const [note, start] of this.activeNotes) {
            if (!currentNotes.has(note)) {
                this.recordedNotes.push({
                    note,
                    startTime: start - this.startTime,
                    duration: now - start
                });
                this.activeNotes.delete(note);
            }
        }

        // Check for new notes
        for (const note of currentNotes) {
            if (!this.activeNotes.has(note)) {
                // Check limit
                if (this.activeNotes.size < this.maxNotes) {
                    this.activeNotes.set(note, now);
                }
            }
        }
    }

    getRecording(): RecordedNote[] {
        return [...this.recordedNotes];
    }

    get isRecordingActive() {
        return this.isRecording;
    }

    private finalizeActiveNotes() {
        const now = Date.now();
        for (const [note, start] of this.activeNotes) {
            this.recordedNotes.push({
                note,
                startTime: start - this.startTime,
                duration: now - start
            });
        }
        this.activeNotes.clear();
    }
}

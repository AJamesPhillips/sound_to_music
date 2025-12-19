// Mostly from an LLM

export const FFT_SIZE = 2048;
export const FREQ_BINS = FFT_SIZE / 2;
export const HISTORY_SIZE = 512; // Number of history frames to keep
export const MIN_NOTE_DURATION = 50; // ms
export const NOTE_THRESHOLD = 100; // Amplitude threshold (0-255)
export const NOTES_TO_SHOW = 5;
export const MAX_FREQ_SCALE = 0.3; // 0.5 = Half of Nyquist (e.g. 0-11kHz if 44.1kHz)
export const AMPLITUDE_LOG_SCALE = 10.0;
export const RECORD_DURATION_MS = 30000; // 30 seconds
export const NOTES_TO_RECORD = NOTES_TO_SHOW * 2;

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

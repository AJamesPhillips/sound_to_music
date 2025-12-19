// Mostly from an LLM

import { HISTORY_SIZE, NOTES_TO_SHOW } from "./Constants";

export class NoteVisualizerController {
    private container: HTMLDivElement;
    private scrollContainer: HTMLDivElement;
    private lanes: (string | null)[] = new Array(NOTES_TO_SHOW).fill(null);
    private scrollPos: number = 0;

    constructor(container: HTMLDivElement, scrollContainer: HTMLDivElement) {
        this.container = container;
        this.scrollContainer = scrollContainer;
    }

    update(confirmedNotes: Set<string>) {
        const containerWidth = this.container.clientWidth;
        const stepPixels = containerWidth / HISTORY_SIZE;

        // Update scroll position
        this.scrollPos += stepPixels;
        this.scrollContainer.style.transform = `translateX(-${this.scrollPos}px)`;

        // Clean up old nodes
        if (this.scrollContainer.childElementCount > 200) {
            const firstChild = this.scrollContainer.firstElementChild as HTMLElement;
            if (firstChild) {
                const left = parseFloat(firstChild.style.left || "0");
                if (left < this.scrollPos - 100) {
                    this.scrollContainer.removeChild(firstChild);
                }
            }
        }

        const nextLanes = [...this.lanes];
        const matchedNotes = new Set<string>();

        // 1. Keep existing notes in their lanes
        for (let i = 0; i < NOTES_TO_SHOW; i++) {
            const laneNote = this.lanes[i];
            if (laneNote && confirmedNotes.has(laneNote)) {
                matchedNotes.add(laneNote);
            } else {
                nextLanes[i] = null;
            }
        }

        // 2. Assign new notes to empty lanes
        for (const note of confirmedNotes) {
            if (!matchedNotes.has(note)) {
                const emptyIndex = nextLanes.indexOf(null);
                if (emptyIndex !== -1) {
                    nextLanes[emptyIndex] = note;
                    this.createNoteElement(note, emptyIndex, containerWidth);
                }
            }
        }

        this.lanes = nextLanes;
    }

    private createNoteElement(note: string, laneIndex: number, containerWidth: number) {
        const el = document.createElement('div');
        el.textContent = note;
        el.className = 'note-label';
        el.style.position = 'absolute';
        el.style.left = `${this.scrollPos + containerWidth}px`;
        el.style.top = `${laneIndex * 25}px`;
        el.style.color = 'white';
        el.style.fontFamily = 'monospace';
        el.style.fontSize = '12px';
        el.style.fontWeight = 'bold';
        el.style.whiteSpace = 'nowrap';

        this.scrollContainer.appendChild(el);
    }

    clear() {
        this.scrollContainer.innerHTML = '';
        this.scrollPos = 0;
        this.lanes.fill(null);
        this.scrollContainer.style.transform = `translateX(0px)`;
    }
}

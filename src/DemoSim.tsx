// Mostly from an LLM

import { useEffect, useRef, useState } from "preact/hooks";
import "./DemoSim.css";

import { AudioEngine } from "./AudioEngine";
import { NOTES_TO_RECORD, RECORD_DURATION_MS } from "./Constants";
import { NoteDetector } from "./NoteDetector";
import { NoteVisualizerController } from "./NoteVisualizer";
import { Player } from "./Player";
import { Recorder } from "./Recorder";
import { SpectrogramController } from "./Spectrogram";

export const DemoSim = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvas3DRef = useRef<HTMLCanvasElement>(null);
    const notesContainerRef = useRef<HTMLDivElement>(null);
    const notesScrollRef = useRef<HTMLDivElement>(null);

    const [started, setStarted] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [hasRecording, setHasRecording] = useState(false);

    // Logic Controllers
    const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
    const noteDetectorRef = useRef<NoteDetector>(new NoteDetector());
    const spectrogramRef = useRef<SpectrogramController | null>(null);
    const noteVisualizerRef = useRef<NoteVisualizerController | null>(null);
    const recorderRef = useRef<Recorder>(new Recorder(RECORD_DURATION_MS, NOTES_TO_RECORD));
    const playerRef = useRef<Player>(new Player());

    const startAudio = async () => {
        try {
            await audioEngineRef.current.start();
            setStarted(true);
        } catch (err) {
            alert("Could not access microphone.");
        }
    };

    useEffect(() => {
        if (!started || !canvas3DRef.current || !notesScrollRef.current || !notesContainerRef.current) return;

        // Initialize Visualizers
        spectrogramRef.current = new SpectrogramController(canvas3DRef.current);
        noteVisualizerRef.current = new NoteVisualizerController(notesContainerRef.current, notesScrollRef.current);

        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            const dataArray = audioEngineRef.current.getFrequencyData();
            if (!dataArray) return;

            // Update Spectrogram
            spectrogramRef.current?.update(dataArray);

            // Detect Notes
            const sampleRate = audioEngineRef.current.getSampleRate();
            const currentTime = audioEngineRef.current.getCurrentTime() * 1000;
            const confirmedNotes = noteDetectorRef.current.detect(dataArray, sampleRate, currentTime);

            // Update Note Visualizer
            noteVisualizerRef.current?.update(confirmedNotes);

            // Update Recorder
            if (recorderRef.current.isRecordingActive) {
                recorderRef.current.update(confirmedNotes);
                if (!recorderRef.current.isRecordingActive) {
                    setIsRecording(false);
                    setHasRecording(true);
                }
            }
        };

        animate();

        const handleResize = () => {
            if (containerRef.current && spectrogramRef.current) {
                const width = containerRef.current.clientWidth;
                spectrogramRef.current.resize(width, 400);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
            audioEngineRef.current.stop();
            spectrogramRef.current?.dispose();
        };
    }, [started]);

    const handleStartRecording = () => {
        recorderRef.current.start();
        setIsRecording(true);
        setHasRecording(false);
    };

    const handleStopRecording = () => {
        recorderRef.current.stop();
        setIsRecording(false);
        setHasRecording(true);
    };

    const handlePlayRecording = () => {
        const recording = recorderRef.current.getRecording();
        playerRef.current.play(recording);
    };

    const handleClearRecording = () => {
        setHasRecording(false);
    };

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

            {started && (
                <div className="controls" style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 20,
                    display: 'flex',
                    gap: '10px'
                }}>
                    {!isRecording && !hasRecording && (
                        <button onClick={handleStartRecording} style={{ padding: '5px 10px' }}>
                            Start Recording
                        </button>
                    )}
                    {isRecording && (
                        <button onClick={handleStopRecording} style={{ padding: '5px 10px', background: 'red', color: 'white' }}>
                            Stop Recording
                        </button>
                    )}
                    {hasRecording && (
                        <>
                            <button onClick={handlePlayRecording} style={{ padding: '5px 10px', background: 'green', color: 'white' }}>
                                Play Recording
                            </button>
                            <button onClick={handleClearRecording} style={{ padding: '5px 10px' }}>
                                Clear / Re-record
                            </button>
                        </>
                    )}
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
                    width: '100%',
                    willChange: 'transform'
                }}>
                </div>
            </div>
        </div>
    );
}

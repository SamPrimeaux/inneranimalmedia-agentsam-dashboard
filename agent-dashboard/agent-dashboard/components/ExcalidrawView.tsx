import React from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

export const ExcalidrawView: React.FC = () => {
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                // Reset any inherited styles that clash with Excalidraw's internal layout
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/*
              Excalidraw renders its own full-screen toolbar and canvas.
              We must give it a properly-isolated container with explicit dimensions.
              overflow:hidden prevents the shape list from spilling outside the pane.
            */}
            <div
                style={{
                    flex: 1,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <Excalidraw
                    theme="dark"
                    UIOptions={{
                        canvasActions: {
                            changeViewBackgroundColor: true,
                            export: { saveFileToDisk: true },
                            loadScene: true,
                        },
                    }}
                />
            </div>
        </div>
    );
};

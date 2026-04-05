import React, { useState, useEffect, useCallback } from 'react';

const DEFAULT_URL = 'https://inneranimalmedia.com';

function normalizeNavigate(raw: string): string {
    const next = raw.trim();
    if (!next) return DEFAULT_URL;
    // Blob / data URLs from local HTML preview — do not prefix with https://
    if (/^(blob:|data:)/i.test(next)) return next;
    if (!/^https?:\/\//i.test(next)) return `https://${next}`;
    return next;
}

/** Embedded browser: URL bar + iframe (minimal chrome). */
export const BrowserView: React.FC<{ url?: string; addressDisplay?: string | null }> = ({
    url: urlFromParent,
    addressDisplay = null,
}) => {
    const [iframeUrl, setIframeUrl] = useState(() => normalizeNavigate(urlFromParent || DEFAULT_URL));
    const [inputUrl, setInputUrl] = useState(() => normalizeNavigate(urlFromParent || DEFAULT_URL));

    useEffect(() => {
        if (urlFromParent && urlFromParent.trim()) {
            const n = normalizeNavigate(urlFromParent);
            setIframeUrl(n);
            const label = addressDisplay != null && String(addressDisplay).trim() !== '' ? String(addressDisplay).trim() : '';
            const showLabel = label && /^(blob:|data:)/i.test(n);
            setInputUrl(showLabel ? label : n);
        }
    }, [urlFromParent, addressDisplay]);

    const go = useCallback(() => {
        const raw = inputUrl.trim();
        if (!raw) return;
        if (/^(r2:|github:|local:|preview:)/i.test(raw)) return;
        const n = normalizeNavigate(raw);
        setIframeUrl(n);
        setInputUrl(n);
    }, [inputUrl]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            go();
        }
    };

    return (
        <div className="flex flex-col w-full h-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0 z-20">
                <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="https://"
                    className="flex-1 min-w-0 h-8 px-3 text-[13px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--solar-cyan)] font-mono text-[var(--text-main)]"
                    aria-label="URL"
                />
                <button
                    type="button"
                    onClick={go}
                    className="shrink-0 h-8 px-3 text-[12px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)]"
                >
                    Go
                </button>
            </div>
            <div className="flex-1 w-full relative bg-[var(--bg-app)] min-h-0">
                <iframe
                    key={iframeUrl}
                    src={iframeUrl}
                    className="w-full h-full border-0 absolute inset-0 bg-white"
                    title="Embedded browser"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
            </div>
        </div>
    );
};

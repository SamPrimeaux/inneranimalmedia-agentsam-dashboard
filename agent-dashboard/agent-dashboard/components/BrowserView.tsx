import React, { useState } from 'react';
import { RotateCcw, ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';

export const BrowserView: React.FC<{ initialUrl?: string }> = ({ initialUrl = 'https://inneranimalmedia.com' }) => {
    const [url, setUrl] = useState(initialUrl);
    const [inputUrl, setInputUrl] = useState(initialUrl);

    const handleNavigate = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            let next = inputUrl.trim();
            if (!next.startsWith('http')) next = 'https://' + next;
            setUrl(next);
        }
    };

    return (
        <div className="flex flex-col w-full h-full bg-[#0a0a0f] text-[var(--text-main)] overflow-hidden">
            <div className="flex items-center gap-2 p-2 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0 shadow-lg z-20">
                <button className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-white transition-all" title="Back"><ArrowLeft size={16} /></button>
                <button className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-white transition-all" title="Forward"><ArrowRight size={16} /></button>
                <button className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-white transition-all" title="Reload" onClick={() => setUrl(url)}><RotateCcw size={16} /></button>
                
                <div className="flex-1 relative flex items-center">
                    <input 
                        type="text"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        onKeyDown={handleNavigate}
                        className="w-full h-8 px-4 bg-[#0B2129] text-[13px] rounded-lg border border-[#163742] focus:outline-none focus:border-[var(--solar-cyan)] transition-all font-mono text-[var(--text-main)] shadow-inner"
                    />
                </div>
                
                <a href={url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--solar-cyan)] transition-all cursor-pointer opacity-80 hover:opacity-100" title="Popout"><ExternalLink size={16} /></a>
            </div>
            <div className="flex-1 w-full relative bg-white">
                <iframe 
                    src={url} 
                    className="w-full h-full border-0 absolute inset-0" 
                    title="Live Web Preview" 
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms" 
                />
            </div>
        </div>
    );
};

import React from 'react';
import { PenLine, Box, Triangle, ExternalLink, Wand2, Layers } from 'lucide-react';

interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  url: string;
  color: string;
  glowColor: string;
}

interface ToolLauncherBarProps {
  onNavigate: (url: string) => void;
}

export const ToolLauncherBar: React.FC<ToolLauncherBarProps> = ({ onNavigate }) => {
  const tools: Tool[] = [
    {
      id: 'excalidraw',
      icon: <PenLine size={18} />,
      label: 'Excalidraw',
      sublabel: 'Whiteboard & Diagrams',
      url: 'https://excalidraw.com',
      color: 'text-[#a78bfa]',
      glowColor: 'hover:border-[#a78bfa]/50 hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]',
    },
    {
      id: 'meshy',
      icon: <Box size={18} />,
      label: 'Meshy AI',
      sublabel: '3D Model Generator',
      url: 'https://app.meshy.ai',
      color: 'text-[var(--solar-cyan)]',
      glowColor: 'hover:border-[var(--solar-cyan)]/50 hover:shadow-[0_0_20px_rgba(42,161,152,0.15)]',
    },
    {
      id: 'blender',
      icon: <Triangle size={18} />,
      label: 'Blender',
      sublabel: '3D Creation Suite',
      url: 'https://www.blender.org/download',
      color: 'text-[#fb923c]',
      glowColor: 'hover:border-[#fb923c]/50 hover:shadow-[0_0_20px_rgba(251,146,60,0.15)]',
    },
    {
      id: 'spline',
      icon: <Wand2 size={18} />,
      label: 'Spline',
      sublabel: '3D Design Tool',
      url: 'https://app.spline.design',
      color: 'text-[var(--solar-blue)]',
      glowColor: 'hover:border-[var(--solar-blue)]/50 hover:shadow-[0_0_20px_rgba(38,139,210,0.15)]',
    },
    {
      id: 'tldraw',
      icon: <Layers size={18} />,
      label: 'tldraw',
      sublabel: 'Infinite Canvas',
      url: 'https://tldraw.com',
      color: 'text-[var(--solar-green)]',
      glowColor: 'hover:border-[var(--solar-green)]/50 hover:shadow-[0_0_20px_rgba(133,153,0,0.15)]',
    },
  ];

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto px-6 pb-6">
      <div className="max-w-3xl mx-auto">
        {/* Section Label */}
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="h-px flex-1 bg-[var(--border-subtle)]/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">Creative Tools</span>
          <div className="h-px flex-1 bg-[var(--border-subtle)]/40" />
        </div>

        {/* Tool Pills */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide justify-center flex-wrap">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onNavigate(tool.url)}
              className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)]/50 bg-[var(--bg-app)]/80 backdrop-blur-md transition-all duration-200 shrink-0 ${tool.glowColor}`}
            >
              {/* Icon */}
              <div className={`transition-transform group-hover:-translate-y-0.5 duration-200 ${tool.color}`}>
                {tool.icon}
              </div>

              {/* Labels */}
              <div className="text-left">
                <div className={`text-[12px] font-bold tracking-tight leading-none mb-0.5 transition-colors ${tool.color}`}>
                  {tool.label}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-medium leading-none">
                  {tool.sublabel}
                </div>
              </div>

              {/* External link indicator */}
              <ExternalLink
                size={11}
                className="text-[var(--text-muted)] opacity-0 group-hover:opacity-70 transition-opacity ml-1"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

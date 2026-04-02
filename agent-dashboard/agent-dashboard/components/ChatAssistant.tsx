
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  User,
  Bot,
  Loader2,
  ChevronRight,
  Paperclip,
  Image as ImageIconLucide,
  AtSign,
  Slash,
  FileText,
  FileCode,
  X,
  ChevronDown,
} from 'lucide-react';
import { ProjectType } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatAssistantProps {
  activeProject: ProjectType;
  activeFileContent?: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFileSelect?: (file: { name: string; content: string }) => void;
  onRunInTerminal?: (cmd: string) => void;
  activeFileName?: string;
}

type StagedAttachment = {
  id: string;
  file: File;
  type: 'image' | 'file';
  previewUrl: string | null;
};

type PickerItem = { id: string; label: string; kind: string };
type SlashCmd = { slug: string; description: string | null };

const LS_CONV = 'iam-agent-chat-conversation-id';

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function measureAboveAnchor(el: HTMLElement | null, minW: number): React.CSSProperties | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const gap = 8;
  return {
    position: 'fixed',
    left: r.left,
    bottom: window.innerHeight - r.top + gap,
    zIndex: 9999,
    maxHeight: Math.min(280, Math.max(100, r.top - gap - 8)),
    minWidth: minW,
  };
}

const getLangMeta = (lang: string) => {
  const map: Record<string, { ext: string; icon: React.ReactNode }> = {
    tsx: { ext: 'tsx', icon: <FileCode size={15} /> },
    jsx: { ext: 'jsx', icon: <FileCode size={15} /> },
    ts: { ext: 'ts', icon: <FileCode size={15} /> },
    js: { ext: 'js', icon: <FileCode size={15} /> },
    css: { ext: 'css', icon: <FileText size={15} /> },
    html: { ext: 'html', icon: <FileText size={15} /> },
    json: { ext: 'json', icon: <FileText size={15} /> },
    py: { ext: 'py', icon: <FileText size={15} /> },
    sh: { ext: 'sh', icon: <FileText size={15} /> },
  };
  return map[lang] ?? { ext: lang || 'txt', icon: <FileText size={15} /> };
};

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  activeProject,
  activeFileContent,
  activeFileName,
  messages,
  setMessages,
  onFileSelect,
  onRunInTerminal,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuStyle, setAttachMenuStyle] = useState<React.CSSProperties | null>(null);
  const [modeMenuStyle, setModeMenuStyle] = useState<React.CSSProperties | null>(null);

  const [modes, setModes] = useState<{ slug: string; label: string }[]>([]);
  const [mode, setMode] = useState<string>('agent');
  const [isModeOpen, setIsModeOpen] = useState(false);

  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [conversationId, setConversationId] = useState<string>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(LS_CONV) || '' : ''
  );

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState<PickerItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStyle, setMentionStyle] = useState<React.CSSProperties | null>(null);
  const mentionQueryRef = useRef<{ start: number; end: number } | null>(null);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashItems, setSlashItems] = useState<SlashCmd[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashStyle, setSlashStyle] = useState<React.CSSProperties | null>(null);
  const slashQueryRef = useRef<{ start: number; end: number } | null>(null);

  const catalogCacheRef = useRef<{ at: number; items: PickerItem[] } | null>(null);
  const commandsCacheRef = useRef<{ at: number; items: SlashCmd[] } | null>(null);

  const measureAttachMenu = useCallback(() => {
    setAttachMenuStyle(measureAboveAnchor(attachButtonRef.current, 200));
  }, []);

  const measureModeMenu = useCallback(() => {
    setModeMenuStyle(measureAboveAnchor(modeButtonRef.current, 120));
  }, []);

  useLayoutEffect(() => {
    if (!attachMenuOpen) {
      setAttachMenuStyle(null);
      return;
    }
    measureAttachMenu();
    const h = () => measureAttachMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [attachMenuOpen, measureAttachMenu]);

  useLayoutEffect(() => {
    if (!isModeOpen) {
      setModeMenuStyle(null);
      return;
    }
    measureModeMenu();
    const h = () => measureModeMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [isModeOpen, measureModeMenu]);

  useLayoutEffect(() => {
    if (!mentionOpen && !slashOpen) return;
    const st = measureAboveAnchor(textareaRef.current, 220);
    if (mentionOpen) setMentionStyle(st);
    if (slashOpen) setSlashStyle(st);
    const h = () => {
      const s = measureAboveAnchor(textareaRef.current, 220);
      if (mentionOpen) setMentionStyle(s);
      if (slashOpen) setSlashStyle(s);
    };
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [mentionOpen, slashOpen, input]);

  useEffect(() => {
    fetch('/api/agent/modes')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setModes(data.map((row: { slug: string; label: string }) => ({ slug: row.slug, label: row.label })));
          const preferred = data.find((row: { slug: string }) => row.slug === 'agent' || row.slug === 'auto');
          setMode(preferred ? preferred.slug : data[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  const modeLabel = modes.find((m) => m.slug === mode)?.label ?? mode;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('iam-chat-mode', { detail: { label: modeLabel, slug: mode } }));
  }, [modeLabel, mode]);

  async function loadCatalog(): Promise<PickerItem[]> {
    const now = Date.now();
    if (catalogCacheRef.current && now - catalogCacheRef.current.at < 60000) {
      return catalogCacheRef.current.items;
    }
    const res = await fetch('/api/agent/context-picker/catalog');
    if (!res.ok) return [];
    const data = await res.json();
    const items: PickerItem[] = [];
    (data.tables || []).forEach((t: string) => {
      items.push({ id: `table:${t}`, label: t, kind: 'table' });
    });
    (data.workflows || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `wf:${w.id}`, label: w.name || w.id || '', kind: 'workflow' });
    });
    (data.commands || []).forEach((c: { slug?: string; name?: string }) => {
      items.push({ id: `cmd:${c.slug}`, label: c.name || c.slug || '', kind: 'command' });
    });
    (data.memory_keys || []).forEach((k: string) => {
      items.push({ id: `mem:${k}`, label: k, kind: 'memory' });
    });
    (data.workspaces || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `ws:${w.id}`, label: w.name || w.id || '', kind: 'workspace' });
    });
    catalogCacheRef.current = { at: now, items };
    return items;
  }

  async function loadCommands(): Promise<SlashCmd[]> {
    const now = Date.now();
    if (commandsCacheRef.current && now - commandsCacheRef.current.at < 60000) {
      return commandsCacheRef.current.items;
    }
    const res = await fetch('/api/agent/commands');
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const items = arr.map((r: { slug: string; description?: string }) => ({
      slug: r.slug,
      description: r.description ?? null,
    }));
    commandsCacheRef.current = { at: now, items };
    return items;
  }

  const syncPickers = useCallback(
    async (value: string, cursor: number) => {
      const before = value.slice(0, cursor);
      const atMatch = before.match(/@([^\s@]*)$/);
      if (atMatch) {
        const q = atMatch[1];
        const start = cursor - atMatch[0].length;
        mentionQueryRef.current = { start, end: cursor };
        const all = await loadCatalog();
        const f = all.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
        setMentionItems(f);
        setMentionIndex(0);
        setMentionOpen(f.length > 0);
        setSlashOpen(false);
        return;
      }
      setMentionOpen(false);
      mentionQueryRef.current = null;

      const slashMatch = before.match(/(?:^|\s)(\/[\w-]*)$/);
      if (slashMatch) {
        const full = slashMatch[1];
        const q = full.slice(1);
        const start = cursor - full.length;
        slashQueryRef.current = { start, end: cursor };
        const all = await loadCommands();
        const f = all
          .filter((c) => c.slug.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 40);
        setSlashItems(f);
        setSlashIndex(0);
        setSlashOpen(f.length > 0);
        return;
      }
      setSlashOpen(false);
      slashQueryRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    syncPickers(v, el.selectionStart);
  };

  const addFilesFromList = (list: FileList | null, asImage: boolean) => {
    if (!list?.length) return;
    Array.from(list).forEach((file) => {
      const id = crypto.randomUUID();
      const isImg = asImage || file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : null;
      setAttachments((prev) => [
        ...prev,
        { id, file, type: isImg ? 'image' : 'file', previewUrl },
      ]);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const clearAttachments = () => {
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const insertAtCursor = (newValue: string, selStart: number, selEnd: number) => {
    setInput(newValue);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      }
    });
  };

  const applyMention = (item: PickerItem) => {
    const el = textareaRef.current;
    const q = mentionQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `@${item.label} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setMentionOpen(false);
    mentionQueryRef.current = null;
    insertAtCursor(next, pos, pos);
  };

  const applySlash = (cmd: SlashCmd) => {
    const el = textareaRef.current;
    const q = slashQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `/${cmd.slug} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setSlashOpen(false);
    slashQueryRef.current = null;
    insertAtCursor(next, pos, pos);
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isLoading) return;

    const userMessage = text || '(attachment)';
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setMentionOpen(false);
    setSlashOpen(false);

    const form = new FormData();
    form.append('message', userMessage);
    form.append('mode', mode);
    form.append('conversationId', conversationId || '');
    form.append('model_id', 'auto');
    form.append(
      'messages_json',
      JSON.stringify(newMessages.map((m) => ({ role: m.role, content: m.content })))
    );
    form.append('contextMode', String(activeProject));
    if (activeFileContent != null) form.append('contextCode', activeFileContent);
    if (activeFileName) form.append('contextFile', activeFileName);
    attachments.forEach((a) => form.append('files', a.file));

    try {
      const response = await fetch('/api/agent/chat', { method: 'POST', body: form });

      if (!response.ok) throw new Error('Network response was not ok');
      if (!response.body) throw new Error('No body in response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const cid =
                data.conversation_id != null && typeof data.conversation_id === 'string'
                  ? data.conversation_id
                  : null;
              if (cid) {
                setConversationId(cid);
                localStorage.setItem(LS_CONV, cid);
              }
              if (data.text) {
                assistantContent += data.text;
                setMessages((prev) => {
                  const last = [...prev];
                  last[last.length - 1].content = assistantContent;
                  return last;
                });
              }
            } catch {
              /* ignore */
            }
          }
        }
      }

      const codeBlockRegex2 = /```(\w+)?\n([\s\S]*?)\n```/g;
      let firstMatch = codeBlockRegex2.exec(assistantContent);
      if (firstMatch) {
        const lang = firstMatch[1] || 'txt';
        const code = firstMatch[2];
        const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
        if (!isShell && (code.split('\n').length > 5 || code.length > 200) && onFileSelect) {
          const { ext } = getLangMeta(lang);
          onFileSelect({ name: `agent_output.${ext}`, content: code });
        }
      }
    } catch (error) {
      console.error('Chat proxy failed:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection error to Studio Proxy. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
      clearAttachments();
    }
  };

  const renderMessageContent = (content: string, msgIndex: number) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let codeCount = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const text = content.substring(lastIndex, match.index);
        parts.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap">{text}</span>);
      }

      const lang = match[1] || 'text';
      const code = match[2];
      const { ext, icon } = getLangMeta(lang);
      const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
      codeCount++;

      if (code.split('\n').length > 5 || code.length > 200) {
        if (isShell) {
          parts.push(
            <div
              key={`code-${match.index}`}
              className="my-3 p-3 bg-[#060e14] border border-[#1e3e4a] rounded-xl group hover:border-[var(--solar-green)]/50 transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-[#0a2d38] border border-[#1e3e4a] rounded-lg flex items-center justify-center text-[var(--solar-green)]">
                  <span className="text-[11px] font-bold font-mono">$_</span>
                </div>
                <div>
                  <span className="text-[12px] font-bold text-[var(--text-heading)] tracking-tight">Shell Script</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-2">
                    {code.split('\n').length} lines · {lang}
                  </span>
                </div>
              </div>
              <pre className="text-[11px] font-mono text-[var(--solar-green)] bg-[#030a0d] rounded-lg p-3 overflow-x-auto whitespace-pre border border-[#1e3e4a]">
                {code}
              </pre>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onRunInTerminal?.(code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--solar-green)]/10 hover:bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/30 text-[var(--solar-green)] rounded-lg text-[11px] font-bold transition-colors"
                >
                  <span className="font-mono">$</span> Run in Terminal
                </button>
                <button
                  type="button"
                  onClick={() => onFileSelect?.({ name: `script_${msgIndex}_${codeCount}.${ext}`, content: code })}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40 text-[var(--text-muted)] hover:text-[var(--solar-cyan)] rounded-lg text-[11px] transition-colors"
                >
                  Open in Monaco
                </button>
              </div>
            </div>
          );
        } else {
          parts.push(
            <div
              key={`code-${match.index}`}
              className="my-3 p-3 bg-[#060e14] border border-[#1e3e4a] rounded-xl flex items-center justify-between group hover:border-[var(--solar-cyan)] transition-all cursor-pointer shadow-inner"
              onClick={() => onFileSelect?.({ name: `agent_output_${msgIndex}_${codeCount}.${ext}`, content: code })}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#0a2d38] border border-[#1e3e4a] rounded-lg flex items-center justify-center text-[var(--solar-cyan)]">
                  {icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] font-bold text-[var(--text-heading)] tracking-tight">agent_output.{ext}</span>
                  <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {code.split('\n').length} lines · {lang}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--solar-cyan)] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-wider">
                  Open in Monaco
                </span>
                <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors" />
              </div>
            </div>
          );
        }
      } else {
        parts.push(
          <pre
            key={`code-${match.index}`}
            className="my-2 p-3 bg-[#060e14] rounded-lg border border-[#1e3e4a] overflow-x-auto text-[12px] font-mono whitespace-pre text-[var(--solar-cyan)]"
          >
            <code>{code}</code>
          </pre>
        );
      }

      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(<span key="text-end" className="whitespace-pre-wrap">{content.substring(lastIndex)}</span>);
    }

    return parts.length > 0 ? <>{parts}</> : <span className="whitespace-pre-wrap">{content}</span>;
  };

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (slashOpen && slashItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applySlash(slashItems[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-[var(--bg-panel)] w-full overflow-hidden min-h-0">
        <style>{`
        .agent-content strong { color: var(--solar-cyan); font-weight: 700; }
        .agent-content h1, .agent-content h2, .agent-content h3 { color: var(--text-heading); font-weight: 700; margin-bottom: 0.75rem; }
        .agent-content ul, .agent-content ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .agent-content li { margin-bottom: 0.4rem; }
        .agent-content p + p { margin-top: 0.75rem; }
        .chat-hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pt-6 pb-4 space-y-6 w-full chat-hide-scroll"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse max-w-[85%]' : 'max-w-full w-full'}`}>
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-1 ${
                    msg.role === 'user'
                      ? 'bg-[#1e3e4a]'
                      : 'bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User size={11} className="text-[var(--text-muted)]" />
                  ) : (
                    <Bot size={11} className="text-[var(--solar-cyan)]" />
                  )}
                </div>
                <div
                  className={`agent-content text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#060e14] border border-[#1e3e4a] px-4 py-3 rounded-2xl rounded-tr-sm text-[var(--text-main)]'
                      : 'text-[var(--text-main)] w-full'
                  }`}
                >
                  {renderMessageContent(msg.content, i)}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30 flex items-center justify-center">
                  <Loader2 size={11} className="text-[var(--solar-cyan)] animate-spin" />
                </div>
                <div className="px-4 py-3 bg-[#060e14] border border-[#1e3e4a] rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.15s]" />
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 w-full p-3 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] space-y-2">
          {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 chat-hide-scroll">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative flex-shrink-0 flex items-center gap-2 bg-[#060e14] border border-[#1e3e4a] rounded-lg pl-1 pr-7 py-1"
                >
                  {a.type === 'image' && a.previewUrl ? (
                    <img
                      src={a.previewUrl}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover"
                      style={{ width: 48, height: 48, borderRadius: 6 }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-[#0a2d38] flex items-center justify-center border border-[#1e3e4a]">
                      <FileText size={18} className="text-[var(--text-muted)]" />
                    </div>
                  )}
                  {a.type === 'file' && (
                    <div className="min-w-0 max-w-[140px]">
                      <div className="text-[10px] font-mono text-[var(--text-main)] truncate">
                        {a.file.name.length > 24 ? `${a.file.name.slice(0, 21)}...` : a.file.name}
                      </div>
                      <div className="text-[9px] text-[var(--text-muted)]">{formatFileSize(a.file.size)}</div>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    className="absolute top-0.5 right-0.5 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-red)] hover:bg-white/5"
                    onClick={() => removeAttachment(a.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, true);
              e.target.value = '';
            }}
          />

          <div className="flex flex-col bg-[#060e14] border border-[#1e3e4a] focus-within:border-[var(--solar-cyan)]/60 rounded-xl transition-all shadow-inner overflow-visible">
            <div className="flex items-end gap-1.5 px-2 pt-2 pb-2">
              <button
                type="button"
                ref={attachButtonRef}
                className="flex-shrink-0 p-2 text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-white/5 rounded-lg transition-all"
                title="Attach"
                onClick={() => {
                  setAttachMenuOpen((o) => !o);
                  setIsModeOpen(false);
                }}
              >
                <Paperclip size={16} strokeWidth={2} />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                onSelect={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                onClick={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                placeholder="Message Agent Sam..."
                rows={1}
                className="flex-1 min-w-0 bg-transparent px-1 py-2 text-[13px] focus:outline-none text-[var(--text-main)] placeholder:text-[#2e5464] resize-none font-sans leading-relaxed rounded-lg"
                style={{ minHeight: '44px', maxHeight: '200px' }}
              />
              <button
                type="button"
                ref={modeButtonRef}
                onClick={() => {
                  setIsModeOpen((o) => !o);
                  setAttachMenuOpen(false);
                }}
                className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1.5 text-[9px] font-mono font-bold tracking-tight text-[var(--solar-cyan)] hover:brightness-110 transition-all uppercase border border-[#1e3e4a] rounded-lg"
              >
                {modeLabel} <ChevronDown size={8} />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  canSend
                    ? 'bg-[var(--solar-cyan)] text-[#00212b] shadow-[0_0_16px_rgba(45,212,191,0.25)] hover:brightness-110'
                    : 'text-[#2a4d58] bg-[#0a1c22] cursor-not-allowed'
                }`}
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        attachMenuOpen &&
        attachMenuStyle &&
        createPortal(
          <div
            className="bg-[#060e14] border border-[#1e3e4a] rounded-xl shadow-2xl flex flex-col text-[11px] overflow-y-auto py-1 min-w-[200px]"
            style={attachMenuStyle}
            role="menu"
          >
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#0a2d38] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <Paperclip size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#0a2d38] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                imageInputRef.current?.click();
              }}
            >
              <ImageIconLucide size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Upload Image</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#0a2d38] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '@' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <AtSign size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Mention</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#0a2d38] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '/' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <Slash size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Command</span>
            </button>
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        isModeOpen &&
        modeMenuStyle &&
        createPortal(
          <div
            className="bg-[#060e14] border border-[#1e3e4a] rounded-xl shadow-2xl p-1 flex flex-col text-[11px] overflow-y-auto"
            style={modeMenuStyle}
          >
            {modes.map((m) => (
              <button
                key={m.slug}
                type="button"
                className={`px-3 py-1.5 text-left hover:bg-[#0a2d38] cursor-pointer rounded-lg transition-colors ${
                  mode === m.slug ? 'text-[var(--solar-cyan)] bg-[#0a2d38]' : 'text-[var(--text-muted)]'
                }`}
                onClick={() => {
                  setMode(m.slug);
                  setIsModeOpen(false);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        mentionOpen &&
        mentionStyle &&
        mentionItems.length > 0 &&
        createPortal(
          <div
            className="bg-[#060e14] border border-[#1e3e4a] rounded-xl shadow-2xl flex flex-col text-[11px] overflow-y-auto p-1"
            style={mentionStyle}
          >
            {mentionItems.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg truncate ${
                  i === mentionIndex ? 'bg-[#0a2d38] text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[#0a2d38]'
                }`}
                onMouseEnter={() => setMentionIndex(i)}
                onClick={() => applyMention(it)}
              >
                <span className="text-[9px] uppercase text-[var(--text-muted)] mr-2">{it.kind}</span>
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        slashOpen &&
        slashStyle &&
        slashItems.length > 0 &&
        createPortal(
          <div
            className="bg-[#060e14] border border-[#1e3e4a] rounded-xl shadow-2xl flex flex-col text-[11px] overflow-y-auto p-1 max-w-[320px]"
            style={slashStyle}
          >
            {slashItems.map((c, i) => (
              <button
                key={c.slug}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg ${
                  i === slashIndex ? 'bg-[#0a2d38] text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[#0a2d38]'
                }`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => applySlash(c)}
              >
                <div className="font-mono font-bold">/{c.slug}</div>
                {c.description && (
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{c.description}</div>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

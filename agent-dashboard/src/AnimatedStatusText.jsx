import { useState, useEffect, useRef } from "react";

const TYPING_MIN_MS = 30;
const TYPING_MAX_MS = 50;
const DISPLAY_DURATION_MS = 2000;
const FADE_MS = 500;

export default function AnimatedStatusText({ state, config, context }) {
  const [displayText, setDisplayText] = useState("");
  const [messageIndex, setMessageIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const typingTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  const messages = config?.messages ?? [];
  const currentMessage = messages[messageIndex % (messages.length || 1)] ?? "";
  const resolvedMessage = typeof currentMessage === "string"
    ? currentMessage
        .replace(/\{tool\}/g, context?.tool ?? "")
        .replace(/\{file\}/g, context?.file ?? "")
        .replace(/\{current\}/g, String(context?.current ?? ""))
        .replace(/\{total\}/g, String(context?.total ?? ""))
        .replace(/\{position\}/g, String(context?.position ?? ""))
    : "";

  // Typing: one character every 30-50ms until current message is fully shown
  useEffect(() => {
    if (!config || !resolvedMessage.length) {
      setDisplayText("");
      setCharIndex(0);
      return;
    }
    if (charIndex >= resolvedMessage.length) {
      return;
    }
    const delay = TYPING_MIN_MS + Math.random() * (TYPING_MAX_MS - TYPING_MIN_MS);
    typingTimerRef.current = setTimeout(() => {
      setDisplayText(resolvedMessage.slice(0, charIndex + 1));
      setCharIndex((i) => i + 1);
    }, delay);
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [config, resolvedMessage, charIndex]);

  // Fade cycle: after message fully typed, show 2s then fade out 500ms, next message, fade in
  useEffect(() => {
    if (!config || messages.length === 0) return;
    if (charIndex < resolvedMessage.length) return;

    const displayTimer = setTimeout(() => {
      setVisible(false);
      fadeTimerRef.current = setTimeout(() => {
        setMessageIndex((i) => (i + 1) % messages.length);
        setCharIndex(0);
        setDisplayText("");
        setVisible(true);
      }, FADE_MS);
    }, DISPLAY_DURATION_MS);

    return () => {
      clearTimeout(displayTimer);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [config, messages.length, resolvedMessage.length, charIndex]);

  // Reset message index when state or config changes
  useEffect(() => {
    setMessageIndex(0);
    setCharIndex(0);
    setDisplayText("");
    setVisible(true);
  }, [state, config?.label]);

  if (!config || state === "IDLE") return null;

  return (
    <div
      className="agent-status-text"
      style={{
        color: config.color ?? "var(--color-text)",
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <span className="status-label">{config.label}</span>
      <span className="status-message">{displayText}</span>
      <span className="status-cursor">_</span>
    </div>
  );
}

/**
 * Single source of truth for the IAM Explorer / AITestSuite shell.
 * Bump this (and package.json version) on every deploy you want reflected in D1 CIDI logs.
 */
export const SHELL_VERSION = import.meta.env.VITE_SHELL_VERSION ?? 'v6';

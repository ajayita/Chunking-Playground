/**
 * Ninth is CSS-first: every component is markup plus `n-` classes (see each component's README).
 * This script adds the few behaviours CSS cannot do. It assigns `window.Ninth`.
 */
declare global {
  interface Window { Ninth: NinthAPI; }
}

export type NinthTheme = "auto" | "light" | "dark";
export type NinthAccent = "blue" | "teal" | "green" | "amber" | "orange" | "violet";
export type NinthStatus = "experiment" | "proof-of-concept" | "in-development" | "stable" | "archived";

export interface NinthAPI {
  /** Library version. */
  version: string;
  /**
   * Wire behaviours inside `root` (default `document`): copy buttons in `.n-code`,
   * `[data-n-theme-toggle]` buttons, `.n-tabs`, and `.n-range[data-n-output]`.
   * Runs once on DOMContentLoaded; call it again after rendering new markup (React effects, client-side routes).
   * Elements already wired are skipped.
   */
  init(root?: ParentNode): void;
  /** Set the theme. "auto" removes data-theme so the page follows the operating system. Stored in localStorage when available. */
  setTheme(theme: NinthTheme): NinthTheme;
  /** The current theme as set on <html>. */
  getTheme(): NinthTheme;
}

export {};

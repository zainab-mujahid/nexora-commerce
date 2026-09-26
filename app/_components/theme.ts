// Shared by the root layout's pre-paint script (server) and <ThemeToggle>
// (client), so both always read and write the same key and attribute.
// Deliberately not a "use client" module: the layout needs the real string
// values, not client references.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "nexora-theme";

// Runs synchronously in <head> while the HTML is parsed, before first paint:
// the stored choice wins, otherwise the OS preference. try/catch covers
// browsers where localStorage throws (blocked storage, some private modes).
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

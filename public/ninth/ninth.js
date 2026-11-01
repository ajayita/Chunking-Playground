/* Ninth — behaviours for project sites. No dependencies. Classic script: assigns window.Ninth.
   Handles: copy buttons on code blocks, the light/dark/auto theme toggle, tabs, and range value readouts.
   Everything is optional: a page that never loads this file still works, minus these behaviours. */
(function () {
  "use strict";
  var KEY = "ninth-theme";
  var VERSION = "0.1.0";

  function readStored() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function writeStored(v) {
    try { if (v === "light" || v === "dark") { window.localStorage.setItem(KEY, v); } else { window.localStorage.removeItem(KEY); } } catch (e) { /* storage unavailable: keep the choice for this page view only */ }
  }

  /* Theme: "auto" follows the operating system; "light" and "dark" are fixed. */
  function getTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    return t === "light" || t === "dark" ? t : "auto";
  }
  function setTheme(v) {
    var root = document.documentElement;
    if (v === "light" || v === "dark") { root.setAttribute("data-theme", v); } else { root.removeAttribute("data-theme"); v = "auto"; }
    writeStored(v);
    var buttons = document.querySelectorAll("[data-n-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) { labelToggle(buttons[i]); }
    return v;
  }
  function labelToggle(btn) {
    var names = { auto: "Auto", light: "Light", dark: "Dark" };
    btn.textContent = "Theme: " + names[getTheme()];
    btn.setAttribute("aria-label", "Colour theme: " + names[getTheme()] + ". Change theme");
  }
  function initThemeToggle(btn) {
    labelToggle(btn);
    btn.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      setTheme(order[(order.indexOf(getTheme()) + 1) % order.length]);
    });
  }

  /* Copy: every .n-code with a .n-copy button copies the text of its <pre>. */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(text); }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  function initCopy(block) {
    var btn = block.querySelector(".n-copy");
    var pre = block.querySelector("pre");
    if (!btn || !pre) { return; }
    var label = btn.textContent || "Copy";
    btn.setAttribute("aria-live", "polite");
    btn.addEventListener("click", function () {
      copyText(pre.innerText.replace(/\n$/, "")).then(function () {
        btn.textContent = "Copied";
      }, function () {
        btn.textContent = "Copy failed";
      }).then(function () {
        window.setTimeout(function () { btn.textContent = label; }, 2000);
      });
    });
  }

  /* Tabs: role="tablist" inside .n-tabs; each tab's aria-controls names its panel. */
  function initTabs(wrap) {
    var tabs = Array.prototype.slice.call(wrap.querySelectorAll('[role="tab"]'));
    if (!tabs.length) { return; }
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) { panel.hidden = !on; }
      });
      if (focus) { tab.focus(); }
    }
    var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
    select(current, false);
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t, false); });
      t.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") { next = tabs[(i + 1) % tabs.length]; }
        else if (e.key === "ArrowLeft") { next = tabs[(i - 1 + tabs.length) % tabs.length]; }
        else if (e.key === "Home") { next = tabs[0]; }
        else if (e.key === "End") { next = tabs[tabs.length - 1]; }
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
  }

  /* Range readouts: <input class="n-range" data-n-output="id"> keeps <output id="id"> in step. */
  function initRange(input) {
    var out = document.getElementById(input.getAttribute("data-n-output"));
    if (!out) { return; }
    var unit = out.getAttribute("data-unit") || "";
    function sync() { out.textContent = input.value + unit; }
    input.addEventListener("input", sync);
    sync();
  }

  function each(root, sel, fn) {
    var list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.hasAttribute("data-n-ready")) { continue; }
      el.setAttribute("data-n-ready", "");
      fn(el);
    }
  }

  /* init(root): wire every Ninth behaviour inside root (default: the document). Safe to call again after rendering new content. */
  function init(root) {
    root = root || document;
    each(root, "[data-n-theme-toggle]", initThemeToggle);
    each(root, ".n-code", initCopy);
    each(root, ".n-tabs", initTabs);
    each(root, ".n-range[data-n-output]", initRange);
  }

  /* Apply a stored theme choice as early as possible (load this script in <head> to avoid a flash). */
  var stored = readStored();
  if (stored === "light" || stored === "dark") { document.documentElement.setAttribute("data-theme", stored); }

  window.Ninth = { version: VERSION, init: init, setTheme: setTheme, getTheme: getTheme };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(document); });
  } else {
    init(document);
  }
})();

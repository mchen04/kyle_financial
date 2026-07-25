// Installed with `agent-browser open --init-script` so it runs at document
// start, before any application script. It records the three signals that
// cannot be reconstructed after the fact: layout shifts, the headline string at
// the moment it first exists, and console errors.
(() => {
  const state = {
    mark: 0,
    markTime: 0,
    shifts: [],
    headlines: [],
    consoleErrors: [],
    observerError: null,
    inflight: 0,
  };
  window.__density = state;

  // The measurement window is "network idle plus one second". In a single-route
  // client app the interesting requests are the app's own fetches, so count
  // them rather than relying on document load alone.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    state.inflight += 1;
    return nativeFetch(...args).finally(() => {
      state.inflight -= 1;
    });
  };

  // Arrays are never cleared. Every reader filters by `markTime` instead, so a
  // PerformanceObserver callback that lands after a reset but describes a shift
  // from before it cannot be attributed to the next surface.
  state.reset = () => {
    state.mark += 1;
    state.markTime = performance.now();
    return state.markTime;
  };

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        state.shifts.push({ value: entry.value, startTime: entry.startTime });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {
    state.observerError = String(error);
  }

  const clean = (node) =>
    node ? node.textContent.replace(/\s+/g, " ").trim() : "";

  // Several surfaces put the primary answer in a hero card rather than the
  // heading, so the signature has to carry both. Every selector below is
  // structural or ARIA-based; CSS-module class names are hashed at build time
  // and would silently stop matching.
  const heroText = () => {
    const meter = document.querySelector(
      'main [role="meter"][aria-label="Spending budget used"]',
    );
    const card = meter && meter.closest("section");
    if (card) {
      return `${clean(card.querySelector("div > span"))} ${clean(
        card.querySelector("div > strong"),
      )}`.trim();
    }
    const answer = document.querySelector(
      'main section[aria-labelledby="answer-heading"]',
    );
    if (answer) {
      return `${clean(answer.querySelector("#answer-heading"))} ${clean(
        answer.querySelector("#answer-heading + p"),
      )}`.trim();
    }
    const total = document.querySelector(
      'main section[aria-label$="activity total"]',
    );
    if (total) {
      return `${clean(total.querySelector("p"))} ${clean(
        total.querySelector("strong"),
      )}`.trim();
    }
    const generic = document.querySelector("main section > p + strong");
    if (generic) {
      return `${clean(generic.previousElementSibling)} ${clean(generic)}`.trim();
    }
    return "";
  };

  const headlineText = () => {
    const heading =
      document.querySelector("main h1") ?? document.querySelector("main h2");
    const head = clean(heading);
    if (!head) return "";
    const hero = heroText();
    return hero ? `${head} | ${hero}` : head;
  };

  const sample = () => {
    const text = headlineText();
    if (!text) return;
    const last = state.headlines[state.headlines.length - 1];
    if (last && last.text === text) return;
    state.headlines.push({
      text,
      at: performance.now(),
      // The branded loading view is a placeholder, not the surface's own
      // headline. Recorded so readers can exclude it rather than mistaking
      // "loading screen replaced by content" for a headline mutation.
      busy: document.querySelector('main[aria-busy="true"]') !== null,
    });
  };

  state.headline = headlineText;

  const observeHeadline = () => {
    sample();
    new MutationObserver(sample).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  };

  if (document.documentElement) observeHeadline();
  else
    document.addEventListener("readystatechange", observeHeadline, {
      once: true,
    });

  const forward = console.error.bind(console);
  console.error = (...args) => {
    state.consoleErrors.push({
      at: performance.now(),
      message: args
        .map((value) => String(value))
        .join(" ")
        .slice(0, 300),
    });
    forward(...args);
  };
  addEventListener("error", (event) => {
    state.consoleErrors.push({
      at: performance.now(),
      message: `uncaught: ${String(event.message)}`.slice(0, 300),
    });
  });
  addEventListener("unhandledrejection", (event) => {
    state.consoleErrors.push({
      at: performance.now(),
      message: `unhandledrejection: ${String(event.reason)}`.slice(0, 300),
    });
  });
})();

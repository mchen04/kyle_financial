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
    // Geometry-derived layout shifts (see the block below) and the evidence
    // that says whether the native Layout Instability API can be trusted here.
    geometricShifts: [],
    geometricScrollSkips: 0,
    geometricSamples: 0,
    frameTicks: 0,
    blockedRequests: 0,
  };
  window.__density = state;

  // Frame liveness. The Layout Instability API only emits entries when the
  // compositor actually produces frames; a headless or fully occluded window
  // produces none, and then `layout-shift` is silent no matter how far the page
  // jumps. That failure mode reads as CLS 0.0000 on every row — a dead
  // instrument that looks like a perfect score. Counting animation frames is
  // how the harness tells "nothing shifted" from "nothing was measured".
  const tick = () => {
    state.frameTicks += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The measurement window is "network idle plus one second". In a single-route
  // client app the interesting requests are the app's own fetches, so count
  // them rather than relying on document load alone.
  //
  // The same wrapper is where a gated harness state simulates a failing
  // request. `sessionStorage.__density_block` holds a comma-separated list of
  // URL fragments; a fetch whose URL contains one rejects the way a flaky
  // network makes it reject. It survives a reload (which is the point — the
  // failure has to happen during document start-up) and it is browser-side
  // only: no application source, no service worker and no stored data is
  // involved, exactly like the `--fail-demo` injections.
  const blockedFragments = () => {
    try {
      return (sessionStorage.getItem("__density_block") ?? "")
        .split(",")
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = String(
      typeof args[0] === "string" || args[0] instanceof URL
        ? args[0]
        : (args[0] && args[0].url) || "",
    );
    for (const fragment of blockedFragments()) {
      if (url.includes(fragment)) {
        state.blockedRequests += 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      }
    }
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
    // `sources` names the elements the browser saw move. A gate that reports
    // "CLS 0.0633 exceeds 0.02" and nothing else cannot be acted on without
    // guessing; this makes the failure self-diagnosing. Descriptions are short
    // strings taken at observation time, so nothing holds a node reference.
    const describeShiftSource = (source) => {
      const node = source && source.node;
      const rect = (box) =>
        box
          ? [
              Math.round(box.x),
              Math.round(box.y),
              Math.round(box.width),
              Math.round(box.height),
            ]
          : null;
      let name = "(detached)";
      if (node && node.tagName) {
        name = node.tagName.toLowerCase();
        if (node.id) name += "#" + node.id;
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (text) name += " :: " + text.slice(0, 60);
      }
      return {
        node: name,
        from: rect(source && source.previousRect),
        to: rect(source && source.currentRect),
      };
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        state.shifts.push({
          value: entry.value,
          startTime: entry.startTime,
          sources: [...(entry.sources || [])]
            .slice(0, 4)
            .map(describeShiftSource),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {
    state.observerError = String(error);
  }

  // ---------------------------------------------------------------------------
  // Geometry-derived layout shift.
  //
  // Layout still runs when frames do not, so getBoundingClientRect() is truthful
  // even in a browser where `layout-shift` never fires. This samples every
  // rendered element on a timer (setInterval runs without frames) and applies
  // the same CLS scoring formula the spec defines: for the elements that moved
  // between two samples, score = impact fraction x max distance fraction.
  //
  // Two deliberate differences from the native metric, both stated rather than
  // hidden:
  //   * The impact region is the bounding box of every moved element's union of
  //     old and new rects, not their exact union. A bounding box is >= the true
  //     union, so this over-reports rather than under-reports — the safe
  //     direction for a gate.
  //   * Movement is sampled at 100ms, not per frame, so two shifts inside one
  //     sampling interval are scored as their net movement. A page that jumps
  //     down and back within 100ms scores lower here than natively.
  // ---------------------------------------------------------------------------
  const previousRects = new WeakMap();
  let lastInputAt = -Infinity;
  for (const type of ["pointerdown", "keydown", "click", "input", "wheel"]) {
    addEventListener(
      type,
      () => {
        lastInputAt = performance.now();
      },
      true,
    );
  }

  let lastScrollTop = null;
  const sampleLayout = () => {
    const now = performance.now();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scroller = document.querySelector("main");
    const scrollTop = scroller ? scroller.scrollTop : 0;
    // Scrolling moves every rect without shifting anything. The native metric
    // excludes it; so does this, by discarding the sample pair that straddles a
    // scroll and counting how often that happened.
    const scrolled = lastScrollTop !== null && scrollTop !== lastScrollTop;
    lastScrollTop = scrollTop;
    state.geometricSamples += 1;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxMove = 0;
    let moved = 0;
    const inViewport = (box) =>
      box.bottom > 0 &&
      box.top < viewportHeight &&
      box.right > 0 &&
      box.left < viewportWidth;

    for (const node of document.querySelectorAll("body *")) {
      const rect = node.getBoundingClientRect();
      const previous = previousRects.get(node);
      previousRects.set(node, rect);
      if (!previous || scrolled) continue;
      if (rect.width === 0 || rect.height === 0) continue;
      if (previous.width === 0 || previous.height === 0) continue;
      const dx = rect.left - previous.left;
      const dy = rect.top - previous.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      if (!inViewport(rect) && !inViewport(previous)) continue;
      moved += 1;
      maxMove = Math.max(maxMove, Math.abs(dx), Math.abs(dy));
      minX = Math.min(minX, rect.left, previous.left);
      minY = Math.min(minY, rect.top, previous.top);
      maxX = Math.max(maxX, rect.right, previous.right);
      maxY = Math.max(maxY, rect.bottom, previous.bottom);
    }

    if (scrolled) {
      state.geometricScrollSkips += 1;
      return;
    }
    if (moved === 0) return;
    // CLS-4: shifts within 500ms of a user interaction are excluded.
    if (now - lastInputAt < 500) return;

    const width = Math.max(
      0,
      Math.min(maxX, viewportWidth) - Math.max(minX, 0),
    );
    const height = Math.max(
      0,
      Math.min(maxY, viewportHeight) - Math.max(minY, 0),
    );
    const impact = (width * height) / (viewportWidth * viewportHeight);
    const distance = maxMove / Math.max(viewportWidth, viewportHeight);
    const value = impact * distance;
    if (value > 0) {
      state.geometricShifts.push({
        value,
        startTime: now,
        moved,
        maxMove: Math.round(maxMove * 10) / 10,
      });
    }
  };
  setInterval(sampleLayout, 100);
  sampleLayout();

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
      // The hero on its own — the primary answer's label and figure, without
      // the surface heading. A surface may legitimately go from "no hero yet"
      // to "the hero"; what rule 3 forbids is two *different* hero strings, and
      // that is only visible if the hero is recorded separately.
      hero: heroText(),
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

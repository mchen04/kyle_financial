"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./financial-app.module.css";

export function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadForUpdate = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.storage?.persist?.();
    const onControllerChange = () => {
      if (!reloadForUpdate.current) return;
      reloadForUpdate.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        type: "module",
        updateViaCache: "none",
      })
      .then(async (registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaiting(worker);
            }
          });
        });
        const ready = await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url).origin === window.location.origin);
        (navigator.serviceWorker.controller ?? ready.active)?.postMessage({
          type: "CACHE_URLS",
          urls: [window.location.href, ...urls],
        });
      });
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
  }, []);

  if (!waiting) return null;
  return (
    <button
      className={styles.updateToast}
      onClick={() => {
        reloadForUpdate.current = true;
        waiting.postMessage({ type: "SKIP_WAITING" });
      }}
    >
      <RefreshCw size={16} /> Update ready · reload
    </button>
  );
}

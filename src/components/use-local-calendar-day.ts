"use client";

import { useEffect, useState } from "react";
import { currentLocalDate } from "@/domain/daily-money";

export function millisecondsUntilNextLocalDay(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 50);
  return Math.max(1, next.getTime() - now.getTime());
}

export function useLocalCalendarDay(): string {
  const [today, setToday] = useState(currentLocalDate);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, millisecondsUntilNextLocalDay());
    };
    const refresh = () => {
      setToday((current) => {
        const next = currentLocalDate();
        return current === next ? current : next;
      });
      schedule();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    schedule();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return today;
}

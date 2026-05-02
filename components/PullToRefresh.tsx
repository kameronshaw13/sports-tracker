"use client";

import { ReactNode, useRef, useState } from "react";
import { useSWRConfig } from "swr";

type Props = {
  children: ReactNode;
};

const PULL_START_THRESHOLD = 28;
const RELEASE_THRESHOLD = 110;

export default function PullToRefresh({ children }: Props) {
  const { mutate } = useSWRConfig();
  const startY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const ready = pullDistance >= RELEASE_THRESHOLD;

  const reset = () => {
    setPullDistance(0);
    startY.current = null;
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await mutate(() => true, undefined, { revalidate: true });
    } finally {
      setRefreshing(false);
      reset();
    }
  };

  return (
    <div
      onTouchStart={(e) => {
        if (typeof window !== "undefined" && window.scrollY <= 0) {
          startY.current = e.touches[0]?.clientY ?? null;
        }
      }}
      onTouchMove={(e) => {
        if (startY.current === null || typeof window === "undefined" || window.scrollY > 0) return;
        const y = e.touches[0]?.clientY ?? startY.current;
        const delta = Math.max(0, y - startY.current);
        if (delta <= PULL_START_THRESHOLD) {
          setPullDistance(0);
          return;
        }
        const eased = Math.min(150, Math.round((delta - PULL_START_THRESHOLD) * 0.7));
        setPullDistance(eased);
      }}
      onTouchEnd={() => {
        if (ready) refresh();
        else reset();
      }}
      onTouchCancel={reset}
    >
      {(pullDistance > 0 || refreshing) && (
        <div className="fixed inset-x-0 top-3 z-50 flex justify-center pointer-events-none">
          <div
            className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: ready || refreshing ? "var(--text)" : "var(--text-2)",
              transform: `translateY(${Math.min(36, Math.max(0, pullDistance - 18))}px)`,
              transition: refreshing ? "transform 120ms ease" : undefined,
            }}
          >
            {refreshing ? "Updating scores..." : ready ? "Release to refresh" : "Pull to refresh"}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

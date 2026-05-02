"use client";

import { ReactNode, useRef, useState } from "react";
import { useSWRConfig } from "swr";

type Props = {
  children: ReactNode;
};

export default function PullToRefresh({ children }: Props) {
  const { mutate } = useSWRConfig();
  const startY = useRef<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await mutate(() => true, undefined, { revalidate: true });
    } finally {
      setRefreshing(false);
      setPulling(false);
      startY.current = null;
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
        if (startY.current === null) return;
        const y = e.touches[0]?.clientY ?? startY.current;
        const delta = y - startY.current;
        if (window.scrollY <= 0 && delta > 55) setPulling(true);
      }}
      onTouchEnd={() => {
        if (pulling) refresh();
        else startY.current = null;
      }}
    >
      {(pulling || refreshing) && (
        <div className="sticky top-2 z-50 flex justify-center pointer-events-none">
          <div
            className="text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            {refreshing ? "Updating scores..." : "Release to refresh"}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

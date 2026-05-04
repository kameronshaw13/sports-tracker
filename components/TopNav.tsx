"use client";

export type ViewId = "home" | "scores" | "standings" | "more" | "teamPage" | "leaguePage";

type Props = { active: ViewId; onChange: (v: ViewId) => void };

type IconName = "home" | "scores" | "standings" | "more";

const icons: Record<IconName, (filled: boolean) => React.ReactNode> = {
  home: (filled) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path d="M3 10.6 12 3l9 7.6v9.1a1.3 1.3 0 0 1-1.3 1.3h-5.1v-6.2H9.4V21H4.3A1.3 1.3 0 0 1 3 19.7v-9.1Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  scores: (filled) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h2M14 9h2M8 13h2M14 13h2" stroke={filled ? "var(--bg)" : "currentColor"} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  standings: (filled) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="9" width="4" height="10" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="5" width="4" height="14" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
      <rect x="17" y="12" width="4" height="7" rx="1" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  more: (filled) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      {[6, 12, 18].map((cx) => <circle key={cx} cx={cx} cy="12" r="2.2" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />)}
    </svg>
  ),
};

export default function TopNav({ active, onChange }: Props) {
  const items: { id: ViewId; label: string; icon: IconName }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "scores", label: "Scores", icon: "scores" },
    { id: "standings", label: "Standings", icon: "standings" },
    { id: "more", label: "More", icon: "more" },
  ];
  const visualActive = active === "leaguePage" ? "more" : active;
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2"
      style={{ background: "color-mix(in srgb, var(--surface) 96%, transparent)", borderTop: "1px solid var(--border)", backdropFilter: "blur(16px)" }}
    >
      <div className="max-w-3xl mx-auto grid grid-cols-4 gap-1.5">
        {items.map((it) => {
          const isActive = visualActive === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className="px-2 py-1.5 text-[11px] font-black transition-all flex flex-col items-center gap-1 active:scale-[0.98]"
              style={{ color: isActive ? "var(--text)" : "var(--text-3)" }}
            >
              {icons[it.icon](isActive)}
              <span className="leading-none truncate max-w-full">{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

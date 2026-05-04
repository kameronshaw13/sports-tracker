"use client";

export type ViewId = "home" | "teams" | "leagues";

type Props = { active: ViewId; onChange: (v: ViewId) => void };

export default function TopNav({ active, onChange }: Props) {
  const items: { id: ViewId; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "teams", label: "My Teams", icon: "★" },
    { id: "leagues", label: "Scores", icon: "▦" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-4 pt-1 pb-[max(0.45rem,env(safe-area-inset-bottom))]" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)", borderTop: "1px solid var(--border)", backdropFilter: "blur(14px)" }}>
      <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2">
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <button key={it.id} onClick={() => onChange(it.id)} className="rounded-xl px-3 py-1 text-[11px] font-black transition-all flex flex-col items-center gap-0.5" style={{ background: isActive ? "var(--surface)" : "transparent", color: isActive ? "var(--text)" : "var(--text-2)", border: isActive ? "1px solid var(--border)" : "1px solid transparent" }}>
              <span className="text-base leading-none">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

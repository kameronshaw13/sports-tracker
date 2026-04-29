"use client";

export type ViewId = "home" | "teams" | "leagues";

type Props = {
  active: ViewId;
  onChange: (v: ViewId) => void;
};

export default function TopNav({ active, onChange }: Props) {
  const items: { id: ViewId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "teams", label: "My Teams" },
    { id: "leagues", label: "Leagues" },
  ];
  return (
    <nav className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: "var(--surface-2)" }}>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: isActive ? "var(--surface)" : "transparent",
              color: isActive ? "var(--text)" : "var(--text-2)",
              border: isActive ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

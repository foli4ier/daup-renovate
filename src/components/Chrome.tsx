import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { copy } from "../copy";
import type { Pill } from "../lib/status";
import { pillLabel } from "../lib/status";

export function TopBar({ title }: { title?: string }) {
  return (
    <div className="topbar">
      <button className="back" type="button" onClick={() => history.back()}>
        {copy.back}
      </button>
      {title ? <h1 className="app-name">{title}</h1> : null}
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="topbar">
      <span className="logo">DAUP</span>
      <span className="app-name">Renovate</span>
    </div>
  );
}

export function TabBar() {
  const path = useLocation().pathname;
  const current = path.startsWith("/you") ? "you" : path === "/" || path.startsWith("/properties") ? "home" : "plan";
  const tabs = [
    { id: "home", href: "/", label: "Home" },
    { id: "plan", href: "/plan", label: "Plan" },
    { id: "you", href: "/you", label: "You" },
  ] as const;
  return (
    <nav className="tabs" aria-label="App">
      {tabs.map((tab) => (
        <Link key={tab.id} to={tab.href} aria-current={current === tab.id ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="grip" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PillView({ pill }: { pill: Pill }) {
  return <span className={`pill ${pill}`}>{pillLabel(pill)}</span>;
}

export function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <div className="slider">
      <img src={after} alt="After" />
      <img className="before-shot" src={before} alt="Before" style={{ clipPath: "inset(0 50% 0 0)" }} />
      <span className="slider-label before">Before</span>
      <span className="slider-label after">After</span>
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={50}
        aria-label="Before and after"
        onChange={(event) => {
          const image = event.currentTarget.parentElement?.querySelector<HTMLImageElement>(".before-shot");
          if (image) image.style.clipPath = `inset(0 ${100 - Number(event.currentTarget.value)}% 0 0)`;
        }}
      />
    </div>
  );
}

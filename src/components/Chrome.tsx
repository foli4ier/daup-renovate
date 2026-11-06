import { useEffect, useRef, type ReactNode } from "react";
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

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialogRef.current;
    const items = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.hasAttribute("disabled"))
        : [];
    const initial = items()[0] ?? root;
    initial?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) {
        event.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grip" />
        <h2 className="sheet-title">{title}</h2>
        <div className="sheet-scroll">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
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

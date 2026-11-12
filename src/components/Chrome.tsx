import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { copy } from "../copy";
import { afterHalf, beforeHalf } from "../lib/afterView";
import type { Pill } from "../lib/status";
import { pillLabel, stepRail } from "../lib/status";

export function TopBar({
  title,
  onTitle,
  titleOpen,
  extra,
  onBack,
}: {
  title?: string;
  onTitle?: () => void;
  titleOpen?: boolean;
  extra?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="topbar">
      <button className="back" type="button" onClick={() => (onBack ? onBack() : history.back())}>
        {copy.back}
      </button>
      {title && onTitle ? (
        <h1 className="zone-heading">
          <button className="zone-title" type="button" aria-haspopup="dialog" aria-expanded={Boolean(titleOpen)} onClick={onTitle}>
            {title}
            <span className="zone-chevron" aria-hidden="true" />
          </button>
        </h1>
      ) : title ? (
        <h1 className="app-name">{title}</h1>
      ) : null}
      {extra}
    </div>
  );
}

export function Wordmark() {
  return (
    <div className="topbar wordmark-row">
      <p className="wordmark">
        renovate<span className="dot">.</span>
      </p>
      <a className="hub" href="https://apps.daup.co.za">
        {copy.hub}
      </a>
    </div>
  );
}

export function StepRail({ pill }: { pill: Pill }) {
  const steps = stepRail(pill);
  return (
    <ol className="step-rail" aria-label="Photos, after, approved">
      {steps.map((step, index) => (
        <li key={step.id} className="step-rail-item">
          {index > 0 ? (
            <span className={`conn ${steps[index - 1]?.state === "done" ? "done" : ""}`} aria-hidden="true">
              →
            </span>
          ) : null}
          <span className={`node ${step.state}`} aria-current={step.state === "active" ? "step" : undefined}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TabBar() {
  const path = useLocation().pathname;
  const current =
    path === "/" || path.startsWith("/properties")
      ? "home"
      : path.startsWith("/budget")
        ? "budget"
        : path.startsWith("/decisions")
          ? "decisions"
          : "zones";
  const tabs = [
    { id: "home", href: "/", label: "Home" },
    { id: "zones", href: "/plan", label: "Zones" },
    { id: "budget", href: "/budget", label: "Budget" },
    { id: "decisions", href: "/decisions", label: "Decisions" },
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
  heading,
  onClose,
  children,
  footer,
}: {
  title: string;
  heading?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Focus once. onClose is a new function on each parent render, and re-running this steals the field.
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
        onCloseRef.current();
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
  }, []);
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
        <h2 className="sheet-title">{heading ?? title}</h2>
        <div className="sheet-scroll">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function PillView({ pill }: { pill: Pill }) {
  return <span className={`pill ${pill}`}>{pillLabel(pill)}</span>;
}

export function BeforeAfter({
  before,
  after,
  onOpenAfter,
  onOpenBefore,
}: {
  before: string;
  after: string;
  onOpenAfter?: () => void;
  onOpenBefore?: () => void;
}) {
  const [split, setSplit] = useState(50);
  const start = useRef<{ x: number; y: number } | null>(null);
  const travel = useRef(0);
  return (
    <div
      className="slider"
      onPointerDown={(event) => {
        if (event.target instanceof Element && event.target.closest("input")) return;
        start.current = { x: event.clientX, y: event.clientY };
        travel.current = 0;
      }}
      onPointerMove={(event) => {
        const origin = start.current;
        if (!origin) return;
        travel.current = Math.max(travel.current, Math.hypot(event.clientX - origin.x, event.clientY - origin.y));
      }}
      onClick={(event) => {
        if (travel.current > 10) return;
        if (event.target instanceof Element && event.target.closest("input")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        if (onOpenAfter && afterHalf(x, rect.width, split)) {
          onOpenAfter();
          return;
        }
        if (onOpenBefore && beforeHalf(x, rect.width, split)) onOpenBefore();
      }}
    >
      <img src={after} alt="After" draggable={false} />
      <img className="before-shot" src={before} alt="Before" draggable={false} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
      <span className="slider-label before">Before</span>
      <span className="slider-label after">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        aria-label="Before and after"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setSplit(Number(event.currentTarget.value))}
      />
    </div>
  );
}

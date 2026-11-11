import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { isAfterViewerState, pointerGesture, stepIndex } from "../lib/afterView";
import { BeforeAfter } from "./Chrome";
import { PictureBar } from "./PictureBar";
import { PictureChat } from "./PictureChat";

export type AfterPicture = { id: string; imageUrl: string };

type ReelFlag = "afterViewer" | "beforeViewer";

function isReelOpen(state: unknown, flag: ReelFlag): boolean {
  if (flag === "afterViewer") return isAfterViewerState(state);
  if (!state || typeof state !== "object") return false;
  return (state as { beforeViewer?: unknown }).beforeViewer === true;
}

export function useAfterLightbox(
  pictures: AfterPicture[],
  selectedId: string | undefined,
  onSelect: (id: string) => void,
) {
  return useReel("afterViewer", pictures, selectedId, onSelect);
}

function useReel(
  flag: ReelFlag,
  pictures: AfterPicture[],
  selectedId: string | undefined,
  onSelect: (id: string) => void,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const open = isReelOpen(location.state, flag);
  const openRef = useRef(open);
  openRef.current = open;
  const pushed = useRef(false);
  const closing = useRef(false);
  const index = selectedId ? pictures.findIndex((picture) => picture.id === selectedId) : -1;

  useEffect(() => {
    if (!open) {
      pushed.current = false;
      closing.current = false;
    }
  }, [open]);

  const openViewer = useCallback(() => {
    if (openRef.current || pushed.current || closing.current) return;
    if (!selectedId || index < 0) return;
    // A history entry so system back closes the viewer before it leaves the gallery.
    pushed.current = true;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { [flag]: true } },
    );
  }, [navigate, location.pathname, location.search, location.hash, selectedId, index, flag]);

  const closeViewer = useCallback(() => {
    if (!openRef.current || closing.current) return;
    closing.current = true;
    const didPush = pushed.current;
    pushed.current = false;
    if (didPush) {
      navigate(-1);
      return;
    }
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, [navigate, location.pathname, location.search, location.hash]);

  const move = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = stepIndex(index, pictures.length, delta);
      const picture = pictures[next];
      if (!picture || picture.id === selectedId) return;
      onSelect(picture.id);
    },
    [index, pictures, selectedId, onSelect],
  );

  return { open: open && index >= 0, index, openViewer, closeViewer, move };
}

export function AfterViewer({
  imageUrl,
  place,
  total,
  label = "After",
  onClose,
  onMove,
  onSheetClose,
  sheet,
  children,
}: {
  imageUrl: string;
  place: number;
  total: number;
  label?: string;
  onClose: () => void;
  onMove: (delta: number) => void;
  onSheetClose?: () => void;
  sheet?: ReactNode;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSheetCloseRef = useRef(onSheetClose);
  onSheetCloseRef.current = onSheetClose;

  useEffect(() => {
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (onSheetCloseRef.current) {
          onSheetCloseRef.current();
          return;
        }
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = dialogRef.current
        ? [...dialogRef.current.querySelectorAll<HTMLElement>("button")].filter((item) => !item.hasAttribute("disabled"))
        : [];
      if (!list.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      event.preventDefault();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? list[(index <= 0 ? list.length : index) - 1]
        : list[(index + 1) % list.length];
      (next ?? list[0])?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (root) root.inert = false;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("button")) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.stopPropagation();
    const node = event.currentTarget;
    if (typeof node.setPointerCapture === "function") {
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        /* The swipe still ends on pointerup when the finger stays on the picture. */
      }
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin || origin.id !== event.pointerId) return;
    event.stopPropagation();
    const gesture = pointerGesture(event.clientX - origin.x, event.clientY - origin.y);
    if (gesture === "next") onMove(1);
    else if (gesture === "prev") onMove(-1);
    else if (gesture === "close") onClose();
  }

  const count =
    total > 1 ? (
      <p className="after-count" aria-live="polite">
        {copy.afterCount(place, total)}
      </p>
    ) : null;

  return createPortal(
    <div
      ref={dialogRef}
      className="after-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <button ref={closeRef} className="back after-close" type="button" onClick={onClose}>
        {copy.close}
      </button>
      <img className="after-viewer-photo" src={imageUrl} alt="" draggable={false} />
      {children ? (
        <div className="viewer-foot">
          {children}
          {count}
        </div>
      ) : (
        count
      )}
      {sheet}
    </div>,
    document.body,
  );
}

export function OpenPicture({
  kind,
  planId,
  zoneId,
  pictureId,
  imageUrl,
  place,
  total,
  onClose,
  onMove,
}: {
  kind: "before" | "after";
  planId: string;
  zoneId: string;
  pictureId: string;
  imageUrl: string;
  place: number;
  total: number;
  onClose: () => void;
  onMove: (delta: number) => void;
}) {
  const [chat, setChat] = useState(false);
  return (
    <AfterViewer
      label={kind === "before" ? "Before" : "After"}
      imageUrl={imageUrl}
      place={place}
      total={total}
      onClose={onClose}
      onMove={onMove}
      onSheetClose={chat ? () => setChat(false) : undefined}
      sheet={chat ? <PictureChat zoneId={zoneId} pictureId={pictureId} onClose={onClose} /> : null}
    >
      <PictureBar kind={kind} planId={planId} zoneId={zoneId} pictureId={pictureId} onChat={() => setChat(true)} />
    </AfterViewer>
  );
}

export function GalleryStage({
  befores,
  beforeId,
  onSelectBefore,
  pictures,
  selectedId,
  onSelect,
  empty,
  planId,
  zoneId,
}: {
  befores: AfterPicture[];
  beforeId?: string;
  onSelectBefore: (id: string) => void;
  pictures: AfterPicture[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: ReactNode;
  planId?: string;
  zoneId?: string;
}) {
  const beforeReel = useReel("beforeViewer", befores, beforeId, onSelectBefore);
  const afterReel = useAfterLightbox(pictures, selectedId, onSelect);
  const current = pictures.find((picture) => picture.id === selectedId);
  const before = befores.find((picture) => picture.id === beforeId);
  return (
    <>
      <div className="photo-stage">
        {current && before ? (
          <BeforeAfter
            before={before.imageUrl}
            after={current.imageUrl}
            onOpenAfter={afterReel.openViewer}
            onOpenBefore={befores.length ? beforeReel.openViewer : undefined}
          />
        ) : before ? (
          <button className="before-open" type="button" onClick={beforeReel.openViewer}>
            <img className="before-only" src={before.imageUrl} alt="" />
          </button>
        ) : (
          empty
        )}
      </div>
      {beforeReel.open && before && planId && zoneId ? (
        <OpenPicture
          kind="before"
          planId={planId}
          zoneId={zoneId}
          pictureId={before.id}
          imageUrl={before.imageUrl}
          place={beforeReel.index + 1}
          total={befores.length}
          onClose={beforeReel.closeViewer}
          onMove={beforeReel.move}
        />
      ) : null}
      {afterReel.open && current && planId && zoneId ? (
        <OpenPicture
          kind="after"
          planId={planId}
          zoneId={zoneId}
          pictureId={current.id}
          imageUrl={current.imageUrl}
          place={afterReel.index + 1}
          total={pictures.length}
          onClose={afterReel.closeViewer}
          onMove={afterReel.move}
        />
      ) : null}
    </>
  );
}

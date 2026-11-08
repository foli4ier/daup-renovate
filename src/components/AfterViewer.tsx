import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { copy } from "../copy";
import { isAfterViewerState, pointerGesture, stepIndex } from "../lib/afterView";
import { BeforeAfter } from "./Chrome";

export type AfterPicture = { id: string; imageUrl: string };

export function useAfterLightbox(
  pictures: AfterPicture[],
  selectedId: string | undefined,
  onSelect: (id: string) => void,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const open = isAfterViewerState(location.state);
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
      { state: { afterViewer: true } },
    );
  }, [navigate, location.pathname, location.search, location.hash, selectedId, index]);

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
  onClose,
  onMove,
}: {
  imageUrl: string;
  place: number;
  total: number;
  onClose: () => void;
  onMove: (delta: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
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

  return createPortal(
    <div
      className="after-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="After"
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
      {total > 1 ? (
        <p className="after-count" aria-live="polite">
          {copy.afterCount(place, total)}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

export function GalleryStage({
  beforeUrl,
  pictures,
  selectedId,
  onSelect,
  empty,
}: {
  beforeUrl?: string;
  pictures: AfterPicture[];
  selectedId?: string;
  onSelect: (id: string) => void;
  empty: ReactNode;
}) {
  const box = useAfterLightbox(pictures, selectedId, onSelect);
  const current = pictures.find((picture) => picture.id === selectedId);
  return (
    <>
      <div className="photo-stage">
        {current && beforeUrl ? (
          <BeforeAfter before={beforeUrl} after={current.imageUrl} onOpenAfter={box.openViewer} />
        ) : beforeUrl ? (
          <img className="before-only" src={beforeUrl} alt="" />
        ) : (
          empty
        )}
      </div>
      {box.open && current ? (
        <AfterViewer
          imageUrl={current.imageUrl}
          place={box.index + 1}
          total={pictures.length}
          onClose={box.closeViewer}
          onMove={box.move}
        />
      ) : null}
    </>
  );
}

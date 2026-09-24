import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus should go next, if the browser refused to move it right away.
 * Safari only lets a cross-origin frame move focus in response to input, so
 * a "put the customer back on the card field" after an async decline can be
 * refused. We remember it and honour it on the customer's next keystroke.
 */
let deferred: { el: HTMLElement; select: boolean } | null = null;

export function focusSoon(el: HTMLElement | null, { select = false } = {}) {
  if (!el) return;
  // After React re-renders (and re-enables anything that was busy).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.focus();
      if (select && el instanceof HTMLInputElement) el.select();
      deferred = document.activeElement === el ? null : { el, select };
    }),
  );
}

/** Keeps Tab inside the dialog and puts focus somewhere sensible when content changes. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;

    let frame = 0;
    const focusFirst = (attempt = 0) => {
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        el.querySelector<HTMLElement>(FOCUSABLE);
      if (!target) return;
      target.focus({ preventScroll: true });
      // Firefox and Safari ignore focus() on an element that hasn't been laid
      // out yet (the dialog's first frame). Try again on the next few frames.
      if (document.activeElement !== target && attempt < 5) {
        frame = requestAnimationFrame(() => focusFirst(attempt + 1));
      }
    };
    focusFirst();

    // When a view swaps (form -> receipt), focus would fall to <body>. Catch it.
    const observer = new MutationObserver(() => {
      if (!el.contains(document.activeElement)) focusFirst();
    });
    observer.observe(el, { childList: true, subtree: true });

    // The host focuses our <iframe> once we're ready; depending on timing that
    // can land on <body>. Whenever the frame gains focus, make sure it's useful.
    const onWindowFocus = () => {
      if (!el.contains(document.activeElement)) focusFirst();
    };
    window.addEventListener("focus", onWindowFocus);

    const onKey = (e: KeyboardEvent) => {
      // Safari won't let a cross-origin frame move focus on its own, only in
      // response to input. So if the first keystroke finds focus on <body>,
      // move it to the first field now: a typed character lands in the field,
      // and Tab starts from the top instead of the close button.
      const pending = deferred && el.contains(deferred.el) ? deferred : null;
      const lost = !el.contains(document.activeElement);
      if ((lost || pending) && !["Shift", "Meta", "Control", "Alt", "Escape", "Enter"].includes(e.key)) {
        if (e.key === "Tab") e.preventDefault();
        deferred = null;
        if (pending) {
          pending.el.focus();
          if (pending.select && pending.el instanceof HTMLInputElement) pending.el.select();
        } else {
          focusFirst();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return ref;
}

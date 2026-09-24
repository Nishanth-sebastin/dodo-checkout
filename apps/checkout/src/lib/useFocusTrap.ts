import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the dialog and puts focus somewhere sensible when content changes. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;

    const focusFirst = () => {
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        el.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus({ preventScroll: true });
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
      observer.disconnect();
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return ref;
}

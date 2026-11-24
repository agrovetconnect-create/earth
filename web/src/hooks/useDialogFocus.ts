import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus<T extends HTMLElement = HTMLElement>(
  open: boolean
): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusable = () => {
      const matched = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const visible = matched.filter(
        (element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0
      );
      return visible.length > 0 ? visible : matched;
    };

    const initialFocus = getFocusable()[0];
    if (initialFocus && !dialog.contains(document.activeElement)) {
      initialFocus.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const activeElement = document.activeElement;
      const activeDialog = activeElement?.closest('[role="dialog"][aria-modal="true"]');
      if (activeDialog && activeDialog !== dialog) return;

      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && (activeElement === firstItem || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastItem.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastItem || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  return dialogRef;
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { GrowthPortal } from './GrowthPortal';

/**
 * A row menu drawn on the body, fixed beside its trigger (source: ai-ui `FloatingMenu`).
 *
 * ⚠ WHY NOT `absolute` INSIDE THE ROW: a list inside a scroller clips on both axes, so a menu opened on
 * the last row was cut off. On the body nothing clips it, and it opens upward when there is no room.
 *
 * ⚠ It opens TOWARD the middle of the screen: a trigger on the left half lines up the menu's left edge,
 * one on the right half its right edge. A kebab at the left of a dialog's footer used to open leftward,
 * out of the dialog and over its backdrop. (Its stacking level sits above `.gr-scrim`: see styles.css.)
 */
export function FloatingMenu({ anchor, open, onClose, children }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const height = menu.current?.offsetHeight ?? 0;
      const width = menu.current?.offsetWidth ?? 176;
      const below = r.bottom + 4 + height <= window.innerHeight;
      const top = below ? r.bottom + 4 : Math.max(8, r.top - 4 - height);
      const opensRight = (r.left + r.right) / 2 < window.innerWidth / 2;
      setPos(opensRight
        ? { top, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) }
        : { top, right: Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - width - 8)) });
    };
    place();
    // The portal mounts a frame later, so the first measurement sees no menu: measure again once it exists.
    let frame = requestAnimationFrame(function again() {
      if (menu.current) place();
      else frame = requestAnimationFrame(again);
    });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;

  return (
    <GrowthPortal>
      <div ref={menu} role="menu" className="gr-menu" style={{ top: pos?.top ?? -9999, left: pos?.left, right: pos?.right, visibility: pos ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </GrowthPortal>
  );
}

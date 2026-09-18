import { useCallback, useRef, type CSSProperties, type ElementType, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react';

/**
 * Subtle 3D tilt that follows the pointer (≤ `max` degrees), with an optional specular
 * glare. Pure CSS variables + transforms — no layout work, no libraries. Disabled by
 * `prefers-reduced-motion` (see `.tilt` in index.css) and inert on touch (no hover).
 *
 * <Tilt className="panel rounded-xl p-4">…</Tilt>
 * <Tilt as={Link} to="/x" glare max={4}>…</Tilt>
 */
type TiltProps<T extends ElementType> = {
  as?: T;
  max?: number;
  glare?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function Tilt<T extends ElementType = 'div'>({ as, max = 5, glare = false, children, className = '', ...rest }: TiltProps<T>) {
  const Comp = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement | null>(null);

  const onMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top) / r.height;   // 0..1
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    el.dataset.tilting = 'true';
  }, [max]);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.dataset.tilting = 'false';
  }, []);

  const style: CSSProperties = { '--rx': '0deg', '--ry': '0deg' } as CSSProperties;
  const html = rest as HTMLAttributes<HTMLElement>;

  return (
    <Comp
      ref={ref}
      {...html}
      style={{ ...style, ...(html.style ?? {}) }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`tilt relative ${glare ? 'tilt-glare overflow-hidden' : ''} ${className}`}
    >
      {children}
    </Comp>
  );
}

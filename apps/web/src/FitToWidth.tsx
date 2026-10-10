import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** How much to shrink content `natural` px wide into `available` px (never enlarges). */
export function fitScale(available: number, natural: number): number {
  if (available <= 0 || natural <= available) return 1;
  return available / natural;
}

/**
 * Shrinks a fixed-size board to the width available, so a phone shows the
 * whole board instead of a corner of it. Layout that already adapts to the
 * width (e.g. the hold'em table) never overflows and is left alone.
 */
export function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height?: number }>({ scale: 1 });

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const update = () => {
      // Layout sizes ignore the transform, so these are the unscaled sizes.
      const scale = fitScale(box.clientWidth, content.scrollWidth);
      const height = scale < 1 ? content.offsetHeight * scale : undefined;
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full" style={{ height: fit.height }}>
      <div
        ref={inner}
        className="origin-top-left"
        style={fit.scale < 1 ? { transform: `scale(${fit.scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

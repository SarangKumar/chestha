/**
 * Forest-style isometric Focus Garden plot.
 *
 * A floating diamond of grass over earth sides, soft shadow underneath, plants
 * on a clear square grid projected into isometric space. Drawn with SVG + CSS
 * only — no image files, no new dependencies.
 */
import { useId } from 'react';
import { cx } from '../components/ui.jsx';

/** Side length of the plant grid (3…6), sized to the plants you have. */
export function gridSizeForCount(count) {
  if (count <= 0) return 3;
  return Math.min(6, Math.max(3, Math.ceil(Math.sqrt(count))));
}

/** Column / row for a plant index on a size×size grid (row 0 = furthest back). */
export function gridCell(index, size) {
  return { col: index % size, row: Math.floor(index / size) };
}

/**
 * Project a grid cell onto the plot’s local isometric plane.
 * Origin is the back-most corner of the grass top; +x is down-right, +y down-left.
 */
export function isoProject(col, row, { cellW = 1, cellH = 0.5 } = {}) {
  return {
    x: (col - row) * (cellW / 2),
    y: (col + row) * (cellH / 2),
  };
}

/**
 * Soft dirt pad under a single hero plant (session / compact widget).
 * Reads as a tiny chunk of the same island without implying a full garden.
 */
export function DirtPad({ className, children }) {
  return (
    <div className={cx('relative inline-flex flex-col items-center', className)}>
      <div className="relative z-[1]">{children}</div>
      <svg
        aria-hidden="true"
        viewBox="0 0 160 70"
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-[2.6rem] w-[7.5rem] -translate-x-1/2 translate-y-[18%]"
      >
        <ellipse cx="80" cy="58" rx="54" ry="8" fill="currentColor" opacity="0.12" />
        <path d="M28 42 L80 22 L132 42 L80 58 Z" fill="#6b9a52" />
        <path d="M28 42 L80 58 L80 66 L28 50 Z" fill="#6b4a2e" />
        <path d="M132 42 L80 58 L80 66 L132 50 Z" fill="#4e3420" />
        <path d="M28 42 L80 22 L132 42" fill="none" stroke="#8fbf6a" strokeWidth="1.2" opacity="0.55" />
      </svg>
    </div>
  );
}

/**
 * Full isometric garden island.
 *
 * `cells` is an array of { key, col, row, node } already clipped to the grid.
 * Plants nearer the camera (higher col+row) paint later via z-index.
 */
export function GardenPlot({
  size = 3,
  cells = [],
  className,
  sky,
  haze,
  emptyLabel,
  framed = true,
}) {
  const uid = useId().replace(/:/g, '');
  const grassId = `grove-grass-sheen-${uid}`;
  // Layout units in the SVG: one cell spans cellW × cellH on the top face.
  const cellW = 72;
  const cellH = 36;
  const pad = 28;
  // Grass diamond covers the whole grid, with a little lip around the edge.
  const topOrigin = { x: 200, y: 56 };
  const extent = isoProject(size - 1, size - 1, { cellW, cellH });
  const halfSpanX = ((size - 1) * cellW) / 2 + pad;
  const depthY = extent.y + pad;
  const thickness = 22;

  // Four corners of the grass top, expanded by `pad` along the diamond edges.
  const back = { x: topOrigin.x, y: topOrigin.y - pad * 0.35 };
  const right = {
    x: topOrigin.x + halfSpanX + pad * 0.15,
    y: topOrigin.y + depthY / 2,
  };
  const front = {
    x: topOrigin.x,
    y: topOrigin.y + depthY + pad * 0.45,
  };
  const left = {
    x: topOrigin.x - halfSpanX - pad * 0.15,
    y: topOrigin.y + depthY / 2,
  };

  const viewW = 400;
  const viewH = Math.ceil(front.y + thickness + 36);
  const shadowCy = front.y + thickness * 0.35;
  const shadowRx = halfSpanX * 0.92;
  const shadowRy = 14 + size;

  // Plant anchor: centre of each cell on the grass top.
  const plantAnchor = (col, row) => {
    const p = isoProject(col + 0.5, row + 0.5, { cellW, cellH });
    return {
      x: topOrigin.x + p.x,
      y: topOrigin.y + p.y,
      z: col + row,
    };
  };

  const plantSize = size <= 3 ? 52 : size === 4 ? 44 : size === 5 ? 36 : 30;

  return (
    <div
      className={cx(
        'relative isolate overflow-hidden',
        framed && 'rounded-panel border border-line bg-inset',
        className,
      )}
      role="img"
      aria-label={emptyLabel ?? `Garden plot, ${size} by ${size}`}
    >
      {sky && (
        <div className="pointer-events-none absolute inset-0" style={{ background: sky }} aria-hidden="true" />
      )}
      {haze && (
        <div className="pointer-events-none absolute inset-0" style={{ background: haze }} aria-hidden="true" />
      )}

      <div className="relative mx-auto flex h-full w-full max-w-xl items-center justify-center px-2 py-3 sm:px-4">
        <div className="relative w-full" style={{ aspectRatio: `${viewW} / ${viewH}` }}>
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="pointer-events-none absolute inset-0 h-full w-full text-ink"
            aria-hidden="true"
          >
            {/* Soft elevation shadow */}
            <ellipse
              cx={topOrigin.x}
              cy={shadowCy + 10}
              rx={shadowRx}
              ry={shadowRy}
              fill="currentColor"
              opacity="0.16"
            />
            <ellipse
              cx={topOrigin.x}
              cy={shadowCy + 6}
              rx={shadowRx * 0.72}
              ry={shadowRy * 0.55}
              fill="currentColor"
              opacity="0.1"
            />

            {/* Earth sides */}
            <path
              d={`M${left.x} ${left.y} L${front.x} ${front.y} L${front.x} ${front.y + thickness} L${left.x} ${left.y + thickness} Z`}
              fill="#6b4a2e"
            />
            <path
              d={`M${right.x} ${right.y} L${front.x} ${front.y} L${front.x} ${front.y + thickness} L${right.x} ${right.y + thickness} Z`}
              fill="#4e3420"
            />
            {/* Subtle soil strata */}
            <path
              d={`M${left.x} ${left.y + thickness * 0.45} L${front.x} ${front.y + thickness * 0.45} L${right.x} ${right.y + thickness * 0.45}`}
              fill="none"
              stroke="#8a6238"
              strokeWidth="1.2"
              opacity="0.45"
            />

            <defs>
              <linearGradient id={grassId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fcf6a" stopOpacity="0.55" />
                <stop offset="55%" stopColor="#6fad55" stopOpacity="0" />
                <stop offset="100%" stopColor="#3f7a38" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            {/* Grass top */}
            <path
              d={`M${back.x} ${back.y} L${right.x} ${right.y} L${front.x} ${front.y} L${left.x} ${left.y} Z`}
              fill="#6fad55"
            />
            <path
              d={`M${back.x} ${back.y} L${right.x} ${right.y} L${front.x} ${front.y} L${left.x} ${left.y} Z`}
              fill={`url(#${grassId})`}
            />
            {/* Lip where grass meets soil */}
            <path
              d={`M${left.x} ${left.y} L${front.x} ${front.y} L${right.x} ${right.y}`}
              fill="none"
              stroke="#4e7a3a"
              strokeWidth="1.6"
              opacity="0.55"
            />

            {/* Quiet grid hints so the cells read without dominating */}
            {Array.from({ length: size + 1 }, (_, i) => {
              const a = plantAnchor(-0.5, i - 0.5);
              const b = plantAnchor(size - 0.5, i - 0.5);
              const c = plantAnchor(i - 0.5, -0.5);
              const d = plantAnchor(i - 0.5, size - 0.5);
              return (
                <g key={`grid-${i}`} opacity="0.14">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2f5a28" strokeWidth="0.8" />
                  <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke="#2f5a28" strokeWidth="0.8" />
                </g>
              );
            })}
          </svg>

          {/* Plants sit above the SVG so buttons stay clickable */}
          <div className="absolute inset-0">
            {cells.map((cell) => {
              const anchor = plantAnchor(cell.col, cell.row);
              const leftPct = (anchor.x / viewW) * 100;
              const topPct = (anchor.y / viewH) * 100;
              return (
                <div
                  key={cell.key}
                  className="absolute"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: plantSize,
                    height: plantSize,
                    transform: 'translate(-50%, -78%)',
                    zIndex: 10 + anchor.z,
                  }}
                >
                  {cell.node}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

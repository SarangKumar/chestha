import { cx } from './ui.jsx';

/**
 * A minimal SVG line chart — no chart library, just paths.
 *
 * Values are non-negative numbers. An empty or all-zero series still draws a
 * baseline so the card does not collapse into a blank box.
 */
export function LineChart({
  values = [],
  labels = [],
  height = 120,
  className,
  stroke = 'var(--app-text)',
  fill = 'var(--app-accent-soft)',
  formatValue,
  ariaLabel,
}) {
  const points = Array.isArray(values) ? values.map((v) => Math.max(0, Number(v) || 0)) : [];
  const width = 320;
  const padX = 4;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const max = Math.max(1, ...points);
  const n = Math.max(1, points.length);

  const coords = points.map((value, index) => {
    const x = padX + (n === 1 ? innerW / 2 : (index / (n - 1)) * innerW);
    const y = padY + innerH - (value / max) * innerH;
    return [x, y];
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = coords.length
    ? `${line} L${coords[coords.length - 1][0].toFixed(2)} ${(padY + innerH).toFixed(2)} L${coords[0][0].toFixed(2)} ${(padY + innerH).toFixed(2)} Z`
    : '';

  const last = points[points.length - 1] ?? 0;
  const tip = formatValue ? formatValue(last) : String(last);

  return (
    <div className={cx('w-full min-w-0', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel ?? `Line chart, latest ${tip}`}
        preserveAspectRatio="none"
      >
        <line
          x1={padX}
          x2={width - padX}
          y1={padY + innerH}
          y2={padY + innerH}
          stroke="var(--app-border)"
          strokeWidth="1"
        />
        {area && <path d={area} fill={fill} opacity="0.55" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {labels.length >= 2 && (
        <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** Compact sparkline for widget cards. */
export function Sparkline({ values = [], className, stroke = 'var(--app-text)' }) {
  return (
    <LineChart
      values={values}
      height={36}
      className={className}
      stroke={stroke}
      fill="transparent"
      ariaLabel="Sparkline"
    />
  );
}

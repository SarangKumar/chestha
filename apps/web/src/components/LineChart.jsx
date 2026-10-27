import { cx } from './ui.jsx';

/** Y ticks (max, mid, 0) shown beside a chart with a fixed pixel height. */
function YAxis({ max, height, formatValue }) {
  const fmt = (v) => (formatValue ? formatValue(v) : String(Math.round(v)));
  return (
    <div
      className="flex shrink-0 flex-col justify-between border-r border-line pr-1.5 text-right text-[10px] leading-none text-ink-faint tabular-nums"
      style={{ height }}
      aria-hidden="true"
    >
      <span>{fmt(max)}</span>
      <span>{fmt(max / 2)}</span>
      <span>{fmt(0)}</span>
    </div>
  );
}

/** X labels: first, middle, last. */
function XAxis({ labels }) {
  if (labels.length < 2) return null;
  const mid = labels[Math.floor((labels.length - 1) / 2)];
  return (
    <div className="mt-1 flex justify-between text-[10px] text-ink-faint" aria-hidden="true">
      <span>{labels[0]}</span>
      {labels.length > 2 && <span>{mid}</span>}
      <span>{labels[labels.length - 1]}</span>
    </div>
  );
}

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
  axes = true,
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
      <div className="flex min-w-0 items-stretch gap-1.5">
      {axes && <YAxis max={max} height={height} formatValue={formatValue} />}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={axes ? 'block min-w-0 flex-1' : 'h-auto w-full'}
        style={axes ? { height } : undefined}
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
      </div>
      <div className={axes ? 'pl-10' : undefined}>
        <XAxis labels={labels} />
      </div>
    </div>
  );
}

/** Compact sparkline for widget cards. */
export function Sparkline({ values = [], className, stroke = 'var(--app-text)' }) {
  return (
    <LineChart
      values={values}
      height={36}
      axes={false}
      className={className}
      stroke={stroke}
      fill="transparent"
      ariaLabel="Sparkline"
    />
  );
}

/**
 * Distinct strokes for multi-series charts. Hue carries the series identity;
 * lightness stays mid so the same list reads on light and dark canvas.
 */
export const CHART_SERIES_COLORS = [
  'oklch(0.58 0.14 250)',
  'oklch(0.58 0.13 155)',
  'oklch(0.60 0.14 55)',
  'oklch(0.58 0.14 320)',
  'oklch(0.58 0.13 25)',
  'oklch(0.58 0.10 200)',
  'oklch(0.56 0.12 290)',
  'oklch(0.60 0.12 100)',
];

export function colorForSeries(index) {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

/**
 * Several series on one shared axis — used by Productive time "By site".
 *
 * `series` items: `{ id, label, values, color? }`. Area fill is skipped so
 * overlapping sites stay readable; a legend maps colour to label.
 */
export function MultiLineChart({
  series = [],
  labels = [],
  height = 160,
  className,
  formatValue,
  ariaLabel,
  axes = true,
}) {
  const rows = (Array.isArray(series) ? series : []).map((row, index) => ({
    id: row.id ?? String(index),
    label: row.label ?? `Series ${index + 1}`,
    color: row.color || colorForSeries(index),
    points: (Array.isArray(row.values) ? row.values : []).map((v) => Math.max(0, Number(v) || 0)),
  }));

  const width = 320;
  const padX = 4;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const max = Math.max(1, ...rows.flatMap((row) => row.points));

  const pathFor = (points) => {
    if (!points.length) return '';
    const count = points.length;
    return points.map((value, index) => {
      const x = padX + (count === 1 ? innerW / 2 : (index / (count - 1)) * innerW);
      const y = padY + innerH - (value / max) * innerH;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
  };

  const tipParts = rows.map((row) => {
    const last = row.points[row.points.length - 1] ?? 0;
    const tip = formatValue ? formatValue(last) : String(last);
    return `${row.label} ${tip}`;
  });

  return (
    <div className={cx('w-full min-w-0', className)}>
      <div className="flex min-w-0 items-stretch gap-1.5">
      {axes && <YAxis max={max} height={height} formatValue={formatValue} />}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={axes ? 'block min-w-0 flex-1' : 'h-auto w-full'}
        style={axes ? { height } : undefined}
        role="img"
        aria-label={ariaLabel ?? `Line chart: ${tipParts.join(', ')}`}
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
        {rows.map((row) => {
          const d = pathFor(row.points);
          if (!d) return null;
          return (
            <path
              key={row.id}
              d={d}
              fill="none"
              stroke={row.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      </div>
      <div className={axes ? 'pl-10' : undefined}>
        <XAxis labels={labels} />
      </div>
      {rows.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Series legend">
          {rows.map((row) => (
            <li key={row.id} className="flex min-w-0 items-center gap-1.5 text-meta text-ink-muted">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="truncate text-ink">{row.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

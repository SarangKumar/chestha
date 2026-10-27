/**
 * Plant artwork, drawn here rather than loaded.
 *
 * Inline SVG means no image files, no licence to verify, no download, and a plant
 * that stays crisp from a 40px widget tile to a full-screen session. Each stage is
 * the previous one plus what grew, so the transition between them is an opacity and
 * transform change on a few paths rather than a swap between two pictures.
 *
 * This is the one place in the app where hue appears for its own sake. Everywhere
 * else, colour carries state; in the Grove, the colour *is* the point. It stays
 * inside the plant — never the chrome, the text or the borders.
 */
import { cx } from '../components/ui.jsx';

const STAGE_INDEX = { seed: 0, sprout: 1, young: 2, mature: 3 };

const LEAF = 'M0 0c0-5.6 4-10.2 9-10.8C9.6-5.5 5.6-.4 0 0Z';

/**
 * One palette per species. Shape is shared and colour is not, which is enough to tell
 * six plants apart at widget size without six sets of paths to maintain.
 */
export const SPECIES = {
  plant_sprout: { light: '#9ccb94', dark: '#4e8356', bloom: null, glow: '#8ab98a' },
  plant_fern: { light: '#8fc49b', dark: '#2f6b4a', bloom: null, glow: '#6fae84' },
  plant_bamboo: { light: '#b9cf86', dark: '#5a7f3c', bloom: null, glow: '#9bbd6d' },
  plant_cactus: { light: '#8fbf9c', dark: '#3f6f58', bloom: '#e4b7a0', glow: '#7aa98c' },
  plant_ivy: { light: '#7fba8a', dark: '#2f5f3d', bloom: null, glow: '#6aa878' },
  plant_blossom: { light: '#9cc49a', dark: '#4a7a55', bloom: '#e6bfd0', glow: '#c99fb4' },
  plant_olive: { light: '#b7c48a', dark: '#6a7a3e', bloom: null, glow: '#9aaa6a' },
  plant_moonflower: { light: '#a8c3c9', dark: '#44666f', bloom: '#eae3f2', glow: '#9fb6d6' },
  plant_lotus: { light: '#9ec4b0', dark: '#3f6f5c', bloom: '#f0c4d8', glow: '#d4a0b8' },
  plant_pine: { light: '#7a9e78', dark: '#2f4f38', bloom: null, glow: '#5f8a62' },
};

const paletteFor = (id) => SPECIES[id] ?? SPECIES.plant_sprout;

/** Shown from `from` onwards, so each stage keeps everything the last one grew. */
function Part({ from, stage, children, className }) {
  const shown = STAGE_INDEX[stage] >= from;
  return (
    <g
      className={cx('origin-bottom transition-[opacity,transform] duration-700 ease-out', className)}
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'scale(1)' : 'scale(0.6)' }}
    >
      {children}
    </g>
  );
}

export function Plant({ speciesId = 'plant_sprout', stage = 'seed', className = 'size-40', glow = true }) {
  const index = STAGE_INDEX[stage] ?? 0;
  const palette = paletteFor(speciesId);
  // Gradient ids are per species, so two different plants on one screen cannot end up
  // sharing whichever <defs> the browser saw first.
  const leafId = `grove-leaf-${speciesId}`;
  const glowId = `grove-glow-${speciesId}`;
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`Plant, ${stage} stage`}>
      <defs>
        <radialGradient id={glowId} cx="50%" cy="58%" r="50%">
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.28" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={leafId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
      </defs>

      {glow && <circle cx="60" cy="70" r="54" fill={`url(#${glowId})`} />}

      {/* Soil takes its colour from the surrounding text, so it follows the theme. */}
      <ellipse cx="60" cy="102" rx="30" ry="7" fill="currentColor" opacity="0.14" />
      <ellipse cx="60" cy="100" rx="22" ry="5" fill="currentColor" opacity="0.2" />

      {/* The seed, which is all there is at first and sits under the soil after. */}
      <g
        className="transition-opacity duration-700"
        style={{ opacity: index === 0 ? 1 : 0 }}
      >
        <ellipse cx="60" cy="96" rx="5" ry="3.6" fill="#8d7352" />
      </g>

      <Part from={1} stage={stage}>
        <path d="M60 98V74" stroke={palette.dark} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <g transform="translate(60 80) rotate(-28)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(60 80) rotate(28) scale(-1 1)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      </Part>

      <Part from={2} stage={stage}>
        <path d="M60 76V50" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <g transform="translate(60 60) rotate(-34) scale(1.15)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(60 60) rotate(34) scale(-1.15 1.15)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      </Part>

      <Part from={3} stage={stage}>
        <path d="M60 52V34" stroke={palette.dark} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <g transform="translate(60 42) rotate(-40) scale(1.3)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(60 42) rotate(40) scale(-1.3 1.3)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        {palette.bloom && <circle cx="60" cy="31" r="4.4" fill={palette.bloom} />}
        {palette.bloom && <circle cx="60" cy="31" r="1.8" fill="#f0e2c8" />}
        {!palette.bloom && <g transform="translate(60 33) rotate(0) scale(0.9)"><path d={LEAF} fill={`url(#${leafId})`} /></g>}
      </Part>
    </svg>
  );
}

export const STAGE_LABELS = {
  seed: 'Planted',
  sprout: 'Sprouting',
  young: 'Growing',
  mature: 'Grown',
};

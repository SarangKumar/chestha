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
 *
 * Mature silhouettes lean toward Forest-style trees and bushes: layered canopies,
 * conical pines, rounded fruiting crowns — still the same stage ladder.
 */
import { useId } from 'react';
import { cx } from '../components/ui.jsx';

const STAGE_INDEX = { seed: 0, sprout: 1, young: 2, mature: 3 };

const LEAF = 'M0 0c0-5.6 4-10.2 9-10.8C9.6-5.5 5.6-.4 0 0Z';

/**
 * One palette per species. Shape is shared early; mature crowns diverge so a pine
 * reads as a pine next to a blossom at widget size.
 */
export const SPECIES = {
  plant_sprout: { light: '#9ccb94', dark: '#4e8356', bloom: null, glow: '#8ab98a', crown: 'tuft' },
  plant_fern: { light: '#8fc49b', dark: '#2f6b4a', bloom: null, glow: '#6fae84', crown: 'fern' },
  plant_bamboo: { light: '#b9cf86', dark: '#5a7f3c', bloom: null, glow: '#9bbd6d', crown: 'bamboo' },
  plant_cactus: { light: '#8fbf9c', dark: '#3f6f58', bloom: '#e4b7a0', glow: '#7aa98c', crown: 'cactus' },
  plant_ivy: { light: '#7fba8a', dark: '#2f5f3d', bloom: null, glow: '#6aa878', crown: 'bush' },
  plant_blossom: { light: '#e08a4a', dark: '#a84e2e', bloom: '#f0c4d0', glow: '#e09a70', crown: 'autumn' },
  plant_olive: { light: '#c4a84a', dark: '#7a6a2e', bloom: '#d4a030', glow: '#c9b060', crown: 'round' },
  plant_moonflower: { light: '#a8c3c9', dark: '#44666f', bloom: '#eae3f2', glow: '#9fb6d6', crown: 'tuft' },
  plant_lotus: { light: '#9ec4b0', dark: '#3f6f5c', bloom: '#f0c4d8', glow: '#d4a0b8', crown: 'lotus' },
  plant_pine: { light: '#5f8a52', dark: '#2a4a30', bloom: null, glow: '#4a7048', crown: 'pine' },
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

function TuftLeaves({ palette, leafId }) {
  return (
    <>
      <g transform="translate(60 42) rotate(-40) scale(1.3)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      <g transform="translate(60 42) rotate(40) scale(-1.3 1.3)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      <g transform="translate(60 33) rotate(0) scale(0.9)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
    </>
  );
}

function MatureCrown({ crown, palette, leafId }) {
  if (crown === 'pine') {
    return (
      <g>
        <path d="M60 78 L48 58 L72 58 Z" fill={palette.dark} />
        <path d="M60 66 L44 44 L76 44 Z" fill={palette.light} />
        <path d="M60 52 L46 30 L74 30 Z" fill={palette.dark} opacity="0.92" />
        <path d="M60 40 L50 22 L70 22 Z" fill={palette.light} />
        <path d="M60 78 V88" stroke="#6b4a2e" strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  if (crown === 'autumn' || crown === 'round') {
    return (
      <g>
        <path d="M60 88 V58" stroke="#6b4a2e" strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="60" cy="42" rx="26" ry="22" fill={palette.light} />
        <ellipse cx="48" cy="48" rx="14" ry="12" fill={palette.dark} opacity="0.85" />
        <ellipse cx="74" cy="46" rx="12" ry="11" fill={palette.dark} opacity="0.7" />
        <ellipse cx="60" cy="34" rx="16" ry="12" fill={palette.light} />
        {palette.bloom && (
          <>
            <circle cx="50" cy="40" r="2.4" fill={palette.bloom} />
            <circle cx="68" cy="36" r="2.2" fill={palette.bloom} />
            <circle cx="58" cy="48" r="2" fill={palette.bloom} />
            <circle cx="72" cy="50" r="1.8" fill={palette.bloom} />
          </>
        )}
      </g>
    );
  }
  if (crown === 'bush') {
    return (
      <g>
        <ellipse cx="60" cy="58" rx="28" ry="20" fill={palette.light} />
        <ellipse cx="44" cy="62" rx="14" ry="12" fill={palette.dark} opacity="0.8" />
        <ellipse cx="76" cy="60" rx="13" ry="11" fill={palette.dark} opacity="0.75" />
        <ellipse cx="60" cy="48" rx="16" ry="12" fill={palette.light} />
      </g>
    );
  }
  if (crown === 'bamboo') {
    return (
      <g>
        <path d="M48 96 V36" stroke={palette.dark} strokeWidth="3" strokeLinecap="round" />
        <path d="M60 96 V28" stroke={palette.light} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M72 96 V42" stroke={palette.dark} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M48 50 H42 M48 70 H43" stroke={palette.light} strokeWidth="1.4" />
        <path d="M60 40 H54 M60 62 H55" stroke={palette.dark} strokeWidth="1.4" />
        <path d="M72 56 H78 M72 74 H77" stroke={palette.light} strokeWidth="1.4" />
        <g transform="translate(60 26) rotate(-20) scale(0.85)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(48 34) rotate(-50) scale(0.75)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(72 40) rotate(40) scale(-0.75 0.75)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      </g>
    );
  }
  if (crown === 'cactus') {
    return (
      <g>
        <rect x="52" y="48" width="16" height="44" rx="8" fill={palette.light} />
        <rect x="36" y="58" width="12" height="22" rx="6" fill={palette.dark} />
        <rect x="72" y="54" width="12" height="20" rx="6" fill={palette.dark} />
        {palette.bloom && <circle cx="60" cy="44" r="4" fill={palette.bloom} />}
      </g>
    );
  }
  if (crown === 'lotus') {
    return (
      <g>
        <ellipse cx="60" cy="92" rx="22" ry="5" fill="#7fa6b8" opacity="0.35" />
        <path d="M60 88 V62" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="60" cy="52" rx="18" ry="10" fill={palette.bloom ?? palette.light} />
        <ellipse cx="48" cy="56" rx="10" ry="6" fill={palette.light} transform="rotate(-28 48 56)" />
        <ellipse cx="72" cy="56" rx="10" ry="6" fill={palette.light} transform="rotate(28 72 56)" />
        <circle cx="60" cy="52" r="4" fill="#f0e2c8" />
      </g>
    );
  }
  if (crown === 'fern') {
    return (
      <g>
        <path d="M60 90 V40" stroke={palette.dark} strokeWidth="2.2" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 78 - i * 10;
          const s = 0.7 + i * 0.12;
          return (
            <g key={i}>
              <g transform={`translate(60 ${y}) rotate(-32) scale(${s})`}><path d={LEAF} fill={`url(#${leafId})`} /></g>
              <g transform={`translate(60 ${y}) rotate(32) scale(${-s} ${s})`}><path d={LEAF} fill={`url(#${leafId})`} /></g>
            </g>
          );
        })}
      </g>
    );
  }
  // tuft default
  return (
    <>
      <path d="M60 52V34" stroke={palette.dark} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <TuftLeaves palette={palette} leafId={leafId} />
      {palette.bloom && <circle cx="60" cy="31" r="4.4" fill={palette.bloom} />}
      {palette.bloom && <circle cx="60" cy="31" r="1.8" fill="#f0e2c8" />}
    </>
  );
}

export function Plant({ speciesId = 'plant_sprout', stage = 'seed', className = 'size-40', glow = true }) {
  const index = STAGE_INDEX[stage] ?? 0;
  const palette = paletteFor(speciesId);
  // Unique per instance so a garden full of the same species does not share one <defs>.
  const uid = useId().replace(/:/g, '');
  const leafId = `grove-leaf-${speciesId}-${uid}`;
  const glowId = `grove-glow-${speciesId}-${uid}`;
  const useCustomMature = palette.crown !== 'tuft';

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

      {/* Tiny soil shadow under the stem — the plot provides the real earth. */}
      <ellipse cx="60" cy="104" rx="18" ry="4" fill="currentColor" opacity="0.1" />

      <g className="transition-opacity duration-700" style={{ opacity: index === 0 ? 1 : 0 }}>
        <ellipse cx="60" cy="96" rx="5" ry="3.6" fill="#8d7352" />
      </g>

      <Part from={1} stage={stage}>
        <path d="M60 98V74" stroke={palette.dark} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <g transform="translate(60 80) rotate(-28)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
        <g transform="translate(60 80) rotate(28) scale(-1 1)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
      </Part>

      <Part from={2} stage={stage}>
        {!useCustomMature && (
          <>
            <path d="M60 76V50" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <g transform="translate(60 60) rotate(-34) scale(1.15)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
            <g transform="translate(60 60) rotate(34) scale(-1.15 1.15)"><path d={LEAF} fill={`url(#${leafId})`} /></g>
          </>
        )}
        {useCustomMature && palette.crown !== 'bamboo' && palette.crown !== 'pine' && (
          <>
            <path d="M60 76V58" stroke={palette.dark} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <ellipse cx="60" cy="54" rx="14" ry="11" fill={palette.light} opacity="0.85" />
          </>
        )}
        {useCustomMature && (palette.crown === 'bamboo' || palette.crown === 'pine') && (
          <g opacity="0.85" transform="scale(0.72) translate(24 28)">
            <MatureCrown crown={palette.crown} palette={palette} leafId={leafId} />
          </g>
        )}
      </Part>

      <Part from={3} stage={stage}>
        <MatureCrown crown={palette.crown} palette={palette} leafId={leafId} />
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

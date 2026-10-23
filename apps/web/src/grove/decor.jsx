/**
 * Decorations and environments: everything in the scene that is not a plant.
 *
 * Drawn in the same way as the plants — inline SVG, no files, no licences — and in a
 * narrower palette. A decoration is scenery, so it takes its colour from the
 * surrounding text and stays almost monochrome; the plants are what the eye should
 * land on.
 */

export function Decoration({ id, className = 'size-10' }) {
  const shapes = {
    deco_stone: (
      <>
        <path d="M14 46c-2-10 3-22 11-26 7-4 14 2 16 10 2 9-1 16-8 18-8 3-17 2-19-2Z" fill="currentColor" opacity="0.26" />
        <path d="M20 26c3-4 8-6 12-4" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.3" />
      </>
    ),
    deco_lantern: (
      <>
        <circle cx="30" cy="26" r="13" fill="#e8d6a8" opacity="0.12" />
        <path d="M30 40v12" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
        <rect x="23" y="16" width="14" height="18" rx="3" fill="currentColor" opacity="0.22" />
        <rect x="26.5" y="20" width="7" height="10" rx="1.5" fill="#e8d6a8" opacity="0.75" />
        <path d="M24 52h12" stroke="currentColor" strokeWidth="1.6" opacity="0.3" />
      </>
    ),
    deco_pond: (
      <>
        <ellipse cx="30" cy="40" rx="24" ry="9" fill="#7fa6b8" opacity="0.22" />
        <ellipse cx="30" cy="40" rx="24" ry="9" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
        <path d="M18 38h10M34 42h8" stroke="#dfeaf0" strokeWidth="1" opacity="0.45" />
      </>
    ),
    deco_log: (
      <>
        <rect x="8" y="34" width="44" height="12" rx="6" fill="currentColor" opacity="0.24" />
        <ellipse cx="50" cy="40" rx="4" ry="6" fill="#8d7352" opacity="0.5" />
        <path d="M14 40h26" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      </>
    ),
  };
  if (!shapes[id]) return null;
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      {shapes[id]}
    </svg>
  );
}

/**
 * The wash behind the scene.
 *
 * Each environment is a pair of very low-opacity overlays over the ordinary inset
 * surface, rather than a painted backdrop. That way the scene still belongs to
 * whichever theme is active — a night garden does not become a black rectangle sitting
 * in the middle of the light theme — and the strongest colour on screen is still the
 * plants.
 */
export const ENVIRONMENTS = {
  env_night: {
    name: 'Night',
    sky: 'radial-gradient(120% 90% at 50% 110%, rgba(110,140,170,0.16), transparent 70%)',
    haze: 'linear-gradient(to bottom, rgba(30,40,60,0.10), transparent 60%)',
  },
  env_mist: {
    name: 'Mist',
    sky: 'radial-gradient(110% 80% at 50% 100%, rgba(170,180,185,0.18), transparent 72%)',
    haze: 'linear-gradient(to bottom, rgba(200,205,210,0.08), rgba(200,205,210,0.14) 70%, transparent)',
  },
  env_dawn: {
    name: 'First light',
    sky: 'radial-gradient(120% 95% at 50% 115%, rgba(226,170,120,0.20), transparent 68%)',
    haze: 'linear-gradient(to bottom, rgba(120,140,180,0.10), transparent 55%)',
  },
};

export const environmentOf = (id) => ENVIRONMENTS[id] ?? ENVIRONMENTS.env_night;

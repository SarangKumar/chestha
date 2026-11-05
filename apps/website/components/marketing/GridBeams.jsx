/**
 * Light travelling along the hero's grid lines.
 *
 * Rendered *inside* `.chestha-hero-band`, never beside it. The band is the
 * element the 3rem grid is painted on, so a beam offset that is a multiple of
 * 3rem sits exactly on a hairline; a sibling would be a containing block of its
 * own and the two would drift apart at some viewport widths. Being a child also
 * means each beam inherits the band's bottom fade, so it dissolves above the
 * headline rather than running behind the copy.
 *
 * `--beam-at` is the offset from the band's left edge (vertical beams) or its
 * top edge (horizontal ones). The values below are deliberately irregular
 * multiples of the cell: evenly spaced beams on equal timers read as a loading
 * bar, and the point is for the grid to look occasionally alive rather than
 * animated. The durations are co-prime enough that the set does not visibly
 * repeat as a block.
 *
 * Narrow viewports simply show fewer of them — the far-right beams fall outside
 * a phone, which is correct, because there are no grid lines out there either.
 * Everything is decorative: the whole set is `aria-hidden`, carries no text, and
 * `prefers-reduced-motion` removes it outright (see marketing.css).
 */

const VERTICAL = [
  { at: '6rem', duration: '7.5s', delay: '0s', span: '9rem' },
  { at: '18rem', duration: '11s', delay: '2.6s', span: '7rem' },
  { at: '33rem', duration: '9s', delay: '1.2s', span: '11rem' },
  { at: '48rem', duration: '13s', delay: '4.4s', span: '8rem' },
  { at: '63rem', duration: '10s', delay: '3.1s', span: '10rem' },
];

// Two only, and both inside the mask's solid upper 55%: a horizontal beam
// crosses the whole band, so a third would almost always have another in view
// and the band would start to feel busy.
const HORIZONTAL = [
  { at: '6rem', duration: '14s', delay: '1.8s', span: '14rem' },
  { at: '15rem', duration: '17s', delay: '6.5s', span: '11rem' },
];

function beamStyle({ at, duration, delay, span }) {
  return {
    '--beam-at': at,
    '--beam-duration': duration,
    '--beam-delay': delay,
    '--beam-span': span,
  };
}

export function GridBeams() {
  return (
    <>
      {VERTICAL.map((beam) => (
        <span
          key={`v-${beam.at}`}
          aria-hidden
          className="chestha-beam chestha-beam-v"
          style={beamStyle(beam)}
        />
      ))}
      {HORIZONTAL.map((beam) => (
        <span
          key={`h-${beam.at}`}
          aria-hidden
          className="chestha-beam chestha-beam-h"
          style={beamStyle(beam)}
        />
      ))}
    </>
  );
}

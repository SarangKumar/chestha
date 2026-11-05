import { Badge } from '../../components/ui.jsx';

/**
 * Easy / Medium / Hard, coloured the same way everywhere.
 *
 * Difficulty is one of the few things in this app that genuinely carries hue —
 * it is an ordered scale people already read by colour, which is the test the
 * design tokens set for using one at all. So it gets the full ramp: `ok` for
 * Easy, `warn` for Medium, `danger` for Hard, all existing semantic tokens
 * rather than new colours.
 *
 * It lives here because the three DSA tabs each had their own idea of this.
 * The library coloured Hard and Medium but left Easy a neutral grey, so the
 * cheapest wins were the hardest to spot; the lists tab rendered all three
 * neutral; and the companies tab rendered difficulty as bare text with no badge
 * at all. One component, so a fourth tab cannot invent a fourth treatment.
 *
 * The label is never translated or abbreviated: it is the word LeetCode uses,
 * and the colour is a second channel on top of it, not a replacement — which is
 * what keeps this readable for anyone who cannot separate the three hues.
 */
const TONES = { Easy: 'ok', Medium: 'warn', Hard: 'danger' };

export function difficultyTone(difficulty) {
  return TONES[difficulty] ?? 'neutral';
}

export function DifficultyBadge({ difficulty, className }) {
  if (!difficulty) return null;
  return (
    <Badge tone={difficultyTone(difficulty)} className={className}>
      {difficulty}
    </Badge>
  );
}

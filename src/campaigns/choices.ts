/**
 * The newsletter wizards' shared choices, each with the line its card shows (owner 2026-11-20: a step's 2-3 options are
 * cards that say what they mean). One definition, so both wizards say the same thing.
 */
export const KIND_OPTIONS: Array<{ value: 'regular' | 'alert'; label: string; hint: string }> = [
  { value: 'regular', label: 'Newsletter', hint: 'Goes at each person’s pace: someone who chose every 2 weeks is not mailed twice inside that time.' },
  { value: 'alert', label: 'Alert', hint: 'Goes the same day, only to people who asked for every update.' },
];

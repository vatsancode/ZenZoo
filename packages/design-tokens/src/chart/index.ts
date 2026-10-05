import type { ThemeName } from "../colors";

/**
 * Colours for telling categories apart in a chart. These are separate from the UI colour
 * roles because they have a different job: identity, not meaning. Status colours (success,
 * warning, danger) stay out of here so a category never looks like a warning.
 *
 * The slots come in a fixed order (blue, orange, aqua, yellow, magenta) and are stepped
 * separately for each surface. The order is what keeps neighbouring slices apart for
 * colour-blind readers, so assign slots in order and never cycle them. Anything past the
 * last slot is drawn in a neutral and listed in a legend or table instead.
 */
export const chartCategorical: Record<ThemeName, readonly string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
};

/** Zone tops at 60/70/80/90% of max HR, the common 5-zone split. */
export const zonesFromMax = (max: number) => [0.6, 0.7, 0.8, 0.9].map((f) => Math.round(max * f))

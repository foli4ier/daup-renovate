/** Whole rands with the same grouping as the estimate, without the R. */
export function groupedRands(amount: number): string {
  return Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatRand(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}R${groupedRands(rounded)}`;
}

export function formatRange(low: number, high: number): string {
  return `${formatRand(low)}–${formatRand(high)}`;
}

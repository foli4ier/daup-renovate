export function formatRand(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}R${digits}`;
}

export function formatRange(low: number, high: number): string {
  return `${formatRand(low)}–${formatRand(high)}`;
}

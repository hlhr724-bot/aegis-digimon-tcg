export function formatDp(amount: number): string {
  return amount % 1000 === 0 ? `${amount / 1000}K` : amount.toLocaleString();
}

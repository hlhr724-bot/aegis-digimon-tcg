export function binomialCoefficient(total: number, chosen: number): number {
  if (chosen < 0 || chosen > total) {
    return 0;
  }
  const smaller = Math.min(chosen, total - chosen);
  let result = 1;
  for (let index = 1; index <= smaller; index++) {
    result = (result * (total - smaller + index)) / index;
  }
  return Math.round(result);
}

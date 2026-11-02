const TWO_ROW_SHARE = 0.8;
const TWO_ROW_FLOOR_POINTER = 84;
const TWO_ROW_FLOOR_COARSE = 64;

export function twoRowsFit({
  stackedWidth,
  sideBySideWidth,
  coarsePointer,
}: {
  stackedWidth: number;
  sideBySideWidth: number;
  coarsePointer: boolean;
}): boolean {
  const floor = coarsePointer ? TWO_ROW_FLOOR_COARSE : TWO_ROW_FLOOR_POINTER;
  const keepsShare = stackedWidth >= Math.ceil(sideBySideWidth * TWO_ROW_SHARE);
  return keepsShare && (stackedWidth >= floor || stackedWidth >= sideBySideWidth);
}

export const fieldRevision = {
  value: 0,
  bump(): void {
    fieldRevision.value += 1;
  },
};

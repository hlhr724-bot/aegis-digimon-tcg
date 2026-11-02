export type ArenaCueElement = {
  classList: { contains: (token: string) => boolean };
  querySelector: (selector: string) => unknown;
};

export type ArenaBreedingSpot = {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
};

export type ArenaBreedingSpotlight = {
  eggs: ArenaBreedingSpot;
  raising: ArenaBreedingSpot;
};

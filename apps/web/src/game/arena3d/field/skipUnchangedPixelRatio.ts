type PixelRatioRenderer = {
  getPixelRatio: () => number;
  setPixelRatio: (value: number) => void;
};

export function skipUnchangedPixelRatio(renderer: PixelRatioRenderer): void {
  const setPixelRatio = renderer.setPixelRatio.bind(renderer);
  renderer.setPixelRatio = (value: number) => {
    if (value !== renderer.getPixelRatio()) {
      setPixelRatio(value);
    }
  };
}

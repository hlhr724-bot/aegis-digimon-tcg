type Params = {
  element: Element;
  property: string;
  fallback: string;
};

let probe: CanvasRenderingContext2D | null | undefined;

function getProbe(): CanvasRenderingContext2D | null {
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  return probe;
}

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

export function resolveCssColor({ element, property, fallback }: Params): string {
  const declared = getComputedStyle(element).getPropertyValue(property).trim();
  const context = getProbe();
  if (!declared || !context) {
    return fallback;
  }
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = fallback;
  context.fillStyle = declared;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

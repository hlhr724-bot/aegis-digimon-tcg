import { useMemo } from "react";
import { encode } from "uqr";

type HandoffQrCodeParams = {
  url: string;
  label: string;
};

export function HandoffQrCode({ url, label }: HandoffQrCodeParams) {
  const { size, path } = useMemo(() => {
    const { size, data } = encode(url, { ecc: "M", border: 2 });
    const modules = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])));
    return { size, path: modules.join("") };
  }, [url]);
  return (
    <svg
      className="game-handoff__qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

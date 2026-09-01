import type { CSSProperties } from "react";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import { getAvatarBorderDefinition, type AvatarBorderSize } from "./avatarBorders";

type AvatarBorderFrameProps = {
  borderKey: AvatarBorderKey;
  size: AvatarBorderSize;
};

const geometry = {
  xs: { inset: "-2px", width: "2px" },
  sm: { inset: "-2px", width: "2px" },
  md: { inset: "-2.5px", width: "2.5px" },
  lg: { inset: "-3px", width: "3px" },
  xl: { inset: "-4px", width: "4px" },
} as const;

function AvatarBorderFrame({ borderKey, size }: AvatarBorderFrameProps) {
  if (borderKey === "none") return null;
  const border = getAvatarBorderDefinition(borderKey);

  if (border.kind === "image" && border.assetPath && border.imageScale) {
    const imageScale = border.imageScaleBySize?.[size] ?? border.imageScale;
    const imageStyle = {
      left: `calc(50% + ${border.imageOffsetX}%)`,
      top: `calc(50% + ${border.imageOffsetY}%)`,
      width: `${imageScale * 100}%`,
    } satisfies CSSProperties;

    return <img src={border.assetPath} alt="" draggable={false} data-avatar-layer="border" data-avatar-border={borderKey} aria-hidden="true" className="pointer-events-none absolute z-10 h-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none" style={imageStyle} />;
  }

  const frameGeometry = geometry[size];
  const style = {
    inset: frameGeometry.inset,
    borderWidth: frameGeometry.width,
    borderColor: border.color ?? "transparent",
    boxShadow: `0 0 0 1px ${border.outerEdge}, inset 0 0 0 1px ${border.innerEdge}`,
  } satisfies CSSProperties;

  return <span data-avatar-layer="border" data-avatar-border={borderKey} aria-hidden="true" className="pointer-events-none absolute z-10 rounded-full border-solid" style={style} />;
}

export default AvatarBorderFrame;

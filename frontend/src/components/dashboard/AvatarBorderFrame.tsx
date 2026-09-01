import type { CSSProperties } from "react";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import { getAvatarBorderDefinition } from "./avatarBorders";

type AvatarBorderFrameProps = {
  borderKey: AvatarBorderKey;
  size: "xs" | "sm" | "md" | "lg" | "xl";
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

  if (border.assetPath && border.overlayScale) {
    const imageStyle = {
      height: `${border.overlayScale * 100}%`,
      width: `${border.overlayScale * 100}%`,
    } satisfies CSSProperties;

    return <img src={border.assetPath} alt="" draggable={false} data-avatar-layer="border" data-avatar-border={borderKey} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-none -translate-x-1/2 -translate-y-1/2 select-none object-contain" style={imageStyle} />;
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

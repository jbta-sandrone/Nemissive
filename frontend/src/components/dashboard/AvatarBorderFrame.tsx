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

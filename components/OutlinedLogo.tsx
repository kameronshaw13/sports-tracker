"use client";

import { useId } from "react";

type Props = {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
};

export default function OutlinedLogo({ src, alt = "", size = 30, className = "" }: Props) {
  const rawId = useId();
  const filterId = `outlined-logo-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const radius = Math.max(0.72, Math.min(1.35, size * 0.032));
  const pad = Math.ceil(radius * 5);

  return (
    <span
      className={`outlined-logo ${className}`}
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: `0 0 ${size}px` }}
    >
      <svg
        className="outlined-logo-svg team-logo-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={alt}
        style={{ overflow: "visible", display: "block" }}
      >
        <defs>
          <filter
            id={filterId}
            x={-pad}
            y={-pad}
            width={size + pad * 2}
            height={size + pad * 2}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology in="SourceAlpha" operator="dilate" radius={radius} result="expanded" />
            <feFlood floodColor="#fff" floodOpacity=".98" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <image href={src} width={size} height={size} preserveAspectRatio="xMidYMid meet" filter={`url(#${filterId})`} />
      </svg>
    </span>
  );
}

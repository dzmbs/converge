interface TricolorRibbonProps {
  direction?: "vertical" | "horizontal";
  rounded?: boolean;
  className?: string;
}

export function TricolorRibbon({
  direction = "vertical",
  rounded = false,
  className = "",
}: TricolorRibbonProps) {
  const roundedClass = rounded ? "rounded-sm" : "";

  return (
    <div
      className={`${
        direction === "vertical"
          ? "tricolor-ribbon"
          : "tricolor-ribbon-horizontal w-full"
      } ${roundedClass} ${className}`}
    />
  );
}

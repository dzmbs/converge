interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassPanel({ children, className = "" }: GlassPanelProps) {
  return (
    <div
      className={`glass-panel rounded-xl border border-outline-variant/15 ${className}`}
    >
      {children}
    </div>
  );
}

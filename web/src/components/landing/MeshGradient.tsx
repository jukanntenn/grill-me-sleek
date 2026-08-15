// MeshGradient — the landing page's ONLY decoration (DESIGN.md: the mesh
// gradient is the entire decorative system, used at hero scale only).
// Three gradient pairs (develop/preview/ship) collapse into one atmospheric
// backdrop via overlapping SVG ellipses. Fades out at the bottom so it never
// crosses the next band's whitespace.

export function MeshGradient() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <svg className="h-full w-full" viewBox="0 0 1200 640" preserveAspectRatio="none">
        <defs>
          <radialGradient id="mesh-develop" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#007cf0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#00dfd8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mesh-preview" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7928ca" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff0080" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mesh-ship" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4d4d" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f9cb28" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="240" cy="110" rx="420" ry="270" fill="url(#mesh-develop)" />
        <ellipse cx="960" cy="60" rx="400" ry="250" fill="url(#mesh-preview)" />
        <ellipse cx="640" cy="440" rx="480" ry="270" fill="url(#mesh-ship)" />
        <ellipse cx="140" cy="470" rx="320" ry="210" fill="url(#mesh-develop)" />
      </svg>
    </div>
  );
}

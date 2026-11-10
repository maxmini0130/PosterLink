import { posterTheme, posterTitleLines } from "../../../lib/defaultPoster";

export type DefaultPosterProps = {
  title: string;
  category?: string | null;
  organization?: string | null;
};

/** Native SVG, never an empty placeholder. Same geometry and tokens as the PNG. */
export function DefaultPoster({
  title,
  category,
  organization,
}: DefaultPosterProps) {
  const theme = posterTheme(category),
    lines = posterTitleLines(title);
  const top = 329 - (lines.length - 1) * 34;
  return (
    <svg
      data-default-poster="true"
      viewBox="0 0 300 400"
      width="100%"
      height="100%"
      role="img"
      aria-label={`${theme.label}: ${title}`}
      style={{ display: "block", background: theme.color }}
    >
      <rect width="300" height="400" fill={theme.color} />
      <circle
        cx="292"
        cy="395"
        r="105"
        fill="none"
        stroke="white"
        strokeOpacity=".1"
        strokeWidth="27"
      />
      {Array.from({ length: 18 }, (_, i) => (
        <rect
          key={i}
          x={i * 23}
          width="15"
          height="8"
          fill="white"
          opacity=".35"
        />
      ))}
      <g
        transform={`translate(21 ${top - 56})`}
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={theme.icon} />
      </g>
      <text
        x="54"
        y={top - 37}
        fill="white"
        fontSize="17"
        fontWeight="700"
        fontFamily="sans-serif"
      >
        {theme.label}
      </text>
      {lines.map((line, i) => (
        <text
          key={i}
          x="21"
          y={top + i * 34}
          fill="white"
          fontSize="25"
          fontWeight="700"
          fontFamily="var(--font-pl-serif), serif"
        >
          {line}
        </text>
      ))}
      <path d="M21 350H279" stroke="white" strokeOpacity=".35" />
      <text x="21" y="376" fill="white" fontSize="15" fontFamily="sans-serif">
        {(organization ?? "").slice(0, 10)}
        {(organization?.length ?? 0) > 10 ? "…" : ""}
      </text>
      <text
        x="279"
        y="376"
        textAnchor="end"
        fill="white"
        fontSize="16"
        fontWeight="700"
        fontFamily="var(--font-pl-serif), serif"
      >
        PosterLink
      </text>
    </svg>
  );
}

/** Satori supports HTML text with an embedded Korean font, unlike SVG text fonts. */
export function DefaultPosterCanvas({
  title,
  category,
  organization,
}: DefaultPosterProps) {
  const theme = posterTheme(category),
    lines = posterTitleLines(title);
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 900,
        height: 1200,
        background: theme.color,
        color: "white",
        fontFamily: "PosterSerif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -240,
          bottom: -300,
          width: 630,
          height: 630,
          borderRadius: 315,
          border: "81px solid rgba(255,255,255,0.10)",
          display: "flex",
        }}
      />
      {Array.from({ length: 18 }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: i * 69,
            width: 45,
            height: 24,
            background: "rgba(255,255,255,.35)",
            display: "flex",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 63,
          top: 990 - lines.length * 102 - 96,
          display: "flex",
          alignItems: "center",
          gap: 24,
          fontSize: 51,
        }}
      >
        <svg
          width="72"
          height="72"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
        >
          <path d={theme.icon} />
        </svg>
        {theme.label}
      </div>
      <div
        style={{
          position: "absolute",
          left: 63,
          bottom: 210,
          display: "flex",
          flexDirection: "column",
          fontSize: 75,
          lineHeight: 1.36,
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", height: 102, flexShrink: 0 }}>
            {line}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 1050,
          left: 63,
          right: 63,
          borderTop: "3px solid rgba(255,255,255,.35)",
          paddingTop: 27,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 45,
        }}
      >
        <span>{(organization ?? "").slice(0, 10)}</span>
        <span>PosterLink</span>
      </div>
    </div>
  );
}

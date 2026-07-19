import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "포스터링크 — 공공기관 지원사업·교육·행사·모집 공고";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* 배경 패턴 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            opacity: 0.05,
            backgroundImage:
              "radial-gradient(circle at 25% 25%, #e94560 0%, transparent 50%), radial-gradient(circle at 75% 75%, #533483 0%, transparent 50%)",
          }}
        />

        {/* 로고 영역 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #e94560, #533483)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
            }}
          >
            📋
          </div>
          <span
            style={{
              fontSize: "64px",
              fontWeight: "800",
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            PosterLink
          </span>
        </div>

        {/* 설명 */}
        <div
          style={{
            fontSize: "28px",
            color: "#a0aec0",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.5,
          }}
        >
          공공기관 지원사업·교육·행사·모집 공고를 한곳에서
        </div>

        {/* 태그 */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "40px",
          }}
        >
          {["지원사업", "교육·행사", "채용·모집"].map((tag) => (
            <div
              key={tag}
              style={{
                padding: "8px 20px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#cbd5e0",
                fontSize: "18px",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* 도메인 */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            color: "rgba(255,255,255,0.3)",
            fontSize: "18px",
          }}
        >
          www.posterlink.kr
        </div>
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "radial-gradient(circle at top left, #312e81, #0a0e17 55%)",
          color: "#e8edf7",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 72,
          width: "100%",
        }}
      >
        <div style={{ color: "#818cf8", fontSize: 32, letterSpacing: 8, textTransform: "uppercase" }}>
          Game Stats
        </div>
        <div style={{ fontSize: 82, fontWeight: 700, letterSpacing: -4, marginTop: 24 }}>
          Video game analytics
        </div>
        <div style={{ color: "#94a3b8", fontSize: 34, marginTop: 24, maxWidth: 820 }}>
          Ratings, metadata, trends, and game-level comparisons from IGDB and Metacritic.
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: "50%",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#ffffff",
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: -2,
          }}
        >
          MA
        </div>
      </div>
    ),
    { ...size }
  );
}

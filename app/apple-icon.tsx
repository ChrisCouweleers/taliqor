import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#07142f", borderRadius:36 }}>
      <svg width="142" height="112" viewBox="0 0 52 40">
        <path d="M3 9h10c8 0 10 22 20 22h15M3 20h12c8 0 11-14 19-14h14M3 31h12c8 0 11-13 19-13h14" fill="none" stroke="#19c9b0" strokeWidth="3.6" strokeLinecap="round"/>
        <circle cx="3" cy="9" r="2.5" fill="#19c9b0"/><circle cx="3" cy="20" r="2.5" fill="#19c9b0"/><circle cx="3" cy="31" r="2.5" fill="#19c9b0"/>
        <circle cx="49" cy="6" r="2.5" fill="#4d85f5"/><circle cx="49" cy="18" r="2.5" fill="#4d85f5"/><circle cx="49" cy="31" r="2.5" fill="#4d85f5"/>
      </svg>
    </div>,
    size,
  );
}

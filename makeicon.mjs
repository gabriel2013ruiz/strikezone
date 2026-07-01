import sharp from "sharp";
const S = 1024;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="#0b1424"/><stop offset="60%" stop-color="#070a12"/><stop offset="100%" stop-color="#04060b"/></radialGradient>
    <linearGradient id="cy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38e0ff"/><stop offset="1" stop-color="#2a7bff"/></linearGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="180" fill="url(#bg)"/>
  <circle cx="512" cy="490" r="300" fill="none" stroke="url(#cy)" stroke-width="30"/>
  <g stroke="#eafcff" stroke-width="28" stroke-linecap="round">
    <line x1="512" y1="120" x2="512" y2="285"/><line x1="512" y1="695" x2="512" y2="860"/>
    <line x1="130" y1="490" x2="295" y2="490"/><line x1="729" y1="490" x2="894" y2="490"/>
  </g>
  <circle cx="512" cy="490" r="52" fill="#ef4444"/>
  <text x="512" y="985" font-family="Arial, sans-serif" font-size="130" font-weight="bold" text-anchor="middle" fill="#eafcff">SZ</text>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile("build/icon.png");
console.log("done");

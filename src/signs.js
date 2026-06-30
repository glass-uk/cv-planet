import * as THREE from 'three';

function wrapText(c, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  c.fillText(line, x, yy);
}

function measureLines(c, text, maxW) {
  const words = String(text).split(' ');
  let line = '';
  let n = 1;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (c.measureText(test).width > maxW && line) {
      n += 1;
      line = w;
    } else {
      line = test;
    }
  }
  return n;
}

// Draws the CV card for one station onto a 720x900 canvas and returns it as a Three.js texture.
export function drawSignTexture(station, profile, renderer) {
  const W = 720;
  const H = 900;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');

  // flat paper panel (no rounded corners — it's a blocky voxel sign)
  c.fillStyle = '#faf5e9';
  c.fillRect(0, 0, W, H);
  // chunky inner keyline
  c.strokeStyle = 'rgba(58,53,46,0.18)';
  c.lineWidth = 8;
  c.strokeRect(22, 22, W - 44, H - 44);

  // solid header block in the station color
  c.fillStyle = station.color;
  c.fillRect(22, 22, W - 44, 172);
  // pixel-row accent strip just under the header
  for (let x = 22; x < W - 22; x += 36) {
    c.fillStyle = (((x / 36) | 0) % 2) ? station.color : 'rgba(58,53,46,0.12)';
    c.fillRect(x, 196, 30, 12);
  }

  c.fillStyle = '#fff7ea';
  c.textBaseline = 'middle';
  c.font = '700 44px "Space Grotesk", sans-serif';
  if ('letterSpacing' in c) c.letterSpacing = '5px';
  c.fillText(station.title.toUpperCase(), 56, 92);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  c.font = '500 22px "Space Grotesk", sans-serif';
  c.globalAlpha = 0.88;
  c.fillText(`CV · ${profile.name || ''}`, 58, 146);
  c.globalAlpha = 1;

  // items with square (voxel) bullets — auto-fit so nothing overflows the panel
  const topY = 250;
  const bottomPad = 40;
  const avail = H - topY - bottomPad;
  const items = station.items || [];

  // measure required height at base sizes, then derive a scale that fits
  function layout(headPx, subPx, gap, measureOnly) {
    let y = topY + headPx * 0.5;
    for (const it of items) {
      c.font = `600 ${headPx}px "Space Grotesk", sans-serif`;
      const hl = measureLines(c, it.head || '', W - 140);
      if (!measureOnly) {
        c.fillStyle = station.color;
        c.fillRect(54, y - headPx * 0.27, headPx * 0.5, headPx * 0.5);
        c.fillStyle = '#3a352e';
        wrapText(c, it.head || '', 92, y, W - 140, headPx * 1.18);
      }
      y += hl * headPx * 1.18 + 4;
      if (it.sub) {
        c.font = `500 ${subPx}px "Space Grotesk", sans-serif`;
        const sl = measureLines(c, it.sub, W - 140);
        if (!measureOnly) {
          c.fillStyle = '#8a8073';
          wrapText(c, it.sub, 92, y, W - 140, subPx * 1.3);
        }
        y += sl * subPx * 1.3;
      }
      y += gap;
    }
    return y - (topY + headPx * 0.5);
  }

  const baseHead = 34;
  const baseSub = 24;
  const baseGap = 46;
  const needed = layout(baseHead, baseSub, baseGap, true);
  const fit = Math.min(1, avail / needed);
  layout(baseHead * fit, baseSub * fit, baseGap * fit, false);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

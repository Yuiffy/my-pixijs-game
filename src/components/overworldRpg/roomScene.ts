import type Phaser from 'phaser';
import type { InteriorDef, InteriorProp, Point } from './types';

const grain = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const palettes = {
  inn: { floor: '#987b55', seam: '#755a3f', wall: '#d3bf8c', wood: '#654c37', rug: '#935649', light: '#fbe5ac' },
  archive: { floor: '#8c9b89', seam: '#708577', wall: '#c4ceac', wood: '#50635a', rug: '#566d6e', light: '#f0e6b5' },
  forge: { floor: '#817563', seam: '#625b50', wall: '#a08b71', wood: '#4e4840', rug: '#a57150', light: '#ffd599' },
  ruin: { floor: '#657f82', seam: '#4b686f', wall: '#728d91', wood: '#435f68', rug: '#46646d', light: '#afe8dc' },
};

function texture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, width, height);
  if (!canvas) return;
  draw(canvas.getContext());
  canvas.refresh();
}

function backdrop(scene: Phaser.Scene, room: InteriorDef) {
  const key = `rpg:room:${room.id}`;
  const colors = palettes[room.style];
  texture(scene, key, room.width, room.height, c => {
    const { width, height } = room;
    c.fillStyle = room.style === 'ruin' ? '#263f49' : '#263b32'; c.fillRect(0, 0, width, height);
    c.fillStyle = colors.floor; c.fillRect(48, 48, width - 96, height - 96);
    const wooden = room.style === 'inn';
    for (let y = 48; y < height - 48; y += wooden ? 24 : 48) {
      for (let x = 48; x < width - 48; x += wooden ? 144 : 48) {
        c.fillStyle = `rgba(248,234,186,${grain(x, y) * 0.07})`;
        c.fillRect(x + 1, y + 1, wooden ? 140 : 46, wooden ? 21 : 46);
        c.strokeStyle = colors.seam; c.lineWidth = 1; c.strokeRect(x, y, wooden ? 144 : 48, wooden ? 24 : 48);
        if (wooden) {
          c.strokeStyle = 'rgba(75,51,33,.22)'; c.beginPath(); c.moveTo(x + 9, y + 7); c.lineTo(x + 98, y + 6); c.moveTo(x + 45, y + 17); c.lineTo(x + 128, y + 16); c.stroke();
        } else if (grain(x, y + 2) > 0.7) {
          c.strokeStyle = 'rgba(38,64,62,.15)'; c.beginPath(); c.moveTo(x + 5, y + 8); c.lineTo(x + 23, y + 14); c.lineTo(x + 29, y + 6); c.stroke();
        }
      }
    }
    if (room.style !== 'ruin') {
      c.fillStyle = colors.rug; c.fillRect(384, 384, 192, height - 432);
      c.strokeStyle = '#cdbb86'; c.lineWidth = 2; c.strokeRect(394, 394, 172, height - 452);
      c.strokeStyle = 'rgba(228,215,168,.25)';
      for (let y = 414; y < height - 70; y += 44) { c.beginPath(); c.moveTo(430, y); c.lineTo(480, y - 20); c.lineTo(530, y); c.lineTo(480, y + 20); c.closePath(); c.stroke(); }
    } else {
      c.strokeStyle = 'rgba(177,220,210,.35)'; c.lineWidth = 2;
      [135, 151, 216].forEach(r => { c.beginPath(); c.ellipse(485, 342, r, r * 0.72, 0, 0, Math.PI * 2); c.stroke(); });
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const x = 485 + Math.cos(angle) * 189;
        const y = 342 + Math.sin(angle) * 136;
        c.fillStyle = '#a2c7bf'; c.fillRect(x - 2, y - 2, 4, 4);
        c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 4, y); c.lineTo(x, y + 8); c.lineTo(x - 4, y); c.closePath(); c.stroke();
      }
      for (let i = 0; i < 60; i++) {
        const x = 55 + grain(i, 9) * (width - 110);
        const y = 62 + grain(i, 21) * (height - 120);
        c.fillStyle = 'rgba(31,69,61,.35)'; c.fillRect(x, y, 6 + grain(i, 27) * 20, 3);
      }
    }
    c.fillStyle = 'rgba(30,36,28,.22)'; c.fillRect(48, 48, width - 96, 39); c.fillRect(48, 48, 14, height - 96);
    c.fillStyle = colors.wood; c.fillRect(24, 19, width - 48, 38); c.fillRect(24, 19, 24, height - 38); c.fillRect(width - 48, 19, 24, height - 38);
    c.fillStyle = colors.wall; c.fillRect(48, 25, width - 96, 22); c.fillRect(28, 47, 15, height - 90); c.fillRect(width - 43, 47, 15, height - 90);
    c.fillStyle = colors.wood; c.fillRect(24, height - 48, width / 2 - 72, 24); c.fillRect(width / 2 + 48, height - 48, width / 2 - 72, 24);
    c.fillStyle = '#bdad83'; c.fillRect(width / 2 - 47, height - 48, 94, 18);
    c.fillStyle = '#796e57'; c.fillRect(width / 2 - 50, height - 31, 100, 7); c.fillRect(width / 2 - 54, height - 24, 108, 7);
    if (room.style !== 'ruin') {
      [230, 480, 730].forEach((x, index) => {
        c.fillStyle = colors.wood; c.fillRect(x - 34, 22, 68, 62);
        c.fillStyle = colors.light; c.fillRect(x - 27, 30, 54, 46);
        c.fillStyle = colors.wood; c.fillRect(x - 2, 29, 4, 48); c.fillRect(x - 28, 49, 56, 4);
        const glow = c.createLinearGradient(x, 75, x + 55, 247);
        glow.addColorStop(0, room.style === 'forge' ? 'rgba(255,173,79,.15)' : 'rgba(255,237,166,.15)'); glow.addColorStop(1, 'rgba(255,237,166,0)');
        c.fillStyle = glow; c.beginPath(); c.moveTo(x - 25, 82); c.lineTo(x + 29, 82); c.lineTo(x + 88, 257 + index * 12); c.lineTo(x - 9, 257 + index * 12); c.closePath(); c.fill();
      });
      c.fillStyle = '#4a5542'; c.fillRect(width / 2 - 55, 27, 110, 35);
      c.strokeStyle = '#d9c18c'; c.lineWidth = 1; c.strokeRect(width / 2 - 55, 27, 110, 35);
      c.fillStyle = '#ecdbac'; c.textAlign = 'center'; c.font = '17px "SimSun", serif'; c.fillText(room.name, width / 2, 50);
    } else {
      c.fillStyle = '#314c55'; c.fillRect(width / 2 - 130, 0, 260, 65);
      for (let i = 0; i < 28; i++) {
        c.fillStyle = i % 4 ? '#82b7bd' : '#d6f5dc'; c.fillRect(width / 2 - 123 + grain(i, 62) * 246, grain(i, 17) * 60, i % 4 ? 1 : 2, i % 4 ? 1 : 2);
      }
      c.strokeStyle = '#739f9f'; c.lineWidth = 1; c.beginPath(); c.moveTo(410, 23); c.lineTo(451, 38); c.lineTo(514, 15); c.lineTo(550, 44); c.stroke();
      c.fillStyle = '#9bb2a4'; c.fillRect(83, 603, 40, 12); c.fillRect(838, 65, 30, 11); c.fillRect(849, 79, 16, 9);
    }
    const shade = c.createRadialGradient(width / 2, height / 2, 165, width / 2, height / 2, 585);
    shade.addColorStop(0, 'rgba(24,38,32,0)'); shade.addColorStop(1, 'rgba(24,38,32,.30)');
    c.fillStyle = shade; c.fillRect(48, 48, width - 96, height - 96);
  });
  return key;
}

function propTexture(scene: Phaser.Scene, room: InteriorDef, prop: InteriorProp, index: number) {
  const key = `rpg:room-prop:${room.id}:${index}`;
  const colors = palettes[room.style];
  const width = prop.w + 24;
  const height = prop.h + 62;
  texture(scene, key, width, height, c => {
    const bottom = height - 10;
    const top = 40;
    c.fillStyle = 'rgba(23,36,30,.25)'; c.beginPath(); c.ellipse(width / 2 + 5, bottom - 2, width / 2 - 5, 14, 0, 0, Math.PI * 2); c.fill();
    if (prop.kind === 'table') {
      c.fillStyle = '#493e32'; c.fillRect(22, bottom - 35, 9, 30); c.fillRect(width - 32, bottom - 35, 9, 30);
      c.fillStyle = colors.wood; c.fillRect(9, top + 10, width - 18, prop.h - 7);
      c.fillStyle = room.style === 'ruin' ? '#8ca49c' : room.style === 'archive' ? '#adac7e' : '#b09261'; c.fillRect(9, top, width - 18, prop.h - 12);
      c.strokeStyle = '#d3bc89'; c.lineWidth = 2; c.strokeRect(14, top + 5, width - 28, prop.h - 23);
      if (room.style === 'forge') {
        c.fillStyle = '#364246'; c.beginPath(); c.moveTo(width / 2 - 36, top + 17); c.lineTo(width / 2 + 39, top + 17); c.lineTo(width / 2 + 21, top + 33); c.lineTo(width / 2 - 17, top + 33); c.closePath(); c.fill();
        c.fillRect(width / 2 - 13, top + 28, 29, 17); c.fillStyle = '#9dac9f'; c.fillRect(width / 2 - 33, top + 15, 69, 4);
      } else if (room.style === 'inn') {
        [width * 0.28, width * 0.66].forEach(x => { c.fillStyle = '#e5d6ac'; c.beginPath(); c.ellipse(x, top + prop.h * 0.35, 13, 7, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#73866b'; c.beginPath(); c.ellipse(x, top + prop.h * 0.35, 7, 4, 0, 0, Math.PI * 2); c.fill(); });
        c.fillStyle = '#769484'; c.fillRect(width / 2 - 7, top + 14, 14, 13); c.fillStyle = '#bfd3ad'; c.fillRect(width / 2 - 4, top + 11, 8, 5);
      } else {
        c.fillStyle = '#e8dec0'; c.fillRect(width / 2 - 32, top + 11, 62, Math.min(37, prop.h - 24));
        c.strokeStyle = '#a79977'; c.lineWidth = 1; c.beginPath(); c.moveTo(width / 2, top + 13); c.lineTo(width / 2, top + 41); c.stroke();
        for (let i = 0; i < 3; i++) { c.fillStyle = '#a3a080'; c.fillRect(width / 2 - 25, top + 17 + i * 6, 17, 1); c.fillRect(width / 2 + 6, top + 17 + i * 6, 17, 1); }
      }
    } else if (prop.kind === 'bed') {
      c.fillStyle = '#665139'; c.fillRect(13, top - 9, width - 26, prop.h + 18);
      c.fillStyle = '#dcd1a9'; c.fillRect(21, top + 1, width - 42, prop.h - 4);
      c.fillStyle = '#977157'; c.fillRect(19, top + prop.h * 0.32, width - 38, prop.h * 0.6);
      c.fillStyle = '#b7916c'; c.fillRect(20, top + prop.h * 0.32, width - 40, 13);
      c.fillStyle = '#ede1c0'; c.fillRect(32, top + 8, width - 64, 24);
      c.strokeStyle = '#af9e75'; c.lineWidth = 2; c.strokeRect(32, top + 8, width - 64, 24);
      c.fillStyle = '#877144'; c.fillRect(11, top - 15, width - 22, 10); c.fillRect(11, bottom - 13, width - 22, 9);
    } else if (prop.kind === 'shelf') {
      c.fillStyle = colors.wood; c.fillRect(10, 11, width - 20, height - 24);
      c.fillStyle = room.style === 'ruin' ? '#56737a' : '#695c42'; c.fillRect(19, 19, width - 38, height - 42);
      const rows = Math.max(2, Math.floor(prop.h / 48));
      for (let row = 0; row < rows; row++) {
        const y = 26 + row * ((height - 53) / rows);
        for (let book = 0; book < Math.floor((width - 36) / 14); book++) {
          const x = 23 + book * 14;
          const bookColors = room.style === 'forge' ? ['#a4a79a', '#818b83', '#b08b5a', '#697d78'] : ['#9cae91', '#b29467', '#b77560', '#7d9b91'];
          c.fillStyle = bookColors[(book + row + index) % bookColors.length]; c.fillRect(x, y + grain(book, row) * 6, 10, 27 + grain(book, row + 1) * 7);
          c.fillStyle = '#dfcda0'; c.fillRect(x + 2, y + 9, 6, 2);
        }
        c.fillStyle = '#a18d60'; c.fillRect(14, y + 36, width - 28, 5);
      }
      c.fillStyle = room.style === 'archive' ? '#a3af8f' : '#b4a17a'; c.fillRect(8, 9, width - 16, 7);
    } else if (prop.kind === 'forge') {
      c.fillStyle = '#4c5753'; c.fillRect(14, 7, width - 28, height - 22);
      for (let y = 11; y < height - 24; y += 24) for (let x = 18; x < width - 18; x += 48) { c.fillStyle = grain(x, y) > 0.5 ? '#7b8275' : '#667367'; c.fillRect(x, y, 43, 19); }
      c.fillStyle = '#2e3028'; c.fillRect(width / 2 - 46, height - 81, 92, 63);
      const fire = c.createRadialGradient(width / 2, height - 38, 2, width / 2, height - 40, 55); fire.addColorStop(0, '#ffe6a3'); fire.addColorStop(0.6, '#e68c48'); fire.addColorStop(1, '#8c4732'); c.fillStyle = fire; c.fillRect(width / 2 - 40, height - 76, 80, 51);
      c.fillStyle = '#f7ca79'; c.beginPath(); c.moveTo(width / 2 - 24, height - 26); c.lineTo(width / 2 - 12, height - 61); c.lineTo(width / 2, height - 41); c.lineTo(width / 2 + 14, height - 71); c.lineTo(width / 2 + 29, height - 26); c.closePath(); c.fill();
      c.fillStyle = '#555746'; c.fillRect(6, height - 26, width - 12, 12);
    } else {
      c.fillStyle = '#708c85'; c.beginPath(); c.ellipse(width / 2, bottom - 10, width * 0.39, prop.h * 0.26, 0, 0, Math.PI * 2); c.fill();
      const center = width / 2; const base = bottom - prop.h * 0.13; const peak = 12;
      c.fillStyle = '#8bc9bd'; c.beginPath(); c.moveTo(center, peak); c.lineTo(center + width * 0.3, peak + prop.h * 0.48); c.lineTo(center + width * 0.22, base - 15); c.lineTo(center, base); c.lineTo(center - width * 0.26, base - 20); c.lineTo(center - width * 0.3, peak + prop.h * 0.5); c.closePath(); c.fill();
      c.fillStyle = '#c1e9d1'; c.beginPath(); c.moveTo(center, peak); c.lineTo(center - width * 0.3, peak + prop.h * 0.5); c.lineTo(center, peak + prop.h * 0.62); c.closePath(); c.fill();
      c.fillStyle = '#589d9e'; c.beginPath(); c.moveTo(center, peak + prop.h * 0.62); c.lineTo(center + width * 0.3, peak + prop.h * 0.48); c.lineTo(center + width * 0.22, base - 15); c.lineTo(center, base); c.closePath(); c.fill();
      c.strokeStyle = '#bde4cc'; c.lineWidth = 2; c.beginPath(); c.moveTo(center, peak + 8); c.lineTo(center, base - 6); c.stroke();
    }
  });
  return key;
}

export function buildInterior(scene: Phaser.Scene, room: InteriorDef, layer: Phaser.GameObjects.Layer) {
  layer.add(scene.add.image(0, 0, backdrop(scene, room)).setOrigin(0).setDepth(-50));
  const props: Phaser.GameObjects.Image[] = [];
  const glows: (Point & { kind: 'lamp' | 'fire' | 'crystal' })[] = [];
  room.props.forEach((prop, index) => {
    const image = scene.add.image(prop.x + prop.w / 2, prop.y + prop.h + 10, propTexture(scene, room, prop, index)).setOrigin(0.5, 1).setDepth(prop.y + prop.h);
    layer.add(image); props.push(image);
    if (prop.kind === 'forge' || prop.kind === 'crystal') glows.push({ x: prop.x + prop.w / 2, y: prop.y + prop.h - 10, kind: prop.kind === 'forge' ? 'fire' : 'crystal' });
  });
  if (room.style !== 'ruin') {
    [84, room.width - 84].forEach(x => {
      [152, 456].forEach(y => {
        const g = scene.add.graphics().setDepth(y);
        g.fillStyle(0x473f31).fillRect(x - 3, y - 45, 6, 51);
        g.fillStyle(0xbfa16a).fillRect(x - 14, y - 48, 28, 5).fillRect(x - 10, y - 22, 20, 4);
        g.fillStyle(0xf0d59c).fillRoundedRect(x - 10, y - 44, 20, 22, 4);
        g.lineStyle(1, 0x91704a).lineBetween(x, y - 44, x, y - 22);
        layer.add(g); glows.push({ x, y: y - 33, kind: 'lamp' });
      });
    });
  }
  return { props, glows };
}

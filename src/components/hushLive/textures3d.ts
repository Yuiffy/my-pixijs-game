import * as THREE from "three";

export function labelTexture(
  title: string,
  subtitle: string,
  background: string,
  color = "#f7ecdc",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = background;
    c.fillRect(0, 0, 512, 320);
    c.strokeStyle = `${color}55`;
    c.lineWidth = 2;
    c.strokeRect(25, 25, 462, 270);
    c.textAlign = "center";
    c.fillStyle = color;
    c.font = '600 44px "Microsoft YaHei",sans-serif';
    c.fillText(title, 256, 150);
    c.font = '18px "Microsoft YaHei",sans-serif';
    c.fillText(subtitle, 256, 195);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = "#c8a77d";
    c.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      c.fillStyle = row % 2 ? "#d8b88d" : "#d0ad80";
      c.fillRect(0, row * 64 + 1, 512, 61);
      c.fillStyle = "#b89169";
      c.fillRect((row % 3) * 170, row * 64, 2, 64);
      for (let i = 0; i < 9; i++) {
        c.strokeStyle = "#ae855e20";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, row * 64 + i * 7);
        c.bezierCurveTo(
          150,
          row * 64 + i * 7 + 4,
          380,
          row * 64 + i * 7 - 5,
          512,
          row * 64 + i * 7,
        );
        c.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function paintTactical(texture: THREE.Texture, time: number, progress: number, quiet: boolean) {
  const canvas = texture.image as HTMLCanvasElement; const c = canvas.getContext('2d');
  if (!c) return;
  const x = 255 + Math.sin(time * 0.3) * 19;
  c.fillStyle = '#acb7aa'; c.fillRect(0, 0, 512, 148);
  c.fillStyle = '#79806c'; c.fillRect(0, 148, 512, 172);
  c.fillStyle = '#667461'; c.fillRect(20, 60, 135, 100); c.fillRect(353, 71, 125, 96);
  c.fillStyle = '#919883'; c.fillRect(0, 145, 137, 105); c.fillRect(390, 152, 122, 78);
  c.strokeStyle = '#c2c5aa'; c.lineWidth = 3; c.beginPath(); c.moveTo(220, 155); c.lineTo(94, 320); c.moveTo(300, 155); c.lineTo(419, 320); c.stroke();
  c.fillStyle = '#a2a78b'; c.fillRect(182, 113, 151, 15);
  c.fillStyle = '#62694f'; c.fillRect(184, 128, 12, 55); c.fillRect(319, 128, 12, 55);
  c.fillStyle = '#6c6350'; c.beginPath(); c.arc(x, 152, 8, 0, Math.PI * 2); c.fill(); c.fillRect(x - 9, 162, 18, 25); c.fillRect(x - 8, 184, 5, 17); c.fillRect(x + 3, 184, 5, 17);
  c.strokeStyle = progress ? '#edc082' : '#f0efd8'; c.lineWidth = 2; c.beginPath(); c.arc(256, 170, 23, 0, Math.PI * 2); c.moveTo(256, 138); c.lineTo(256, 151); c.moveTo(256, 189); c.lineTo(256, 202); c.moveTo(223, 170); c.lineTo(237, 170); c.moveTo(275, 170); c.lineTo(289, 170); c.stroke();
  c.fillStyle = '#303e35'; c.beginPath(); c.moveTo(300, 320); c.lineTo(291, 229); c.lineTo(315, 196); c.lineTo(333, 213); c.lineTo(347, 320); c.fill();
  c.fillStyle = '#304b3adb'; c.fillRect(0, 0, 512, 40); c.fillRect(0, 276, 512, 44);
  c.fillStyle = '#eaeed6'; c.font = '600 18px "Microsoft YaHei",sans-serif'; c.textAlign = 'left'; c.fillText('DELTA / 三角洲小队频道', 17, 26);
  c.font = '15px "Microsoft YaHei",sans-serif';
  c.fillText(progress ? `${quiet ? '低声报点' : '激情语音'} · ${['桥边两人，注意右侧', '架枪掩护，队友推进', '安全撤离，收到！'][Math.min(2, Math.floor(progress * 3))]}` : '队友：桥边有人，等你报点。', 17, 303);
  c.fillStyle = '#d8e2bf'; c.fillRect(17, 261, 92, 5); c.font = '12px sans-serif'; c.fillText('HP 100', 17, 253); c.fillText('30 / 120', 425, 262);
  texture.needsUpdate = true;
}

export function avatarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = "#626d88";
    c.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 25; i++) {
      c.fillStyle = "#ddd5ee55";
      c.beginPath();
      c.arc((i * 93) % 512, (i * 67) % 320, 2 + (i % 3), 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#e7dbef";
    c.beginPath();
    c.ellipse(208, 169, 75, 104, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#cfb5cf";
    c.beginPath();
    c.ellipse(208, 310, 115, 89, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f9d6c0";
    c.beginPath();
    c.ellipse(208, 177, 57, 65, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e7dbef";
    c.beginPath();
    c.ellipse(206, 118, 72, 39, -0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#865a74";
    for (const x of [188, 229]) {
      c.beginPath();
      c.ellipse(x, 177, 7, 11, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = "#ad7378";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(209, 198, 11, 0.2, Math.PI - 0.2);
    c.stroke();
    c.fillStyle = "#f1b1af";
    c.font = "bold 19px sans-serif";
    c.fillText("● LIVE", 24, 32);
    c.font = '15px "Microsoft YaHei",sans-serif';
    c.fillStyle = "#f9f0e2";
    c.fillText("小夏的晚安电台", 328, 68);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#bbb6ca" : "#d6c8d3";
      c.fillRect(336, 100 + i * 28, 117 - (i % 3) * 15, 5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

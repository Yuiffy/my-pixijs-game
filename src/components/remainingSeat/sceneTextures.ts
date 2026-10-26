import * as THREE from 'three';

type Paint = (context: CanvasRenderingContext2D, size: number) => void;

function painted(size: number, paint: Paint) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) paint(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function makeApartmentTextures() {
  const wall = painted(512, (ctx, size) => {
    const rng = random(824);
    ctx.fillStyle = '#b2ad95';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(57,56,40,${rng() * 0.07})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 9, 1 + rng() * 5);
    }
    for (let i = 0; i < 30; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.fillStyle = 'rgba(72,68,44,.09)';
      ctx.beginPath();
      ctx.ellipse(x, y, rng() * 30 + 8, rng() * 48 + 2, rng(), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(53,54,39,.16)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5, y + 19);
      ctx.lineTo(x - 2, y + 29);
      ctx.stroke();
    }
  });
  wall.wrapS = THREE.RepeatWrapping;
  wall.wrapT = THREE.RepeatWrapping;
  wall.repeat.set(3, 1);

  const floor = painted(512, (ctx, size) => {
    const rng = random(22);
    ctx.fillStyle = '#69766c';
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) {
        ctx.fillStyle = (row + column) % 2 === 0 ? '#8b9583' : '#9ba28e';
        ctx.fillRect(column * 128 + 2, row * 128 + 2, 124, 124);
        ctx.strokeStyle = 'rgba(222,226,207,.3)';
        ctx.strokeRect(column * 128 + 4, row * 128 + 4, 120, 120);
      }
    }
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(29,40,34,${rng() * 0.1})`;
      ctx.fillRect(rng() * size, rng() * size, rng() * 12 + 1, 1);
    }
    ctx.strokeStyle = 'rgba(41,51,44,.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 207);
    ctx.lineTo(78, 218);
    ctx.lineTo(125, 252);
    ctx.lineTo(154, 253);
    ctx.stroke();
  });
  floor.wrapS = THREE.RepeatWrapping;
  floor.wrapT = THREE.RepeatWrapping;
  floor.repeat.set(4, 5.6);

  const wood = painted(256, (ctx, size) => {
    const rng = random(11);
    ctx.fillStyle = '#594b39';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(13,13,9,${rng() * 0.18})`;
      ctx.fillRect(rng() * size, 0, 1 + rng() * 3, size);
    }
    ctx.strokeStyle = 'rgba(191,162,117,.12)';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      const x = rng() * size;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 20, 70, x - 10, 160, x + 3, 256);
      ctx.stroke();
    }
  });

  const cloth = painted(256, (ctx, size) => {
    ctx.fillStyle = '#752d2b';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 4) {
      ctx.fillStyle = 'rgba(198,129,98,.1)';
      ctx.fillRect(i, 0, 1, size);
      ctx.fillRect(0, i, size, 1);
    }
    ctx.strokeStyle = 'rgba(177,137,78,.3)';
    ctx.lineWidth = 2;
    for (let i = 16; i < size; i += 48) {
      for (let j = 16; j < size; j += 48) {
        ctx.beginPath();
        ctx.moveTo(i, j - 8);
        ctx.lineTo(i + 8, j);
        ctx.lineTo(i, j + 8);
        ctx.lineTo(i - 8, j);
        ctx.closePath();
        ctx.stroke();
      }
    }
  });
  cloth.wrapS = THREE.RepeatWrapping;
  cloth.wrapT = THREE.RepeatWrapping;
  cloth.repeat.set(3, 3);

  const photograph = painted(512, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#4d5750');
    gradient.addColorStop(1, '#1b2422');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#737466';
    ctx.fillRect(64, 50, 384, 270);
    ctx.fillStyle = '#28322c';
    for (let i = 0; i < 3; i++) {
      const x = 130 + i * 126;
      ctx.beginPath();
      ctx.ellipse(x, 180 + (i % 2) * 20, 35, 44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, 360, 67, 150, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#999b86';
    ctx.beginPath();
    ctx.ellipse(256, 209, 31, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    const rng = random(162);
    ctx.strokeStyle = 'rgba(202,202,178,.25)';
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      const x = rng() * size;
      const y = rng() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + rng() * 200);
      ctx.stroke();
    }
  });

  const screen = painted(256, (ctx, size) => {
    ctx.fillStyle = '#1b3936';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#6c9280';
    ctx.font = '17px monospace';
    ['PERSONNEL / 1999', '', 'RECORD: 000000', '', 'STATUS: PENDING', '', '>> PLEASE WAIT_'].forEach((line, i) => ctx.fillText(line, 18, 35 + i * 25));
    for (let i = 0; i < size; i += 4) {
      ctx.fillStyle = 'rgba(3,18,17,.4)';
      ctx.fillRect(0, i, size, 1);
    }
  });

  const paper = painted(512, (ctx, size) => {
    ctx.fillStyle = '#cabd97';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#514b3d';
    ctx.textAlign = 'center';
    ctx.font = 'bold 39px serif';
    ctx.fillText('留 一 个 位 子', size / 2, 105);
    ctx.fillStyle = '#756752';
    ctx.font = '23px serif';
    ['饭菜热了三遍。', '你回来就好。', '', '桌边的位置，', '我们一直留着。'].forEach((line, i) => ctx.fillText(line, size / 2, 190 + i * 49));
    ctx.strokeStyle = '#8b795c';
    ctx.strokeRect(24, 24, size - 48, size - 48);
  });

  const doorSign = painted(256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#842d29';
    ctx.beginPath();
    ctx.moveTo(size / 2, 3);
    ctx.lineTo(size - 3, size / 2);
    ctx.lineTo(size / 2, size - 3);
    ctx.lineTo(3, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#aa8050';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#c8a36b';
    ctx.font = 'bold 145px serif';
    ctx.textAlign = 'center';
    ctx.fillText('福', size / 2, 176);
  });

  const calendar = painted(512, (ctx, size) => {
    ctx.fillStyle = '#c8c1a6';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#80372e';
    ctx.fillRect(0, 0, size, 70);
    ctx.fillStyle = '#e0cfb0';
    ctx.font = '29px serif';
    ctx.textAlign = 'center';
    ctx.fillText('宜  团 圆    忌  远 行', size / 2, 48);
    ctx.fillStyle = '#373d32';
    ctx.font = 'bold 260px serif';
    ctx.fillText('廿九', size / 2, 335);
    ctx.font = '32px serif';
    ctx.fillText('岁末 · 不知何年', size / 2, 432);
  });

  const badge = painted(256, (ctx, size) => {
    ctx.fillStyle = '#b9bba6';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#446357';
    ctx.fillRect(12, 13, size - 24, 49);
    ctx.fillStyle = '#d1d2b9';
    ctx.textAlign = 'center';
    ctx.font = 'bold 29px serif';
    ctx.fillText('职 工 证', size / 2, 48);
    ctx.fillStyle = '#78877a';
    ctx.beginPath();
    ctx.arc(128, 106, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(91, 137, 74, 30);
    ctx.fillStyle = '#3b4b40';
    ctx.font = 'bold 37px monospace';
    ctx.fillText('000047', size / 2, 218);
    ctx.strokeStyle = '#727d67';
    ctx.strokeRect(6, 6, size - 12, size - 12);
  });

  const salary = painted(512, (ctx, size) => {
    ctx.fillStyle = '#bbb99f';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#666e5d';
    ctx.font = 'bold 34px serif';
    ctx.textAlign = 'center';
    ctx.fillText('月 度 明 细', size / 2, 65);
    ctx.font = '22px serif';
    ctx.fillText('编号 000047 · 待确认', size / 2, 104);
    ctx.strokeStyle = '#92957e';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(37, 142 + i * 43);
      ctx.lineTo(size - 37, 142 + i * 43);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#92947d';
    ['应发', '扣除', '实发', '结转'].forEach((line, i) => ctx.fillText(line, 55, 175 + i * 43));
    ctx.fillStyle = '#4f584b';
    ctx.fillText('房 租', 55, 347);
    ctx.fillStyle = '#74755e';
    ctx.fillText('下月继续', 318, 439);
  });

  const shadow = painted(256, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(4,10,10,.8)');
    gradient.addColorStop(1, 'rgba(4,10,10,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
  return { wall, floor, wood, cloth, photograph, screen, paper, doorSign, calendar, badge, salary, shadow };
}

export type ApartmentTextures = ReturnType<typeof makeApartmentTextures>;

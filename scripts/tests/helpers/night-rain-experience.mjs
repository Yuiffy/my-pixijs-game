// Expected v8 migration: change identity/home only; retain all combat progress.
const names = {
  '封街人 · 铁伞': '栞栞 · 雨切守街', '双象卫长 · 铜印': '米汀 · 双象断潮',
  '长夜司灯 · 雨冠': '弥月 · 机巧雨冠', '沉舟摆渡 · 缚流': '花礼 · 沉舟花渡',
  '无声住持 · 听澜': '瑞娅 · 霜钟听澜', '那伽守愿 · 千流': '悠亚 · 星河守愿', '末灯守簿 · 无名': '礼墨 · 末灯绘名',
};
export function expectedLegacyEnemies(enemies) {
  return structuredClone(enemies).map(e => {
    e.name = names[e.name] ?? e.name;
    if (e.id === 'courtyard-prowler' && e.spawn.x === -4 && e.spawn.z === 2) {
      if (e.x === -4 && e.y === 0 && e.z === 2) Object.assign(e, { x: -6, y: 0, z: 0 });
      e.spawn = { x: -6, y: 0, z: 0 };
    }
    return e;
  });
}

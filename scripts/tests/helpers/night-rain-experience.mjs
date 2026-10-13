import { loadTypescriptModule } from './load-typescript-module.mjs';
const { FAN_ENEMIES } = await loadTypescriptModule('src/components/nightRain/fanEnemies.ts');
// Expected v8 migration: change identity/home only; retain all combat progress.
const names = {
  '七海 · 七重潮声': '米汀 · 双象守潮', '阿梓 · 苔灯夜曲': '弥月 · 苔灯机巧',
  '封街人 · 铁伞': '花礼 · 夜市迎客', '双象卫长 · 铜印': '栞栞 · 海獭守印',
  '长夜司灯 · 雨冠': '瑞娅 · 霜钟司夜', '沉舟摆渡 · 缚流': '七海 · 镐筑潮庭',
  '无声住持 · 听澜': '阿梓 · 终场歌庭', '那伽守愿 · 千流': '悠亚 · 星河守愿', '末灯守簿 · 无名': '礼墨 · 末灯绘名',
};
export function expectedLegacyEnemies(enemies) {
  return structuredClone(enemies).map(e => {
    e.name = names[e.name] ?? e.name;
    if (FAN_ENEMIES[e.id]?.previous === e.name) e.name = FAN_ENEMIES[e.id].name;
    if (e.id === 'courtyard-prowler' && e.spawn.x === -4 && e.spawn.z === 2) {
      if (e.x === -4 && e.y === 0 && e.z === 2) Object.assign(e, { x: -6, y: 0, z: 0 });
      e.spawn = { x: -6, y: 0, z: 0 };
    }
    return e;
  });
}

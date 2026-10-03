'use client';

import { useState } from 'react';
import type { GameState } from './types';
import { LANDMARKS, OBSTACLES, SURFACES, gateOpen, regionAt } from './world';
import styles from './nightRain.module.css';

const VIEWS = [
  { name: '全城', box: '-298 -551 430 720' },
  { name: '旧城与潮港', box: '-40 -88 108 112' },
  { name: '织坊与高墙', box: '-131 -187 141 151' },
  { name: '藏经院与王寺', box: '-155 -302 115 174' },
  { name: '雾河渡村与双岸', box: '-254 -442 202 159' },
  { name: '山寺与河心沉殿', box: '-236 -551 186 167' },
  { name: '归灯庭与灯库', box: '-45 18 83 147' },
  { name: '沉灯船坞', box: '-295 -402 66 76' },
  { name: '弃铃书房', box: '-73 -43 48 55' },
  { name: '弃灯墓地', box: '80 14 36 67' },
  { name: '风息洞窟', box: '82 88 48 66' },
];
const labels = [
  { x: 96, z: 17, text: '弃灯墓地' }, { x: 101, z: 78, text: '露缇 · 独一遗物' }, { x: 100, z: 91, text: '风息洞窟' }, { x: 103, z: 150, text: '沐石 · 独一遗物' },
  { x: -8, z: 38, text: '归灯庭' }, { x: -8, z: 108, text: '无名灯库' }, { x: -8, z: 156, text: '末灯' },
  { x: -277, z: -368, text: '沉灯船坞' }, { x: -59, z: -39, text: '弃铃书房' },
  { x: -122, z: -289, text: '望乡台 · 王寺 ↑' }, { x: -124, z: -330, text: '雾河渡村' },
  { x: -198, z: -329, text: '水上盐市' }, { x: -239, z: -334, text: '旧盐仓' },
  { x: -202, z: -408, text: '西闸 · 沉舟水车' }, { x: -85, z: -363, text: '风铃竹关' },
  { x: -86, z: -430, text: '东闸 · 无声山寺' }, { x: -146, z: -458, text: '汇灯台' },
  { x: -150, z: -515, text: '那伽沉殿' }, { x: -150, z: -542, text: '归水灯' },
  { x: 36, z: -85, text: '黎明钟' }, { x: 42, z: -71, text: '七重潮门' },
  { x: 44, z: -24, text: '潮汐港' }, { x: 4, z: -52, text: '夜市' },
  { x: -31, z: -36, text: '残钟雨寺' }, { x: -7, z: -18, text: '金塔屋脊' },
  { x: 1, z: 3, text: '雨灯中庭' }, { x: 4, z: 22, text: '旅馆' },
  { x: -30, z: -59, text: '香料水街' }, { x: -66, z: -57, text: '织坊下城' },
  { x: -117, z: -62, text: '蓄水院' }, { x: -61, z: -105, text: '染布长廊' },
  { x: -54, z: -121, text: '双象门楼' }, { x: -87, z: -154, text: '金雨高墙' },
  { x: -79, z: -203, text: '雨声藏经院' }, { x: -110, z: -187, text: '朝圣桥' },
  { x: -133, z: -249, text: '雨冠大殿' }, { x: -133, z: -272, text: '归夜钟' },
];

export default function WorldMap({ state }: { state: GameState }) {
  const locate = () => (state.player.x > 82 ? state.player.z > 88 ? 10 : 9 : state.player.z > 27 ? 6 : state.player.x < -249 ? 7 : state.player.x < -42 && state.player.z > -40 ? 8 : state.player.z < -435 ? 5 : state.player.z < -278 ? 4 : state.player.z < -185 ? 3 : state.player.x < -42 || state.player.z < -110 ? 2 : 1);
  const [view, setView] = useState(locate);
  const scale = view === 0 ? 2.4 : 1;
  return (
    <>
      <div className={styles.mapTabs} aria-label="地图区域">
        {VIEWS.map((v, i) => <button key={v.name} aria-pressed={view === i} onClick={() => setView(i)}>{v.name}</button>)}
        <button onClick={() => setView(locate())}>定位自己</button>
      </div>
      <svg viewBox={VIEWS[view].box} className={styles.map} role="img" aria-label={`${VIEWS[view].name}手绘地图：白色箭头为当前位置，金色菱形为归灯，红线为未开启的门`}>
        {SURFACES.map(s => <rect key={s.id} x={s.x1} y={s.z1} width={s.x2 - s.x1} height={s.z2 - s.z1} fill={state.visited.includes(s.name) ? s.y >= 12 ? '#9c8b69' : '#7b7862' : '#344b50'} stroke="#b6a783" strokeWidth=".2" />)}
        {labels.map(l => <text key={l.text} x={l.x} y={l.z} textAnchor="middle" fontSize={view >= 6 ? 3.2 : view >= 4 ? 6 : 3.6 * scale} fill="#eee0c2" stroke="#142c32" strokeWidth=".45" paintOrder="stroke">{l.text}</text>)}
        {OBSTACLES.filter(o => o.kind === 'gate').map((o, i) => <line key={i} x1={o.x - (o.w > o.d ? o.w / 2 : 0)} y1={o.z - (o.d > o.w ? o.d / 2 : 0)} x2={o.x + (o.w > o.d ? o.w / 2 : 0)} y2={o.z + (o.d > o.w ? o.d / 2 : 0)} stroke={gateOpen(o, state) ? '#85d7af' : '#ef8876'} strokeWidth={0.85 * scale} />)}
        {LANDMARKS.filter(l => l.kind === 'rest' && (state.litLamps.includes(l.id) || state.visited.includes(regionAt(l.x, l.z, l.y)))).map(l => <g key={l.id} transform={`translate(${l.x} ${l.z}) scale(${scale})`}><title>{l.label} · {state.litLamps.includes(l.id) ? '已点亮' : '未点亮'}</title><path d="M0 -1.4 1.1 0 0 1.4 -1.1 0Z" fill={state.litLamps.includes(l.id) ? state.checkpoint === l.id ? '#ffdd86' : '#d9b97f' : 'none'} stroke={state.litLamps.includes(l.id) ? '#10292e' : '#85c8dc'} strokeWidth={state.litLamps.includes(l.id) ? '.25' : '.5'} /></g>)}
        {LANDMARKS.filter(l => l.kind === 'ferry' && state.collected.includes('ferry-winch')).map(l => <g key={l.id} transform={`translate(${l.x} ${l.z}) scale(${scale})`}><title>{l.label}</title><path d="M-1.4 -.8H1.4L.8 .8H-.8Z" fill="#86dcdf" stroke="#10292e" strokeWidth=".25" /></g>)}
        {state.bloodstain && <g transform={`translate(${state.bloodstain.x} ${state.bloodstain.z})`}><title>遗落的夜市钱</title><circle r={1.3 * scale} fill="#df877e" stroke="#341715" strokeWidth=".3" /></g>}
        <g transform={`translate(${state.player.x} ${state.player.z}) rotate(${(-state.player.facing * 180) / Math.PI}) scale(${scale})`}><title>你在这里 · {state.region}</title><path d="M0 2.1 -1.2 -1.4 0 -.7 1.2 -1.4Z" fill="white" stroke="#14282e" strokeWidth=".4" /></g>
      </svg>
    </>
  );
}
